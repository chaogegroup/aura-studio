# AURA Studio — Agent Instructions

## What this is

AI multimodal creation workstation (text chat, image gen, video gen, infinite canvas).
Desktop app: Electron shell + Python FastAPI backend + vanilla JS frontend.
No framework, no transpilation, no test suite, no lint/typecheck config.

## Dev commands

```bash
# Backend only (browser dev)
AURA_DEV=1 python backend/main.py
# → http://127.0.0.1:18922

# Electron dev (backend auto-starts as child process)
npm run dev
```

## Build (Windows desktop release)

```bash
npm run dist
# Steps: build:frontend → build:backend → build:pack
# Output: release/
```

- `build:frontend` copies `frontend/` → `frontend-dist/`, adjusts paths for Electron `loadFile`, terser-minifies `app.js`
- `build:backend` runs PyInstaller to compile `backend/main.py` → single `build/backend.exe` (auto-detects `python` / `py -3`)
- `build:pack` runs electron-builder (targets Windows NSIS installer)

## Architecture

```
frontend/           Static vanilla JS + CSS (source)
  scripts/app.js    Single entry, ~114 lines, plus modules/
  scripts/modules/  16 module files (api, chat, image, video, agent, etc.)
  canvas.html       Infinite canvas page (separate entry)
frontend-dist/      Build output (gitignored, electron loads this)
backend/
  main.py           uvicorn entry, port 18922
  api/app.py        FastAPI factory, routes, CORS
  api/routes/       config, chat, image, video, tasks, system
electron/
  main.js           Electron window, spawns backend, auto-updater (GitHub Releases)
  preload.js        Context bridge for IPC
```

## Key gotchas

- **Port 18922 is hardcoded** everywhere (electron/main.js, frontend/app.js, README). Change in one place = change everywhere.
- **No test suite, no lint, no typecheck.** Verify changes by running the app and testing manually.
- **Python >= 3.10 required** (checked in `backend/dependencies.py`).
- **Config loading order**: env vars → `.env` file → `backend/config.json` → `user_config.json`. The last writer wins.
- **`backend/config.json` and `user_config.json` are gitignored.** They contain API keys. Never commit real credentials.
- **`AURA_DEV=1`** enables dev mode (dev tools, frontend served from `frontend/` not `frontend-dist/`).
- **Frontend fetch paths**: In dev, backend serves `/static/` and `/`. In Electron packaged mode, `loadFile` loads directly — build script rewrites `/static/` to relative paths.
- **Electron spawns backend** as a child process. `killBackend()` uses `taskkill /f /t` on Windows.
- **No npm scripts for lint/test/format.** Only `start`, `dev`, `build:*`, `dist`.

## Conventions

- Commit messages: `feat: xxx功能` format (see CONTRIBUTING.md)
- UI language is Chinese (all user-facing text, comments, logs)
- Frontend state is global variables (no module bundler, no state management library)
- Backend routes are one file per feature in `backend/api/routes/`
- Images uploaded to 又拍云 (Upyun) S3-compatible storage
- AI API: Agnes AI (`apihub.agnes-ai.com/v1`)
