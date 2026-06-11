# sizopropertyai
## Resident Line (long-term rentals)

Tenants text the SiZo Twilio number directly — no Hospitable needed. Routing is by sender phone:
Sienna's number = escalation approvals; numbers in `TENANT_MAP` = resident agent; unknown = polite intake prompt.

Resident mode uses its own system prompt and triggers: rent/payment, lease, lockout, pest, and neighbor
issues always escalate. Rent amounts, late fees, and lease changes are hard-coded human-only.

Setup: fill `properties/payne-1304.md`, add the tenant's phone to `TENANT_MAP` in .env, point the
Twilio SMS webhook at `/sms`, give the tenant the number. That's the whole launch.
