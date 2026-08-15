import { fetchBars } from "../../market-data";
import type { Bar } from "../../types";
import { buildResearchDataset } from "./build";
import { candlesFromRawInput } from "./candles";
import type { ResearchCandle, ResearchCandleDataset } from "./types";

/** Yahoo MNQ=F quotes index points — same price level as TickStream NQ (not ÷4). */
export const YAHOO_MNQ_TO_NQ_SCALE = 1;
export const YAHOO_SOURCE_VERSION = "yahoo-finance-v1";
export const YAHOO_SYMBOL = "MNQ=F";

export type LoadYahooDatasetOptions = {
  /** Yahoo interval — research path uses 1m only. */
  interval?: "1m" | "5m" | "15m" | "1d";
  /** Yahoo range token, e.g. 7d, 60d, 3mo. */
  range?: string;
  /** Optional Unix-second filter applied after fetch. */
  startSec?: number;
  endSec?: number;
  /** When set, multiply OHLC by this factor (default 1 — MNQ=F index points match NQ). */
  priceScale?: number;
  created_at?: string;
};

function barToCandle(bar: Bar, scale: number): ResearchCandle {
  return {
    timestamp: Math.floor(bar.time.getTime() / 1000),
    open: bar.open * scale,
    high: bar.high * scale,
    low: bar.low * scale,
    close: bar.close * scale,
  };
}

/** Map Yahoo bars → research candles (optional window filter). Does not validate 1m continuity. */
export function yahooBarsToCandles(
  bars: Bar[],
  opts: Pick<LoadYahooDatasetOptions, "priceScale" | "startSec" | "endSec"> = {}
): ResearchCandle[] {
  const scale = opts.priceScale ?? YAHOO_MNQ_TO_NQ_SCALE;
  let candles = bars.map((b) => barToCandle(b, scale));
  if (opts.startSec != null) {
    candles = candles.filter((c) => c.timestamp >= opts.startSec!);
  }
  if (opts.endSec != null) {
    candles = candles.filter((c) => c.timestamp <= opts.endSec!);
  }
  candles = candlesFromRawInput(candles);
  candles.sort((a, b) => a.timestamp - b.timestamp);
  return candles;
}

/** Build a research dataset from already-fetched Yahoo bars (avoids a second HTTP round-trip). */
export function datasetFromYahooBars(
  bars: Bar[],
  opts: LoadYahooDatasetOptions = {}
): ResearchCandleDataset {
  const candles = yahooBarsToCandles(bars, opts);
  const requestedStart = opts.startSec ?? (candles[0]?.timestamp ?? 0);
  const requestedEnd = opts.endSec ?? (candles.at(-1)?.timestamp ?? requestedStart);

  return buildResearchDataset({
    symbol: "NQ",
    candles,
    source: "yahoo",
    source_version: YAHOO_SOURCE_VERSION,
    requestedStart,
    requestedEnd,
    created_at: opts.created_at,
  });
}

/**
 * Yahoo Finance MNQ=F → validated research candle dataset.
 * Scales to NQ-equivalent OHLC by default so TickStream NQ fixtures compare directly.
 */
export async function loadDatasetFromYahoo(
  opts: LoadYahooDatasetOptions = {}
): Promise<ResearchCandleDataset> {
  const interval = opts.interval ?? "1m";
  const range = opts.range ?? "7d";
  const bars = await fetchBars(interval, range);
  return datasetFromYahooBars(bars, opts);
}
