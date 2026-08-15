/**
 * DEV-only: Y=1500 FORCE_WAIT / WAIT→ACT-under-c1 shadow stamp dump.
 *
 * Paired none vs c1_wait_entry_actionable on identical DEV asOfs (same carve as
 * overcaution candidates). Emits PIT-safe featuresAtT + c1 shadow side/outcomes.
 *
 * Does NOT define/score c4, resurrect c1, touch VAL/HOLDOUT, or change production.
 *
 *   npx tsx scripts/karen-dv-force-wait-shadow-stamps-y1500.ts --smoke
 *   npx tsx scripts/karen-dv-force-wait-shadow-stamps-y1500.ts --limit=1500 --cadence=10
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { runDecisionValidationV0 } from "../lib/decision-validation";
import type {
  DecisionValidationFixtureV0,
  DecisionValidationRecordV0,
  SerializedBar,
} from "../lib/decision-validation/types";
import {
  describeDecisionProcessExperiment,
  type DecisionProcessExperimentId,
} from "../lib/decision-process-experiment";

const root = process.cwd();

function argNum(name: string, fallback: number): number {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.slice(name.length + 3)) : fallback;
}
function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const cadenceMinutes = argNum("cadence", 10);
const limitTotal = argNum("limit", 1500);
const lookbackDays = argNum("lookback-days", 60);
const smoke = argFlag("smoke");
const maxDaysPerSub = argNum("max-days-per-sub", 130);

const DEV_FROM = "2023-10-02";
const DEV_TO = "2025-05-31";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type ShadowOutcomeLabel = "GOOD" | "BAD" | "NEUTRAL";

function ymdOf(iso: string): string {
  return iso.slice(0, 10);
}
function inYmdRange(iso: string, fromYmd: string, toYmd: string): boolean {
  const d = ymdOf(iso);
  return d >= fromYmd && d <= toYmd;
}
function addDaysYmd(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
function evenSample(asOfAll: string[], want: number): string[] {
  const n = Math.max(1, want);
  if (asOfAll.length <= n) return [...asOfAll];
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const idx = Math.floor((k * (asOfAll.length - 1)) / (n - 1));
    out.push(asOfAll[idx]!);
  }
  return [...new Set(out)];
}
function buildAsOfCadence(m1: SerializedBar[], cadence: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < m1.length; i += cadence) out.push(m1[i]!.time);
  return out;
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
    if (!cur) byDay.set(key, { ...b, time: `${key}T22:00:00.000Z` });
    else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    }
  }
  return [...byDay.values()].sort((a, b) => a.time.localeCompare(b.time));
}
function parsePriceLoose(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function pct(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

type PlannedSub = {
  fromYmd: string;
  toYmd: string;
  subIdx: number;
  subCount: number;
  fixtureBase: Omit<DecisionValidationFixtureV0, "id" | "description" | "asOfCheckpoints"> & {
    asOfCheckpoints: string[];
  };
};

function planSubs(args: {
  candles: Candle[];
  fromYmd: string;
  toYmd: string;
  wantTotal: number;
  label: string;
}): PlannedSub[] {
  const daySet = new Set(args.candles.map((c) => ymdOf(c.time)));
  const tradingDaysSorted = [...daySet].sort();
  const splitDays = tradingDaysSorted.filter((d) => d >= args.fromYmd && d <= args.toYmd);
  const subCount = Math.max(1, Math.ceil(splitDays.length / maxDaysPerSub));
  const perSubLimit = Math.max(5, Math.floor(args.wantTotal / subCount));
  const out: PlannedSub[] = [];

  for (let i = 0; i < subCount; i++) {
    const slice = splitDays.slice(
      Math.floor((i * splitDays.length) / subCount),
      Math.floor(((i + 1) * splitDays.length) / subCount)
    );
    if (!slice.length) continue;
    const fromYmd = slice[0]!;
    const toYmd = slice[slice.length - 1]!;
    const barFrom = addDaysYmd(fromYmd, -lookbackDays);
    const clampedBarFrom =
      args.candles.length && ymdOf(args.candles[0]!.time) > barFrom
        ? ymdOf(args.candles[0]!.time)
        : barFrom;
    const windowCandles = args.candles.filter((c) => inYmdRange(c.time, clampedBarFrom, toYmd));
    const m1: SerializedBar[] = windowCandles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const asOfPool = buildAsOfCadence(m1, cadenceMinutes).filter((t) =>
      inYmdRange(t, fromYmd, toYmd)
    );
    const asOfCheckpoints = evenSample(asOfPool, perSubLimit);
    out.push({
      fromYmd,
      toYmd,
      subIdx: i,
      subCount,
      fixtureBase: {
        symbol: "MNQ1!",
        split: "development",
        outcomeHorizonMinutes: 30,
        daily: dailyFromM1(m1),
        m15: rollup(m1, 15),
        m5: rollup(m1, 5),
        m1,
        asOfCheckpoints,
      },
    });
  }
  return out;
}

function runPlanned(
  planned: PlannedSub[],
  experiment: DecisionProcessExperimentId,
  label: string
): DecisionValidationRecordV0[] {
  const all: DecisionValidationRecordV0[] = [];
  for (const sub of planned) {
    const fixture: DecisionValidationFixtureV0 = {
      ...sub.fixtureBase,
      id: `nq-archive-${label.toLowerCase()}-fw-shadow-${experiment}-sub${sub.subIdx + 1}of${sub.subCount}`,
      description: `${label} FORCE_WAIT shadow dump ${experiment} (${sub.fromYmd}→${sub.toYmd}). EDGE_CLAIM NONE. HOLDOUT sealed.`,
    };
    console.log(
      JSON.stringify({
        phase: "sub_start",
        label,
        experiment,
        sub: `${sub.subIdx + 1}/${sub.subCount}`,
        asOf: `${sub.fromYmd}→${sub.toYmd}`,
        asOfs: fixture.asOfCheckpoints.length,
      })
    );
    const run = runDecisionValidationV0(fixture, {
      runId: `${fixture.id}-${new Date().toISOString()}`,
      dedupeIdleTransitions: false,
      tradingBrainBaseline: "v2",
      decisionProcessExperiment: experiment,
    });
    all.push(...run.records);
  }
  return all;
}

function isForceWaitPrimary(r: DecisionValidationRecordV0): boolean {
  if (r.verdict !== "WAIT") return false;
  if (!r.canDeliverVerdict) return false;
  const longS = Boolean(r.reasoningStructure?.longSupported);
  const shortS = Boolean(r.reasoningStructure?.shortSupported);
  if ((longS || shortS) && longS !== shortS) return true;
  const wr = (r.waitReason ?? "").toLowerCase();
  return wr.includes("entry") || wr.includes("retrace") || wr.includes("extended");
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

/**
 * Shadow outcome label AFTER freeze-at-t (analysis only — never a gate feature).
 * Simple ordered rule; not a mined threshold for c4.
 */
