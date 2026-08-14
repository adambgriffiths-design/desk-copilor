/**
 * Internal Research Dataset Layer — 12 required tests.
 * Run: npm run test:research-dataset
 */
import {
  assertSnapshotNoFutureLeak,
  buildObservationAtT,
  buildOutcomeLabel,
  buildResearchDataset,
  computeDataVersion,
  datasetFingerprint,
  getSnapshot,
  isFeatureOutcomeSeparated,
  resolveGitRevision,
  syntheticDuplicateCandles,
  syntheticInvalidOhlcCandles,
  syntheticMissingMinuteCandles,
  syntheticOutOfOrderCandles,
  syntheticPartialSessionCandles,
  syntheticPoisonFutureCandles,
  syntheticRequestedWindow,
  syntheticSessionBoundaryCandles,
  syntheticValidCandles,
  validateCandles,
  writeObservationRecord,
  writeOutcomeRecord,
} from "../lib/research/dataset";

let passed = 0;
let failed = 0;

const FIXED_CREATED_AT = "2026-08-13T00:00:00.000Z";
const SOURCE = "synthetic";
const SOURCE_VERSION = "test-fixture-v1";

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function buildTestDataset(candles: ReturnType<typeof syntheticValidCandles>, window?: { start: number; end: number }) {
  return buildResearchDataset({
    symbol: "NQ",
    candles,
    source: SOURCE,
    source_version: SOURCE_VERSION,
    requestedStart: window?.start,
    requestedEnd: window?.end,
    created_at: FIXED_CREATED_AT,
  });
}

function test1SnapshotExcludesFutureCandles() {
  console.log("\n1. snapshot excludes future candles");
  const candles = syntheticPoisonFutureCandles();
  const dataset = buildTestDataset(candles);
  const asOf = candles[2]!.timestamp;
  const snap = getSnapshot(dataset, asOf);

  assert("snapshot candle count <= full dataset", snap.candleCount === 3);
  assert("no candle after asOf", snap.candles.every((c) => c.timestamp <= asOf));
  assert("future poison high excluded", snap.maxHigh != null && snap.maxHigh < 99999, `maxHigh=${snap.maxHigh}`);
  assertSnapshotNoFutureLeak(snap);
  assert("assertNoFutureLeak passes", true);
}

function test2DuplicateDetection() {
  console.log("\n2. duplicate detection");
  const report = validateCandles(syntheticDuplicateCandles());
  assert("status INVALID", report.status === "INVALID");
  assert("duplicate count >= 1", report.duplicateCount >= 1);
  assert("has DUPLICATE_TIMESTAMP issue", report.issues.some((i) => i.code === "DUPLICATE_TIMESTAMP"));
}

function test3MissingMinuteDetection() {
  console.log("\n3. missing-minute detection");
  const report = validateCandles(syntheticMissingMinuteCandles());
  assert("status WARNING", report.status === "WARNING");
  assert("missing minute count >= 1", report.missingMinuteCount >= 1);
  assert("has MISSING_MINUTES issue", report.issues.some((i) => i.code === "MISSING_MINUTES"));
}

function test4InvalidOhlcDetection() {
  console.log("\n4. invalid OHLC detection");
  const report = validateCandles(syntheticInvalidOhlcCandles());
  assert("status INVALID", report.status === "INVALID");
  assert("invalid OHLC count >= 1", report.invalidOhlcCount >= 1);
  assert(
    "has HIGH_BELOW_LOW or OPEN/CLOSE outside",
    report.issues.some((i) =>
      ["HIGH_BELOW_LOW", "OPEN_OUTSIDE_RANGE", "CLOSE_OUTSIDE_RANGE", "INVALID_OHLC"].includes(i.code)
    )
  );
}

function test5ChronologicalOrdering() {
  console.log("\n5. chronological ordering");
  const report = validateCandles(syntheticOutOfOrderCandles());
  assert("status INVALID", report.status === "INVALID");
  assert("has OUT_OF_ORDER issue", report.issues.some((i) => i.code === "OUT_OF_ORDER"));
}

function test6DeterministicDatasetGeneration() {
  console.log("\n6. deterministic dataset generation");
  const candles = syntheticValidCandles();
  const a = buildTestDataset(candles, syntheticRequestedWindow());
  const b = buildTestDataset(candles, syntheticRequestedWindow());
  assert("same dataset_id", a.metadata.dataset_id === b.metadata.dataset_id);
  assert("same data_version", a.metadata.data_version === b.metadata.data_version);
  assert("same fingerprint", datasetFingerprint(a) === datasetFingerprint(b));
}

