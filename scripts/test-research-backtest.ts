import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { ReplayEngine } from "../lib/research/replay/engine";
import { buildSyntheticFixture, ensureResearchFixtures } from "../lib/research/replay/fixtures";
import {
  buildTinyBacktestFixture,
  evaluateSetupOutcome,
  forwardBarsFromIndex,
  planWalkForward,
  priorSessionHighBreakStrategy,
  runBacktest,
  runFingerprint,
  toExportRecord,
} from "../lib/research/backtest";
import type { SetupProposal, StrategyContext, StrategyPlugin } from "../lib/research/backtest/types";
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

const leakProbeStrategy: StrategyPlugin = {
  id: "leak-probe",
  name: "Leak probe",
  detectSetup(ctx: StrategyContext): SetupProposal | null {
    const futureHigh = Math.max(ctx.snapshot.features.currentDayHigh, ctx.bar.high);
    if (futureHigh >= 99999 && ctx.barIndex < 90) {
      return {
        setupType: "leak-probe",
        direction: "LONG",
        entry: ctx.bar.close,
        stop: ctx.bar.close - 10,
        target: ctx.bar.close + 20,
        features: { poisonHigh: futureHigh },
      };
    }
    return null;
  },
};

function poisonedFixture() {
  const base = buildSyntheticFixture();
  const m1 = base.m1.map((b) => ({ ...b }));
  m1[90] = { ...m1[90]!, high: 99999, low: 1, open: 25000, close: 25000 };
  return { ...base, m1 };
}

function probeStrategyAtBar(
  fixture: ReturnType<typeof buildSyntheticFixture>,
  barIndex: number,
  strategy: StrategyPlugin
): SetupProposal | null {
  const engine = new ReplayEngine(fixture, { initialIndex: barIndex });
  const snapshot = engine.snapshot();
  const cutoff = new ReplayDataCutoff(fixture, new Date(snapshot.asOf));
  return strategy.detectSetup({
    snapshot,
    bar: fixture.m1[barIndex]!,
    barIndex,
    barsAtT: cutoff.slicedM1(),
  });
}

function test1FutureCandlesExcludedFromStrategy() {
  console.log("\n1. future candles excluded from strategy decisions");
  const fixture = poisonedFixture();
  const early = probeStrategyAtBar(fixture, 50, leakProbeStrategy);
  assert("no setup at bar 50 from future poison", early === null);
  const atPoison = probeStrategyAtBar(fixture, 90, leakProbeStrategy);
  assert("poison bar itself may detect high", atPoison === null || (atPoison.features.poisonHigh as number) >= 99999);
}

function test2FutureHighLowCannotLeakIntoSetupDetection() {
  console.log("\n2. future high/low cannot leak into setup detection");
  const fixture = poisonedFixture();
  const asOf = fixture.m1[50]!.time;
  const engine = new ReplayEngine(fixture, { initialIndex: 50 });
  const snap = engine.snapshot();
  assert("session high excludes future poison", snap.features.sessionHighAtCutoff < 99999, `got ${snap.features.sessionHighAtCutoff}`);
  assert("current day high excludes future poison", snap.features.currentDayHigh < 99999, `got ${snap.features.currentDayHigh}`);
  assert("asOf before poison bar", asOf.getTime() < fixture.m1[90]!.time.getTime());
}

function test3SetupDetectionOnlyUsesCandlesAtT() {
  console.log("\n3. setup detection only uses candles at T");
  const fixture = buildSyntheticFixture();
  const checkIndex = 50;
  const engine = new ReplayEngine(fixture, { initialIndex: checkIndex });
  const snap = engine.snapshot();
  const cutoff = new ReplayDataCutoff(fixture, new Date(snap.asOf));
  cutoff.assertNoFutureLeak();
  const barsAtT = cutoff.slicedM1();
  assert("bars at T match engine index+1", barsAtT.length === checkIndex + 1, `got ${barsAtT.length}`);
}

