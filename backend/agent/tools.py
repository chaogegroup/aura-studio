"""
AURA 工具集 - 图像生成、视频生成、画布操作
所有 API 调用都通过 AURA 后端代理（/api/image/generate, /api/video/create）
"""

import json
import logging
from .protocol import BaseTool
from pathlib import Path

logger = logging.getLogger("aura-agent")
AURA_HOST = "http://127.0.0.1:18922"


def _load_user_config():
    import sys as _sys
    if getattr(_sys, "frozen", False):
        config_file = Path(_sys.executable).parent / "user_config.json"
    else:
        config_file = Path(__file__).parent.parent.parent / "user_config.json"
    if config_file.exists():
        try:
            return json.loads(config_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def _get_image_api_key():
    cfg = _load_user_config()
    models = cfg.get("models", {})
    img_cfg = models.get("image", {})
    items = img_cfg.get("items", [])
    default_id = img_cfg.get("default", "")
    for it in items:
        if it.get("id") == default_id and it.get("api_key"):
            return it["api_key"]
    return cfg.get("api_key", "")

def _get_video_api_key():
    cfg = _load_user_config()
    models = cfg.get("models", {})
    vid_cfg = models.get("video", {})
    items = vid_cfg.get("items", [])
    default_id = vid_cfg.get("default", "")
    for it in items:
        if it.get("id") == default_id and it.get("api_key"):
            return it["api_key"]
    return cfg.get("api_key", "")

class ImageGenerateTool(BaseTool):
    """文生图工具 - 通过 AURA 后端代理调用"""

    name = "image_generate"
    description = "根据文字描述生成图片。支持多种尺寸和风格。"
    parameters = {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "图片描述（英文效果更好）"
            },
            "size": {
                "type": "string",
                "description": "尺寸: 1024x1024, 1152x768, 768x1024",
                "enum": ["1024x1024", "1152x768", "768x1024", "1344x768", "768x1344"]
            },
            "model": {
                "type": "string",
                "description": "模型名称",
                "default": "agnes-image-2.1-flash"
            }
        },
        "required": ["prompt"]
    }

    def __init__(self, api_key: str = "", api_base: str = "", default_model: str = "agnes-image-2.1-flash"):
        self.api_key = api_key or _get_image_api_key()
        self.default_model = default_model

    def execute(self, params: dict) -> dict:
        import httpx
        prompt = params.get("prompt", "")
        size = params.get("size", "1024x1024")
        model = params.get("model", self.default_model)
        try:
            resp = httpx.post(
                f"{AURA_HOST}/api/image/generate",
                json={"model": model, "prompt": prompt, "size": size,
                      "extra_body": {"response_format": "url"}, "_api_key": self.api_key},
                headers={"Content-Type": "application/json"},
                timeout=120
            )
            resp.raise_for_status()
            data = resp.json()
            url = None
            if data.get("data") and data["data"][0]:
                if data["data"][0].get("url"):
                    url = data["data"][0]["url"]
            if not url and data.get("url"):
                url = data["url"]
            if url:
                return {"url": url, "prompt": prompt, "size": size}
            return {"error": "未收到图片URL", "raw": str(data)[:200]}
        except Exception as e:
            logger.error(f"ImageGenerateTool failed: {e}")
            return {"error": f"图片生成失败: {str(e)}"}


