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
    const payload = req.body?.data || req.body;
    // Hospitable message.created shape (normalize defensively)
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
// Twilio webhook: Sienna's SMS replies (escalation approvals)
// ---------------------------------------------------------------------------
app.post('/sms', async (req, res) => {
  const from = req.body.From;
  const text = (req.body.Body || '').trim();
  const job = getPending(from);

  if (!job) {
    res.type('text/xml').send('<Response><Message>No pending escalation.</Message></Response>');
    return;
  }

  const replyBody = text === '1' ? job.suggestedReply : text;
  await sendToGuest({ conversationId: job.conversationId, body: replyBody });
  await logMessage({
    unitSlug: job.unitSlug, guestName: job.guestName, direction: 'outbound',
    body: replyBody, aiDrafted: text === '1', autoSent: false, escalated: true,
  });
  clearPending(from);
  res.type('text/xml').send('<Response><Message>Sent to guest.</Message></Response>');
});

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------
async function handleInbound({ unitSlug, guestName, messageBody, conversationId }) {
  // 1. Log inbound
  const inbound = await logMessage({
    unitSlug, guestName, direction: 'inbound', body: messageBody,
    aiDrafted: false, autoSent: false, escalated: false,
  });

  // 2. Hard-trigger classification
  const { route, trigger } = classify(messageBody);

  // 3. Draft a reply either way (escalations include a suggested reply for Sienna)
  const draft = await draftReply({ unitSlug, guestName, messageBody });

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
    });
    // Safety: acknowledge safety/maintenance so the guest isn't left hanging
    if (trigger === 'safety' || trigger === 'maintenance') {
      const ack = "Thanks for letting us know — we're on it and someone will follow up with you shortly.";
      await sendToGuest({ conversationId, body: ack });
      await logMessage({ unitSlug, guestName, direction: 'outbound', body: ack, aiDrafted: false, autoSent: true, escalated: true, trigger });
    }
    return { routed: 'ESCALATED', reason, suggestedReply: draft.reply };
  }

  // 5. Auto-send
  await sendToGuest({ conversationId, body: draft.reply });
  await logMessage({
    unitSlug, guestName, direction: 'outbound', body: draft.reply,
    aiDrafted: true, autoSent: true, confidence: draft.confidence, escalated: false,
  });
  return { routed: 'AUTO', reply: draft.reply, confidence: draft.confidence };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`sizo-agent running on :${PORT} | mock=${process.env.MOCK === 'true'}`));
