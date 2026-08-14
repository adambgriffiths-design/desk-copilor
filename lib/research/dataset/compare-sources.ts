import { ReplayEngine } from "../replay/engine";
import { extractFeaturesAtCutoff } from "../replay/features";
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

/** Minute-level OHLC alignment between two research datasets. */
export function compareOhlcDatasets(
  tickstream: ResearchCandleDataset,
  yahoo: ResearchCandleDataset
): OhlcDiffStats {
  const tsMap = candleMap(tickstream.candles);
  const yMap = candleMap(yahoo.candles);
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
    duplicateTs: tickstream.candles.length - tsMap.size,
    duplicateYahoo: yahoo.candles.length - yMap.size,
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

    const tsBias = tsSnap.features.bias ?? null;
    const yBias = ySnap.features.bias ?? null;
    const tsMss = tsSnap.features.mssDirection ?? null;
    const yMss = ySnap.features.mssDirection ?? null;

    rows.push({
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
    });
  }
  return rows;
}
