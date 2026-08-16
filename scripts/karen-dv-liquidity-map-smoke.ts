/**
 * Small PIT-safe smoke for liquidity_map_repr_v0 (low-RAM).
 *
 * Does NOT run full Y=1500 enrich. Does NOT inspect outcomes / unlock.
 *
 *   npx tsx scripts/karen-dv-liquidity-map-smoke.ts
 *   npx tsx scripts/karen-dv-liquidity-map-smoke.ts --limit=8
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
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
import { detectEqhEqlLiquidity } from "../lib/research/eqh-eql-liquidity";
import {
  LIQUIDITY_MAP_REPRESENTATION_VERSION,
  liquidityMapStructureCoverage,
  stampLiquidityMapFromObsAndContext,
  type LiquidityPoolStamp,
} from "../lib/liquidity-map-stamp-features";
import { LIQUIDITY_REPRESENTATION_VERSION } from "../lib/liquidity-stamp-features";

const root = process.cwd();
const reportsDir = join(root, "data/karen-decision-validation/acquisition/reports");
const researchDir = join(root, "data/research");
const latestPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.json");
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

const limit = Math.min(12, Math.max(1, argNum("limit", 8)));
const LOOKBACK_DAYS = 4;

type Candle = { time: string; open: number; high: number; low: number; close: number };

function ymdOf(iso: string): string {
  return iso.slice(0, 10);
}
function addDaysYmd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
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

function observationAtAsOf(
  data: ReplayMarketData,
  asOfIso: string,
  htfMaps: ReturnType<typeof buildHtfIndexMaps>
) {
  const asOf = new Date(asOfIso);
  const barIndex = lastBarIndexAtOrBefore(data.m1, asOf);
  if (barIndex < 0) {
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

type Cov = ReturnType<typeof liquidityMapStructureCoverage>;

function main() {
  const t0 = Date.now();
  const dump = JSON.parse(readFileSync(latestPath, "utf8")) as {
    stamps: Array<{ asOf: string }>;
  };
  const asOfs = dump.stamps.map((s) => s.asOf).slice(0, limit);
  if (asOfs.length === 0) throw new Error("no stamps in latest dump");

  const allCandles = JSON.parse(readFileSync(candlesPath, "utf8")) as Candle[];
  const candlesByDay = new Map<string, Candle[]>();
  for (const c of allCandles) {
    const d = ymdOf(c.time);
    const arr = candlesByDay.get(d) ?? [];
    arr.push(c);
    candlesByDay.set(d, arr);
  }

  const byDay = new Map<string, string[]>();
  for (const asOf of asOfs) {
    const d = ymdOf(asOf);
    const arr = byDay.get(d) ?? [];
    arr.push(asOf);
    byDay.set(d, arr);
  }

  const rows: Array<{
    asOf: string;
    poolCount: number;
    levelCount: number;
    coverage: Cov;
    sampleIds: string[];
  }> = [];
  const ever: Cov = {
    ny_pre: false,
    org: false,
    gaps: false,
    reh_rel: false,
    relativeEqualPools: false,
    eqh_eql: false,
    ids: [],
  };

  for (const [day, dayAsOfs] of [...byDay.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const fromYmd = addDaysYmd(day, -LOOKBACK_DAYS);
    const windowCandles: Candle[] = [];
    for (let d = fromYmd; d <= day; d = addDaysYmd(d, 1)) {
      const rowsDay = candlesByDay.get(d);
      if (rowsDay?.length) windowCandles.push(...rowsDay);
    }
    const data = buildFullMarketData(windowCandles);
    const htfMaps = buildHtfIndexMaps(data.m1, data.m5, data.m15);
    console.log(
      JSON.stringify({
        phase: "day_window",
        day,
        asOfs: dayAsOfs.length,
        m1: data.m1.length,
      })
    );
    for (const asOf of dayAsOfs) {
      const { obs, ctx, m1Prefix } = observationAtAsOf(data, asOf, htfMaps);
      const eqh =
        m1Prefix.length > 20
          ? detectEqhEqlLiquidity(m1Prefix, {
              symbol: "MNQ1!",
              lookback: 180,
              asOfIndex: m1Prefix.length - 1,
            })
          : null;
      const stamp = stampLiquidityMapFromObsAndContext({
        obs,
        ctx,
        eqhAreas: eqh?.areas ?? null,
      });
      const coverage = liquidityMapStructureCoverage(stamp.liquidityPools);
      ever.ny_pre = ever.ny_pre || coverage.ny_pre;
      ever.org = ever.org || coverage.org;
      ever.gaps = ever.gaps || coverage.gaps;
      ever.reh_rel = ever.reh_rel || coverage.reh_rel;
      ever.relativeEqualPools =
        ever.relativeEqualPools || coverage.relativeEqualPools;
      ever.eqh_eql = ever.eqh_eql || coverage.eqh_eql;
      rows.push({
        asOf,
        poolCount: stamp.liquidityPoolCount,
        levelCount: stamp.liquidityLevelCount,
        coverage,
        sampleIds: stamp.liquidityPools.slice(0, 12).map((p: LiquidityPoolStamp) => p.id),
      });
      console.log(
        JSON.stringify({
          asOf,
          pools: stamp.liquidityPoolCount,
          levels: stamp.liquidityLevelCount,
          coverage: {
            ny_pre: coverage.ny_pre,
            org: coverage.org,
            gaps: coverage.gaps,
            reh_rel: coverage.reh_rel,
            relativeEqualPools: coverage.relativeEqualPools,
            eqh_eql: coverage.eqh_eql,
          },
        })
      );
    }
  }

  const structuresPresent = [
    ever.ny_pre ? "NY-pre" : null,
    ever.org ? "ORG" : null,
    ever.gaps ? "gaps(NDOG/NWOG/ORG_band)" : null,
    ever.reh_rel ? "REH/REL(obs)" : null,
    ever.relativeEqualPools ? "relativeEqualPools" : null,
    ever.eqh_eql ? "EQH/EQL" : null,
  ].filter(Boolean) as string[];

  const pass =
    ever.ny_pre &&
    ever.org &&
    ever.gaps &&
    (ever.reh_rel || ever.relativeEqualPools) &&
    ever.eqh_eql;

  const at = new Date().toISOString();
  const report = {
    at,
    kind: "liquidity_map_repr_v0_smoke",
    version: LIQUIDITY_MAP_REPRESENTATION_VERSION,
    liquidityRepresentationVersion: LIQUIDITY_REPRESENTATION_VERSION,
    n: rows.length,
    lookbackDays: LOOKBACK_DAYS,
    pass,
    ever,
    structuresPresent,
    rows,
    elapsedMs: Date.now() - t0,
    note: "Outcome-blind coverage only. No unlock / VAL / HOLDOUT / trading changes.",
  };

  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(researchDir, { recursive: true });
  const jsonPath = join(reportsDir, "liquidity-map-repr-v0-smoke-latest.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdPath = join(researchDir, "karen-liquidity-map-repr-v0-smoke.md");
  const md = `# KAREN — liquidity map representation smoke (\`liquidity_map_repr_v0\`)

**DATE:** ${at.slice(0, 10)}  
**SCOPE:** Small PIT-safe coverage (n=${rows.length}) — not full Y=1500.  
**OUTCOMES:** NO · **UNLOCK:** PARKED · **VAL/HOLDOUT:** untouched  

## Verdict

**${pass ? "PASS" : "PARTIAL"}** — structures observed across smoke asOfs: ${structuresPresent.join(", ") || "(none)"}

| Structure | Appeared in smoke? |
|-----------|-------------------|
| NY-pre H/L | ${ever.ny_pre ? "YES" : "NO"} |
| ORG | ${ever.org ? "YES" : "NO"} |
| Gaps (NDOG/NWOG/ORG band) | ${ever.gaps ? "YES" : "NO"} |
| REH/REL (\`obs.reh_rel\`) | ${ever.reh_rel ? "YES" : "NO"} |
| relativeEqualPools | ${ever.relativeEqualPools ? "YES" : "NO"} |
| EQH/EQL (research areas) | ${ever.eqh_eql ? "YES" : "NO"} |

## Notes

- Stamp helper: \`lib/liquidity-map-stamp-features.ts\`
- Keeps \`liquidityLevels\` + \`liquidity_repr_v1\`
- Additive pools only; detectors unchanged
- EQH/EQL stamped only when \`detectEqhEqlLiquidity\` returns areas at asOf (not invented)

## Per-asOf (truncated)

${rows
  .map(
    (r) =>
      `- \`${r.asOf}\` — pools=${r.poolCount} levels=${r.levelCount} · ny_pre=${r.coverage.ny_pre} org=${r.coverage.org} gaps=${r.coverage.gaps} reh=${r.coverage.reh_rel} eqh=${r.coverage.eqh_eql}`
  )
  .join("\n")}

JSON: \`${jsonPath.replace(/\\/g, "/")}\`
`;
  writeFileSync(mdPath, md);
  console.log(
    JSON.stringify({
      ok: pass,
      n: rows.length,
      structuresPresent,
      mdPath,
      jsonPath,
      elapsedMs: Date.now() - t0,
    })
  );
  if (!pass) process.exitCode = 1;
}

main();