function test7MetadataVersioning() {
  console.log("\n7. metadata/versioning");
  const dataset = buildTestDataset(syntheticValidCandles(), syntheticRequestedWindow());
  const m = dataset.metadata;
  assert("dataset_id present", typeof m.dataset_id === "string" && m.dataset_id.length > 0);
  assert("symbol NQ", m.symbol === "NQ");
  assert("source_symbol NQ", m.source_symbol === "NQ");
  assert("target_instrument MNQ-equivalent", m.target_instrument === "MNQ-equivalent");
  assert("source set", m.source === SOURCE);
  assert("timeframe 1m", m.timeframe === "1m");
  assert("timezone America/New_York", m.timezone === "America/New_York");
  assert("session_definition CME", m.session_definition === "CME_GLOBEX_18:00_ET");
  assert("code_version present", typeof m.code_version === "string");
  assert("data_version present", typeof m.data_version === "string");
  assert("versions.loader_version present", typeof m.versions.loader_version === "string");
  assert("git revision resolved", typeof resolveGitRevision() === "string");
  assert(
    "data_version matches computeDataVersion",
    m.data_version === computeDataVersion(m.symbol, dataset.candles, m.versions)
  );
}

function test8FeatureOutcomeSeparation() {
  console.log("\n8. feature/outcome separation");
  const dataset = buildTestDataset(syntheticValidCandles());
  const ts = dataset.candles[2]!.timestamp;
  const observation = buildObservationAtT(dataset, ts, { sessionHigh: 21010, bias: "bullish" });
  const outcome = buildOutcomeLabel(dataset, ts, { result: "WIN", mfe: 8 });

  assert("observation kind OBSERVATION", observation.kind === "OBSERVATION");
  assert("outcome kind OUTCOME", outcome.kind === "OUTCOME");
  assert("separation guard true", isFeatureOutcomeSeparated(observation, outcome));
  assert("features lack outcome keys", !("result" in observation.features));
  assert("labels lack feature keys", !("sessionHigh" in outcome.labels));
  assert("observation has no labels field", !("labels" in (observation as object)));
  assert("outcome has no features field", !("features" in (outcome as object)));

  const obsPath = writeObservationRecord(dataset.metadata.dataset_id, observation);
  const outPath = writeOutcomeRecord(dataset.metadata.dataset_id, outcome);
  assert("observation stored separately", obsPath.includes("observations"));
  assert("outcome stored separately", outPath.includes("outcomes"));
}

function test9PartialSessionHandling() {
  console.log("\n9. partial session handling");
  const window = syntheticRequestedWindow();
  const dataset = buildTestDataset(syntheticPartialSessionCandles(), window);
  const report = dataset.validation;
  assert("status WARNING", report.status === "WARNING");
  assert("PARTIAL_FIRST flagged", report.issues.some((i) => i.code === "PARTIAL_FIRST"));
  assert("PARTIAL_LAST flagged", report.issues.some((i) => i.code === "PARTIAL_LAST"));
}

function test10SessionBoundaryMetadata() {
  console.log("\n10. session-boundary metadata");
  const report = validateCandles(syntheticSessionBoundaryCandles());
  assert("status WARNING", report.status === "WARNING");
  assert(
    "SESSION_BOUNDARY_GAP flagged",
    report.issues.some((i) => i.code === "SESSION_BOUNDARY_GAP")
  );
  const dataset = buildTestDataset(syntheticSessionBoundaryCandles());
  assert("session_definition on metadata", dataset.metadata.session_definition === "CME_GLOBEX_18:00_ET");
}

function test11RepeatedGenerationIdentical() {
  console.log("\n11. repeated generation identical");
  const candles = syntheticValidCandles();
  const window = syntheticRequestedWindow();
  const runs = Array.from({ length: 3 }, () => buildTestDataset(candles, window));
  const fp = datasetFingerprint(runs[0]!);
  assert(
    "all fingerprints match",
    runs.every((r) => datasetFingerprint(r) === fp)
  );
  assert(
    "all data_version match",
    runs.every((r) => r.metadata.data_version === runs[0]!.metadata.data_version)
  );
}

function test12CorruptedInputNotSilentlyValid() {
  console.log("\n12. corrupted input cannot silently become valid");
  const corrupted = syntheticInvalidOhlcCandles();
  const dataset = buildTestDataset(corrupted);
  assert("validation status INVALID", dataset.validation.status === "INVALID");
  assert("candles unchanged (high still below low on bad bar)", dataset.candles[2]!.high < dataset.candles[2]!.low);
  assert("integrity not VALID", dataset.validation.status !== "VALID");
}

console.log("=== Internal Research Dataset Tests ===");
test1SnapshotExcludesFutureCandles();
test2DuplicateDetection();
test3MissingMinuteDetection();
test4InvalidOhlcDetection();
test5ChronologicalOrdering();
test6DeterministicDatasetGeneration();
test7MetadataVersioning();
test8FeatureOutcomeSeparation();
test9PartialSessionHandling();
test10SessionBoundaryMetadata();
test11RepeatedGenerationIdentical();
test12CorruptedInputNotSilentlyValid();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
