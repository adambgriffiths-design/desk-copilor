/**
 * Research-only adapter: historical OHLC bars → chart snapshot for Phase 1 pipeline.
 * Scores freshness at cutoff asOf (not wall clock) so backtest data is not falsely stale.
 */
import {
  isChartQualityUsable,
  MIN_CANDLES_FOR_STRUCTURED,
  scoreChartQuality,
  type ChartCandle,
  type ChartSnapshotPayload,
} from "../chart-snapshot";
import type { Bar } from "../types";

export const RESEARCH_CANDLE_LOOKBACK = 80;

export function barsToResearchChartCandles(bars: Bar[]): ChartCandle[] {
  return bars.slice(-RESEARCH_CANDLE_LOOKBACK).map((b) => ({
    t: Math.floor(b.time.getTime() / 1000),
    o: b.open,
    h: b.high,
    l: b.low,
    c: b.close,
  }));
}

/** Build point-in-time chart snapshot from sliced m1 bars at research cutoff T. */
export function buildResearchChartSnapshotFromBars(input: {
  bars: Bar[];
  symbol: string;
  asOf: Date;
  timeframe?: string;
}): ChartSnapshotPayload {
  const candles = barsToResearchChartCandles(input.bars);
  const lastBarTime = candles.at(-1)?.t;
  const firstBarTime = candles[0]?.t;
  const asOfSec = Math.floor(input.asOf.getTime() / 1000);

  const base: Omit<ChartSnapshotPayload, "quality" | "qualityMeta"> = {
    ok: candles.length >= MIN_CANDLES_FOR_STRUCTURED,
    candles,
    drawings: [],
    source: "research_bars",
    symbol: input.symbol,
    timeframe: input.timeframe ?? "1",
    lastPrice: candles.at(-1)?.c ?? null,
    visibleRange:
      firstBarTime != null && lastBarTime != null
        ? { from: firstBarTime, to: lastBarTime }
        : null,
    sync: {
      lastBarTime,
      timestampDriftSec: 0,
      exportPartial: false,
    },
    exportedAt: input.asOf.toISOString(),
  };

  const qualityMeta = scoreChartQuality(base, asOfSec);
  return {
    ...base,
    ok: isChartQualityUsable(qualityMeta) && candles.length >= MIN_CANDLES_FOR_STRUCTURED,
    quality: qualityMeta.quality,
    qualityMeta,
  };
}
