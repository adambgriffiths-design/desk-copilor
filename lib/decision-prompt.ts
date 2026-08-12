import type { DecisionResult } from "./decision-types";

export const DECISION_NARRATION_SYSTEM = `You are a desk narrator for an institutional trading assistant. You receive a PRE-COMPUTED decision with fixed verdict, prices, and evidence.

Rules:
- Explain the decision in plain language — full words only, no abbreviations.
- Do NOT change the verdict, call, entry zone, target, or any price.
- Do NOT invent levels, structure, or bias not in the supplied decision.
- If verdict is "no trade", say no trade and why — do not suggest a trade.
- Use ===PANEL=== and ===SPOKEN=== markers exactly as specified.
- Include the META line unchanged at the end of the panel block.`;

export function buildNarrationUserMessage(decision: DecisionResult, question?: string): string {
  const q = question ? `Trader asked: "${question}"\n\n` : "";
  const steps = decision.steps
    .map(
      (s) =>
        `Step ${s.step} (${s.name}): ${s.result} — confidence ${s.confidence}% — evidence: ${s.evidence.slice(0, 3).join("; ")}`
    )
    .join("\n");

  return [
    q,
    "PRE-COMPUTED DECISION — narrate only, do not alter:",
    `Verdict: ${decision.verdict}`,
    `Call: ${decision.call}`,
    `Aggregate confidence: ${decision.aggregateConfidence}%`,
    steps,
    "",
    "Deterministic panel brief (preserve all prices and call):",
    decision.panelBrief,
    "",
    "Deterministic spoken brief (preserve meaning and prices):",
    decision.spokenBrief,
    "",
    "Respond with ===PANEL=== (same facts, clearer prose) and ===SPOKEN=== (2–3 sentences, same call and one target). Copy META line exactly.",
  ].join("\n");
}
