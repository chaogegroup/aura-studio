from fastapi import APIRouter
from fastapi.responses import JSONResponse
import json
import sys
from pathlib import Path

router = APIRouter()

# 持久化配置：打包后存 backend.exe 同级目录，开发模式存项目根目录
if getattr(sys, "frozen", False):
    CONFIG_DIR = Path(sys.executable).parent
else:
    CONFIG_DIR = Path(__file__).parent.parent.parent.parent
CONFIG_FILE = CONFIG_DIR / "user_config.json"


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def _default_models() -> dict:
    """返回默认模型配置。

    结构：每个类别有 default（默认模型 id）和 items（模型条目列表）。
    每个 item: {id, name, api_base, api_key, model}
    - api_base/api_key 为空时回退到全局 api_base / user_config.api_key
    """
    return {
        "chat": {
            "default": "agnes-2.0-flash",
            "items": [
                {"id": "agnes-2.0-flash", "name": "Agnes 2.0 Flash", "api_base": "", "api_key": "", "model": "agnes-2.0-flash"},
            ],
        },
        "image": {
            "default": "agnes-image-2.1-flash",
            "items": [
                {"id": "agnes-image-2.1-flash", "name": "Agnes Image 2.1", "api_base": "", "api_key": "", "model": "agnes-image-2.1-flash"},
            ],
        },
        "video": {
            "default": "agnes-video-v2.0",
            "items": [
                {"id": "agnes-video-v2.0", "name": "Agnes Video 2.0", "api_base": "", "api_key": "", "model": "agnes-video-v2.0"},
            ],
        },
        "agent": {
            "default": "agnes-2.0-flash",
            "items": [
                {"id": "agnes-2.0-flash", "name": "Agnes 2.0 Flash", "api_base": "", "api_key": "", "model": "agnes-2.0-flash"},
            ],
            "max_steps": 20,
            "enable_thinking": False,
            "reasoning_effort": "high",
        },
    }


def _get_models(cfg: dict) -> dict:
    """获取模型配置，合并默认值。"""
    models = _default_models()
    saved = cfg.get("models", {})
    for key in models:
        if key in saved and isinstance(saved[key], dict):
            # 合并：保留 saved 的 default/items，补默认字段
            merged = dict(models[key])
            merged.update(saved[key])
            # 确保 items 里有数据
            if not merged.get("items"):
                merged["items"] = models[key]["items"]
            models[key] = merged
    return models


# ===== API Key =====

@router.get("/api-key")
async def get_api_key():
    cfg = _load_config()
    key = cfg.get("api_key", "")
    return JSONResponse({"api_key": key})


@router.post("/api-key")
async def set_api_key(request: dict):
    key = request.get("api_key", "")
    cfg = _load_config()
    cfg["api_key"] = key
    _save_config(cfg)
    return JSONResponse({"ok": True})


# ===== 模型配置 =====

@router.get("/models")
async def get_models():
    """获取所有模型配置"""
    cfg = _load_config()
    return JSONResponse({
        "models": _get_models(cfg),
        "api_base": cfg.get("api_base", "https://apihub.agnes-ai.com/v1"),
    })


@router.post("/models")
async def set_models(request: dict):
    """保存模型配置。整体替换每个类别的 default/items。"""
    cfg = _load_config()
    if "models" in request and isinstance(request["models"], dict):
        existing = cfg.get("models", {})
        for key in ("chat", "image", "video", "agent"):
            if key in request["models"] and isinstance(request["models"][key], dict):
                # 整体替换该类别（保留 agent 的 max_steps 等额外字段）
                new_cat = dict(request["models"][key])
                if key == "agent" and "max_steps" not in new_cat and "max_steps" in existing.get(key, {}):
                    new_cat["max_steps"] = existing[key]["max_steps"]
                existing[key] = new_cat
        cfg["models"] = existing
    if "api_base" in request:
        cfg["api_base"] = request["api_base"]
    _save_config(cfg)
    return JSONResponse({"ok": True, "models": _get_models(cfg)})


