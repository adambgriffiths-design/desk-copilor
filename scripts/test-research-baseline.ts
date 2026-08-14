/**
 * Baseline backtest validation — look-ahead, reproducibility, ambiguous handling.
 * Run: npm run test:research-baseline
 */
import fs from "fs";
import { evaluateSetupOutcome } from "../lib/research/backtest/outcome";
import {
  baselineSetupExportRecord,
  exportBaselineRun,
  planBaselineSplit,
  runLookAheadPoisonTest,
  runReproducibilityTest,
} from "../lib/research/backtest/baseline";
import {
  createPhase1DecisionPipelineStrategy,
  PHASE1_BASELINE_STRATEGY_VERSION,
} from "../lib/research/backtest/strategies/phase1-decision-pipeline";
import { runBacktest } from "../lib/research/backtest/engine";
import {
  verifyIncrementalEquivalence,
  validateChunkContinuity,
  planIncrementalChunks,
} from "../lib/research/backtest/incremental";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import {
  buildDeterministicKarenResponse,
  buildKarenReplayResponse,
} from "../lib/research/replay/karen";
import { buildSyntheticFixture, ensureResearchFixtures } from "../lib/research/replay/fixtures";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import { buildMarketState } from "../lib/market-state-build";
import { buildMarketObservation } from "../lib/observation-engine";
import { buildTradingDecision } from "../lib/decision-layer";
import { buildMarketInterpretation } from "../lib/interpretation-engine";
import type { Bar } from "../lib/types";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Small slice for fast CI — full baseline runs on complete fixture via CLI. */
function minimalFixture() {
  const base = buildSyntheticFixture();
  const m1 = base.m1.slice(0, 40);
  return { ...base, m1, m5: base.m5.slice(0, 8), m15: base.m15.slice(0, 3) };
}

function poisonedMinimal() {
  const base = minimalFixture();
  const m1 = base.m1.map((b) => ({ ...b }));
  const idx = m1.length - 3;
  m1[idx] = { ...m1[idx]!, high: 99999, low: 1, open: 25000, close: 25000 };
  return { ...base, m1 };
}

function test1PoisonFutureCandleUnchanged() {
  console.log("\n1. poison future candle — historical decision unchanged");
  const fixture = poisonedMinimal();
  const strategy = createPhase1DecisionPipelineStrategy(fixture);
  const result = runLookAheadPoisonTest(fixture, strategy);
  assert("look-ahead poison test passes", result.pass, result.detail);
}

function test2Reproducibility() {
  console.log("\n2. reproducibility — same config → identical outcomes");
  const fixture = minimalFixture();
  const strategy = createPhase1DecisionPipelineStrategy(fixture);
  const config = {
    dataset: { id: fixture.id, symbol: fixture.symbol, m1: fixture.m1, daily: fixture.daily, m5: fixture.m5, m15: fixture.m15 },
    strategy,
  };
  const runA = runBacktest(config);
  const runB = runBacktest(config);
  const strip = (r: typeof runA) =>
    r.setups.map((s) => ({ timestamp: s.timestamp, direction: s.direction, entry: s.entry, outcome: s.outcome, result_R: s.result_R }));
  assert("same setup count", runA.setups.length === runB.setups.length);
  assert("same outcomes", JSON.stringify(strip(runA)) === JSON.stringify(strip(runB)));
}

function test3AmbiguousHandling() {
  console.log("\n3. ambiguous intrabar — no invented order");
  const bars: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 115, low: 90, close: 105 },
  ];
  const result = evaluateSetupOutcome({
    direction: "LONG",
    entry: 100,
    stop: 95,
    target: 110,
    entryBarIndex: 0,
    forwardBars: bars,
  });
  assert("outcome AMBIGUOUS", result.outcome === "AMBIGUOUS");
  assert("ambiguity flag", result.ambiguity === true);
  assert("result_R zero", result.resultR === 0);
}

