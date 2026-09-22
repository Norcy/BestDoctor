# BestDoctor

轻量实时找医生 PoC。

```
用户描述症状
→ AI 提取城市 / 科室 / 症状
→ 健康160搜索候选医生
→ 拉评价统计
→ AI 基于真实数据生成候选说明
```

## 技术栈

- TypeScript
- Hono
- Cheerio
- OpenAI Responses API
- Node 20+
- 不建持久化数据库
- 健康160页面 10 分钟内存缓存

## 环境变量

```bash
export OPENAI_API_KEY='你的 API Key'
export OPENAI_MODEL='gpt-5.6-luna' # 可选，默认就是这个
```

API Key 只放服务端环境变量，不要写进前端或提交到 GitHub。

## Run

```bash
npm install
npm run dev
```

浏览器打开：

```
http://localhost:3000
```

## Chat API

```bash
curl -X POST 'http://localhost:3000/chat' \
  -H 'content-type: application/json' \
  -d '{"city":"深圳","message":"最近经常头晕，偶尔手麻，应该找什么医生？"}'
```

## 当前 MVP 限制

- 城市识别先覆盖常见城市
- 已明确验证的健康160科室编码目前只有神经内科 `A05`
- 其他科室暂时走通用医生搜索，后续需要逐个补齐科室映射
- 不做账号、聊天历史和数据库
- 只读取公开页面，不绕过登录、验证码或访问控制

## 原始数据接口

```
GET /health160/search
GET /health160/doctor
GET /health160/reviews
```
