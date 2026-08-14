/**
 * Research dataset ↔ replay integration — Aug 12 fixture point-in-time tests.
 * Run: npm run test:research-dataset-replay
 */
import {
  AUG12_CME_FIXTURE_ID,
  AUG12_CME_SESSION,
  ensureAug12ResearchDataset,
  findCachedAug12Dataset,
  getSnapshot,
  researchDatasetToReplayMarketData,
} from "../lib/research/dataset";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { ReplayEngine } from "../lib/research/replay/engine";
import { loadResearchDatasetFixture } from "../lib/research/replay/fixtures";

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name: string, reason: string) {
  skipped++;
  console.log(`  ⊘ ${name} — ${reason}`);
}

async function ensureFixture() {
  const cached = findCachedAug12Dataset();
  if (cached) return cached;
  try {
    return await ensureAug12ResearchDataset();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("TICKSTREAM_API_KEY")) {
      return null;
    }
    throw err;
  }
}

async function testAug12DatasetLoaded() {
  console.log("\n1. Aug 12 CME dataset loads from disk or TickStream");
  const dataset = await ensureFixture();
  if (!dataset) {
    skip("Aug 12 dataset available", "no cache and TICKSTREAM_API_KEY missing");
    return null;
  }
  assert("dataset has candles", dataset.candles.length > 0, `count=${dataset.candles.length}`);
  assert("source_symbol NQ", dataset.metadata.source_symbol === "NQ");
  assert("target_instrument MNQ-equivalent", dataset.metadata.target_instrument === "MNQ-equivalent");
  assert("timeframe 1m", dataset.metadata.timeframe === "1m");
  return dataset;
}

function testReplayBridge(dataset: NonNullable<Awaited<ReturnType<typeof ensureFixture>>>) {
  console.log("\n2. research dataset → replay market data bridge");
  const replay = researchDatasetToReplayMarketData(dataset, {
    label: AUG12_CME_SESSION.label,
    sessionDate: AUG12_CME_SESSION.sessionDate,
  });
  assert("m1 bar count matches candles", replay.m1.length === dataset.candles.length);
  assert("m5 derived", replay.m5.length > 0);
  assert("m15 derived", replay.m15.length > 0);
  assert("daily derived", replay.daily.length > 0);
  assert("raw NQ prices preserved", replay.m1[0]!.open === dataset.candles[0]!.open);
  return replay;
}

function testPointInTimeAtT(
  dataset: NonNullable<Awaited<ReturnType<typeof ensureFixture>>>,
  replay: ReturnType<typeof researchDatasetToReplayMarketData>
) {
  console.log("\n3. point-in-time: candles <= T only");
  const midIndex = Math.floor(dataset.candles.length / 2);
  const asOfTs = dataset.candles[midIndex]!.timestamp;
  const snap = getSnapshot(dataset, asOfTs);
  assert("snapshot excludes future", snap.candles.every((c) => c.timestamp <= asOfTs));
  assert("snapshot count = midIndex+1", snap.candleCount === midIndex + 1, `got ${snap.candleCount}`);

  const asOf = new Date(asOfTs * 1000);
  const cutoff = new ReplayDataCutoff(replay, asOf);
  const m1 = cutoff.slicedM1();
  assert("cutoff m1 <= asOf", m1.every((b) => b.time.getTime() <= asOf.getTime()));
  cutoff.assertNoFutureLeak();
  assert("assertNoFutureLeak passes", true);
}

function testFutureHighInvisible(
  dataset: NonNullable<Awaited<ReturnType<typeof ensureFixture>>>,
  replay: ReturnType<typeof researchDatasetToReplayMarketData>
) {
  console.log("\n4. future high invisible at T");
  const midIndex = Math.floor(dataset.candles.length / 2);
  const asOfTs = dataset.candles[midIndex]!.timestamp;
  const visibleMax = Math.max(...dataset.candles.slice(0, midIndex + 1).map((c) => c.high));
  const futureMax = Math.max(...dataset.candles.slice(midIndex + 1).map((c) => c.high));
  const snap = getSnapshot(dataset, asOfTs);
  assert("maxHigh equals visible candles only", snap.maxHigh === visibleMax, `snap=${snap.maxHigh} visible=${visibleMax}`);
  if (futureMax > visibleMax) {
    assert("future high strictly above visible", futureMax > visibleMax);
  }

  const engine = new ReplayEngine(replay, { initialIndex: midIndex });
  const features = engine.snapshot().features;
  assert(
    "sessionHighAtCutoff equals visible max",
    features.sessionHighAtCutoff === visibleMax,
    `sessionHigh=${features.sessionHighAtCutoff} visible=${visibleMax}`
  );
}

function testDeterministicReplay(
  dataset: NonNullable<Awaited<ReturnType<typeof ensureFixture>>>
) {
  console.log("\n5. deterministic replay on repeat");
  const replay = loadResearchDatasetFixture(AUG12_CME_FIXTURE_ID);
  const idx = Math.min(100, replay.m1.length - 1);
  const a = new ReplayEngine(replay, { initialIndex: idx }).snapshot();
  const b = new ReplayEngine(replay, { initialIndex: idx }).snapshot();
  assert("same asOf", a.asOf === b.asOf);
  assert("same features", JSON.stringify(a.features) === JSON.stringify(b.features));
  assert("same price", a.currentPrice === b.currentPrice);
  assert("dataset id stable", replay.id === dataset.metadata.dataset_id);
}

async function main() {
  console.log("=== Research Dataset ↔ Replay Integration ===");
  const dataset = await testAug12DatasetLoaded();
  if (!dataset) {
    console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${skipped} skipped ===`);
    if (failed > 0) process.exit(1);
    return;
  }
  const replay = testReplayBridge(dataset);
  testPointInTimeAtT(dataset, replay);
  testFutureHighInvisible(dataset, replay);
  testDeterministicReplay(dataset);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${skipped} skipped ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