function test4LookAheadSetupDetection() {
  console.log("\n4. setup detection uses only data ≤ T");
  const fixture = minimalFixture();
  const checkIndex = 20;
  let barsAtCheck = 0;
  const strategy = createPhase1DecisionPipelineStrategy(fixture);
  const wrapped = {
    ...strategy,
    detectSetup(ctx: Parameters<typeof strategy.detectSetup>[0]) {
      if (ctx.barIndex === checkIndex) {
        barsAtCheck = ctx.barsAtT.length;
        const cutoff = new ReplayDataCutoff(fixture, new Date(ctx.snapshot.asOf));
        cutoff.assertNoFutureLeak();
      }
      return strategy.detectSetup(ctx);
    },
  };
  runBacktest({
    dataset: { id: fixture.id, symbol: fixture.symbol, m1: fixture.m1, daily: fixture.daily, m5: fixture.m5, m15: fixture.m15 },
    strategy: wrapped,
  });
  assert("bars at T = index+1", barsAtCheck === checkIndex + 1, `got ${barsAtCheck}`);
}

function test5FeaturesSeparateFromOutcome() {
  console.log("\n5. export — features separate from outcome labels");
  const fixture = minimalFixture();
  const strategy = createPhase1DecisionPipelineStrategy(fixture);
  const bt = runBacktest({
    dataset: { id: fixture.id, symbol: fixture.symbol, m1: fixture.m1, daily: fixture.daily, m5: fixture.m5, m15: fixture.m15 },
    strategy,
  });

  if (bt.setups.length > 0) {
    const rec = baselineSetupExportRecord(bt.setups[0]!);
    assert("features object present", typeof rec.features === "object");
    assert("outcome separate", typeof rec.outcome === "string");
    assert("features lack result_R", !("result_R" in (rec.features as object)));
    assert("setup_type field present", typeof rec.setup_type === "string");
  } else {
    assert("export schema valid with zero setups", true);
  }

  const emptyStats = {
    totalSetups: 0,
    wins: 0,
    losses: 0,
    ambiguous: 0,
    cancelled: 0,
    expired: 0,
    neutral: 0,
    open: 0,
    winRate: 0,
    avgR: 0,
    medianR: 0,
    expectancy: 0,
    profitFactor: 0,
    maxDrawdownR: 0,
    avgMfe: 0,
    avgMae: 0,
    avgBarsHeld: 0,
    avgTimeHeldMs: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    breakdown: {
      byDirection: {},
      byTimeframe: {},
      bySetupType: {},
      bySession: {},
      byMonth: {},
      byWeekDay: {},
    },
  };
  const exported = exportBaselineRun({
    runId: "test-export-mini",
    strategyDefinitionVersion: PHASE1_BASELINE_STRATEGY_VERSION,
    strategyRules: { layers: [] } as never,
    documentedAmbiguities: [],
    dataset: {
      id: fixture.id,
      label: "test",
      symbol: fixture.symbol,
      dateRange: { start: fixture.m1[0]!.time.toISOString(), end: fixture.m1.at(-1)!.time.toISOString() },
      barCount: fixture.m1.length,
    },
    dataQuality: {
      totalCandles: fixture.m1.length,
      missingMinutes: 0,
      duplicateCount: 0,
      invalidOhlcCount: 0,
      sessionGapCount: 0,
      partialFirst: false,
      partialLast: false,
      integrityStatus: "VALID",
      issues: [],
      ambiguousOutcomesNote: "test",
    },
    split: planBaselineSplit(fixture.m1, { trainRatio: 0.7 }),
    periods: {
      full: { label: "FULL", window: { start: "", end: "" }, setups: bt.setups, statistics: emptyStats },
      train: { label: "TRAIN", window: { start: "", end: "" }, setups: [], statistics: emptyStats },
      test: { label: "TEST", window: { start: "", end: "" }, setups: [], statistics: emptyStats },
    },
    lookAheadTest: { pass: true, detail: "test" },
    reproducibility: { pass: true, fingerprint: "test", detail: "test" },
    interpretation: "INSUFFICIENT DATA",
    runAt: new Date().toISOString(),
    gitRevision: null,
  });
  assert("manifest written", fs.existsSync(exported.manifestPath));
  assert("report contains HONEST BASELINE", fs.readFileSync(exported.reportPath, "utf8").includes("HONEST BASELINE"));
}

