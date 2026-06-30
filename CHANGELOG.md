# Changelog

## v2.4.0 (2026-06-29) — 模型配置系统 + 限流与思考优化

### 新增

- **模型配置弹窗**：设置按钮旁新增「🤖 模型」按钮。文本/图片/视频三区独立配置，每个模型条目可展开设置名称/模型ID/API接入点/API Key（留空用全局），旁有「默认」按钮设为该区默认。支持添加/删除模型条目。
- **右边栏模型卡片动态生成**：从配置的文本模型列表动态渲染，点击卡片切换 Agent 使用的模型（含对应的 API 接入点和密钥），不再硬编码。
- **API 限流友好提示**：429 限流时提示「agnes 约1分钟恢复，sensenova 约5小时恢复」，帮助用户判断是否切换模型。

### 修复

- **默认模型不生效**：Agent 优先读 `agent` 区（UI 改不到），永远用 agnes。改为直接用 `chat` 区默认模型（即 UI 的「文本模型」），三处统一（初始化/每次刷新/请求指定 model）。
- **右边栏模型卡片绑死 agnes**：硬编码 `agnes-2.0-flash`/`agnes-1.5-flash` 写入 `chatModel`，但 Agent 不读此字段。改为动态生成 + 选中传 `model` 给后端。
- **进化/蒸馏 404**：切换 deepseek 后，进化/蒸馏的 api_base 跟着变但 model 没同步（还是 agnes-2.0-flash），sensenova 无此模型 → 404。`set_credentials` 补传 `model=agent.model`。
- **skill.json 损坏**：`skills/image-generation/skill.json` 仅 4 字节，JSON 解析失败。重建完整定义。
- **agent.js 语法错误**：`enable_thinking` 参数添加时多了一个 `}),`，导致前端加载失败。

### 改进

- **深度思考改回可选**：默认关闭（省 token、减限流），勾选才开。`AgentProtocol` 默认 `enable_thinking=False`，前端加回复选框。
- **enable_thinking 按模型判断**：`chat_template_kwargs` 是 agnes 专属参数，只对 agnes 模型传，第三方模型（deepseek/glm 等）不传（避免不兼容 + 减少 token 消耗）。
- **429 不自动重试**：sensenova 5小时窗口重试无意义且卡住用户，改为直接报错 + 友好提示。
- **工具调用展示栏限高**：`#agentSteps` 加 `max-height:160px;overflow-y:auto`，多步任务不再吃大量页面。
- **思考过程集成到回复框**：删除独立思考框，推理过程和正文在同一个回复框按顺序流式输出（思考灰色斜体 + 分隔线 + 正文 Markdown）。
- **发送按钮可打断**：AI 回复时按钮变为「停止」，点击即打断输出（AbortController），保留已生成内容。

### 技术

- `backend/agent/protocol.py`：`enable_thinking` 默认 False + 按模型判断 + 限流友好提示
- `backend/api/routes/agent.py`：`_get_default_model_item()` + 每次刷新模型配置 + 接收 `model`/`enable_thinking` 参数
- `backend/api/routes/config.py`：模型配置改为 items 结构（每条独立 api_base/api_key）
- `backend/agent/tools.py`：图片/视频工具从配置默认项读取 model/api_key
- `backend/agent/memory/embedding.py`：分批 + 截断 + 降级重试（修复 400）
- `frontend/scripts/app.js`：模型配置面板 JS + 右边栏模型卡片动态生成
- `frontend/scripts/modules/agent/agent.js`：传 model/enable_thinking/signal
- `frontend/scripts/modules/chat_stream.js`：发送按钮打断 + 思考内容集成
- `frontend/index.html`：模型配置弹窗 + 深度思考复选框 + 模型卡片容器

---

## v2.3.0 (2026-06-29) — Agent 模式默认化 + 思考过程可视化

### 新增

- **深度思考过程可视化**：Agent 模式默认开启 `enable_thinking`，AI 推理过程实时展示。发送消息后立即显示"🧠 正在思考…"动画，推理文本在紫色"思考过程"区域实时滚动，推理完成后自动折叠（点击可展开/收起），正文随后逐字流式显示。彻底解决深度思考期间界面静默、用户以为卡死的问题。
- **图片点击放大**：聊天消息中的图片（AI 生成的 Markdown 图片 `![](url)` 和上传的多模态图片）现可点击放大查看，复用现有 `imagePreviewModal` 弹窗，加 `cursor:zoom-in` 交互提示。
- **左侧栏技能选择区**：新增"已安装技能"折叠面板，每个技能带开关（toggle），关闭的技能不注入系统提示词。状态持久化到 localStorage，页面加载后自动恢复。
- **图片自动上传图床**：Agent 模式下上传的图片（base64 data URL）发送前自动上传到又拍云图床转为公网 URL，因 Agnes 2.0 Flash 仅支持公网可访问的图片 URL，不支持 base64。

### 修复

