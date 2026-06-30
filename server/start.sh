#!/bin/bash
# AURA Studio 激活上报服务 - 一键启动（在轻量服务器上跑）
# 使用方式:
#   chmod +x start.sh && ./start.sh

set -e

echo "==> 安装依赖..."
pip install -r requirements.txt -q

echo "==> 启动服务..."
echo "    面板地址: http://$(curl -s ifconfig.me):5000/dashboard?token=aura-admin-2026"
echo "    API地址: POST http://$(curl -s ifconfig.me):5000/api/report-activation"

python app.py