class VideoCreateTool(BaseTool):
    """视频生成工具 - 通过 AURA 后端代理调用"""

    name = "video_create"
    description = "根据文字描述或参考图片生成视频。"
    parameters = {
        "type": "object",
        "properties": {
            "prompt": {"type": "string", "description": "视频描述"},
            "image_url": {"type": "string", "description": "参考图片URL(可选)"},
            "width": {"type": "integer", "description": "视频宽度", "default": 1152},
            "height": {"type": "integer", "description": "视频高度", "default": 768},
            "duration": {"type": "number", "description": "时长(秒)", "default": 5}
        },
        "required": ["prompt"]
    }

    def __init__(self, api_key: str = "", api_base: str = "", default_model: str = "agnes-video-v2.0"):
        self.api_key = api_key or _get_video_api_key()
        self.default_model = default_model

    def execute(self, params: dict) -> dict:
        import httpx
        prompt = params.get("prompt", "")
        image_url = params.get("image_url", "")
        fps = 24
        num_frames = int(params.get("duration", 5) * fps)
        video_model = self.default_model
        try:
            body = {"model": video_model, "prompt": prompt,
                    "width": params.get("width", 1152), "height": params.get("height", 768),
                    "num_frames": num_frames, "frame_rate": fps, "_api_key": self.api_key}
            if image_url:
                body["image"] = image_url
            resp = httpx.post(
                f"{AURA_HOST}/api/video/create",
                json=body, headers={"Content-Type": "application/json"}, timeout=60
            )
            resp.raise_for_status()
            data = resp.json()
            # 新 API 返回 video_id，兼容旧版 id
            video_id = data.get("video_id") or data.get("id") or ""
            if video_id:
                return {"video_id": video_id, "prompt": prompt, "status": "queued"}
            return {"error": "未获取到任务ID", "raw": str(data)[:200]}
        except Exception as e:
            logger.error(f"VideoCreateTool failed: {e}")
            return {"error": f"视频创建失败: {str(e)}"}


class CanvasCreateNodeTool(BaseTool):
    """画布节点创建工具"""

    name = "canvas_create_node"
    description = "在无限画布上创建节点"
    parameters = {
        "type": "object",
        "properties": {
            "node_type": {
                "type": "string",
                "description": "节点类型(text/image/t2i/i2i/t2v/i2v)",
                "enum": ["text", "image", "t2i", "i2i", "t2v", "i2v"]
            },
            "content": {"type": "string", "description": "节点内容"},
            "x": {"type": "number", "description": "X坐标", "default": 200},
            "y": {"type": "number", "description": "Y坐标", "default": 200}
        },
        "required": ["node_type", "content"]
    }

    def execute(self, params: dict) -> dict:
        import time
        return {
            "node_id": f"agent_{int(time.time())}",
            "node_type": params.get("node_type", "text"),
            "content": params.get("content", ""),
            "x": params.get("x", 200), "y": params.get("y", 200),
            "status": "created"
        }




class ReadTool(BaseTool):
    name = "read"
    description = "读取本地文件的内容。支持文本和图片。"
    parameters = {
        "type": "object",
        "properties": {"file_path": {"type": "string", "description": "文件绝对路径"}},
        "required": ["file_path"]
    }
    def execute(self, params):
        import os, base64
        fp = params.get("file_path", "")
        if not fp or not os.path.exists(fp):
            return {"error": f"文件不存在: {fp}"}
        ext = os.path.splitext(fp)[1].lower()
        if ext in ('.png','.jpg','.jpeg','.gif','.webp'):
            with open(fp, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode()
                return {"filename": os.path.basename(fp), "type": f"image/{ext[1:]}", "bytes": len(b64)}
        with open(fp, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read(50000)
            return {"filename": os.path.basename(fp), "content": content[:5000], "bytes": len(content.encode()), "truncated": len(content) > 5000}


class WriteTool(BaseTool):
    name = "write"
    description = "向本地文件写入内容。不存在则创建。"
    parameters = {
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "文件绝对路径"},
            "content": {"type": "string", "description": "要写入的内容"}
        },
        "required": ["file_path", "content"]
    }
    def execute(self, params):
        fp = params.get("file_path", "")
        content = params.get("content", "")
        if not fp:
            return {"error": "file_path 不能为空"}
        try:
            os.makedirs(os.path.dirname(os.path.abspath(fp)), exist_ok=True)
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(content)
            return {"written": True, "path": os.path.abspath(fp), "bytes": len(content.encode("utf-8"))}
        except Exception as e:
            return {"error": str(e)}


