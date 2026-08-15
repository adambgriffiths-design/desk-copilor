#!/usr/bin/env npx tsx
/**
 * HTF m5/m15 append-only incrementalization — parity Tests A–J + BEFORE/AFTER bench.
 * Run: npx tsx scripts/test-htf-append-only.ts
 */
import { performance } from "perf_hooks";
import { writeFileSync } from "fs";
import { join } from "path";
import type { Bar, MarketContext } from "../lib/types";
import { buildMarketContextAt } from "../lib/levels";
import { buildDecisionEnvelope } from "../lib/decision-envelope";
import { fingerprintEnvelope } from "../lib/research/architecture/fingerprint";
import { buildKarenReplayResponse } from "../lib/research/replay/karen";
import {
  createIncrementalMarketEngine,
  fingerprintEqhAreas,
  fingerprintKarenInput,
  liveMarketSessionKey,
  type MarketFeed,
  type EngineSnapshot,
} from "../lib/incremental-market-engine";
import { assembleDeskMarketIntelligenceFromEngine } from "../lib/market-intelligence";
import { loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import type { ReplayMarketData } from "../lib/research/replay/types";

function clone(b: Bar): Bar {
  return { time: new Date(b.time.getTime()), open: b.open, high: b.high, low: b.low, close: b.close };
}

function cutFeed(data: MarketFeed, t: Date): MarketFeed {
  const cut = (bars: Bar[]) => bars.filter((b) => b.time.getTime() <= t.getTime()).map(clone);
  return {
    symbol: data.symbol,
    daily: cut(data.daily),
    m15: cut(data.m15),
    m5: cut(data.m5),
    m1: cut(data.m1),
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fpHtf(ctx: MarketContext): string {
  return JSON.stringify({
    m5: ctx.timeframe5m,
    m15: ctx.timeframe15m,
    daily: {
      previousDayHigh: ctx.daily.previousDayHigh,
      previousDayLow: ctx.daily.previousDayLow,
      currentDayHigh: ctx.daily.currentDayHigh,
      currentDayLow: ctx.daily.currentDayLow,
      lastClose: ctx.daily.lastClose,
      biasHint: ctx.daily.biasHint,
      pdhSource: ctx.daily.pdhSource,
      previousDayClose: ctx.daily.previousDayClose,
    },
    biasStack: ctx.biasStack,
    sessions: ctx.sessions,
    activeSession: ctx.activeSession,
    nwog: ctx.nwog,
    org: ctx.org,
    premiumDiscount: ctx.premiumDiscount,
    htfPd: {
      previousDay: ctx.htfPdArrays.previousDay,
      currentDay: ctx.htfPdArrays.currentDay,
      levels: ctx.htfPdArrays.levels.map((l) => `${l.id}:${l.price}`),
      recentDailyFvgs: ctx.htfPdArrays.recentDailyFvgs,
    },
    structure: fingerprintKarenInput(ctx),
    reh: ctx.structureFacts.relativeEqualPools,
    swings: ctx.structureFacts.mss,
    fvg1m: ctx.structureFacts.m1UnfilledFvgs,
    liq: ctx.structureFacts.liquiditySweeps,
    interactions: ctx.structureFacts.levelInteractions,
  });
}

function decisionFp(snap: EngineSnapshot, feed: MarketFeed, asOf: Date): string {
  const intel = assembleDeskMarketIntelligenceFromEngine(snap, {
    chartLastPrice: feed.m1.at(-1)?.close ?? null,
    chartLastPriceSource: "test",
  });
  const replayData = feed as unknown as ReplayMarketData;
  const { pipeline } = buildKarenReplayResponse(intel.ctx, replayData, asOf);
  const env = buildDecisionEnvelope(pipeline, intel.ctx, intel.state);
  return [
    fingerprintEnvelope(env),
    env.stance,
    JSON.stringify(env.thesis),
    JSON.stringify(env.conflictResolution),
    JSON.stringify(env.invalidation),
  ].join("||");
}

type CaseResult = { id: string; pass: boolean; detail: string };

const results: CaseResult[] = [];
const metrics: Record<string, number | string | boolean> = {};

function note(id: string, pass: boolean, detail: string) {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
}

const raw = loadResearchDatasetFixture("nq-aug12-2026-cme");
const data: MarketFeed = {
  symbol: raw.symbol,
  daily: raw.daily.map(clone),
  m15: raw.m15.map(clone),
  m5: raw.m5.map(clone),
  m1: raw.m1.map(clone),
};

let m5Idx = -1;
let m15Idx = -1;
let dailyIdx = -1;
let sessionIdx = -1;
// Prefer mid-session transitions once previous-day anchors are real (avoid early
// yahoo_daily_fallback PDH=lastClose bootstrap where every bar "changes" PDH).
for (let i = 500; i < data.m1.length; i++) {
  const a = cutFeed(data, data.m1[i - 1]!.time);
  const b = cutFeed(data, data.m1[i]!.time);
  if (
    m5Idx < 0 &&
    b.m5.length === a.m5.length + 1 &&
    b.m15.length === a.m15.length &&
    b.daily.length === a.daily.length
  ) {
    m5Idx = i;
  }
  if (m15Idx < 0 && b.m15.length === a.m15.length + 1 && b.daily.length === a.daily.length) {
    m15Idx = i;
  }
  if (dailyIdx < 0 && b.daily.length === a.daily.length + 1) {
    dailyIdx = i;
  }
  if (
    sessionIdx < 0 &&
    liveMarketSessionKey(data.m1[i - 1]!.time) !== liveMarketSessionKey(data.m1[i]!.time) &&
    b.daily.length === a.daily.length
  ) {
    sessionIdx = i;
  }
  if (m5Idx >= 0 && m15Idx >= 0 && dailyIdx >= 0 && sessionIdx >= 0) break;
}
// Fallback search from bar 80 if mid-session window missed a class of transition
if (m5Idx < 0 || m15Idx < 0 || dailyIdx < 0) {
  for (let i = 80; i < data.m1.length; i++) {
    const a = cutFeed(data, data.m1[i - 1]!.time);
    const b = cutFeed(data, data.m1[i]!.time);
    if (
      m5Idx < 0 &&
      b.m5.length === a.m5.length + 1 &&
      b.m15.length === a.m15.length &&
      b.daily.length === a.daily.length
    ) {
      m5Idx = i;
    }
    if (m15Idx < 0 && b.m15.length === a.m15.length + 1 && b.daily.length === a.daily.length) {
      m15Idx = i;
    }
    if (dailyIdx < 0 && b.daily.length === a.daily.length + 1) dailyIdx = i;
    if (m5Idx >= 0 && m15Idx >= 0 && dailyIdx >= 0) break;
  }
}

console.log(
  JSON.stringify({
    m5Idx,
    m15Idx,
    dailyIdx,
    sessionIdx,
    m1: data.m1.length,
    m5: data.m5.length,
    m15: data.m15.length,
    daily: data.daily.length,
  })
);

function parityAt(idx: number): {
  ok: boolean;
  detail: string;
  optMs: number;
  curMs: number;
  fullDelta: number;
  optSnap: EngineSnapshot;
  next: MarketFeed;
  barTime: Date;
} {
  const prevBar = data.m1[idx - 1]!;
  const bar = data.m1[idx]!;
  const prefix = cutFeed(data, prevBar.time);
  const next = cutFeed(data, bar.time);

  const engCur = createIncrementalMarketEngine();
  const tCur0 = performance.now();
  const curSnap = engCur.initialize({ data: next, asOf: bar.time, lastPrice: bar.close });
  const curMs = performance.now() - tCur0;

  const engOpt = createIncrementalMarketEngine();
  engOpt.initialize({ data: prefix, asOf: prevBar.time, lastPrice: prevBar.close });
  const s0 = engOpt.stats();
  const tOpt0 = performance.now();
  const optSnap = engOpt.syncSeries({ data: next, asOf: bar.time, lastPrice: bar.close });
  const optMs = performance.now() - tOpt0;
  const s1 = engOpt.stats();

  const curCtx = curSnap.ctx;
  const optCtx = optSnap.ctx;
  const htfOk = fpHtf(optCtx) === fpHtf(curCtx);
  const karenOk = fingerprintKarenInput(optCtx) === fingerprintKarenInput(curCtx);
  const eqhOk = fingerprintEqhAreas(optSnap.eqhEql) === fingerprintEqhAreas(curSnap.eqhEql);
  const fullCtx = buildMarketContextAt(next, bar.time, undefined, bar.close);
  const vsFull = fingerprintKarenInput(optCtx) === fingerprintKarenInput(fullCtx) && fpHtf(optCtx) === fpHtf(fullCtx);
  let decisionOk = true;
  let decisionDetail = "skipped";
  try {
    decisionOk = decisionFp(optSnap, next, bar.time) === decisionFp(curSnap, next, bar.time);
    decisionDetail = String(decisionOk);
  } catch (e) {
    decisionOk = false;
    decisionDetail = `error:${e instanceof Error ? e.message : String(e)}`;
  }

  const ok = htfOk && karenOk && eqhOk && vsFull && decisionOk;
  const detail = [
    `htf=${htfOk}`,
    `structure=${karenOk}`,
    `eqh=${eqhOk}`,
    `vsFullCtx=${vsFull}`,
    `decision=${decisionDetail}`,
    `fullRebuildsΔ=${s1.fullRebuilds - s0.fullRebuilds}`,
    `optMs=${optMs.toFixed(0)}`,
    `curInitMs=${curMs.toFixed(0)}`,
    `m5 ${prefix.m5.length}→${next.m5.length}`,
    `m15 ${prefix.m15.length}→${next.m15.length}`,
    `daily ${prefix.daily.length}→${next.daily.length}`,
  ].join(" ");
  return {
    ok,
    detail,
    optMs,
    curMs,
    fullDelta: s1.fullRebuilds - s0.fullRebuilds,
    optSnap,
    next,
    barTime: bar.time,
  };
}

function measureFullRebuildPath(idx: number): number {
  const prevBar = data.m1[idx - 1]!;
  const bar = data.m1[idx]!;
  const prefix = cutFeed(data, prevBar.time);
  const next = cutFeed(data, bar.time);
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: prefix, asOf: prevBar.time, lastPrice: prevBar.close });
  const t0 = performance.now();
  eng.initialize({ data: next, asOf: bar.time, lastPrice: bar.close });
  return performance.now() - t0;
}

assert(m5Idx > 0, "m5 transition not found");
assert(m15Idx > 0, "m15 transition not found");
assert(dailyIdx > 0, "daily transition not found");

// A
{
  const r = parityAt(m5Idx);
  note("A.sequential_m5_append", r.ok && r.fullDelta === 0, r.detail);
  metrics.m5_after_ms = +r.optMs.toFixed(1);
  metrics.m5_before_ms = +measureFullRebuildPath(m5Idx).toFixed(1);
  metrics.m5_fullRebuilds_after = r.fullDelta;
  metrics.m5_fullRebuilds_before = 1;
}

// B
{
  const r = parityAt(m15Idx);
  note("B.sequential_m15_append", r.ok && r.fullDelta === 0, r.detail);
  metrics.m15_after_ms = +r.optMs.toFixed(1);
  metrics.m15_before_ms = +measureFullRebuildPath(m15Idx).toFixed(1);
  metrics.m15_fullRebuilds_after = r.fullDelta;
  metrics.m15_fullRebuilds_before = 1;
}

// C
{
  const bar = data.m1[m5Idx]!;
  const feed = cutFeed(data, bar.time);
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: feed, asOf: bar.time, lastPrice: bar.close });
  const before = fpHtf(eng.getContext());
  const s0 = eng.stats().fullRebuilds;
  eng.syncSeries({ data: feed, asOf: bar.time, lastPrice: bar.close });
  const after = fpHtf(eng.getContext());
  note(
    "C.repeated_same_bar",
    before === after && eng.stats().fullRebuilds === s0,
    `stable=${before === after} fullRebuildsΔ=${eng.stats().fullRebuilds - s0}`
  );
}

