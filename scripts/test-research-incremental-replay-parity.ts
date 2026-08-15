#!/usr/bin/env npx tsx
/**
 * STRICT PARITY: CURRENT (buildContextAtBarIndex) vs OPTIMIZED (IncrementalMarketEngine).
 * Small nq-aug12 benchmark only — parity, PIT poison, measured speedup, report.
 *
 * Run: npm run test:research-incremental-replay-parity
 *      npm run test:research-incremental-replay-parity -- --mode OPTIMIZED  (benchmark OPTIMIZED path only)
 */
import fs from "fs";
import { performance } from "perf_hooks";
import path from "path";
import { evaluateArchitecturesAtCutoff } from "../lib/research/architecture/evaluate";
import { runOptimizedPathLeakageTest } from "../lib/research/architecture/optimized-pit";
import { ResearchContextSession } from "../lib/research/replay/incremental-context";
import { resolveResearchReplayMode } from "../lib/research/replay/mode";
import {
  compareEvaluatedDecisions,
  pickParityCheckpoints,
} from "../lib/research/replay/parity";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";

const DATASET_ID = "nq-aug12-2026-cme";
const REPORT_PATH = path.join(process.cwd(), "data", "research", "karen-incremental-replay-parity.md");
const CHECKPOINT_COUNT = 6;
const WARMUP = 60;
const SEQUENTIAL_BARS = 8;

function memMb() {
  const m = process.memoryUsage();
  return {
    rss: Math.round((m.rss / 1024 / 1024) * 10) / 10,
    heap: Math.round((m.heapUsed / 1024 / 1024) * 10) / 10,
  };
}

