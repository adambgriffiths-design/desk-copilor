/**
 * Higher-timeframe OHLCV from 1-minute bars.
 * Daily/weekly boundaries reuse CME session calendar from lib/market-data.ts.
 */

import { cmeWeekSundayKey, cmeSessionDateKey } from "../market-data";
import type { MinuteBar } from "./aggregate";

export { cmeSessionDateKey };

export type HtfBar = {
  /** Bucket start, Unix seconds UTC. */
  bucketTs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
};

export type HtfTimeframe = "5m" | "15m" | "1H" | "4H" | "D" | "W";

const HTF_SECONDS: Record<Exclude<HtfTimeframe, "D" | "W">, number> = {
  "5m": 300,
  "15m": 900,
  "1H": 3600,
  "4H": 14_400,
};

function mergeBar(existing: HtfBar, bar: MinuteBar, tradeCount: number): void {
  existing.high = Math.max(existing.high, bar.high);
  existing.low = Math.min(existing.low, bar.low);
  existing.close = bar.close;
  existing.volume += bar.volume;
  existing.tradeCount += tradeCount;
}

function newHtfBar(bucketTs: number, bar: MinuteBar, tradeCount: number): HtfBar {
  return {
    bucketTs,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    tradeCount,
  };
}

function bucketFixed(bar: MinuteBar, seconds: number): number {
  return Math.floor(bar.minuteTs / seconds) * seconds;
}

function aggregateFixed(
  bars: MinuteBar[],
  tradeCounts: Map<number, number>,
  seconds: number
): HtfBar[] {
  const map = new Map<number, HtfBar>();
  for (const bar of bars) {
    const bucket = bucketFixed(bar, seconds);
    const tc = tradeCounts.get(bar.minuteTs) ?? 0;
    const existing = map.get(bucket);
    if (existing) mergeBar(existing, bar, tc);
    else map.set(bucket, newHtfBar(bucket, bar, tc));
  }
  return [...map.values()].sort((a, b) => a.bucketTs - b.bucketTs);
}

function aggregateDaily(
  bars: MinuteBar[],
  tradeCounts: Map<number, number>
): HtfBar[] {
  const byDay = new Map<string, HtfBar>();
  const bucketTsByDay = new Map<string, number>();

  for (const bar of bars) {
    const dayKey = cmeSessionDateKey(bar.minuteTs);
    const tc = tradeCounts.get(bar.minuteTs) ?? 0;
    const existing = byDay.get(dayKey);
    if (existing) {
      mergeBar(existing, bar, tc);
    } else {
      byDay.set(dayKey, newHtfBar(bar.minuteTs, bar, tc));
      bucketTsByDay.set(dayKey, bar.minuteTs);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, bar]) => ({
      ...bar,
      bucketTs: bucketTsByDay.get(dayKey) ?? bar.bucketTs,
    }));
}

function aggregateWeekly(
  bars: MinuteBar[],
  tradeCounts: Map<number, number>
): HtfBar[] {
  const byWeek = new Map<string, HtfBar>();
  const bucketTsByWeek = new Map<string, number>();

  for (const bar of bars) {
    const weekKey = cmeWeekSundayKey(new Date(bar.minuteTs * 1000));
    if (!weekKey) continue;
    const tc = tradeCounts.get(bar.minuteTs) ?? 0;
    const existing = byWeek.get(weekKey);
    if (existing) {
      mergeBar(existing, bar, tc);
    } else {
      byWeek.set(weekKey, newHtfBar(bar.minuteTs, bar, tc));
      bucketTsByWeek.set(weekKey, bar.minuteTs);
    }
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, bar]) => ({
      ...bar,
      bucketTs: bucketTsByWeek.get(weekKey) ?? bar.bucketTs,
    }));
}

/** Build per-minute trade counts keyed by minuteTs. */
export function tradeCountsFromTicks(
  ticks: Array<{ timestamp: number }>
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const t of ticks) {
    const bucket = Math.floor(t.timestamp / 60) * 60;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
}

export function aggregateHtfFrom1m(
  bars: MinuteBar[],
  tradeCounts: Map<number, number>,
  timeframes: HtfTimeframe[]
): Record<HtfTimeframe, HtfBar[]> {
  const out = {} as Record<HtfTimeframe, HtfBar[]>;
  for (const tf of timeframes) {
    switch (tf) {
      case "5m":
        out[tf] = aggregateFixed(bars, tradeCounts, HTF_SECONDS["5m"]);
        break;
      case "15m":
        out[tf] = aggregateFixed(bars, tradeCounts, HTF_SECONDS["15m"]);
        break;
      case "1H":
        out[tf] = aggregateFixed(bars, tradeCounts, HTF_SECONDS["1H"]);
        break;
      case "4H":
        out[tf] = aggregateFixed(bars, tradeCounts, HTF_SECONDS["4H"]);
        break;
      case "D":
        out[tf] = aggregateDaily(bars, tradeCounts);
        break;
      case "W":
        out[tf] = aggregateWeekly(bars, tradeCounts);
        break;
    }
  }
  return out;
}