// D skipped bar
{
  const idx = m5Idx;
  const prefix = cutFeed(data, data.m1[idx - 1]!.time);
  const next = cutFeed(data, data.m1[idx]!.time);
  const gapped: MarketFeed = {
    ...next,
    m1: next.m1.filter((_, i) => i !== Math.max(1, next.m1.length - 3)),
  };
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: prefix, asOf: data.m1[idx - 1]!.time, lastPrice: data.m1[idx - 1]!.close });
  const s0 = eng.stats().fullRebuilds;
  eng.syncSeries({ data: gapped, asOf: data.m1[idx]!.time, lastPrice: data.m1[idx]!.close });
  const delta = eng.stats().fullRebuilds - s0;
  const oracle = createIncrementalMarketEngine();
  const oSnap = oracle.initialize({ data: gapped, asOf: data.m1[idx]!.time, lastPrice: data.m1[idx]!.close });
  const ok = fingerprintKarenInput(eng.getContext()) === fingerprintKarenInput(oSnap.ctx);
  note("D.skipped_bar", ok, `parity=${ok} fullRebuildsΔ=${delta}`);
}

// E out-of-order seek
{
  const idx = Math.min(m5Idx + 10, data.m1.length - 1);
  const late = cutFeed(data, data.m1[idx]!.time);
  const earlier = cutFeed(data, data.m1[idx - 5]!.time);
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: late, asOf: data.m1[idx]!.time, lastPrice: data.m1[idx]!.close });
  const s0 = eng.stats().fullRebuilds;
  eng.syncSeries({ data: earlier, asOf: data.m1[idx - 5]!.time, lastPrice: data.m1[idx - 5]!.close });
  const delta = eng.stats().fullRebuilds - s0;
  const oracle = createIncrementalMarketEngine();
  oracle.initialize({ data: earlier, asOf: data.m1[idx - 5]!.time, lastPrice: data.m1[idx - 5]!.close });
  const ok =
    fingerprintKarenInput(eng.getContext()) === fingerprintKarenInput(oracle.getContext()) && delta >= 1;
  note("E.out_of_order_seek", ok, `parity=${ok} fullRebuildsΔ=${delta} (expect ≥1)`);
}

