/**
 * Checkpoint selection tests — Mode A vs Mode B.
 * Run: npx tsx scripts/test-research-mentor-checkpoint-selection.ts
 */
import {
  buildStratifiedCheckpointPlan,
  compareCheckpointModes,
  detectConflictingSetupAt,
  selectFrameworkCheckpoints,
  selectResponsivenessCheckpoints,
  summarizeCheckpointPlan,
} from "../lib/research/mentor/checkpoint-selection";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";

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

function testModeAAug12() {
  console.log("\n1. Mode A — Aug 12 session anchors");
  ensureResearchFixtures();
  const fixture = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const plan = selectFrameworkCheckpoints(fixture.m1);
  assert("at least 12 checkpoints", plan.length >= 12, String(plan.length));
  assert("no duplicate bar indices", new Set(plan.map((c) => c.barIndex)).size === plan.length);
  assert("framework alias matches stratified", plan.length === buildStratifiedCheckpointPlan(fixture.m1).length);
}

function testModeBMoreThanModeA() {
  console.log("\n2. Mode B denser than Mode A on week dataset");
  ensureResearchFixtures();
  const fixture = loadResearchDatasetFixture("nq-week-aug05-aug12-2026-cme");
  const modeA = selectFrameworkCheckpoints(fixture.m1);
  const modeB = selectResponsivenessCheckpoints(fixture.m1);
  assert("Mode B > Mode A", modeB.length > modeA.length, `${modeB.length} vs ${modeA.length}`);
  assert("Mode B has RTH temporal stratum", modeB.some((c) => c.stratum.startsWith("rth_temporal")));
  assert("Mode B has session transitions", modeB.some((c) => c.stratum.startsWith("session_transition")));
  assert("chronological order", modeB.every((c, i) => i === 0 || c.barIndex >= modeB[i - 1]!.barIndex));
}

function testNoFutureLeakIndices() {
  console.log("\n3. All checkpoints use valid bar indices (sampled)");
  const fixture = loadResearchDatasetFixture("nq-week-aug05-aug12-2026-cme");
  const modeB = selectResponsivenessCheckpoints(fixture.m1);
  const sample = [0, Math.floor(modeB.length / 2), modeB.length - 1].map((i) => modeB[i]!);
  for (const c of sample) {
    const bar = fixture.m1[c.barIndex];
    assert(`bar exists @ ${c.asOf}`, bar != null && bar.time.toISOString() === c.asOf);
  }
  assert("sample size <= total", sample.length <= modeB.length);
}

function testScalingBenchmark() {
  console.log("\n4. Scaling benchmark structure");
  const fixture = loadResearchDatasetFixture("nq-week-aug05-aug12-2026-cme");
  const cmp = compareCheckpointModes(fixture.m1);
  assert("modeA total > 0", cmp.modeA.total > 0);
  assert("modeB total > modeA", cmp.modeB.total > cmp.modeA.total);
  assert("oneWeek estimate present", cmp.scaling.estimates.oneWeek.estMinutes > 0);
}

function testConflictingDetection() {
  console.log("\n5. Conflicting setup detector returns boolean");
  const fixture = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const mid = Math.floor(fixture.m1.length / 2);
  const result = detectConflictingSetupAt(fixture.m1, mid);
  assert("boolean result", typeof result === "boolean");
}

function testSummarizeStrata() {
  console.log("\n6. Summary includes byStratum");
  const fixture = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const plan = selectResponsivenessCheckpoints(fixture.m1);
  const summary = summarizeCheckpointPlan(plan);
  assert("byStratum populated", Object.keys(summary.byStratum).length > 0);
}

console.log("=== Research Mentor Checkpoint Selection Tests ===");
testModeAAug12();
testModeBMoreThanModeA();
testNoFutureLeakIndices();
testScalingBenchmark();
testConflictingDetection();
testSummarizeStrata();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
