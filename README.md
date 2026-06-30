# AURA Studio

> AI 多模态创作工作台 — 文本对话 · 图像生成 · 视频生成 · 无限画布

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.4.0-blue.svg)](CHANGELOG.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

AURA Studio 是一款桌面端 AI 创作工作站，整合了文本对话、文生图、图生图、文生视频与无限画布等能力，内置可进化的 AI 助理（Agent）。采用 Electron 桌面壳 + Python FastAPI 后端 + 原生 JS 前端的轻量架构，无前端框架、无打包转译，源码即所见。

<!-- 截图占位：建议补充主界面 / 无限画布 / 文生图 / AI对话 / 模型配置面板 -->
<!-- <p align="center"><img src="docs/screenshot-main.png" width="800"/></p> -->

---

## ✨ 功能特性

- **文本对话** — 流式响应、思考过程可视化、深度思考与输出控制、多轮会话管理
- **图像生成** — 文生图（T2I）、图生图（I2I），分辨率可视化预设、Prompt 自动中译英、模板预设
- **视频生成** — 文生视频，提示词自动翻译、任务轮询与结果双区展示
- **无限画布** — 自由排布生成结果的可视化画布，节点可拖拽、可复用
- **AI 助理（Agent）** — 多步推理、工具调用、向量记忆、知识库 Wiki、技能系统（SKILL.md）、LLM 进化
- **模型配置** — 多模型卡片选择、API/模型/轮询/对象存储一体化设置页
- **桌面体验** — Electron 打包为 Windows 安装包，支持 GitHub Releases 自动更新

## 🧱 技术栈

| 层 | 技术 |
|---|------|
| 前端 | HTML + CSS + Vanilla JS（无框架、无转译） |
| 后端 | Python FastAPI（uvicorn） |
| 桌面壳 | Electron + PyInstaller |
| AI API | Agnes AI（`apihub.agnes-ai.com/v1`） |
| 对象存储 | 又拍云（Upyun）S3 兼容存储 |
| 本地存储 | localStorage / JSON |

## 📋 前置要求

- **Python >= 3.10**（由 `backend/dependencies.py` 校验）
- **Node.js >= 18**（用于 Electron 开发与打包）
- 一个 Agnes AI API Key（文本/图像/视频能力）
- 又拍云账号（用于图像存储）——也可替换为其他 S3 兼容存储

## 🚀 快速开始

### 方式一：浏览器开发模式（仅后端 + 前端）

```bash
# 1. 克隆仓库
git clone https://github.com/chaogegroup/aura-studio.git
cd aura-studio

# 2. 安装 Python 依赖
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
#   编辑 .env，填入 Agnes API Key、又拍云 AK/SK 等（见下方「配置说明」）

# 4. 启动后端（开发模式）
#    Windows (PowerShell):  $env:AURA_DEV=1; python backend/main.py
#    Windows (Git Bash):    AURA_DEV=1 python backend/main.py
#    macOS / Linux:         AURA_DEV=1 python backend/main.py

# 5. 浏览器访问
open http://127.0.0.1:18922
```

### 方式二：Electron 桌面开发模式

```bash
npm install
npm run dev    # 自动以 AURA_DEV=1 拉起后端子进程并打开桌面窗口
```

### 方式三：打包 Windows 安装包

```bash
npm install
npm run dist   # build:frontend → build:backend → build:pack
# 产物输出到 release/ 目录（NSIS 安装包）
```

## ⚙️ 配置说明

所有密钥均由用户自行填写，**仓库不包含任何真实凭据**。配置加载优先级（后者覆盖前者）：

```
环境变量  →  .env 文件  →  backend/config.json  →  user_config.json
```

- **又拍云对象存储**：在 `.env` 中配置（复制 `.env.example` 为 `.env`），或写入 `config.json` 的 `upyun_ak` / `upyun_sk` / `upyun_bucket` / `upyun_domain` / `upyun_endpoint` 字段。
- **Agnes AI API Key**：通过应用内「设置」页面可视化填写，写入 `user_config.json` 的 `api_key` 字段；也可直接编辑 `backend/config.json` 加入 `"api_key": "sk-..."`。
- 又拍云开通与配置详见 `docs/又拍云配置指南.md`。

> 🔒 `backend/config.json`、`user_config.json`、`.env` 均已在 `.gitignore` 中忽略，请勿提交真实密钥。

## 📁 项目结构

```
├── frontend/                # 静态前端（源码）
│   ├── index.html           # 主页面
│   ├── canvas.html          # 无限画布页面
│   ├── assets/              # logo 等静态资源
│   ├── styles/              # CSS（base/components/panels/splash）
│   └── scripts/
│       ├── app.js           # 单一入口
│       └── modules/         # 功能模块（api/chat/image/video/agent 等）
├── backend/                 # Python 后端
│   ├── main.py              # uvicorn 入口（端口 18922）
│   ├── dependencies.py      # 依赖检测（要求 Python >= 3.10）
│   ├── api/app.py           # FastAPI 工厂、路由、CORS
│   ├── api/routes/          # 按功能拆分的路由（config/chat/image/video/tasks/system/agent）
│   └── agent/               # AI 助理核心（协议/工具/记忆/知识/进化/技能）
├── electron/                # Electron 桌面壳
│   ├── main.js              # 窗口、后端进程管理、自动更新（GitHub Releases）
│   └── preload.js           # 上下文隔离 IPC 桥
├── scripts/                 # 构建脚本（frontend/backend/asar-update/manual）
├── skills/                  # Agent 技能定义（SKILL.md / skill.json）
├── docs/                    # 用户手册、又拍云配置指南
└── package.json             # 打包与依赖配置
```

## 🛠️ 开发

```bash
# 开发模式启动后端（启用 dev tools，前端从 frontend/ 而非 frontend-dist/ 加载）
AURA_DEV=1 python backend/main.py

# 开发模式启动 Electron（自动注入 AURA_DEV=1）
npm run dev
```

开发约定与贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发约定与提交规范。

## 📜 许可证

本项目基于 [MIT License](LICENSE) 开源。

## 🙏 致谢

- [Electron](https://www.electronjs.org/) · [FastAPI](https://fastapi.tiangolo.com/) · [electron-builder](https://www.electron.build/)
- [又拍云](https://www.upyun.com/) S3 兼容存储
- 所有为这个项目提供建议与反馈的朋友
