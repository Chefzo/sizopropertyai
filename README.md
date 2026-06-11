# sizopropertyai
## Resident Line (long-term rentals)

Tenants text the SiZo Twilio number directly — no Hospitable needed. Routing is by sender phone:
Sienna's number = escalation approvals; numbers in `TENANT_MAP` = resident agent; unknown = polite intake prompt.

Resident mode uses its own system prompt and triggers: rent/payment, lease, lockout, pest, and neighbor
issues always escalate. Rent amounts, late fees, and lease changes are hard-coded human-only.

Setup: fill `properties/payne-1304.md`, add the tenant's phone to `TENANT_MAP` in .env, point the
Twilio SMS webhook at `/sms`, give the tenant the number. That's the whole launch.

## Full product surface (v0.3)

| Route | Who | What |
|---|---|---|
| `/webhook/hospitable` | Hospitable | Guest messages + new bookings (auto-schedules pre-arrival sequence, creates turnover) |
| `/sms` | Twilio | Tenant resident line + Sienna's escalation approvals |
| `/board` | Cleaners | Mobile turnover board — claim a turn, mark it cleaned. No login. |
| `/dashboard` | Enzo/Sienna | Live activity feed: every message, who answered it, what escalated |
| `/report/:unit` | Owners | Monthly owner report (messages handled, auto-rate, escalations) |

Pre-arrival sequence (6 steps, auto-scheduled per booking): confirmation → check-in info (-48h) → day-of access → mid-stay check-in → checkout reminder → review ask.

`node scripts/setup-airtable.js` creates all four Airtable tables automatically (PAT needs schema.bases:write).
