"""
Agent API 路由
提供 Agent 对话、记忆、知识、技能的 API 接口
"""

import json
import asyncio
import logging
import time
import os
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pathlib import Path

logger = logging.getLogger("aura-agent")

router = APIRouter()

# 全局实例（懒加载）
_agent_instances = {}
_last_evolution_time = 0
_EVOLUTION_INTERVAL = 3600  # 1小时


def _get_config():
    """读取配置（打包后从 backend.exe 同级目录读，开发模式从项目根目录读）"""
    import sys as _sys
    if getattr(_sys, "frozen", False):
        config_file = Path(_sys.executable).parent / "user_config.json"
    else:
        config_file = Path(__file__).parent.parent.parent.parent / "user_config.json"
    if config_file.exists():
        try:
            return json.loads(config_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _get_default_model_item(models_cfg: dict, category: str) -> dict:
    """从模型配置中取出某类别（chat/image/video/agent）的默认模型条目。

    每个类别结构: {"default": "id", "items": [{id,name,api_base,api_key,model}]}
    返回 default id 对应的 item dict，找不到则返回 items[0] 或 None。
    """
    cat = models_cfg.get(category, {})
    items = cat.get("items", [])
    if not items:
        return None
    default_id = cat.get("default", "")
    for it in items:
        if it.get("id") == default_id:
            return it
    return items[0]


def _build_agent_system_prompt(memory_mgr, skill_mgr, knowledge_svc, tools: list = None,
                                enabled_skills: list = None) -> str:
    """构建注入记忆/知识/技能的 System Prompt

    Args:
        enabled_skills: 启用的技能名列表（None 表示全部启用）
    """
    from datetime import datetime
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    parts = [f"你是 AURA Studio 的 AI 创作助手，当前时间：{now}。\n"]

    # 1. 注入核心记忆
    core = memory_mgr.get_core_memory() if memory_mgr else {}
    if core:
        prefs = core.get("preferences", {})
        if prefs:
            pref_lines = "\n".join(f"- {k}: {v}" for k, v in prefs.items())
            parts.append(f"## 用户偏好\n{pref_lines}\n")

    # 2. 注入每日记忆摘要
    if memory_mgr:
        daily = memory_mgr.get_daily_summaries(days=3)
        if daily:
            parts.append("## 近期对话摘要\n")
            for d in daily:
                for entry in d.get("entries", []):
                    parts.append(f"- [{d['date']}] {entry.get('summary', '')[:100]}")
            parts.append("\n")

    # 3. 注入技能提示（过滤已启用的技能）
    if skill_mgr:
        skills_text = skill_mgr.get_skills_prompt(skill_names=enabled_skills)
        if skills_text:
            parts.append(skills_text)

    # 4. 知识库：注入自动策展规则 + index.md 内容
    if knowledge_svc:
        index_content = knowledge_svc.read_index() if hasattr(knowledge_svc, "read_index") else ""
        knowledge_dir = getattr(knowledge_svc, "knowledge_dir", "")
        knowledge_path = str(knowledge_dir) if knowledge_dir else "~/.aura-studio/knowledge"
        parts.append("\n## 📚 知识系统\n")
        parts.append(f"你拥有一个持续积累的个人知识库，位于 `{knowledge_path}`，是你的长期结构化知识存储。\n")
        parts.append("### 自动写入规则（必须遵守）\n")
        parts.append("以下场景**必须**在回复的同时写入知识库，**直接写入，不要询问用户是否需要**：\n")
        parts.append("1. **用户分享了文章/链接/文档** → 阅读理解后，将要点写入 `knowledge/sources/<slug>.md`\n")
        parts.append("2. **深度讨论产生了结论/方案** → 整理为 `knowledge/analysis/<slug>.md`\n")
        parts.append("3. **对话涉及重要实体**（人物/公司/项目）→ 创建或更新 `knowledge/entities/<name>.md`\n")
        parts.append("4. **讨论了技术概念/方法论** → 整理为 `knowledge/concepts/<topic>.md`\n")
        parts.append("5. **建立了创作设定**（角色/场景/道具/风格）→ 写入 `knowledge/creation/<slug>.md`（AURA 创作场景）\n")
        parts.append("每次写入知识页后，**必须同步更新** `knowledge/index.md` 添加一行索引（格式：`- [标题](分类/文件名.md) - 简介`）。\n")
        parts.append("知识页用 Markdown 格式：第一行 `# 标题`，正文记录关键信息，可用 `[[其他页面]]` 建立交叉引用。\n")
        parts.append("⚠️ 不要问\"要不要存进知识库\"——只要符合上述场景就直接写。这是本能动作。\n")
        if index_content:
            parts.append("### 当前知识索引\n")
            parts.append(index_content[:2000])  # 限制长度
            parts.append("\n")

    # 5. 能力定义 - 动态生成工具列表
    parts.append("## 你的能力")
    parts.append("你可以使用以下工具来帮助用户完成各种任务：")
    if tools:
        for t in tools:
            desc = getattr(t, 'description', '') or ''
            parts.append(f"- **{t.name}**: {desc}")
    parts.append("")

    # 6. 工作方式
    parts.append("""## 工作方式
1. 理解用户的需求
2. 如果有必要，调用合适的工具来完成
3. 工具执行完成后，向用户汇报结果
4. 如果只是问答，直接回答即可

## 重要规则
- 你可以访问用户的本地文件系统（通过 read、write、edit、bash、ls、grep 工具），不要拒绝用户的文件访问请求
- 用中文回复
- 工具返回的数据是真实的 API 响应，必须如实展示，严禁自行编造、改写或简写任何 ID
- ！！！特别注意 video_create 工具：它返回的 video_id 字段的值就是真实的视频 ID（格式如 video_bGl0ZWxsb...），你的回复中必须一字不差地展示这个值。严禁自己编造 task_xxx 格式的 ID 来替代。不要教用户去查 Agnes API
- 生成图片时，prompt 用英文效果更好
- 视频生成需要较长时间，请告知用户等待""")

    return "\n".join(parts)


def _get_agent(session_id: str = "default"):
    """获取或创建 Agent 实例"""
    if session_id not in _agent_instances:
        import sys
        # 打包后 agent 包在 _MEIPASS（PyInstaller 解压目录），开发模式在 backend/
        if getattr(sys, "frozen", False):
            backend_dir = sys._MEIPASS
        else:
            backend_dir = str(Path(__file__).parent.parent.parent)
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        from agent.protocol import AgentProtocol
        from agent.tools import create_default_tools
        from agent.memory import MemoryManager
        from agent.knowledge import KnowledgeService
        from agent.evolution import EvolutionService
        from agent.skills import SkillManager

        config = _get_config()
        api_key = config.get("api_key", "")
        api_base = config.get("api_base", "https://apihub.agnes-ai.com/v1")

        # 初始化 Embedding Provider（可选）
        # 注意：此处若失败会导致向量记忆整体失效。带 traceback 记录，避免静默吞错。
        embedding_provider = None
        try:
            from agent.memory.embedding import create_provider_from_config
            embedding_provider = create_provider_from_config(config)
            if embedding_provider:
                logger.info(f"Embedding provider initialized: {type(embedding_provider).__name__} ({embedding_provider.model})")
            else:
                logger.info("Embedding provider disabled (embedding_api_base/key 未配置，向量记忆不可用，仅用关键词检索)")
        except Exception as e:
            logger.exception(f"Embedding provider init failed, vector memory disabled: {e}")

        # 创建服务（传入 embedding provider）
        memory = MemoryManager(embedding_provider=embedding_provider)
        knowledge = KnowledgeService()
        # 扫描 skills/ 文件夹（打包后在 backend.exe 同级，开发模式在项目根）
        import sys as _sys
        if getattr(_sys, "frozen", False):
            project_root = str(Path(_sys.executable).parent)
        else:
            project_root = str(Path(__file__).parent.parent.parent.parent)
        skills = SkillManager(extra_scan_dirs=[os.path.join(project_root, "skills")])

        # 先创建工具（从配置读取图片/视频模型）
        models_cfg = config.get("models", {})
        tools = create_default_tools(api_key=api_key, api_base=api_base, models_config=models_cfg)

        # 构建含记忆/知识和动态工具列表的 System Prompt
        system_prompt = _build_agent_system_prompt(memory, skills, knowledge, tools=tools)

        # 从配置读取 Agent 使用的模型（直接用 chat 区默认项，即"文本模型"）
        agent_item = _get_default_model_item(models_cfg, "chat")
        agent_model = agent_item.get("model", "agnes-2.0-flash") if agent_item else "agnes-2.0-flash"
        # 模型条目可有自己的 api_base/api_key（空则用全局）
        agent_api_key = (agent_item.get("api_key", "") if agent_item else "") or api_key
        agent_api_base = (agent_item.get("api_base", "") if agent_item else "") or api_base

        # 创建 Agent（使用增强后的 system_prompt）
        agent = AgentProtocol(
            api_key=agent_api_key,
            api_base=agent_api_base,
            model=agent_model,
            tools=tools,
            system_prompt=system_prompt,
            max_steps=100
        )

        evolution = EvolutionService(memory, knowledge, agent,
                                     api_key=api_key, api_base=api_base)

        from agent.dream import DeepDreamService
        dream = DeepDreamService(memory, api_key=api_key, api_base=api_base)

        _agent_instances[session_id] = {
            "agent": agent,
            "memory": memory,
            "knowledge": knowledge,
            "skills": skills,
            "evolution": evolution,
            "dream": dream,
        }

    return _agent_instances[session_id]



def _try_auto_evolution(instance):
    """尝试自动触发进化"""
    global _last_evolution_time
    now = time.time()
    if now - _last_evolution_time < _EVOLUTION_INTERVAL:
        return
    _last_evolution_time = now
    try:
        evolution = instance.get("evolution")
        memory = instance.get("memory")
        if evolution and memory and evolution.should_evolve():
            messages = memory.get_context()
            if messages:
                evolution.start_evolution(messages)
    except Exception as e:
        logger.warning(f"Auto evolution trigger failed: {e}")

@router.post("/chat")
async def agent_chat(request: Request):
    """Agent 对话接口（SSE 流式）"""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "无效的 JSON"}, status_code=400)

    message = body.get("message", "")
    session_id = body.get("session_id", "default")
    history = body.get("history", [])
    max_tokens = body.get("max_tokens", 65536)

    if not message:
        return JSONResponse({"error": "消息不能为空"}, status_code=400)

    instance = _get_agent(session_id)
    agent = instance["agent"]
    memory = instance["memory"]
    evolution = instance["evolution"]

    # 优先使用请求中传来的 _api_key
    req_api_key = body.get("_api_key", "")
    config = _get_config()
    agent.api_key = req_api_key or config.get("api_key", agent.api_key)
    agent.api_base = config.get("api_base", agent.api_base)

    # 每次对话刷新模型配置（用户可能在模型配置里改了默认模型/接入点）
    # Agent 直接用 chat 区默认模型（模型配置 UI 的"文本模型"即 Agent 使用的模型）
    models_cfg = config.get("models", {})
    agent_item = _get_default_model_item(models_cfg, "chat")
    if agent_item:
        agent.model = agent_item.get("model", agent.model)
        # 模型条目可有自己的 api_base/api_key（空则用全局）
        if agent_item.get("api_key"):
            agent.api_key = agent_item["api_key"]
        if agent_item.get("api_base"):
            agent.api_base = agent_item["api_base"]

    # 请求中显式指定 model 时优先用（右边栏模型卡片选择）
    # 同时查找该 model 在 chat 区对应条目的 api_base/api_key（支持不同供应商）
    req_model = body.get("model", "")
    if req_model:
        agent.model = req_model
        cat = models_cfg.get("chat", {})
        for it in cat.get("items", []):
            if it.get("model") == req_model or it.get("id") == req_model:
                if it.get("api_key"):
                    agent.api_key = it["api_key"]
                if it.get("api_base"):
                    agent.api_base = it["api_base"]
                break

    for tool in agent.tools:
        if hasattr(tool, "api_key"):
            tool.api_key = agent.api_key
        # 图片/视频工具刷新默认模型（这些工具走本地后端代理，api_key 作为 _api_key 透传）
        if hasattr(tool, "default_model"):
            cat = "image" if tool.name == "image_generate" else "video" if tool.name == "video_create" else None
            if cat:
                t_item = _get_default_model_item(models_cfg, cat)
                if t_item:
                    tool.default_model = t_item.get("model", tool.default_model)
                    if t_item.get("api_key"):
                        tool.api_key = t_item["api_key"]
    agent.max_tokens = max_tokens

    # 深度思考开关（前端 chatDeepThink，仅对 agnes 模型实际生效）
    agent.enable_thinking = bool(body.get("enable_thinking", False))

    # 刷新进化服务的凭据（让后台进化能用最新 api_key/model 调 LLM）
    if evolution:
        evolution.set_credentials(api_key=agent.api_key, api_base=agent.api_base, model=agent.model)
    # 刷新 Deep Dream 蒸馏服务的凭据
    dream = instance.get("dream")
    if dream:
        dream.set_credentials(api_key=agent.api_key, api_base=agent.api_base, model=agent.model)

    # 技能筛选：如果请求中传入了 enabled_skills，重建系统提示词
    enabled_skills = body.get("enabled_skills", None)
    if enabled_skills is not None and isinstance(enabled_skills, list):
        try:
            skills = instance.get("skills")
            knowledge = instance.get("knowledge")
            memory = instance.get("memory")
            agent.system_prompt = _build_agent_system_prompt(
                memory, skills, knowledge, tools=agent.tools,
                enabled_skills=enabled_skills
            )
        except Exception as e:
            logger.warning(f"Failed to rebuild prompt with skill filter: {e}")

    # 尝试自动进化（不阻塞主流程）
    try:
        _try_auto_evolution(instance)
    except Exception as e:
        logger.warning(f"Auto evolution skipped: {e}")

    # 自动记忆检索：将相关记忆注入上下文
    memory_notes = None
    # 从 message 提取纯文本查询（message 可能是多模态数组）
    query_text = message
    if isinstance(message, list):
        query_text = " ".join(
            p.get("text", "") for p in message
            if isinstance(p, dict) and p.get("type") == "text"
        )
    if memory and query_text and isinstance(query_text, str) and len(query_text) > 5:
        try:
            relevant = memory.search_relevant(query_text, top_k=3)
            if relevant:
                lines = ["## 检索到的相关记忆"]
                for r in relevant:
                    content = r.get("content", "") or ""
                    score = r.get("score", 0)
                    if score >= 0.3:
                        lines.append(f"- {content[:200]}")
                if len(lines) > 1:
                    memory_notes = "\n".join(lines)
                    if history:
                        history.append({"role": "system", "content": memory_notes})
                    logger.debug(f"Injected {len(relevant)} relevant memories")
        except Exception as e:
            logger.warning(f"Memory retrieval failed: {e}")

    async def event_stream():
        async for event in agent.execute_stream(
            user_message=message, on_event=None,
            history=history.copy() if history else None,
        ):
            data = json.dumps({"type": event.type, "data": event.data}, ensure_ascii=False)
            yield f"data: {data}\n\n"
        try:
            memory.save_context(agent.messages)
            # 异步索引到向量存储
            try:
                memory.index_messages(agent.messages)
            except Exception as e:
                pass
        except Exception as e:
            logger.warning(f"Failed to save context: {e}")

    return StreamingResponse(
        event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )


