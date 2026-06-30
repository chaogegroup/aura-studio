"""
视频任务代理路由 - Agnes Video V2.0
新版 API：创建用 POST /v1/videos，查询用 GET /agnesapi?video_id=<VIDEO_ID>
"""

import json
import traceback
import logging
from urllib.parse import urlencode
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
    _VID_CONFIG_DIR = _Path(_sys.executable).parent
else:
    _VID_CONFIG_DIR = _Path(__file__).parent.parent.parent.parent
_VID_CONFIG_FILE = _VID_CONFIG_DIR / "user_config.json"
def _get_agnes_api():
    try:
        import json
        if _VID_CONFIG_FILE.exists():
            cfg = json.loads(_VID_CONFIG_FILE.read_text(encoding="utf-8"))
            return cfg.get("api_base", "https://apihub.agnes-ai.com")
    except Exception:
        pass
    return "https://apihub.agnes-ai.com"

AGNES_API = "https://apihub.agnes-ai.com"

# Windows 兼容 SSL 上下文
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def _urllib_post(path: str, body: dict, api_key: str, timeout: int = 60):
    """用 urllib 同步转发 POST"""
    data = json.dumps(body).encode("utf-8")
    req = urllib_req.Request(
        f"{_get_agnes_api()}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib_req.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
        return json.loads(resp.read().decode("utf-8")), resp.status


def _urllib_get_query(path: str, params: dict, api_key: str, timeout: int = 60):
    """用 urllib 同步转发 GET（带查询参数）"""
    url = f"{_get_agnes_api()}{path}?{urlencode(params)}"
    req = urllib_req.Request(
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        method="GET",
    )
    with urllib_req.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
        return json.loads(resp.read().decode("utf-8")), resp.status


@router.post("/create")
async def create_video_task(request: Request):
    """创建视频任务 → POST /v1/videos"""
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"[CREATE] JSON parse error: {e}")
        return JSONResponse({"error": "无效的 JSON"}, status_code=400)

    api_key = body.pop("_api_key", None)
    if not api_key:
        return JSONResponse({"error": "API Key 未提供"}, status_code=400)

    import asyncio
    try:
        result, status = await asyncio.to_thread(
            _urllib_post, "/v1/videos", body, api_key
        )
        return JSONResponse(result, status_code=status)
    except URLError as e:
        logger.error(f"[CREATE] URLError: {e.reason}")
        return JSONResponse({"error": f"请求 Agnes API 失败: {e.reason}"}, status_code=502)
    except Exception as e:
        logger.error(f"[CREATE] error: {traceback.format_exc()}")
        return JSONResponse({"error": f"代理请求失败: {str(e)}"}, status_code=502)


@router.get("/status/{video_id}")
async def get_video_status(video_id: str, request: Request):
    """查询视频结果 → GET /agnesapi?video_id=<VIDEO_ID>"""
    try:
        api_key = request.query_params.get("_api_key")
        if not api_key:
            return JSONResponse({"error": "API Key 未提供"}, status_code=400)

        model_name = request.query_params.get("model_name")

        import asyncio
        params = {"video_id": video_id}
        if model_name:
            params["model_name"] = model_name
        result, status = await asyncio.to_thread(
            _urllib_get_query, "/agnesapi", params, api_key
        )
        return JSONResponse(result, status_code=status)
    except URLError as e:
        logger.error(f"[STATUS] error: {e.reason}")
        return JSONResponse({"error": f"查询任务状态失败: {e.reason}"}, status_code=502)
    except Exception as e:
        logger.error(f"[STATUS] error: {traceback.format_exc()}")
        return JSONResponse({"error": f"查询任务状态失败: {str(e)}"}, status_code=502)
