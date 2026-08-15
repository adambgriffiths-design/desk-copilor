import { buildMarketContextAt } from "../../levels";
import { getEstDateKey } from "../../market-data";
import { cmeSessionDateKey, aggregateHtfFrom1m } from "../../tickstream/htf-aggregate";
import type { MinuteBar } from "../../tickstream/aggregate";
import type { Bar } from "../../types";
import { ReplayEngine } from "../replay/engine";
import { researchDatasetToReplayMarketData } from "./replay-bridge";
import type { ResearchCandle, ResearchCandleDataset } from "./types";

export type OhlcDiffStats = {
  alignedCount: number;
  tsOnlyCount: number;
  yahooOnlyCount: number;
  duplicateTs: number;
  duplicateYahoo: number;
  maxOpenDiff: number;
  maxHighDiff: number;
  maxLowDiff: number;
  maxCloseDiff: number;
  avgOpenDiff: number;
  avgHighDiff: number;
  avgLowDiff: number;
  avgCloseDiff: number;
  pctWithinQuarterPoint: number;
  pctWithinOnePoint: number;
};

export type ReplayFeatureDiff = {
  barIndex: number;
  asOf: string;
  tsBias: string | null;
  yahooBias: string | null;
  tsMss: string | null;
  yahooMss: string | null;
  tsFvgCount: number;
  yahooFvgCount: number;
  tsSessionHigh: number;
  yahooSessionHigh: number;
  tsSessionLow: number;
  yahooSessionLow: number;
  biasMatch: boolean;
  mssMatch: boolean;
  fvgCountMatch: boolean;
};

function candleMap(candles: ResearchCandle[]): Map<number, ResearchCandle> {
  const m = new Map<number, ResearchCandle>();
  for (const c of candles) {
    if (!m.has(c.timestamp)) m.set(c.timestamp, c);
  }
  return m;
}

function diff(a: number, b: number): number {
  return Math.abs(a - b);
}

