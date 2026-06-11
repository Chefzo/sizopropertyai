// Outbound: send the reply back to the guest through Hospitable's API.
// Hospitable proxies to Airbnb/VRBO so we never touch platform APIs directly.
// Docs: https://developer.hospitable.com — POST /v2/conversations/{id}/messages

const MOCK = process.env.MOCK === 'true';

async function sendToGuest({ conversationId, body }) {
  if (MOCK) {
    console.log(`--- REPLY TO GUEST (conversation ${conversationId}) ---\n${body}\n------------------------------------------`);
    return { ok: true, mock: true };
  }

  const res = await fetch(`https://public.api.hospitable.com/v2/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HOSPITABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hospitable send failed (${res.status}): ${text}`);
  }
  return res.json();
}

module.exports = { sendToGuest };
