export const homePage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>BestDoctor</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f7f9;color:#111}
    .wrap{max-width:720px;margin:0 auto;padding:24px 16px 80px}.hero{padding:28px 0 18px}.hero h1{margin:0 0 8px;font-size:30px}.sub{color:#666}
    .card{background:#fff;border:1px solid #e8e8e8;border-radius:16px;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.03)}
    select,textarea,button{font:inherit}select,textarea{width:100%;border:1px solid #ddd;border-radius:12px;padding:12px;background:white}
    textarea{min-height:120px;resize:vertical;margin-top:10px}button{width:100%;margin-top:12px;border:0;border-radius:12px;padding:13px;background:#111;color:white;font-weight:600}
    button:disabled{opacity:.5}.answer{white-space:pre-wrap;line-height:1.7}.result{margin-top:16px}.meta{font-size:13px;color:#777;margin-top:12px}
    .loading{display:none;margin-top:16px;color:#666}.error{color:#b42318}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="hero">
      <h1>BestDoctor</h1>
      <div class="sub">描述你的情况，帮你从公开医生信息中筛选候选医生。</div>
    </div>
    <div class="card">
      <select id="city">
        <option>深圳</option><option>广州</option><option>北京</option><option>上海</option>
        <option>长沙</option><option>成都</option><option>杭州</option><option>武汉</option>
      </select>
      <textarea id="message" placeholder="例如：最近经常头晕，偶尔手麻，应该看什么科、找哪些医生？"></textarea>
      <button id="submit">帮我找医生</button>
      <div id="loading" class="loading">正在查询医生数据并分析…</div>
    </div>
    <div id="result" class="card result" style="display:none">
      <div id="answer" class="answer"></div>
      <div id="meta" class="meta"></div>
    </div>
  </main>
<script>
const btn=document.getElementById("submit");
btn.onclick=async()=>{
  const message=document.getElementById("message").value.trim();
  const city=document.getElementById("city").value;
  if(!message)return;
  btn.disabled=true; document.getElementById("loading").style.display="block";
  const result=document.getElementById("result");
  try{
    const r=await fetch("/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message,city})});
    const data=await r.json();
    result.style.display="block";
    document.getElementById("answer").textContent=data.answer||data.error||"没有返回结果";
    document.getElementById("meta").textContent=data.intent ? "识别："+[data.intent.city,data.intent.department,(data.intent.symptoms||[]).join("、")].filter(Boolean).join(" · ") : "";
  }catch(e){
    result.style.display="block"; document.getElementById("answer").textContent="请求失败，请稍后重试。";
  }finally{
    btn.disabled=false; document.getElementById("loading").style.display="none";
  }
};
</script>
</body>
</html>`;
