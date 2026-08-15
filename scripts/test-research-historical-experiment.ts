/**
 * Deterministic tests for first historical experiment harness.
 * Run: npm run test:research-historical-experiment
 */
import fs from "fs";
import path from "path";
import { PLAYBOOK_CHAIN_CONCEPTS } from "../lib/decision-envelope";
import {
  discoverAvailableDatasets,
  formatHistoricalExperimentReport,
  FROZEN_ARCHITECTURE,
  runHistoricalExperiment,
  runLeakageTest,
  runReproducibilityCheck,
  selectBestAvailableDataset,
} from "../lib/research/architecture/historical-experiment";
import { assertNoSelectOnEval } from "../lib/research/architecture/splits";
import { buildSyntheticFixture } from "../lib/research/replay/fixtures";
import { selectFrameworkCheckpoints } from "../lib/research/mentor/checkpoint-selection";
import { planTemporalSplits, assignSplit } from "../lib/research/architecture/splits";

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

function testDatasetDiscovery() {
  console.log("\n1. dataset discovery + gap labeling");
  const datasets = discoverAvailableDatasets();
  assert("at least one fixture on disk", datasets.length >= 1);
  const best = selectBestAvailableDataset();
  assert("best dataset is NQ week or day", best != null && best.barCount > 100);
  if (best) {
    assert("week fixture labeled below month", !best.meetsMonthTarget || best.calendarSpanDays >= 28);
    assert("gap label present when short", best.gapLabel.includes("GAP") || best.meetsMonthTarget);
  }
}

function testCheckpointNotPerBar() {
  console.log("\n2. checkpoints not per-bar");
  const synth = buildSyntheticFixture();
  const cps = selectFrameworkCheckpoints(synth.m1);
  assert("checkpoints << bar count", cps.length < synth.m1.length / 5, `${cps.length} vs ${synth.m1.length}`);
  assert("checkpoints > 0 on synthetic", cps.length >= 1);
}

function testTemporalSplits() {
  console.log("\n3. TRAIN / VAL / OOS assignment");
  const synth = buildSyntheticFixture();
  const splits = planTemporalSplits(synth.m1);
  const phases = splits.map((s) => s.phase);
  assert("has TRAIN", phases.includes("TRAIN"));
  assert("has VALIDATION", phases.includes("VALIDATION"));
  assert("has OOS", phases.includes("OOS"));
  const mid = synth.m1[Math.floor(synth.m1.length * 0.7)]!.time.toISOString();
  const phase = assignSplit(synth.m1, mid, splits);
  assert("assignSplit returns a phase", phase === "TRAIN" || phase === "VALIDATION" || phase === "OOS");
}

function testDryRunExperiment() {
  console.log("\n4. dry-run experiment (no pipeline)");
  const result = runHistoricalExperiment({ dryRun: true, maxCheckpoints: 5 });
  assert("dry-run zero decisions", result.decisions === 0);
  assert("dry-run has checkpoint plan", result.checkpoints > 0);
  assert("v1 only frozen arch", result.architectureVersion === FROZEN_ARCHITECTURE);
  assert("no winner selected", result.selectedArchitectureFrom === null);
  assert("forbid select-on-eval", assertNoSelectOnEval({ selectedArchitectureFrom: null }).length === 0);
  const report = formatHistoricalExperimentReport(result);
  assert("report has FINAL REPORT fields", /BIGGEST DATA GAP/.test(report) && /NEXT HIGHEST-VALUE/.test(report));
  assert("manifest on disk", fs.existsSync(path.join(result.runDir, "manifest.json")));
}

function testLimitedExecution() {
  console.log("\n5. limited execution (2 checkpoints — infrastructure smoke)");
  const result = runHistoricalExperiment({ maxCheckpoints: 2, runIntegrityChecks: true });
  assert("executed decisions", result.decisions === 2);
  assert("outcomes separate count", result.outcomeCoverage.total === 2);
  assert("outcomes labeled after T", result.outcomeCoverage.rate === 1);
  assert("all v1 architecture", result.architectureVersion === "architecture-v1");
  assert(
    "decisions file exists",
    fs.existsSync(path.join(result.runDir, "decisions.jsonl"))
  );
  assert(
    "outcomes file exists",
    fs.existsSync(path.join(result.runDir, "outcomes.jsonl"))
  );

  const decisions = fs
    .readFileSync(path.join(result.runDir, "decisions.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { concepts: Array<{ concept: string }>; fingerprint: string });
  assert("trace has concepts", decisions[0]!.concepts.length >= PLAYBOOK_CHAIN_CONCEPTS.length - 2);
  assert("fingerprint hex", /^[a-f0-9]{64}$/.test(decisions[0]!.fingerprint));

  assert("leakage test passed", result.leakageTestPassed);
  assert("reproducibility passed", result.reproducibilityPassed);
}

function testPitOnSynthetic() {
  console.log("\n6. PIT poison + reproducibility on synthetic");
  const synth = buildSyntheticFixture();
  const asOf = synth.m1[50]!.time;
  const leak = runLeakageTest(synth, asOf);
  assert("synthetic leakage 6/6", leak.passed, `${leak.poisonsPassed}/${leak.poisonsTotal}`);
  const repro = runReproducibilityCheck(synth, asOf, "synthetic-ny-am");
  assert("synthetic repro", repro.passed);
}

console.log("=== Research historical experiment harness ===");
testDatasetDiscovery();
testCheckpointNotPerBar();
testTemporalSplits();
testDryRunExperiment();
testLimitedExecution();
testPitOnSynthetic();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