class BashTool(BaseTool):
    name = "bash"
    description = "在本地执行 Shell 命令并获取输出。"
    parameters = {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "Shell 命令"},
            "timeout": {"type": "integer", "description": "超时秒数", "default": 30}
        },
        "required": ["command"]
    }
    def execute(self, params):
        import subprocess
        cmd = params.get("command", "")
        timeout = min(params.get("timeout", 30), 120)
        if not cmd:
            return {"error": "command 不能为空"}
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            return {"stdout": result.stdout[:5000], "stderr": result.stderr[:2000], "returncode": result.returncode}
        except subprocess.TimeoutExpired:
            return {"error": f"命令超时({timeout}秒)"}
        except Exception as e:
            return {"error": str(e)}


class ListFilesTool(BaseTool):
    name = "ls"
    description = "列出目录下的文件和子目录。"
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "目录路径", "default": "."},
            "pattern": {"type": "string", "description": "匹配模式如 *.py（可选）"}
        },
        "required": []
    }
    def execute(self, params):
        import glob
        path = params.get("path", ".")
        pattern = params.get("pattern", "")
        try:
            if pattern:
                items = [{"name": os.path.basename(f), "type": "dir" if os.path.isdir(f) else "file", "size": os.path.getsize(f) if os.path.isfile(f) else 0} for f in glob.glob(os.path.join(path, pattern))[:200]]
            else:
                items = [{"name": n, "type": "dir" if os.path.isdir(os.path.join(path, n)) else "file"} for n in os.listdir(path)[:200]]
            return {"path": os.path.abspath(path), "items": items, "count": len(items)}
        except Exception as e:
            return {"error": str(e)}


class EditTool(BaseTool):
    name = "edit"
    description = "编辑文件中指定文本，替换为新的内容。用于修改文件中的特定部分。"
    parameters = {
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "文件绝对路径"},
            "old_text": {"type": "string", "description": "要被替换的旧文本（必须是文件中的唯一匹配）"},
            "new_text": {"type": "string", "description": "替换后的新文本"}
        },
        "required": ["file_path", "old_text", "new_text"]
    }
    def execute(self, params):
        fp = params.get("file_path", "")
        old = params.get("old_text", "")
        new = params.get("new_text", "")
        if not fp or not os.path.exists(fp):
            return {"error": f"文件不存在: {fp}"}
        try:
            with open(fp, 'r', encoding='utf-8') as f:
                content = f.read()
            count = content.count(old)
            if count == 0:
                return {"error": f"未找到匹配的文本: {old[:50]}"}
            if count > 1:
                return {"error": f"找到 {count} 处匹配，需要更精确的匹配文本"}
            content = content.replace(old, new, 1)
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(content)
            return {"edited": True, "path": os.path.abspath(fp), "lines_changed": old.count(chr(10)) + 1}
        except Exception as e:
            return {"error": str(e)}


class GrepTool(BaseTool):
    name = "grep"
    description = "在文件中搜索文本模式。支持正则表达式。"
    parameters = {
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "要搜索的文本或正则模式"},
            "path": {"type": "string", "description": "搜索路径（文件或目录）", "default": "."},
            "glob": {"type": "string", "description": "文件匹配模式如 *.py（可选）"},
            "max_results": {"type": "integer", "description": "最大结果数", "default": 50}
        },
        "required": ["pattern"]
    }
    def execute(self, params):
        import subprocess
        pattern = params.get("pattern", "")
        path = params.get("path", ".")
        glob_pat = params.get("glob", "")
        max_results = min(params.get("max_results", 50), 200)
        if not pattern:
            return {"error": "pattern 不能为空"}
        try:
            cmd = f"grep -rn --include='{glob_pat}' '{pattern}' {path}" if glob_pat else f"grep -rn '{pattern}' {path}"
            if os.name == 'nt':
                cmd = f'findstr /s /n /c:"{pattern}" {path}\\*.*' if not glob_pat else f'findstr /s /n /c:"{pattern}" {path}\\{glob_pat}'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            lines = (result.stdout + result.stderr).split(chr(10))
            matches = [l for l in lines if pattern.lower() in l.lower()][:max_results]
            return {"matches": matches, "count": len(matches)}
        except Exception as e:
            return {"error": str(e)}


