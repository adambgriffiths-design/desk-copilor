#!/usr/bin/env npx tsx
/**
 * One-off Karen research candidate-filter audit benchmark.
 * Analysis only — does not change production semantics.
 *
 * Run: npx tsx scripts/bench-candidate-filter-audit.ts [--window ny-am-30] [--warmup 60] [--sparse 12]
 */
import { performance } from "perf_hooks";
import { writeFileSync } from "fs";
import { join } from "path";
import { getEstDateKey, getEstMinutes } from "../lib/market-data";
import { buildDecisionEnvelope } from "../lib/decision-envelope";
import { fingerprintEnvelope } from "../lib/research/architecture/fingerprint";
import { buildKarenReplayResponse } from "../lib/research/replay/karen";
import { buildMarketState } from "../lib/market-state-build";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import { sliceBarsThroughIndex } from "../lib/research/replay/fast-slice";
import { majorLevelInteraction, shouldRunKarenAnalysis } from "../lib/analysis-triggers";
import { createIncrementalMarketEngine } from "../lib/incremental-market-engine";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { buildHtfIndexMaps } from "../lib/research/replay/fast-slice";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import type { DecisionEnvelope } from "../lib/decision-envelope";
import type { Bar } from "../lib/types";
import type { ReplayMarketData } from "../lib/research/replay/types";

type WindowSpec = { label: string; dateKey: string; startMin: number; endMin: number };

const WINDOWS: Record<string, WindowSpec> = {
  "ny-am-30": { label: "Aug12 NY AM 09:30–10:00 EST", dateKey: "2026-08-12", startMin: 9 * 60 + 30, endMin: 10 * 60 },
  "ny-am-90": { label: "Aug12 NY AM 09:30–11:00 EST", dateKey: "2026-08-12", startMin: 9 * 60 + 30, endMin: 11 * 60 },
  "ny-am-120": { label: "Aug12 NY AM 09:30–11:30 EST", dateKey: "2026-08-12", startMin: 9 * 60 + 30, endMin: 11 * 60 + 30 },
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const wIdx = argv.indexOf("--window");
  const warmIdx = argv.indexOf("--warmup");
  const spIdx = argv.indexOf("--sparse");
  return {
    window: wIdx >= 0 ? argv[wIdx + 1] ?? "ny-am-30" : "ny-am-30",
    warmup: warmIdx >= 0 ? Math.max(30, parseInt(argv[warmIdx + 1] ?? "60", 10)) : 60,
    sparse: spIdx >= 0 ? Math.max(0, parseInt(argv[spIdx + 1] ?? "0", 10)) : 0,
  };
}

function memMb() {
  const m = process.memoryUsage();
  return { rss: Math.round(m.rss / 1024 / 1024), heap: Math.round(m.heapUsed / 1024 / 1024) };
}

function pickBarIndices(data: ReplayMarketData, spec: WindowSpec, warmup: number): number[] {
  const out: number[] = [];
  for (let i = warmup; i < data.m1.length; i++) {
    const bar = data.m1[i]!;
    if (getEstDateKey(bar.time) !== spec.dateKey) continue;
    const mins = getEstMinutes(bar.time);
    if (mins < spec.startMin || mins >= spec.endMin) continue;
    out.push(i);
  }
  return out;
}

/** architecture-v1 research-actionable: checkpoints where skipping full eval loses signal. */
function isResearchActionable(env: DecisionEnvelope, pipelineVerdict: string, entryZone: string | null): boolean {
  if (env.stance === "long" || env.stance === "short") return env.thesis.complete;
  if (env.stance === "monitor") return true;
  if (env.stance === "wait" && entryZone) return true;
  if (env.stance === "wait" && (pipelineVerdict === "LONG" || pipelineVerdict === "SHORT")) return true;
  return false;
}

function dailyLevelsAt(data: ReplayMarketData, barIndex: number): { pdh: number; pdl: number; pdc: number } | null {
  const asOf = data.m1[barIndex]!.time.getTime();
  const daily = data.daily.filter((b) => b.time.getTime() <= asOf);
  if (daily.length < 2) return null;
  const prev = daily.at(-2)!;
  return { pdh: prev.high, pdl: prev.low, pdc: prev.close };
}

