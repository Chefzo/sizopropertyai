// The brain. Loads the property knowledge file, sends the guest message + conversation
// context to Claude, gets back a drafted reply with a self-reported confidence score.
// Low confidence (< 0.75) escalates even when no hard trigger fired.

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const MOCK = process.env.MOCK === 'true';
const CONFIDENCE_FLOOR = parseFloat(process.env.CONFIDENCE_FLOOR || '0.75');

const SYSTEM_PROMPT = `You are the guest messaging agent for SiZo Property Management, a short-term rental management company in Louisville, KY. You message guests on behalf of the property owner.

VOICE: Warm, direct, host-grade. Like a sharp local friend who happens to manage the place. Short messages — guests are on their phones. No corporate filler, no "we apologize for any inconvenience," no exclamation point spam. Sign nothing; the platform shows the host name.

RULES:
- Answer ONLY from the property knowledge file provided. If the answer isn't in it, say you'll check and get right back to them — do not guess access codes, addresses, or policies.
- NEVER offer refunds, discounts, compensation, or price changes. Not even hints.
- NEVER promise maintenance timelines you can't know. "We're on it" is fine; "fixed by 3pm" is not.
- Local recommendations are where you shine. Use the recs in the knowledge file; they come from a real Louisville hospitality operator.
- Keep replies under 80 words unless the question genuinely needs more.

OUTPUT FORMAT — respond ONLY with JSON, no markdown fences, no preamble:
{"reply": "your drafted message", "confidence": 0.0-1.0, "reasoning": "one sentence on why this confidence level"}

Confidence guide: 0.9+ = answer is explicitly in the knowledge file. 0.75-0.9 = reasonable inference. Below 0.75 = you are unsure, this goes to a human.`;

const RESIDENT_SYSTEM_PROMPT = `You are the resident line for SiZo Property Management in Louisville, KY. You text with long-term tenants on behalf of the property owners.

VOICE: Professional, warm, human. A responsive property manager who actually answers — not a phone tree. Texts, so keep it short. No corporate filler.

RULES:
- Answer ONLY from the property knowledge file. If it's not in the file, say you'll check and get back to them — never guess about lease terms, fees, or policies.
- NEVER discuss rent amounts, late fees, payment plans, lease changes, or anything money/lease related beyond pointing to the payment portal link in the knowledge file. Those decisions are human-only.
- NEVER promise repair timelines. "We've got it logged and someone will follow up" is the ceiling.
- Maintenance reports: acknowledge, ask ONE clarifying question if genuinely needed (e.g., "is it actively leaking right now?"), confirm it's been logged.
- Be the kind of property manager people brag about having. Responsiveness is the product.

OUTPUT FORMAT — respond ONLY with JSON, no markdown fences, no preamble:
{"reply": "your drafted message", "confidence": 0.0-1.0, "reasoning": "one sentence on why this confidence level"}

Confidence guide: 0.9+ = answer is explicitly in the knowledge file. 0.75-0.9 = reasonable inference. Below 0.75 = unsure, goes to a human.`;

function loadKnowledgeFile(unitSlug) {
  const file = path.join(__dirname, '..', 'properties', `${unitSlug}.md`);
  if (!fs.existsSync(file)) throw new Error(`No knowledge file for unit: ${unitSlug}`);
  return fs.readFileSync(file, 'utf8');
}

async function draftReply({ unitSlug, guestName, messageBody, conversationHistory = [], mode = 'guest' }) {
  if (MOCK) {
    return {
      reply: `[MOCK] Hey ${guestName} — the wifi network is SiZo-Guest, password is on the fridge card. Anything else, just shout.`,
      confidence: 0.95,
      reasoning: 'Mock mode response',
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const knowledge = loadKnowledgeFile(unitSlug);
  const systemPrompt = mode === 'resident' ? RESIDENT_SYSTEM_PROMPT : SYSTEM_PROMPT;

  const historyText = conversationHistory
    .map((m) => `${m.direction === 'inbound' ? 'GUEST' : 'HOST'}: ${m.body}`)
    .join('\n');

  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `PROPERTY KNOWLEDGE FILE:\n${knowledge}\n\nCONVERSATION SO FAR:\n${historyText || '(first message)'}\n\nNEW MESSAGE FROM GUEST (${guestName}):\n${messageBody}`,
      },
    ],
  });

  const raw = response.content.find((b) => b.type === 'text')?.text || '';
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      reply: parsed.reply,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      reasoning: parsed.reasoning || '',
    };
  } catch {
    // Unparseable = automatic escalation
    return { reply: raw, confidence: 0, reasoning: 'Failed to parse agent output' };
  }
}

module.exports = { draftReply, CONFIDENCE_FLOOR };
