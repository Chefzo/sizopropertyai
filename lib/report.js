// Owner report: per-unit monthly stats from the message log, rendered as a clean
// HTML page the owner can read on a phone. This is the retention product —
// owners need to SEE what they're paying for.

const fs = require('fs');
const path = require('path');

const MOCK = process.env.MOCK === 'true';

async function getMonthMessages(unitSlug, year, month) {
  if (MOCK) {
    const p = path.join(__dirname, '..', 'test', 'local-log.jsonl');
    if (!fs.existsSync(p)) return [];
    return fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
      .filter((r) => r.table === 'messages' && r.unit === unitSlug)
      .filter((r) => { const d = new Date(r.timestamp); return d.getFullYear() === year && d.getMonth() === month; });
  }
  const Airtable = require('airtable');
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  const records = await base('messages').select({ filterByFormula: `{unit} = '${unitSlug}'` }).all();
  return records.map((r) => r.fields).filter((r) => {
    const d = new Date(r.timestamp);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

function computeStats(messages) {
  const inbound = messages.filter((m) => m.direction === 'inbound');
  const outbound = messages.filter((m) => m.direction === 'outbound');
  const autoHandled = outbound.filter((m) => m.auto_sent && !m.escalated);
  const escalated = messages.filter((m) => m.escalated);
  return {
    totalInbound: inbound.length,
    totalOutbound: outbound.length,
    autoHandled: autoHandled.length,
    escalations: new Set(escalated.map((m) => m.timestamp)).size,
    autoRate: outbound.length ? Math.round((autoHandled.length / outbound.length) * 100) : 0,
  };
}

function renderReport({ unitSlug, monthLabel, stats }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SiZo — ${unitSlug} ${monthLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--ink:#161A1D;--paper:#fff;--panel:#F6F7F5;--line:#D9DDD6;--tag:#FF5A1F;--ok:#2E5E4E}
*{box-sizing:border-box;margin:0}
body{font-family:Barlow,system-ui,sans-serif;background:var(--panel);color:var(--ink);padding:20px;max-width:640px;margin:0 auto}
.head{border-bottom:3px solid var(--ink);padding-bottom:14px;margin-bottom:20px}
.brand{font-family:'Barlow Condensed';font-weight:700;font-size:15px;letter-spacing:.14em;text-transform:uppercase}
h1{font-family:'Barlow Condensed';font-weight:700;font-size:34px;text-transform:uppercase;letter-spacing:.02em;line-height:1.05;margin-top:6px}
.sub{color:#5a6058;font-size:14px;margin-top:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}
.stat{background:var(--paper);border:1px solid var(--line);padding:16px 14px}
.stat b{display:block;font-family:'Barlow Condensed';font-size:40px;font-weight:700;line-height:1}
.stat span{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5a6058}
.stat.hl b{color:var(--ok)}
.note{background:var(--paper);border:1px solid var(--line);border-left:4px solid var(--tag);padding:14px;font-size:14px;line-height:1.5}
.foot{margin-top:22px;font-size:12px;color:#5a6058;letter-spacing:.06em;text-transform:uppercase}
</style></head><body>
<div class="head"><div class="brand">SiZo Property Management</div><h1>${unitSlug.replace(/-/g, ' ')}</h1><div class="sub">Owner report — ${monthLabel}</div></div>
<div class="grid">
<div class="stat"><b>${stats.totalInbound}</b><span>Messages received</span></div>
<div class="stat hl"><b>${stats.autoRate}%</b><span>Handled instantly</span></div>
<div class="stat"><b>${stats.autoHandled}</b><span>Answered by SiZo agent</span></div>
<div class="stat"><b>${stats.escalations}</b><span>Escalated to our team</span></div>
</div>
<div class="note">Every message gets an answer in seconds, day or night. Anything involving money, maintenance, or your lease comes to a human at SiZo — never decided by software.</div>
<div class="foot">Questions — reply to this report anytime</div>
</body></html>`;
}

async function generateReport(unitSlug, year, month) {
  const messages = await getMonthMessages(unitSlug, year, month);
  const stats = computeStats(messages);
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return renderReport({ unitSlug, monthLabel, stats });
}

module.exports = { generateReport };
