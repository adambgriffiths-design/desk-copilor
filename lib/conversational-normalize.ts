/**
 * Informal / STT repair before intent classification (text and voice).
 * Not domain-specific — contractions only.
 */

const INFORMAL_CONTRACTIONS: Array<[RegExp, string]> = [
  [/\bwhats\b/gi, "what's"],
  [/\bwhos\b/gi, "who's"],
  [/\bwheres\b/gi, "where's"],
  [/\bwhens\b/gi, "when's"],
  [/\bhows\b/gi, "how's"],
  [/\bwys\b/gi, "why's"],
  [/\bcant\b/gi, "can't"],
  [/\bwont\b/gi, "won't"],
  [/\bdont\b/gi, "don't"],
];

/** Repair informal contractions so "whats the capital" classifies like "what's the capital". */
export function repairConversationalStt(text: string): string {
  let t = String(text || "").trim();
  if (!t) return t;
  for (const [pattern, replacement] of INFORMAL_CONTRACTIONS) {
    t = t.replace(pattern, replacement);
  }
  return t.replace(/\s+/g, " ").trim();
}

export function normalizeConversationalText(text: string): string {
  return repairConversationalStt(text)
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
