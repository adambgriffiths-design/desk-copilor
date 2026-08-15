/**
 * Bounded concept-combination analysis — no combinatorial explosion.
 * Only named templates + detected pairs among the playbook (C(n,2) with n=10).
 */

import type { ConceptRelationship, DecisionTrace, MarketDecisionContext } from "./types";

export const NAMED_COMBOS = [
  { id: "pdh_sweep", a: "liquidity_sweep_pdh", b: "liquidity_sweep_pdh", extra: undefined, relationship: "PDH+sweep" },
  { id: "pdh_fvg", a: "liquidity_sweep_pdh", b: "fvg", extra: undefined, relationship: "PDH+FVG" },
  { id: "pdh_mss", a: "liquidity_sweep_pdh", b: "mss", extra: undefined, relationship: "PDH+MSS" },
  { id: "eqh_sweep_disp", a: "eqh", b: "liquidity_sweep_pdh", extra: "displacement", relationship: "EQH+sweep+displacement" },
  { id: "eql_discount", a: "eql", b: "premium_discount", extra: undefined, relationship: "EQL+discount" },
  { id: "htf_bear_ltf_bull", a: "htf_bias", b: "mss", extra: undefined, relationship: "HTF bearish + LTF bullish" },
  { id: "session_structure", a: "session_liquidity", b: "mss", extra: undefined, relationship: "session liquidity + structure shift" },
] as const;

const MAX_PAIR_RELATIONS = 15;

function detected(trace: DecisionTrace, id: string): boolean {
  return trace.concepts.some((c) => c.concept === id && c.detected);
}

function used(trace: DecisionTrace, id: string): boolean {
  return trace.concepts.some((c) => c.concept === id && c.used);
}

export function recordConceptRelationships(
  trace: DecisionTrace,
  ctx: MarketDecisionContext
): ConceptRelationship[] {
  const out: ConceptRelationship[] = [];
  const context = `${ctx.session} ${ctx.premiumDiscount} htf=${ctx.htfTrend} ltf=${ctx.ltfTrend}`;

  for (const combo of NAMED_COMBOS) {
    const aOn = detected(trace, combo.a);
    const bOn = detected(trace, combo.b);
    const extraOn = combo.extra ? detected(trace, combo.extra) : true;
    if (!aOn || !bOn || !extraOn) continue;
    if (combo.id === "htf_bear_ltf_bull" && !(ctx.htfTrend === "bearish" && ctx.ltfTrend === "bullish")) {
      continue;
    }
    if (combo.id === "eql_discount" && ctx.premiumDiscount !== "discount") continue;
    out.push({
      a: combo.a,
      b: combo.b,
      extra: combo.extra,
      relationship: combo.relationship,
      context,
      impact: used(trace, combo.a) || used(trace, combo.b) ? "used in stance" : "detected only",
      outcome: trace.stance,
    });
  }

  const detectedIds = trace.concepts.filter((c) => c.detected).map((c) => c.concept);
  let pairs = 0;
  for (let i = 0; i < detectedIds.length && pairs < MAX_PAIR_RELATIONS; i++) {
    for (let j = i + 1; j < detectedIds.length && pairs < MAX_PAIR_RELATIONS; j++) {
      const a = detectedIds[i]!;
      const b = detectedIds[j]!;
      if (NAMED_COMBOS.some((c) => c.a === a && c.b === b)) continue;
      out.push({
        a,
        b,
        relationship: "co-detected",
        context,
        impact: used(trace, a) || used(trace, b) ? "at least one used" : "neither used",
        outcome: trace.stance,
      });
      pairs++;
    }
  }
  return out;
}
