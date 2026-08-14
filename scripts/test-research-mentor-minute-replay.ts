/**
 * Minute replay Layer 1 tests — synthetic fixture + poison test.
 * Run: npm run test:research-mentor-minute-replay
 */
import {
  runMinuteReplay,
  runMinuteReplayPoisonTest,
} from "../lib/research/mentor/minute-replay";
import { buildSyntheticFixture } from "../lib/research/replay/fixtures";

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

function testSyntheticMinuteReplay() {
  console.log("\n1. synthetic fixture minute replay (15 bars)");
  const fixture = buildSyntheticFixture();
  const report = runMinuteReplay({
    datasetId: fixture.id,
    data: fixture,
    minWarmupBars: 10,
    startTime: fixture.m1[10]!.time,
    endTime: fixture.m1[24]!.time,
  });

  assert("evaluations > 0", report.evaluationCount > 0, String(report.evaluationCount));
  assert("msPerEvaluation finite", Number.isFinite(report.msPerEvaluation));
  assert("poison test pass", report.poisonTest.pass, report.poisonTest.detail);
  assert(
    "transitions or windows logged",
    report.transitions.length > 0 ||
      report.verdictTransitions.length > 0 ||
      report.entryActiveWindows.length > 0 ||
      report.setupEligibleWindows.length > 0,
    `transitions=${report.transitions.length}`
  );
}

function testPoisonStandalone() {
  console.log("\n2. poison test standalone (short range)");
  const fixture = buildSyntheticFixture();
  const result = runMinuteReplayPoisonTest(fixture, { startIndex: 20, endIndex: 28 });
  assert("pass", result.pass, result.detail);
}

function testVerdictTransitionsTracked() {
  console.log("\n3. verdict transitions have from/to");
  const fixture = buildSyntheticFixture();
  const report = runMinuteReplay({
    datasetId: fixture.id,
    data: fixture,
    minWarmupBars: 5,
    startTime: fixture.m1[5]!.time,
    endTime: fixture.m1[20]!.time,
  });
  for (const t of report.verdictTransitions) {
    assert(`transition at ${t.asOf} has field verdict`, t.field === "verdict");
    if (t.from === t.to) {
      failed++;
      console.error(`  ✗ spurious transition ${t.from} → ${t.to}`);
    }
  }
  if (report.verdictTransitions.length === 0) {
    console.log("  (no verdict transitions on synthetic — ok)");
  }
}

function main() {
  testSyntheticMinuteReplay();
  testPoisonStandalone();
  testVerdictTransitionsTracked();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