# ===== Embedding 配置 =====

@router.get("/embedding")
async def get_embedding_config():
    """获取 embedding 配置"""
    cfg = _load_config()
    return JSONResponse({
        "embedding_api_base": cfg.get("embedding_api_base", ""),
        "embedding_api_key": cfg.get("embedding_api_key", ""),
        "embedding_model": cfg.get("embedding_model", ""),
        "embedding_dimensions": cfg.get("embedding_dimensions", 0),
    })


@router.post("/embedding")
async def set_embedding_config(request: dict):
    """保存 embedding 配置"""
    cfg = _load_config()
    for key in ("embedding_api_base", "embedding_api_key", "embedding_model", "embedding_dimensions"):
        if key in request:
            cfg[key] = request[key]
    _save_config(cfg)
    return JSONResponse({"ok": True})


# ===== 又拍云配置 =====

@router.get("/upyun")
async def get_upyun_config():
    from ..app import UPYUN_AK, UPYUN_SK, UPYUN_BUCKET, UPYUN_DOMAIN, UPYUN_ENDPOINT
    return JSONResponse({
        "has_config": bool(UPYUN_AK and UPYUN_SK),
        "ak": UPYUN_AK[:4] + "****" if UPYUN_AK else "",
        "bucket": UPYUN_BUCKET or "未配置",
        "domain": UPYUN_DOMAIN or "未配置",
        "endpoint": UPYUN_ENDPOINT or "https://s3.api.upyun.com",
    })


@router.post("/upyun")
async def set_upyun_config(request: dict):
    from ..app import reload_upyun_config
    cfg = _load_config()
    for key in ("upyun_ak", "upyun_sk", "upyun_bucket", "upyun_domain", "upyun_endpoint"):
        if key in request:
            cfg[key] = request[key]
    _save_config(cfg)
    reload_upyun_config()
    return JSONResponse({"ok": True, "message": "图床配置已保存"})


# ===== 通用设置 =====

@router.get("/all")
async def get_all_config():
    """获取所有用户配置"""
    from ..app import UPYUN_AK, UPYUN_SK, UPYUN_BUCKET, UPYUN_DOMAIN, UPYUN_ENDPOINT
    cfg = _load_config()
    return JSONResponse({
        "api_key": cfg.get("api_key", ""),
        "api_base": cfg.get("api_base", "https://apihub.agnes-ai.com/v1"),
        "models": _get_models(cfg),
        "poll_seconds": cfg.get("poll_seconds", 22),
        "timeout_min": cfg.get("timeout_min", 20),
        "upyun_ak": cfg.get("upyun_ak", ""),
        "upyun_sk": cfg.get("upyun_sk", ""),
        "upyun_bucket": cfg.get("upyun_bucket", UPYUN_BUCKET or ""),
        "upyun_domain": cfg.get("upyun_domain", UPYUN_DOMAIN or ""),
        "upyun_endpoint": cfg.get("upyun_endpoint", UPYUN_ENDPOINT or "https://s3.api.upyun.com"),
    })


@router.post("/all")
async def set_all_config(request: dict):
    """保存所有用户配置（兼容旧接口）"""
    cfg = _load_config()
    for key in ("api_key", "api_base", "poll_seconds", "timeout_min",
                 "upyun_ak", "upyun_sk", "upyun_bucket", "upyun_domain", "upyun_endpoint"):
        if key in request:
            cfg[key] = request[key]
    # 也支持通过 all 接口更新 models
    if "models" in request and isinstance(request["models"], dict):
        existing = cfg.get("models", {})
        for key in ("chat", "image", "video", "agent"):
            if key in request["models"]:
                if key not in existing:
                    existing[key] = {}
                existing[key].update(request["models"][key])
        cfg["models"] = existing
    _save_config(cfg)
    return JSONResponse({"ok": True, "message": "配置已保存"})