// F session boundary
{
  if (sessionIdx < 0) {
    note("F.session_boundary", false, "no session boundary found");
  } else {
    const r = parityAt(sessionIdx);
    const eng = createIncrementalMarketEngine();
    const prev = data.m1[sessionIdx - 1]!;
    const bar = data.m1[sessionIdx]!;
    eng.initialize({ data: cutFeed(data, prev.time), asOf: prev.time, lastPrice: prev.close });
    const s0 = eng.stats().fullRebuilds;
    eng.syncSeries({ data: cutFeed(data, bar.time), asOf: bar.time, lastPrice: bar.close });
    const delta = eng.stats().fullRebuilds - s0;
    note("F.session_boundary", r.ok && delta >= 1, `${r.detail} sessionFullRebuildsΔ=${delta}`);
    metrics.session_fullRebuilds_delta = delta;
  }
}

// G daily boundary
{
  const prev = data.m1[dailyIdx - 1]!;
  const bar = data.m1[dailyIdx]!;
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: cutFeed(data, prev.time), asOf: prev.time, lastPrice: prev.close });
  const s0 = eng.stats().fullRebuilds;
  eng.syncSeries({ data: cutFeed(data, bar.time), asOf: bar.time, lastPrice: bar.close });
  const delta = eng.stats().fullRebuilds - s0;
  const oracle = createIncrementalMarketEngine();
  oracle.initialize({ data: cutFeed(data, bar.time), asOf: bar.time, lastPrice: bar.close });
  const ok =
    delta >= 1 &&
    fingerprintKarenInput(eng.getContext()) === fingerprintKarenInput(oracle.getContext()) &&
    fpHtf(eng.getContext()) === fpHtf(oracle.getContext());
  note("G.daily_boundary", ok, `fullRebuildsΔ=${delta} (expect ≥1) parity=${ok}`);
  metrics.daily_fullRebuilds_delta = delta;
}

