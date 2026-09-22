# BestDoctor

轻量实时找医生 PoC。

```
症状/城市
→ 科室/关键词
→ 健康160候选医生
→ 医生详情 + 评分/评价数/粉丝
→ 评论分页
→ 返回候选
```

## 技术栈

- TypeScript
- Hono
- Cheerio
- Node 20+
- 不建持久化医生数据库
- 实时请求 + 10 分钟内存缓存

## Run

```bash
npm install
npm run dev
```

服务默认：

```
http://localhost:3000
```

## APIs

评论 + 评价统计：

```bash
curl 'http://localhost:3000/health160/reviews?doctor_id=201168124&page=1'
```

医生详情：

```bash
curl 'http://localhost:3000/health160/doctor?doc_id=200444630&unit_id=111&dep_id=3894'
```

深圳神经内科：

```bash
curl 'http://localhost:3000/health160/search?city=sz&department_code=A05'
```

## Next

1. 症状文本 → 科室/疾病关键词
2. 并发补齐候选医生详情和评价
3. 输出 3–5 个可解释候选
4. 再接 Skill