/** OHLC alignment between two candle series (any timeframe; match by timestamp). */
export function compareCandleOhlc(
  left: ResearchCandle[],
  right: ResearchCandle[]
): OhlcDiffStats {
  const tsMap = candleMap(left);
  const yMap = candleMap(right);
  const alignedTs = [...tsMap.keys()].filter((t) => yMap.has(t)).sort((a, b) => a - b);

  const openDiffs: number[] = [];
  const highDiffs: number[] = [];
  const lowDiffs: number[] = [];
  const closeDiffs: number[] = [];
  let withinQuarter = 0;
  let withinOne = 0;
  let totalFields = 0;

  for (const ts of alignedTs) {
    const a = tsMap.get(ts)!;
    const b = yMap.get(ts)!;
    const dO = diff(a.open, b.open);
    const dH = diff(a.high, b.high);
    const dL = diff(a.low, b.low);
    const dC = diff(a.close, b.close);
    openDiffs.push(dO);
    highDiffs.push(dH);
    lowDiffs.push(dL);
    closeDiffs.push(dC);
    for (const d of [dO, dH, dL, dC]) {
      totalFields++;
      if (d <= 0.25) withinQuarter++;
      if (d <= 1) withinOne++;
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);

  return {
    alignedCount: alignedTs.length,
    tsOnlyCount: [...tsMap.keys()].filter((t) => !yMap.has(t)).length,
    yahooOnlyCount: [...yMap.keys()].filter((t) => !tsMap.has(t)).length,
    duplicateTs: left.length - tsMap.size,
    duplicateYahoo: right.length - yMap.size,
    maxOpenDiff: max(openDiffs),
    maxHighDiff: max(highDiffs),
    maxLowDiff: max(lowDiffs),
    maxCloseDiff: max(closeDiffs),
    avgOpenDiff: avg(openDiffs),
    avgHighDiff: avg(highDiffs),
    avgLowDiff: avg(lowDiffs),
    avgCloseDiff: avg(closeDiffs),
    pctWithinQuarterPoint: totalFields ? (withinQuarter / totalFields) * 100 : 0,
    pctWithinOnePoint: totalFields ? (withinOne / totalFields) * 100 : 0,
  };
}

/** Minute-level OHLC alignment between two research datasets. */
export function compareOhlcDatasets(
  tickstream: ResearchCandleDataset,
  yahoo: ResearchCandleDataset
): OhlcDiffStats {
  return compareCandleOhlc(tickstream.candles, yahoo.candles);
}

/** Strategy-relevant replay feature comparison at selected bar indices. */
export function compareReplayFeatures(
  tickstream: ResearchCandleDataset,
  yahoo: ResearchCandleDataset,
  barIndices: number[]
): ReplayFeatureDiff[] {
  const tsReplay = researchDatasetToReplayMarketData(tickstream, { label: "tickstream" });
  const yReplay = researchDatasetToReplayMarketData(yahoo, { label: "yahoo" });

  const rows: ReplayFeatureDiff[] = [];
  for (const idx of barIndices) {
    const tsIdx = Math.min(idx, tsReplay.m1.length - 1);
    const yIdx = Math.min(idx, yReplay.m1.length - 1);
    if (tsIdx < 0 || yIdx < 0) continue;

    const tsSnap = new ReplayEngine(tsReplay, { initialIndex: tsIdx }).snapshot();
    const ySnap = new ReplayEngine(yReplay, { initialIndex: yIdx }).snapshot();
    rows.push(featureDiffFromSnapshots(tsIdx, tsSnap, ySnap));
  }
  return rows;
}

export type ReplayFeatureSummary = {
  n: number;
  biasMatches: number;
  mssMatches: number;
  fvgMatches: number;
  biasMatchPct: number;
  mssMatchPct: number;
  fvgMatchPct: number;
  biasDivergencePct: number;
  mssDivergencePct: number;
};

export type DailySessionOhlcDiff = OhlcDiffStats & {
  matchedSessionDates: string[];
};

const MAX_CUTOFF_GAP_SEC = 15 * 60;

function featureDiffFromSnapshots(
  tsIdx: number,
  tsSnap: ReturnType<ReplayEngine["snapshot"]>,
  ySnap: ReturnType<ReplayEngine["snapshot"]>
): ReplayFeatureDiff {
  const tsBias = tsSnap.features.bias ?? null;
  const yBias = ySnap.features.bias ?? null;
  const tsMss = tsSnap.features.mssDirection ?? null;
  const yMss = ySnap.features.mssDirection ?? null;
  return {
    barIndex: tsIdx,
    asOf: tsSnap.asOf,
    tsBias,
    yahooBias: yBias,
    tsMss,
    yahooMss: yMss,
    tsFvgCount: tsSnap.features.m1FvgCount,
    yahooFvgCount: ySnap.features.m1FvgCount,
    tsSessionHigh: tsSnap.features.sessionHighAtCutoff,
    yahooSessionHigh: ySnap.features.sessionHighAtCutoff,
    tsSessionLow: tsSnap.features.sessionLowAtCutoff,
    yahooSessionLow: ySnap.features.sessionLowAtCutoff,
    biasMatch: tsBias === yBias,
    mssMatch: tsMss === yMss,
    fvgCountMatch: tsSnap.features.m1FvgCount === ySnap.features.m1FvgCount,
  };
}

/** Last candle at or before targetSec, or -1. Assumes candles sorted by timestamp. */
export function findBarIndexAtOrBefore(
  candles: { timestamp: number }[],
  targetSec: number
): number {
  let best = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i]!.timestamp <= targetSec) best = i;
    else break;
  }
  return best;
}

/**
 * Replay feature comparison at wall-clock cutoffs (each source uses its own bar index).
 * Skips a cutoff when either source has no bar within 15 minutes.
 */
export function compareReplayFeaturesAtTimestamps(
  tickstream: ResearchCandleDataset,
  yahoo: ResearchCandleDataset,
  timestampsSec: number[]
): ReplayFeatureDiff[] {
  const tsReplay = researchDatasetToReplayMarketData(tickstream, { label: "tickstream" });
  const yReplay = researchDatasetToReplayMarketData(yahoo, { label: "yahoo" });
  const tsEng = new ReplayEngine(tsReplay, { initialIndex: 0 });
  const yEng = new ReplayEngine(yReplay, { initialIndex: 0 });

  const rows: ReplayFeatureDiff[] = [];
  for (const target of timestampsSec) {
    const tsIdx = findBarIndexAtOrBefore(tickstream.candles, target);
    const yIdx = findBarIndexAtOrBefore(yahoo.candles, target);
    if (tsIdx < 0 || yIdx < 0) continue;
    if (target - tickstream.candles[tsIdx]!.timestamp > MAX_CUTOFF_GAP_SEC) continue;
    if (target - yahoo.candles[yIdx]!.timestamp > MAX_CUTOFF_GAP_SEC) continue;

    tsEng.setCursor(tsIdx);
    yEng.setCursor(yIdx);
    rows.push(featureDiffFromSnapshots(tsIdx, tsEng.snapshot(), yEng.snapshot()));
  }
  return rows;
}