// H cold
{
  const bar = data.m1[m5Idx]!;
  const feed = cutFeed(data, bar.time);
  const eng = createIncrementalMarketEngine();
  const s0 = eng.stats().fullRebuilds;
  eng.initialize({ data: feed, asOf: bar.time, lastPrice: bar.close });
  const full = buildMarketContextAt(feed, bar.time, undefined, bar.close);
  const ok =
    eng.stats().fullRebuilds === s0 + 1 &&
    fingerprintKarenInput(eng.getContext()) === fingerprintKarenInput(full) &&
    fpHtf(eng.getContext()) === fpHtf(full);
  note("H.cold_initialization", ok, `fullRebuilds=${eng.stats().fullRebuilds} parity=${ok}`);
}

// I historical seek firstMatch fail
{
  const early = cutFeed(data, data.m1[40]!.time);
  const late = cutFeed(data, data.m1[m5Idx]!.time);
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: early, asOf: data.m1[40]!.time, lastPrice: data.m1[40]!.close });
  const broken: MarketFeed = {
    ...late,
    m1: late.m1.map((b, i) => (i === 0 ? { ...b, time: new Date(b.time.getTime() + 60_000) } : clone(b))),
  };
  const s0 = eng.stats().fullRebuilds;
  eng.syncSeries({ data: broken, asOf: data.m1[m5Idx]!.time, lastPrice: data.m1[m5Idx]!.close });
  const delta = eng.stats().fullRebuilds - s0;
  note("I.historical_seek_firstMatch_fail", delta >= 1, `fullRebuildsΔ=${delta} (expect ≥1)`);
}