function shadowOutcomeLabel(r: DecisionValidationRecordV0): ShadowOutcomeLabel {
  if (r.verdict !== "LONG" && r.verdict !== "SHORT") return "NEUTRAL";
  if (r.outcome?.targetBeforeInvalidation === true) return "GOOD";
  if (r.outcome?.invalidationBeforeTarget === true) return "BAD";
  const pr = proxyROf(r);
  if (pr != null && pr >= 0.25) return "GOOD";
  if (pr != null && pr <= -0.25) return "BAD";
  return "NEUTRAL";
}

function sweepPresent(r: DecisionValidationRecordV0): boolean | null {
  const tag = r.confounders?.find((c) => c.id === "sweeps_dual_credit");
  if (!tag) return null;
  // note encodes presence; active=true means dual-credit; note may say one-sided present
  const note = (tag.note ?? "").toLowerCase();
  if (note.includes("no sweep")) return false;
  if (note.includes("sweep")) return true;
  return tag.active ? true : null;
}

function featuresAtT(r: DecisionValidationRecordV0) {
  const rs = r.reasoningStructure;
  const e = r.evidence;
  const longN = rs?.longReasons?.length ?? 0;
  const shortN = rs?.shortReasons?.length ?? 0;
  const longS = Boolean(rs?.longSupported);
  const shortS = Boolean(rs?.shortSupported);
  const supportSide =
    longS && !shortS ? "LONG" : shortS && !longS ? "SHORT" : longS && shortS ? "BOTH" : "NONE";
  const reasonMargin = longN - shortN;
  const last = e.lastPrice;
  const pdh = e.pdh;
  const pdl = e.pdl;
  const midPd =
    pdh != null && pdl != null && Number.isFinite(pdh) && Number.isFinite(pdl)
      ? (pdh + pdl) / 2
      : null;
  const distToPdh =
    last != null && pdh != null ? Math.abs(last - pdh) : null;
  const distToPdl =
    last != null && pdl != null ? Math.abs(last - pdl) : null;
  const pdPosition =
    last != null && pdh != null && pdl != null && pdh !== pdl
      ? (last - pdl) / (pdh - pdl)
      : null;

  return {
    lastPrice: last,
    pdh,
    pdl,
    tradeableBias: e.tradeableBias,
    marketStructure: e.marketStructure,
    displacement: e.displacement,
    displacementDirection: rs?.displacementDirection ?? null,
    fvgStatus: e.fvgStatus,
    mssPresent: Boolean(rs?.mssPresent),
    citedConcepts: e.citedConcepts ?? [],
    factsPreview: e.factsPreview,
    sessionLabel: e.sessionLabel,
    timeBucketEt: e.timeBucketEt,
    dayOfWeekEt: e.dayOfWeekEt,
    longSupported: longS,
    shortSupported: shortS,
    supportSide,
    longReasonCount: longN,
    shortReasonCount: shortN,
    reasonMargin,
    absReasonMargin: Math.abs(reasonMargin),
    contradictions: rs?.contradictions ?? [],
    contradictionCount: rs?.contradictions?.length ?? 0,
    entryModel: rs?.entryModel ?? null,
    whyNow: rs?.whyNow ?? null,
    waitReason: r.waitReason,
    canDeliverVerdict: r.canDeliverVerdict,
    qualityGateDeliver: rs?.qualityGateDeliver ?? r.canDeliverVerdict,
    stance: r.stance,
    confidence: r.confidence,
    trigger: r.triggerInvalidation.trigger,
    invalidationPrice: r.triggerInvalidation.invalidationPrice,
    invalidationCondition: r.triggerInvalidation.invalidationCondition,
    target: r.triggerInvalidation.target,
    distToPdh,
    distToPdl,
    pdMid: midPd,
    pdPosition,
    sweepPresent: sweepPresent(r),
    confounderActiveIds: (r.confounders ?? []).filter((c) => c.active).map((c) => c.id),
    // vol context not on EvidenceAtT — explicit null so schema stays honest
    volContext: null as null,
  };
}