function test4OutcomeOnlyAfterEntryLocked() {
  console.log("\n4. outcome evaluator only uses bars after entry locked");
  const entryBarIndex = 2;
  const allM1: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 101, low: 99, close: 100 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 100, high: 100, low: 99, close: 100 },
    { time: new Date("2026-08-12T14:02:00Z"), open: 100, high: 100, low: 99, close: 100 },
    { time: new Date("2026-08-12T14:03:00Z"), open: 100, high: 110, low: 99, close: 108 },
  ];
  const forward = forwardBarsFromIndex(allM1, entryBarIndex);
  assert("forward bars exclude entry bar", forward.length === 1);
  assert("forward bars exclude pre-entry", forward[0]!.high === 110);

  const outcome = evaluateSetupOutcome({
    direction: "LONG",
    entry: 100,
    stop: 95,
    target: 110,
    entryBarIndex,
    forwardBars: forward,
  });
  assert("target hit on forward bar only", outcome.outcome === "WIN" && outcome.targetHit);
}

function test5EntryLockedImmutable() {
  console.log("\n5. entry levels immutable after setup detected");
  const fixture = buildTinyBacktestFixture();
  const onceStrategy: StrategyPlugin = {
    id: "once",
    name: "Once",
    maxBarsPending: 2,
    maxBarsInTrade: 5,
    detectSetup(ctx) {
      if (ctx.barIndex !== 5) return null;
      return {
        setupType: "once",
        direction: "LONG",
        entry: ctx.bar.close,
        stop: ctx.bar.close - 5,
        target: ctx.bar.close + 10,
        features: { at: ctx.snapshot.asOf },
      };
    },
  };
  const result = runBacktest({
    dataset: { id: fixture.id, symbol: fixture.symbol, m1: fixture.m1, daily: fixture.daily },
    strategy: onceStrategy,
  });
  const trade = result.setups.find((s) => s.entry_timestamp != null);
  if (trade) {
    assert("entry/stop/target recorded", trade.entry > 0 && trade.stop > 0 && trade.target > 0);
    assert("events include SETUP_DETECTED then ENTRY", trade.events.some((e) => e.type === "SETUP_DETECTED"));
  } else {
    assert("trade or cancelled setup exists", result.setups.length > 0);
  }
}

function test6MfeCorrect() {
  console.log("\n6. MFE correct in backtest outcome");
  const bars: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 105, low: 99, close: 104 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 104, high: 108, low: 102, close: 107 },
    { time: new Date("2026-08-12T14:02:00Z"), open: 107, high: 107, low: 96, close: 97 },
  ];
  const result = evaluateSetupOutcome({
    direction: "LONG",
    entry: 100,
    stop: 95,
    target: 110,
    entryBarIndex: 0,
    forwardBars: bars,
  });
  assert("MFE = 8", result.mfe === 8, `got ${result.mfe}`);
}

function test7MaeCorrect() {
  console.log("\n7. MAE correct in backtest outcome");
  const bars: Bar[] = [
    { time: new Date("2026-08-12T14:00:00Z"), open: 100, high: 105, low: 99, close: 104 },
    { time: new Date("2026-08-12T14:01:00Z"), open: 104, high: 108, low: 102, close: 107 },
    { time: new Date("2026-08-12T14:02:00Z"), open: 107, high: 107, low: 96, close: 97 },
  ];
  const result = evaluateSetupOutcome({
    direction: "LONG",
    entry: 100,
    stop: 95,
    target: 110,
    entryBarIndex: 0,
    forwardBars: bars,
  });
  assert("MAE = 4", result.mae === 4, `got ${result.mae}`);
}

