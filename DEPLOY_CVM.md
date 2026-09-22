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


## 18. 产品交互目标（交接必读）

当前网页不是做成“通用 AI 聊天机器人”，而是“轻问诊式找医生工具”。

核心交互固定为：

```text
用户选择城市
→ 自然语言描述症状
→ AI 只负责结构化理解
→ 健康160搜索真实医生
→ 拉取评价统计
→ AI 基于真实数据生成筛选说明
→ 页面展示医生卡片和来源
```

首页应保持极简：

- 城市
- 症状描述
- “帮我找医生”按钮

结果页当前已经实现：

1. “系统理解”
   - 城市
   - 推测科室
   - 主要症状标签
2. “筛选说明”
   - AI 基于真实医生数据生成
3. “候选医生”
   - 姓名
   - 职称
   - 评分
   - 点评/评价数
   - 预约数（如有）
   - 页面摘要
   - 健康160原始来源链接

设计原则：

- 不强调 GPT / DeepSeek / MCP 等底层技术
- 不展示虚构“AI 推荐分”
- 优先展示可验证的真实数据依据
- 医疗判断保持辅助性质，不替代诊断
- 手机端优先

## 19. 当前已完成工作

当前代码已经完成：

- Hono Node 服务
- 首页网页
- `POST /chat`
- 健康160搜索接口
- 健康160医生详情接口
- 健康160评论/评价接口
- 10 分钟内存缓存
- AI Provider 抽象层
- DeepSeek / 通义 / 自定义 OpenAI-compatible API 配置方式
- 产品型医生结果 UI
- 腾讯云 CVM 部署说明
- PM2 / Nginx / HTTPS 部署步骤

不要重复重写这些基础功能，除非现有实现测试失败。

## 20. 后续开发优先级

后续 AI/开发者按以下优先级工作，不要先做账号、数据库或 App。

### P0：验证并修稳健康160真实数据链路

必须真实测试：

```text
GET /health160/search?city=sz&department_code=A05
GET /health160/reviews?doctor_id=<真实doctor_id>&page=1
GET /health160/doctor?doc_id=...&unit_id=...&dep_id=...
```

重点检查：

- 搜索是否真的返回医生
- 医生姓名是否正确
- doctor_id 是否正确
- 评分、评价数是否正确
- 评论分页是否有效
- 页面结构变化后 parser 是否返回空数据
- 遇到安全验证时服务是否优雅失败而不是崩溃

如果这里不稳定，优先修这里。

### P1：补健康160科室编码映射

当前只确认：

```text
神经内科 = A05
```

下一批优先：

- 心血管内科
- 消化内科
- 呼吸内科
- 内分泌科
- 皮肤科
- 骨科
- 妇科
- 产科
- 儿科
- 眼科
- 耳鼻喉科
- 泌尿外科
- 精神心理

要求：从健康160真实搜索页面确认编码，禁止凭猜测填写。

### P2：做端到端回归样例

至少维护以下类型的测试输入：

```text
深圳，最近头晕手麻
深圳，膝盖疼半年
深圳，孩子反复咳嗽
深圳，月经不规律
深圳，胸闷心慌
深圳，皮肤反复起红疹
```

验收：

- 能识别城市
- 能识别合理科室
- 能返回真实医生候选
- AI 不编造不存在的医生
- 页面不会空白或报 JS 错误

### P3：增强容错

建议补：

- AI 请求 timeout
- AI 请求有限重试
- AI JSON 解析失败 fallback
- 健康160请求 timeout
- 单个医生评价抓取失败不影响整体结果
- 搜索结果为空时的用户提示

## 21. 暂时不要做的事情

当前阶段明确不要优先做：

- 用户账号体系
- 登录注册
- 支付
- 持久化聊天记录
- 医生全量数据库
- 原生 iOS/Android App
- 复杂后台管理系统
- 无限轮 AI 对话
- 自定义推荐分数体系

只有当真实医生查询闭环稳定以后再讨论。

## 22. 下一个执行者的工作方式

如果是另一个 AI 接手：

1. 先读 `AGENTS.md`
2. 再读本文件
3. 运行 `npm install`
4. 运行 `npm run typecheck`
5. 使用真实健康160页面做测试
6. 修 P0，再做 P1
7. 每次修改后重新运行 typecheck
8. 不要自行改变产品方向

核心判断标准只有一个：

> 用户输入“城市 + 症状”后，是否能稳定返回真实、可验证、匹配度合理的医生候选。


## 23. 数据层原则：禁止维护健康160映射表

经过重新调研，后续实现必须遵守：

- 不维护 `深圳 -> sz` 之类城市映射表
- 不维护 `神经内科 -> A05` 之类科室编码表
- 城市站点从健康160公开城市导航动态解析
- 科室名称/编码从健康160公开医生搜索筛选链接动态解析
- 映射允许做运行时缓存，但健康160页面始终是 source of truth

当前数据层新增：

```text
discoverCities()
resolveCitySlug(cityName)
discoverDepartments(citySlug)
resolveDepartmentCode(citySlug, departmentName)
crawlDepartmentDoctors(citySlug, departmentCode)
```

调试 API：

```text
GET /health160/cities
GET /health160/departments?city=深圳
GET /health160/department-doctors?city=深圳&department=神经内科
```

全量医生抓取的原则：

```text
城市 + 科室
→ 动态解析 Health160 科室 code
→ p-1 / p-2 / p-3 ... 顺序枚举
→ 以 doctor_id + unit_id + dep_id 去重
→ 某页为空或不再产生新医生时停止
→ 得到该城市该科室的完整候选池
```

注意：

- 健康160原始排序只用于分页枚举，不作为 BestDoctor 推荐排名。
- BestDoctor 必须在完整候选池上使用自己的评判体系重新计算顺序。
- 在自有评分体系完成之前，不应把健康160第一页直接包装成“推荐医生”。
- 由于健康160页面可能针对不同出口环境返回不同 HTML，部署到 CVM 后必须真实验证动态科室解析；失败时应修 parser，而不是恢复静态映射表。

### 当前已确认的站点行为

调研已验证：

- 健康160医生列表 URL 使用 `cno-<科室编码>`。
- 例如公开搜索结果可见神经内科页面使用 `cno-A05`、心血管内科使用 `cno-A02`、消化内科使用 `cno-A03`。
- 这些例子只用于验证 URL 机制，**不得复制成静态映射表**。
- 神经内科列表公开搜索结果显示数百名医生，并存在 `p-N` 分页，因此全量枚举是可行的数据获取模型。

下一阶段应先在真实 CVM 上验证：

```bash
curl 'http://127.0.0.1:3000/health160/cities'
curl 'http://127.0.0.1:3000/health160/departments?city=深圳'
curl 'http://127.0.0.1:3000/health160/department-doctors?city=深圳&department=神经内科&max_pages=3'
```

先用 `max_pages=3` 验证分页和去重；确认稳定后再跑完整科室池。
