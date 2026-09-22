# 腾讯云大陆 CVM 部署手册

适用于当前 BestDoctor 项目。目标是：在腾讯云中国大陆 CVM 上运行网页、Hono 后端、健康160抓取，并可切换国内 AI Provider。

## 1. 推荐服务器

- Ubuntu 22.04 LTS 或 24.04 LTS
- 2 vCPU / 2 GB RAM 起步
- 20 GB 系统盘即可
- 开公网 IPv4
- 安全组开放：
  - 22/TCP：SSH
  - 80/TCP：HTTP
  - 443/TCP：HTTPS
- 不要对公网开放 3000 端口

## 2. 登录服务器

```bash
ssh ubuntu@你的公网IP
```

若系统用户是 root：

```bash
ssh root@你的公网IP
```

## 3. 安装基础软件

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl nginx
```

## 4. 安装 Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

检查：

```bash
node -v
npm -v
```

Node 版本必须 >= 20。

## 5. 安装 PM2

```bash
sudo npm install -g pm2
pm2 -v
```

## 6. 拉取代码

```bash
cd /opt
sudo git clone https://github.com/Norcy/BestDoctor.git bestdoctor
sudo chown -R $USER:$USER /opt/bestdoctor
cd /opt/bestdoctor
```

后续更新代码：

```bash
cd /opt/bestdoctor
git pull origin main
npm install
npm run typecheck
pm2 restart bestdoctor --update-env
```

## 7. 安装依赖

```bash
cd /opt/bestdoctor
npm install
npm run typecheck
```

如果 `npm run typecheck` 失败，不要继续部署。

## 8. 配置 AI Provider

项目支持 OpenAI-compatible API。

创建环境变量目录：

```bash
sudo mkdir -p /etc/bestdoctor
sudo nano /etc/bestdoctor/bestdoctor.env
```

### DeepSeek 示例

```bash
AI_PROVIDER=deepseek
AI_API_KEY=你的APIKey
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
PORT=3000
NODE_ENV=production
```

### 通义千问兼容模式示例

```bash
AI_PROVIDER=qwen
AI_API_KEY=你的APIKey
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=你的模型名
PORT=3000
NODE_ENV=production
```

### 其他 OpenAI-compatible 模型

```bash
AI_PROVIDER=custom
AI_API_KEY=你的APIKey
AI_BASE_URL=https://你的兼容接口/v1
AI_MODEL=模型名
PORT=3000
NODE_ENV=production
```

保存后：

```bash
sudo chmod 600 /etc/bestdoctor/bestdoctor.env
```

说明：

- `AI_PROVIDER` 主要用于标识日志与返回值。
- 真正决定请求地址的是 `AI_BASE_URL`。
- 不要把 API Key 写进 GitHub。
- 不要把 `.env` 上传到仓库。

## 9. 手动运行一次

```bash
set -a
source /etc/bestdoctor/bestdoctor.env
set +a

cd /opt/bestdoctor
npm start
```

正常应看到：

```text
BestDoctor listening on http://localhost:3000
```

另开 SSH 窗口测试：

```bash
curl http://127.0.0.1:3000/healthz
```

必须得到：

```json
{"ok":true}
```

测试网页：

```bash
curl -I http://127.0.0.1:3000/
```

测试 Chat：

```bash
curl -X POST http://127.0.0.1:3000/chat \
  -H 'content-type: application/json' \
  -d '{"city":"深圳","message":"最近经常头晕，偶尔手麻，应该找什么医生？"}'
```

确认：

- HTTP 请求没有崩溃
- 返回 JSON
- JSON 中有 `answer`
- `provider` / `model` 与环境变量一致

测试完成后 Ctrl+C 停止。

## 10. 用 PM2 常驻运行

```bash
cd /opt/bestdoctor

set -a
source /etc/bestdoctor/bestdoctor.env
set +a

pm2 start npm --name bestdoctor -- start
pm2 status
```

日志：

```bash
pm2 logs bestdoctor --lines 100
```

再次检查：

```bash
curl http://127.0.0.1:3000/healthz
```

## 11. PM2 开机自启

```bash
pm2 startup
```

执行 PM2 输出的那条 sudo 命令，然后：

```bash
pm2 save
```

## 12. 配置 Nginx

创建：

```bash
sudo nano /etc/nginx/sites-available/bestdoctor
```

暂时没有域名时：

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

启用：

```bash
sudo ln -sf /etc/nginx/sites-available/bestdoctor /etc/nginx/sites-enabled/bestdoctor
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

`sudo nginx -t` 必须成功。

公网测试：

```bash
curl http://你的公网IP/healthz
```

浏览器访问：

```text
http://你的公网IP/
```

## 13. 配域名和 HTTPS

先把域名 A 记录解析到 CVM 公网 IP。

安装 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
```

把 Nginx 的：

```nginx
server_name _;
```

改成：

```nginx
server_name your-domain.com;
```

然后：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

最终检查：

```text
https://your-domain.com/
https://your-domain.com/healthz
```

## 14. 更新 AI 模型，不改代码

例如从 DeepSeek 改成其他国内 OpenAI-compatible API：

```bash
sudo nano /etc/bestdoctor/bestdoctor.env
```

只改：

```bash
AI_PROVIDER=...
AI_API_KEY=...
AI_BASE_URL=...
AI_MODEL=...
```

然后：

```bash
set -a
source /etc/bestdoctor/bestdoctor.env
set +a
pm2 restart bestdoctor --update-env
```

## 15. 故障排查顺序

### 服务是否活着

```bash
pm2 status
pm2 logs bestdoctor --lines 200
```

### Node 本地接口是否正常

```bash
curl http://127.0.0.1:3000/healthz
```

### Nginx 是否正常

```bash
sudo nginx -t
sudo systemctl status nginx
```

### AI 接口是否配置

```bash
grep -E '^(AI_PROVIDER|AI_BASE_URL|AI_MODEL)=' /etc/bestdoctor/bestdoctor.env
```

不要打印 `AI_API_KEY` 到公开日志。

### 健康160接口测试

```bash
curl 'http://127.0.0.1:3000/health160/search?city=sz&department_code=A05'
```

如果 AI 正常但找医生失败，优先检查健康160页面解析，而不是 AI Provider。

## 16. 验收标准

部署完成必须全部满足：

1. `GET /healthz` 返回 `{"ok":true}`
2. 浏览器能打开首页
3. `POST /chat` 返回 JSON
4. PM2 状态为 online
5. 重启服务器后 PM2 能自动拉起
6. 公网只开放 80/443，不开放 3000
7. API Key 不存在于 Git 仓库
8. `npm run typecheck` 无错误
9. 能通过环境变量切换 AI Provider

## 17. 当前产品限制

- 当前健康160科室编码只确认神经内科 `A05`
- 其他科室仍需继续补映射
- 不保存账号
- 不保存聊天历史
- 不使用持久化数据库
- 健康160使用实时请求 + 内存缓存
