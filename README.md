# BestDoctor

轻量实时找医生 PoC。

当前只验证数据链路：

```
症状/城市
→ 科室/关键词
→ 健康160候选医生
→ 医生详情 + 评分/评价数/粉丝
→ 评论分页
→ 返回候选
```

## 当前原则

- 不建持久化医生数据库
- 实时请求 + 10 分钟内存缓存
- 只读取公开页面
- 不绕过登录、验证码或访问控制

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Swagger:

```
http://127.0.0.1:8000/docs
```

## APIs

### 评论 + 评价统计

```bash
curl 'http://127.0.0.1:8000/health160/reviews?doctor_id=201168124&page=1'
```

### 医生详情

```bash
curl 'http://127.0.0.1:8000/health160/doctor?doc_id=200444630&unit_id=111&dep_id=3894'
```

### 科室医生搜索

深圳神经内科：

```bash
curl 'http://127.0.0.1:8000/health160/search?city=sz&department_code=A05'
```

## Next

1. 症状文本 → 科室/疾病关键词。
2. 并发补齐候选医生详情和评价。
3. 输出 3–5 个可解释候选。
