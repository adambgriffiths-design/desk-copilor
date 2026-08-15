/**
 * Multi-task parallel scheduler tests
 * Run: npm run test:supervisor-parallel
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  batchCompatible,
  canRunInParallel,
  createTaskQueue,
  dependenciesSatisfied,
  ResearchMemory,
  runSupervisor,
  scopePathsConflict,
  selectParallelBatch,
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
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-parallel-"));
}

function testScopeConflict() {
  console.log("\n1. scope path conflicts");
  assert("disjoint paths ok", !scopePathsConflict(["lib/supervisor/"], ["lib/research/replay/"]));
  assert("nested paths conflict", scopePathsConflict(["lib/supervisor/"], ["lib/supervisor/queue.ts"]));
  assert("both empty conflict", scopePathsConflict([], []));
  assert("empty vs file conflict", scopePathsConflict([], ["lib/supervisor/queue.ts"]));
}

function testParallelCompatibility() {
  console.log("\n2. parallel compatibility");
  const auditA: SupervisorTask = {
    id: "a",
    title: "Audit supervisor",
    prompt: validSupervisorTestPrompt("READ-ONLY audit lib/supervisor/"),
    category: "audit",
    allowedPaths: ["lib/supervisor/"],
    priority: 1,
    confidence: 0.9,
  };
  const auditB: SupervisorTask = {
    id: "b",
    title: "Audit research replay",
    prompt: validSupervisorTestPrompt("READ-ONLY audit lib/research/replay/"),
    category: "audit",
    allowedPaths: ["lib/research/replay/"],
    priority: 2,
    confidence: 0.9,
  };
  const sameScope: SupervisorTask = {
    id: "c",
    title: "Docs supervisor",
    prompt: validSupervisorTestPrompt("Update data/supervisor/README.md only"),
    category: "docs",
    allowedPaths: ["lib/supervisor/"],
    priority: 3,
    confidence: 0.8,
  };
  assert("disjoint audits parallel", canRunInParallel(auditA, auditB) === null);
  assert("same scope blocked", canRunInParallel(auditA, sameScope) !== null);
  assert("dependency blocked", canRunInParallel(auditA, { ...auditB, dependsOn: ["a"] }) !== null);
  assert("batch compatible", batchCompatible([auditA], auditB) === null);
}

function testDependencies() {
  console.log("\n3. task dependencies");
  const root = tempDir();
  const queue = createTaskQueue({ root, maxSize: 20 });
  const a = queue.create({
    prompt: validSupervisorTestPrompt("Task A"),
    reason: "a",
    priority: 1,
    id: "dep-a",
    allowedPaths: ["lib/supervisor/"],
  });
  const b = queue.create({
    prompt: validSupervisorTestPrompt("Task B after A"),
    reason: "b",
    priority: 2,
    id: "dep-b",
    allowedPaths: ["lib/research/"],
    dependsOn: [a.id],
  });
  assert("deps unsatisfied while pending", !dependenciesSatisfied(b, queue));
  queue.markRunning(a.id);
  queue.complete(a.id);
  assert("deps satisfied after complete", dependenciesSatisfied(b, queue));
}

function testParallelBatchSelection() {
  console.log("\n4. parallel batch selection");
  const root = tempDir();
  const queue = createTaskQueue({ root, maxSize: 20 });
  queue.create({
    prompt: validSupervisorTestPrompt("READ-ONLY audit lib/supervisor/"),
    reason: "p1",
    priority: 1,
    id: "par-1",
    category: "audit",
    allowedPaths: ["lib/supervisor/"],
  });
  queue.create({
    prompt: validSupervisorTestPrompt("READ-ONLY audit lib/research/replay/"),
    reason: "p2",
    priority: 2,
    id: "par-2",
    category: "audit",
    allowedPaths: ["lib/research/replay/"],
  });
  queue.create({
    prompt: validSupervisorTestPrompt("READ-ONLY audit scripts/research-run-replay.ts"),
    reason: "p3",
    priority: 3,
    id: "par-3",
    category: "audit",
    allowedPaths: ["scripts/research-run-replay.ts"],
  });

  const batch = selectParallelBatch(queue, { maxParallel: 3 });
  assert("selects multiple independent", batch.tasks.length >= 2, `got ${batch.tasks.length}`);
  assert("parallelism matches", batch.parallelism === batch.tasks.length);
  const ids = batch.tasks.map((t) => t.task!.id);
  assert("unique task ids", new Set(ids).size === ids.length);
  assert("all running", batch.tasks.every((t) => queue.getRunningTasks().some((r) => r.id === t.queueTaskId)));
}

function testNoDuplicateDispatch() {
  console.log("\n5. no duplicate dispatch");
  const root = tempDir();
  const queue = createTaskQueue({ root, maxSize: 20 });
  queue.create({
    prompt: validSupervisorTestPrompt("READ-ONLY single task"),
    reason: "single",
    priority: 1,
    id: "single-1",
    allowedPaths: ["data/supervisor/README.md"],
    category: "docs",
  });
  const b1 = selectParallelBatch(queue, { maxParallel: 2 });
  const b2 = selectParallelBatch(queue, { maxParallel: 2 });
  assert("first batch claims one", b1.tasks.length === 1);
  assert("second batch empty while running", b2.tasks.length === 0);
}

async function testParallelDryRunLoop() {
  console.log("\n6. parallel dry-run loop");
  const root = tempDir();
  queueSeedForParallelDryRun(root);

  const result = await runSupervisor({
    dryRun: true,
    autonomous: true,
    maxIterations: 1,
    maxParallel: 2,
    pollIntervalMs: 10,
    waitTimeoutMs: 100,
    projectRoot: process.cwd(),
    queueRoot: root,
    seedFromBacklog: false,
    skipNextTaskGeneration: true,
    transcriptRoot: path.join(root, "no-transcripts"),
  });

  assert("loop ran at least one iteration", result.iterations >= 1);
  const throughputPath = path.join(root, "throughput.jsonl");
  assert("throughput log written", fs.existsSync(throughputPath));
  if (fs.existsSync(throughputPath)) {
    const lines = fs.readFileSync(throughputPath, "utf8").trim().split("\n");
    const entry = JSON.parse(lines[0]!) as { parallelismLevel: number };
    assert("parallelism >= 2 when tasks independent", entry.parallelismLevel >= 2);
  }
}

function queueSeedForParallelDryRun(root: string) {
  const queue = createTaskQueue({ root, maxSize: 20 });
  if (!queue.hasTask("mt-1")) {
    queue.create({
      prompt: validSupervisorTestPrompt("supervisor state in lib/supervisor/"),
      reason: "mt1",
      priority: 1,
      id: "mt-1",
      category: "audit",
      allowedPaths: ["lib/supervisor/"],
    });
  }
  if (!queue.hasTask("mt-2")) {
    queue.create({
      prompt: validSupervisorTestPrompt("research replay in lib/research/replay/"),
      reason: "mt2",
      priority: 2,
      id: "mt-2",
      category: "audit",
      allowedPaths: ["lib/research/replay/"],
    });
  }
}

function testSerializeImplValidation() {
  console.log("\n7. serialize implementation then validation");
  const root = tempDir();
  const queue = createTaskQueue({ root, maxSize: 20 });
  const impl = queue.create({
    prompt: validSupervisorTestPrompt("Fix test:supervisor in lib/supervisor/ only"),
    reason: "impl",
    priority: 1,
    id: "impl-1",
    category: "test-fix",
    allowedPaths: ["lib/supervisor/"],
    verifyScript: "test:supervisor",
  });
  queue.create({
    prompt: validSupervisorTestPrompt("Run npm run test:supervisor to verify fix"),
    reason: "validate",
    priority: 2,
    id: "val-1",
    category: "diagnostic",
    allowedPaths: [],
    verifyScript: "test:supervisor",
    dependsOn: [impl.id],
  });
  const batch = selectParallelBatch(queue, { maxParallel: 3 });
  assert("only impl first (val waits)", batch.tasks.length === 1 && batch.tasks[0]?.task?.id === "impl-1");
}

function testMemorySkipCompletesPendingWithoutThrow() {
  console.log("\n8. memory skip completes pending without throw");
  const root = tempDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  const skipped = queue.create({
    prompt: validSupervisorTestPrompt("dataset verify already done"),
    reason: "skip-me",
    priority: 1,
    id: "skip-pending",
    category: "experiment",
    allowedPaths: ["lib/research/"],
    verifyScript: "test:research-dataset",
  });
  const next = queue.create({
    prompt: validSupervisorTestPrompt("READ-ONLY audit lib/supervisor/"),
    reason: "next",
    priority: 2,
    id: "after-skip",
    category: "audit",
    allowedPaths: ["lib/supervisor/"],
  });
  const memory = new ResearchMemory({ root });
  memory.recordTask(
    {
      id: "prior-dataset",
      title: "prior",
      prompt: "prior",
      category: "experiment",
      verifyScript: "test:research-dataset",
      allowedPaths: ["lib/research/"],
      priority: 1,
      confidence: 0.8,
    },
    "completed",
  );

  let threw = false;
  let batch;
  try {
    batch = selectParallelBatch(queue, { maxParallel: 2, memory });
  } catch {
    threw = true;
  }
  assert("does not throw on pending memory skip", !threw);
  assert("skipped task completed", queue.getTasks().find((t) => t.id === skipped.id)?.status === "completed");
  assert("claims next pending", batch?.tasks.some((t) => t.task?.id === next.id) === true);
  fs.rmSync(root, { recursive: true, force: true });
}

async function main() {
  console.log("=== Supervisor parallel tests ===");
  testScopeConflict();
  testParallelCompatibility();
  testDependencies();
  testParallelBatchSelection();
  testNoDuplicateDispatch();
  testSerializeImplValidation();
  testMemorySkipCompletesPendingWithoutThrow();
  await testParallelDryRunLoop();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
