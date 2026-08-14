import type { MarketContext, Bar } from "../../types";
import type { ReplayDataCutoff } from "./cutoff";
import type { ReplayFeatures } from "./types";

/** Extract structure/FVG/PD features visible strictly at cutoff T. */
export function extractFeaturesAtCutoff(
  ctx: MarketContext,
  cutoffOrM1: ReplayDataCutoff | Bar[]
): ReplayFeatures {
  const m1 = Array.isArray(cutoffOrM1) ? cutoffOrM1 : cutoffOrM1.slicedM1();
  const highs = m1.map((b) => b.high);
  const lows = m1.map((b) => b.low);
  const sessionHigh = highs.length ? Math.max(...highs) : ctx.daily.lastClose;
  const sessionLow = lows.length ? Math.min(...lows) : ctx.daily.lastClose;

  return {
    bias: ctx.biasStack?.dominantBias ?? ctx.daily.biasHint,
    currentDayHigh: ctx.daily.currentDayHigh,
    currentDayLow: ctx.daily.currentDayLow,
    sessionHighAtCutoff: sessionHigh,
    sessionLowAtCutoff: sessionLow,
    m1FvgCount: ctx.structureFacts.m1UnfilledFvgs.length,
    mssDirection: ctx.structureFacts.mss?.direction ?? null,
    pdVsRange: ctx.premiumDiscount?.vsCurrentDayRange ?? "mid",
    pdh: ctx.htfPdArrays.previousDay.high,
    pdl: ctx.htfPdArrays.previousDay.low,
  };
}