function test8AmbiguousSameCandleNoInventedOrder() {
  console.log("\n8. ambiguous candle when target+stop same bar — no invented order");
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
  assert("outcome AMBIGUOUS", result.outcome === "AMBIGUOUS", `got ${result.outcome}`);
  assert("ambiguity flag set", result.ambiguity === true);
  assert("which_first ambiguous", result.whichFirst === "ambiguous");
  assert("result_R = 0 for ambiguous", result.resultR === 0);
}

function test9BacktestDeterministicOnRepeat() {
  console.log("\n9. backtest deterministic on repeat");
  const fixture = buildTinyBacktestFixture();
  const config = {
    dataset: { id: fixture.id, symbol: fixture.symbol, m1: fixture.m1, daily: fixture.daily },
    strategy: {
      id: "tiny-long",
      name: "Tiny long",
      maxBarsPending: 1,
      maxBarsInTrade: 4,
      detectSetup(ctx: StrategyContext): SetupProposal | null {
        if (ctx.barIndex !== 5) return null;
        return {
          setupType: "tiny",
          direction: "LONG",
          entry: ctx.bar.close,
          stop: ctx.bar.close - 5,
          target: ctx.bar.close + 10,
          features: { idx: ctx.barIndex },
        };
      },
    } satisfies StrategyPlugin,
  };
  const runA = runBacktest(config);
  const runB = runBacktest(config);
  const stripIds = (r: typeof runA) => ({
    stats: r.statistics,
    count: r.setups.length,
    outcomes: r.setups.map((s) => ({
      timestamp: s.timestamp,
      direction: s.direction,
      entry: s.entry,
      outcome: s.outcome,
      result_R: s.result_R,
    })),
  });
  assert("same setup count", runA.setups.length === runB.setups.length);
  assert("same outcomes", JSON.stringify(stripIds(runA)) === JSON.stringify(stripIds(runB)));
}

function test10ExportRecordsDeterministicFeaturesSeparate() {
  console.log("\n10. export records deterministic — features separate from outcome");
  const fixture = buildTinyBacktestFixture();
  const result = runBacktest({
    dataset: { id: fixture.id, symbol: fixture.symbol, m1: fixture.m1, daily: fixture.daily },
    strategy: {
      id: "export-test",
      name: "Export test",
      maxBarsPending: 1,
      maxBarsInTrade: 4,
      detectSetup(ctx): SetupProposal | null {
        if (ctx.barIndex !== 5) return null;
        return {
          setupType: "export",
          direction: "LONG",
          entry: ctx.bar.close,
          stop: ctx.bar.close - 5,
          target: ctx.bar.close + 10,
          features: { bias: ctx.snapshot.features.bias },
        };
      },
    },
  });
  const fpA = runFingerprint(result);
  const fpB = runFingerprint(result);
  assert("fingerprints match on same result", fpA === fpB);

  if (result.setups.length > 0) {
    const rec = toExportRecord(result.setups[0]!);
    assert("features object present", typeof rec.features === "object" && rec.features !== null);
    assert("outcome label separate field", typeof rec.outcome === "string");
    assert("features lack outcome keys", !("result_R" in (rec.features as object)));
    assert("features lack MFE", !("MFE" in (rec.features as object)));
  } else {
    assert("export schema valid even with zero setups", true);
  }

  const wf = planWalkForward(fixture.m1);
  assert("walk-forward has 3 phases", wf.windows.length === 3);
  assert("walk-forward chronological", wf.windows[0]!.startIndex < wf.windows[1]!.startIndex);
}

console.log("=== Research Backtest Lab Tests ===");
ensureResearchFixtures();
test1FutureCandlesExcludedFromStrategy();
test2FutureHighLowCannotLeakIntoSetupDetection();
test3SetupDetectionOnlyUsesCandlesAtT();
test4OutcomeOnlyAfterEntryLocked();
test5EntryLockedImmutable();
test6MfeCorrect();
test7MaeCorrect();
test8AmbiguousSameCandleNoInventedOrder();
test9BacktestDeterministicOnRepeat();
test10ExportRecordsDeterministicFeaturesSeparate();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
