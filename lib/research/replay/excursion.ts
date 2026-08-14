import type { Bar } from "../../types";
import type { ExcursionResult, ReplayDirection, SerializedBar } from "./types";

function serializeBar(b: Bar): SerializedBar {
  return {
    time: b.time.toISOString(),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  };
}

export function computeExcursion(input: {
  direction: ReplayDirection;
  entry: number | null;
  target: number | null;
  invalidation: number | null;
  forwardBars: Bar[];
}): ExcursionResult {
  const { direction, entry, target, invalidation, forwardBars } = input;
  const forwardCandles = forwardBars.map(serializeBar);

  if (direction === "WAIT" || entry == null) {
    return {
      mfe: 0,
      mae: 0,
      targetHit: false,
      invalidationHit: false,
      firstHit: "neither",
      outcome: "NEUTRAL",
      barsToTarget: null,
      barsToInvalidation: null,
      barsToOutcome: null,
      barsAnalyzed: forwardBars.length,
      forwardCandles,
    };
  }

  let mfe = 0;
  let mae = 0;
  let targetHit = false;
  let invalidationHit = false;
  let firstHit: ExcursionResult["firstHit"] = "neither";
  let barsToTarget: number | null = null;
  let barsToInvalidation: number | null = null;
  let barsToOutcome: number | null = null;

  for (let i = 0; i < forwardBars.length; i++) {
    const bar = forwardBars[i]!;
    const fav =
      direction === "LONG"
        ? Math.max(bar.high - entry, bar.close - entry)
        : Math.max(entry - bar.low, entry - bar.close);
    const adv =
      direction === "LONG"
        ? Math.max(entry - bar.low, entry - bar.close)
        : Math.max(bar.high - entry, bar.close - entry);
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);

    const hitTarget =
      target != null &&
      (direction === "LONG" ? bar.high >= target : bar.low <= target);
    const hitInv =
      invalidation != null &&
      (direction === "LONG" ? bar.low <= invalidation : bar.high >= invalidation);

    if (firstHit === "neither") {
      if (hitTarget && hitInv) {
        const distTarget = Math.abs(bar.open - (target ?? bar.open));
        const distInv = Math.abs(bar.open - (invalidation ?? bar.open));
        firstHit = distTarget <= distInv ? "target" : "invalidation";
        targetHit = true;
        invalidationHit = true;
        barsToOutcome = i + 1;
        barsToTarget = i + 1;
        barsToInvalidation = i + 1;
      } else if (hitTarget) {
        firstHit = "target";
        targetHit = true;
        barsToOutcome = i + 1;
        barsToTarget = i + 1;
      } else if (hitInv) {
        firstHit = "invalidation";
        invalidationHit = true;
        barsToOutcome = i + 1;
        barsToInvalidation = i + 1;
      }
    } else {
      if (hitTarget) targetHit = true;
      if (hitInv) invalidationHit = true;
      if (barsToTarget == null && hitTarget) barsToTarget = i + 1;
      if (barsToInvalidation == null && hitInv) barsToInvalidation = i + 1;
    }
  }

  let outcome: ExcursionResult["outcome"] = "NEUTRAL";
  if (firstHit === "target") outcome = "WIN";
  else if (firstHit === "invalidation") outcome = "LOSS";
  else if (targetHit && !invalidationHit) outcome = "WIN";
  else if (invalidationHit && !targetHit) outcome = "LOSS";

  return {
    mfe: round2(mfe),
    mae: round2(mae),
    targetHit,
    invalidationHit,
    firstHit,
    outcome,
    barsToTarget,
    barsToInvalidation,
    barsToOutcome,
    barsAnalyzed: forwardBars.length,
    forwardCandles,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deterministic forward window for tests — exact bar count after asOf. */
export function forwardBarsAfter(allM1: Bar[], asOf: Date, count: number): Bar[] {
  const t = asOf.getTime();
  return allM1.filter((b) => b.time.getTime() > t).slice(0, count);
}
