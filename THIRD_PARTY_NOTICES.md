# 第三方声明 (Third-Party Notices)

本项目（AURA Studio）的部分代码移植自第三方开源项目，在此向原作者致谢。
所有移植代码均保留原项目的版权声明与许可证条款，并在对应源文件头部注明来源。

---

## CowAgent

- **项目**：CowAgent — 基于 LLM 的自进化 Agent 框架
- **原作者**：zhayujie (Copyright 2022 zhayujie)
- **许可证**：MIT License
- **使用方式**：参考并适配其 Agent 协议、记忆、知识库、技能、进化、蒸馏等核心设计，中文化并改造为 AURA Studio 的多模态创作场景

### 涉及文件

| 本项目文件 | 移植自 CowAgent |
|---|---|
| `backend/agent/__init__.py` | Agent 模块入口 / 协议总览 |
| `backend/agent/protocol.py` | `AgentStreamExecutor` 多轮推理 + 工具调用循环 |
| `backend/agent/memory/__init__.py` | Memory 三层架构 + 向量检索 |
| `backend/agent/knowledge.py` | Knowledge 知识库系统（Markdown wiki 布局） |
| `backend/agent/skills.py` | Skills 技能系统（`frontmatter.py` / `formatter.py`） |
| `backend/agent/evolution.py` | Evolution 自我进化系统（`evolution/prompts.py`） |
| `backend/agent/dream.py` | `MemoryFlushManager` / `summarizer` 记忆蒸馏 |

### 原 MIT 许可证声明

```
MIT License

Copyright (c) 2022 zhayujie

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 其他开源依赖

本项目还依赖以下开源项目（通过 npm / pip 引入，未修改其源码）：

- [Electron](https://www.electronjs.org/) (MIT) — 桌面应用框架
- [FastAPI](https://fastapi.tiangolo.com/) (MIT) — Python Web 框架
- [electron-builder](https://www.electron.build/) (MIT) — 打包工具
- [electron-updater](https://www.electron.build/auto-update) (MIT) — 自动更新
- [PyInstaller](https://pyinstaller.org/) (GPL-2.0-with-bootloader-exception) — Python 打包
- [boto3](https://github.com/boto/boto3) (Apache-2.0) — AWS SDK（用于又拍云 S3 兼容存储）
- [Pillow](https://python-pillow.org/) (MIT-CMU) — 图像处理
- [SQLAlchemy](https://www.sqlalchemy.org/) (MIT) — ORM（向量存储）
- [terser](https://terser.org/) (BSD-2-Clause) — JS 压缩

完整依赖列表见 `package.json` 与 `requirements.txt`。
