/**
 * Research/Replay Foundation — 10 required isolation tests.
 * Run: npm run test:research-replay
 */
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { buildDatasetRecord, datasetRecordFingerprint } from "../lib/research/replay/dataset";
import { ReplayEngine } from "../lib/research/replay/engine";
import { computeExcursion, forwardBarsAfter } from "../lib/research/replay/excursion";
import { extractFeaturesAtCutoff } from "../lib/research/replay/features";
import { buildSyntheticFixture, ensureResearchFixtures } from "../lib/research/replay/fixtures";
import { buildDeterministicKarenResponse } from "../lib/research/replay/karen";
import { evaluateOutcome } from "../lib/research/replay/outcome";
import {
  clearReplaySessions,
  createReplaySession,
  getReplaySession,
  lockVerdict,
} from "../lib/research/replay/session";
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

function poisonedFixture() {
  const base = buildSyntheticFixture();
  const m1 = base.m1.map((b) => ({ ...b }));
  m1[90] = {
    ...m1[90]!,
    high: 99999,
    low: 1,
    open: 25000,
    close: 25000,
  };
  return { ...base, m1 };
}

function test1FutureCandlesExcluded() {
  console.log("\n1. future candles excluded from snapshot");
  const fixture = buildSyntheticFixture();
  const asOf = fixture.m1[50]!.time;
  const engine = new ReplayEngine(fixture, { initialIndex: 50 });
  const snap = engine.snapshot();
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const m1 = cutoff.slicedM1();
  assert("engine bar count matches cutoff", snap.barCountAtCutoff === m1.length);
  assert("no bar after asOf in snapshot range end", snap.availableCandleRange.end === asOf.toISOString());
  cutoff.assertNoFutureLeak();
}

function test2FutureHighLowCannotLeak() {
  console.log("\n2. future high/low cannot leak into features");
  const fixture = poisonedFixture();
  const asOf = fixture.m1[50]!.time;
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const ctx = cutoff.buildContext();
  const features = extractFeaturesAtCutoff(ctx, cutoff);
  assert("session high excludes future poison bar", features.sessionHighAtCutoff < 99999, `got ${features.sessionHighAtCutoff}`);
  assert("session low excludes future poison bar", features.sessionLowAtCutoff > 1, `got ${features.sessionLowAtCutoff}`);
  assert("current day high excludes future poison", ctx.daily.currentDayHigh < 99999, `got ${ctx.daily.currentDayHigh}`);
}

function test3FvgOnlyAtT() {
  console.log("\n3. FVG detection only uses candles at T");
  const fixture = buildSyntheticFixture();
  const beforeGap = fixture.m1[55]!.time;
  const afterGap = fixture.m1[65]!.time;
  const ctxBefore = new ReplayDataCutoff(fixture, beforeGap).buildContext();
  const ctxAfter = new ReplayDataCutoff(fixture, afterGap).buildContext();
  const cutoff = new ReplayDataCutoff(fixture, beforeGap);
  const leak = cutoff.futureFvgsInFullDataset(ctxBefore);
  assert("no future-timestamp FVGs at cutoff", leak === 0, `leak ${leak}`);
  assert("FVG count increases only after gap forms", ctxBefore.structureFacts.m1UnfilledFvgs.length <= ctxAfter.structureFacts.m1UnfilledFvgs.length);
}

function test4PdOnlyAtT() {
  console.log("\n4. PD levels only use data at T");
  const fixture = buildSyntheticFixture();
  const early = fixture.m1[20]!.time;
  const late = fixture.m1[80]!.time;
  const ctxEarly = new ReplayDataCutoff(fixture, early).buildContext();
  const ctxLate = new ReplayDataCutoff(fixture, late).buildContext();
  assert("PDH stable (previous day)", ctxEarly.htfPdArrays.previousDay.high === ctxLate.htfPdArrays.previousDay.high);
  assert("current day high grows with more bars", ctxEarly.daily.currentDayHigh <= ctxLate.daily.currentDayHigh);
  assert("early day high bounded by early bars", ctxEarly.daily.currentDayHigh <= fixture.m1[20]!.high + 5);
}

function test5LockedVerdictImmutable() {
  console.log("\n5. locked verdict immutable after reveal");
  clearReplaySessions();
  const fixture = buildSyntheticFixture();
  const asOf = fixture.m1[50]!.time;
  const session = createReplaySession("synthetic-ny-am", asOf.toISOString());
  const karen = buildDeterministicKarenResponse(
    new ReplayDataCutoff(fixture, asOf).buildContext(),
    fixture,
    asOf
  );
  lockVerdict(session.id, {
    direction: "LONG",
    entry: 25000,
    invalidation: 24980,
    target: 25040,
    lockedAt: new Date().toISOString(),
    karen,
  });
  let threw = false;
  try {
    lockVerdict(session.id, {
      direction: "SHORT",
      entry: 25000,
      invalidation: 25020,
      target: 24980,
      lockedAt: new Date().toISOString(),
      karen: {} as never,
    });
  } catch (e) {
    threw = e instanceof Error && e.message.includes("locked");
  }
  assert("second lock rejected", threw);
  assert("first verdict preserved", getReplaySession(session.id)?.locked?.direction === "LONG");
}

