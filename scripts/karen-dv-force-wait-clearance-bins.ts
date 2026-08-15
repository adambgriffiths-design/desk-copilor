/**
 * DEV measure-only: FORCE_WAIT → same-direction actionable clearance bins.
 *
 * Joins Y=1500 FORCE_WAIT shadow stamps to dense 5m baseline timelines on the
 * existing opportunity-frequency dense-panel days. No ALS / c4 / VAL / weights.
 *
 *   npx tsx scripts/karen-dv-force-wait-clearance-bins.ts --smoke
 *   npx tsx scripts/karen-dv-force-wait-clearance-bins.ts --workers=2
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  attachOutcomes,
  evaluateDecisionAtAsOf,
  fixtureToMarketData,
  runDaysInParallel,
  assertDeterministicDayOrder,
  type DecisionValidationFixtureV0,
  type DecisionValidationRecordV0,
  type SerializedBar,
} from "../lib/decision-validation";
import { withTradingBrainBaseline } from "../lib/trading-brain-baseline";

const root = process.cwd();

function argNum(name: string, fallback: number): number {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.slice(name.length + 3)) : fallback;
}
function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const cadenceMinutes = argNum("cadence", 5);
const lookbackDays = argNum("lookback-days", 10);
const workers = argNum("workers", 2);
const smoke = argFlag("smoke");

const PANEL_DAYS = [
  "2023-10-02",
  "2023-10-16",
  "2023-10-31",
  "2023-11-15",
  "2023-11-30",
  "2023-12-15",
  "2024-01-03",
  "2024-01-19",
  "2024-02-05",
  "2024-02-20",
  "2024-03-06",
  "2024-03-21",
  "2024-04-08",
  "2024-04-23",
  "2024-05-08",
  "2024-05-23",
  "2024-06-07",
  "2024-06-24",
  "2024-07-09",
  "2024-07-24",
  "2024-08-08",
  "2024-08-23",
  "2024-09-10",
  "2024-09-25",
  "2024-10-10",
  "2024-10-25",
  "2024-11-11",
  "2024-11-26",
  "2024-12-11",
  "2024-12-26",
  "2025-01-10",
  "2025-01-27",
  "2025-02-11",
  "2025-02-26",
  "2025-03-13",
  "2025-03-28",
  "2025-04-14",
  "2025-04-30",
  "2025-05-15",
  "2025-05-30",
] as const;

type Candle = { time: string; open: number; high: number; low: number; close: number };
type OutcomeLabel = "GOOD" | "BAD" | "NEUTRAL";
type ClearanceBin =
  | "within_5m"
  | "within_15m"
  | "within_30m"
  | "within_60m"
  | "same_session"
  | "never";
type DelayClass =
  | "USEFUL_DELAY"
  | "HARMFUL_DELAY"
  | "HARMFUL_SUPPRESSION"
  | "USEFUL_SUPPRESSION"
  | "INCONCLUSIVE";

type StampRow = {
  asOf: string;
  population: string;
  featuresAtT: { citedConcepts?: string[] | null };
  c1Shadow: {
    side: string;
    actionable?: boolean;
    mfe: number | null;
    mae: number | null;
    proxyR: number | null;
    targetBeforeInvalidation: boolean | null;
    invalidationBeforeTarget: boolean | null;
    outcomeLabel: OutcomeLabel;
  };
};

function ymdOf(iso: string): string {
  return iso.slice(0, 10);
}
function addDaysYmd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
function minutesBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 60_000;
}
function rollup(bars: SerializedBar[], minutes: number): SerializedBar[] {
  const out: SerializedBar[] = [];
  let bucket: SerializedBar | null = null;
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
function dailyFromM1(bars: SerializedBar[]): SerializedBar[] {
  const byDay = new Map<string, SerializedBar>();
  for (const b of bars) {
    const key = b.time.slice(0, 10);
    const cur = byDay.get(key);
    if (!cur) {
      byDay.set(key, { ...b });
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);
}
function buildAsOfCadence(m1: SerializedBar[], cadence: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < m1.length; i += cadence) out.push(m1[i]!.time);
  return out;
}
function parsePriceLoose(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function proxyROf(r: DecisionValidationRecordV0): number | null {
  if (r.verdict !== "LONG" && r.verdict !== "SHORT") return null;
  const entry = r.outcome?.referencePrice ?? r.evidence.lastPrice;
  const inv = parsePriceLoose(r.triggerInvalidation.invalidationPrice);
  const risk =
    entry != null && inv != null && Number.isFinite(entry) && Number.isFinite(inv)
      ? Math.abs(entry - inv)
      : null;
  const mfe = r.outcome?.mfe ?? null;
  const mae = r.outcome?.mae ?? null;
  const mfeR = mfe != null && risk != null && risk > 0 ? mfe / risk : null;
  const maeR = mae != null && risk != null && risk > 0 ? mae / risk : null;
  if (r.outcome?.targetBeforeInvalidation === true && mfeR != null) return mfeR;
  if (r.outcome?.invalidationBeforeTarget === true && maeR != null) return -maeR;
  if (mfeR != null && maeR != null) return mfeR - maeR;
  return null;
}
function outcomeLabelOf(r: DecisionValidationRecordV0): OutcomeLabel {
  if (r.outcome?.targetBeforeInvalidation === true) return "GOOD";
  if (r.outcome?.invalidationBeforeTarget === true) return "BAD";
  const pr = proxyROf(r);
  if (pr != null && pr >= 0.25) return "GOOD";
  if (pr != null && pr <= -0.25) return "BAD";
  return "NEUTRAL";
}
function exclusiveBin(latencyMin: number | null): ClearanceBin {
  if (latencyMin == null) return "never";
  if (latencyMin <= 5) return "within_5m";
  if (latencyMin <= 15) return "within_15m";
  if (latencyMin <= 30) return "within_30m";
  if (latencyMin <= 60) return "within_60m";
  return "same_session";
}
function classify(args: {
  cleared: boolean;
  gated: OutcomeLabel;
  eventual: OutcomeLabel | null;
  gatedProxyR: number | null;
  eventualProxyR: number | null;
}): DelayClass {
  if (!args.cleared) {
    if (args.gated === "GOOD") return "HARMFUL_SUPPRESSION";
    if (args.gated === "BAD") return "USEFUL_SUPPRESSION";
    return "INCONCLUSIVE";
  }
  const ev = args.eventual;
  if (ev == null || ev === "NEUTRAL" || args.gated === "NEUTRAL") return "INCONCLUSIVE";
  if (args.gated === "GOOD" && ev === "BAD") return "HARMFUL_DELAY";
  if (args.gated === "BAD" && ev === "GOOD") return "USEFUL_DELAY"; // waiting improved outcome
  if (args.gated === "GOOD" && ev === "GOOD") {
    if (
      args.gatedProxyR != null &&
      args.eventualProxyR != null &&
      args.eventualProxyR < args.gatedProxyR - 0.25
    ) {
      return "HARMFUL_DELAY";
    }
    return "USEFUL_DELAY";
  }
  if (args.gated === "BAD" && ev === "BAD") {
    if (
      args.gatedProxyR != null &&
      args.eventualProxyR != null &&
      args.eventualProxyR > args.gatedProxyR + 0.25
    ) {
      return "USEFUL_DELAY"; // waiting reduced harm
    }
    return "HARMFUL_DELAY"; // still bad after delay — delay didn't help quality
  }
  return "INCONCLUSIVE";
}
function countMap<T extends string>(xs: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}
function summarizeSlice(rows: Array<ReturnType<typeof buildRow>>) {
  const bins = countMap(rows.map((r) => r.clearanceBin));
  const classes = countMap(rows.map((r) => r.delayClass));
  const cleared = rows.filter((r) => r.clearanceBin !== "never");
  const lat = cleared
    .map((r) => r.latencyMinutes)
    .filter((x): x is number => x != null);
  const bothProxy = rows.filter(
    (r) => r.gatedProxyR != null && r.eventualProxyR != null && r.clearanceBin !== "never"
  );
  const tBeforeGated = rows.filter((r) => r.gatedTBefore === true).length;
  const tBeforeEventual = cleared.filter((r) => r.eventualTBefore === true).length;
  return {
    n: rows.length,
    clearanceBinsExclusive: {
      within_5m: bins.within_5m ?? 0,
      within_15m: bins.within_15m ?? 0,
      within_30m: bins.within_30m ?? 0,
      within_60m: bins.within_60m ?? 0,
      same_session: bins.same_session ?? 0,
      never: bins.never ?? 0,
    },
    clearanceCumulativeOfClearedOrAll: {
      within_5m: rows.filter((r) => r.latencyMinutes != null && r.latencyMinutes <= 5).length,
      within_15m: rows.filter((r) => r.latencyMinutes != null && r.latencyMinutes <= 15)
        .length,
      within_30m: rows.filter((r) => r.latencyMinutes != null && r.latencyMinutes <= 30)
        .length,
      within_60m: rows.filter((r) => r.latencyMinutes != null && r.latencyMinutes <= 60)
        .length,
      same_session: cleared.length,
      never: bins.never ?? 0,
    },
    delayClass: {
      USEFUL_DELAY: classes.USEFUL_DELAY ?? 0,
      HARMFUL_DELAY: classes.HARMFUL_DELAY ?? 0,
      HARMFUL_SUPPRESSION: classes.HARMFUL_SUPPRESSION ?? 0,
      USEFUL_SUPPRESSION: classes.USEFUL_SUPPRESSION ?? 0,
      INCONCLUSIVE: classes.INCONCLUSIVE ?? 0,
    },
    latencyMinutes: {
      n: lat.length,
      median: median(lat),
      mean: mean(lat),
    },
    qualityCompareClearedBothProxy: {
      n: bothProxy.length,
      meanGatedProxyR: mean(bothProxy.map((r) => r.gatedProxyR!)),
      meanEventualProxyR: mean(bothProxy.map((r) => r.eventualProxyR!)),
      meanDeltaEventualMinusGated: mean(
        bothProxy.map((r) => r.eventualProxyR! - r.gatedProxyR!)
      ),
      medianGatedMfe: median(
        bothProxy.map((r) => r.gatedMfe).filter((x): x is number => x != null)
      ),
      medianEventualMfe: median(
        bothProxy.map((r) => r.eventualMfe).filter((x): x is number => x != null)
      ),
      medianGatedMae: median(
        bothProxy.map((r) => r.gatedMae).filter((x): x is number => x != null)
      ),
      medianEventualMae: median(
        bothProxy.map((r) => r.eventualMae).filter((x): x is number => x != null)
      ),
      gatedTBeforeRate: rows.length ? tBeforeGated / rows.length : null,
      eventualTBeforeRateAmongCleared: cleared.length
        ? tBeforeEventual / cleared.length
        : null,
    },
  };
}

function buildRow(args: {
  stamp: StampRow;
  citedMss: boolean;
  side: "LONG" | "SHORT";
  clearanceAsOf: string | null;
  latencyMinutes: number | null;
  eventual: DecisionValidationRecordV0 | null;
}) {
  const clearanceBin = exclusiveBin(args.latencyMinutes);
  const eventualLabel = args.eventual ? outcomeLabelOf(args.eventual) : null;
  const eventualProxyR = args.eventual ? proxyROf(args.eventual) : null;
  const delayClass = classify({
    cleared: clearanceBin !== "never",
    gated: args.stamp.c1Shadow.outcomeLabel,
    eventual: eventualLabel,
    gatedProxyR: args.stamp.c1Shadow.proxyR,
    eventualProxyR,
  });
  return {
    asOf: args.stamp.asOf,
    cited_mss: args.citedMss,
    side: args.side,
    clearanceAsOf: args.clearanceAsOf,
    latencyMinutes: args.latencyMinutes,
    clearanceBin,
    delayClass,
    gatedLabel: args.stamp.c1Shadow.outcomeLabel,
    gatedProxyR: args.stamp.c1Shadow.proxyR,
    gatedMfe: args.stamp.c1Shadow.mfe,
    gatedMae: args.stamp.c1Shadow.mae,
    gatedTBefore: args.stamp.c1Shadow.targetBeforeInvalidation,
    eventualLabel,
    eventualProxyR,
    eventualMfe: args.eventual?.outcome?.mfe ?? null,
    eventualMae: args.eventual?.outcome?.mae ?? null,
    eventualTBefore: args.eventual?.outcome?.targetBeforeInvalidation ?? null,
  };
}

async function main() {
  const stampsPath = join(
    root,
    "data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.jsonl"
  );
  const candlesPath = join(
    root,
    "data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m/candles-1m.json"
  );
  if (!existsSync(stampsPath)) throw new Error(`missing stamps: ${stampsPath}`);
  if (!existsSync(candlesPath)) throw new Error(`missing candles: ${candlesPath}`);

  const stamps = readFileSync(stampsPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StampRow)
    .filter((s) => s.population === "FORCE_WAIT")
    .filter((s) => s.c1Shadow.side === "LONG" || s.c1Shadow.side === "SHORT");

  let days = PANEL_DAYS.filter((d) => stamps.some((s) => ymdOf(s.asOf) === d));
  if (smoke) days = days.slice(0, 2);

  const panelStamps = stamps.filter((s) => days.includes(ymdOf(s.asOf) as (typeof PANEL_DAYS)[number]));
  console.log(
    JSON.stringify({
      phase: "plan",
      smoke,
      days: days.length,
      panelStamps: panelStamps.length,
      cadenceMinutes,
      lookbackDays,
      workers,
      EDGE_CLAIM: "NONE",
      note: "baseline-v2 dense timelines; clearance = first later same-day actionable same side",
    })
  );

  const candles = JSON.parse(readFileSync(candlesPath, "utf8")) as Candle[];

  type DayResult = {
    dayYmd: string;
    records: DecisionValidationRecordV0[];
    lookAheadViolations: number;
  };

  const dayItems = days.map((dayYmd) => ({
    dayYmd,
    run: (): DayResult => {
      const lookbackFrom = addDaysYmd(dayYmd, -lookbackDays);
      const window = candles.filter((c) => {
        const d = ymdOf(c.time);
        return d >= lookbackFrom && d <= dayYmd;
      });
      const m1: SerializedBar[] = window.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const dayM1 = m1.filter((b) => ymdOf(b.time) === dayYmd);
      const asOfs = buildAsOfCadence(dayM1, cadenceMinutes).slice(
        0,
        smoke ? 48 : undefined
      );
      const fixture: DecisionValidationFixtureV0 = {
        id: `dv-fw-clearance-${dayYmd}`,
        symbol: "NQ",
        split: "development",
        daily: dailyFromM1(m1),
        m15: rollup(m1, 15),
        m5: rollup(m1, 5),
        m1,
        asOfCheckpoints: asOfs,
        outcomeHorizonMinutes: 30,
      };
      const data = fixtureToMarketData(fixture);
      const frozen: DecisionValidationRecordV0[] = [];
      let lookAheadViolations = 0;
      withTradingBrainBaseline("v2", () => {
        for (let i = 0; i < asOfs.length; i++) {
          const iso = asOfs[i]!;
          const doAssert = i === 0 || i === asOfs.length - 1 || i % 50 === 0;
          const rec = evaluateDecisionAtAsOf(data, new Date(iso), {
            fixtureId: fixture.id,
            skipLookAheadAssert: !doAssert,
          });
          lookAheadViolations += rec.lookAheadViolations.length;
          frozen.push(rec);
        }
      });
      return {
        dayYmd,
        records: attachOutcomes(frozen, data.m1, 30),
        lookAheadViolations,
      };
    },
  }));

  const t0 = performance.now();
  const parallelResults = await runDaysInParallel(dayItems, { workers });
  const wallMs = performance.now() - t0;
  if (!assertDeterministicDayOrder(parallelResults)) {
    throw new Error("day parallel output not deterministically ordered");
  }

  const byDay = new Map<string, DecisionValidationRecordV0[]>();
  let pit = 0;
  for (const r of parallelResults) {
    byDay.set(r.dayYmd, r.result.records);
    pit += r.result.lookAheadViolations;
  }

  const rows = panelStamps.map((stamp) => {
    const day = ymdOf(stamp.asOf);
    const side = stamp.c1Shadow.side as "LONG" | "SHORT";
    const citedMss = (stamp.featuresAtT.citedConcepts ?? []).includes("mss");
    const dayRecs = (byDay.get(day) ?? []).slice().sort((a, b) => a.asOf.localeCompare(b.asOf));
    const t0ms = Date.parse(stamp.asOf);
    let clearance: DecisionValidationRecordV0 | null = null;
    for (const rec of dayRecs) {
      const t = Date.parse(rec.asOf);
      if (t <= t0ms) continue;
      if (rec.actionableEntry && rec.verdict === side) {
        clearance = rec;
        break;
      }
    }
    const latencyMinutes = clearance ? minutesBetween(stamp.asOf, clearance.asOf) : null;
    return buildRow({
      stamp,
      citedMss,
      side,
      clearanceAsOf: clearance?.asOf ?? null,
      latencyMinutes,
      eventual: clearance,
    });
  });

  const all = summarizeSlice(rows);
  const citedTrue = summarizeSlice(rows.filter((r) => r.cited_mss));
  const citedFalse = summarizeSlice(rows.filter((r) => !r.cited_mss));

  const report = {
    kind: "force_wait_clearance_bins_dense_panel",
    generatedAt: new Date().toISOString(),
    EDGE_CLAIM: "NONE",
    HOLDOUT: "SEALED",
    VAL: "NOT_TOUCHED",
    C4_DEFINED: false,
    baseline: "baseline-v2",
    smoke,
    config: {
      cadenceMinutes,
      lookbackDays,
      workers,
      panelDaysUsed: days,
      stampSource:
        "force-wait-shadow-stamps-y1500-latest.jsonl (FORCE_WAIT ∩ directional c1Shadow)",
      clearanceDefinition:
        "First later same-calendar-day baseline actionableEntry with verdict === gated shadow side. Proxy for ENTRY_STATUS WAIT→ACTIVE delivery (DV records lack entryStatus field).",
      sessionDefinition: "same calendar trading day (dense panel convention)",
      qualityLabels: "same post-freeze rule as stamp dump (T-before / inv-before / proxyR±0.25)",
    },
    coverage: {
      forceWaitDirectionalUniverse: stamps.length,
      onPanelDays: panelStamps.length,
      daysEvaluated: days.length,
      denseEvals: [...byDay.values()].reduce((s, a) => s + a.length, 0),
      pitViolations: pit,
      wallMs,
      note:
        "Sparse Y=1500 stamps ∩ dense-panel days only — NOT the full 1074 FORCE_WAIT universe. Full-universe clearance remains NOT MEASURED / TOO_EARLY without denser coverage.",
    },
    all,
    byCitedMss: {
      true: citedTrue,
      false: citedFalse,
    },
    sampleRows: rows.slice(0, smoke ? 20 : 12),
  };

  const outDir = join(root, "data/karen-decision-validation/acquisition/reports");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const latest = join(outDir, "force-wait-clearance-bins-latest.json");
  const snap = join(outDir, `force-wait-clearance-bins-${stamp}.json`);
  writeFileSync(latest, JSON.stringify(report, null, 2));
  writeFileSync(snap, JSON.stringify(report, null, 2));
  writeFileSync(
    join(outDir, "force-wait-clearance-bins-latest.jsonl"),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );

  console.log(
    JSON.stringify({
      phase: "done",
      n: all.n,
      bins: all.clearanceBinsExclusive,
      delayClass: all.delayClass,
      citedTrue: { n: citedTrue.n, bins: citedTrue.clearanceBinsExclusive, delayClass: citedTrue.delayClass },
      citedFalse: {
        n: citedFalse.n,
        bins: citedFalse.clearanceBinsExclusive,
        delayClass: citedFalse.delayClass,
      },
      pit,
      wallMs,
      out: latest,
      EDGE_CLAIM: "NONE",
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