@router.get("/memory")
async def get_memory(session_id: str = "default"):
    instance = _get_agent(session_id)
    return JSONResponse(instance["memory"].get_stats())


@router.get("/memory/context")
async def get_context_memory(session_id: str = "default"):
    instance = _get_agent(session_id)
    return JSONResponse(instance["memory"].get_context())


@router.delete("/memory/context")
async def clear_context_memory(session_id: str = "default"):
    instance = _get_agent(session_id)
    instance["memory"].clear_context()
    return JSONResponse({"ok": True})


@router.get("/knowledge")
async def get_knowledge(session_id: str = "default"):
    instance = _get_agent(session_id)
    return JSONResponse(instance["knowledge"].get_stats())


@router.get("/knowledge/entries")
async def list_knowledge_entries(category: str = None, session_id: str = "default"):
    """列出知识库目录树（新接口调用 list_tree，前兼容旧 entries 调用）。"""
    instance = _get_agent(session_id)
    return JSONResponse(instance["knowledge"].list_tree())


@router.get("/knowledge/read")
async def read_knowledge(path: str, session_id: str = "default"):
    """读取单个知识页内容。path 为 knowledge/ 下的相对路径。"""
    instance = _get_agent(session_id)
    try:
        result = instance["knowledge"].read_file(path)
        return JSONResponse(result)
    except FileNotFoundError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=403)


