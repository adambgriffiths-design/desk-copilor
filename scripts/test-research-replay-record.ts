/**
 * Point-in-time research record — determinism + load-back tests.
 * Run: npx tsx scripts/test-research-replay-record.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  assertNoFutureBarsInRecord,
  buildPointInTimeRecord,
  loadPointInTimeRecord,
  pointInTimeRecordFingerprint,
  savePointInTimeRecord,
  validatePointInTimeRecord,
} from "../lib/research/replay/records";
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

function testDeterministic() {
  console.log("\n1. point-in-time record deterministic");
  const fixture = buildSyntheticFixture();
  const timestamp = fixture.m1[50]!.time.toISOString();
  const recordA = buildPointInTimeRecord(fixture, timestamp);
  const recordB = buildPointInTimeRecord(fixture, timestamp);
  assert(
    "fingerprints match",
    pointInTimeRecordFingerprint(recordA) === pointInTimeRecordFingerprint(recordB)
  );
  assert("serialized JSON match", JSON.stringify(recordA) === JSON.stringify(recordB));
}

function testFutureBarsExcluded() {
  console.log("\n2. future candles excluded from record");
  const fixture = buildSyntheticFixture();
  const timestamp = fixture.m1[50]!.time.toISOString();
  const record = buildPointInTimeRecord(fixture, timestamp);
  const t = new Date(timestamp).getTime();
  const futureBars = record.m1.filter((b) => new Date(b.time).getTime() > t);
  assert("no future m1 bars", futureBars.length === 0, `found ${futureBars.length}`);
  assert("bar count matches cutoff", record.m1.length === record.barCountAtCutoff);
  assert("range end equals timestamp", record.availableCandleRange.end === timestamp);
  let threw = false;
  try {
    assertNoFutureBarsInRecord(record);
  } catch {
    threw = true;
  }
  assert("assertNoFutureBarsInRecord passes", !threw);
}

function testLoadBack() {
  console.log("\n3. record loadable and schema-valid");
  const fixture = buildSyntheticFixture();
  const timestamp = fixture.m1[50]!.time.toISOString();
  const record = buildPointInTimeRecord(fixture, timestamp);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-record-"));
  const { filepath } = savePointInTimeRecord(record, "test-synthetic");
  const loadedPath = path.join(tmpDir, path.basename(filepath));
  fs.copyFileSync(filepath, loadedPath);
  const loaded = loadPointInTimeRecord(loadedPath);
  assert("validatePointInTimeRecord", validatePointInTimeRecord(loaded));
  assert("round-trip fingerprint", pointInTimeRecordFingerprint(loaded) === pointInTimeRecordFingerprint(record));
  assert("required fields present", loaded.karen.pipelineVerdict.length > 0 && loaded.dataQuality.status.length > 0);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("=== Point-in-Time Research Record Tests ===");
testDeterministic();
testFutureBarsExcluded();
testLoadBack();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
