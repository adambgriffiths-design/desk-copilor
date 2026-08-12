import { runReplayReport, writeReplayReport, runReplayAtScale } from "../lib/replay-engine";
import { listSetupFixtures, loadSetupFixture, validateLabeledSetup } from "../lib/labeling";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const files = listSetupFixtures();
assert(files.length >= 5, `expected 5+ labeled fixtures, got ${files.length}`);

const categories = { winner: 0, no_trade: 0, similar_skip: 0, wait: 0 };
for (const f of files) {
  const fixture = loadSetupFixture(f);
  const errors = validateLabeledSetup(fixture.label);
  assert(errors.length === 0, `${f}: ${errors.join("; ")}`);
  assert(
    Boolean(fixture.label.expected_observation || fixture.label.observation),
    `${f}: expected_observation required`
  );
  if (fixture.label.grade === "A+" && fixture.label.would_take) categories.winner++;
  if (fixture.label.adam_verdict === "NO_TRADE") categories.no_trade++;
  if (fixture.label.similar_but_skip) categories.similar_skip++;
  if (fixture.label.adam_verdict === "WAIT") categories.wait++;
}

assert(categories.winner >= 1, "need at least 1 A+ winner fixture");
assert(categories.no_trade >= 2, "need at least 2 no_trade fixtures");
assert(categories.similar_skip >= 1, "need at least 1 similar_but_skip fixture");

const report = runReplayReport();
assert(report.total >= 5, "replayed 5+ setups");
assert(report.observation.overall_pct >= 0, "observation report present");
assert(report.interpretation.overall_pct >= 0, "interpretation report present");
assert(report.decision.overall_pct >= 0, "decision report present");
assert(report.diagnosis.length > 0, "diagnosis present");

const scaleArg = process.argv.indexOf("--scale");
const scaleN = scaleArg >= 0 ? parseInt(process.argv[scaleArg + 1] || "50", 10) : 0;
if (scaleN > 0) {
  const scale = runReplayAtScale(scaleN);
  console.log(`Scale replay (${scaleN} iterations):`);
  console.log(`  Observation avg ${scale.observation_pct.avg}% (min ${scale.observation_pct.min}, max ${scale.observation_pct.max})`);
  console.log(`  Interpretation avg ${scale.interpretation_pct.avg}%`);
  console.log(`  Decision avg ${scale.decision_pct.avg}%`);
  console.log(`  Deterministic: ${scale.deterministic} (${scale.elapsed_ms}ms, ${scale.total_runs} runs)`);
  assert(scale.deterministic, "pipeline must be deterministic across scale replays");
}

const reportPath = writeReplayReport();
console.log(`Replay report: ${reportPath}`);
console.log(`1. Observation Accuracy: ${report.observation.overall_pct}%`);
console.log(`2. Interpretation Agreement: ${report.interpretation.overall_pct}%`);
console.log(`3. Decision Agreement: ${report.decision.overall_pct}%`);
console.log(`Diagnosis: ${report.diagnosis}`);
console.log("test-replay-decisions: ok");
