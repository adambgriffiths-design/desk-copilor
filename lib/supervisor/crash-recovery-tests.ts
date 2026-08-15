/**
 * Crash-recovery tests — run via npm run test:supervisor-queue and test:supervisor
 */
import fs from "fs";
import os from "os";
import path from "path";
import { STALE_RUNNING_RECONCILED } from "./crash-recovery";
import { writeSyntheticResult } from "./dispatcher";
import { validSupervisorTestPrompt } from "./quality-gate";
import { selectInitialTask } from "./next-task";
import { QUEUE_BACKUP_SUFFIX } from "./queue-persist";
import {
  createTaskQueue,
  QueueInvalidStatusError,
  TaskQueue,
} from "./queue";
import { runSupervisorLoop } from "./runner";
import { supervisorTaskToQueueInput, syntheticDryRunTasks } from "./next-task";

export interface CrashRecoveryTestHarness {
  assert(name: string, cond: boolean, detail?: string): void;
  tempQueueDir(): string;
}

export function runCrashRecoveryTests(h: CrashRecoveryTestHarness): void {
  console.log("\n--- Crash recovery ---");

  testCorruptQueueRecoversFromBackup(h);
  testPersistCreatesBackup(h);
  testCompleteRejectsNonRunning(h);
  testBeforeDispatchResume(h);
  testMultipleRunningReconciled(h);
}

export async function runCrashRecoveryLoopTests(h: CrashRecoveryTestHarness): Promise<void> {
  console.log("\n--- Crash recovery (loop) ---");

  await testAfterCursorResultBeforeQueueComplete(h);
  await testResumedSkipsRedispatch(h);
}

function testCorruptQueueRecoversFromBackup(h: CrashRecoveryTestHarness) {
  console.log("\n12. corrupt queue.json recovers from .bak");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  queue.create({ prompt: "survive", reason: "r", priority: 1, id: "survivor" });
  queue.persist();

  const queuePath = path.join(root, "queue.json");
  fs.writeFileSync(queuePath, "{ corrupt json", "utf8");

  const recovered = new TaskQueue({ root, maxSize: 5 });
  h.assert("task not lost", recovered.hasTask("survivor"));
  h.assert("primary restored", fs.existsSync(queuePath) && !fs.readFileSync(queuePath, "utf8").startsWith("{ corrupt"));
  fs.rmSync(root, { recursive: true, force: true });
}

function testPersistCreatesBackup(h: CrashRecoveryTestHarness) {
  console.log("\n13. persist writes queue.json.bak");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  queue.create({ prompt: "one", reason: "r", priority: 1 });
  queue.create({ prompt: "two", reason: "r", priority: 2 });
  queue.persist();

  const bakPath = path.join(root, `queue.json${QUEUE_BACKUP_SUFFIX}`);
  h.assert("backup exists", fs.existsSync(bakPath));
  const bak = JSON.parse(fs.readFileSync(bakPath, "utf8")) as { tasks: unknown[] };
  h.assert("backup has tasks", Array.isArray(bak.tasks) && bak.tasks.length === 2);
  fs.rmSync(root, { recursive: true, force: true });
}

function testCompleteRejectsNonRunning(h: CrashRecoveryTestHarness) {
  console.log("\n14. complete/fail reject non-running tasks");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  const pending = queue.create({ prompt: "p", reason: "r", priority: 1, id: "pending-only" });
  const running = queue.create({ prompt: "r", reason: "r", priority: 2, id: "run-then-done" });
  queue.markRunning(running.id);
  queue.complete(running.id);

  let pendingComplete = false;
  try {
    queue.complete(pending.id);
  } catch (err) {
    pendingComplete = err instanceof QueueInvalidStatusError;
  }
  h.assert("cannot complete pending", pendingComplete);

  let doubleComplete = false;
  try {
    queue.complete(running.id);
  } catch (err) {
    doubleComplete = err instanceof QueueInvalidStatusError;
  }
  h.assert("cannot complete twice", doubleComplete);
  h.assert("pending still pending", queue.getTasks().find((t) => t.id === pending.id)?.status === "pending");
  fs.rmSync(root, { recursive: true, force: true });
}