type StampRow = {
  asOf: string;
  population: "FORCE_WAIT" | "WAIT_TO_ACT_NON_FORCE" | "FORCE_WAIT_STAY_WAIT";
  baselineVerdict: string;
  baselineForceWaitPrimary: boolean;
  featuresAtT: ReturnType<typeof featuresAtT>;
  c1Shadow: {
    side: "LONG" | "SHORT" | "WAIT" | "NO_TRADE" | "OTHER";
    actionable: boolean;
    mfe: number | null;
    mae: number | null;
    proxyR: number | null;
    targetBeforeInvalidation: boolean | null;
    invalidationBeforeTarget: boolean | null;
    outcomeLabel: ShadowOutcomeLabel;
    waitClassBaseline: string | null;
  };
};

function sideOf(v: string): StampRow["c1Shadow"]["side"] {
  if (v === "LONG" || v === "SHORT" || v === "WAIT" || v === "NO_TRADE") return v;
  return "OTHER";
}

function buildStamps(
  base: DecisionValidationRecordV0[],
  c1: DecisionValidationRecordV0[]
): StampRow[] {
  const c1ByAsOf = new Map(c1.map((r) => [r.asOf, r]));
  const out: StampRow[] = [];
  for (const b of base) {
    if (b.validity !== "valid") continue;
    const s = c1ByAsOf.get(b.asOf);
    if (!s || s.validity !== "valid") continue;

    const force = isForceWaitPrimary(b);
    const waitToAct =
      b.verdict === "WAIT" && (s.verdict === "LONG" || s.verdict === "SHORT");
    const forceStayWait = force && s.verdict === "WAIT";

    if (!force && !waitToAct) continue;

    let population: StampRow["population"];
    if (force && waitToAct) population = "FORCE_WAIT";
    else if (force && forceStayWait) population = "FORCE_WAIT_STAY_WAIT";
    else if (force) population = "FORCE_WAIT";
    else population = "WAIT_TO_ACT_NON_FORCE";

    // Include FORCE_WAIT always; WAIT→ACT non-force for completeness; stay-wait FORCE for protect class
    if (!(force || waitToAct)) continue;

    out.push({
      asOf: b.asOf,
      population,
      baselineVerdict: b.verdict,
      baselineForceWaitPrimary: force,
      featuresAtT: featuresAtT(b),
      c1Shadow: {
        side: sideOf(s.verdict),
        actionable: s.verdict === "LONG" || s.verdict === "SHORT",
        mfe: s.outcome?.mfe ?? null,
        mae: s.outcome?.mae ?? null,
        proxyR: proxyROf(s),
        targetBeforeInvalidation: s.outcome?.targetBeforeInvalidation ?? null,
        invalidationBeforeTarget: s.outcome?.invalidationBeforeTarget ?? null,
        outcomeLabel: shadowOutcomeLabel(s),
        waitClassBaseline: b.outcome?.waitClass ?? null,
      },
    });
  }
  return out;
}

