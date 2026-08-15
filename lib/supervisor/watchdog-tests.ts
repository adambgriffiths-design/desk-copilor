/**
 * Stuck-task watchdog tests — run via npm run test:supervisor-queue
 */
import fs from "fs";
import os from "os";
import path from "path";
import { checkAndBlockTimedOutTasks, readWatchdogLog, WATCHDOG_BLOCK_REASON } from "./watchdog";
import { createTaskQueue } from "./queue";
import { selectInitialTask } from "./next-task";

export interface WatchdogTestHarness {
  assert(name: string, cond: boolean, detail?: string): void;
  tempQueueDir(): string;
}

export function runWatchdogTests(h: WatchdogTestHarness): void {
  console.log("\n--- Stuck-task watchdog ---");

  testNormalCompletionBeforeTimeout(h);
  testTimeoutBlocksRunningTask(h);
  testRestartWhileTimedOut(h);
  testAlreadyCompletedTaskIgnored(h);
}

function testNormalCompletionBeforeTimeout(h: WatchdogTestHarness) {
  console.log("\n8. normal completion before timeout");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  const task = queue.create({ prompt: "finish fast", reason: "r", priority: 1 });
  queue.markRunning(task.id);

  const nowMs = Date.now();
  const result = checkAndBlockTimedOutTasks(queue, {
    runningTimeoutMs: 60_000,
    nowMs,
    root,
  });

  h.assert("nothing blocked", result.blocked.length === 0);
  h.assert("still running", result.stillRunning.includes(task.id));
  h.assert("status running", queue.getTasks().find((t) => t.id === task.id)?.status === "running");

  queue.complete(task.id);
  h.assert("completed clears startedAt", queue.getTasks().find((t) => t.id === task.id)?.startedAt === undefined);
  h.assert("no watchdog log", readWatchdogLog(root).length === 0);
  fs.rmSync(root, { recursive: true, force: true });
}

function testTimeoutBlocksRunningTask(h: WatchdogTestHarness) {
  console.log("\n9. timeout blocks running task");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  const task = queue.create({ prompt: "stuck", reason: "r", priority: 1 });
  queue.markRunning(task.id);

  const startedAt = new Date(Date.now() - 5_000).toISOString();
  const tasks = queue.getTasks();
  const running = tasks.find((t) => t.id === task.id)!;
  running.startedAt = startedAt;
  queue.persist();

  const timeoutMs = 1_000;
  const nowMs = Date.parse(startedAt) + timeoutMs + 1;
  const result = checkAndBlockTimedOutTasks(queue, { runningTimeoutMs: timeoutMs, nowMs, root });

  h.assert("one blocked", result.blocked.length === 1);
  const record = result.blocked[0]!;
  h.assert("record taskId", record.taskId === task.id);
  h.assert("record startedAt", record.startedAt === startedAt);
  h.assert("record timeoutMs", record.timeoutMs === timeoutMs);
  h.assert("record reason", record.reason === WATCHDOG_BLOCK_REASON);
  h.assert("record blockedAt", Boolean(record.blockedAt));

  const updated = queue.getTasks().find((t) => t.id === task.id);
  h.assert("status blocked", updated?.status === "blocked");
  h.assert("error message set", updated?.errorMessage === WATCHDOG_BLOCK_REASON);

  const log = readWatchdogLog(root);
  h.assert("watchdog log persisted", log.length === 1 && log[0]?.taskId === task.id);
  fs.rmSync(root, { recursive: true, force: true });
}

function testRestartWhileTimedOut(h: WatchdogTestHarness) {
  console.log("\n10. restart while timed out skips resume");
  const root = h.tempQueueDir();
  const before = createTaskQueue({ root, maxSize: 5 });
  const stuck = before.create({ prompt: "stuck", reason: "r", priority: 1, id: "stuck-task" });
  before.markRunning(stuck.id);
  const startedAt = new Date(Date.now() - 10_000).toISOString();
  const t = before.getTasks().find((x) => x.id === stuck.id)!;
  t.startedAt = startedAt;
  before.persist();
  before.create({
    prompt: "READ-ONLY: Inspect lib/supervisor/ queue state. Report only. STOP.",
    reason: "r",
    priority: 2,
    id: "next-task",
    title: "Next queue diagnostic",
    category: "diagnostic",
    allowedPaths: ["lib/supervisor/"],
  });

  const after = createTaskQueue({ root, maxSize: 5 });
  const selection = selectInitialTask(after, { runningTimeoutMs: 1_000, nowMs: Date.now(), root });

  h.assert("does not resume stuck task", selection.task?.id !== "stuck-task");
  h.assert("picks next pending", selection.task?.id === "next-task");
  h.assert("stuck task blocked", after.getTasks().find((x) => x.id === "stuck-task")?.status === "blocked");
  h.assert("watchdog log on restart", readWatchdogLog(root).some((r) => r.taskId === "stuck-task"));
  fs.rmSync(root, { recursive: true, force: true });
}

function testAlreadyCompletedTaskIgnored(h: WatchdogTestHarness) {
  console.log("\n11. already-completed task ignored by watchdog");
  const root = h.tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  const task = queue.create({ prompt: "done", reason: "r", priority: 1 });
  queue.markRunning(task.id);
  queue.complete(task.id);

  const result = checkAndBlockTimedOutTasks(queue, {
    runningTimeoutMs: 1,
    nowMs: Date.now() + 99_999,
    root,
  });

  h.assert("completed not blocked", result.blocked.length === 0);
  h.assert("status still completed", queue.getTasks().find((t) => t.id === task.id)?.status === "completed");
  h.assert("no watchdog entries", readWatchdogLog(root).length === 0);
  fs.rmSync(root, { recursive: true, force: true });
}

if (require.main === module) {
  let passed = 0;
  let failed = 0;
  const harness: WatchdogTestHarness = {
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
      return fs.mkdtempSync(path.join(os.tmpdir(), "sup-watchdog-"));
    },
  };
  console.log("=== Supervisor watchdog tests ===");
  runWatchdogTests(harness);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}
