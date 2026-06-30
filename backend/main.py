"""
AURA Studio — 后端入口
启动 FastAPI 服务监听本地端口
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.app import create_app
import uvicorn

def main():
    app = create_app()
    port = int(os.environ.get("AURA_PORT", "18922"))
    host = os.environ.get("AURA_HOST", "127.0.0.1")
    
    # 清晰显示运行模式
    is_dev = os.environ.get("AURA_DEV") == "1"
    mode = "[DEV] 开发模式 (AURA_DEV=1)" if is_dev else "[PROD] 正式模式"
    print(f"[AURA Backend] {mode}")
    print(f"[AURA Backend] Starting on {host}:{port}")
    
    try:
        uvicorn.run(app, host=host, port=port, log_level="warning")
    except OSError as e:
        if "10048" in str(e) or "address already in use" in str(e).lower():
            print(f"\n{'='*60}")
            print(f"  [ERROR] 端口 {port} 已被占用！")
            print(f"  可能原因：上一个 AURA 后端进程未关闭")
            print(f"  解决方法：")
            print(f"    1. 在任务管理器中找到 python.exe 并结束")
            print(f"    2. 或执行: taskkill /F /IM python.exe")
            print(f"{'='*60}\n")
        raise

if __name__ == "__main__":
    main()