- **Agent 模式不生效**：`chat_stream.js`（含 Agent 模式 `sendChatMessage` 逻辑）未被 `index.html` 引用，导致 Agent 模式复选框形同虚设，始终走普通 Chat。现已加载 `chat_stream.js` 并默认启用 Agent 模式。
- **AI 不知道自身能力**：`chat.py` 仅透传请求到 Agnes API，不注入 AURA 系统提示词，导致 AI 说"我是 Agnes-2.0-Flash 无法生成图片"。现注入完整提示词（身份/工具/技能/记忆/知识），即使非 Agent 模式 AI 也知道可用工具。
- **流式回复截断（跨 chunk）**：`app.js` SSE buffer 处理用 `buffer=''` + `else if`，当 chunk 边界切在 `data: JSON` 中间时整条 SSE 事件丢失。改用 `lines.pop()` 保留未完成行。`chat_stream.js` 同步修复。
- **多模态记忆检索崩溃**：`Memory retrieval failed: 'NoneType' object has no attribute 'lower'`。上传图片时 `message` 为多模态数组，直接传给 `search_relevant` 导致 `.lower()` 崩溃。现从多模态内容提取纯文本查询，并加类型防御。
- **思考过程事件丢失**：后端 `execute_stream` 消费循环只处理 `delta`/`tool_calls`/`error`，漏掉 `reasoning_update`，导致推理过程被静默丢弃。新增 `reasoning_update` 透传分支。
- **protocol.py 缩进错误**：`enable_thinking` 参数引入时缩进混乱导致 `IndentationError`，后端无法启动。重写整个文件统一 4 空格缩进。

### 改进

- **Agent 模式默认开启**：移除"Agent 模式"复选框，改为状态提示"🤖 Agent 模式已启用"。所有对话走 Agent 路径（工具调用 + 记忆 + 技能 + 知识库）。
- **深度思考默认开启**：移除"深度思考"复选框，改为状态提示。`AgentProtocol` 新增 `enable_thinking` 参数，请求 payload 带 `chat_template_kwargs.enable_thinking`。
- **技能过滤全链路**：前端 `getEnabledSkillsList()` → Agent/Chat 请求传 `enabled_skills` → 后端 `_build_agent_system_prompt` 用 `SkillManager.get_skills_prompt(skill_names=...)` 过滤。
- **清理冗余代码**：删除 `app.js` 中失效的 `toggleAgentMode`/`initAgentUI`，删除 `chat_stream.js` 中不再需要的普通 Chat 回退路径。

### 技术

- `backend/agent/protocol.py`：重写统一缩进，新增 `enable_thinking` + `reasoning_update` 透传
- `backend/api/routes/chat.py`：注入 AURA 系统提示词 + 支持 `enabled_skills` 过滤
- `backend/api/routes/agent.py`：多模态 message 文本提取 + 技能过滤重建提示词
- `backend/agent/memory/__init__.py`：`search_relevant` 类型防御
- `frontend/scripts/modules/chat_stream.js`：始终 Agent 模式 + 思考过程展示 + 图片上传图床
- `frontend/scripts/app.js`：图片放大（多模态 + Markdown）+ SSE 修复
- `frontend/scripts/modules/agent/agent_panel.js`：左侧栏技能选择区
- `frontend/index.html`：加载 chat_stream.js + 移除复选框 + 技能选择区

---

## v2.2.0 (2026-06-29) — AI 助理全面增强

### 新增 — CowAgent 核心能力移植

- **LLM 驱动自我进化**（`evolution.py` 重写）：从正则硬匹配升级为 LLM 回顾对话 → 自动提取用户偏好/经验→写入长期记忆。默认 `[SILENT]` 无信号不动，有明确信号才产出洞察。不再靠关键词猜偏好。
- **Deep Dream 记忆蒸馏**（`dream.py` 新增）：LLM 把日常对话摘要蒸馏为精炼的长期记忆（合并提炼、冲突更新、清理冗余），并生成梦境日记沉淀到 `memory/dreams/`。记忆不再越堆越乱，而是"越用越聪明"。
- **知识库 Markdown wiki**（`knowledge.py` 重写）：从 JSON 条目升级为结构化 Markdown wiki 布局（`knowledge/{entities,concepts,sources,analysis,creation}/`），agent 在对话中用 write 工具直接写 `.md` 文件。自动维护 `index.md` 索引和 `[[交叉引用]]` 知识图谱。
- **SKILL.md 可执行技能**（`skills.py` 重写）：支持 CowAgent 风格的 SKILL.md 技能格式（frontmatter + Markdown 指令 + scripts/），用 `<available_skills>` XML 注入系统提示词，模型可读 SKILL.md 后按指令执行。保留旧 skill.json 兼容。新增 `skill-creator`（对话生成新技能）和 `knowledge-wiki` 两个内置技能。
- **向量记忆修复**：`memory.py` 文件与 `memory/` 目录同名导致 Python 导入冲突，embedding provider 被静默吞错，向量检索全程返回空。合并为 `memory/` 包后修复，12 个 agent 路由全部正常注册。

