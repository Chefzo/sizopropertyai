// UI pages served by the Express server. Work-order ticket aesthetic:
// ink + paper + key-tag orange. Mobile-first, big tap targets, zero build step.

const SHELL = (title, body) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--ink:#161A1D;--paper:#fff;--panel:#F0F1EE;--line:#D9DDD6;--tag:#FF5A1F;--ok:#2E5E4E;--mut:#5a6058}
*{box-sizing:border-box;margin:0}
body{font-family:Barlow,system-ui,sans-serif;background:var(--panel);color:var(--ink);max-width:680px;margin:0 auto;padding:16px;padding-bottom:40px}
header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid var(--ink);padding-bottom:10px;margin-bottom:16px}
.brand{font-family:'Barlow Condensed';font-weight:700;font-size:14px;letter-spacing:.14em;text-transform:uppercase}
h1{font-family:'Barlow Condensed';font-weight:700;font-size:26px;text-transform:uppercase}
.ticket{background:var(--paper);border:1px solid var(--line);margin-bottom:10px;padding:14px;position:relative}
.ticket::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--line)}
.ticket.urgent::before{background:var(--tag)}
.ticket.done::before{background:var(--ok)}
.t-top{display:flex;justify-content:space-between;align-items:start;gap:8px}
.t-unit{font-family:'Barlow Condensed';font-weight:700;font-size:20px;text-transform:uppercase}
.t-meta{font-size:13px;color:var(--mut);margin-top:2px}
.t-body{font-size:14px;line-height:1.45;margin-top:8px}
.stamp{font-family:'Barlow Condensed';font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;padding:4px 9px;border:2px solid;transform:rotate(-2deg);white-space:nowrap}
.stamp.open{color:var(--tag);border-color:var(--tag)}
.stamp.claimed{color:var(--ink);border-color:var(--ink)}
.stamp.done{color:var(--ok);border-color:var(--ok)}
button{font-family:'Barlow Condensed';font-weight:700;font-size:16px;letter-spacing:.08em;text-transform:uppercase;border:none;padding:14px;width:100%;margin-top:12px;cursor:pointer;background:var(--ink);color:#fff}
button.complete{background:var(--ok)}
.empty{text-align:center;color:var(--mut);padding:48px 16px;font-size:15px}
.tabs{display:flex;gap:8px;margin-bottom:14px}
.tabs a{flex:1;text-align:center;text-decoration:none;color:var(--ink);font-family:'Barlow Condensed';font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;padding:10px;border:1px solid var(--line);background:var(--paper)}
.tabs a.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.msg{font-size:13px;line-height:1.4}
.msg .who{font-weight:600}
.msg .ai{color:var(--ok);font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-left:6px}
.msg .esc{color:var(--tag);font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-left:6px}
.time{font-size:11px;color:var(--mut)}
</style></head><body>${body}</body></html>`;

const BOARD = SHELL('SiZo — Turnovers', `
<header><div><div class="brand">SiZo</div><h1>Turnover Board</h1></div></header>
<div id="list"><div class="empty">Loading…</div></div>
<script>
const CLEANER = localStorage.getItem('sizo_cleaner') || (() => {
  const n = prompt('Your name (shown when you claim a turn):') || 'Cleaner';
  localStorage.setItem('sizo_cleaner', n); return n;
})();
async function load(){
  const r = await fetch('/api/turnovers'); const rows = await r.json();
  const el = document.getElementById('list');
  if(!rows.length){ el.innerHTML = '<div class="empty">No open turnovers. Check back after the next checkout.</div>'; return; }
  el.innerHTML = rows.map(t => {
    const cls = t.status==='completed' ? 'done' : (t.claimed_by ? '' : 'urgent');
    const stamp = t.status==='completed' ? '<span class="stamp done">Done</span>' : (t.claimed_by ? '<span class="stamp claimed">'+t.claimed_by+'</span>' : '<span class="stamp open">Open</span>');
    const btn = t.status==='completed' ? '' : (t.claimed_by
      ? '<button class="complete" onclick="act(\\''+t.id+'\\',\\'complete\\')">Mark cleaned</button>'
      : '<button onclick="act(\\''+t.id+'\\',\\'claim\\')">Claim this turn</button>');
    return '<div class="ticket '+cls+'"><div class="t-top"><div><div class="t-unit">'+t.unit+'</div>'+
      '<div class="t-meta">Checkout '+new Date(t.checkout_date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+(t.notes?' — '+t.notes:'')+'</div></div>'+stamp+'</div>'+btn+'</div>';
  }).join('');
}
async function act(id, action){
  await fetch('/api/turnovers/'+id+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cleaner:CLEANER})});
  load();
}
load(); setInterval(load, 30000);
</script>`);

const DASHBOARD = SHELL('SiZo — Dashboard', `
<header><div><div class="brand">SiZo</div><h1>Activity</h1></div></header>
<div class="tabs"><a class="on" href="/dashboard">Activity</a><a href="/board">Turnovers</a></div>
<div id="feed"><div class="empty">Loading…</div></div>
<script>
async function load(){
  const r = await fetch('/api/activity'); const rows = await r.json();
  const el = document.getElementById('feed');
  if(!rows.length){ el.innerHTML = '<div class="empty">No activity yet. The agent logs every message here the moment the first tenant or guest texts in.</div>'; return; }
  el.innerHTML = rows.map(m => {
    const badge = m.escalated ? '<span class="esc">Escalated'+(m.trigger?' · '+m.trigger:'')+'</span>' : (m.ai_drafted&&m.auto_sent ? '<span class="ai">Agent</span>' : '');
    return '<div class="ticket '+(m.escalated?'urgent':(m.auto_sent?'done':''))+'"><div class="msg">'+
      '<span class="who">'+(m.direction==='inbound'?m.guest_name:'SiZo')+'</span>'+badge+
      '<div style="margin-top:4px">'+m.body+'</div>'+
      '<div class="time">'+new Date(m.timestamp).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' — '+m.unit+'</div>'+
      '</div></div>';
  }).join('');
}
load(); setInterval(load, 15000);
</script>`);

module.exports = { BOARD, DASHBOARD };
