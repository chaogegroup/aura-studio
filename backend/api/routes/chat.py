"""
Chat Completion 代理路由
浏览器直调 Agnes API 可能遇到 CORS 问题，通过后端中转

注：本路由会自动注入 AURA 系统提示词（身份/工具/技能），
确保即使 Agent 模式未启用，AI 也知道自己是 AURA 创作助手。
"""

import json
import traceback
import logging
import asyncio
import httpx
import warnings
from urllib import request as urllib_req
from urllib.error import URLError
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
import ssl

logger = logging.getLogger("chaoge-ai-studio")

router = APIRouter()

# 从 user_config 读取 API 地址
import sys as _sys
from pathlib import Path as _Path
if getattr(_sys, "frozen", False):
    _CHAT_CONFIG_DIR = _Path(_sys.executable).parent
else:
    _CHAT_CONFIG_DIR = _Path(__file__).parent.parent.parent.parent
_CHAT_CONFIG_FILE = _CHAT_CONFIG_DIR / "user_config.json"
def _get_api_base():
    try:
        if _CHAT_CONFIG_FILE.exists():
            import json
            cfg = json.loads(_CHAT_CONFIG_FILE.read_text(encoding="utf-8"))
            return cfg.get("api_base", "https://apihub.agnes-ai.com/v1")
    except Exception:
        pass
    return "https://apihub.agnes-ai.com/v1"

AGNES_API = "https://apihub.agnes-ai.com/v1"

def _get_agnes_api():
    """从 user_config 读取用户配置的 API 地址，支持运行时更新"""
    try:
        import json
        if _CHAT_CONFIG_FILE.exists():
            cfg = json.loads(_CHAT_CONFIG_FILE.read_text(encoding="utf-8"))
            return cfg.get("api_base", AGNES_API)
    except Exception:
        pass
    return AGNES_API

# Windows 兼容 SSL 上下文
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

# 跳过 httpx SSL 警告
warnings.filterwarnings("ignore", message=".*verify=False.*")


@router.post("/completions")
async def chat_completions(request: Request):
    """代理 Chat Completion 请求（自动注入 AURA 系统提示词）"""
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": "无效的 JSON"}, status_code=400)

    api_key = body.pop("_api_key", None)
    if not api_key:
        return JSONResponse({"error": "API Key 未提供"}, status_code=400)

    # 读取技能筛选（前端的技能开关状态）
    enabled_skills = body.pop("enabled_skills", None)

    # === 注入 AURA 系统提示词 ===
    # 复用 agent 路由的 _get_agent()，从中提取 system_prompt 注入消息列表，
    # 使 AI 知道自己是 AURA Studio 创作助手并了解可用工具/技能。
    # 即使 Agent 模式未启用，AI 也不会说"我是 Agnes-2.0-Flash 无法生成图片"。
    try:
        from .agent import _get_agent as _aura_get_agent, _build_agent_system_prompt
        _aura_inst = _aura_get_agent()
        _aura_prompt = _aura_inst["agent"].system_prompt

        # 如果有技能筛选，重建提示词
        if enabled_skills is not None and isinstance(enabled_skills, list):
            skills = _aura_inst.get("skills")
            memory = _aura_inst.get("memory")
            knowledge = _aura_inst.get("knowledge")
            tools = _aura_inst["agent"].tools
            _aura_prompt = _build_agent_system_prompt(
                memory, skills, knowledge, tools=tools,
                enabled_skills=enabled_skills
            )

        if _aura_prompt:
            messages = body.get("messages", [])
            has_system = any(m.get("role") == "system" for m in messages)
            if not has_system:
                messages.insert(0, {"role": "system", "content": _aura_prompt})
                body["messages"] = messages
    except Exception as e:
        logger.warning(f"AURA system prompt injection skipped: {e}")

    is_stream = body.get("stream", False)

    if is_stream:
        async def stream():
            async with httpx.AsyncClient(verify=False, timeout=180) as client:
                async with client.stream(
                    "POST", f"{_get_agnes_api()}/chat/completions",
                    json=body,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                ) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk

        return StreamingResponse(stream(), media_type="text/event-stream")

    # 非流式：用 urllib
    def _sync_post():
        data = json.dumps(body).encode("utf-8")
        req = urllib_req.Request(
            f"{_get_agnes_api()}/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib_req.urlopen(req, timeout=120, context=_SSL_CTX) as resp:
            return json.loads(resp.read().decode("utf-8")), resp.status

    try:
        result, status = await asyncio.to_thread(_sync_post)
        return JSONResponse(result, status_code=status)
    except URLError as e:
        return JSONResponse({"error": f"聊天请求失败: {e.reason}"}, status_code=502)
    except Exception as e:
        logger.error(f"[CHAT] error: {traceback.format_exc()}")
        return JSONResponse({"error": f"聊天请求失败: {str(e)}"}, status_code=502)