### 修复

- **SSE 流式回复截断**（`app.js`）：buffer 处理用 `buffer=''` + `else if (line)` 逻辑，当网络 chunk 边界切在 `data: JSON` 中间时整条 SSE 事件丢失→回复随机残缺。改用 `lines.pop()` 保留未完成行，跨 chunk 拼接。顺手补了 `reasoning_content` 显示支持。Agent 模式（`agent.js` 用对了 `lines.pop`）不受影响。
- **Agent 管理面板按钮无反应**：`showAgentPanel`/`hideAgentPanel` 函数在全库未定义，且已写好的 `refresh_agent.js` 未被 `index.html` 引用。新建 `agent_panel.js` 实现四个 tab 面板（记忆/知识库/技能/进化）完整刷新逻辑，与其它弹窗统一使用 `.show` class。
- **SSE 流式长回复截断**：修复跨 chunk 边界时 `data:` JSON 丢失，内容随机残缺的问题。对照测试验证：旧逻辑只解析出 "你好"，"世界这是测试" 两条事件全丢；新逻辑完整输出。

### 改进

- **进化面板升级**（`agent_panel.js`）：新增"手动触发进化""Deep Dream 蒸馏""对话摘要"三个按钮，展示梦境日记列表、LLM 启用状态。
- **知识库面板升级**：目录树折叠展示（按分类展开/收起），点击知识页查看完整 Markdown 内容，全文搜索，SVG 知识图谱可视化（支持 `[[link]]` 交叉引用解析，圆环布局 + 连线，无需外部依赖）。
- **技能面板升级**：区分旧格式提示词技能和新格式 SKILL.md 可执行技能（⚡ 可执行标记），支持导入 `.json`/`.md` 文件，提供"新建 SKILL.md"表单。
- **embedding 错误日志强化**：从 `logger.warning` 升级为 `logger.exception`（带 traceback），防止向量记忆初始化失败再被静默吞错。

### 技术

- `backend/` 新增 `agent/llm_client.py`（同步 LLM 调用 helper）、`agent/dream.py`（Deep Dream 蒸馏）
- `backend/` 重写 `agent/evolution.py`、`agent/skills.py`、`agent/knowledge.py`、`agent/memory/__init__.py`
- `backend/api/routes/agent.py`：路由 12 → 16 个，新增 `POST /agent/dream`、`GET /agent/dream/diaries`、`POST /agent/dream/summarize`、`GET /agent/knowledge/read`
- `frontend/` 新建 `modules/agent/agent_panel.js`，删除孤立的 `refresh_agent.js`
- `skills/` 新增 `skill-creator/SKILL.md`、`knowledge-wiki/SKILL.md`

---

## v2.1.0 (2026-06-06) — 无限画布大更新

### 新增 — 无限画布

- **剧本拆解节点** (brk)：连接分镜节点，LLM 自动提取角色/场景/道具为结构化数据
- **资产节点**：char (角色)、scene (场景)、prop (道具)，展示结构化字段，可连线图生图
- **专用生成节点**：cgen (角色生成)、sgen (场景生成)、pgen (道具生成)，内置专业系统提示词（可编辑），一键出图
- **自动创建输出节点**：所有生成节点运行后，自动在右侧新建 text/image/prev 节点并连线
- **自动布局**：拆解结果按角色/场景/道具分三列排列

### 改进

- **节点 UI 翻新**：按钮改为「▶ 点击生成」(渐变绿，hover 发光)，运行中自动禁用
- **进度条**：文本/AI 生成类显示脉冲动画，视频类显示实时百分比进度
- **状态标签**：⏳排队中 / ⚙️生成中 / ✅已完成 / ❌失败
- **头部渐变**：每种节点类型有独立渐变背景
- **文本框自动撑高**：最长 400px，带字数统计

### 修复

- **视频轮询 URL 不识别**：适配 Agnes API 新字段 `remixed_from_video_id`
- **帧数计算失灵**：t2v 模式前缀修复 `''` → `'vid'`
- **fetch 相对路径**：app.js + canvas.html 共 9 处 `/api/...` 改为 `API_HOST+'/api/...'`，修复 Electron 打包版请求失败
- **btoa 中文崩溃**：剧本/分镜含中文时加 Base64 抛异常，`btoa` → `btoa(unescape(encodeURIComponent()))`
- **aip→story 传文本**：分镜节点只能读取 text 节点，现也支持读取相邻 aip/story 的 result

### 安全

- `user_config.json` 清空所有密钥（git 已提交清理）
- 运行时缓存清理工具 `aura-clean.py` 重写，覆盖 `%APPDATA%/aura-studio` localStorage
- 修复清理脚本误删 `release/` 构建产物

---

## v2.0.0 (2026-06-05)

- 首发内测版
- 文生图 / 图生图 / 文生视频 / AI 对话 (256K)
- 又拍云图床直传
- 离线激活码系统
- 无限画布（基础版）