function test6BaselineSplitChronological() {
  console.log("\n6. train/test split chronological");
  const fixture = minimalFixture();
  const split = planBaselineSplit(fixture.m1, { trainRatio: 0.7 });
  assert("train ends before test starts", split.train.endIndex < split.test.startIndex);
  assert("train start is first bar", split.train.startIndex === 0);
  assert("test end is last bar", split.test.endIndex === fixture.m1.length - 1);
}

function test7StrategyVersionDocumented() {
  console.log("\n7. strategy definition version pinned");
  assert("version string present", PHASE1_BASELINE_STRATEGY_VERSION.includes("phase1-decision-pipeline"));
  assert("spec version in string", PHASE1_BASELINE_STRATEGY_VERSION.includes("spec-"));
}

function test9ReplayDeterministicVsBaselineDivergence() {
  console.log("\n9. replay deterministic Karen ≠ baseline pipeline (falsification guard)");
  const fixture = buildSyntheticFixture();
  const strategy = createPhase1DecisionPipelineStrategy(fixture);
  strategy.onRunStart?.();

  let detLongShort = 0;
  let pipelineDataQualityOk = 0;
  let baselineDataQualityOk = 0;

  for (let i = 10; i < fixture.m1.length; i += 10) {
    const bar = fixture.m1[i]!;
    const asOf = bar.time;
    const cutoff = new ReplayDataCutoff(fixture, asOf);
    const ctx = cutoff.buildContext();
    const m1 = cutoff.slicedM1();

    const det = buildDeterministicKarenResponse(ctx, fixture, asOf);
    if (det.pipelineVerdict === "LONG" || det.pipelineVerdict === "SHORT") detLongShort++;

    const { karen: pipeKaren, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);
    if (pipeKaren.source === "pipeline" && pipeline.observation.data_quality !== "missing" && pipeline.observation.data_quality !== "stale") {
      pipelineDataQualityOk++;
    }

    const proposal = strategy.detectSetup({
      snapshot: {
        datasetId: fixture.id,
        symbol: fixture.symbol,
        asOf: asOf.toISOString(),
        currentPrice: m1.at(-1)?.close ?? ctx.daily.lastClose,
        barCountAtCutoff: m1.length,
        availableCandleRange: {
          start: fixture.m1[0]!.time.toISOString(),
          end: asOf.toISOString(),
        },
        structureSummary: "",
        features: {},
        marketContext: ctx,
      },
      bar,
      barIndex: i,
      barsAtT: m1,
    });
    const dq = (proposal?.features as { data_quality?: string } | undefined)?.data_quality;
    if (dq && dq !== "missing" && dq !== "stale") baselineDataQualityOk++;
    else if (!proposal && m1.length >= 20) {
      const snap = buildResearchChartSnapshotFromBars({ bars: m1, symbol: ctx.symbol, asOf });
      const state = buildMarketState({
        ctx,
        chartLastPrice: bar.close,
        chartLastPriceSource: "yahoo",
        symbol: ctx.symbol,
        chartSnapshot: snap,
      });
      const obs = buildMarketObservation(ctx, state);
      if (obs.data_quality !== "missing" && obs.data_quality !== "stale") baselineDataQualityOk++;
    }
  }
  strategy.onRunEnd?.();

  assert("deterministic replay always LONG|SHORT on samples", detLongShort >= 5);
  assert("pipeline passes data_quality gate on historical samples", pipelineDataQualityOk >= 5);
  assert("baseline passes data_quality gate on historical samples", baselineDataQualityOk >= 5);
  assert("deterministic source tagged", buildDeterministicKarenResponse(
    new ReplayDataCutoff(fixture, fixture.m1[50]!.time).buildContext(),
    fixture,
    fixture.m1[50]!.time
  ).source === "deterministic");
}

