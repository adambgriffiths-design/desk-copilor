import type { DecisionTrace, MarketDecisionContext, RichOutcomeLabels, SampleAdequacy } from "./types";
import { sampleAdequacy } from "./splits";

export type DecisionQualityMetrics = {
  n: number;
  directionalN: number;
  waitFlatMonitorN: number;
  correctDirectionRate: number | null;
  correctWaitRate: number | null;
  badTradeAvoidanceRate: number | null;
  meanBarsToTarget: number | null;
  targetHitRate: number | null;
  invalidationHitRate: number | null;
  meanRR: number | null;
  conceptUsefulness: Record<string, { detected: number; used: number; influential: number }>;
  conflictRows: number;
  conflictStayFlatRate: number | null;
  falseConfidenceRate: number | null;
  hindsightViolations: number;
  sampleAdequacy: SampleAdequacy;
  note: string;
};

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return num / den;
}

export type QualityRow = {
  trace: DecisionTrace;
  outcome: RichOutcomeLabels;
  context: MarketDecisionContext;
  hindsightViolation?: boolean;
};

/** Decision quality — not win rate only. Does not search for profitable weights. */
export function computeDecisionQuality(rows: QualityRow[]): DecisionQualityMetrics {
  const n = rows.length;
  const directional = rows.filter((r) => r.trace.stance === "long" || r.trace.stance === "short");
  const waitish = rows.filter((r) => r.trace.stance === "wait" || r.trace.stance === "flat" || r.trace.stance === "monitor");

  let correctDir = 0;
  for (const r of directional) {
    if (r.trace.stance === "long" && r.outcome.directionAfter === "up") correctDir++;
    if (r.trace.stance === "short" && r.outcome.directionAfter === "down") correctDir++;
  }

  let correctWait = 0;
  let avoided = 0;
  for (const r of waitish) {
    if (r.outcome.counterfactual && (r.outcome.firstHit === "invalidation" || r.outcome.winLossNeutral === "LOSS")) {
      avoided++;
      correctWait++;
    } else if (r.outcome.directionAfter === "unchanged" || r.outcome.firstHit === "neither") {
      correctWait++;
    }
  }

  const dirOutcomes = directional.map((r) => r.outcome);
  const rr = dirOutcomes
    .map((o) => (o.mae > 0 ? o.mfe / o.mae : o.mfe > 0 ? 1 : 0))
    .filter((x) => Number.isFinite(x));

  const conceptUsefulness: DecisionQualityMetrics["conceptUsefulness"] = {};
  for (const r of rows) {
    for (const c of r.trace.concepts) {
      const slot = (conceptUsefulness[c.concept] ??= { detected: 0, used: 0, influential: 0 });
      if (c.detected) slot.detected++;
      if (c.used) slot.used++;
      if (c.influential) slot.influential++;
    }
  }

  const conflicts = rows.filter((r) => r.trace.conflicts.disagree);
  const stayFlatConflicts = conflicts.filter((r) => r.trace.stance === "flat" || r.trace.stance === "wait" || r.trace.stance === "monitor");

  let falseConf = 0;
  let confDen = 0;
  for (const r of directional) {
    if (r.trace.confidence === "high") {
      confDen++;
      if (r.outcome.firstHit === "invalidation" || r.outcome.winLossNeutral === "LOSS") falseConf++;
    }
  }

  const hindsightViolations = rows.filter((r) => r.hindsightViolation).length;
  const barsToTarget = dirOutcomes.map((o) => o.timeToTargetBars).filter((x): x is number => x != null);

  return {
    n,
    directionalN: directional.length,
    waitFlatMonitorN: waitish.length,
    correctDirectionRate: rate(correctDir, directional.length),
    correctWaitRate: rate(correctWait, waitish.length),
    badTradeAvoidanceRate: rate(avoided, waitish.length),
    meanBarsToTarget: mean(barsToTarget),
    targetHitRate: rate(dirOutcomes.filter((o) => o.targetReached).length, dirOutcomes.length),
    invalidationHitRate: rate(dirOutcomes.filter((o) => o.invalidationReached).length, dirOutcomes.length),
    meanRR: mean(rr),
    conceptUsefulness,
    conflictRows: conflicts.length,
    conflictStayFlatRate: rate(stayFlatConflicts.length, conflicts.length),
    falseConfidenceRate: rate(falseConf, confDen),
    hindsightViolations,
    sampleAdequacy: sampleAdequacy(n),
    note:
      n < 30
        ? "Low-n — INFRASTRUCTURE / DEBUGGING evidence only. Not EDGE EVIDENCE."
        : "n meets minimum mention threshold; EDGE requires OOS + multi-day + adequacy=adequate.",
  };
}

export function stabilityAcrossSplits(
  bySplit: Partial<Record<"TRAIN" | "VALIDATION" | "OOS", DecisionQualityMetrics>>
): { stanceMixDelta: number | null; note: string } {
  const parts = Object.values(bySplit).filter(Boolean) as DecisionQualityMetrics[];
  if (parts.length < 2) return { stanceMixDelta: null, note: "Need ≥2 splits to measure stability" };
  const mixes = parts.map((p) => (p.n ? p.directionalN / p.n : 0));
  const delta = Math.max(...mixes) - Math.min(...mixes);
  return {
    stanceMixDelta: delta,
    note: "Directional-rate range across splits (not a selection criterion).",
  };
}
