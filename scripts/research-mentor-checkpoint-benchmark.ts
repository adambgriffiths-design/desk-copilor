/**
 * Benchmark single-checkpoint mentor eval runtime on NQ Aug 12.
 * Run: npx tsx scripts/research-mentor-checkpoint-benchmark.ts
 */
import { evaluateMentorResponse } from "../lib/research/mentor/evaluation";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { buildKarenReplayResponse } from "../lib/research/replay/karen";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";

const CUTOFF = "2026-08-12T14:30:00.000Z";
const WARMUP = 3;
const RUNS = 10;

function benchOne(): number {
  const fixture = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const asOf = new Date(CUTOFF);
  const t0 = performance.now();
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  cutoff.assertNoFutureLeak();
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();
  const { karen, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);
  evaluateMentorResponse({
    asOf: CUTOFF,
    karen,
    observation: pipeline.observation,
    interpretation: pipeline.interpretation,
    decision: pipeline.decision,
    availableBarTimes: m1.map((b) => b.time.toISOString()),
  });
  return performance.now() - t0;
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  return { min: sorted[0]!, max: sorted.at(-1)!, avg: sum / sorted.length, p50, p95 };
}

function main() {
  ensureResearchFixtures();
  for (let i = 0; i < WARMUP; i++) benchOne();

  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) samples.push(benchOne());

  const s = stats(samples);
  console.log(JSON.stringify({ cutoff: CUTOFF, runs: RUNS, warmup: WARMUP, ms: s }, null, 2));
}

main();