type UnivRow = {
  feature: string;
  level: string;
  n: number;
  nGood: number;
  nBad: number;
  nNeutral: number;
  goodRate: number | null;
  badRate: number | null;
  goodMinusBad: number | null;
  /** vs pool goodRate — simple association delta */
  goodRateDeltaVsPool: number | null;
};

function univariateHints(stamps: StampRow[]): {
  pool: { n: number; goodRate: number | null; badRate: number | null };
  ranked: UnivRow[];
  screaminglyClear: null | { feature: string; level: string; note: string };
} {
  // Only stamps with shadow ACT (have outcome labels that discriminate quality)
  const act = stamps.filter((s) => s.c1Shadow.actionable);
  const poolGood = act.filter((s) => s.c1Shadow.outcomeLabel === "GOOD").length;
  const poolBad = act.filter((s) => s.c1Shadow.outcomeLabel === "BAD").length;
  const poolN = act.length;
  const poolGoodRate = pct(poolGood, poolN);
  const poolBadRate = pct(poolBad, poolN);

  const featureFns: Array<{ name: string; fn: (s: StampRow) => string }> = [
    { name: "supportSide", fn: (s) => s.featuresAtT.supportSide },
    { name: "sessionLabel", fn: (s) => s.featuresAtT.sessionLabel ?? "null" },
    { name: "timeBucketEt", fn: (s) => s.featuresAtT.timeBucketEt ?? "null" },
    { name: "dayOfWeekEt", fn: (s) => s.featuresAtT.dayOfWeekEt ?? "null" },
    { name: "tradeableBias", fn: (s) => s.featuresAtT.tradeableBias ?? "null" },
    { name: "marketStructure", fn: (s) => s.featuresAtT.marketStructure ?? "null" },
    { name: "displacement", fn: (s) => s.featuresAtT.displacement ?? "null" },
    {
      name: "displacementDirection",
      fn: (s) => s.featuresAtT.displacementDirection ?? "null",
    },
    { name: "fvgStatus", fn: (s) => s.featuresAtT.fvgStatus ?? "null" },
    { name: "mssPresent", fn: (s) => String(s.featuresAtT.mssPresent) },
    {
      name: "contradictionCount_bin",
      fn: (s) =>
        s.featuresAtT.contradictionCount === 0
          ? "0"
          : s.featuresAtT.contradictionCount === 1
            ? "1"
            : ">=2",
    },
    {
      name: "absReasonMargin_bin",
      fn: (s) =>
        s.featuresAtT.absReasonMargin <= 0
          ? "0"
          : s.featuresAtT.absReasonMargin === 1
            ? "1"
            : s.featuresAtT.absReasonMargin === 2
              ? "2"
              : ">=3",
    },
    {
      name: "entryModel",
      fn: (s) => s.featuresAtT.entryModel ?? "null",
    },
    {
      name: "sweepPresent",
      fn: (s) =>
        s.featuresAtT.sweepPresent == null
          ? "unknown"
          : String(s.featuresAtT.sweepPresent),
    },
    {
      name: "pdPosition_bin",
      fn: (s) => {
        const p = s.featuresAtT.pdPosition;
        if (p == null) return "null";
        if (p < 0.2) return "near_pdl_<0.2";
        if (p < 0.4) return "discount_0.2-0.4";
        if (p < 0.6) return "mid_0.4-0.6";
        if (p < 0.8) return "premium_0.6-0.8";
        return "near_pdh_>=0.8";
      },
    },
    {
      name: "cited_mss",
      fn: (s) => String((s.featuresAtT.citedConcepts ?? []).includes("mss")),
    },
    {
      name: "cited_displacement",
      fn: (s) => String((s.featuresAtT.citedConcepts ?? []).includes("displacement")),
    },
    {
      name: "cited_fvg",
      fn: (s) => String((s.featuresAtT.citedConcepts ?? []).includes("fvg")),
    },
    {
      name: "shadowSide",
      fn: (s) => s.c1Shadow.side,
    },
  ];

  const ranked: UnivRow[] = [];
  for (const f of featureFns) {
    const levels = new Map<string, StampRow[]>();
    for (const s of act) {
      const lv = f.fn(s);
      const arr = levels.get(lv) ?? [];
      arr.push(s);
      levels.set(lv, arr);
    }
    for (const [level, rows] of levels) {
      if (rows.length < 20) continue; // avoid tiny-n noise
      const nGood = rows.filter((r) => r.c1Shadow.outcomeLabel === "GOOD").length;
      const nBad = rows.filter((r) => r.c1Shadow.outcomeLabel === "BAD").length;
      const nNeutral = rows.filter((r) => r.c1Shadow.outcomeLabel === "NEUTRAL").length;
      const goodRate = pct(nGood, rows.length);
      const badRate = pct(nBad, rows.length);
      ranked.push({
        feature: f.name,
        level,
        n: rows.length,
        nGood,
        nBad,
        nNeutral,
        goodRate,
        badRate,
        goodMinusBad:
          goodRate != null && badRate != null ? goodRate - badRate : null,
        goodRateDeltaVsPool:
          goodRate != null && poolGoodRate != null ? goodRate - poolGoodRate : null,
      });
    }
  }

  ranked.sort((a, b) => {
    const aa = Math.abs(a.goodRateDeltaVsPool ?? 0);
    const bb = Math.abs(b.goodRateDeltaVsPool ?? 0);
    return bb - aa;
  });

  // "Screamingly clear" bar: |delta| >= 20pp AND n>=80 AND not tautological shadowSide-only
  let screaminglyClear: null | { feature: string; level: string; note: string } = null;
  for (const r of ranked) {
    if (r.feature === "shadowSide") continue;
    const d = Math.abs(r.goodRateDeltaVsPool ?? 0);
    if (d >= 0.2 && r.n >= 80) {
      screaminglyClear = {
        feature: r.feature,
        level: r.level,
        note: `|ΔgoodRate|=${(100 * d).toFixed(1)}pp n=${r.n} — candidate hypothesis only; not a c4 predicate`,
      };
      break;
    }
  }

  return {
    pool: { n: poolN, goodRate: poolGoodRate, badRate: poolBadRate },
    ranked: ranked.slice(0, 40),
    screaminglyClear,
  };
}