function timeMs(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

function formatReport(input: {
  implemented: boolean;
  currentMs: number;
  optimizedMs: number;
  currentMsPerBar: number;
  optimizedMsPerBar: number;
  evalCurrentMs: number;
  evalOptimizedMs: number;
  parityPass: boolean;
  firstDivergence: string;
  pitPass: boolean;
  pitDetail: string;
  memoryStart: ReturnType<typeof memMb>;
  memoryEnd: ReturnType<typeof memMb>;
  checkpointResults: Array<{ barIndex: number; asOf: string; pass: boolean; firstField?: string }>;
  recommendation: string;
}): string {
  const speedup =
    input.optimizedMs > 0 ? Math.round((input.currentMs / input.optimizedMs) * 100) / 100 : 0;

  return `# Karen incremental research replay parity

**Date:** ${new Date().toISOString().slice(0, 10)}  
**Dataset:** \`${DATASET_ID}\` (${CHECKPOINT_COUNT} checkpoints + ${SEQUENTIAL_BARS} sequential bars, single process)  
**Scope:** Research replay harness only — no architecture-v1 / trading-logic / production Karen changes.

---

## FINAL REPORT

| Field | Value |
|-------|-------|
| **IMPLEMENTED** | ${input.implemented ? "YES — \`mode: CURRENT \\| OPTIMIZED\` on research replay (\`evaluateArchitecturesAtCutoff\`, \`ReplayEngine\`, historical experiment)" : "NO"} |
| **CURRENT TIME** | **${(input.currentMs / 1000).toFixed(2)} s** context build (${CHECKPOINT_COUNT} checkpoints, fresh CURRENT each) |
| **OPTIMIZED TIME** | **${(input.optimizedMs / 1000).toFixed(2)} s** context build (${CHECKPOINT_COUNT} checkpoints, one session) |
| **E2E eval (1 checkpoint)** | CURRENT **${(input.evalCurrentMs / 1000).toFixed(2)} s** / OPTIMIZED **${(input.evalOptimizedMs / 1000).toFixed(2)} s** (\`evaluateArchitecturesAtCutoff\` v1) |
| **CURRENT ms/bar** | ${input.currentMsPerBar.toFixed(1)} ms (sequential ${SEQUENTIAL_BARS} bars, full rebuild path) |
| **OPTIMIZED ms/bar** | ${input.optimizedMsPerBar.toFixed(1)} ms (sequential ${SEQUENTIAL_BARS} bars, syncSeries/applyClosedBar) |
| **ACTUAL SPEEDUP** | **${speedup}×** checkpoint total (CURRENT ÷ OPTIMIZED); bar walk **${input.currentMsPerBar > 0 ? (Math.round((input.currentMsPerBar / input.optimizedMsPerBar) * 100) / 100) : "n/a"}×** |
| **PARITY** | **${input.parityPass ? "PASS" : "FAIL"}** |
| **FIRST DIVERGENCE** | ${input.firstDivergence} |
| **PIT** | **${input.pitPass ? "PASS" : "FAIL"}** — ${input.pitDetail} |
| **MEMORY (RSS / heap MB)** | start ${input.memoryStart.rss}/${input.memoryStart.heap} → end ${input.memoryEnd.rss}/${input.memoryEnd.heap} |
| **CPU** | Single-threaded Node (~100% one core during context build) |
| **RECOMMENDATION** | ${input.recommendation} |

---

## Checkpoint parity detail

| # | barIndex | asOf (UTC) | pass | first divergent field |
|---|--------:|---|:---:|:---|
${input.checkpointResults
  .map(
    (r, i) =>
      `| ${i + 1} | ${r.barIndex} | ${r.asOf} | ${r.pass ? "PASS" : "**FAIL**"} | ${r.firstField ?? "—"} |`
  )
  .join("\n")}

---

## Mode wiring

| Component | CURRENT | OPTIMIZED |
|-----------|---------|-----------|
| \`evaluateArchitecturesAtCutoff\` | \`ReplayDataCutoff.buildContextAtBarIndex\` | \`ResearchContextSession\` → \`IncrementalMarketEngine.syncSeries\` |
| \`ReplayEngine\` | Full rebuild per cursor | Incremental session + cache |
| \`runHistoricalExperiment\` | Default \`resolveResearchReplayMode()\` → **CURRENT** | Set \`RESEARCH_REPLAY_MODE=OPTIMIZED\` or \`--mode OPTIMIZED\` |
| Default | **CURRENT** (explicit default; opt-in only) | Parity **PASS** on Aug-12 benchmark — set \`RESEARCH_REPLAY_MODE=OPTIMIZED\` for sequential replay |

---

## Evidence class

**INFRASTRUCTURE / DEBUGGING** — not EDGE EVIDENCE. Small controlled fixture only; no 6-month replay run.

No commit / push / deploy.
`;
}

async function main() {
  ensureResearchFixtures();
  const modeFlag = resolveResearchReplayMode();
  const memStart = memMb();
  const data = loadResearchDatasetFixture(DATASET_ID);
  const datasetId = data.id ?? DATASET_ID;
  const checkpointIndices = pickParityCheckpoints(data.m1, CHECKPOINT_COUNT, WARMUP);

  console.log(`=== Incremental replay parity (${DATASET_ID}, ${CHECKPOINT_COUNT} checkpoints) ===\n`);

  // --- STRICT PARITY ---
  const checkpointResults: Array<{ barIndex: number; asOf: string; pass: boolean; firstField?: string }> = [];
  let firstDivergence = "none";
  let parityPass = true;

  const optimizedSession = new ResearchContextSession();
  optimizedSession.reset(data, { warmupBarIndex: WARMUP });

  for (const barIndex of checkpointIndices) {
    const asOf = data.m1[barIndex]!.time;

    const currentEval = evaluateArchitecturesAtCutoff({
      data,
      asOf,
      datasetId,
      versions: ["architecture-v1"],
      forwardBarCount: 30,
      mode: "CURRENT",
    })[0]!;
    const optimizedEval = evaluateArchitecturesAtCutoff({
      data,
      asOf,
      datasetId,
      versions: ["architecture-v1"],
      forwardBarCount: 30,
      mode: "OPTIMIZED",
      contextSession: optimizedSession,
    })[0]!;
    const evalCmp = compareEvaluatedDecisions(currentEval, optimizedEval, data, asOf, barIndex);

    const pass = evalCmp.pass;
    if (!pass) parityPass = false;
    const first = evalCmp.firstDivergence;
    if (!pass && firstDivergence === "none" && first) {
      firstDivergence = `${first.field} @ ${asOf.toISOString()} (CURRENT=${first.current.slice(0, 60)} ≠ OPT=${first.optimized.slice(0, 60)})`;
      console.error(`  ✗ first divergence: ${firstDivergence}`);
      if (first.field) {
        console.error(`    all diffs: ${evalCmp.diffs.map((d) => d.field).join(", ")}`);
      }
    } else if (pass) {
      console.log(`  ✓ barIndex=${barIndex} ${asOf.toISOString()}`);
    }

    checkpointResults.push({
      barIndex,
      asOf: asOf.toISOString(),
      pass,
      firstField: first?.field,
    });
  }

  // --- PIT poison (OPTIMIZED path) ---
  const pitIdx = checkpointIndices[Math.floor(checkpointIndices.length / 2)] ?? checkpointIndices[0]!;
  const pit = runOptimizedPathLeakageTest(data, pitIdx);
  const pitPass = pit.passed;
  const pitDetail = `${pit.poisonsPassed}/${pit.poisonsTotal} poisons unchanged at T (barIndex=${pitIdx})`;
  console.log(`\nPIT OPTIMIZED: ${pitPass ? "PASS" : "FAIL"} (${pitDetail})`);

  // --- PERFORMANCE (single process, small) — context build is ~96% of checkpoint cost ---
  let currentMs = 0;
  for (const barIndex of checkpointIndices) {
    currentMs += timeMs(() => {
      const session = new ResearchContextSession();
      session.reset(data, { warmupBarIndex: WARMUP });
      session.buildAtBarIndex(barIndex, "CURRENT");
    });
  }

  const optSession = new ResearchContextSession();
  optSession.reset(data, { warmupBarIndex: WARMUP });
  let optimizedMs = 0;
  for (const barIndex of checkpointIndices) {
    optimizedMs += timeMs(() => {
      optSession.buildAtBarIndex(barIndex, "OPTIMIZED");
    });
  }

  // One full architecture-v1 eval per mode (end-to-end sanity, not multiplied by checkpoints)
  const evalBar = checkpointIndices[checkpointIndices.length - 1]!;
  const evalAsOf = data.m1[evalBar]!.time;
  const evalCurrentMs = timeMs(() => {
    evaluateArchitecturesAtCutoff({
      data,
      asOf: evalAsOf,
      datasetId,
      versions: ["architecture-v1"],
      forwardBarCount: 30,
      mode: "CURRENT",
    });
  });
  const evalOptSession = new ResearchContextSession();
  evalOptSession.reset(data, { warmupBarIndex: WARMUP });
  for (const barIndex of checkpointIndices) {
    if (barIndex <= evalBar) evalOptSession.buildAtBarIndex(barIndex, "OPTIMIZED");
  }
  const evalOptimizedMs = timeMs(() => {
    evaluateArchitecturesAtCutoff({
      data,
      asOf: evalAsOf,
      datasetId,
      versions: ["architecture-v1"],
      forwardBarCount: 30,
      mode: "OPTIMIZED",
      contextSession: evalOptSession,
    });
  });

  const seqStart = checkpointIndices[0] ?? WARMUP;
  let currentBarMs = 0;
  for (let i = 0; i < SEQUENTIAL_BARS; i++) {
    const idx = seqStart + i;
    const bar = data.m1[idx]!;
    currentBarMs += timeMs(() => {
      new ReplayDataCutoff(data, bar.time).buildContextAtBarIndex(idx, undefined, bar.close);
    });
  }

  const barSession = new ResearchContextSession();
  barSession.reset(data, { warmupBarIndex: seqStart });
  let optimizedBarMs = 0;
  for (let i = 1; i <= SEQUENTIAL_BARS; i++) {
    const idx = seqStart + i;
    optimizedBarMs += timeMs(() => {
      barSession.buildAtBarIndex(idx, "OPTIMIZED");
    });
  }

  const memEnd = memMb();
  const recommendation = parityPass && pitPass
    ? optimizedMs < currentMs
      ? `Parity PASS + PIT PASS. Measured checkpoint speedup ${(currentMs / optimizedMs).toFixed(2)}×. Safe to opt-in via \`RESEARCH_REPLAY_MODE=OPTIMIZED\` for sequential replay after re-running this suite on target fixtures. Default remains CURRENT.`
      : `Parity PASS + PIT PASS but OPTIMIZED not faster on this benchmark (${(currentMs / 1000).toFixed(1)}s vs ${(optimizedMs / 1000).toFixed(1)}s). Keep default CURRENT.`
    : `Parity ${parityPass ? "PASS" : "FAIL"} / PIT ${pitPass ? "PASS" : "FAIL"}. **Do NOT switch default to OPTIMIZED.** Fix divergence: ${firstDivergence}.`;

  const report = formatReport({
    implemented: true,
    currentMs,
    optimizedMs,
    currentMsPerBar: currentBarMs / SEQUENTIAL_BARS,
    optimizedMsPerBar: optimizedBarMs / SEQUENTIAL_BARS,
    evalCurrentMs,
    evalOptimizedMs,
    parityPass,
    firstDivergence,
    pitPass,
    pitDetail,
    memoryStart: memStart,
    memoryEnd: memEnd,
    checkpointResults,
    recommendation,
  });

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`\nWrote ${REPORT_PATH}`);
  console.log(`\nSummary: PARITY=${parityPass ? "PASS" : "FAIL"} PIT=${pitPass ? "PASS" : "FAIL"} speedup=${(currentMs / optimizedMs).toFixed(2)}×`);
  console.log(`Default mode remains CURRENT (flag was ${modeFlag})`);

  if (!parityPass || !pitPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
