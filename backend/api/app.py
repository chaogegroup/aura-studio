"""
FastAPI 应用工厂
创建并配置 FastAPI 应用实例
"""

from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, Response, FileResponse
import json
import os
from pathlib import Path
import uuid
import base64
import hashlib
from datetime import datetime, timezone

from .routes import config, chat, image, video, tasks, system, agent

import sys as _sys
if getattr(_sys, 'frozen', False):
    _BASE_DIR = Path(_sys.executable).parent
else:
    _BASE_DIR = Path(__file__).parent.parent.parent

# 加载 .env 文件
_env_file = _BASE_DIR / ".env"
if _env_file.exists():
    try:
        with open(_env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key, val = key.strip(), val.strip().strip("\"'")
                if not os.getenv(key):  # 不覆盖已存在的环境变量
                    os.environ[key] = val
    except Exception:
        pass

# 优先读环境变量 / .env，再 fallback 到 config.json，最后是用户配置
_config_file = _BASE_DIR / "config.json"
_user_config_file = _BASE_DIR / "user_config.json"

def _load_cfg():
    """合并加载配置：环境变量 > config.json > user_config.json"""
    cfg = {}
    # 1. config.json（开发用，不打包进发布版）
    if _config_file.exists():
        try:
            cfg.update(json.loads(_config_file.read_text(encoding="utf-8")))
        except Exception:
            pass
    # 2. user_config.json（用户在图床设置里配的，覆盖 config.json）
    if _user_config_file.exists():
        try:
            cfg.update(json.loads(_user_config_file.read_text(encoding="utf-8")))
        except Exception:
            pass
    return cfg

_cfg = _load_cfg()

UPYUN_AK = os.getenv("UPYUN_AK") or _cfg.get("upyun_ak", "")
UPYUN_SK = os.getenv("UPYUN_SK") or _cfg.get("upyun_sk", "")
UPYUN_BUCKET = os.getenv("UPYUN_BUCKET") or _cfg.get("upyun_bucket", "")
UPYUN_DOMAIN = os.getenv("UPYUN_DOMAIN") or _cfg.get("upyun_domain", "")
UPYUN_ENDPOINT = os.getenv("UPYUN_ENDPOINT") or _cfg.get("upyun_endpoint", "https://s3.api.upyun.com")

def reload_upyun_config():
    """重新加载用户配置（图床设置后调用）"""
    global UPYUN_AK, UPYUN_SK, UPYUN_BUCKET, UPYUN_DOMAIN, UPYUN_ENDPOINT
    _c = _load_cfg()
    UPYUN_AK = os.getenv("UPYUN_AK") or _c.get("upyun_ak", UPYUN_AK)
    UPYUN_SK = os.getenv("UPYUN_SK") or _c.get("upyun_sk", UPYUN_SK)
    UPYUN_BUCKET = os.getenv("UPYUN_BUCKET") or _c.get("upyun_bucket", UPYUN_BUCKET)
    UPYUN_DOMAIN = os.getenv("UPYUN_DOMAIN") or _c.get("upyun_domain", UPYUN_DOMAIN)
    UPYUN_ENDPOINT = os.getenv("UPYUN_ENDPOINT") or _c.get("upyun_endpoint", UPYUN_ENDPOINT)


def create_app() -> FastAPI:
    app = FastAPI(
        title="AURA Studio API",
        description="Agnes AI 多模态创作工作台 — 后端服务",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system.router, prefix="/api/system", tags=["system"])
    app.include_router(config.router, prefix="/api/config", tags=["config"])
    app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
    app.include_router(image.router, prefix="/api/image", tags=["image"])
    app.include_router(video.router, prefix="/api/video", tags=["video"])
    app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
    app.include_router(agent.router, prefix="/api/agent", tags=["agent"])

    # 在 Electron 打包模式下，前端文件在 frontend-dist/（通过 electron loadFile 加载）
    # 在开发模式下，后端同时 serve 前端静态文件
    if not getattr(_sys, 'frozen', False):
        frontend_dir = Path(__file__).parent.parent.parent / "frontend"
        if frontend_dir.exists():
            app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

        @app.get("/")
        async def serve_index(request: Request):
            index_path = frontend_dir / "index.html"
            if index_path.exists():
                html = index_path.read_text(encoding="utf-8")
                return Response(content=html, media_type="text/html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
            return JSONResponse({"error": "前端文件未找到"}, status_code=404)

        @app.get("/canvas")
        async def serve_canvas(request: Request):
            canvas_path = frontend_dir / "canvas.html"
            if canvas_path.exists():
                html = canvas_path.read_text(encoding="utf-8")
                return Response(content=html, media_type="text/html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
            return JSONResponse({"error": "画布页面未找到"}, status_code=404)

    @app.get("/api/upyun/policy")
    async def get_upyun_policy(filename: str = "", content_type: str = ""):
        """生成又拍云FORM API上传凭证（policy + signature）"""
        if not UPYUN_AK or not UPYUN_SK or not UPYUN_BUCKET:
            return JSONResponse({"error": "又拍云未配置"}, status_code=500)

        try:
            # 构建policy
            ext = filename.split(".")[-1].lower() if filename else "png"
            save_key = f"/ai-studio/{uuid.uuid4().hex[:8]}.{ext}"
            expiration = int(datetime.now(timezone.utc).timestamp()) + 1800  # 30分钟有效期

            policy_dict = {
                "bucket": UPYUN_BUCKET,
                "expiration": expiration,
                "save-key": save_key,
                "allow-file-type": "jpg,jpeg,png,webp,gif",
                "content-length-range": "0,20971520",  # 20MB
            }
            if content_type:
                policy_dict["content-type"] = content_type

            # Base64编码policy
            policy_json = json.dumps(policy_dict, separators=(',', ':'))
            policy_base64 = base64.b64encode(policy_json.encode('utf-8')).decode('utf-8')

            # 计算signature: MD5(form_api_secret + "&" + policy_base64)
            signature_str = UPYUN_SK + "&" + policy_base64
            signature = hashlib.md5(signature_str.encode('utf-8')).hexdigest()

            return JSONResponse({
                "policy": policy_base64,
                "signature": signature,
                "bucket": UPYUN_BUCKET,
                "api_url": "http://v0.api.upyun.com",
                "save_key": save_key,
                "cdn_url": f"http://{UPYUN_DOMAIN}{save_key}"
            })
        except Exception as e:
            return JSONResponse({"error": f"生成上传凭证失败: {str(e)}"}, status_code=500)

    @app.post("/api/upload")
    async def upload_to_upyun(file: UploadFile = File(...)):
        try:
            import boto3
            from botocore.exceptions import ClientError
        except ImportError:
            return JSONResponse({"error": "boto3 未安装"}, status_code=500)

        content = await file.read()
        ext = file.filename.split(".")[-1].lower()
        if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
            return JSONResponse({"error": f"不支持的格式: {ext}"}, status_code=400)
        if len(content) > 20 * 1024 * 1024:
            return JSONResponse({"error": "文件过大，20MB限制"}, status_code=400)

        key = f"ai-studio/{uuid.uuid4().hex[:8]}.{ext}"

        try:
            s3 = boto3.client(
                "s3",
                aws_access_key_id=UPYUN_AK,
                aws_secret_access_key=UPYUN_SK,
                endpoint_url=UPYUN_ENDPOINT,
            )
            s3.put_object(
                Bucket=UPYUN_BUCKET,
                Key=key,
                Body=content,
                ContentType=f"image/{ext if ext != 'jpg' else 'jpeg'}",
            )
        except ClientError as e:
            return JSONResponse({"error": f"上传失败: {str(e)}"}, status_code=500)
        except Exception as e:
            return JSONResponse({"error": f"异常: {str(e)}"}, status_code=500)

        # 返回 CDN 直链（浏览器可直接访问）
        cdn_url = f"http://{UPYUN_DOMAIN}/{key}"
        return JSONResponse({"url": cdn_url, "filename": key, "size": len(content)})

    @app.post("/api/docs/export")
    async def export_to_docs(request: Request):
        """保存项目导出数据，供后续写入腾讯文档"""
        try:
            body = await request.json()
            project_name = body.get("name", "未命名项目")
            nodes_data = body.get("nodes", [])
            edges_data = body.get("edges", [])
            assets_data = body.get("assets", [])

            export_dir = _BASE_DIR / "exports"
            export_dir.mkdir(exist_ok=True)
            ts = __import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = export_dir / f"export_{ts}.json"

            export_data = {
                "project": project_name,
                "exported_at": __import__("datetime").datetime.now().isoformat(),
                "nodes": nodes_data,
                "edges": edges_data,
                "assets": assets_data,
            }
            filepath.write_text(json.dumps(export_data, ensure_ascii=False, indent=2), encoding="utf-8")

            return JSONResponse({"ok": True, "file": str(filepath), "message": f"导出成功: {project_name}"})
        except Exception as e:
            return JSONResponse({"error": f"导出失败: {str(e)}"}, status_code=500)

    return app
