---
name: skill-creator
description: 创建、安装或更新技能。当用户需要 (1) 从零创建一个新技能，(2) 更新或重构现有技能，(3) 把某个重复工作流沉淀为可复用技能时使用此技能。任何技能创建或修改任务都应使用本技能。
category: meta
---

# Skill Creator

本技能指导如何用现有工具系统创建有效的技能。技能是模块化、自包含的能力包，通过提供专业知识、工作流和工具，把通用 agent 变成具备特定程序性知识的专业 agent。

## 关于技能

技能 = 一个必需的 SKILL.md 文件 + 可选的打包资源（scripts/、references/、assets/）。模型通过 read 工具读取 SKILL.md，按其指令工作，必要时用 bash 运行 scripts/ 下的脚本。

### 技能结构

```
skill-name/
├── SKILL.md（必需）
│   ├── YAML frontmatter 元数据（必需）
│   │   ├── name:（必需）
│   │   └── description:（必需，是主要触发机制）
│   └── Markdown 指令（必需）
└── 打包资源（可选）
    ├── scripts/      - 可执行代码（Python/Bash）
    ├── references/   - 按需加载的参考文档
    └── assets/       - 输出用的资产文件（模板、图标等）
```

### 核心原则

**精简是关键**：只添加 agent 还不知道的信息。每一块内容都要问"这值得占用的 token 吗？"。用简洁的例子胜过冗长的解释。

## SKILL.md 组成

**Frontmatter（YAML）** —— 必需字段：
- **name**：hyphen-case 技能名（如 `weather-api`、`pdf-editor`）
- **description**：**最关键** —— 主要触发机制。必须清楚说明技能做什么、何时使用，包含具体触发场景和关键词。所有"何时使用"的信息都放这里，不要放正文。

**正文（Markdown）** —— 技能触发后加载：
- 详细使用说明
- 如何调用脚本、读取参考文档
- 示例和最佳实践
- 用祈使句（"用 X 来做 Y"）

### 打包资源

**scripts/** —— 何时包含：
- 代码会被反复重写
- 需要确定性执行（避免 LLM 随机性）
- 必须在包含前测试脚本

**references/** —— 何时包含：
- **仅当**文档太长放不进 SKILL.md（>500 行）
- 数据库 schema、复杂 API 规范
- agent 按需读取进上下文

**assets/** —— 何时包含：
- 输出中使用的文件（模板、图标、样板代码）

**重要**：大多数技能不需要全部三种。按实际需要选择。不要创建辅助文档文件（README/INSTALLATION/CHANGELOG 等），所有说明都进 SKILL.md。

## 创建技能的流程

### 第 1 步：理解技能（用具体例子）

明确技能支持哪些用法。例如构建 `image-editor` 技能时，问：
- "这个技能应支持哪些功能？"
- "能给几个使用例子吗？"
- "用户说什么应该触发这个技能？"

### 第 2 步：规划可复用内容

分析每个例子，识别哪些 scripts/references/assets 有助于反复执行该工作流。

规划清单：
- ✅ **总是需要**：SKILL.md（清晰描述 + 用法说明）
- ✅ **scripts/**：仅当代码需要被执行
- ❌ **references/**：很少需要 —— 仅当文档 >500 行
- ✅ **assets/**：仅当输出用到的文件

### 第 3 步：创建技能

用 write 工具直接创建 `<workspace>/skills/<name>/SKILL.md`。其中 `<workspace>` 是用户的技能目录（系统提示词中会给出，通常是 `~/.aura-studio`）。

SKILL.md 模板：

```markdown
---
name: my-skill
description: <做什么。何时使用：(1) ... (2) ... (3) ...>
---

# My Skill

<详细使用说明>

## Usage

<如何使用，包含调用脚本的例子>

bash "<base_dir>/scripts/my_script.sh" <args>
```

**脚本路径约定**：技能在 `<available_skills>` 中列出时会附带 `<base_dir>`。在 SKILL.md 指令中引用脚本为 `<base_dir>/scripts/script_name.sh`，agent 会看到 base_dir 并能构造完整路径。

### 第 4 步：编辑

为另一个 agent 实例创建技能。包含对它有益且非显而易见的信息：程序性知识、领域细节、可复用资产。

**可用基础工具**：
- **bash**：执行 shell 命令（curl、ls、grep、sed、awk 等）
- **read**：读文件
- **write**：写文件
- **edit**：搜索替换编辑文件

**最小化依赖**：
- ✅ 优先 bash + curl 做 HTTP 调用
- ✅ 用 bash 工具处理文本
- ✅ 脚本保持简单 —— bash 能做就不必用 Python

### 第 5 步：测试与迭代

包含的脚本必须实际运行测试，确保无 bug、输出符合预期。然后在实际使用中改进。

## 渐进式加载

技能使用三级加载：
1. **元数据**（name + description）—— 始终在上下文中（约 100 词）
2. **SKILL.md 正文** —— 技能触发时加载（<5k 词）
3. **资源** —— agent 按需加载

最佳实践：SKILL.md 控制在 500 行以内。复杂内容拆到 references/。

## 命名规范

- 只用小写字母、数字、连字符；把用户给的标题规范化为 hyphen-case（如 "Plan Mode" → `plan-mode`）
- 名称控制在 64 字符内
- 优先简短的、动词开头的短语
- 技能文件夹名与技能名完全一致
