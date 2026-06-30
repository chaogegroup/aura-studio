# 贡献指南

感谢你对 AURA Studio 的关注！欢迎提交 Issue、Pull Request 或参与讨论。

## 开发环境准备

- **Python >= 3.10**（由 `backend/dependencies.py` 校验）
- **Node.js >= 18**

```bash
# 克隆并安装依赖
git clone https://github.com/chaogegroup/aura-studio.git
cd aura-studio
pip install -r requirements.txt
npm install

# 复制环境配置并填入自己的测试凭据（请勿提交真实密钥）
cp .env.example .env
```

## 开发命令

```bash
# 仅后端 + 前端（浏览器开发）
AURA_DEV=1 python backend/main.py
# → http://127.0.0.1:18922

# Electron 桌面开发（后端作为子进程自动拉起，自动注入 AURA_DEV=1）
npm run dev

# 打包 Windows 安装包（build:frontend → build:backend → build:pack）
npm run dist
```

- `build:frontend` 复制 `frontend/` → `frontend-dist/`，改写 Electron `loadFile` 路径，terser 压缩 `app.js`
- `build:backend` 用 PyInstaller 把 `backend/main.py` 编译为单文件 `build/backend.exe`（自动探测 `python` / `py -3`）
- `build:pack` 运行 electron-builder（Windows NSIS 安装包），发布到 GitHub Releases

## 架构速览

```
frontend/           原生 JS + CSS（源码）
  scripts/app.js    单一入口
  scripts/modules/  功能模块（api/chat/image/video/agent 等）
  canvas.html       无限画布页面（独立入口）
backend/
  main.py           uvicorn 入口，端口 18922
  api/app.py        FastAPI 工厂、路由、CORS
  api/routes/       按功能拆分的路由文件
electron/
  main.js           窗口、后端进程管理、自动更新
  preload.js        上下文隔离 IPC 桥
```

## 关键约定与陷阱

- **端口 18922 硬编码**在 `electron/main.js`、`frontend/app.js`、README 等多处，改动需全局同步。
- **无测试套件、无 lint、无 typecheck。** 改动后请启动应用手动验证。
- **配置加载优先级**：环境变量 → `.env` → `backend/config.json` → `user_config.json`，后者覆盖前者。
- **`backend/config.json`、`user_config.json`、`.env` 已被 `.gitignore` 忽略**，含 API 密钥，严禁提交真实凭据。
- **前端 fetch 路径**：开发态后端提供 `/static/` 与 `/`；Electron 打包态用 `loadFile` 直接加载，构建脚本会把 `/static/` 改写为相对路径。
- **Electron 通过子进程拉起后端**，`killBackend()` 在 Windows 上用 `taskkill /f /t`。
- **UI 语言为中文**（所有面向用户的文案、注释、日志）。
- **前端状态用全局变量**（无模块打包器、无状态管理库）。
- **后端路由按功能一文件一特性**放在 `backend/api/routes/`。

## 提交规范

提交信息使用 `类型: 简述` 格式，例如：

- `feat: 新增XXX功能`
- `fix: 修复XXX问题`
- `chore: 清理/版本号/打包配置`
- `docs: 文档更新`
- `perf: 性能优化`
- `refactor: 重构XXX`

## 提交 Pull Request

1. 基于 `main` 创建特性分支：`git checkout -b feat/your-feature`
2. 保持单个 PR 聚焦一件事，提交信息遵循上述规范。
3. 确保改动已在本地启动应用验证可用。
4. 在 PR 描述中说明改动目的、影响范围与验证方式。
5. 如改动涉及 UI，附上截图。

再次感谢你的贡献！