function test6MfeCorrect() {
  console.log("\n6. MFE correct");
  const bars: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 105, low: 99, close: 104 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 104, high: 108, low: 102, close: 107 },
    { time: new Date("2026-08-12T14:02:00Z"), open: 107, high: 107, low: 96, close: 97 },
  ];
  const result = computeExcursion({
    direction: "LONG",
    entry: 100,
    target: 110,
    invalidation: 95,
    forwardBars: bars,
  });
  assert("MFE = 8", result.mfe === 8, `got ${result.mfe}`);
}

function test7MaeCorrect() {
  console.log("\n7. MAE correct");
  const bars: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 105, low: 99, close: 104 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 104, high: 108, low: 102, close: 107 },
    { time: new Date("2026-08-12T14:02:00Z"), open: 107, high: 107, low: 96, close: 97 },
  ];
  const result = computeExcursion({
    direction: "LONG",
    entry: 100,
    target: 110,
    invalidation: 95,
    forwardBars: bars,
  });
  assert("MAE = 4", result.mae === 4, `got ${result.mae}`);
}

function test8TargetVsStopOrdering() {
  console.log("\n8. target-vs-stop ordering deterministic");
  const winFirst: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 111, low: 99, close: 110 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 110, high: 110, low: 94, close: 95 },
  ];
  const win = evaluateOutcome({
    direction: "LONG",
    entry: 100,
    target: 110,
    invalidation: 95,
    forwardBars: winFirst,
  });
  assert("target first → WIN", win.firstHit === "target" && win.finalOutcome === "WIN");
  assert("barsToTarget = 1", win.barsToTarget === 1);

  const lossFirst: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 101, low: 94, close: 95 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 95, high: 115, low: 95, close: 112 },
  ];
  const loss = evaluateOutcome({
    direction: "LONG",
    entry: 100,
    target: 110,
    invalidation: 95,
    forwardBars: lossFirst,
  });
  assert("invalidation first → LOSS", loss.firstHit === "invalidation" && loss.finalOutcome === "LOSS");
  assert("barsToInvalidation = 1", loss.barsToInvalidation === 1);
}

function test9ReplayDeterministic() {
  console.log("\n9. replay deterministic on repeat");
  const fixture = buildSyntheticFixture();
  const engineA = new ReplayEngine(fixture, { initialIndex: 50 });
  const engineB = new ReplayEngine(fixture, { initialIndex: 50 });
  const snapA = engineA.snapshot();
  const snapB = engineB.snapshot();
  assert("same features hash", JSON.stringify(snapA.features) === JSON.stringify(snapB.features));
  engineA.stepForward(5);
  engineB.stepForward(5);
  assert("same after step", snapA.asOf !== engineA.snapshot().asOf && engineA.snapshot().asOf === engineB.snapshot().asOf);
  engineA.reset();
  engineB.reset();
  assert("reset restores start", engineA.snapshot().asOf === engineB.snapshot().asOf);
}

function testDominantBiasOverridesDailyHint() {
  console.log("\n11. dominantBias overrides daily.biasHint in Karen");
  const fixture = buildSyntheticFixture();
  const asOf = fixture.m1[50]!.time;
  const ctx = new ReplayDataCutoff(fixture, asOf).buildContext();
  ctx.daily.biasHint = "bullish";
  ctx.biasStack = { ...ctx.biasStack, dominantBias: "bearish", tradeableBias: "bearish" };
  ctx.structureFacts = { ...ctx.structureFacts, mss: undefined };

  const karen = buildDeterministicKarenResponse(ctx, fixture, asOf);
  assert("bearish dominantBias → SHORT", karen.pipelineVerdict === "SHORT", `got ${karen.pipelineVerdict}`);
  assert("not long on bullish daily hint alone", karen.pipelineVerdict !== "LONG");
}

function test10DatasetRecordsDeterministic() {
  console.log("\n10. dataset records deterministic");
  const fixture = buildSyntheticFixture();
  const engine = new ReplayEngine(fixture, { initialIndex: 50 });
  const snap = engine.snapshot();
  const fwd = forwardBarsAfter(fixture.m1, new Date(snap.asOf), 10);
  const outcome = evaluateOutcome({
    direction: "LONG",
    entry: snap.currentPrice,
    target: snap.currentPrice + 20,
    invalidation: snap.currentPrice - 15,
    forwardBars: fwd,
  });
  const recordA = buildDatasetRecord({
    snapshot: snap,
    setupType: "manual-replay",
    direction: "LONG",
    entry: snap.currentPrice,
    invalidation: snap.currentPrice - 15,
    target: snap.currentPrice + 20,
    confidence: 65,
    outcome,
  });
  const recordB = buildDatasetRecord({
    snapshot: snap,
    setupType: "manual-replay",
    direction: "LONG",
    entry: snap.currentPrice,
    invalidation: snap.currentPrice - 15,
    target: snap.currentPrice + 20,
    confidence: 65,
    outcome,
  });
  assert("fingerprints match", datasetRecordFingerprint(recordA) === datasetRecordFingerprint(recordB));
  assert("serialized JSON match", JSON.stringify(recordA) === JSON.stringify(recordB));
  assert("features separate from outcome", recordA.features.m1FvgCount >= 0 && recordA.outcome?.mfe != null);
}

console.log("=== Research/Replay Foundation Tests ===");
ensureResearchFixtures();
test1FutureCandlesExcluded();
test2FutureHighLowCannotLeak();
test3FvgOnlyAtT();
test4PdOnlyAtT();
test5LockedVerdictImmutable();
test6MfeCorrect();
test7MaeCorrect();
test8TargetVsStopOrdering();
test9ReplayDeterministic();
test10DatasetRecordsDeterministic();
testDominantBiasOverridesDailyHint();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
