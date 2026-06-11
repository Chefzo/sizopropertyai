// Pre-arrival sequence: on reservation.created, schedule the full guest cadence.
// A 60s tick sends anything due. Times are computed from check-in/check-out dates.

const { insert, list, update } = require('./store');
const { sendToGuest } = require('./hospitable');
const { logMessage } = require('./airtable');

const SEQUENCE = [
  { key: 'confirmation', offsetHours: 0, anchor: 'booked', body: (g) =>
    `Hey ${g.guestName} — you're all set for ${g.checkIn.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. We'll send check-in details a couple days before arrival. Questions anytime, just message here.` },
  { key: 'checkin_info', offsetHours: -48, anchor: 'checkin', body: (g) =>
    `${g.guestName} — quick heads up, check-in is ${g.checkIn.toLocaleDateString('en-US', { weekday: 'long' })} at 4 PM. Full access details (door code, parking, wifi) land here the morning of arrival.` },
  { key: 'day_of', offsetHours: -7, anchor: 'checkin', body: (g) =>
    `Today's the day. Check-in opens at 4 PM — your door code and everything you need: ${g.accessNote || 'see your check-in guide in the listing'}. Safe travels.` },
  { key: 'mid_stay', offsetHours: 24, anchor: 'checkin', body: (g) =>
    `Hope you're settled in, ${g.guestName}. Anything not right with the place, tell us now and we'll fix it — that's what we're here for.` },
  { key: 'checkout_reminder', offsetHours: -15, anchor: 'checkout', body: (g) =>
    `${g.guestName} — checkout tomorrow at 11 AM. Nothing fancy required: trash in the bin, dishes in the sink, door locked behind you.` },
  { key: 'review_ask', offsetHours: 6, anchor: 'checkout', body: (g) =>
    `Thanks for staying with us, ${g.guestName}. If everything was right, a review genuinely helps a small local operation like ours. Hope to host you again.` },
];

async function scheduleSequence({ unitSlug, guestName, conversationId, checkIn, checkOut, accessNote }) {
  const anchors = { booked: new Date(), checkin: new Date(checkIn), checkout: new Date(checkOut) };
  const guest = { guestName, checkIn: anchors.checkin, checkOut: anchors.checkout, accessNote };

  for (const step of SEQUENCE) {
    const sendAt = new Date(anchors[step.anchor].getTime() + step.offsetHours * 3600 * 1000);
    if (sendAt < new Date() && step.key !== 'confirmation') continue; // never backfill stale steps
    await insert('scheduled_messages', {
      unit: unitSlug,
      guest_name: guestName,
      conversation_id: conversationId,
      step: step.key,
      body: step.body(guest),
      send_at: sendAt.toISOString(),
      status: 'pending',
    });
  }
}

async function tick() {
  const due = await list('scheduled_messages', (m) => m.status === 'pending' && new Date(m.send_at) <= new Date());
  for (const msg of due) {
    try {
      await sendToGuest({ conversationId: msg.conversation_id, body: msg.body });
      await logMessage({
        unitSlug: msg.unit, guestName: msg.guest_name, direction: 'outbound',
        body: msg.body, aiDrafted: false, autoSent: true, escalated: false, trigger: `sequence:${msg.step}`,
      });
      await update('scheduled_messages', msg.id, { status: 'sent', sent_at: new Date().toISOString() });
    } catch (err) {
      console.error(`Sequence send failed (${msg.id}):`, err.message);
      await update('scheduled_messages', msg.id, { status: 'failed' });
    }
  }
  return due.length;
}

function startScheduler() {
  setInterval(() => tick().catch((e) => console.error('Scheduler tick error:', e.message)), 60 * 1000);
  console.log('Pre-arrival scheduler running (60s tick)');
}

module.exports = { scheduleSequence, tick, startScheduler, SEQUENCE };
