/**
 * Conditional importance — data structures only.
 * Answers “when is X informative?” by counting. Does not search for profitable weights.
 */

import type { AblationResult } from "./ablation";
import type { DecisionTrace, EvidenceClass, MarketDecisionContext, SampleAdequacy, SplitPhase } from "./types";
import { sampleAdequacy } from "./splits";

export type ConditionalImportanceKey = {
  concept: string;
  session: string;
  premiumDiscount: string;
  htfTrend: string;
  ltfTrend: string;
  recentSweep: boolean;
};

export type ConditionalImportanceSlice = {
  key: ConditionalImportanceKey;
  n: number;
  detectedN: number;
  usedN: number;
  influentialN: number;
  stanceChangedWhenAblatedN: number;
  split: SplitPhase;
  sampleAdequacy: SampleAdequacy;
  evidenceClass: EvidenceClass;
};

export function importanceKey(concept: string, ctx: MarketDecisionContext): ConditionalImportanceKey {
  return {
    concept,
    session: ctx.session,
    premiumDiscount: ctx.premiumDiscount,
    htfTrend: ctx.htfTrend,
    ltfTrend: ctx.ltfTrend,
    recentSweep: ctx.recentSweep,
  };
}

export function accumulateImportance(input: {
  traces: DecisionTrace[];
  contexts: MarketDecisionContext[];
  ablations?: AblationResult[][];
  split: SplitPhase;
  evidenceClass: EvidenceClass;
}): ConditionalImportanceSlice[] {
  const map = new Map<string, ConditionalImportanceSlice>();
  for (let i = 0; i < input.traces.length; i++) {
    const trace = input.traces[i]!;
    const ctx = input.contexts[i]!;
    const ablations = input.ablations?.[i];
    for (const c of trace.concepts) {
      const key = importanceKey(c.concept, ctx);
      const id = JSON.stringify(key);
      const slot =
        map.get(id) ??
        ({
          key,
          n: 0,
          detectedN: 0,
          usedN: 0,
          influentialN: 0,
          stanceChangedWhenAblatedN: 0,
          split: input.split,
          sampleAdequacy: "insufficient",
          evidenceClass: input.evidenceClass,
        } satisfies ConditionalImportanceSlice);
      slot.n++;
      if (c.detected) slot.detectedN++;
      if (c.used) slot.usedN++;
      if (c.influential) slot.influentialN++;
      const channel =
        c.concept === "liquidity_sweep_pdh" || c.concept === "liquidity_sweep_pdl"
          ? "pdh"
          : c.concept === "eqh" || c.concept === "eql"
            ? "eqh_eql"
            : c.concept === "fvg"
              ? "fvg"
              : c.concept === "mss"
                ? "mss"
                : c.concept === "session_liquidity"
                  ? "session"
                  : c.concept === "htf_bias"
                    ? "htf"
                    : null;
      if (channel && ablations?.some((a) => a.channel === channel && a.changed)) {
        slot.stanceChangedWhenAblatedN++;
      }
      slot.sampleAdequacy = sampleAdequacy(slot.n);
      map.set(id, slot);
    }
  }
  return [...map.values()];
}
