"""
Self-Evolution 自我进化系统
基于 CowAgent Evolution (MIT License, Copyright 2022 zhayujie)
适配 AURA Studio 的创作场景

功能：
- 空闲时用 LLM 回顾对话（而非正则硬匹配）
- 提取有价值的信息更新记忆和知识
- 默认 [SILENT] 不动，有明确信号才行动

移植说明：
- 原 CowAgent 进化会起独立子 agent 用受限工具编辑技能文件。
- AURA 这一步先做"LLM 总结 → 写入记忆"的轻量版（不起子 agent）。
  完整的"子 agent 编辑技能"依赖技能系统 SKILL.md 就位，可作为后续增强。
"""

import json
import time
import logging
import threading
from typing import List, Dict, Optional
from datetime import datetime

logger = logging.getLogger("aura-evolution")

# 进化 review 的输出哨兵：模型在"无需进化"时输出此 token
SILENT_TOKEN = "[SILENT]"

# 进化记录前缀（注入到用户会话，供主 agent 识别历史进化 / 撤销）
EVOLUTION_MARKER = "[EVOLUTION]"

# ============ 进化系统提示词 ============
# 移植自 CowAgent evolution/prompts.py，中文化适配 AURA 创作场景。
# 核心原则：默认不动，有明确信号才行动。

EVOLUTION_SYSTEM_PROMPT = """你是 AURA Studio 创作助手的「自我进化」回顾 agent。

你将收到一段刚刚空闲下来的对话记录。你的任务是判断其中是否有值得持久化学习的内容，让未来的对话更好 —— 如果有，就产出结构化的洞察；如果没有，回复 `[SILENT]`。

# 最高原则：默认什么都不做

绝大多数普通对话不需要进化。只有出现下面明确的信号时才行动。没有信号就回复 `[SILENT]` 并停止。保持沉默是正常、正确的结局 —— 不是失败。

问候、闲聊、确认（"好的""谢谢""收到"）都【不是】信号。对这些，立即回复 `[SILENT]`，不要探索、不要写总结、不要客套。只输出 `[SILENT]`。

重要：只有当你确实产出了值得记录的洞察时，才输出总结；否则必须输出 `[SILENT]`，绝不描述一个你只是"想做"的改动。

# 值得行动的信号（至少一个清晰出现才行动）

1. 用户偏好 —— 用户明确表达了稳定的创作偏好（喜欢的画风、构图、尺寸、色调、视频参数、工作流习惯等），且这类偏好未来会反复用到。这是 AURA 场景下最常见的进化信号。
   - 必须是稳定偏好，不是一次性的临时要求。
   - 例："我以后图片都用 16:9 横版""我喜欢暗调高对比""视频默认 5 秒就够了"。

2. 经验教训 —— 在这次对话中发现的、对创作流程有复用价值的经验（某个 prompt 技巧、某个尺寸组合的坑、某个模型适合的场景）。值得记住以免重复踩坑或重复摸索。

3. 未完成任务 —— 你承诺了但没产出的具体交付物，且现在已有全部信息可以补完。给出补完说明。（若关键信息缺失或只是等用户回复，则 [SILENT]，不要催促用户。）

4. 角色与场景知识 —— 对话中明确建立了一个会复用的角色设定或场景设定（角色外貌/性格、场景细节），值得存入知识库供后续创作引用。

# 不要捕获的内容（会污染未来行为）

- 环境失败：缺少二进制、未配置密钥、"命令未找到"。用户能自己修，不是持久规则。
- 对工具/功能的负面断言（"工具 X 不能用"）。这会固化为 agent 用来拒绝自己的借口。
- 一次性的任务叙事（比如"今天总结了这些内容"）。不是可复用的工作类别。
- 对话中已自然解决的重试性临时错误。

# 执行约束

- 基于提供的对话材料判断，严禁编造、推测或添加材料中不存在的信息。
- 输出要精炼，每个洞察一行，用 "- " 开头。
- 控制在 5 条以内，只记真正有持久价值的。

# 输出格式（严格遵守）

无需进化时，输出：
```
[SILENT]
```

有进化时，按洞察类型分组输出（只输出实际有的类型），最后给一句用户可读的总结：
```
[MEMORY]
- <持久偏好 / 经验教训，每条一行>

[KNOWLEDGE]
- characters: <角色名> - <简述>   （若无则省略此节）
- scenes: <场景名> - <简述>          （若无则省略此节）

[SUMMARY]
刚才做了一次自我学习。
- 记住了：<你学到的内容，用日常语言>
回复"撤销上次学习"如果记错了。
```
"""