function testBeforeDispatchResume(h: CrashRecoveryTestHarness) {
  console.log("\n15. crash before dispatch resumes without re-claim");
  const root = h.tempQueueDir();
  const before = createTaskQueue({ root, maxSize: 5 });
  before.create({ prompt: "claimed", reason: "r", priority: 1, id: "claimed-task" });
  before.claimNext();

  const after = createTaskQueue({ root, maxSize: 5 });
  h.assert("still one running", after.getRunningTasks().length === 1);
  h.assert("cannot claim again", after.claimNext() === null);

  const initial = selectInitialTask(after, { root });
  h.assert("resumes running", initial.resumed === true);
  h.assert("same task", initial.task?.id === "claimed-task");
  fs.rmSync(root, { recursive: true, force: true });
}

function testMultipleRunningReconciled(h: CrashRecoveryTestHarness) {
  console.log("\n16. multiple running tasks reconciled on restart");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  queue.create({ prompt: "first", reason: "r", priority: 1, id: "run-a" });
  queue.create({ prompt: "second", reason: "r", priority: 2, id: "run-b" });
  queue.markRunning("run-a");
  queue.markRunning("run-b");

  const initial = selectInitialTask(createTaskQueue({ root, maxSize: 10 }), { root });
  h.assert("resumes oldest running", initial.task?.id === "run-a");
  h.assert(
    "stale running blocked",
    createTaskQueue({ root, maxSize: 10 }).getTasks().find((t) => t.id === "run-b")?.status === "blocked",
  );
  h.assert(
    "stale reason recorded",
    createTaskQueue({ root, maxSize: 10 }).getTasks().find((t) => t.id === "run-b")?.errorMessage ===
      STALE_RUNNING_RECONCILED,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

async function testAfterCursorResultBeforeQueueComplete(h: CrashRecoveryTestHarness) {
  console.log("\n17. restart after result file completes running task");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  const task = queue.create({
    prompt: validSupervisorTestPrompt("result-ready"),
    reason: "r",
    priority: 1,
    id: "result-ready",
    title: "Run result-ready check",
    category: "diagnostic",
  });
  queue.claimNext();
  writeSyntheticResult(task.id, "=== REPORT ===\nAll tests PASS\nSTOP.");

  const result = await runSupervisorLoop({
    dryRun: true,
    autonomous: true,
    maxIterations: 1,
    pollIntervalMs: 10,
    waitTimeoutMs: 500,
    projectRoot: process.cwd(),
    queueRoot: root,
    seedFromBacklog: false,
  });

  const reloaded = createTaskQueue({ root, maxSize: 5 });
  const updated = reloaded.getTasks().find((t) => t.id === "result-ready");
  h.assert("loop ran", result.iterations === 1);
  h.assert("resumed not re-dispatched", result.entries[0]?.dispatch === undefined);
  h.assert("task completed", updated?.status === "completed");
  fs.rmSync(root, { recursive: true, force: true });
}

async function testResumedSkipsRedispatch(h: CrashRecoveryTestHarness) {
  console.log("\n18. resumed task skips inbox re-write");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  for (const t of syntheticDryRunTasks()) {
    queue.create(supervisorTaskToQueueInput(t, "dry"));
  }
  queue.claimNext();

  const result = await runSupervisorLoop({
    dryRun: true,
    autonomous: true,
    maxIterations: 1,
    pollIntervalMs: 10,
    waitTimeoutMs: 100,
    projectRoot: process.cwd(),
    queueRoot: root,
  });

  h.assert("resumed limitation logged", result.entries.some((e) => e.dispatch === undefined && e.state === "EVALUATE"));
  h.assert("single running consumed", createTaskQueue({ root, maxSize: 10 }).getHistory().length === 1);
  fs.rmSync(root, { recursive: true, force: true });
}

if (require.main === module) {
  let passed = 0;
  let failed = 0;
  const harness: CrashRecoveryTestHarness = {
    assert(name, cond, detail) {
      if (cond) {
        passed++;
        console.log(`  ✓ ${name}`);
      } else {
        failed++;
        console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
      }
    },
    tempQueueDir() {
      return fs.mkdtempSync(path.join(os.tmpdir(), "sup-crash-"));
    },
  };

  (async () => {
    console.log("=== Supervisor crash recovery tests ===");
    runCrashRecoveryTests(harness);
    await runCrashRecoveryLoopTests(harness);
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
