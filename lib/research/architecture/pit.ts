import { ReplayDataCutoff } from "../replay/cutoff";
import type { ReplayMarketData } from "../replay/types";
import type { Bar } from "../../types";

export type PoisonKind = "price" | "swing" | "sweep" | "mss" | "fvg" | "liquidity";

function cloneBars(bars: Bar[]): Bar[] {
  return bars.map((b) => ({ ...b, time: new Date(b.time.getTime()) }));
}

function cloneData(data: ReplayMarketData): ReplayMarketData {
  return {
    symbol: data.symbol,
    daily: cloneBars(data.daily),
    m15: cloneBars(data.m15),
    m5: cloneBars(data.m5),
    m1: cloneBars(data.m1),
  };
}

/** Mutate bars strictly AFTER asOf — poison must not change PIT state at T. */
export function poisonFuture(data: ReplayMarketData, asOf: Date, kind: PoisonKind): ReplayMarketData {
  const out = cloneData(data);
  const t = asOf.getTime();
  const future = out.m1.filter((b) => b.time.getTime() > t);
  if (!future.length) return out;
  const target = future[Math.min(2, future.length - 1)]!;
  switch (kind) {
    case "price":
      target.high = 99999;
      target.low = 1;
      target.close = 50000;
      target.open = 50000;
      break;
    case "swing":
      target.high = target.high + 800;
      target.low = target.low - 800;
      break;
    case "sweep":
    case "liquidity":
      target.high = Math.max(target.high, 99990);
      target.close = 99980;
      break;
    case "mss":
      target.close = target.open - 400;
      target.low = target.close - 20;
      break;
    case "fvg":
      if (future.length >= 3) {
        future[0]!.close = future[0]!.high;
        future[1]!.high = future[0]!.high + 40;
        future[1]!.low = future[0]!.high + 10;
        future[2]!.open = future[1]!.high;
      } else {
        target.high = target.high + 50;
      }
      break;
  }
  return out;
}

export function assertCutoffHasNoFuture(data: ReplayMarketData, asOf: Date): void {
  new ReplayDataCutoff(data, asOf).assertNoFutureLeak();
}

export function cutoffContextFingerprintInputs(data: ReplayMarketData, asOf: Date) {
  const cutoff = new ReplayDataCutoff(data, asOf);
  cutoff.assertNoFutureLeak();
  const ctx = cutoff.buildContext();
  return {
    m1Count: cutoff.slicedM1().length,
    lastM1: cutoff.slicedM1().at(-1)?.close ?? null,
    pdh: ctx.htfPdArrays.previousDay.high,
    pdl: ctx.htfPdArrays.previousDay.low,
    mss: ctx.structureFacts.mss?.direction ?? null,
    fvgCount: ctx.structureFacts.m1UnfilledFvgs.length,
    dayHigh: ctx.daily.currentDayHigh,
    dayLow: ctx.daily.currentDayLow,
  };
}