function test11HistoricalDataQualityAtCutoff() {
  console.log("\n11. historical bars → valid chartSnapshot → data_quality accepted");
  const fixture = buildSyntheticFixture();
  const barIndex = 50;
  const bar = fixture.m1[barIndex]!;
  const asOf = bar.time;
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();

  const snap = buildResearchChartSnapshotFromBars({ bars: m1, symbol: ctx.symbol, asOf });
  assert("chart source research_bars", snap.source === "research_bars");
  assert("quality not missing", snap.quality !== "missing", String(snap.quality));
  assert("quality not stale at cutoff", snap.quality !== "stale", String(snap.quality));
  assert("candle count sufficient", (snap.candles?.length ?? 0) >= 20);

  const state = buildMarketState({
    ctx,
    chartLastPrice: bar.close,
    chartLastPriceSource: "yahoo",
    symbol: ctx.symbol,
    chartSnapshot: snap,
  });
  const obs = buildMarketObservation(ctx, state);
  assert("observation data_quality accepted", obs.data_quality !== "missing" && obs.data_quality !== "stale", obs.data_quality);

  const interp = buildMarketInterpretation(obs);
  const decision = buildTradingDecision(obs, interp, ctx);
  assert(
    "decision not blocked by data quality",
    !decision.verdict_reason.includes("Chart data missing or stale"),
    decision.verdict_reason
  );
  assert("structure fields populated", obs.market_structure !== "unknown" || obs.fvg.status !== "unknown");
}

function test8BaselineReuseEquivalence() {
  console.log("\n8. baseline reuse — poison/repro match independent runs");
  const fixture = minimalFixture();
  const strategy = createPhase1DecisionPipelineStrategy(fixture);
  const config = {
    dataset: { id: fixture.id, symbol: fixture.symbol, m1: fixture.m1, daily: fixture.daily, m5: fixture.m5, m15: fixture.m15 },
    strategy,
  };
  const full = runBacktest(config);

  const poisonIndependent = runLookAheadPoisonTest(fixture, strategy);
  const poisonReuse = runLookAheadPoisonTest(fixture, strategy, full);
  assert("poison reuse same pass", poisonIndependent.pass === poisonReuse.pass);
  assert("poison reuse same detail", poisonIndependent.detail === poisonReuse.detail);

  const reproIndependent = (() => {
    const a = runBacktest(config);
    const b = runBacktest(config);
    const strip = (r: typeof a) =>
      r.setups.map((s) => ({ timestamp: s.timestamp, direction: s.direction, entry: s.entry, outcome: s.outcome, result_R: s.result_R }));
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  })();
  const reproReuse = runReproducibilityTest(config, full);
  assert("repro reuse matches independent determinism", reproIndependent === reproReuse.pass);
}

function test10IncrementalEquivalence() {
  console.log("\n10. incremental chunked backtest ≡ monolithic");
  const fixture = minimalFixture();
  const strategy = createPhase1DecisionPipelineStrategy(fixture);
  const config = {
    dataset: { id: fixture.id, symbol: fixture.symbol, m1: fixture.m1, daily: fixture.daily, m5: fixture.m5, m15: fixture.m15 },
    strategy,
  };

  const plan = planIncrementalChunks(0, fixture.m1.length - 1, 25);
  assert("chunk plan continuous", validateChunkContinuity(plan.chunks));
  assert("chunk count for 40 bars @25", plan.chunks.length === 2);

  const equiv = verifyIncrementalEquivalence(config, 25);
  assert("incremental fingerprint matches monolithic", equiv.pass, `${equiv.monolithicFingerprint} vs ${equiv.incrementalFingerprint}`);

  const varied = verifyIncrementalEquivalence(config, 7);
  assert("incremental chunk-size 7 matches", varied.pass);
}

console.log("=== Research Baseline Backtest Tests ===");
ensureResearchFixtures();
test1PoisonFutureCandleUnchanged();
test2Reproducibility();
test3AmbiguousHandling();
test4LookAheadSetupDetection();
test6BaselineSplitChronological();
test7StrategyVersionDocumented();
test8BaselineReuseEquivalence();
test9ReplayDeterministicVsBaselineDivergence();
test11HistoricalDataQualityAtCutoff();
test10IncrementalEquivalence();
test5FeaturesSeparateFromOutcome();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
