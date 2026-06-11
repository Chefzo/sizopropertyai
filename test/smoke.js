// Smoke test: fires 5 message types at the loop in MOCK mode and prints routing.
// Run: MOCK=true node test/smoke.js
process.env.MOCK = 'true';
require('dotenv').config();

const { classify } = require('../lib/classifier');
const { draftReply, CONFIDENCE_FLOOR } = require('../lib/agent');

const CASES = [
  { name: 'Wifi question', body: "Hey! What's the wifi password?", expect: 'AUTO' },
  { name: 'Local rec', body: 'Any good pizza spots nearby?', expect: 'AUTO' },
  { name: 'Maintenance', body: 'The AC is not working and it is 90 degrees in here', expect: 'ESCALATE' },
  { name: 'Refund demand', body: 'This is unacceptable, I want a refund', expect: 'ESCALATE' },
  { name: 'Booking change', body: 'Can we extend one extra night?', expect: 'ESCALATE' },
];

(async () => {
  let pass = 0;
  for (const c of CASES) {
    const { route, trigger } = classify(c.body);
    const draft = await draftReply({ unitSlug: 'pilot-unit', guestName: 'Jake', messageBody: c.body });
    const finalRoute = route === 'ESCALATE' || draft.confidence < CONFIDENCE_FLOOR ? 'ESCALATE' : 'AUTO';
    const ok = finalRoute === c.expect;
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${c.name} -> ${finalRoute}${trigger ? ` [${trigger}]` : ''}`);
  }
  console.log(`\n${pass}/${CASES.length} routing cases passed`);
  process.exit(pass === CASES.length ? 0 : 1);
})();