export function summarizeReplayFeatureDiff(rows: ReplayFeatureDiff[]): ReplayFeatureSummary {
  const n = rows.length;
  const biasMatches = rows.filter((r) => r.biasMatch).length;
  const mssMatches = rows.filter((r) => r.mssMatch).length;
  const fvgMatches = rows.filter((r) => r.fvgCountMatch).length;
  const pct = (hits: number) => (n ? (hits / n) * 100 : 0);
  return {
    n,
    biasMatches,
    mssMatches,
    fvgMatches,
    biasMatchPct: pct(biasMatches),
    mssMatchPct: pct(mssMatches),
    fvgMatchPct: pct(fvgMatches),
    biasDivergencePct: n ? 100 - pct(biasMatches) : 0,
    mssDivergencePct: n ? 100 - pct(mssMatches) : 0,
  };
}

export type HtfBars = {
  daily: Bar[];
  m15: Bar[];
  m5: Bar[];
  m1: Bar[];
  symbol: string;
};

export type HtfBiasDiff = {
  asOf: string;
  tsDaily: string;
  yahooDaily: string;
  tsM15: string;
  yahooM15: string;
  tsDominant: string;
  yahooDominant: string;
  tsMss: string | null;
  yahooMss: string | null;
  dailyMatch: boolean;
  m15Match: boolean;
  biasMatch: boolean;
  mssMatch: boolean;
};

function sliceLookback(bars: Bar[], asOf: Date, n: number): Bar[] {
  const cut: Bar[] = [];
  const t = asOf.getTime();
  for (const b of bars) {
    if (b.time.getTime() <= t) cut.push(b);
  }
  return cut.length > n ? cut.slice(-n) : cut;
}

export function htfContextAtCutoff(data: HtfBars, asOf: Date) {
  return buildMarketContextAt(
    {
      daily: sliceLookback(data.daily, asOf, 40),
      m15: sliceLookback(data.m15, asOf, 64),
      m5: sliceLookback(data.m5, asOf, 80),
      m1: sliceLookback(data.m1, asOf, 120),
      symbol: data.symbol,
    },
    asOf
  );
}

/**
 * Fast HTF bias/MSS compare at cutoffs using truncated lookbacks (not full-session ReplayEngine).
 * Skips timestamps with no 15m bar within 15 minutes on either side.
 */
export function compareHtfBiasAtTimestamps(
  tickstream: HtfBars,
  yahoo: HtfBars,
  timestampsSec: number[]
): HtfBiasDiff[] {
  const rows: HtfBiasDiff[] = [];
  for (const target of timestampsSec) {
    const asOf = new Date(target * 1000);
    const ts15 = sliceLookback(tickstream.m15, asOf, 1);
    const y15 = sliceLookback(yahoo.m15, asOf, 1);
    if (!ts15.length || !y15.length) continue;
    if (target - Math.floor(ts15.at(-1)!.time.getTime() / 1000) > MAX_CUTOFF_GAP_SEC) continue;
    if (target - Math.floor(y15.at(-1)!.time.getTime() / 1000) > MAX_CUTOFF_GAP_SEC) continue;

    const tsCtx = htfContextAtCutoff(tickstream, asOf);
    const yCtx = htfContextAtCutoff(yahoo, asOf);
    const tsDaily = tsCtx.biasStack.daily;
    const yahooDaily = yCtx.biasStack.daily;
    const tsM15 = tsCtx.biasStack.m15;
    const yahooM15 = yCtx.biasStack.m15;
    const tsDominant = tsCtx.biasStack.dominantBias;
    const yahooDominant = yCtx.biasStack.dominantBias;
    const tsMss = tsCtx.structureFacts.mss?.direction ?? null;
    const yahooMss = yCtx.structureFacts.mss?.direction ?? null;
    rows.push({
      asOf: asOf.toISOString(),
      tsDaily,
      yahooDaily,
      tsM15,
      yahooM15,
      tsDominant,
      yahooDominant,
      tsMss,
      yahooMss,
      dailyMatch: tsDaily === yahooDaily,
      m15Match: tsM15 === yahooM15,
      biasMatch: tsDominant === yahooDominant,
      mssMatch: tsMss === yahooMss,
    });
  }
  return rows;
}

