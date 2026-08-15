/**
 * Persistent task queue tests
 * Run: npm run test:supervisor-queue
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  createTaskQueue,
  QueueFullError,
  QueueTaskNotFoundError,
  TaskQueue,
} from "../lib/supervisor";
import { runWatchdogTests } from "../lib/supervisor/watchdog-tests";
import {
  runCrashRecoveryLoopTests,
  runCrashRecoveryTests,
} from "../lib/supervisor/crash-recovery-tests";

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

function tempQueueDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-queue-"));
}

function testCreateAndFields() {
  console.log("\n1. create task with required fields");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  const task = queue.create({
    prompt: "Run diagnostics",
    reason: "backlog seed",
    priority: 10,
  });

  assert("has id", task.id.startsWith("queue-"));
  assert("has createdAt", Boolean(task.createdAt));
  assert("prompt stored", task.prompt === "Run diagnostics");
  assert("reason stored", task.reason === "backlog seed");
  assert("priority stored", task.priority === 10);
  assert("status pending", task.status === "pending");
  fs.rmSync(root, { recursive: true, force: true });
}

function testPersistAndReload() {
  console.log("\n2. persist and reload from disk");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  const created = queue.create({ prompt: "p1", reason: "r1", priority: 1 });

  const reloaded = createTaskQueue({ root, maxSize: 5 });
  const tasks = reloaded.getTasks();
  assert("reload finds task", tasks.length === 1);
  assert("reload preserves id", tasks[0]?.id === created.id);
  assert("reload preserves prompt", tasks[0]?.prompt === "p1");
  fs.rmSync(root, { recursive: true, force: true });
}

function testSelectNextByPriority() {
  console.log("\n3. select next pending by priority");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  queue.create({ prompt: "low", reason: "r", priority: 30 });
  queue.create({ prompt: "high", reason: "r", priority: 5 });
  queue.create({ prompt: "mid", reason: "r", priority: 15 });

  const next = queue.selectNextPending();
  assert("picks lowest priority number", next?.prompt === "high");
  assert("does not mutate status", next?.status === "pending");
  fs.rmSync(root, { recursive: true, force: true });
}

function testCompleteAndFailHistory() {
  console.log("\n4. complete and fail remain in history");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  const a = queue.create({ prompt: "a", reason: "r", priority: 1 });
  const b = queue.create({ prompt: "b", reason: "r", priority: 2 });

  queue.markRunning(a.id);
  queue.complete(a.id);
  queue.markRunning(b.id);
  queue.fail(b.id, "build broke");

  const history = queue.getHistory();
  assert("history has 2 entries", history.length === 2);
  assert("completed in history", history.some((t) => t.id === a.id && t.status === "completed"));
  assert("failed in history", history.some((t) => t.id === b.id && t.status === "failed"));
  assert("failed keeps error", history.find((t) => t.id === b.id)?.errorMessage === "build broke");
  assert("selectNext skips terminal", queue.selectNextPending() === null);
  assert("all tasks still stored", queue.getTasks().length === 2);
  fs.rmSync(root, { recursive: true, force: true });
}

function testRestartRecovery() {
  console.log("\n5. restart recovery");
  const root = tempQueueDir();
  const before = createTaskQueue({ root, maxSize: 5 });
  const t1 = before.create({ prompt: "keep", reason: "seed", priority: 1 });
  before.create({ prompt: "wait", reason: "seed", priority: 2 });
  before.markRunning(t1.id);
  before.complete(t1.id);

  const after = new TaskQueue({ root, maxSize: 5 });
  assert("recovers completed task", after.getHistory().length === 1);
  assert("recovers pending task", after.selectNextPending()?.prompt === "wait");
  assert("maxSize restored", after.maxSize === 5);
  fs.rmSync(root, { recursive: true, force: true });
}

function testMaxQueueSize() {
  console.log("\n6. max queue size enforced");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 2 });
  const first = queue.create({ prompt: "one", reason: "r", priority: 1 });
  queue.create({ prompt: "two", reason: "r", priority: 2 });

  let threwFull = false;
  try {
    queue.create({ prompt: "three", reason: "r", priority: 3 });
  } catch (err) {
    threwFull = err instanceof QueueFullError;
  }
  assert("rejects when full", threwFull);

  queue.markRunning(first.id);
  queue.complete(first.id);
  const added = queue.create({ prompt: "three", reason: "r", priority: 3 });
  assert("allows enqueue after complete frees slot", added.prompt === "three");
  fs.rmSync(root, { recursive: true, force: true });
}

function testClaimNext() {
  console.log("\n7. claim next marks running");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  queue.create({ prompt: "first", reason: "r", priority: 1 });

  const claimed = queue.claimNext();
  assert("claim returns task", claimed?.prompt === "first");
  assert("claim sets running", claimed?.status === "running");
  assert("no second pending", queue.selectNextPending() === null);

  let threwMissing = false;
  try {
    queue.complete("missing-id");
  } catch (err) {
    threwMissing = err instanceof QueueTaskNotFoundError;
  }
  assert("missing task throws", threwMissing);
  fs.rmSync(root, { recursive: true, force: true });
}

function main() {
  console.log("=== Supervisor queue tests ===");
  testCreateAndFields();
  testPersistAndReload();
  testSelectNextByPriority();
  testCompleteAndFailHistory();
  testRestartRecovery();
  testMaxQueueSize();
  testClaimNext();
  runWatchdogTests({ assert, tempQueueDir });
  runCrashRecoveryTests({ assert, tempQueueDir });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
