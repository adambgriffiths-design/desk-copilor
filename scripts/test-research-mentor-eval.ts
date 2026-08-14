/**
 * Mentor-quality evaluation framework tests.
 * Run: npm run test:research-mentor-eval
 */
import { buildMarketState } from "../lib/market-state-build";
import { buildTradingDecision } from "../lib/decision-layer";
import { buildMarketInterpretation } from "../lib/interpretation-engine";
import { buildMarketObservation } from "../lib/observation-engine";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import { evaluateMentorResponse } from "../lib/research/mentor/evaluation";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import {
  buildDeterministicKarenResponse,
  buildKarenReplayResponse,
} from "../lib/research/replay/karen";
import {
  ensureResearchFixtures,
  loadResearchDatasetFixture,
  loadReplayFixture,
} from "../lib/research/replay/fixtures";

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

function testPipelinePassesDataQualityAtNqOpen() {
  console.log("\n1. pipeline mentor eval at NQ 14:30Z — data quality unblocked");
  ensureResearchFixtures();
  const fixture = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const asOf = new Date("2026-08-12T14:30:00.000Z");
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();

  const { karen, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);
  assert("source pipeline", karen.source === "pipeline");
  assert("data_quality good", pipeline.observation.data_quality === "good", pipeline.observation.data_quality);
  assert("not NO_TRADE from data gate", pipeline.decision.verdict !== "NO_TRADE" || !pipeline.decision.verdict_reason.includes("Chart data missing"));

  const evalResult = evaluateMentorResponse({
    asOf: asOf.toISOString(),
    karen,
    observation: pipeline.observation,
    interpretation: pipeline.interpretation,
    decision: pipeline.decision,
    availableBarTimes: m1.map((b) => b.time.toISOString()),
  });

  assert("no forced_signal falsification", !evalResult.falsifications.find((f) => f.flag === "forced_signal")?.detected);
  assert("data_quality_honesty pass", evalResult.criteria.find((c) => c.id === "data_quality_honesty")!.score >= 1);
  assert("no_hindsight pass", evalResult.criteria.find((c) => c.id === "no_hindsight")!.score === 2);
  console.log(`    verdict=${pipeline.decision.verdict} score=${evalResult.pctScore}% mentorEvalReady=${evalResult.mentorEvalReady}`);
}

function testDeterministicFailsForcedSignal() {
  console.log("\n2. deterministic replay fails mentor eval (forced signal)");
  const fixture = loadReplayFixture("synthetic-ny-am");
  const asOf = new Date(fixture.m1[50]!.time);
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();

  const det = buildDeterministicKarenResponse(ctx, fixture, asOf);
  const snap = buildResearchChartSnapshotFromBars({ bars: m1, symbol: ctx.symbol, asOf });
  const state = buildMarketState({
    ctx,
    chartLastPrice: m1.at(-1)!.close,
    chartLastPriceSource: "yahoo",
    symbol: ctx.symbol,
    chartSnapshot: snap,
  });
  const obs = buildMarketObservation(ctx, state);
  const interp = buildMarketInterpretation(obs);
  const decision = buildTradingDecision(obs, interp, ctx);

  const evalResult = evaluateMentorResponse({
    asOf: asOf.toISOString(),
    karen: det,
    observation: obs,
    interpretation: interp,
    decision,
    availableBarTimes: m1.map((b) => b.time.toISOString()),
  });

  assert("deterministic source", det.source === "deterministic");
  assert("forced_signal detected", evalResult.falsifications.some((f) => f.flag === "forced_signal" && f.detected));
  assert("no_forced_direction score 0", evalResult.criteria.find((c) => c.id === "no_forced_direction")!.score === 0);
  assert("mentorEvalReady false", !evalResult.mentorEvalReady);
}

function testSyntheticPipelineMentorEval() {
  console.log("\n3. synthetic pipeline mentor eval structure");
  const fixture = loadReplayFixture("synthetic-ny-am");
  const asOf = new Date(fixture.m1[80]!.time);
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();

  const { karen, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);
  const evalResult = evaluateMentorResponse({
    asOf: asOf.toISOString(),
    karen,
    observation: pipeline.observation,
    interpretation: pipeline.interpretation,
    decision: pipeline.decision,
    availableBarTimes: m1.map((b) => b.time.toISOString()),
  });

  assert("10 criteria scored", evalResult.criteria.length === 10);
  assert("max score 20", evalResult.maxScore === 20);
  assert("pct 0-100", evalResult.pctScore >= 0 && evalResult.pctScore <= 100);
  assert("pipeline source", evalResult.source === "pipeline");
}

function testResearchBarsAdapter() {
  console.log("\n4. research_bars adapter → observation accepted");
  const fixture = loadReplayFixture("synthetic-ny-am");
  const asOf = new Date(fixture.m1[60]!.time);
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();
  const snap = buildResearchChartSnapshotFromBars({ bars: m1, symbol: ctx.symbol, asOf });
  assert("source research_bars", snap.source === "research_bars");
  assert("quality not missing", snap.quality !== "missing", String(snap.quality));

  const state = buildMarketState({ ctx, chartLastPrice: m1.at(-1)!.close, chartSnapshot: snap, symbol: ctx.symbol });
  const obs = buildMarketObservation(ctx, state);
  assert("observation not missing", obs.data_quality !== "missing", obs.data_quality);
}

console.log("=== Research Mentor Evaluation Tests ===");
testPipelinePassesDataQualityAtNqOpen();
testDeterministicFailsForcedSignal();
testSyntheticPipelineMentorEval();
testResearchBarsAdapter();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
