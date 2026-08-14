import { buildMarketContextAt } from "../../levels";
import { sliceBarsAt, formatEst } from "../../market-data";
import type { Bar } from "../../types";
import type { MarketContext } from "../../types";
import type { ReplayMarketData } from "./types";
import { sliceBarsThroughIndex } from "./fast-slice";

/** Hard cutoff wrapper — Karen sees ONLY data <= asOf. No prod pipeline changes. */
export class ReplayDataCutoff {
  readonly asOf: Date;
  readonly data: ReplayMarketData;

  constructor(data: ReplayMarketData, asOf: Date) {
    this.data = data;
    this.asOf = asOf;
  }

  slicedM1(): Bar[] {
    return sliceBarsAt(this.data.m1, this.asOf);
  }

  slicedM5(): Bar[] {
    return sliceBarsAt(this.data.m5, this.asOf);
  }

  slicedM15(): Bar[] {
    return sliceBarsAt(this.data.m15, this.asOf);
  }

  slicedDaily(): Bar[] {
    return sliceBarsAt(this.data.daily, this.asOf);
  }

  buildContext(chartLastPrice?: number | null): MarketContext {
    const m1 = this.slicedM1();
    const chartTimeEst = m1.length ? formatEst(m1.at(-1)!.time) : formatEst(this.asOf);
    return buildMarketContextAt(
      {
        daily: this.data.daily,
        m15: this.data.m15,
        m5: this.data.m5,
        m1: this.data.m1,
        symbol: this.data.symbol,
      },
      this.asOf,
      chartTimeEst,
      chartLastPrice ?? m1.at(-1)?.close ?? null
    );
  }

  /**
   * Research backtest fast path — m1 chronological, index is authoritative cutoff.
   * Passes prefix-sliced series so buildMarketContextAt avoids full-array scans.
   */
  buildContextAtBarIndex(
    barIndex: number,
    htfMaps?: { m5EndByM1: number[]; m15EndByM1: number[] },
    chartLastPrice?: number | null
  ): MarketContext {
    const m1Prefix = sliceBarsThroughIndex(this.data.m1, barIndex);
    const asOf = this.data.m1[barIndex]!.time;
    const chartTimeEst = formatEst(asOf);
    const m5End = htfMaps?.m5EndByM1[barIndex] ?? -1;
    const m15End = htfMaps?.m15EndByM1[barIndex] ?? -1;
    const m5Prefix = m5End >= 0 ? sliceBarsThroughIndex(this.data.m5, m5End) : [];
    const m15Prefix = m15End >= 0 ? sliceBarsThroughIndex(this.data.m15, m15End) : [];

    return buildMarketContextAt(
      {
        daily: this.data.daily,
        m15: m15Prefix,
        m5: m5Prefix,
        m1: m1Prefix,
        symbol: this.data.symbol,
      },
      asOf,
      chartTimeEst,
      chartLastPrice ?? m1Prefix.at(-1)?.close ?? null
    );
  }

  /** Bars strictly after cutoff — for reveal only (never passed to Karen). */
  forwardM1(count: number): Bar[] {
    const t = this.asOf.getTime();
    return this.data.m1.filter((b) => b.time.getTime() > t).slice(0, count);
  }

  /** Assert no bar in sliced set exceeds asOf. */
  assertNoFutureLeak(): void {
    const t = this.asOf.getTime();
    for (const bar of [...this.slicedM1(), ...this.slicedM5(), ...this.slicedM15()]) {
      if (bar.time.getTime() > t) {
        throw new Error(`Future leak: bar at ${bar.time.toISOString()} > asOf ${this.asOf.toISOString()}`);
      }
    }
  }

  /** FVG zones whose startTime is after asOf — must be empty in cutoff context. */
  futureFvgsInFullDataset(ctxAtCutoff: MarketContext): number {
    const tSec = Math.floor(this.asOf.getTime() / 1000);
    const allFvgs = [
      ...ctxAtCutoff.timeframe15m.unfilledFvgs,
      ...ctxAtCutoff.timeframe5m.unfilledFvgs,
      ...ctxAtCutoff.structureFacts.m1UnfilledFvgs,
    ];
    return allFvgs.filter((z) => (z.startTime ?? 0) > tSec).length;
  }
}

export function sliceMarketDataAt(data: ReplayMarketData, asOf: Date): ReplayMarketData {
  return {
    symbol: data.symbol,
    daily: sliceBarsAt(data.daily, asOf),
    m15: sliceBarsAt(data.m15, asOf),
    m5: sliceBarsAt(data.m5, asOf),
    m1: sliceBarsAt(data.m1, asOf),
  };
}

export function structureOneLiner(ctx: MarketContext): string {
  const mss = ctx.structureFacts.mss;
  const fvgCount = ctx.structureFacts.m1UnfilledFvgs.length;
  const bias = ctx.biasStack?.dominantBias ?? ctx.daily.biasHint;
  const parts = [
    `Bias: ${bias}`,
    mss ? `MSS ${mss.direction} @ ${mss.level.toFixed(1)}` : "MSS: none",
    `FVGs: ${fvgCount}`,
    `PD: ${ctx.premiumDiscount?.vsCurrentDayRange ?? "mid"}`,
  ];
  return parts.join(" | ");
}
