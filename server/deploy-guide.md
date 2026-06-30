# AURA 激活上报服务 - Linux 部署指南

## 前置条件

- 一台 Linux 服务器（CentOS 7/8 或 Ubuntu 20.04+）
- Python 3.8+
- 能连到公网（或者至少能被 AURA 客户端访问到）

## 部署步骤

### 1. 上传代码

本地打包成 tar 或用 scp 上传：

```bash
# 在本机打包 server 目录
cd F:\灵山出图\chaoge-ai-studio-v2
tar czf aura-server.tar.gz server/

# 上传到 Linux 服务器（替换成你的 IP）
scp aura-server.tar.gz root@你的服务器IP:/root/

# SSH 连上服务器
ssh root@你的服务器IP
```

### 2. 在服务器上安装

```bash
# 解压
cd /root
tar xzf aura-server.tar.gz
cd server

# 安装依赖
pip install -r requirements.txt

# 测试运行
python app.py
```

能看到 `[AURA 激活上报服务] 启动中...` 字样说明成功。

### 3. 配置为系统服务（推荐）

按 Ctrl+C 停掉刚才的测试进程，然后创建 systemd 服务：

```bash
# 先找到 python 的绝对路径
which python3 || which python
# 记下输出，假设是 /usr/bin/python3

# 然后创建服务文件
cat > /etc/systemd/system/aura-report.service << 'EOF'
[Unit]
Description=AURA Studio Activation Report Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/server
ExecStart=/usr/bin/python3 /root/server/app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 重载 systemd 并启动
systemctl daemon-reload
systemctl enable aura-report
systemctl start aura-report

# 检查状态
systemctl status aura-report
```

### 4. 开放防火墙端口

```bash
# CentOS
firewall-cmd --add-port=5000/tcp --permanent
firewall-cmd --reload

# Ubuntu
ufw allow 5000/tcp
```

### 5. 验证服务运行

```bash
# 健康检查
curl http://localhost:5000/health

# 模拟上报
curl -X POST http://localhost:5000/api/report-activation \
  -H "Content-Type: application/json" \
  -d '{"machine_code":"AURA-TEST123456","license_code":"AURA-TEST123456-FDXLOLP2","version":"2.0.0"}'

# 查看面板（把 token 换成你的）
curl "http://localhost:5000/dashboard?token=aura-admin-2026"
```

### 6. 配置 AURA 客户端

你需要在打包 AURA 时设置环境变量：

```bash
# 在打包命令之前设置
export AURA_REPORT_URL="http://你的服务器IP:5000"

# 然后运行打包
npm run dist
```

或者在 `backend/license.py` 中直接修改 `_ACTIVATION_REPORT_URL` 常量。

### 常用管理命令

```bash
systemctl start aura-report    # 启动
systemctl stop aura-report     # 停止
systemctl restart aura-report  # 重启
systemctl status aura-report   # 查看状态
journalctl -u aura-report -f   # 查看实时日志
```

## 可选：用 nginx 反代（添加 HTTPS）

如果你想用域名 + HTTPS（推荐），配 nginx：

```bash
# 安装 nginx
yum install nginx  # CentOS
# apt install nginx  # Ubuntu

# 配置反代
cat > /etc/nginx/conf.d/aura-report.conf << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

systemctl restart nginx
```

然后用 certbot 加 HTTPS。
