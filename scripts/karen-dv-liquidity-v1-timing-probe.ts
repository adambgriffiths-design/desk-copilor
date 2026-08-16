/**
 * Micro PIT probe: liquidity_repr_v1 timing fields on one/few asOfs.
 * Outcome-blind. No trading changes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { buildMarketObservation } from "../lib/observation-engine";
import { buildMarketState } from "../lib/market-state-build";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import {
  buildHtfIndexMaps,
  lastBarIndexAtOrBefore,
} from "../lib/research/replay/fast-slice";
import type { ReplayMarketData } from "../lib/research/replay/types";
import type { Bar } from "../lib/types";
import {
  LIQUIDITY_REPRESENTATION_VERSION,
  stampLiquidityFeaturesFromObs,
  type LiquidityLevelStamp,
} from "../lib/liquidity-stamp-features";

const root = process.cwd();
const candlesPath = join(
  root,
  "data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m/candles-1m.json"
);
const latestPath = join(
  root,
  "data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json"
);
const reportsDir = join(root, "data/karen-decision-validation/acquisition/reports");
const researchDir = join(root, "data/research");

const LOOKBACK_DAYS = 3;
const MAX_STAMPS = Number(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "40"
);

type Candle = { time: string; open: number; high: number; low: number; close: number };

function ymdOf(iso: string) {
  return iso.slice(0, 10);
}
function addDaysYmd(ymd: string, days: number) {
  return new Date(Date.parse(`${ymd}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
function inYmdRange(iso: string, fromYmd: string, toYmd: string) {
  const d = ymdOf(iso);
  return d >= fromYmd && d <= toYmd;
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
function buildData(rows: Candle[]): ReplayMarketData {
  return {
    symbol: "MNQ1!",
    daily: toBars(dailyFromM1(rows)),
    m15: toBars(rollup(rows, 15)),
    m5: toBars(rollup(rows, 5)),
    m1: toBars(rows),
  };
}

function obsAt(data: ReplayMarketData, asOfIso: string, maps: ReturnType<typeof buildHtfIndexMaps>) {
  const asOf = new Date(asOfIso);
  const idx = lastBarIndexAtOrBefore(data.m1, asOf);
  if (idx < 0) throw new Error(`no bar for ${asOfIso}`);
  const cutoff = new ReplayDataCutoff(data, asOf);
  const pitClose = data.m1[idx]!.close;
  const ctx = cutoff.buildContextAtBarIndex(idx, maps, pitClose);
  const chartSnapshot = buildResearchChartSnapshotFromBars({
    bars: data.m1.slice(0, idx + 1),
    symbol: data.symbol,
    asOf,
    timeframe: "1",
  });
  const state = buildMarketState({
    ctx,
    chartSnapshot,
    symbol: data.symbol,
    timeframe: "1",
    authoritativePrice: {
      value: pitClose,
      source: "yahoo_bar_close",
      timestamp: asOf.getTime(),
      ageMs: 0,
    },
  });
  return buildMarketObservation(ctx, state);
}

function fp(levels: LiquidityLevelStamp[], mode: "v0" | "v1") {
  return levels
    .map((l) => {
      const core = `${l.label}:${l.side ?? "?"}:${l.status ?? "?"}:${l.taken}`;
      if (mode === "v0") return core;
      return `${core}#${l.formedAt ?? ""}@${l.qualifyingTickAt ?? ""}@${l.qualifyingTickPrice ?? ""}@${l.candleId ?? ""}`;
    })
    .sort()
    .join("|");
}

function main() {
  const t0 = Date.now();
  const dump = JSON.parse(readFileSync(latestPath, "utf8")) as {
    stamps: Array<{ asOf: string; population: string; featuresAtT: Record<string, unknown> }>;
  };
  const work = dump.stamps.slice(0, MAX_STAMPS);
  const candles = JSON.parse(readFileSync(candlesPath, "utf8")) as Candle[];
  console.log(JSON.stringify({ phase: "start", n: work.length, lookbackDays: LOOKBACK_DAYS }));

  const rows: Array<{
    asOf: string;
    population: string;
    sweepPresent: boolean | null;
    levels: LiquidityLevelStamp[];
  }> = [];

  const byDay = new Map<string, typeof work>();
  for (const s of work) {
    const d = ymdOf(s.asOf);
    const arr = byDay.get(d) ?? [];
    arr.push(s);
    byDay.set(d, arr);
  }

  let i = 0;
  for (const [day, dayStamps] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const from = addDaysYmd(day, -LOOKBACK_DAYS);
    const window = candles.filter((c) => inYmdRange(c.time, from, day));
    const data = buildData(window);
    const maps = buildHtfIndexMaps(data.m1, data.m5, data.m15);
    console.log(
      JSON.stringify({
        phase: "day",
        day,
        m1: data.m1.length,
        stamps: dayStamps.length,
        elapsedMs: Date.now() - t0,
      })
    );
    for (const s of dayStamps) {
      i++;
      const t1 = Date.now();
      const obs = obsAt(data, s.asOf, maps);
      const liq = stampLiquidityFeaturesFromObs(obs);
      const sweepPresent =
        typeof s.featuresAtT.sweepPresent === "boolean"
          ? (s.featuresAtT.sweepPresent as boolean)
          : null;
      rows.push({
        asOf: s.asOf,
        population: s.population,
        sweepPresent,
        levels: liq.liquidityLevels,
      });
      if (i === 1 || i % 5 === 0 || i === work.length) {
        console.log(
          JSON.stringify({
            phase: "obs",
            i,
            n: work.length,
            asOf: s.asOf,
            obsMs: Date.now() - t1,
            levels: liq.liquidityLevels.length,
            timingRows: liq.liquidityLevels.filter(
              (l) =>
                l.formedAt != null ||
                l.qualifyingTickAt != null ||
                l.candleId != null
            ).length,
            elapsedMs: Date.now() - t0,
          })
        );
        // Checkpoint so a mid-run kill still yields freq artifacts.
        writeFileSync(
          join(reportsDir, "liquidity-repr-v1-probe-checkpoint.json"),
          JSON.stringify({ at: new Date().toISOString(), rows }, null, 2)
        );
      }
    }
  }

  // Enrich the worked prefix on the dump (full write only if MAX_STAMPS covers all — else partial artifacts)
  const enrichedPrefix = work.map((s, idx) => {
    const r = rows[idx]!;
    const levels = r.levels;
    return {
      ...s,
      featuresAtT: {
        ...s.featuresAtT,
        liquidityLevels: levels,
        liquidityLevelCount: levels.length,
        liquidityTakenCount: levels.filter((l) => l.taken === true).length,
        liquidityRepresentationVersion: LIQUIDITY_REPRESENTATION_VERSION,
        sweepPresent: s.featuresAtT.sweepPresent ?? levels.some((l) => l.taken === true),
      },
    };
  });

  const statusCounts: Record<string, number> = {};
  const sideCounts: Record<string, number> = {};
  let buyRows = 0;
  let sellRows = 0;
  let bothSides = 0;
  let stampsFormed = 0;
  let stampsTick = 0;
  let stampsCandle = 0;
  const under: Record<
    string,
    { n: number; v0: Set<string>; v1: Set<string>; withTiming: number }
  > = {
    true: { n: 0, v0: new Set(), v1: new Set(), withTiming: 0 },
    false: { n: 0, v0: new Set(), v1: new Set(), withTiming: 0 },
    null: { n: 0, v0: new Set(), v1: new Set(), withTiming: 0 },
  };
  const allV0 = new Set<string>();
  const allV1 = new Set<string>();

  for (const r of rows) {
    let buy = 0;
    let sell = 0;
    let hasF = false;
    let hasT = false;
    let hasC = false;
    for (const l of r.levels) {
      statusCounts[l.status ?? "null"] = (statusCounts[l.status ?? "null"] ?? 0) + 1;
      sideCounts[l.side ?? "null"] = (sideCounts[l.side ?? "null"] ?? 0) + 1;
      if (l.side === "buy_side") {
        buyRows++;
        buy++;
      } else if (l.side === "sell_side") {
        sellRows++;
        sell++;
      }
      if (l.formedAt != null) hasF = true;
      if (l.qualifyingTickAt != null || l.qualifyingTickPrice != null) hasT = true;
      if (l.candleId != null) hasC = true;
    }
    if (buy > 0 && sell > 0) bothSides++;
    if (hasF) stampsFormed++;
    if (hasT) stampsTick++;
    if (hasC) stampsCandle++;
    const k =
      r.sweepPresent === true ? "true" : r.sweepPresent === false ? "false" : "null";
    under[k]!.n++;
    const f0 = fp(r.levels, "v0");
    const f1 = fp(r.levels, "v1");
    under[k]!.v0.add(f0);
    under[k]!.v1.add(f1);
    allV0.add(f0);
    allV1.add(f1);
    if (hasF || hasT || hasC) under[k]!.withTiming++;
  }

  const at = new Date().toISOString();
  const stampTag = at.replace(/[:.]/g, "-");
  const freq = {
    at,
    kind: "liquidity_representation_freq_v1",
    EDGE_CLAIM: "NONE",
    HOLDOUT: "SEALED",
    VAL: "DO_NOT_TOUCH",
    OUTCOMES_MINED: "NO",
    UNLOCK: "PARKED",
    representationVersion: LIQUIDITY_REPRESENTATION_VERSION,
    lookbackDaysEnrich: LOOKBACK_DAYS,
    note: "Priority #1 timing probe/enrich; lookback shortened for tractability; PIT builder same Layer-1 path",
    stampsProcessed: rows.length,
    stampsTotalInDump: dump.stamps.length,
    partial: rows.length < dump.stamps.length,
    levelRows: { buy_side: buyRows, sell_side: sellRows },
    bothSidesOnSameStamp: bothSides,
    statusCounts,
    sideCounts,
    provenanceCoverage: {
      stampsWithFormedAt: stampsFormed,
      stampsWithQualifyingTick: stampsTick,
      stampsWithCandleId: stampsCandle,
    },
    richness: {
      distinctFingerprintsV0Core: allV0.size,
      distinctFingerprintsV1WithTiming: allV1.size,
      timingAddsExtraDiversityVsV0: allV1.size > allV0.size,
      richerThanSweepPresent: Object.values(under).some((u) => u.v0.size > 1),
    },
    sweepPresentHidesDiversity: {
      true: {
        n: under.true!.n,
        distinctV0: under.true!.v0.size,
        distinctV1: under.true!.v1.size,
        timingAddsExtraDiversity: under.true!.v1.size > under.true!.v0.size,
        withTiming: under.true!.withTiming,
      },
      false: {
        n: under.false!.n,
        distinctV0: under.false!.v0.size,
        distinctV1: under.false!.v1.size,
        timingAddsExtraDiversity: under.false!.v1.size > under.false!.v0.size,
        withTiming: under.false!.withTiming,
      },
      null: {
        n: under.null!.n,
        distinctV0: under.null!.v0.size,
        distinctV1: under.null!.v1.size,
        timingAddsExtraDiversity: under.null!.v1.size > under.null!.v0.size,
        withTiming: under.null!.withTiming,
      },
    },
    elapsedMs: Date.now() - t0,
  };

  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(researchDir, { recursive: true });

  const freqJson = join(reportsDir, `liquidity-representation-freq-v1-${stampTag}.json`);
  const freqLatest = join(reportsDir, "liquidity-representation-freq-latest.json");
  writeFileSync(freqJson, JSON.stringify(freq, null, 2));
  writeFileSync(freqLatest, JSON.stringify(freq, null, 2));

  // Partial stamp snapshot (does not overwrite full latest unless full)
  const partialDumpPath = join(
    reportsDir,
    `force-wait-shadow-stamps-y1500-liq-v1-partial-${stampTag}.json`
  );
  writeFileSync(
    partialDumpPath,
    JSON.stringify(
      {
        at,
        kind: "liquidity_repr_v1_partial_enrich",
        stamps: enrichedPrefix,
        enrichment: {
          liquidityRepresentationVersion: LIQUIDITY_REPRESENTATION_VERSION,
          lookbackDays: LOOKBACK_DAYS,
          stampsEnriched: enrichedPrefix.length,
          note: "Partial enrich for priority #1; full dump latest.json unchanged until full PASS",
        },
      },
      null,
      2
    )
  );

  const mdPath = join(researchDir, "karen-liquidity-representation-freq.md");
  const sw = freq.sweepPresentHidesDiversity;
  writeFileSync(
    mdPath,
    `# Karen liquidity representation — frequency (outcome-blind)

**DATE:** ${at.slice(0, 10)}  
**VERSION:** \`${LIQUIDITY_REPRESENTATION_VERSION}\`  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**OUTCOMES:** NO · **UNLOCK:** PARKED  

${freq.partial ? `**PARTIAL enrich:** ${rows.length} / ${dump.stamps.length} stamps (lookbackDays=${LOOKBACK_DAYS}). Full Y=1500 dump not overwritten.\n` : ""}

## Framing

- \`liquidity_repr_v0\` = structured levels (side **not** the gap)
- \`liquidity_repr_v1\` = v0 + timing/provenance (\`formedAt\`, \`qualifyingTickAt\`, \`qualifyingTickPrice\`, \`candleId\`)
- Priorities #2/#3 **NOT_STARTED**

## Coverage

| Metric | Value |
|--------|------:|
| Stamps processed | ${rows.length} |
| Buy-side level rows | ${buyRows} |
| Sell-side level rows | ${sellRows} |
| Both sides on same stamp | ${bothSides} |
| Stamps with formedAt | ${stampsFormed} |
| Stamps with qualifyingTick* | ${stampsTick} |
| Stamps with candleId | ${stampsCandle} |

## Status counts

${Object.entries(statusCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- \`${k}\`: ${v}`)
  .join("\n")}

## Richness vs sweepPresent / vs v0

| sweepPresent | n | distinct v0 | distinct v1 (+timing) | timing adds diversity | with timing fields |
|--------------|--:|------------:|----------------------:|:---------------------:|-------------------:|
| true | ${sw.true.n} | ${sw.true.distinctV0} | ${sw.true.distinctV1} | ${sw.true.timingAddsExtraDiversity ? "YES" : "no"} | ${sw.true.withTiming} |
| false | ${sw.false.n} | ${sw.false.distinctV0} | ${sw.false.distinctV1} | ${sw.false.timingAddsExtraDiversity ? "YES" : "no"} | ${sw.false.withTiming} |
| null | ${sw.null.n} | ${sw.null.distinctV0} | ${sw.null.distinctV1} | ${sw.null.timingAddsExtraDiversity ? "YES" : "no"} | ${sw.null.withTiming} |

Global fingerprints: v0=${allV0.size}, v1=${allV1.size}, richerThanSweepPresent=${freq.richness.richerThanSweepPresent}.

## Artifacts

- JSON: \`${freqJson.replace(/\\\\/g, "/")}\`
- Partial stamps: \`${partialDumpPath.replace(/\\\\/g, "/")}\`
- Spec: \`data/research/karen-liquidity-representation-v1.md\`
`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        version: LIQUIDITY_REPRESENTATION_VERSION,
        ...freq.richness,
        provenanceCoverage: freq.provenanceCoverage,
        freqJson,
        mdPath,
        partialDumpPath,
        elapsedMs: Date.now() - t0,
      },
      null,
      2
    )
  );
}

main();