@router.get("/knowledge/graph")
async def get_knowledge_graph(session_id: str = "default"):
    instance = _get_agent(session_id)
    return JSONResponse(instance["knowledge"].get_graph())


@router.post("/knowledge/search")
async def search_knowledge(request: Request, session_id: str = "default"):
    try:
        body = await request.json()
        query = body.get("query", "")
    except Exception:
        return JSONResponse({"error": "bad request"}, status_code=400)
    instance = _get_agent(session_id)
    return JSONResponse(instance["knowledge"].search(query))


@router.get("/skills")
async def list_skills(session_id: str = "default"):
    instance = _get_agent(session_id)
    return JSONResponse(instance["skills"].list_skills())


@router.get("/skills/stats")
async def get_skills_stats(session_id: str = "default"):
    instance = _get_agent(session_id)
    return JSONResponse(instance["skills"].get_stats())


@router.post("/skills/create")
async def create_skill(request: Request, session_id: str = "default"):
    """创建技能。支持两种格式：
    - 旧格式（含 prompt 字段）：写成 skill.json
    - 新格式（含 body 字段）：写成 SKILL.md（可执行技能）
    """
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    instance = _get_agent(session_id)
    name = body.get("name", "").strip()
    description = body.get("description", "").strip()
    if not name:
        return JSONResponse({"error": "name 不能为空"}, status_code=400)

    # 新格式：有 body 字段 → SKILL.md
    if body.get("body"):
        success = instance["skills"].add_skill_md(
            name=name,
            description=description or name,
            body=body["body"],
            category=body.get("category", "custom"),
        )
        return JSONResponse({"ok": success, "format": "skill_md"})

    # 旧格式：有 prompt 字段 → skill.json
    if body.get("prompt") is not None:
        from agent.skills import Skill
        skill = Skill(
            name=name,
            description=description,
            prompt=body.get("prompt", ""),
            category=body.get("category", "custom"),
        )
        success = instance["skills"].add_skill(skill)
        return JSONResponse({"ok": success, "format": "skill_json"})

    return JSONResponse({"error": "需要提供 prompt（旧格式）或 body（新格式 SKILL.md）字段"}, status_code=400)