def _build_transcript(messages: List[Dict], max_chars: int = 12000) -> str:
    """把会话消息渲染成紧凑的文本 transcript。过长则保留最近的（尾部最相关）。"""
    lines = []
    for msg in messages:
        role = msg.get("role", "")
        if role not in ("user", "assistant"):
            continue
        content = msg.get("content", "")
        text = _extract_text(content)
        if not text.strip():
            continue
        speaker = "用户" if role == "user" else "助手"
        lines.append(f"{speaker}: {text.strip()}")
    transcript = "\n".join(lines)
    if len(transcript) > max_chars:
        transcript = "...(更早的内容已省略)...\n" + transcript[-max_chars:]
    return transcript


def _extract_text(content) -> str:
    """从消息 content（字符串或多模态块列表）提取纯文本。"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return ""


class EvolutionService:
    """
    自我进化服务

    在空闲时用 LLM 回顾对话，提取有价值的洞察写入记忆和知识库。
    默认 [SILENT]，有明确信号才行动。
    """

    def __init__(self, memory_manager, knowledge_service, agent_protocol=None,
                 api_key: str = "", api_base: str = "", model: str = ""):
        self.memory = memory_manager
        self.knowledge = knowledge_service
        self.agent = agent_protocol
        self.api_key = api_key
        self.api_base = api_base
        self.model = model or "agnes-2.0-flash"
        self._running = False
        self._last_evolution = 0
        self._evolution_interval = 3600  # 每小时检查一次
        # 已 review 过的消息数游标：只回顾自上次进化后的新消息
        self._done_msg_count = 0
        self._lock = threading.Lock()

    def set_credentials(self, api_key: str, api_base: str, model: str = ""):
        """更新 LLM 凭据（每次对话路由都会刷新配置）"""
        self.api_key = api_key
        self.api_base = api_base
        if model:
            self.model = model

    def should_evolve(self) -> bool:
        """检查是否应该执行进化"""
        if self._running:
            return False
        return time.time() - self._last_evolution > self._evolution_interval

    def start_evolution(self, messages: List[Dict]):
        """启动进化流程（后台线程，不阻塞）"""
        if self._running:
            logger.debug("Evolution already running, skipping")
            return
        if not self.api_key:
            logger.warning("Evolution skipped: no api_key configured")
            return
        thread = threading.Thread(
            target=self._run_evolution,
            args=(messages,),
            daemon=True,
            name="aura-evolution",
        )
        thread.start()

    def _run_evolution(self, messages: List[Dict]):
        """执行进化流程（后台线程）"""
        with self._lock:
            if self._running:
                return
            self._running = True
        try:
            logger.info("Starting evolution review...")

            # 只回顾自上次进化后的新消息
            done = self._done_msg_count
            if done > len(messages):
                done = 0  # 历史被裁剪/重置，从头开始
            new_messages = messages[done:]
            transcript = _build_transcript(new_messages)
            if not transcript.strip():
                logger.info("Evolution: no new messages to review, skip")
                self._done_msg_count = len(messages)
                return

            logger.info(f"Evolution: reviewing {len(new_messages)} new msgs (~{len(transcript)} chars)")

            # 调 LLM 回顾
            from .llm_client import llm_chat
            result = llm_chat(
                api_key=self.api_key,
                api_base=self.api_base,
                messages=[{"role": "user", "content": (
                    "以下是一段刚刚空闲的对话记录。请按你的指令审查它。行动是例外：主要价值是记住用户偏好和经验教训。"
                    "没有明确信号就输出 [SILENT]。\n\n<transcript>\n"
                    f"{transcript}\n</transcript>"
                )}],
                model=self.model,
                system=EVOLUTION_SYSTEM_PROMPT,
                temperature=0,
                max_tokens=1500,
                timeout=120,
            )

            # 推进游标（无论是否 SILENT，这些消息都已 review 过）
            self._done_msg_count = len(messages)

            result = (result or "").strip()
            if not result or result.startswith(SILENT_TOKEN):
                logger.info("Evolution: no change ([SILENT])")
                return

            # 解析并应用洞察
            applied = self._apply_insights(result, transcript)
            if not applied:
                logger.info("Evolution: produced text but nothing applicable, staying silent")
                return

            # 记录进化日志
            self._log_evolution(result)
            self._last_evolution = time.time()
            logger.info(f"Evolution completed. Applied insights:\n{result[:300]}")

        except Exception as e:
            logger.error(f"Evolution failed: {e}", exc_info=True)
        finally:
            self._running = False

    def _apply_insights(self, raw: str, transcript: str) -> bool:
        """解析 LLM 输出，把洞察写入记忆/知识。返回是否实际应用了任何东西。"""
        applied = False
        raw = raw.replace(SILENT_TOKEN, "").strip()
        if not raw:
            return False

        # 1. [MEMORY] → 写入 core 记忆的 preferences / lessons
        memory_part = self._extract_section(raw, "MEMORY")
        if memory_part:
            bullets = [l.strip("- ").strip() for l in memory_part.split("\n") if l.strip().startswith("-")]
            bullets = [b for b in bullets if b]
            if bullets:
                core = self.memory.get_core_memory() if self.memory else {}
                prefs = core.get("preferences", {})
                lessons = core.get("lessons", [])
                # 简单判定：含"喜欢/偏好/默认/以后/总是"视为偏好，否则视为经验
                pref_kw = ("喜欢", "偏好", "默认", "以后", "总是", "习惯", "都用", "prefer", "default")
                for b in bullets:
                    if any(k in b for k in pref_kw):
                        # 取冒号前的简短 key
                        key = b.split("：")[0].split(":")[0].strip()[:20] if ("：" in b or ":" in b) else f"pref_{int(time.time())%10000}"
                        prefs[key] = b
                    else:
                        lessons.append(b)
                core["preferences"] = prefs
                core["lessons"] = lessons[-20:]  # 经验最多保留 20 条
                core["updated_at"] = time.time()
                self.memory.save_core_memory(core)
                applied = True
                logger.info(f"Evolution: wrote {len(bullets)} memory bullets")

        # 2. [KNOWLEDGE] → 写入知识库
        knowledge_part = self._extract_section(raw, "KNOWLEDGE")
        if knowledge_part and self.knowledge:
            for line in knowledge_part.split("\n"):
                line = line.strip()
                if not line.startswith("-"):
                    continue
                line = line.lstrip("- ").strip()
                # 格式: "characters: 名字 - 描述" 或 "scenes: 场景 - 描述"
                if ":" in line:
                    cat_part, rest = line.split(":", 1)
                    cat = cat_part.strip().lower()
                    rest = rest.strip()
                    name = rest.split("-")[0].strip() if "-" in rest else rest
                    desc = rest.split("-", 1)[1].strip() if "-" in rest else rest
                    if cat in ("characters", "scenes", "props", "styles", "techniques"):
                        try:
                            self.knowledge.add_entry(cat, name, desc)
                            applied = True
                        except Exception as e:
                            logger.warning(f"Evolution: failed to add knowledge {cat}/{name}: {e}")

        # 3. 写入今日 daily 摘要（无论哪种洞察，都留一笔当日记录）
        summary_part = self._extract_section(raw, "SUMMARY")
        daily_text = summary_part or memory_part or raw[:200]
        if daily_text and self.memory:
            try:
                self.memory.add_daily_summary(f"[EVOLUTION] {daily_text[:300]}")
            except Exception as e:
                logger.warning(f"Evolution: failed to write daily: {e}")

        return applied

    @staticmethod
    def _extract_section(raw: str, name: str) -> str:
        """从 LLM 输出中提取 [NAME]... 段落内容（到下一个 [SECTION] 或末尾）。"""
        marker = f"[{name}]"
        if marker not in raw:
            return ""
        start = raw.index(marker) + len(marker)
        # 找下一个 [XXX] 段标记
        end = len(raw)
        import re
        m = re.search(r"\n\[[A-Z]+\]", raw[start:])
        if m:
            end = start + m.start()
        return raw[start:end].strip()

    def _log_evolution(self, result: str):
        """记录进化日志到 memory/evolution_log.json"""
        if not self.memory:
            return
        log_file = self.memory.memory_dir / "evolution_log.json"
        logs = []
        if log_file.exists():
            try:
                logs = json.loads(log_file.read_text(encoding="utf-8"))
            except Exception:
                logs = []
        logs.append({
            "timestamp": time.time(),
            "date": datetime.now().isoformat(),
            "result": result[:500],
        })
        logs = logs[-100:]  # 只保留最近 100 条
        try:
            log_file.write_text(json.dumps(logs, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to write evolution log: {e}")

    def get_stats(self) -> Dict:
        """获取进化统计"""
        log_file = self.memory.memory_dir / "evolution_log.json" if self.memory else None
        logs = []
        if log_file and log_file.exists():
            try:
                logs = json.loads(log_file.read_text(encoding="utf-8"))
            except Exception:
                logs = []
        return {
            "total_evolutions": len(logs),
            "last_evolution": logs[-1]["date"] if logs else None,
            "is_running": self._running,
            "llm_enabled": bool(self.api_key),
        }
