# BestDoctor

轻量实时找医生 PoC。

```
用户描述症状
→ AI 提取城市 / 科室 / 症状
→ 健康160搜索候选医生
→ 拉评价统计
→ AI 基于真实数据生成候选说明
```

## 当前架构

- TypeScript + Hono
- Cheerio 抓取健康160公开页面
- AI Provider 可切换
- 支持 OpenAI-compatible API
- Node 20+
- 不建持久化数据库
- 健康160页面 10 分钟内存缓存

AI 业务代码不再绑定某一家模型服务。

配置统一使用：

```bash
AI_PROVIDER=deepseek
AI_API_KEY=...
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

也可以替换为通义千问或其他 OpenAI-compatible API。

## 本地运行

```bash
npm install
cp .env.example .env
# 修改 .env 中的 API 配置
set -a && source .env && set +a
npm run dev
```

浏览器打开：

```text
http://localhost:3000
```

## Chat API

```bash
curl -X POST 'http://localhost:3000/chat' \
  -H 'content-type: application/json' \
  -d '{"city":"深圳","message":"最近经常头晕，偶尔手麻，应该找什么医生？"}'
```

## 腾讯云 CVM 部署

完整操作文档：

**[DEPLOY_CVM.md](./DEPLOY_CVM.md)**

部署目标：

```
腾讯云大陆 CVM
→ Nginx
→ BestDoctor Node/Hono
   ├─ 网页
   ├─ /chat
   ├─ 健康160实时数据
   └─ 可替换 AI Provider
```

## 原始数据接口

```text
GET /health160/search
GET /health160/doctor
GET /health160/reviews
```

## 当前 MVP 限制

- 城市识别先覆盖常见城市
- 已明确验证的健康160科室编码目前只有神经内科 `A05`
- 其他科室暂时走通用医生搜索，后续需要逐个补齐科室映射
- 不做账号、聊天历史和数据库
- 只读取公开页面，不绕过登录、验证码或访问控制
