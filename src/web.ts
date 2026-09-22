export const homePage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>BestDoctor</title>
  <style>
    :root{--bg:#f6f7f9;--card:#fff;--text:#111827;--muted:#6b7280;--line:#e5e7eb;--soft:#f3f4f6;--brand:#111827}
    *{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text)}
    a{color:inherit}.wrap{max-width:760px;margin:0 auto;padding:24px 16px 72px}
    .hero{padding:28px 2px 18px}.hero h1{margin:0 0 8px;font-size:30px;letter-spacing:-.5px}.hero p{margin:0;color:var(--muted);line-height:1.6}
    .card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 3px 14px rgba(17,24,39,.035)}
    .form-label{display:block;font-size:13px;font-weight:650;margin:0 0 7px}.field+.field{margin-top:14px}
    select,textarea,button{font:inherit}select,textarea{width:100%;border:1px solid #d1d5db;border-radius:12px;padding:12px;background:#fff;color:var(--text);outline:none}
    select:focus,textarea:focus{border-color:#9ca3af;box-shadow:0 0 0 3px rgba(17,24,39,.05)}
    textarea{min-height:124px;resize:vertical;line-height:1.55}
    button{width:100%;margin-top:14px;border:0;border-radius:12px;padding:13px 16px;background:var(--brand);color:#fff;font-weight:700;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}
    .loading{display:none;margin-top:14px;color:var(--muted);font-size:14px}
    .result{display:none;margin-top:16px}.section-title{font-size:14px;font-weight:750;margin:0 0 10px}
    .intent{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.pill{font-size:13px;background:var(--soft);border-radius:999px;padding:7px 10px}
    .answer{white-space:pre-wrap;line-height:1.75;font-size:15px}
    .doctors{display:grid;gap:12px;margin-top:16px}.doctor{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fff}
    .doctor-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.doctor-name{font-weight:800;font-size:17px}.doctor-title{font-size:13px;color:var(--muted);margin-top:3px}
    .score{text-align:right;min-width:72px}.score strong{font-size:18px}.score small{display:block;color:var(--muted);margin-top:2px}
    .summary{font-size:13px;color:#4b5563;line-height:1.6;margin-top:10px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.stat{font-size:12px;color:#4b5563;background:#f9fafb;border:1px solid #eef0f2;border-radius:9px;padding:6px 8px}
    .source{display:inline-block;margin-top:11px;font-size:13px;color:#374151;text-decoration:underline;text-underline-offset:3px}
    .meta{font-size:12px;color:#9ca3af;margin-top:14px}.notice{font-size:12px;color:#9ca3af;line-height:1.6;margin-top:12px}
    .empty{padding:14px;border:1px dashed #d1d5db;border-radius:12px;color:var(--muted);font-size:14px}
    @media (max-width:560px){.wrap{padding-top:12px}.hero{padding-top:18px}.hero h1{font-size:27px}.card{border-radius:15px}.doctor-head{gap:8px}}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="hero">
      <h1>BestDoctor</h1>
      <p>描述你的情况，系统会先判断可能相关科室，再从公开医生信息中筛选候选。</p>
    </div>

    <section class="card">
      <div class="field">
        <label class="form-label" for="city">城市</label>
        <select id="city">
          <option>深圳</option><option>广州</option><option>北京</option><option>上海</option>
          <option>长沙</option><option>郑州</option><option>重庆</option><option>成都</option>
          <option>东莞</option><option>杭州</option><option>苏州</option><option>武汉</option>
          <option>西安</option><option>南京</option>
        </select>
      </div>
      <div class="field">
        <label class="form-label" for="message">描述你的情况</label>
        <textarea id="message" maxlength="2000" placeholder="例如：最近经常头晕，偶尔手麻，持续了两周，想知道应该看什么科、找哪些医生。"></textarea>
      </div>
      <button id="submit">帮我找医生</button>
      <div id="loading" class="loading">正在理解症状、查询医生和评价数据…</div>
      <div class="notice">结果用于辅助筛选医生，不替代线下诊断；医生信息以来源页面实时展示为准。</div>
    </section>

    <section id="result" class="result">
      <div class="card">
        <div class="section-title">系统理解</div>
        <div id="intent" class="intent"></div>
        <div class="section-title">筛选说明</div>
        <div id="answer" class="answer"></div>
        <div id="meta" class="meta"></div>
      </div>

      <div style="height:12px"></div>
      <div class="card">
        <div class="section-title">候选医生</div>
        <div id="doctors" class="doctors"></div>
      </div>
    </section>
  </main>

<script>
const $ = (id) => document.getElementById(id);
const btn = $("submit");

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function renderIntent(intent){
  if(!intent){ $("intent").innerHTML=""; return; }
  const items = [];
  if(intent.city) items.push("城市 · " + intent.city);
  if(intent.department) items.push("科室 · " + intent.department);
  for(const symptom of (intent.symptoms || []).slice(0,5)) items.push(symptom);
  $("intent").innerHTML = items.length
    ? items.map(x => '<span class="pill">'+escapeHtml(x)+'</span>').join("")
    : '<span class="pill">未识别到结构化信息</span>';
}

function renderDoctors(doctors){
  if(!Array.isArray(doctors) || doctors.length===0){
    $("doctors").innerHTML='<div class="empty">暂时没有拿到可展示的医生候选。可以换一种症状描述或稍后重试。</div>';
    return;
  }

  $("doctors").innerHTML = doctors.map((d, i) => {
    const stats = d.review_stats || {};
    const chips = [];
    if(d.review_count != null) chips.push("页面点评 "+d.review_count);
    if(stats.review_count != null) chips.push("评价 "+stats.review_count);
    if(stats.positive_count != null) chips.push("好评 "+stats.positive_count);
    if(d.appointment_count != null) chips.push("预约 "+d.appointment_count);
    const score = d.score ?? stats.score ?? null;
    const source = d.source_url
      ? '<a class="source" target="_blank" rel="noopener noreferrer" href="'+escapeHtml(d.source_url)+'">查看原始来源</a>'
      : "";
    return '<article class="doctor">'
      + '<div class="doctor-head"><div><div class="doctor-name">'+escapeHtml(d.name || ("候选医生 "+(i+1)))+'</div>'
      + '<div class="doctor-title">'+escapeHtml(d.title || "健康160医生")+'</div></div>'
      + '<div class="score">'+(score != null ? '<strong>'+escapeHtml(score)+'</strong><small>评分</small>' : '<small>暂无评分</small>')+'</div></div>'
      + (d.summary ? '<div class="summary">'+escapeHtml(d.summary)+'</div>' : '')
      + (chips.length ? '<div class="stats">'+chips.map(x=>'<span class="stat">'+escapeHtml(x)+'</span>').join("")+'</div>' : '')
      + source
      + '</article>';
  }).join("");
}

btn.onclick = async () => {
  const message = $("message").value.trim();
  const city = $("city").value;
  if(!message){
    $("message").focus();
    return;
  }

  btn.disabled = true;
  $("loading").style.display = "block";
  $("result").style.display = "none";

  try{
    const r = await fetch("/chat",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({message,city})
    });
    const data = await r.json();

    $("result").style.display = "block";
    $("answer").textContent = data.answer || data.error || "没有返回结果";
    renderIntent(data.intent);
    renderDoctors(data.doctors);
    $("meta").textContent = data.provider && data.model
      ? "AI：" + data.provider + " / " + data.model + " · 医生数据来源：健康160公开页面"
      : "医生数据来源：健康160公开页面";
  }catch(e){
    $("result").style.display = "block";
    $("answer").textContent = "请求失败，请稍后重试。";
    $("intent").innerHTML = "";
    $("doctors").innerHTML = '<div class="empty">医生数据暂时无法加载。</div>';
    $("meta").textContent = "";
  }finally{
    btn.disabled = false;
    $("loading").style.display = "none";
  }
};
</script>
</body>
</html>`;
