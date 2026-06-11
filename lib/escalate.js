// Escalation: text Sienna the guest message + the agent's suggested reply.
// She replies "1" to approve the suggested reply, or texts her own wording.
// Inbound SMS handling lives in server.js (/sms webhook). MOCK mode prints to console.

const MOCK = process.env.MOCK === 'true';

// In-memory pending escalation map: Sienna's phone -> latest pending escalation.
// Fine for pilot scale (one operator). Move to Airtable lookup if multiple operators.
const pending = new Map();

function getTwilio() {
  const twilio = require('twilio');
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function notifySienna({ escalationId, unitSlug, guestName, trigger, guestMessage, suggestedReply, conversationId }) {
  const body =
    `SiZo ESCALATION [${trigger}] — ${unitSlug}\n` +
    `${guestName}: "${guestMessage}"\n\n` +
    `Suggested reply:\n"${suggestedReply}"\n\n` +
    `Reply 1 to send, or text your own reply.`;

  pending.set(process.env.SIENNA_PHONE, { escalationId, unitSlug, guestName, suggestedReply, conversationId });

  if (MOCK) {
    console.log('--- SMS TO SIENNA ---\n' + body + '\n---------------------');
    return;
  }

  await getTwilio().messages.create({
    from: process.env.TWILIO_PHONE,
    to: process.env.SIENNA_PHONE,
    body,
  });
}

function getPending(fromPhone) {
  return pending.get(fromPhone) || null;
}

function clearPending(fromPhone) {
  pending.delete(fromPhone);
}

module.exports = { notifySienna, getPending, clearPending };
