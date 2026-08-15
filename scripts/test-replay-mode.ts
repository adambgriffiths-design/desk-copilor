/**
 * Karen Trading Replay — 8 required isolation tests.
 * Run: npm run test:replay-mode
 */
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { computeExcursion, forwardBarsAfter } from "../lib/research/replay/excursion";
import { buildDeterministicKarenResponse } from "../lib/research/replay/karen";
import { buildSyntheticFixture } from "../lib/research/replay/fixtures";
import {
  clearReplaySessions,
  createReplaySession,
  getReplaySession,
  lockVerdict,
  recordReveal,
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

function testFutureCandlesExcluded() {
  console.log("\n1. future candles excluded");
  const fixture = buildSyntheticFixture();
  const asOf = fixture.m1[50]!.time;
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const m1 = cutoff.slicedM1();
  assert("sliced count <= 51", m1.length === 51, `got ${m1.length}`);
  assert("last bar <= asOf", m1.at(-1)!.time.getTime() <= asOf.getTime());
  assert("no bar after index 50", !m1.some((b) => b.time.getTime() > asOf.getTime()));
  cutoff.assertNoFutureLeak();
}

function testFutureFvgsExcluded() {
  console.log("\n2. future FVGs excluded");
  const fixture = buildSyntheticFixture();
  const beforeGap = fixture.m1[55]!.time;
  const afterGap = fixture.m1[65]!.time;
  const ctxBefore = new ReplayDataCutoff(fixture, beforeGap).buildContext();
  const ctxAfter = new ReplayDataCutoff(fixture, afterGap).buildContext();
  const fvgsBefore = ctxBefore.structureFacts.m1UnfilledFvgs.length;
  const fvgsAfter = ctxAfter.structureFacts.m1UnfilledFvgs.length;
  assert("fewer FVGs before gap forms", fvgsBefore <= fvgsAfter);
  const cutoff = new ReplayDataCutoff(fixture, beforeGap);
  const leak = cutoff.futureFvgsInFullDataset(ctxBefore);
  assert("no future-timestamp FVGs in cutoff ctx", leak === 0, `leak count ${leak}`);
}

function testFuturePdArraysExcluded() {
  console.log("\n3. future PD arrays excluded");
  const fixture = buildSyntheticFixture();
  const early = fixture.m1[20]!.time;
  const late = fixture.m1[80]!.time;
  const ctxEarly = new ReplayDataCutoff(fixture, early).buildContext();
  const ctxLate = new ReplayDataCutoff(fixture, late).buildContext();
  assert(
    "current day high differs with more bars",
    ctxEarly.daily.currentDayHigh <= ctxLate.daily.currentDayHigh
  );
  assert("early ctx uses only partial day", ctxEarly.daily.currentDayHigh <= fixture.m1[20]!.high + 5);
}

function testVerdictImmutableAfterLock() {
  console.log("\n4. verdict immutable after lock");
  clearReplaySessions();
  const session = createReplaySession("synthetic-ny-am", new Date().toISOString());
  lockVerdict(session.id, {
    direction: "LONG",
    entry: 25000,
    invalidation: 24980,
    target: 25040,
    lockedAt: new Date().toISOString(),
    karen: buildDeterministicKarenResponse(
      new ReplayDataCutoff(buildSyntheticFixture(), buildSyntheticFixture().m1[50]!.time).buildContext(),
      buildSyntheticFixture(),
      buildSyntheticFixture().m1[50]!.time
    ),
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

function testRevealRequiresLock() {
  console.log("\n5. reveal cannot access before lock");
  clearReplaySessions();
  const session = createReplaySession("synthetic-ny-am", new Date().toISOString());
  let threw = false;
  try {
    recordReveal(session.id);
  } catch (e) {
    threw = e instanceof Error && e.message.includes("lock");
  }
  assert("reveal before lock rejected", threw);
}

function testMfeMaeCorrect() {
  console.log("\n6. MFE/MAE correct");
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
  assert("MFE = 8 (high 108 - entry 100)", result.mfe === 8, `got ${result.mfe}`);
  assert("MAE = 4 (entry 100 - low 96)", result.mae === 4, `got ${result.mae}`);
}

function testTargetVsInvalidationOrdering() {
  console.log("\n7. target vs invalidation ordering correct");
  const winFirst: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 111, low: 99, close: 110 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 110, high: 110, low: 94, close: 95 },
  ];
  const win = computeExcursion({
    direction: "LONG",
    entry: 100,
    target: 110,
    invalidation: 95,
    forwardBars: winFirst,
  });
  assert("target hit first → WIN", win.firstHit === "target" && win.outcome === "WIN");

  const lossFirst: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 101, low: 94, close: 95 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 95, high: 115, low: 95, close: 112 },
  ];
  const loss = computeExcursion({
    direction: "LONG",
    entry: 100,
    target: 110,
    invalidation: 95,
    forwardBars: lossFirst,
  });
  assert("invalidation hit first → LOSS", loss.firstHit === "invalidation" && loss.outcome === "LOSS");
}

function testDeterministicRepeat() {
  console.log("\n8. deterministic repeat");
  const fixture = buildSyntheticFixture();
  const asOf = fixture.m1[50]!.time;
  const ctx = new ReplayDataCutoff(fixture, asOf).buildContext();
  const a = buildDeterministicKarenResponse(ctx, fixture, asOf);
  const b = buildDeterministicKarenResponse(ctx, fixture, asOf);
  assert("same entry idea", a.entryIdea === b.entryIdea);
  assert("same confidence", a.confidence === b.confidence);
  assert("same pipeline verdict", a.pipelineVerdict === b.pipelineVerdict);
  assert("same candles used", JSON.stringify(a.candlesUsed) === JSON.stringify(b.candlesUsed));
}

function testForwardBarsHelper() {
  const fixture = buildSyntheticFixture();
  const asOf = fixture.m1[50]!.time;
  const fwd = forwardBarsAfter(fixture.m1, asOf, 5);
  assert("forward helper returns 5 bars", fwd.length === 5, `got ${fwd.length}`);
}

console.log("=== Karen Trading Replay Tests ===");
testFutureCandlesExcluded();
testFutureFvgsExcluded();
testFuturePdArraysExcluded();
testVerdictImmutableAfterLock();
testRevealRequiresLock();
testMfeMaeCorrect();
testTargetVsInvalidationOrdering();
testDeterministicRepeat();
testForwardBarsHelper();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