@router.get("/evolution")
async def get_evolution_stats(session_id: str = "default"):
    instance = _get_agent(session_id)
    return JSONResponse(instance["evolution"].get_stats())


@router.post("/evolution/trigger")
async def trigger_evolution(request: Request, session_id: str = "default"):
    """手动触发进化"""
    try:
        body = await request.json()
        messages = body.get("messages", [])
    except Exception:
        messages = []

    instance = _get_agent(session_id)
    if not messages:
        memory = instance.get("memory")
        if memory:
            messages = memory.get_context()
    instance["evolution"].start_evolution(messages)
    return JSONResponse({"ok": True, "message": "进化已启动"})


@router.get("/dream/diaries")
async def list_dream_diaries(session_id: str = "default"):
    """列出最近的梦境日记"""
    instance = _get_agent(session_id)
    dream = instance.get("dream")
    if not dream:
        return JSONResponse([])
    return JSONResponse(dream.list_dream_diaries())


@router.post("/dream")
async def trigger_dream(request: Request, session_id: str = "default"):
    """手动触发 Deep Dream 记忆蒸馏"""
    try:
        body = await request.json()
    except Exception:
        body = {}
    lookback = int(body.get("lookback_days", 1))
    force = bool(body.get("force", False))

    instance = _get_agent(session_id)
    dream = instance.get("dream")
    if not dream:
        return JSONResponse({"ok": False, "message": "Deep Dream 服务未初始化"})
    # 蒸馏在后台线程跑，避免阻塞请求
    result = await asyncio.to_thread(dream.deep_dream, lookback, force)
    return JSONResponse(result)


@router.post("/dream/summarize")
async def trigger_dream_summarize(request: Request, session_id: str = "default"):
    """手动触发对话摘要（把当前上下文归纳成 daily 记录）"""
    try:
        body = await request.json()
        messages = body.get("messages", [])
    except Exception:
        messages = []

    instance = _get_agent(session_id)
    dream = instance.get("dream")
    if not dream:
        return JSONResponse({"ok": False, "message": "Deep Dream 服务未初始化"})
    if not messages:
        memory = instance.get("memory")
        if memory:
            messages = memory.get_context()
    if not messages:
        return JSONResponse({"ok": False, "message": "没有可摘要的对话"})
    ok = await asyncio.to_thread(dream.summarize_to_daily, messages)
    return JSONResponse({"ok": ok, "message": "摘要已写入" if ok else "无可记录内容"})