class WebFetchTool(BaseTool):
    name = "web_fetch"
    description = "获取网页内容。用于阅读在线文档、文章等。"
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "网页 URL"},
            "max_chars": {"type": "integer", "description": "最大字符数", "default": 5000}
        },
        "required": ["url"]
    }
    def execute(self, params):
        import subprocess
        url = params.get("url", "")
        max_chars = min(params.get("max_chars", 5000), 20000)
        if not url:
            return {"error": "url 不能为空"}
        try:
            result = subprocess.run(f'curl -sL "{url}"', shell=True, capture_output=True, text=True, timeout=30)
            text = result.stdout or result.stderr
            import re
            text = re.sub(r'<[^>]+>', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            return {"content": text[:max_chars], "url": url, "bytes": len(text), "truncated": len(text) > max_chars}
        except Exception as e:
            return {"error": str(e)}


class SystemInfoTool(BaseTool):
    name = "system_info"
    description = "获取本地系统信息（OS、CPU、内存、磁盘等）。"
    parameters = {"type": "object", "properties": {}, "required": []}
    def execute(self, params):
        import platform, subprocess
        try:
            info = {
                "os": f"{platform.system()} {platform.release()}",
                "hostname": platform.node(),
                "python": platform.python_version(),
                "cwd": os.getcwd() if hasattr(os, 'getcwd') else "N/A",
            }
            if os.name == 'nt':
                w = subprocess.run('wmic os get TotalVisibleMemorySize,FreePhysicalMemory /value', shell=True, capture_output=True, text=True, timeout=10)
                for line in w.stdout.split(chr(10)):
                    if 'TotalVisibleMemorySize' in line:
                        info["memory_total_mb"] = int(line.split('=')[1]) // 1024 if '=' in line else 0
                    if 'FreePhysicalMemory' in line:
                        info["memory_free_mb"] = int(line.split('=')[1]) // 1024 if '=' in line else 0
            return info
        except Exception as e:
            return {"error": str(e)}


class MemorySearchTool(BaseTool):
    name = "memory_search"
    description = "搜索 Agent 的上下文记忆。用于查找之前对话中的信息。"
    parameters = {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "搜索关键词"}},
        "required": ["query"]
    }
    def execute(self, params):
        query = params.get("query", "")
        if not query:
            return {"error": "query 不能为空"}
        try:
            import httpx
            resp = httpx.post(f"{AURA_HOST}/api/agent/knowledge/search",
                json={"query": query}, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return {"results": data[:10] if isinstance(data, list) else [], "count": len(data) if isinstance(data, list) else 0}
            return {"results": [], "count": 0}
        except Exception:
            return {"results": [], "count": 0, "note": "memory search unavailable"}


def create_default_tools(api_key: str, api_base: str = "", models_config: dict = None) -> list:
    """创建默认工具集。

    models_config 新结构: {"image":{"default":"id","items":[{id,api_base,api_key,model}]}, ...}
    图片/视频工具使用对应类别默认条目的 model/api_base/api_key（空则回退全局）。
    """
    models_config = models_config or {}

    def _pick(category, default_model):
        cat = models_config.get(category, {})
        items = cat.get("items", [])
        default_id = cat.get("default", "")
        for it in items:
            if it.get("id") == default_id:
                return it
        return items[0] if items else {"model": default_model, "api_base": "", "api_key": ""}

    img = _pick("image", "agnes-image-2.1-flash")
    vid = _pick("video", "agnes-video-v2.0")
    return [
        ImageGenerateTool(
            api_key=img.get("api_key", "") or api_key,
            api_base=img.get("api_base", "") or api_base,
            default_model=img.get("model", "agnes-image-2.1-flash"),
        ),
        VideoCreateTool(
            api_key=vid.get("api_key", "") or api_key,
            api_base=vid.get("api_base", "") or api_base,
            default_model=vid.get("model", "agnes-video-v2.0"),
        ),
        CanvasCreateNodeTool(),
        ReadTool(),
        WriteTool(),
        EditTool(),
        BashTool(),
        ListFilesTool(),
        GrepTool(),
        WebFetchTool(),
        SystemInfoTool(),
        MemorySearchTool(),
    ]
