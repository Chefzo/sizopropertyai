// Airtable is the source of truth. Every message in/out gets logged; escalations
// get their own record so unit_hours (the kill metric) can be computed monthly.
// In MOCK mode, logs to console + a local JSONL file instead.

const fs = require('fs');
const path = require('path');

const MOCK = process.env.MOCK === 'true';
const LOG_FILE = path.join(__dirname, '..', 'test', 'local-log.jsonl');

let base = null;
function getBase() {
  if (!base) {
    const Airtable = require('airtable');
    base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  }
  return base;
}

async function logMessage({ unitSlug, guestName, direction, body, aiDrafted, autoSent, confidence, escalated, trigger }) {
  const record = {
    unit: unitSlug,
    guest_name: guestName,
    direction,
    body,
    ai_drafted: !!aiDrafted,
    auto_sent: !!autoSent,
    confidence: confidence ?? null,
    escalated: !!escalated,
    trigger: trigger || null,
    timestamp: new Date().toISOString(),
  };

  if (MOCK) {
    fs.appendFileSync(LOG_FILE, JSON.stringify({ table: 'messages', ...record }) + '\n');
    return { id: 'mock-msg-' + Date.now() };
  }

  const created = await getBase()('messages').create([{ fields: record }]);
  return created[0];
}

async function logEscalation({ messageId, unitSlug, trigger, suggestedReply }) {
  const record = {
    message_id: messageId,
    unit: unitSlug,
    trigger_type: trigger,
    suggested_reply: suggestedReply,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  if (MOCK) {
    fs.appendFileSync(LOG_FILE, JSON.stringify({ table: 'escalations', ...record }) + '\n');
    return { id: 'mock-esc-' + Date.now() };
  }

  const created = await getBase()('escalations').create([{ fields: record }]);
  return created[0];
}

module.exports = { logMessage, logEscalation };
