// SiZo Agent — pilot server.
// Flow: Hospitable webhook -> classify -> draft (Claude) -> auto-send OR escalate to Sienna.
// Runs on ENZOWORKSTATION. Expose with a tunnel (cloudflared/ngrok) for webhooks.

require('dotenv').config();
const express = require('express');
const { classify } = require('./lib/classifier');
const { draftReply, CONFIDENCE_FLOOR } = require('./lib/agent');
const { logMessage, logEscalation } = require('./lib/airtable');
const { notifySienna, getPending, clearPending } = require('./lib/escalate');
const { sendToGuest } = require('./lib/hospitable');
const { scheduleSequence, startScheduler } = require('./lib/sequences');
const { insert, list, update } = require('./lib/store');
const { generateReport } = require('./lib/report');
const { BOARD, DASHBOARD } = require('./lib/ui');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded

const UNIT_MAP = JSON.parse(process.env.UNIT_MAP || '{"pilot-unit":"pilot-unit"}');

app.get('/health', (_req, res) => res.json({ ok: true, service: 'sizo-agent' }));

// ---------------------------------------------------------------------------
// Hospitable webhook: inbound guest message
// Configure in Hospitable: Apps -> Webhooks -> message.created
// ---------------------------------------------------------------------------
app.post('/webhook/hospitable', async (req, res) => {
  res.sendStatus(200); // ack immediately; process async

  try {
    const event = req.body?.action || req.body?.event || '';
    const payload = req.body?.data || req.body;

    // --- New booking: schedule the pre-arrival sequence + create the turnover ---
    if (/reservation/i.test(event) && /(created|accepted)/i.test(event)) {
      const listingId = String(payload?.listing_id || payload?.property?.id || '');
      const unitSlug = UNIT_MAP[listingId] || 'pilot-unit';
      const guestName = payload?.guest?.first_name || 'Guest';
      const conversationId = payload?.conversation_id || payload?.conversation?.id;
      const checkIn = payload?.check_in || payload?.arrival_date;
      const checkOut = payload?.check_out || payload?.departure_date;
      if (checkIn && checkOut) {
        await scheduleSequence({ unitSlug, guestName, conversationId, checkIn, checkOut });
        await insert('turnovers', {
          unit: unitSlug, checkout_date: checkOut, status: 'open',
          claimed_by: null, notes: `After ${guestName}'s stay`,
        });
      }
      return;
    }

    // --- Inbound guest message ---
    const messageBody = payload?.body || payload?.message?.body;
    const guestName = payload?.guest?.first_name || payload?.sender?.first_name || 'Guest';
    const conversationId = payload?.conversation_id || payload?.conversation?.id;
    const listingId = String(payload?.listing_id || payload?.property?.id || '');
    const direction = payload?.sender_type || payload?.sender_role || 'guest';

    if (!messageBody || direction === 'host' || direction === 'teammate') return;

    const unitSlug = UNIT_MAP[listingId] || 'pilot-unit';
    await handleInbound({ unitSlug, guestName, messageBody, conversationId });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
});

// ---------------------------------------------------------------------------
// Turnover board + API (cleaners use this on their phones, no login)
// ---------------------------------------------------------------------------
app.get('/board', (_req, res) => res.type('html').send(BOARD));

app.get('/api/turnovers', async (_req, res) => {
  const rows = await list('turnovers');
  rows.sort((a, b) => new Date(a.checkout_date) - new Date(b.checkout_date));
  res.json(rows.filter((t) => t.status !== 'completed' || new Date(t.checkout_date) > new Date(Date.now() - 3 * 86400000)));
});

app.post('/api/turnovers/:id/claim', async (req, res) => {
  const row = await update('turnovers', req.params.id, { claimed_by: req.body.cleaner || 'Cleaner', status: 'claimed', claimed_at: new Date().toISOString() });
  res.json(row);
});

app.post('/api/turnovers/:id/complete', async (req, res) => {
  const row = await update('turnovers', req.params.id, { status: 'completed', completed_at: new Date().toISOString() });
  res.json(row);
});

// ---------------------------------------------------------------------------
// Admin dashboard: live activity feed (Enzo + Sienna)
// ---------------------------------------------------------------------------
app.get('/dashboard', (_req, res) => res.type('html').send(DASHBOARD));

app.get('/api/activity', async (_req, res) => {
  if (process.env.MOCK === 'true') {
    const p = path.join(__dirname, 'test', 'local-log.jsonl');
    if (!fs.existsSync(p)) return res.json([]);
    const rows = fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
      .filter((r) => r.table === 'messages');
    return res.json(rows.reverse().slice(0, 50));
  }
  const Airtable = require('airtable');
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  const records = await base('messages').select({ maxRecords: 50, sort: [{ field: 'timestamp', direction: 'desc' }] }).all();
  res.json(records.map((r) => r.fields));
});

// ---------------------------------------------------------------------------
// Owner report: /report/payne-1304 (current month) or /report/payne-1304/2026/5
// ---------------------------------------------------------------------------
app.get('/report/:unit', async (req, res) => {
  const now = new Date();
  res.type('html').send(await generateReport(req.params.unit, now.getFullYear(), now.getMonth()));
});

app.get('/report/:unit/:year/:month', async (req, res) => {
  res.type('html').send(await generateReport(req.params.unit, parseInt(req.params.year), parseInt(req.params.month)));
});

// ---------------------------------------------------------------------------
// Manual test endpoint: simulate a guest message without Hospitable
// curl -X POST localhost:3000/test/message -H 'Content-Type: application/json' \
//   -d '{"guestName":"Jake","messageBody":"whats the wifi password?"}'
// ---------------------------------------------------------------------------
app.post('/test/message', async (req, res) => {
  const { guestName = 'TestGuest', messageBody, unitSlug = 'pilot-unit' } = req.body;
  if (!messageBody) return res.status(400).json({ error: 'messageBody required' });
  const result = await handleInbound({ unitSlug, guestName, messageBody, conversationId: 'test-convo' });
  res.json(result);
});

// ---------------------------------------------------------------------------
// Twilio webhook: ALL inbound SMS to the SiZo number
// Routes by sender: Sienna -> escalation approvals; known tenant -> resident agent
// TENANT_MAP in .env: {"+15025551234":{"unit":"payne-1304","name":"Tenant Name"}}
// ---------------------------------------------------------------------------
const TENANT_MAP = JSON.parse(process.env.TENANT_MAP || '{}');

app.post('/sms', async (req, res) => {
  const from = req.body.From;
  const text = (req.body.Body || '').trim();

  // --- Sienna: escalation approval flow ---
  if (from === process.env.SIENNA_PHONE) {
    const job = getPending(from);
    if (!job) {
      res.type('text/xml').send('<Response><Message>No pending escalation.</Message></Response>');
      return;
    }
    const replyBody = text === '1' ? job.suggestedReply : text;
    if (job.channel === 'sms') {
      await sendSms(job.replyTo, replyBody);
    } else {
      await sendToGuest({ conversationId: job.conversationId, body: replyBody });
    }
    await logMessage({
      unitSlug: job.unitSlug, guestName: job.guestName, direction: 'outbound',
      body: replyBody, aiDrafted: text === '1', autoSent: false, escalated: true,
    });
    clearPending(from);
    res.type('text/xml').send('<Response><Message>Sent.</Message></Response>');
    return;
  }

  // --- Known tenant: resident line ---
  const tenant = TENANT_MAP[from];
  if (tenant) {
    res.type('text/xml').send('<Response></Response>'); // ack; reply sent async via API
    await handleInbound({
      unitSlug: tenant.unit,
      guestName: tenant.name,
      messageBody: text,
      conversationId: from, // for SMS, the "conversation" is the phone number
      mode: 'resident',
      channel: 'sms',
      replyTo: from,
    });
    return;
  }

  // --- Unknown number ---
  res.type('text/xml').send('<Response><Message>This is the SiZo Property Management line. We don\'t have this number on file — if you\'re a resident, reply with your name and unit address and we\'ll get you set up.</Message></Response>');
});

async function sendSms(to, body) {
  if (process.env.MOCK === 'true') {
    console.log(`--- SMS TO ${to} ---\n${body}\n--------------------`);
    return;
  }
  const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await twilio.messages.create({ from: process.env.TWILIO_PHONE, to, body });
}

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------
async function handleInbound({ unitSlug, guestName, messageBody, conversationId, mode = 'guest', channel = 'hospitable', replyTo = null }) {
  const sendReply = (body) => channel === 'sms' ? sendSms(replyTo, body) : sendToGuest({ conversationId, body });

  // 1. Log inbound
  const inbound = await logMessage({
    unitSlug, guestName, direction: 'inbound', body: messageBody,
    aiDrafted: false, autoSent: false, escalated: false,
  });

  // 2. Hard-trigger classification
  const { route, trigger } = classify(messageBody);

  // 3. Draft a reply either way (escalations include a suggested reply for Sienna)
  const draft = await draftReply({ unitSlug, guestName, messageBody, mode });

  // 4. Route
  const mustEscalate = route === 'ESCALATE' || draft.confidence < CONFIDENCE_FLOOR;

  if (mustEscalate) {
    const reason = trigger || `low_confidence (${draft.confidence})`;
    const esc = await logEscalation({
      messageId: inbound.id, unitSlug, trigger: reason, suggestedReply: draft.reply,
    });
    await notifySienna({
      escalationId: esc.id, unitSlug, guestName, trigger: reason,
      guestMessage: messageBody, suggestedReply: draft.reply, conversationId,
      channel, replyTo,
    });
    // Safety: acknowledge urgent categories so the person isn't left hanging
    const ackTriggers = ['safety', 'maintenance', 'lockout', 'pest'];
    if (ackTriggers.includes(trigger)) {
      const ack = "Thanks for letting us know — we've got it logged and someone will follow up with you shortly.";
      await sendReply(ack);
      await logMessage({ unitSlug, guestName, direction: 'outbound', body: ack, aiDrafted: false, autoSent: true, escalated: true, trigger });
    }
    return { routed: 'ESCALATED', reason, suggestedReply: draft.reply };
  }

  // 5. Auto-send
  await sendReply(draft.reply);
  await logMessage({
    unitSlug, guestName, direction: 'outbound', body: draft.reply,
    aiDrafted: true, autoSent: true, confidence: draft.confidence, escalated: false,
  });
  return { routed: 'AUTO', reply: draft.reply, confidence: draft.confidence };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`sizo-agent running on :${PORT} | mock=${process.env.MOCK === 'true'}`);
  startScheduler();
});
