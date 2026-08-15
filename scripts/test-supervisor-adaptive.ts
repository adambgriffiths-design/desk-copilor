/**
 * Adaptive concurrency tests — deterministic with injected metrics.
 * Run: npm run test:supervisor-adaptive
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  AdaptiveConcurrencyController,
  batchCompatible,
  canRunInParallel,
  createTaskQueue,
  loadAdaptiveConfig,
  runSupervisor,
  sampleMachineMetrics,
  saveAdaptiveConfig,
  scopePathsConflict,
  selectParallelBatch,
  supervisorTaskToQueueInput,
  syntheticBenchmarkTasks,
  validSupervisorTestPrompt,
  type SupervisorTask,
} from "../lib/supervisor";

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

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-adaptive-"));
}

function comfortableMetrics() {
  return sampleMachineMetrics({ cpuUsagePct: 40, ramUsagePct: 55 });
}

function pressureMetrics() {
  return sampleMachineMetrics({ cpuUsagePct: 92, ramUsagePct: 94 });
}

function testScaleUp() {
  console.log("\n1. scale up when comfortable");
  const root = tempDir();
  saveAdaptiveConfig(
    {
      minParallel: 1,
      maxParallel: 4,
      scaleUpThresholdCpu: 70,
      scaleUpThresholdRam: 80,
      scaleDownThresholdCpu: 85,
      scaleDownThresholdRam: 90,
      recoveryStableBatches: 1,
    },
    root,
  );
  const ctrl = new AdaptiveConcurrencyController(root);
  assert("starts at min or optimal", ctrl.getCurrentParallel() >= 1);
  const d1 = ctrl.evaluate(comfortableMetrics());
  assert("scales up under comfort", d1.action === "scale_up" || d1.currentParallel > 1, d1.reason);
}

function testScaleDownUnderPressure() {
  console.log("\n2. scale down under pressure");
  const root = tempDir();
  saveAdaptiveConfig({ minParallel: 1, maxParallel: 4, recoveryStableBatches: 1 }, root);
  const ctrl = new AdaptiveConcurrencyController(root);
  ctrl.evaluate(comfortableMetrics());
  ctrl.evaluate(comfortableMetrics());
  const before = ctrl.getCurrentParallel();
  const d = ctrl.evaluate(pressureMetrics());
  assert("marks under pressure", ctrl.isUnderPressure());
  assert("reduces parallel or holds min", d.currentParallel <= before, `before=${before} after=${d.currentParallel}`);
  assert("blocks new launch", d.launchBlocked === true);
}

function testMaxCap() {
  console.log("\n3. max parallel cap");
  const root = tempDir();
  saveAdaptiveConfig({ minParallel: 1, maxParallel: 2, recoveryStableBatches: 1 }, root);
  const ctrl = new AdaptiveConcurrencyController(root);
  for (let i = 0; i < 5; i++) ctrl.evaluate(comfortableMetrics());
  assert("never exceeds maxParallel", ctrl.getCurrentParallel() <= 2);
}

function testRecoveryAfterPressure() {
  console.log("\n4. recovery after pressure");
  const root = tempDir();
  saveAdaptiveConfig({ minParallel: 1, maxParallel: 3, recoveryStableBatches: 2 }, root);
  const ctrl = new AdaptiveConcurrencyController(root);
  ctrl.evaluate(pressureMetrics());
  const d1 = ctrl.evaluate(comfortableMetrics());
  assert("recovery in progress", d1.action === "recovery" || !ctrl.isUnderPressure());
  ctrl.evaluate(comfortableMetrics());
  assert("pressure cleared after stable batches", !ctrl.isUnderPressure());
}

function testPersistOptimal() {
  console.log("\n5. persist optimal concurrency");
  const root = tempDir();
  const ctrl = new AdaptiveConcurrencyController(root);
  ctrl.persistOptimal(2);
  const reloaded = loadAdaptiveConfig(root);
  assert("optimalParallel saved", reloaded.optimalParallel === 2);
  assert("lastBenchmarkAt set", !!reloaded.lastBenchmarkAt);
}

function testDepsAndPathConflicts() {
  console.log("\n6. deps and path conflicts block parallel");
  const root = tempDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  const impl = queue.create({
    prompt: validSupervisorTestPrompt("Fix lib/supervisor/ only"),
    reason: "impl",
    priority: 1,
    id: "ad-impl",
    category: "test-fix",
    allowedPaths: ["lib/supervisor/"],
    verifyScript: "test:supervisor",
  });
  queue.create({
    prompt: validSupervisorTestPrompt("Verify test:supervisor"),
    reason: "val",
    priority: 2,
    id: "ad-val",
    category: "diagnostic",
    allowedPaths: [],
    verifyScript: "test:supervisor",
    dependsOn: [impl.id],
  });
  const batch = selectParallelBatch(queue, { maxParallel: 3 });
  assert("validation waits on impl", batch.tasks.length === 1 && batch.tasks[0]?.task?.id === "ad-impl");
  assert("overlapping paths conflict", scopePathsConflict(["lib/supervisor/"], ["lib/supervisor/queue.ts"]));
}

function testReadOnlyParallelPriority() {
  console.log("\n7. read-only tasks batch together");
  const root = tempDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  for (const t of syntheticBenchmarkTasks()) {
    queue.create(supervisorTaskToQueueInput(t, "benchmark"));
  }
  const batch = selectParallelBatch(queue, { maxParallel: 4 });
  assert("selects multiple benchmark tasks", batch.tasks.length >= 3, `got ${batch.tasks.length}`);
  const tasks = batch.tasks.map((s) => s.task!).filter(Boolean) as SupervisorTask[];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      assert(`pair ${tasks[i]!.id}/${tasks[j]!.id} compatible`, canRunInParallel(tasks[i]!, tasks[j]!) === null);
      assert(`batch compatible ${tasks[i]!.id}`, batchCompatible(tasks.slice(0, i + 1), tasks[j]!) === null);
    }
  }
}

async function testAdaptiveDryRunThroughput() {
  console.log("\n8. adaptive dry-run throughput logging");
  const root = tempDir();
  saveAdaptiveConfig({ minParallel: 1, maxParallel: 3, optimalParallel: 2, recoveryStableBatches: 1 }, root);
  const queue = createTaskQueue({ root, maxSize: 10 });
  for (const t of syntheticBenchmarkTasks().slice(0, 3)) {
    queue.create(supervisorTaskToQueueInput(t, "adaptive bench"));
  }

  const result = await runSupervisor({
    dryRun: true,
    autonomous: true,
    maxIterations: 1,
    adaptiveConcurrency: true,
    pollIntervalMs: 5,
    waitTimeoutMs: 50,
    projectRoot: process.cwd(),
    queueRoot: root,
    seedFromBacklog: false,
    skipNextTaskGeneration: true,
    transcriptRoot: path.join(root, "no-transcripts"),
    metricsOverride: { cpuUsagePct: 35, ramUsagePct: 50 },
  });

  assert("adaptive loop ran", result.iterations >= 1);
  const logPath = path.join(root, "throughput.jsonl");
  assert("throughput log exists", fs.existsSync(logPath));
  if (fs.existsSync(logPath)) {
    const entry = JSON.parse(fs.readFileSync(logPath, "utf8").trim().split("\n")[0]!);
    assert("records adaptiveParallel", typeof entry.adaptiveParallel === "number");
    assert("records cpuUsagePct", typeof entry.cpuUsagePct === "number");
  }
}

function testBatchFailureScaleDown() {
  console.log("\n9. batch failures trigger scale down");
  const root = tempDir();
  saveAdaptiveConfig({ minParallel: 1, maxParallel: 3, recoveryStableBatches: 1 }, root);
  const ctrl = new AdaptiveConcurrencyController(root);
  ctrl.evaluate(comfortableMetrics());
  ctrl.evaluate(comfortableMetrics());
  const before = ctrl.getCurrentParallel();
  ctrl.recordBatchOutcome(
    {
      tasksLaunched: 4,
      tasksCompleted: 1,
      tasksFailed: 3,
      tasksBlocked: 0,
      averageTaskDurationMs: 1000,
      parallelismLevel: 3,
    },
    comfortableMetrics(),
  );
  assert("scales down after failures", ctrl.getCurrentParallel() < before || ctrl.isUnderPressure());
}

async function main() {
  console.log("=== Supervisor adaptive concurrency tests ===");
  testScaleUp();
  testScaleDownUnderPressure();
  testMaxCap();
  testRecoveryAfterPressure();
  testPersistOptimal();
  testDepsAndPathConflicts();
  testReadOnlyParallelPriority();
  testBatchFailureScaleDown();
  await testAdaptiveDryRunThroughput();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
