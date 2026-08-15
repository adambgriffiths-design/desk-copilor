import type { HypothesisRecord } from "./types";

/**
 * Competing hypotheses — status is evidence state, not a claim of edge.
 * Do not mark SUPPORTED from single-day smoke numbers.
 */
export const SEEDED_HYPOTHESES: HypothesisRecord[] = [
  {
    id: "H-A",
    description: "HTF dominates LTF — when they disagree, the decision should follow HTF.",
    architectureVersion: null,
    requiredEvidence:
      "OOS comparison of HTF-follow vs production stay-flat on conflict rows: decision quality (avoidance, false confidence, direction), n≥30 conflict events, temporal split.",
    dataset: "available NQ only",
    results: "Not implemented as a versioned overlay this pass (would be a fourth arm). UNTESTED.",
    confidence: "none",
    status: "UNTESTED",
  },
  {
    id: "H-B",
    description: "LTF can override HTF on a valid (proven) liquidity event.",
    architectureVersion: "architecture-v2",
    requiredEvidence:
      "Conflict rows with proven PDH/PDL take. Compare v2 vs v1 on WAIT/avoidance/direction/false confidence. No select-on-eval. n≥30 before meaningful.",
    dataset: "available NQ only",
    results: "Harness exists. Smoke numbers are INFRASTRUCTURE EVIDENCE until n and OOS coverage are adequate.",
    confidence: "none",
    status: "UNTESTED",
  },
  {
    id: "H-C",
    description: "HTF is context but does not block tactical countertrend.",
    architectureVersion: "architecture-v3",
    requiredEvidence:
      "Same conflict population as H-B without requiring a liquidity event. Compare v3 vs v1. Do not tune weights.",
    dataset: "available NQ only",
    results: "Harness exists. Smoke numbers are INFRASTRUCTURE EVIDENCE until n and OOS coverage are adequate.",
    confidence: "none",
    status: "UNTESTED",
  },
  {
    id: "H-ORDER-1",
    description: "Information order HTF → liquidity → structure → entry is interchangeable with HTF → structure → liquidity → entry and liquidity → HTF → structure → entry.",
    architectureVersion: "architecture-v1",
    requiredEvidence:
      "Deterministic staged ablation on identical PIT inputs; verdict-stage deltas. Not a production rewrite.",
    dataset: "available NQ only",
    results: "Staged ablation helper records contribution order. No claim of a better pipeline order.",
    confidence: "none",
    status: "UNTESTED",
  },
];

export function hypothesisById(id: string): HypothesisRecord | undefined {
  return SEEDED_HYPOTHESES.find((h) => h.id === id);
}

export function hypothesesForArchitecture(version: string): HypothesisRecord[] {
  return SEEDED_HYPOTHESES.filter((h) => h.architectureVersion === version);
}
