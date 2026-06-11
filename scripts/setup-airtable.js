// One-shot setup: creates the SiZo tables in your Airtable base via the Meta API.
// Needs a PAT with scopes: schema.bases:write, data.records:write on the base.
// Run: node scripts/setup-airtable.js

require('dotenv').config();

const TABLES = [
  { name: 'messages', fields: [
    { name: 'unit', type: 'singleLineText' },
    { name: 'guest_name', type: 'singleLineText' },
    { name: 'direction', type: 'singleLineText' },
    { name: 'body', type: 'multilineText' },
    { name: 'ai_drafted', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'auto_sent', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'confidence', type: 'number', options: { precision: 2 } },
    { name: 'escalated', type: 'checkbox', options: { icon: 'check', color: 'redBright' } },
    { name: 'trigger', type: 'singleLineText' },
    { name: 'timestamp', type: 'singleLineText' },
  ]},
  { name: 'escalations', fields: [
    { name: 'message_id', type: 'singleLineText' },
    { name: 'unit', type: 'singleLineText' },
    { name: 'trigger_type', type: 'singleLineText' },
    { name: 'suggested_reply', type: 'multilineText' },
    { name: 'status', type: 'singleLineText' },
    { name: 'created_at', type: 'singleLineText' },
  ]},
  { name: 'turnovers', fields: [
    { name: 'unit', type: 'singleLineText' },
    { name: 'checkout_date', type: 'singleLineText' },
    { name: 'status', type: 'singleLineText' },
    { name: 'claimed_by', type: 'singleLineText' },
    { name: 'claimed_at', type: 'singleLineText' },
    { name: 'completed_at', type: 'singleLineText' },
    { name: 'notes', type: 'singleLineText' },
  ]},
  { name: 'scheduled_messages', fields: [
    { name: 'unit', type: 'singleLineText' },
    { name: 'guest_name', type: 'singleLineText' },
    { name: 'conversation_id', type: 'singleLineText' },
    { name: 'step', type: 'singleLineText' },
    { name: 'body', type: 'multilineText' },
    { name: 'send_at', type: 'singleLineText' },
    { name: 'sent_at', type: 'singleLineText' },
    { name: 'status', type: 'singleLineText' },
  ]},
];

(async () => {
  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env first.');
    process.exit(1);
  }

  const existing = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  }).then((r) => r.json());

  const existingNames = (existing.tables || []).map((t) => t.name);

  for (const table of TABLES) {
    if (existingNames.includes(table.name)) {
      console.log(`exists: ${table.name}`);
      continue;
    }
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(table),
    });
    const data = await res.json();
    console.log(res.ok ? `created: ${table.name}` : `FAILED ${table.name}: ${JSON.stringify(data.error)}`);
  }
  console.log('\nAirtable base ready.');
})();
