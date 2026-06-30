"""
图像生成代理路由
浏览器直调 Agnes API 可能遇到 CORS 问题，通过后端中转
"""

import json
import traceback
import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from urllib import request as urllib_req
from urllib.error import URLError
import ssl

logger = logging.getLogger("chaoge-ai-studio")

router = APIRouter()

# 从 user_config 读取 API 地址
import sys as _sys
from pathlib import Path as _Path
if getattr(_sys, "frozen", False):
    _IMG_CONFIG_DIR = _Path(_sys.executable).parent
else:
    _IMG_CONFIG_DIR = _Path(__file__).parent.parent.parent.parent
_IMG_CONFIG_FILE = _IMG_CONFIG_DIR / "user_config.json"
def _get_agnes_api():
    try:
        import json
        if _IMG_CONFIG_FILE.exists():
            cfg = json.loads(_IMG_CONFIG_FILE.read_text(encoding="utf-8"))
            return cfg.get("api_base", "https://apihub.agnes-ai.com/v1")
    except Exception:
        pass
    return "https://apihub.agnes-ai.com/v1"

AGNES_API = "https://apihub.agnes-ai.com/v1"
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


@router.post("/generate")
async def generate_image(request: Request):
    """代理图像生成请求"""
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": "无效的 JSON"}, status_code=400)

    api_key = body.pop("_api_key", None)
    if not api_key:
        return JSONResponse({"error": "API Key 未提供"}, status_code=400)

    import asyncio

    def _sync_post():
        data = json.dumps(body).encode("utf-8")
        req = urllib_req.Request(
            f"{_get_agnes_api()}/images/generations",
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
        logger.error(f"[IMAGE] URLError: {e.reason}")
        return JSONResponse({"error": f"图像请求失败: {e.reason}"}, status_code=502)
    except Exception as e:
        logger.error(f"[IMAGE] error: {traceback.format_exc()}")
        return JSONResponse({"error": f"图像请求失败: {str(e)}"}, status_code=502)
