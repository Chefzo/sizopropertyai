// Classifies inbound guest messages: AUTO (agent replies) vs ESCALATE (human required).
// Hard triggers always escalate regardless of AI confidence. This list is the safety rail.

const HARD_TRIGGERS = [
  { type: 'maintenance', patterns: [/leak/i, /broken/i, /not working/i, /won'?t (turn on|start|open|lock|unlock)/i, /no (hot )?water/i, /\bAC\b/i, /heat(er|ing)? (is|isn'?t|not)/i, /power('s| is)? out/i, /clog/i, /smell(s)? like gas/i] },
  { type: 'refund', patterns: [/refund/i, /money back/i, /compensat/i, /discount/i, /partial/i, /charge(d)? (me|us)/i] },
  { type: 'complaint', patterns: [/unacceptable/i, /disgusting/i, /dirty/i, /filthy/i, /worst/i, /terrible/i, /unhappy/i, /disappointed/i, /report (you|this)/i, /lawyer/i, /sue/i] },
  { type: 'safety', patterns: [/emergency/i, /fire/i, /injur/i, /hurt/i, /bleed/i, /911/i, /break(\s|-)?in/i, /intruder/i, /unsafe/i, /carbon monoxide/i, /smoke detector/i] },
  { type: 'booking_change', patterns: [/cancel/i, /early check\s?out/i, /leave early/i, /extend/i, /extra night/i, /change (my|our) (dates|reservation)/i] },
  { type: 'damage', patterns: [/damage/i, /broke the/i, /stain/i, /accident/i] },
  // Resident (long-term rental) triggers
  { type: 'rent_payment', patterns: [/rent.{0,20}(late|short|partial|can'?t|wait|behind)/i, /pay.{0,15}(late|next week|partial)/i, /eviction/i, /late fee/i] },
  { type: 'lease', patterns: [/lease/i, /renew/i, /move (out|in)/i, /notice/i, /sublet/i, /roommate/i, /add.{0,15}to the lease/i] },
  { type: 'lockout', patterns: [/locked out/i, /lost.{0,10}key/i, /can'?t get in/i] },
  { type: 'pest', patterns: [/roach/i, /mice/i, /mouse/i, /rats?\b/i, /bed bug/i, /pest/i, /termite/i, /ants? (every|all over|in the)/i] },
  { type: 'neighbor', patterns: [/neighbor/i, /other unit/i, /1304/i, /1306/i, /loud music/i, /police/i] },
];

function classify(messageBody) {
  for (const trigger of HARD_TRIGGERS) {
    if (trigger.patterns.some((p) => p.test(messageBody))) {
      return { route: 'ESCALATE', trigger: trigger.type };
    }
  }
  return { route: 'AUTO', trigger: null };
}

module.exports = { classify, HARD_TRIGGERS };