function main() {
  const t0 = Date.now();
  const candlesPath = join(
    root,
    "data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m/candles-1m.json"
  );
  const candles = JSON.parse(readFileSync(candlesPath, "utf8")) as Candle[];
  const wantTotal = smoke ? Math.min(48, limitTotal) : limitTotal;

  console.log(
    JSON.stringify({
      phase: "start",
      kind: "force_wait_shadow_stamps_y1500",
      BASELINE_FROZEN_ID: "baseline-v2",
      wantTotal,
      cadenceMinutes,
      smoke,
      EDGE_CLAIM: "NONE",
      HOLDOUT: "SEALED",
      note: "DEV dump only — no c4 predicate, no registry score, no VAL",
    })
  );

  const planned = planSubs({
    candles,
    fromYmd: DEV_FROM,
    toYmd: DEV_TO,
    wantTotal,
    label: "DEVELOPMENT",
  });
  const plannedAsOfs = planned.reduce((n, p) => n + p.fixtureBase.asOfCheckpoints.length, 0);

  const tNone = Date.now();
  const noneRecs = runPlanned(planned, "none", "DEVELOPMENT");
  console.log(
    JSON.stringify({
      phase: "experiment_done",
      experiment: "none",
      records: noneRecs.length,
      elapsedMs: Date.now() - tNone,
    })
  );

  const tC1 = Date.now();
  const c1Recs = runPlanned(planned, "c1_wait_entry_actionable", "DEVELOPMENT");
  console.log(
    JSON.stringify({
      phase: "experiment_done",
      experiment: "c1_wait_entry_actionable",
      records: c1Recs.length,
      elapsedMs: Date.now() - tC1,
    })
  );

  const stamps = buildStamps(noneRecs, c1Recs);
  const univ = univariateHints(stamps);

  const byPop: Record<string, number> = {};
  const byLabel: Record<string, number> = {};
  const bySide: Record<string, number> = {};
  for (const s of stamps) {
    byPop[s.population] = (byPop[s.population] ?? 0) + 1;
    byLabel[s.c1Shadow.outcomeLabel] = (byLabel[s.c1Shadow.outcomeLabel] ?? 0) + 1;
    bySide[s.c1Shadow.side] = (bySide[s.c1Shadow.side] ?? 0) + 1;
  }

  const actShadow = stamps.filter((s) => s.c1Shadow.actionable);
  const proxyRs = actShadow
    .map((s) => s.c1Shadow.proxyR)
    .filter((x): x is number => x != null);
  const tBeforeN = actShadow.filter((s) => s.c1Shadow.targetBeforeInvalidation === true).length;
  const tBeforeScored = actShadow.filter(
    (s) => s.c1Shadow.targetBeforeInvalidation != null
  ).length;

  const at = new Date().toISOString();
  const stamp = at.replace(/[:.]/g, "-");

  const report = {
    kind: "force_wait_shadow_stamps_y1500",
    EDGE_CLAIM: "NONE",
    HOLDOUT: "SEALED",
    BASELINE_FROZEN_ID: "baseline-v2",
    at,
    smoke,
    method: {
      carve: "archive-carve-v1",
      split: "DEVELOPMENT",
      fromYmd: DEV_FROM,
      toYmd: DEV_TO,
      cadenceMinutes,
      limitTotal: wantTotal,
      plannedAsOfs,
      tradingBrainBaseline: "baseline-v2",
      pairedExperiments: ["none", "c1_wait_entry_actionable"] as DecisionProcessExperimentId[],
      descriptions: {
        none: describeDecisionProcessExperiment("none"),
        c1_wait_entry_actionable: describeDecisionProcessExperiment("c1_wait_entry_actionable"),
      },
      note: "Identical asOf plan as overcaution Y=1500; stamp dump only — not a scored candidate run",
    },
    schemaNote: {
      featuresAtT: "PIT-safe fields frozen at asOf (evidence + reasoningStructure + derived PD geometry). Outcomes excluded.",
      c1Shadow:
        "Counterfactual under c1_wait_entry_actionable after freeze; side + MFE/MAE/proxyR/T-before + GOOD/BAD/NEUTRAL label. Labels are post-t analysis only — must not enter a live predicate.",
      outcomeLabelRule:
        "GOOD if targetBeforeInv OR proxyR>=0.25; BAD if invBeforeTarget OR proxyR<=-0.25; else NEUTRAL. Fixed a-priori diagnostic bins — not threshold-mined for c4.",
      population:
        "FORCE_WAIT = baseline ENTRY_STATUS_FORCE_WAIT primary (one-sided support + WAIT) that pairs with c1; WAIT_TO_ACT_NON_FORCE = residual WAIT→ACT without force primary; FORCE_WAIT_STAY_WAIT = force primary still WAIT under c1 (e.g. EXTENDED).",
      C4_DEFINED: false,
      C4_SINGLE_CHANGE: "NOT_DEFINED",
    },
    counts: {
      pairedAsOfs: noneRecs.filter((r) => r.validity === "valid").length,
      stamps: stamps.length,
      byPopulation: byPop,
      byShadowSide: bySide,
      byOutcomeLabel: byLabel,
      shadowActN: actShadow.length,
      shadowActMeanProxyR: mean(proxyRs),
      shadowActMedianProxyR: median(proxyRs),
      shadowActTBeforeRate: pct(tBeforeN, tBeforeScored),
      pitViolations:
        noneRecs.reduce((n, r) => n + r.lookAheadViolations.length, 0) +
        c1Recs.reduce((n, r) => n + r.lookAheadViolations.length, 0),
    },
    univariate: univ,
    decision: {
      DECISION: "RESEARCH_MORE",
      CLEAR_PIT_SAFE_DISCRIMINATOR: univ.screaminglyClear ? "CANDIDATE_HYPOTHESIS_ONLY" : "NO",
      C4_DEFINED: false,
      C4_SINGLE_CHANGE: "NOT_DEFINED",
      screaminglyClear: univ.screaminglyClear,
    },
    stamps,
    elapsedMs: Date.now() - t0,
  };

  const reportsDir = join(root, "data/karen-decision-validation/acquisition/reports");
  mkdirSync(reportsDir, { recursive: true });
  const latestPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.json");
  const stampedPath = join(reportsDir, `force-wait-shadow-stamps-y1500-${stamp}.json`);
  const schemaPath = join(reportsDir, "force-wait-shadow-stamps-y1500.schema.md");

  // Compact JSONL sibling for analysis (one stamp per line)
  const jsonlPath = join(reportsDir, "force-wait-shadow-stamps-y1500-latest.jsonl");
  writeFileSync(jsonlPath, stamps.map((s) => JSON.stringify(s)).join("\n") + "\n");

  writeFileSync(latestPath, JSON.stringify(report, null, 2));
  writeFileSync(stampedPath, JSON.stringify(report, null, 2));

  const schemaMd = `# FORCE_WAIT shadow stamp dump — schema (DEV Y=1500)

**KIND:** \`force_wait_shadow_stamps_y1500\`  
**BASELINE:** baseline-v2  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** not touched  
**C4_DEFINED:** NO · **C4_SINGLE_CHANGE:** NOT_DEFINED

## Purpose

PIT-safe stamp table for discriminator search: baseline FORCE_WAIT / WAIT→ACT-under-c1 states with features at *t* and c1 shadow side/outcomes scored **after** freeze.

## Files

| File | Content |
|------|---------|
| \`force-wait-shadow-stamps-y1500-latest.json\` | Full report + stamps[] |
| \`force-wait-shadow-stamps-y1500-latest.jsonl\` | One stamp JSON per line |
| \`force-wait-shadow-stamps-y1500-*.json\` | Timestamped snapshot |

## Stamp fields

- \`asOf\` — evaluation timestamp
- \`population\` — \`FORCE_WAIT\` | \`WAIT_TO_ACT_NON_FORCE\` | \`FORCE_WAIT_STAY_WAIT\`
- \`baselineForceWaitPrimary\` — taxonomy primary (one-sided support + WAIT)
- \`featuresAtT\` — evidence + reasoningStructure + PD geometry; **no** post-t labels
- \`c1Shadow.side\` / \`outcomeLabel\` — shadow under \`c1_wait_entry_actionable\` after freeze

### Outcome label rule (analysis only)

1. GOOD if \`targetBeforeInvalidation\`
2. BAD if \`invalidationBeforeTarget\`
3. else GOOD if \`proxyR >= 0.25\`; BAD if \`proxyR <= -0.25\`
4. else NEUTRAL

**Forbidden:** using outcomeLabel / proxyR / MFE/MAE as live gate features.

## Non-goals

- Not a scored experiment registry row
- Not a c4 predicate
- Does not resurrect/promote c1
`;

  writeFileSync(schemaPath, schemaMd);

  console.log(
    JSON.stringify({
      phase: "done",
      stamps: stamps.length,
      byPopulation: byPop,
      byOutcomeLabel: byLabel,
      topUnivariate: univ.ranked.slice(0, 8),
      screaminglyClear: univ.screaminglyClear,
      paths: { latestPath, jsonlPath, schemaPath, stampedPath },
      elapsedMs: Date.now() - t0,
      DECISION: "RESEARCH_MORE",
      C4_SINGLE_CHANGE: "NOT_DEFINED",
    })
  );
}

main();