function nearLevel(price: number, level: number, tolerance = 8): boolean {
  return Math.abs(price - level) <= tolerance;
}

function cheapBarAnatomy(prev: Bar | null, bar: Bar): boolean {
  if (!prev) return true;
  const range = bar.high - bar.low;
  const prevRange = prev.high - prev.low;
  const closeMove = Math.abs(bar.close - prev.close);
  return range >= 6 || closeMove >= 4 || bar.high > prev.high + 0.5 || bar.low < prev.low - 0.5;
}

function sessionChanged(prev: Bar | null, bar: Bar): boolean {
  if (!prev) return true;
  return getEstMinutes(prev.time) !== getEstMinutes(bar.time);
}

type FilterResult = {
  id: string;
  label: string;
  candidateCount: number;
  recallActionable: number;
  missedActionable: Array<{ barIndex: number; asOf: string; stance: string; reason: string }>;
  falseNegativeRate: number;
  envelopeMismatchAtCandidates: number;
  estimatedMs: number;
  cheapScanTotalMs: number;
  fullEvalTotalMs: number;
};

async function main() {
  const { window, warmup, sparse } = parseArgs();
  const spec = WINDOWS[window];
  if (!spec) throw new Error(`Unknown window: ${window}. Use: ${Object.keys(WINDOWS).join(", ")}`);

  ensureResearchFixtures();
  const mem0 = memMb();
  const tLoad = performance.now();
  const data = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const loadMs = performance.now() - tLoad;
  const htfMaps = buildHtfIndexMaps(data.m1, data.m5, data.m15);
  let barIndices = pickBarIndices(data, spec, warmup);
  const fullWindowIndices = barIndices;
  let evalIndices = barIndices;
  if (sparse > 0 && barIndices.length > sparse) {
    const picked: number[] = [];
    for (let i = 0; i < sparse; i++) {
      const idx = Math.floor(((i + 1) / (sparse + 1)) * barIndices.length);
      picked.push(barIndices[Math.min(barIndices.length - 1, idx)]!);
    }
    evalIndices = picked;
  }
  if (evalIndices.length < 5 || fullWindowIndices.length < 10) {
    throw new Error(`Too few bars in window (eval=${evalIndices.length}, window=${fullWindowIndices.length})`);
  }

  const engine = createIncrementalMarketEngine();
  const prefixEnd = fullWindowIndices[0]! - 1;
  const prefix = {
    ...data,
    m1: data.m1.slice(0, prefixEnd + 1).map((b) => ({ ...b, time: new Date(b.time) })),
  };
  engine.initialize({ data: prefix, asOf: prefix.m1.at(-1)!.time, lastPrice: prefix.m1.at(-1)!.close });

  type BaselineRow = {
    barIndex: number;
    asOf: string;
    ctxMs: number;
    pipelineMs: number;
    totalMs: number;
    stance: string;
    pipelineVerdict: string;
    entryZone: string | null;
    actionable: boolean;
    envelopeFp: string;
    envelope: DecisionEnvelope;
  };

  const baseline: BaselineRow[] = [];
  let baselineCtxMs = 0;
  let baselinePipelineMs = 0;

  console.error(`Benchmark window: ${spec.label} — ${evalIndices.length} eval checkpoints / ${fullWindowIndices.length} engine bars (warmup=${warmup})`);

  for (let i = 0; i < evalIndices.length; i++) {
    const barIndex = evalIndices[i]!;
    const bar = data.m1[barIndex]!;
    const asOf = bar.time;

    const t0 = performance.now();
    const cutoff = new ReplayDataCutoff(data, asOf);
    cutoff.assertNoFutureLeak();
    const ctx = cutoff.buildContextAtBarIndex(barIndex, htfMaps, bar.close);
    const ctxMs = performance.now() - t0;

    const t1 = performance.now();
    const m1 = sliceBarsThroughIndex(data.m1, barIndex);
    const chartSnapshot = buildResearchChartSnapshotFromBars({
      bars: m1,
      symbol: ctx.symbol,
      asOf,
      timeframe: "1",
    });
    const state = buildMarketState({
      ctx,
      chartLastPrice: bar.close,
      chartLastPriceSource: "yahoo",
      symbol: ctx.symbol,
      chartSnapshot,
    });
    const { pipeline } = buildKarenReplayResponse(ctx, data, asOf);
    const env = buildDecisionEnvelope(pipeline, ctx, state);
    const pipelineMs = performance.now() - t1;
    const totalMs = ctxMs + pipelineMs;

    const entryZone = pipeline.decision.entry_zone ?? null;
    const actionable = isResearchActionable(env, pipeline.decision.verdict, entryZone);

    baseline.push({
      barIndex,
      asOf: asOf.toISOString(),
      ctxMs,
      pipelineMs,
      totalMs,
      stance: env.stance,
      pipelineVerdict: pipeline.decision.verdict,
      entryZone,
      actionable,
      envelopeFp: fingerprintEnvelope(env),
      envelope: env,
    });

    baselineCtxMs += ctxMs;
    baselinePipelineMs += pipelineMs;

    if ((i + 1) % 5 === 0 || i === evalIndices.length - 1) {
      console.error(`  baseline ${i + 1}/${evalIndices.length} avg ${Math.round(baselineCtxMs / (i + 1))}ms ctx`);
    }
  }

  const actionableRows = baseline.filter((r) => r.actionable);
  const baselineTotalMs = baseline.reduce((s, r) => s + r.totalMs, 0);
  const baselineByIndex = new Map(baseline.map((r) => [r.barIndex, r]));

  // --- Candidate filters (cheap stage 1) ---
  const filters: Array<{
    id: string;
    label: string;
    isCandidate: (ctx: {
      i: number;
      barIndex: number;
      bar: Bar;
      prevBar: Bar | null;
      prevEval: BaselineRow | null;
      engineEvents: ReturnType<typeof engine.applyClosedBar> extends infer T ? T extends { events: infer E } ? E : never : never;
    }) => boolean;
    measureCheapMs?: boolean;
  }> = [
    {
      id: "always",
      label: "Baseline (every checkpoint)",
      isCandidate: () => true,
    },
    {
      id: "engine_events",
      label: "Incremental engine structure events (shouldRunKarenAnalysis bar_close)",
      isCandidate: ({ engineEvents }) => shouldRunKarenAnalysis("bar_close", engineEvents as never),
    },
    {
      id: "daily_proximity",
      label: "Price within 8pt of PDH/PDL/PDC (daily slice only)",
      isCandidate: ({ bar, barIndex }) => {
        const lv = dailyLevelsAt(data, barIndex);
        if (!lv) return true;
        return nearLevel(bar.close, lv.pdh) || nearLevel(bar.close, lv.pdl) || nearLevel(bar.close, lv.pdc);
      },
    },
    {
      id: "bar_anatomy",
      label: "Bar displacement / range expansion vs prior bar",
      isCandidate: ({ bar, prevBar }) => cheapBarAnatomy(prevBar, bar),
    },
    {
      id: "session_or_hour",
      label: "Session minute change OR hour boundary",
      isCandidate: ({ bar, prevBar }) => {
        if (!prevBar) return true;
        const pm = getEstMinutes(prevBar.time);
        const cm = getEstMinutes(bar.time);
        return pm !== cm || Math.floor(pm / 60) !== Math.floor(cm / 60);
      },
    },
    {
      id: "price_cross_levels",
      label: "majorLevelInteraction vs daily PDH/PDL/PDC",
      isCandidate: ({ bar, prevBar, barIndex }) => {
        if (!prevBar) return true;
        const lv = dailyLevelsAt(data, barIndex);
        if (!lv) return true;
        return majorLevelInteraction(prevBar.close, bar.close, [lv.pdh, lv.pdl, lv.pdc], 8);
      },
    },
    {
      id: "composite_safe",
      label: "OR: engine events | daily proximity | bar anatomy | price cross levels",
      isCandidate: (ctx) => {
        const lv = dailyLevelsAt(data, ctx.barIndex);
        const prox =
          lv &&
          (nearLevel(ctx.bar.close, lv.pdh) ||
            nearLevel(ctx.bar.close, lv.pdl) ||
            nearLevel(ctx.bar.close, lv.pdc));
        const cross =
          ctx.prevBar && lv
            ? majorLevelInteraction(ctx.prevBar.close, ctx.bar.close, [lv.pdh, lv.pdl, lv.pdc], 8)
            : false;
        return (
          shouldRunKarenAnalysis("bar_close", ctx.engineEvents as never) ||
          !!prox ||
          cheapBarAnatomy(ctx.prevBar, ctx.bar) ||
          !!cross
        );
      },
    },
    {
      id: "wait_compression_pit",
      label: "PIT: skip when prev WAIT/FLAT/MONITOR and cheap input fingerprint unchanged",
      isCandidate: ({ prevEval, bar, prevBar, barIndex, engineEvents }) => {
        if (!prevEval || !prevBar) return true;
        const lv = dailyLevelsAt(data, barIndex);
        const inputChanged =
          shouldRunKarenAnalysis("bar_close", engineEvents as never) ||
          cheapBarAnatomy(prevBar, bar) ||
          (lv
            ? majorLevelInteraction(prevBar.close, bar.close, [lv.pdh, lv.pdl, lv.pdc], 8)
            : false);
        if (inputChanged) return true;
        const waitish =
          prevEval.stance === "wait" || prevEval.stance === "flat" || prevEval.stance === "monitor";
        return !waitish;
      },
    },
  ];

  // Single engine pass — collect per-bar structure events (cheap stage-1 probe)
  engine.initialize({ data: prefix, asOf: prefix.m1.at(-1)!.time, lastPrice: prefix.m1.at(-1)!.close });
  const engineEventsByBar = new Map<number, ReturnType<typeof engine.applyClosedBar>["events"]>();
  let enginePassMs = 0;
  for (let i = 0; i < fullWindowIndices.length; i++) {
    const barIndex = fullWindowIndices[i]!;
    const bar = data.m1[barIndex]!;
    const t0 = performance.now();
    const snap = engine.applyClosedBar({ ...bar, time: new Date(bar.time) });
    enginePassMs += performance.now() - t0;
    engineEventsByBar.set(barIndex, snap.events);
  }
  const avgEngineBarMs = enginePassMs / fullWindowIndices.length;

  type ScanCtx = {
    i: number;
    barIndex: number;
    bar: Bar;
    prevBar: Bar | null;
    prevEval: BaselineRow | null;
    engineEvents: ReturnType<typeof engine.applyClosedBar>["events"];
  };

  const evalSet = new Set(evalIndices);
  void evalSet;

  function buildScanCtx(barIndex: number): ScanCtx {
    const pos = fullWindowIndices.indexOf(barIndex);
    const bar = data.m1[barIndex]!;
    const prevBar =
      pos > 0 ? data.m1[fullWindowIndices[pos - 1]!]! : data.m1[barIndex - 1] ?? null;
    const prevEvalIdx = evalIndices.filter((x) => x < barIndex).at(-1);
    const prevEval = prevEvalIdx != null ? baselineByIndex.get(prevEvalIdx) ?? null : null;
    return {
      i: pos,
      barIndex,
      bar,
      prevBar,
      prevEval,
      engineEvents: engineEventsByBar.get(barIndex) ?? [],
    };
  }

  const filterResults: FilterResult[] = [];

  for (const filter of filters) {
    if (filter.id === "always") {
      filterResults.push({
        id: filter.id,
        label: filter.label,
        candidateCount: baseline.length,
        recallActionable: 1,
        missedActionable: [],
        falseNegativeRate: 0,
        envelopeMismatchAtCandidates: 0,
        estimatedMs: baselineTotalMs,
        cheapScanTotalMs: 0,
        fullEvalTotalMs: baselineTotalMs,
      });
      continue;
    }

    let candidateCount = 0;
    let fullEvalMs = 0;
    const missed: FilterResult["missedActionable"] = [];

    for (const barIndex of evalIndices) {
      const ctx = buildScanCtx(barIndex);
      const isCand = filter.isCandidate(ctx);
      const row = baselineByIndex.get(ctx.barIndex)!;

      if (isCand) {
        candidateCount++;
        fullEvalMs += row.totalMs;
      } else if (row.actionable) {
        missed.push({
          barIndex: ctx.barIndex,
          asOf: row.asOf,
          stance: row.stance,
          reason: `actionable ${row.stance}/${row.pipelineVerdict} skipped by ${filter.id}`,
        });
      }
    }

    const cheapScanMs =
      filter.id === "engine_events" || filter.id === "composite_safe" || filter.id === "wait_compression_pit"
        ? (enginePassMs * evalIndices.length) / fullWindowIndices.length
        : evalIndices.length * 0.05;
    const recall =
      actionableRows.length === 0 ? 1 : (actionableRows.length - missed.length) / actionableRows.length;

    filterResults.push({
      id: filter.id,
      label: filter.label,
      candidateCount,
      recallActionable: recall,
      missedActionable: missed,
      falseNegativeRate: actionableRows.length ? missed.length / actionableRows.length : 0,
      envelopeMismatchAtCandidates: 0,
      estimatedMs: cheapScanMs + fullEvalMs,
      cheapScanTotalMs: cheapScanMs,
      fullEvalTotalMs: fullEvalMs,
    });
  }

  // WAIT compression feasibility (PIT-only analysis on baseline rows)
  let waitCompressible = 0;
  let waitTotal = 0;
  let identicalEnvelopeRuns = 0;
  for (let i = 1; i < baseline.length; i++) {
    const prev = baseline[i - 1]!;
    const cur = baseline[i]!;
    const waitish = cur.stance === "wait" || cur.stance === "flat" || cur.stance === "monitor";
    if (!waitish) continue;
    waitTotal++;
    if (prev.envelopeFp === cur.envelopeFp) {
      identicalEnvelopeRuns++;
      const priceDelta = Math.abs(cur.envelope.read.overallStance.length - prev.envelope.read.overallStance.length);
      void priceDelta;
      waitCompressible++;
    }
  }

  const mem1 = memMb();
  const stanceCounts = baseline.reduce(
    (acc, r) => {
      acc[r.stance] = (acc[r.stance] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const out = {
    when: new Date().toISOString(),
    datasetId: data.id,
    window: spec,
    sparseCheckpoints: sparse > 0 ? sparse : null,
    warmup,
    checkpointCount: evalIndices.length,
    fullWindowBarCount: fullWindowIndices.length,
    loadMs: Math.round(loadMs),
    memory: { start: mem0, end: mem1 },
    baseline: {
      totalMs: Math.round(baselineTotalMs),
      avgMsPerCheckpoint: Math.round(baselineTotalMs / baseline.length),
      avgCtxMs: Math.round(baselineCtxMs / baseline.length),
      avgPipelineMs: Math.round(baselinePipelineMs / baseline.length),
      stanceCounts,
      actionableCount: actionableRows.length,
      actionablePct: Math.round((actionableRows.length / baseline.length) * 1000) / 10,
      waitFlatMonitorPct: Math.round(
        ((baseline.filter((r) => r.stance === "wait" || r.stance === "flat" || r.stance === "monitor").length /
          baseline.length) *
          1000) /
          10
      ),
    },
    waitCompression: {
      waitFlatMonitorBars: waitTotal,
      consecutiveIdenticalEnvelope: identicalEnvelopeRuns,
      compressiblePct: waitTotal ? Math.round((waitCompressible / waitTotal) * 1000) / 10 : 0,
      pitSafe: "Only when cheap input fingerprint unchanged — must re-eval on structure events / level cross / displacement",
    },
    enginePass: { totalMs: Math.round(enginePassMs), avgMsPerBar: Math.round(avgEngineBarMs * 100) / 100 },
    filters: filterResults.map((f) => ({
      ...f,
      candidatePct: Math.round((f.candidateCount / evalIndices.length) * 1000) / 10,
      speedupVsBaseline: Math.round((baselineTotalMs / Math.max(1, f.estimatedMs)) * 100) / 100,
      missedActionable: f.missedActionable.slice(0, 8),
      missedCount: f.missedActionable.length,
    })),
  };

  const jsonPath = join(process.cwd(), "data", "research", "karen-candidate-filter-benchmark.json");
  writeFileSync(jsonPath, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
  console.error(`wrote ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
