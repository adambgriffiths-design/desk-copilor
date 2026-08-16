/**
 * Enrich FORCE_WAIT Y=1500 shadow stamps with HTF bias stack + liquidity levels.
 *
 * Observation-only PIT rebuild at each stamp asOf (same Layer-1 path as DV):
 *   cutoff → buildContext → buildMarketState → buildMarketObservation
 *   → stampHtfBiasFeaturesFromObs + stampLiquidityFeaturesFromObs
 *
 * Additive only: c1Shadow / outcomes / legacy fields untouched.
 * No unlock / ALS / score / VAL / trading behavior.
 *
 *   npx tsx scripts/karen-dv-enrich-htf-liquidity-stamps.ts
 *   npx tsx scripts/karen-dv-enrich-htf-liquidity-stamps.ts --limit=20
 *   npx tsx scripts/karen-dv-enrich-htf-liquidity-stamps.ts --smoke
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
  CONTRADICTION_REPRESENTATION_VERSION,
  stampContradictionItemsFromDvEvidence,
} from "../lib/contradiction-stamp-features";

const root = process.cwd();
const reportsDir = join(root, "data/karen-decision-validation/acquisition/reports");
const latestPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.json");
const jsonlPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.jsonl");
const schemaPath = join(reportsDir, "force-wait-shadow-stamps-y1500.schema.md");
const candlesPath = join(
  root,
  "data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m/candles-1m.json"
);
const researchDir = join(root, "data/research");

const LOOKBACK_DAYS = 60;

function argNum(name: string, fallback: number): number {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.slice(name.length + 3)) : fallback;
}
function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const smoke = argFlag("smoke");
const limit = smoke ? Math.min(24, argNum("limit", 24)) : argNum("limit", 0);

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

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
  htfBiasDaily?: string | null;
  htfBiasM15?: string | null;
  htfBiasM5?: string | null;
  htfAligned?: boolean | "unknown" | null;
  htfBias?: unknown;
  htfBiasRepresentationVersion?: string;
  liquidityLevels?: LiquidityLevelStamp[];
  liquidityLevelCount?: number;
  liquidityTakenCount?: number;
  liquidityRepresentationVersion?: string;
  [k: string]: unknown;
};

type Stamp = {
  asOf: string;
  population: string;
  featuresAtT: Feat;
  c1Shadow?: unknown;
  [k: string]: unknown;
};

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

function rollup(bars: { time: string; open: number; high: number; low: number; close: number }[], minutes: number) {
  const out: typeof bars = [];
  let bucket: (typeof bars)[number] | null = null;
  let bucketStart = -1;
  for (const b of bars) {
    const t = Date.parse(b.time);
    const start = Math.floor(t / (minutes * 60_000)) * (minutes * 60_000);
    if (bucket == null || start !== bucketStart) {
      if (bucket) out.push(bucket);
      bucketStart = start;
      bucket = { time: new Date(start).toISOString(), open: b.open, high: b.high, low: b.low, close: b.close };
    } else {
      bucket.high = Math.max(bucket.high, b.high);
      bucket.low = Math.min(bucket.low, b.low);
      bucket.close = b.close;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

function dailyFromM1(bars: { time: string; open: number; high: number; low: number; close: number }[]) {
  const byDay = new Map<string, (typeof bars)[number]>();
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

function toBars(
  rows: { time: string; open: number; high: number; low: number; close: number }[]
): Bar[] {
  return rows.map((b) => ({
    time: new Date(b.time),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

function observationAtAsOf(
  candles: Candle[],
  asOfIso: string
): ReturnType<typeof buildMarketObservation> {
  const asOf = new Date(asOfIso);
  const day = ymdOf(asOfIso);
  const barFrom = addDaysYmd(day, -LOOKBACK_DAYS);
  const first = candles.length ? ymdOf(candles[0]!.time) : barFrom;
  const clampedFrom = first > barFrom ? first : barFrom;
  const window = candles.filter((c) => inYmdRange(c.time, clampedFrom, day));
  const m1Rows = window.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  const data: ReplayMarketData = {
    symbol: "MNQ1!",
    daily: toBars(dailyFromM1(m1Rows)),
    m15: toBars(rollup(m1Rows, 15)),
    m5: toBars(rollup(m1Rows, 5)),
    m1: toBars(m1Rows),
  };
  const cutoff = new ReplayDataCutoff(data, asOf);
  const m1 = cutoff.slicedM1();
  const pitClose = m1.at(-1)?.close ?? null;
  const ctx = cutoff.buildContext(pitClose);
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
  return buildMarketObservation(ctx, state);
}

function enrichFeatures(f: Feat, obs: ReturnType<typeof buildMarketObservation>): Feat {
  const htf = stampHtfBiasFeaturesFromObs(obs);
  const liq = stampLiquidityFeaturesFromObs(obs);
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
    htfBiasDaily: _d,
    htfBiasM15: _m15,
    htfBiasM5: _m5,
    htfAligned: _a,
    htfBias: _hb,
    htfBiasRepresentationVersion: _hv,
    liquidityLevels: _ll,
    liquidityLevelCount: _lc,
    liquidityTakenCount: _lt,
    liquidityRepresentationVersion: _lv,
    contradictionItems: _ci,
    contradictionRepresentationVersion: _cv,
    ...rest
  } = f;

  // Prefer existing confounder-derived sweepPresent; fill from levels only if null.
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
    sweepPresent,
  };
}

function countMap(xs: (string | boolean | "unknown" | null | undefined)[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of xs) {
    const k = x == null ? "null" : String(x);
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
}

function main() {
  const t0 = Date.now();
  const raw = readFileSync(latestPath, "utf8");
  const dump = JSON.parse(raw) as {
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

  const work = limit > 0 ? stamps.slice(0, limit) : stamps;
  const candles = JSON.parse(readFileSync(candlesPath, "utf8")) as Candle[];

  console.log(
    JSON.stringify({
      phase: "start",
      kind: "enrich_htf_liquidity_stamps",
      stampsTotal: stamps.length,
      stampsWork: work.length,
      smoke,
      EDGE_CLAIM: "NONE",
      HOLDOUT: "SEALED",
    })
  );

  const obsByAsOf = new Map<string, ReturnType<typeof buildMarketObservation>>();
  const uniqueAsOfs = [...new Set(work.map((s) => s.asOf))];
  let i = 0;
  for (const asOf of uniqueAsOfs) {
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
    obsByAsOf.set(asOf, observationAtAsOf(candles, asOf));
  }

  let tradeableMismatch = 0;
  const enrichedWork = work.map((s) => {
    const obs = obsByAsOf.get(s.asOf)!;
    const featuresAtT = enrichFeatures(s.featuresAtT ?? {}, obs);
    const stampedTb = String(featuresAtT.tradeableBias ?? "");
    const obsTb = String(obs.htf_bias.tradeable_bias ?? "");
    if (stampedTb && obsTb && stampedTb !== obsTb) tradeableMismatch++;
    return { ...s, featuresAtT };
  });

  // If --limit, only replace the worked prefix; keep remainder unchanged.
  const enriched =
    limit > 0
      ? [...enrichedWork, ...stamps.slice(enrichedWork.length)]
      : enrichedWork;

  const covered = enrichedWork.filter(
    (s) =>
      s.featuresAtT.htfBiasDaily != null &&
      s.featuresAtT.htfBiasM15 != null &&
      s.featuresAtT.htfBiasM5 != null &&
      s.featuresAtT.htfAligned != null &&
      Array.isArray(s.featuresAtT.liquidityLevels)
  );
  const forceWait = enrichedWork.filter((s) => s.population === "FORCE_WAIT");
  const fwCovered = forceWait.filter(
    (s) =>
      s.featuresAtT.htfBiasDaily != null &&
      Array.isArray(s.featuresAtT.liquidityLevels)
  );

  const htfDailyCounts = countMap(covered.map((s) => s.featuresAtT.htfBiasDaily));
  const htfM15Counts = countMap(covered.map((s) => s.featuresAtT.htfBiasM15));
  const htfM5Counts = countMap(covered.map((s) => s.featuresAtT.htfBiasM5));
  const htfAlignedCounts = countMap(covered.map((s) => s.featuresAtT.htfAligned));
  const statusCounts: Record<string, number> = {};
  const sideCounts: Record<string, number> = {};
  const labelCounts: Record<string, number> = {};
  let levelRows = 0;
  let takenRows = 0;
  for (const s of covered) {
    for (const l of (s.featuresAtT.liquidityLevels as LiquidityLevelStamp[]) ?? []) {
      levelRows++;
      if (l.taken === true) takenRows++;
      const st = l.status ?? "null";
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;
      const side = l.side ?? "null";
      sideCounts[side] = (sideCounts[side] ?? 0) + 1;
      labelCounts[l.label] = (labelCounts[l.label] ?? 0) + 1;
    }
  }

  const at = new Date().toISOString();
  const stampTag = at.replace(/[:.]/g, "-");
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(researchDir, { recursive: true });

  if (limit === 0) {
    const backupPath = join(
      reportsDir,
      `force-wait-shadow-stamps-y1500-pre-htf-liq-enrich-${stampTag}.json`
    );
    copyFileSync(latestPath, backupPath);

    dump.stamps = enriched;
    dump.at = at;
    dump.enrichment = {
      kind: "htf_bias_v0+liquidity_repr_v0",
      method:
        "PIT observation rebuild via ReplayDataCutoff+buildMarketObservation; stampHtfBiasFeaturesFromObs + stampLiquidityFeaturesFromObs",
      note: "Additive representation fields; outcomes/c1Shadow untouched; no unlock/ALS/score",
      htfBiasRepresentationVersion: HTF_BIAS_REPRESENTATION_VERSION,
      liquidityRepresentationVersion: LIQUIDITY_REPRESENTATION_VERSION,
      stampsEnriched: enriched.length,
      stampsWithHtfAndLiquidity: covered.length,
      tradeableBiasMismatchVsObs: tradeableMismatch,
    };
    dump.schemaNote = {
      ...(dump.schemaNote ?? {}),
      featuresAtT:
        "PIT-safe fields frozen at asOf. Includes contradictionItems, htf bias stack (daily/m15/m5/aligned), liquidityLevels[]; tradeableBias + sweepPresent retained.",
      htfBiasStack:
        "htfBiasDaily/M15/M5 + htfAligned + nested htfBias — from obs.htf_bias; version htf_bias_repr_v0. tradeableBias unchanged.",
      liquidityLevels:
        "Per-level {id?,label,price,side?,taken,status?,source?,why?} — engine NamedLevelStatus vocabulary; version liquidity_repr_v0. sweepPresent retained.",
    };

    writeFileSync(latestPath, JSON.stringify(dump, null, 2));
    writeFileSync(jsonlPath, enriched.map((s) => JSON.stringify(s)).join("\n") + "\n");
    writeFileSync(
      join(reportsDir, `force-wait-shadow-stamps-y1500-${stampTag}.json`),
      JSON.stringify(dump, null, 2)
    );
  }

  const coverage = {
    at,
    kind: "htf_liquidity_stamp_coverage_v0",
    EDGE_CLAIM: "NONE",
    HOLDOUT: "SEALED",
    VAL: "DO_NOT_TOUCH",
    OUTCOMES_MINED: "NO",
    UNLOCK: "PARKED",
    smoke,
    limit: limit || null,
    stampsTotal: stamps.length,
    stampsProcessed: work.length,
    uniqueAsOfs: uniqueAsOfs.length,
    coveredWithHtfAndLiquidity: covered.length,
    forceWaitN: forceWait.length,
    forceWaitCovered: fwCovered.length,
    tradeableBiasMismatchVsObs: tradeableMismatch,
    deterministic: tradeableMismatch === 0,
    htf: {
      representationVersion: HTF_BIAS_REPRESENTATION_VERSION,
      daily: htfDailyCounts,
      m15: htfM15Counts,
      m5: htfM5Counts,
      aligned: htfAlignedCounts,
    },
    liquidity: {
      representationVersion: LIQUIDITY_REPRESENTATION_VERSION,
      levelRows,
      takenRows,
      statusCounts,
      sideCounts,
      labelCounts,
    },
    elapsedMs: Date.now() - t0,
  };

  const coveragePath = join(
    reportsDir,
    limit > 0
      ? `htf-liquidity-stamp-coverage-partial-${stampTag}.json`
      : "htf-liquidity-stamp-coverage-latest.json"
  );
  writeFileSync(coveragePath, JSON.stringify(coverage, null, 2));
  if (limit === 0) {
    writeFileSync(
      join(reportsDir, `htf-liquidity-stamp-coverage-${stampTag}.json`),
      JSON.stringify(coverage, null, 2)
    );
  }

  // Schema note update (full run only)
  if (limit === 0) {
    const schemaMd = `# FORCE_WAIT shadow stamp dump — schema (DEV Y=1500)

**KIND:** \`force_wait_shadow_stamps_y1500\`  
**BASELINE:** baseline-v2  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** not touched  
**C4_DEFINED:** NO · **C4_SINGLE_CHANGE:** NOT_DEFINED  
**REPRESENTATION:** \`contradiction_repr_v1\` + \`htf_bias_repr_v0\` + \`liquidity_repr_v0\`

## Purpose

PIT-safe stamp table for discriminator search: baseline FORCE_WAIT / WAIT→ACT-under-c1 states with features at *t* and c1 shadow side/outcomes scored **after** freeze.

## Files

| File | Content |
|------|---------|
| \`force-wait-shadow-stamps-y1500-latest.json\` | Full report + stamps[] |
| \`force-wait-shadow-stamps-y1500-latest.jsonl\` | One stamp JSON per line |
| \`force-wait-shadow-stamps-y1500-*.json\` | Timestamped snapshot |
| \`htf-liquidity-stamp-coverage-latest.json\` | HTF + liquidity coverage counts only |

## Stamp fields

- \`population\` — \`FORCE_WAIT\` | \`WAIT_TO_ACT_NON_FORCE\` | \`FORCE_WAIT_STAY_WAIT\`
- \`featuresAtT\` — evidence + reasoningStructure + PD geometry; **no** post-t labels
- \`featuresAtT.tradeableBias\` — retained (back-compat)
- \`featuresAtT.htfBiasDaily\` / \`htfBiasM15\` / \`htfBiasM5\` / \`htfAligned\` / nested \`htfBias\` — \`htf_bias_repr_v0\`
- \`featuresAtT.liquidityLevels[]\` — per-level engine vocabulary; \`liquidity_repr_v0\`
- \`featuresAtT.sweepPresent\` — retained (back-compat)
- \`featuresAtT.contradictionItems\` — typed (\`contradiction_repr_v1\`)
- \`c1Shadow\` — shadow side/outcomes **after** freeze (not features)

## Provenance

HTF + liquidity enriched via PIT observation rebuild (\`ReplayDataCutoff\` → \`buildMarketObservation\`) — same Layer-1 objects used at decision time. Full DV dual-experiment regenerate not required for these fields.
`;
    writeFileSync(schemaPath, schemaMd);
  }

  console.log(JSON.stringify({ ok: true, coveragePath, ...coverage }, null, 2));
}

main();