export function summarizeHtfBiasDiff(rows: HtfBiasDiff[]): {
  n: number;
  dailyMatchPct: number;
  m15MatchPct: number;
  biasMatchPct: number;
  mssMatchPct: number;
  dailyDivergencePct: number;
  m15DivergencePct: number;
  biasDivergencePct: number;
  mssDivergencePct: number;
} {
  const n = rows.length;
  const pct = (hits: number) => (n ? (hits / n) * 100 : 0);
  const daily = rows.filter((r) => r.dailyMatch).length;
  const m15 = rows.filter((r) => r.m15Match).length;
  const bias = rows.filter((r) => r.biasMatch).length;
  const mss = rows.filter((r) => r.mssMatch).length;
  return {
    n,
    dailyMatchPct: pct(daily),
    m15MatchPct: pct(m15),
    biasMatchPct: pct(bias),
    mssMatchPct: pct(mss),
    dailyDivergencePct: n ? 100 - pct(daily) : 0,
    m15DivergencePct: n ? 100 - pct(m15) : 0,
    biasDivergencePct: n ? 100 - pct(bias) : 0,
    mssDivergencePct: n ? 100 - pct(mss) : 0,
  };
}

function candleToMinuteBar(c: ResearchCandle): MinuteBar {
  return {
    minuteTs: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: 0,
  };
}

/** Derive 15m or CME-session daily candles from a 1m research dataset. */
export function htfCandlesFromDataset(
  dataset: ResearchCandleDataset,
  tf: "15m" | "D"
): ResearchCandle[] {
  const minuteBars = dataset.candles.map(candleToMinuteBar);
  const htf = aggregateHtfFrom1m(minuteBars, new Map(), [tf]);
  const bars = tf === "D" ? htf.D : htf["15m"];
  return (bars ?? []).map((b) => ({
    timestamp: b.bucketTs,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

/** Floor timestamps onto UTC 15m buckets so Yahoo native 15m can align with TS-derived 15m. */
export function bucketCandlesTo15mUtc(candles: ResearchCandle[]): ResearchCandle[] {
  const map = new Map<number, ResearchCandle>();
  for (const c of candles) {
    const bucket = Math.floor(c.timestamp / 900) * 900;
    const existing = map.get(bucket);
    if (!existing) {
      map.set(bucket, { timestamp: bucket, open: c.open, high: c.high, low: c.low, close: c.close });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
    }
  }
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function dailyKey(c: ResearchCandle, source: "tickstream" | "yahoo"): string {
  if (source === "tickstream") return cmeSessionDateKey(c.timestamp);
  return getEstDateKey(new Date(c.timestamp * 1000));
}

/**
 * Daily OHLC compare keyed by session/calendar date (Yahoo daily timestamps ≠ CME Globex buckets).
 */
export function compareDailyBySessionDate(
  tickstreamDaily: ResearchCandle[],
  yahooDaily: ResearchCandle[]
): DailySessionOhlcDiff {
  const tsMap = new Map<string, ResearchCandle>();
  const yMap = new Map<string, ResearchCandle>();
  for (const c of tickstreamDaily) {
    const k = dailyKey(c, "tickstream");
    if (!tsMap.has(k)) tsMap.set(k, c);
  }
  for (const c of yahooDaily) {
    const k = dailyKey(c, "yahoo");
    if (!yMap.has(k)) yMap.set(k, c);
  }

  const matched = [...tsMap.keys()].filter((k) => yMap.has(k)).sort();
  const left: ResearchCandle[] = [];
  const right: ResearchCandle[] = [];
  for (const k of matched) {
    const a = tsMap.get(k)!;
    const b = yMap.get(k)!;
    left.push({ ...a, timestamp: a.timestamp });
    right.push({ ...b, timestamp: a.timestamp });
  }

  const stats = compareCandleOhlc(left, right);
  return {
    ...stats,
    tsOnlyCount: [...tsMap.keys()].filter((k) => !yMap.has(k)).length,
    yahooOnlyCount: [...yMap.keys()].filter((k) => !tsMap.has(k)).length,
    matchedSessionDates: matched,
  };
}