// J missing incomplete
{
  const prev = data.m1[m5Idx - 1]!;
  const bar = data.m1[m5Idx]!;
  const prefix = cutFeed(data, prev.time);
  const next = cutFeed(data, bar.time);
  const incomplete: MarketFeed = { ...next, m5: [] };
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: prefix, asOf: prev.time, lastPrice: prev.close });
  const s0 = eng.stats().fullRebuilds;
  eng.syncSeries({ data: incomplete, asOf: bar.time, lastPrice: bar.close });
  const delta = eng.stats().fullRebuilds - s0;
  const oracle = createIncrementalMarketEngine();
  oracle.initialize({ data: incomplete, asOf: bar.time, lastPrice: bar.close });
  const ok =
    delta >= 1 && fingerprintKarenInput(eng.getContext()) === fingerprintKarenInput(oracle.getContext());
  note("J.missing_incomplete_m5", ok, `fullRebuildsΔ=${delta} parity=${ok}`);
}

{
  const bar = data.m1[m5Idx]!;
  const next = cutFeed(data, bar.time);
  const t0 = performance.now();
  buildMarketContextAt(next, bar.time, undefined, bar.close);
  metrics.market_context_leaf_ms = +(performance.now() - t0).toFixed(1);
}

metrics.new_bar_request_after_ms = metrics.m5_after_ms;
metrics.new_bar_request_before_ms = metrics.m5_before_ms;
metrics.parity_pass = results.every((r) => r.pass);
metrics.passed = results.filter((r) => r.pass).length;
metrics.failed = results.filter((r) => !r.pass).length;

const outPath = join(process.cwd(), "data", "research", "karen-htf-append-only-metrics.json");
writeFileSync(outPath, JSON.stringify({ metrics, results, m5Idx, m15Idx, dailyIdx, sessionIdx }, null, 2));
console.log("\nMETRICS", JSON.stringify(metrics, null, 2));
console.log(`wrote ${outPath}`);
if (!metrics.parity_pass) process.exitCode = 1;
