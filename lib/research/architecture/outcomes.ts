import { computeExcursion } from "../replay/excursion";
import type { Bar } from "../../types";
import type { ReplayDirection } from "../replay/types";
import type { DecisionTrace, RichOutcomeLabels } from "./types";

function directionFromTrace(trace: DecisionTrace): ReplayDirection {
  if (trace.stance === "long" || trace.pipelineVerdict === "LONG") return "LONG";
  if (trace.stance === "short" || trace.pipelineVerdict === "SHORT") return "SHORT";
  return "WAIT";
}

function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function futureVol(bars: Bar[]): number | null {
  if (bars.length < 2) return null;
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!.close;
    if (prev === 0) continue;
    rets.push((bars[i]!.close - prev) / prev);
  }
  if (!rets.length) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const var_ = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.round(Math.sqrt(var_) * 1e6) / 1e6;
}

function directionAfter(entry: number, bars: Bar[]): RichOutcomeLabels["directionAfter"] {
  if (!bars.length) return "unknown";
  const last = bars.at(-1)!.close;
  const thresh = Math.max(1, Math.abs(entry) * 0.0002);
  if (last > entry + thresh) return "up";
  if (last < entry - thresh) return "down";
  return "unchanged";
}

/**
 * Richer than W/L. Directional traces use stated entry/target/invalidation.
 * WAIT/flat/monitor get a labeled counterfactual at lastPrice toward tactical lean.
 */
export function labelRichOutcomes(input: {
  trace: DecisionTrace;
  forwardBars: Bar[];
  lastPrice: number | null;
  liquidityPrices?: number[];
  mssLevel?: number | null;
}): RichOutcomeLabels {
  const { trace, forwardBars, lastPrice } = input;
  const statedDir = directionFromTrace(trace);
  const counterfactual = statedDir === "WAIT";
  const tacticalDir: ReplayDirection =
    trace.tactical.lean === "bullish" ? "LONG" : trace.tactical.lean === "bearish" ? "SHORT" : "WAIT";
  const direction = statedDir === "WAIT" ? tacticalDir : statedDir;
  const entry =
    parseNum(trace.entry?.split(/[–-]/)[0]) ?? lastPrice;
  const target = parseNum(trace.target);
  const invalidation = parseNum(trace.invalidation);

  const excursion = computeExcursion({
    direction,
    entry,
    target,
    invalidation,
    forwardBars,
  });

  let liquidityReached = false;
  if (input.liquidityPrices?.length && forwardBars.length) {
    for (const bar of forwardBars) {
      for (const px of input.liquidityPrices) {
        if (bar.low <= px && bar.high >= px) liquidityReached = true;
      }
    }
  }

  let structureInvalidated = false;
  if (input.mssLevel != null && forwardBars.length && direction !== "WAIT") {
    for (const bar of forwardBars) {
      if (direction === "LONG" && bar.close < input.mssLevel) structureInvalidated = true;
      if (direction === "SHORT" && bar.close > input.mssLevel) structureInvalidated = true;
    }
  }

  return {
    mfe: excursion.mfe,
    mae: excursion.mae,
    targetReached: excursion.targetHit,
    invalidationReached: excursion.invalidationHit,
    timeToTargetBars: excursion.barsToTarget,
    timeToInvalidationBars: excursion.barsToInvalidation,
    liquidityReached,
    structureInvalidated,
    directionAfter: entry != null ? directionAfter(entry, forwardBars) : "unknown",
    futureVol: futureVol(forwardBars),
    firstHit: excursion.firstHit,
    winLossNeutral: excursion.outcome,
    counterfactual,
  };
}
