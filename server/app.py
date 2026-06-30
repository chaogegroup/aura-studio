"""
AURA Studio 激活上报服务

轻量级服务器，接收客户端激活上报，提供管理面板。
跑在 68元/年的轻量服务器上就行。

部署方式：
    pip install -r requirements.txt
    python app.py

然后配 nginx 反代或直接访问 http://IP:5000
"""

import sqlite3
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone

from flask import Flask, request, jsonify, render_template, g

# ===== 配置 =====
DB_PATH = Path(__file__).parent / "data" / "activations.db"
HOST = "0.0.0.0"
PORT = 5000

# 仪表盘访问密钥（简单防爬，改成你自己的）
DASHBOARD_TOKEN = "aura-admin-2026"

# ===== 数据库 =====
app = Flask(__name__)


def get_db():
    if "db" not in g:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(str(DB_PATH))
        g.db.row_factory = sqlite3.Row
        g.db.execute("""
            CREATE TABLE IF NOT EXISTS activations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                machine_code TEXT NOT NULL,
                license_code TEXT NOT NULL,
                version TEXT,
                ip TEXT,
                user_agent TEXT,
                activated_at TEXT NOT NULL
            )
        """)
        g.db.execute("""
            CREATE TABLE IF NOT EXISTS license_stats (
                license_code TEXT PRIMARY KEY,
                machine_count INTEGER DEFAULT 1,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL
            )
        """)
        g.db.commit()
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ===== API: 激活上报（客户端调用） =====

@app.route("/api/report-activation", methods=["POST"])
def report_activation():
    """
    客户端激活成功后，异步上报一次。

    请求体：
    {
        "machine_code": "AURA-XXXXXXXXXX",
        "license_code": "AURA-XXXXXXXXXX-XXXXXXXX",
        "version": "2.0.0"
    }

    说明：
    - 不上报不影响激活，纯数据收集
    - 不上报不影响激活
    - 不上报不影响激活
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"ok": False, "error": "无效的请求体"}), 400

    machine_code = (data.get("machine_code") or "").strip()
    license_code = (data.get("license_code") or "").strip()
    version = (data.get("version") or "").strip()

    if not machine_code or not license_code:
        return jsonify({"ok": False, "error": "缺少必要字段"}), 400

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
    ua = request.headers.get("User-Agent", "")

    db = get_db()

    # 记录本次激活
    db.execute(
        "INSERT INTO activations (machine_code, license_code, version, ip, user_agent, activated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (machine_code, license_code, version, ip, ua, now),
    )

    # 更新授权码统计
    row = db.execute(
        "SELECT machine_count FROM license_stats WHERE license_code = ?",
        (license_code,),
    ).fetchone()
    if row:
        # 新的机器码才计数
        existing = db.execute(
            "SELECT COUNT(*) as cnt FROM activations WHERE license_code = ? AND machine_code = ?",
            (license_code, machine_code),
        ).fetchone()
        if existing and existing["cnt"] <= 1:
            db.execute(
                "UPDATE license_stats SET machine_count = machine_count + 1, last_seen = ? WHERE license_code = ?",
                (now, license_code),
            )
        else:
            db.execute(
                "UPDATE license_stats SET last_seen = ? WHERE license_code = ?",
                (now, license_code),
            )
    else:
        db.execute(
            "INSERT INTO license_stats (license_code, machine_count, first_seen, last_seen) VALUES (?, 1, ?, ?)",
            (license_code, now, now),
        )

    db.commit()
    return jsonify({"ok": True})


# ===== 管理面板 =====

@app.route("/dashboard")
def dashboard():
    token = request.args.get("token", "")
    if token != DASHBOARD_TOKEN:
        return "Unauthorized", 401

    db = get_db()

    # 总览
    total_activations = db.execute(
        "SELECT COUNT(*) as cnt FROM activations"
    ).fetchone()["cnt"]
    total_machines = db.execute(
        "SELECT COUNT(DISTINCT machine_code) as cnt FROM activations"
    ).fetchone()["cnt"]
    total_licenses = db.execute(
        "SELECT COUNT(*) as cnt FROM license_stats"
    ).fetchone()["cnt"]

    # 授权码使用排行
    top_licenses = db.execute(
        """SELECT license_code, machine_count, first_seen, last_seen
           FROM license_stats
           ORDER BY machine_count DESC
           LIMIT 50"""
    ).fetchall()

    # 最近激活
    recent = db.execute(
        """SELECT machine_code, license_code, version, ip, activated_at
           FROM activations
           ORDER BY id DESC
           LIMIT 100"""
    ).fetchall()

    return render_template(
        "dashboard.html",
        total_activations=total_activations,
        total_machines=total_machines,
        total_licenses=total_licenses,
        top_licenses=top_licenses,
        recent=recent,
    )


# ===== 健康检查 =====

@app.route("/health")
def health():
    return jsonify({"status": "ok"})


# ===== 启动 =====

if __name__ == "__main__":
    print(f"[AURA 激活上报服务] 启动中...")
    print(f"管理面板: http://localhost:{PORT}/dashboard?token={DASHBOARD_TOKEN}")
    print(f"API 接口: POST http://localhost:{PORT}/api/report-activation")
    print(f"健康检查: GET  http://localhost:{PORT}/health")
    app.run(host=HOST, port=PORT, debug=False)
