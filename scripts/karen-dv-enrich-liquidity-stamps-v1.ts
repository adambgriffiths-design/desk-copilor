/**
 * DEV: Enrich FORCE_WAIT Y=1500 stamps with liquidity_repr_v1 levels (+ optional HTF).
 *
 * Observation-only PIT rebuild (no dual DV experiment, no outcomes, no unlock):
 *   one full ReplayMarketData → per-asOf ReplayDataCutoff → buildMarketObservation
 *   → stampLiquidityFeaturesFromObs (full array + provenance ticks)
 *
 *   npx tsx scripts/karen-dv-enrich-liquidity-stamps-v1.ts
 *   npx tsx scripts/karen-dv-enrich-liquidity-stamps-v1.ts --limit=40
 *   npx tsx scripts/karen-dv-enrich-liquidity-stamps-v1.ts --smoke
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { buildMarketObservation } from "../lib/observation-engine";
import { buildMarketState } from "../lib/market-state-build";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import type { ReplayMarketData } from "../lib/research/replay/types";
import type { Bar } from "../lib/types";
import {
  buildHtfIndexMaps,
  lastBarIndexAtOrBefore,
} from "../lib/research/replay/fast-slice";
import {
  HTF_BIAS_REPRESENTATION_VERSION,
  stampHtfBiasFeaturesFromObs,
} from "../lib/htf-bias-stamp-features";
import {
  LIQUIDITY_REPRESENTATION_VERSION,
  stampLiquidityFeaturesFromObs,
  sweepPresentFromLiquidityLevels,
  type LiquidityLevelStamp,
} from "../lib/liquidity-stamp-features";
import {
  LIQUIDITY_MAP_REPRESENTATION_VERSION,
  stampLiquidityMapFromObsAndContext,
  type LiquidityPoolStamp,
} from "../lib/liquidity-map-stamp-features";
import {
  CONTRADICTION_REPRESENTATION_VERSION,
  stampContradictionItemsFromDvEvidence,
} from "../lib/contradiction-stamp-features";
import { detectEqhEqlLiquidity } from "../lib/research/eqh-eql-liquidity";
import type { MarketContext } from "../lib/types";

const root = process.cwd();
const reportsDir = join(root, "data/karen-decision-validation/acquisition/reports");
const researchDir = join(root, "data/research");
const latestPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.json");
const jsonlPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.jsonl");
const schemaPath = join(reportsDir, "force-wait-shadow-stamps-y1500.schema.md");
const candlesPathDefault = join(
  root,
  "data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m/candles-1m.json"
);
const candlesPath =
  process.argv.find((x) => x.startsWith("--candles="))?.slice("--candles=".length) ??
  candlesPathDefault;

function argNum(name: string, fallback: number): number {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.slice(name.length + 3)) : fallback;
}
function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const smoke = argFlag("smoke");
const merge = argFlag("merge") || smoke; // smoke merges processed slice into dump by default
const limit = smoke ? Math.min(40, argNum("limit", 40)) : argNum("limit", 0);
const offset = Math.max(0, argNum("offset", 0));
const skipEnriched = argFlag("skip-enriched");

type Candle = { time: string; open: number; high: number; low: number; close: number };
type Feat = {
  tradeableBias?: string | null;
  marketStructure?: string | null;
  displacement?: string | null;
  fvgStatus?: string | null;
  longSupported?: boolean;
  shortSupported?: boolean;
  contradictions?: string[];
  contradictionCount?: number;
  contradictionItems?: unknown;
  contradictionRepresentationVersion?: string;
  sweepPresent?: boolean | null;
  liquidityLevels?: LiquidityLevelStamp[];
  liquidityLevelCount?: number;
  liquidityTakenCount?: number;
  liquidityRepresentationVersion?: string;
  liquidityPools?: LiquidityPoolStamp[];
  liquidityPoolCount?: number;
  liquidityPoolTakenCount?: number;
  liquidityMapRepresentationVersion?: string;
  htfBiasDaily?: string | null;
  htfBiasM15?: string | null;
  htfBiasM5?: string | null;
  htfAligned?: boolean | "unknown" | null;
  htfBias?: unknown;
  htfBiasRepresentationVersion?: string;
  [k: string]: unknown;
};
type Stamp = {
  asOf: string;
  population: string;
  featuresAtT: Feat;
  [k: string]: unknown;
};

const LOOKBACK_DAYS = smoke ? 5 : 7;

function ymdOf(iso: string): string {
  return iso.slice(0, 10);
}
function addDaysYmd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
function inYmdRange(iso: string, fromYmd: string, toYmd: string): boolean {
  const d = ymdOf(iso);
  return d >= fromYmd && d <= toYmd;
}

function rollup(bars: Candle[], minutes: number): Candle[] {
  const out: Candle[] = [];
  let bucket: Candle | null = null;
  let bucketStart = -1;
  for (const b of bars) {
    const t = Date.parse(b.time);
    const start = Math.floor(t / (minutes * 60_000)) * (minutes * 60_000);
    if (bucket == null || start !== bucketStart) {
      if (bucket) out.push(bucket);
      bucketStart = start;
      bucket = {
        time: new Date(start).toISOString(),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      };
    } else {
      bucket.high = Math.max(bucket.high, b.high);
      bucket.low = Math.min(bucket.low, b.low);
      bucket.close = b.close;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

function dailyFromM1(bars: Candle[]): Candle[] {
  const byDay = new Map<string, Candle>();
  for (const b of bars) {
    const key = b.time.slice(0, 10);
    const cur = byDay.get(key);
    if (!cur) byDay.set(key, { ...b, time: `${key}T22:00:00.000Z` });
    else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    }
  }
  return [...byDay.values()].sort((a, b) => a.time.localeCompare(b.time));
}

function toBars(rows: Candle[]): Bar[] {
  return rows.map((b) => ({
    time: new Date(b.time),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

function buildFullMarketData(candles: Candle[]): ReplayMarketData {
  const m1Rows = candles.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  return {
    symbol: "MNQ1!",
    daily: toBars(dailyFromM1(m1Rows)),
    m15: toBars(rollup(m1Rows, 15)),
    m5: toBars(rollup(m1Rows, 5)),
    m1: toBars(m1Rows),
  };
}

type ObsAtAsOf = {
  obs: ReturnType<typeof buildMarketObservation>;
  ctx: MarketContext;
  m1Prefix: Bar[];
};

function observationAtAsOf(
  data: ReplayMarketData,
  asOfIso: string,
  htfMaps: ReturnType<typeof buildHtfIndexMaps>
): ObsAtAsOf {
  const asOf = new Date(asOfIso);
  const barIndex = lastBarIndexAtOrBefore(data.m1, asOf);
  if (barIndex < 0) {
    // Empty prefix — still build a state so stamp fields are honest empties.
    const cutoff = new ReplayDataCutoff(data, asOf);
    const m1 = cutoff.slicedM1();
    const ctx = cutoff.buildContext(null);
    const chartSnapshot = buildResearchChartSnapshotFromBars({
      bars: m1,
      symbol: data.symbol,
      asOf,
      timeframe: "1",
    });
    const state = buildMarketState({
      ctx,
      chartSnapshot,
      symbol: data.symbol,
      timeframe: "1",
      authoritativePrice: null,
    });
    return { obs: buildMarketObservation(ctx, state), ctx, m1Prefix: m1 };
  }

  const cutoff = new ReplayDataCutoff(data, asOf);
  const pitClose = data.m1[barIndex]!.close;
  const ctx = cutoff.buildContextAtBarIndex(barIndex, htfMaps, pitClose);
  const m1Prefix = data.m1.slice(0, barIndex + 1);
  const chartSnapshot = buildResearchChartSnapshotFromBars({
    bars: m1Prefix,
    symbol: data.symbol,
    asOf,
    timeframe: "1",
  });
  const state = buildMarketState({
    ctx,
    chartSnapshot,
    symbol: data.symbol,
    timeframe: "1",
    authoritativePrice:
      pitClose != null && Number.isFinite(pitClose) && pitClose > 0
        ? {
            value: pitClose,
            source: "yahoo_bar_close",
            timestamp: asOf.getTime(),
            ageMs: 0,
          }
        : null,
  });
  return { obs: buildMarketObservation(ctx, state), ctx, m1Prefix };
}

function enrichFeatures(
  f: Feat,
  obs: ReturnType<typeof buildMarketObservation>,
  ctx: MarketContext,
  m1Prefix: Bar[],
  opts?: { includeEqh?: boolean }
): Feat {
  const eqhAreas =
    opts?.includeEqh && m1Prefix.length > 20
      ? detectEqhEqlLiquidity(m1Prefix, {
          symbol: "MNQ1!",
          lookback: 180,
          asOfIndex: m1Prefix.length - 1,
        }).areas
      : null;
  const liq = stampLiquidityFeaturesFromObs(obs);
  const liqMap = stampLiquidityMapFromObsAndContext({ obs, ctx, eqhAreas });
  const htf = stampHtfBiasFeaturesFromObs(obs);
  const contradictions = [...(f.contradictions ?? [])];
  const contradictionCount = f.contradictionCount ?? contradictions.length;
  const contradictionItems = stampContradictionItemsFromDvEvidence({
    marketStructure: f.marketStructure,
    tradeableBias: f.tradeableBias,
    displacement: f.displacement,
    fvgStatus: f.fvgStatus,
    htfAligned: htf.htfAligned,
    longSupported: f.longSupported,
    shortSupported: f.shortSupported,
    contradictions,
  });

  const {
    liquidityLevels: _ll,
    liquidityLevelCount: _lc,
    liquidityTakenCount: _lt,
    liquidityRepresentationVersion: _lv,
    liquidityPools: _lp,
    liquidityPoolCount: _lpc,
    liquidityPoolTakenCount: _lpt,
    liquidityMapRepresentationVersion: _lmv,
    htfBiasDaily: _d,
    htfBiasM15: _m15,
    htfBiasM5: _m5,
    htfAligned: _a,
    htfBias: _hb,
    htfBiasRepresentationVersion: _hv,
    contradictionItems: _ci,
    contradictionRepresentationVersion: _cv,
    ...rest
  } = f;

  const sweepPresent =
    f.sweepPresent != null
      ? f.sweepPresent
      : sweepPresentFromLiquidityLevels(liq.liquidityLevels);

  return {
    ...rest,
    tradeableBias: f.tradeableBias,
    contradictions,
    contradictionCount,
    contradictionItems,
    contradictionRepresentationVersion: CONTRADICTION_REPRESENTATION_VERSION,
    htfBiasDaily: htf.htfBiasDaily,
    htfBiasM15: htf.htfBiasM15,
    htfBiasM5: htf.htfBiasM5,
    htfAligned: htf.htfAligned,
    htfBias: htf.htfBias,
    htfBiasRepresentationVersion: HTF_BIAS_REPRESENTATION_VERSION,
    liquidityLevels: liq.liquidityLevels,
    liquidityLevelCount: liq.liquidityLevelCount,
    liquidityTakenCount: liq.liquidityTakenCount,
    liquidityRepresentationVersion: LIQUIDITY_REPRESENTATION_VERSION,
    liquidityPools: liqMap.liquidityPools,
    liquidityPoolCount: liqMap.liquidityPoolCount,
    liquidityPoolTakenCount: liqMap.liquidityPoolTakenCount,
    liquidityMapRepresentationVersion: LIQUIDITY_MAP_REPRESENTATION_VERSION,
    sweepPresent,
  };
}

function bump(m: Record<string, number>, k: string) {
  m[k] = (m[k] ?? 0) + 1;
}

function liquidityFingerprint(levels: LiquidityLevelStamp[], mode: "v0" | "v1"): string {
  const parts = levels
    .map((l) => {
      const side = l.side ?? "?";
      const status = l.status ?? "?";
      const taken = String(l.taken);
      const core = `${l.label}:${side}:${status}:${taken}`;
      if (mode === "v0") return core;
      const t = [
        l.formedAt ?? "",
        l.qualifyingTickAt ?? "",
        l.qualifyingTickPrice ?? "",
        l.candleId ?? "",
      ].join("@");
      return `${core}#${t}`;
    })
    .sort();
  return parts.join("|") || "EMPTY";
}

function buildFreqReport(stamps: Stamp[]) {
  const withLevels = stamps.filter((s) => Array.isArray(s.featuresAtT.liquidityLevels));
  let buySideLevelRows = 0;
  let sellSideLevelRows = 0;
  let unknownSideRows = 0;
  const buyPerStamp: Record<string, number> = {};
  const sellPerStamp: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const labelCounts: Record<string, number> = {};
  const sideCounts: Record<string, number> = {};
  let bothSidesOnStamp = 0;
  let buyOnly = 0;
  let sellOnly = 0;
  let neitherSide = 0;
  let stampsWithFormedAt = 0;
  let stampsWithQualifyingTick = 0;
  let stampsWithCandleId = 0;
  let levelRowsWithFormedAt = 0;
  let levelRowsWithQualifyingTick = 0;
  let levelRowsWithCandleId = 0;
  const PD_IDS = new Set(["pdh", "pdl", "pdc"]);
  const SESSION_IDS = new Set([
    "asia_high",
    "asia_low",
    "london_high",
    "london_low",
    "ny_rth_high",
    "ny_rth_low",
  ]);
  let pdLevelRows = 0;
  let pdLevelRowsWithFormedAt = 0;
  let sessionLevelRows = 0;
  let sessionLevelRowsWithFormedAt = 0;
  let stampsWithSessionFormedAt = 0;
  let stampsWithPdFormedAt = 0;
  let stampsWithHtfStack = 0;

  const underSweep: Record<
    string,
    {
      n: number;
      distinctFingerprintsV0: Set<string>;
      distinctFingerprintsV1: Set<string>;
      statusMixes: Record<string, number>;
      sidePatterns: Record<string, number>;
      takenCountDist: Record<string, number>;
      multiTaken: number;
      withAnyTiming: number;
    }
  > = {
    true: {
      n: 0,
      distinctFingerprintsV0: new Set(),
      distinctFingerprintsV1: new Set(),
      statusMixes: {},
      sidePatterns: {},
      takenCountDist: {},
      multiTaken: 0,
      withAnyTiming: 0,
    },
    false: {
      n: 0,
      distinctFingerprintsV0: new Set(),
      distinctFingerprintsV1: new Set(),
      statusMixes: {},
      sidePatterns: {},
      takenCountDist: {},
      multiTaken: 0,
      withAnyTiming: 0,
    },
    null: {
      n: 0,
      distinctFingerprintsV0: new Set(),
      distinctFingerprintsV1: new Set(),
      statusMixes: {},
      sidePatterns: {},
      takenCountDist: {},
      multiTaken: 0,
      withAnyTiming: 0,
    },
  };

  for (const s of withLevels) {
    const levels = (s.featuresAtT.liquidityLevels as LiquidityLevelStamp[]) ?? [];
    let buyN = 0;
    let sellN = 0;
    const statuses = new Set<string>();
    let hasFormed = false;
    let hasTick = false;
    let hasCandle = false;
    let hasSessionFormed = false;
    let hasPdFormed = false;
    const f = s.featuresAtT;
    if (
      f.htfBiasDaily != null &&
      f.htfBiasM15 != null &&
      f.htfBiasM5 != null &&
      f.htfAligned != null
    ) {
      stampsWithHtfStack++;
    }
    for (const l of levels) {
      const side = l.side ?? "null";
      const id = (l.id ?? "").toLowerCase();
      bump(sideCounts, side);
      bump(labelCounts, l.label);
      bump(statusCounts, l.status ?? "null");
      if (l.side === "buy_side") {
        buySideLevelRows++;
        buyN++;
      } else if (l.side === "sell_side") {
        sellSideLevelRows++;
        sellN++;
      } else {
        unknownSideRows++;
      }
      if (l.status) statuses.add(l.status);
      if (PD_IDS.has(id)) {
        pdLevelRows++;
        if (l.formedAt != null) {
          pdLevelRowsWithFormedAt++;
          hasPdFormed = true;
        }
      } else if (SESSION_IDS.has(id)) {
        sessionLevelRows++;
        if (l.formedAt != null) {
          sessionLevelRowsWithFormedAt++;
          hasSessionFormed = true;
        }
      }
      if (l.formedAt != null) {
        levelRowsWithFormedAt++;
        hasFormed = true;
      }
      if (l.qualifyingTickAt != null || l.qualifyingTickPrice != null) {
        levelRowsWithQualifyingTick++;
        hasTick = true;
      }
      if (l.candleId != null) {
        levelRowsWithCandleId++;
        hasCandle = true;
      }
    }
    if (hasFormed) stampsWithFormedAt++;
    if (hasSessionFormed) stampsWithSessionFormedAt++;
    if (hasPdFormed) stampsWithPdFormedAt++;
    if (hasTick) stampsWithQualifyingTick++;
    if (hasCandle) stampsWithCandleId++;
    bump(buyPerStamp, String(buyN));
    bump(sellPerStamp, String(sellN));
    if (buyN > 0 && sellN > 0) bothSidesOnStamp++;
    else if (buyN > 0) buyOnly++;
    else if (sellN > 0) sellOnly++;
    else neitherSide++;

    const swKey =
      s.featuresAtT.sweepPresent === true
        ? "true"
        : s.featuresAtT.sweepPresent === false
          ? "false"
          : "null";
    const bucket = underSweep[swKey]!;
    bucket.n++;
    const fp0 = liquidityFingerprint(levels, "v0");
    const fp1 = liquidityFingerprint(levels, "v1");
    bucket.distinctFingerprintsV0.add(fp0);
    bucket.distinctFingerprintsV1.add(fp1);
    if (
      levels.some(
        (l) =>
          l.formedAt != null ||
          l.qualifyingTickAt != null ||
          l.qualifyingTickPrice != null ||
          l.candleId != null
      )
    ) {
      bucket.withAnyTiming++;
    }
    const statusMix = [...statuses].sort().join("+") || "NONE";
    bump(bucket.statusMixes, statusMix);
    const sidePat =
      buyN > 0 && sellN > 0 ? "BOTH" : buyN > 0 ? "BUY_ONLY" : sellN > 0 ? "SELL_ONLY" : "NEITHER";
    bump(bucket.sidePatterns, sidePat);
    const takenN = levels.filter((l) => l.taken === true).length;
    bump(bucket.takenCountDist, String(takenN));
    if (takenN >= 2) bucket.multiTaken++;
  }

  const serializeSweep = (k: string) => {
    const b = underSweep[k]!;
    return {
      n: b.n,
      distinctLiquidityFingerprintsV0: b.distinctFingerprintsV0.size,
      distinctLiquidityFingerprintsV1: b.distinctFingerprintsV1.size,
      timingSplitsV0Classes:
        b.distinctFingerprintsV1.size - b.distinctFingerprintsV0.size,
      hidesDiversityVsBool: b.distinctFingerprintsV0.size > 1,
      timingAddsExtraDiversity: b.distinctFingerprintsV1.size > b.distinctFingerprintsV0.size,
      stampsWithAnyTimingFields: b.withAnyTiming,
      statusMixes: b.statusMixes,
      sidePatterns: b.sidePatterns,
      takenCountDist: b.takenCountDist,
      multiTakenStamps: b.multiTaken,
    };
  };

  const allV0 = new Set<string>();
  const allV1 = new Set<string>();
  for (const s of withLevels) {
    const levels = (s.featuresAtT.liquidityLevels as LiquidityLevelStamp[]) ?? [];
    allV0.add(liquidityFingerprint(levels, "v0"));
    allV1.add(liquidityFingerprint(levels, "v1"));
  }

  return {
    at: new Date().toISOString(),
    kind: "liquidity_representation_freq_v1",
    EDGE_CLAIM: "NONE",
    HOLDOUT: "SEALED",
    VAL: "DO_NOT_TOUCH",
    OUTCOMES_MINED: "NO",
    UNLOCK: "PARKED",
    representationVersion: LIQUIDITY_REPRESENTATION_VERSION,
    stampsTotal: stamps.length,
    stampsWithLiquidityLevels: withLevels.length,
    levelRows: {
      buy_side: buySideLevelRows,
      sell_side: sellSideLevelRows,
      unknown_or_missing_side: unknownSideRows,
      total: buySideLevelRows + sellSideLevelRows + unknownSideRows,
    },
    buySidePoolsPerStampDist: buyPerStamp,
    sellSidePoolsPerStampDist: sellPerStamp,
    statusCounts,
    labelCounts,
    sideCounts,
    bothSidesOnSameStamp: bothSidesOnStamp,
    buyOnlyStamps: buyOnly,
    sellOnlyStamps: sellOnly,
    neitherSideStamps: neitherSide,
    provenanceCoverage: {
      stampsWithFormedAt,
      stampsWithQualifyingTick,
      stampsWithCandleId,
      levelRowsWithFormedAt,
      levelRowsWithQualifyingTick,
      levelRowsWithCandleId,
      pctLevelRowsWithFormedAt:
        buySideLevelRows + sellSideLevelRows + unknownSideRows > 0
          ? Number(
              (
                (100 * levelRowsWithFormedAt) /
                (buySideLevelRows + sellSideLevelRows + unknownSideRows)
              ).toFixed(2)
            )
          : 0,
      pd: {
        levelRows: pdLevelRows,
        levelRowsWithFormedAt: pdLevelRowsWithFormedAt,
        pctFormedAt:
          pdLevelRows > 0
            ? Number(((100 * pdLevelRowsWithFormedAt) / pdLevelRows).toFixed(2))
            : 0,
        stampsWithFormedAt: stampsWithPdFormedAt,
      },
      sessionAsiaLondonNyRth: {
        levelRows: sessionLevelRows,
        levelRowsWithFormedAt: sessionLevelRowsWithFormedAt,
        pctFormedAt:
          sessionLevelRows > 0
            ? Number(((100 * sessionLevelRowsWithFormedAt) / sessionLevelRows).toFixed(2))
            : 0,
        stampsWithFormedAt: stampsWithSessionFormedAt,
      },
    },
    htfBiasStackCoverage: {
      stampsWithFullStack: stampsWithHtfStack,
      pctStampsWithFullStack:
        withLevels.length > 0
          ? Number(((100 * stampsWithHtfStack) / withLevels.length).toFixed(2))
          : 0,
      representationVersion: HTF_BIAS_REPRESENTATION_VERSION,
    },
    richness: {
      distinctFingerprintsV0Core: allV0.size,
      distinctFingerprintsV1WithTiming: allV1.size,
      timingAddsExtraDiversityVsV0: allV1.size > allV0.size,
      richerThanSweepPresent:
        Object.values(underSweep).some((b) => b.distinctFingerprintsV0.size > 1) ||
        Object.keys(statusCounts).length > 1,
    },
    sweepPresentHidesDiversity: {
      true: serializeSweep("true"),
      false: serializeSweep("false"),
      null: serializeSweep("null"),
    },
    richerThanSweepPresent:
      Object.values(underSweep).some((b) => b.distinctFingerprintsV0.size > 1) ||
      Object.keys(statusCounts).length > 1,
  };
}

function main() {
  const t0 = Date.now();
  const dump = JSON.parse(readFileSync(latestPath, "utf8")) as {
    stamps?: Stamp[];
    schemaNote?: Record<string, unknown>;
    at?: string;
    enrichment?: unknown;
    [k: string]: unknown;
  };
  const stamps = dump.stamps ?? [];
  if (!stamps.length) {
    console.error(JSON.stringify({ ok: false, error: "no stamps" }));
    process.exit(1);
  }

  const pending = skipEnriched
    ? stamps.filter(
        (s) =>
          s.featuresAtT?.liquidityRepresentationVersion !== LIQUIDITY_REPRESENTATION_VERSION ||
          s.featuresAtT?.htfBiasRepresentationVersion !== HTF_BIAS_REPRESENTATION_VERSION
      )
    : stamps;
  const work =
    limit > 0 ? pending.slice(offset, offset + limit) : pending.slice(offset);
  console.log(
    JSON.stringify({
      phase: "start",
      kind: "enrich_liquidity_repr_v1",
      stampsTotal: stamps.length,
      pending: pending.length,
      stampsWork: work.length,
      offset,
      smoke,
      merge,
      skipEnriched,
      EDGE_CLAIM: "NONE",
    })
  );

  console.log(JSON.stringify({ phase: "load_candles", lookbackDays: LOOKBACK_DAYS }));
  const allCandles = JSON.parse(readFileSync(candlesPath, "utf8")) as Candle[];

  // Group asOfs by day; each day gets its own LOOKBACK_DAYS window (keeps m1 prefix small).
  const uniqueAsOfs = [...new Set(work.map((s) => s.asOf))].sort();
  const byDay = new Map<string, string[]>();
  for (const asOf of uniqueAsOfs) {
    const d = ymdOf(asOf);
    const arr = byDay.get(d) ?? [];
    arr.push(asOf);
    byDay.set(d, arr);
  }
  const workDays = [...byDay.keys()].sort();
  const minDay = addDaysYmd(workDays[0]!, -LOOKBACK_DAYS);
  const maxDay = workDays[workDays.length - 1]!;
  // Keep only the date span needed for this work set (huge RAM win on 8GB host).
  const candlesByDay = new Map<string, Candle[]>();
  for (const c of allCandles) {
    const d = ymdOf(c.time);
    if (d < minDay || d > maxDay) continue;
    const arr = candlesByDay.get(d);
    if (arr) arr.push(c);
    else candlesByDay.set(d, [c]);
  }
  allCandles.length = 0;
  console.log(
    JSON.stringify({
      phase: "candles_indexed",
      dayBuckets: candlesByDay.size,
      minDay,
      maxDay,
      elapsedMs: Date.now() - t0,
    })
  );

  const stampFeatByAsOf = new Map(work.map((s) => [s.asOf, s.featuresAtT ?? {}]));

  const featByAsOf = new Map<string, Feat>();
  let i = 0;
  const sortedDayEntries = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (let di = 0; di < sortedDayEntries.length; di++) {
    const [day, dayAsOfs] = sortedDayEntries[di]!;
    const fromYmd = addDaysYmd(day, -LOOKBACK_DAYS);
    const windowCandles: Candle[] = [];
    for (let d = fromYmd; d <= day; d = addDaysYmd(d, 1)) {
      const rows = candlesByDay.get(d);
      if (rows?.length) windowCandles.push(...rows);
    }
    const data = buildFullMarketData(windowCandles);
    const htfMaps = buildHtfIndexMaps(data.m1, data.m5, data.m15);
    console.log(
      JSON.stringify({
        phase: "day_window",
        day,
        asOfs: dayAsOfs.length,
        m1: data.m1.length,
        fromYmd,
        lookbackDays: LOOKBACK_DAYS,
        elapsedMs: Date.now() - t0,
      })
    );
    for (const asOf of dayAsOfs) {
      i++;
      if (i === 1 || i === uniqueAsOfs.length || i % 25 === 0) {
        console.log(
          JSON.stringify({
            phase: "obs_progress",
            i,
            n: uniqueAsOfs.length,
            asOf,
            elapsedMs: Date.now() - t0,
          })
        );
      }
      const { obs, ctx, m1Prefix } = observationAtAsOf(data, asOf, htfMaps);
      featByAsOf.set(
        asOf,
        enrichFeatures(stampFeatByAsOf.get(asOf) ?? {}, obs, ctx, m1Prefix, {
          includeEqh: smoke,
        })
      );
    }
    // Drop candle days no longer needed for subsequent lookbacks.
    const nextDay = sortedDayEntries[di + 1]?.[0];
    const retainFrom = nextDay ? addDaysYmd(nextDay, -LOOKBACK_DAYS) : day;
    for (const d of [...candlesByDay.keys()]) {
      if (d < retainFrom) candlesByDay.delete(d);
    }
  }

  const enrichedWork = work.map((s) => ({
    ...s,
    featuresAtT: featByAsOf.get(s.asOf) ?? s.featuresAtT,
  }));
  const enriched =
    limit > 0 ? [...enrichedWork, ...stamps.slice(enrichedWork.length)] : enrichedWork;

  const covered = enrichedWork.filter(
    (s) =>
      Array.isArray(s.featuresAtT.liquidityLevels) &&
      s.featuresAtT.liquidityRepresentationVersion === LIQUIDITY_REPRESENTATION_VERSION
  );
  const withProvenance = covered.filter((s) =>
    ((s.featuresAtT.liquidityLevels as LiquidityLevelStamp[]) ?? []).some(
      (l) =>
        l.formedAt != null ||
        l.qualifyingTickAt != null ||
        l.qualifyingTickPrice != null ||
        l.candleId != null
    )
  );

  const freq = buildFreqReport(enrichedWork);
  const at = new Date().toISOString();
  const stampTag = at.replace(/[:.]/g, "-");
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(researchDir, { recursive: true });

  if (limit === 0 || merge) {
    if (limit === 0) {
      const backupPath = join(
        reportsDir,
        `force-wait-shadow-stamps-y1500-pre-liq-v1-${stampTag}.json`
      );
      copyFileSync(latestPath, backupPath);
    }
    const byAsOf = new Map(enrichedWork.map((s) => [s.asOf, s]));
    dump.stamps = stamps.map((s) => byAsOf.get(s.asOf) ?? s);
    dump.at = at;
    const allCovered = dump.stamps.filter(
      (s) =>
        Array.isArray(s.featuresAtT?.liquidityLevels) &&
        s.featuresAtT?.liquidityRepresentationVersion === LIQUIDITY_REPRESENTATION_VERSION
    );
    const allHtf = dump.stamps.filter(
      (s) => s.featuresAtT?.htfBiasRepresentationVersion === HTF_BIAS_REPRESENTATION_VERSION
    );
    dump.enrichment = {
      kind: "liquidity_repr_v1+liquidity_map_repr_v0",
      method:
        "PIT observation rebuild (windowed ReplayMarketData) → stampLiquidityFeaturesFromObs + stampLiquidityMapFromObsAndContext (+ EQH areas on smoke only); HTF stack also attached",
      note: "Additive; liquidityLevels retained; outcomes/c1Shadow untouched; no unlock/ALS/score",
      liquidityRepresentationVersion: LIQUIDITY_REPRESENTATION_VERSION,
      liquidityMapRepresentationVersion: LIQUIDITY_MAP_REPRESENTATION_VERSION,
      htfBiasRepresentationVersion: HTF_BIAS_REPRESENTATION_VERSION,
      stampsEnrichedThisRun: enrichedWork.length,
      stampsWithLiquidityV1: allCovered.length,
      stampsWithHtfBiasStack: allHtf.length,
      stampsTotal: dump.stamps.length,
      partial: limit > 0 || offset > 0,
      lookbackDays: LOOKBACK_DAYS,
    };
    dump.schemaNote = {
      ...(dump.schemaNote ?? {}),
      liquidityLevels:
        "Full obs.liquidity.levels[] — {id?,label,price,side?,taken,status?,source?,formedAt?,qualifyingTickAt?,qualifyingTickPrice?,candleId?,why?} — liquidity_repr_v1. sweepPresent retained.",
      liquidityPools:
        "Unified liquidityPools[] — named_level / relative_equal / equal_area / gap_band — liquidity_map_repr_v0 (NY-pre, ORG, gaps, REH/REL, EQH/EQL when present at asOf).",
      htfBiasStack:
        "htfBiasDaily/M15/M5 + htfAligned + nested htfBias — htf_bias_repr_v0; tradeableBias retained.",
    };
    writeFileSync(latestPath, JSON.stringify(dump, null, 2));
    writeFileSync(
      jsonlPath,
      dump.stamps.map((s) => JSON.stringify(s)).join("\n") + "\n"
    );
    if (limit === 0) {
      writeFileSync(
        join(reportsDir, `force-wait-shadow-stamps-y1500-${stampTag}.json`),
        JSON.stringify(dump, null, 2)
      );
    }

    const schemaMd = `# FORCE_WAIT shadow stamp dump — schema (DEV Y=1500)

**KIND:** \`force_wait_shadow_stamps_y1500\`  
**BASELINE:** baseline-v2  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** not touched  
**REPRESENTATION:** \`contradiction_repr_v1\` + \`htf_bias_repr_v0\` + \`liquidity_repr_v1\` + \`liquidity_map_repr_v0\`

## Liquidity (\`liquidity_repr_v1\`)

\`featuresAtT.liquidityLevels[]\` — full array from \`obs.liquidity.levels\` at asOf:

| Field | Required |
|-------|----------|
| label, price, taken | yes |
| side, status, source | yes when present on obs |
| formedAt, qualifyingTickAt, qualifyingTickPrice | yes when present on obs |
| id, candleId, why | yes when present on obs |

Session asia/london/ny_rth extremes carry \`formedAt\` from \`ctx.sessions.*Time\` (extreme print time).

\`sweepPresent\` retained for back-compat.

## Liquidity map (\`liquidity_map_repr_v0\`)

\`featuresAtT.liquidityPools[]\` — unified PIT pools (named_level / relative_equal / equal_area / gap_band) including NY-pre, ORG, NDOG/NWOG, REH/REL, EQH/EQL when present at asOf. Detectors unchanged; missing values omitted honestly.

## HTF bias stack (\`htf_bias_repr_v0\`)

\`htfBiasDaily\`, \`htfBiasM15\`, \`htfBiasM5\`, \`htfAligned\`, nested \`htfBias\` — \`tradeableBias\` unchanged.
`;
    writeFileSync(schemaPath, schemaMd);
  }

  const freqJsonPath = join(
    reportsDir,
    limit > 0
      ? `liquidity-representation-freq-partial-${stampTag}.json`
      : "liquidity-representation-freq-latest.json"
  );
  writeFileSync(freqJsonPath, JSON.stringify({ ...freq, elapsedMs: Date.now() - t0 }, null, 2));
  if (limit === 0) {
    writeFileSync(
      join(reportsDir, `liquidity-representation-freq-${stampTag}.json`),
      JSON.stringify({ ...freq, elapsedMs: Date.now() - t0 }, null, 2)
    );
  }

  const freqMdPath = join(
    researchDir,
    limit > 0 ? `karen-liquidity-representation-freq-partial.md` : `karen-liquidity-representation-freq.md`
  );
  const sw = freq.sweepPresentHidesDiversity as Record<
    string,
    {
      n: number;
      distinctLiquidityFingerprintsV0: number;
      distinctLiquidityFingerprintsV1: number;
      timingAddsExtraDiversity: boolean;
      stampsWithAnyTimingFields: number;
      statusMixes: Record<string, number>;
      sidePatterns: Record<string, number>;
    }
  >;
  const freqMd = `# Karen liquidity representation — frequency (outcome-blind)

**DATE:** ${freq.at.slice(0, 10)}  
**VERSION:** \`${LIQUIDITY_REPRESENTATION_VERSION}\`  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**OUTCOMES:** NO · **UNLOCK:** PARKED  
${limit > 0 ? `\n**PARTIAL RUN:** n=${work.length} stamps (smoke/limit) — not full Y=1500.\n` : ""}

## Coverage

| Metric | Value |
|--------|------:|
| Stamps processed | ${freq.stampsWithLiquidityLevels} |
| Buy-side level rows | ${freq.levelRows.buy_side} |
| Sell-side level rows | ${freq.levelRows.sell_side} |
| Both sides on same stamp | ${freq.bothSidesOnSameStamp} |
| Stamps with formedAt | ${freq.provenanceCoverage.stampsWithFormedAt} |
| Level rows with formedAt (%) | ${(freq.provenanceCoverage as { pctLevelRowsWithFormedAt: number }).pctLevelRowsWithFormedAt} |
| PD rows with formedAt (%) | ${(freq.provenanceCoverage as { pd: { pctFormedAt: number; levelRowsWithFormedAt: number; levelRows: number } }).pd.pctFormedAt} (${(freq.provenanceCoverage as { pd: { levelRowsWithFormedAt: number; levelRows: number } }).pd.levelRowsWithFormedAt}/${(freq.provenanceCoverage as { pd: { levelRows: number } }).pd.levelRows}) |
| Session (asia/london/ny_rth) rows with formedAt (%) | ${(freq.provenanceCoverage as { sessionAsiaLondonNyRth: { pctFormedAt: number; levelRowsWithFormedAt: number; levelRows: number } }).sessionAsiaLondonNyRth.pctFormedAt} (${(freq.provenanceCoverage as { sessionAsiaLondonNyRth: { levelRowsWithFormedAt: number; levelRows: number } }).sessionAsiaLondonNyRth.levelRowsWithFormedAt}/${(freq.provenanceCoverage as { sessionAsiaLondonNyRth: { levelRows: number } }).sessionAsiaLondonNyRth.levelRows}) |
| Stamps with qualifyingTick* | ${freq.provenanceCoverage.stampsWithQualifyingTick} |
| Stamps with candleId | ${freq.provenanceCoverage.stampsWithCandleId} |
| Stamps with HTF stack (daily/m15/m5/aligned) | ${(freq as { htfBiasStackCoverage: { stampsWithFullStack: number; pctStampsWithFullStack: number } }).htfBiasStackCoverage.stampsWithFullStack} (${(freq as { htfBiasStackCoverage: { pctStampsWithFullStack: number } }).htfBiasStackCoverage.pctStampsWithFullStack}%) |

## Status counts (level rows)

${Object.entries(freq.statusCounts as Record<string, number>)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- \`${k}\`: ${v}`)
  .join("\n")}

## Richness vs \`sweepPresent\` / vs v0 (no timing)

| sweepPresent | n | distinct v0 fingerprints | distinct v1 (+timing) | timing adds diversity | stamps with timing fields |
|--------------|--:|-------------------------:|----------------------:|:---------------------:|--------------------------:|
| true | ${sw.true.n} | ${sw.true.distinctLiquidityFingerprintsV0} | ${sw.true.distinctLiquidityFingerprintsV1} | ${sw.true.timingAddsExtraDiversity ? "YES" : "no"} | ${sw.true.stampsWithAnyTimingFields} |
| false | ${sw.false.n} | ${sw.false.distinctLiquidityFingerprintsV0} | ${sw.false.distinctLiquidityFingerprintsV1} | ${sw.false.timingAddsExtraDiversity ? "YES" : "no"} | ${sw.false.stampsWithAnyTimingFields} |
| null | ${sw.null.n} | ${sw.null.distinctLiquidityFingerprintsV0} | ${sw.null.distinctLiquidityFingerprintsV1} | ${sw.null.timingAddsExtraDiversity ? "YES" : "no"} | ${sw.null.stampsWithAnyTimingFields} |

Global: v0 distinct=${(freq.richness as { distinctFingerprintsV0Core: number }).distinctFingerprintsV0Core}, v1 distinct=${(freq.richness as { distinctFingerprintsV1WithTiming: number }).distinctFingerprintsV1WithTiming}, richerThanSweepPresent=${freq.richerThanSweepPresent}.

JSON: \`${freqJsonPath.replace(/\\/g, "/")}\`
`;
  writeFileSync(freqMdPath, freqMd);

  console.log(
    JSON.stringify(
      {
        ok: true,
        version: LIQUIDITY_REPRESENTATION_VERSION,
        stampsProcessed: work.length,
        covered: covered.length,
        withProvenance: withProvenance.length,
        freqJsonPath,
        freqMdPath,
        richerThanSweepPresent: freq.richerThanSweepPresent,
        elapsedMs: Date.now() - t0,
      },
      null,
      2
    )
  );
}

main();
