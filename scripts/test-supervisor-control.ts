/**
 * Human override / intervention mode tests
 * Run: npm run test:supervisor-control
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  cmdCancel,
  cmdPause,
  cmdPriority,
  cmdResume,
  cmdStatus,
  cmdStop,
  cmdTakeover,
  createTaskQueue,
  loadControlState,
  loadQueueSnapshot,
  runSupervisor,
  selectNextTask,
  selectParallelBatch,
  shouldDispatchNewTasks,
  validSupervisorTestPrompt,
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

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sup-control-"));
  fs.mkdirSync(path.join(root, "inbox"), { recursive: true });
  fs.mkdirSync(path.join(root, "outbox"), { recursive: true });
  fs.mkdirSync(path.join(root, "results"), { recursive: true });
  return root;
}

function assertQueueIntact(root: string) {
  const queuePath = path.join(root, "queue.json");
  const loaded = loadQueueSnapshot(queuePath, 50);
  assert("queue.json parseable", Array.isArray(loaded.snapshot.tasks));
}

function readExecutionLog(root: string): Array<{ nextTaskReason?: string }> {
  const logPath = path.join(root, "executions.jsonl");
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function seedQueue(root: string) {
  const queue = createTaskQueue({ root, maxSize: 20 });
  queue.create({
    id: "ctl-pending-low",
    prompt: validSupervisorTestPrompt("low priority pending"),
    reason: "seed low",
    priority: 50,
    allowedPaths: ["lib/supervisor/"],
    category: "audit",
  });
  queue.create({
    id: "ctl-pending-high",
    prompt: validSupervisorTestPrompt("high priority pending"),
    reason: "seed high",
    priority: 10,
    allowedPaths: ["lib/research/replay/"],
    category: "audit",
  });
  return queue;
}

function testPauseSurvivesRestart() {
  console.log("\n1. PAUSE stops dispatch, survives restart");
  const root = tempRoot();
  seedQueue(root);

  cmdPause({ root, reason: "test pause" });
  assertQueueIntact(root);

  const afterPause = loadControlState(root);
  assert("mode paused", afterPause.mode === "paused");
  assert("no dispatch when paused", !shouldDispatchNewTasks(afterPause));

  const restarted = loadControlState(root);
  assert("pause survives restart", restarted.mode === "paused");

  const log = readExecutionLog(root);
  assert("PAUSE logged", log.some((e) => e.nextTaskReason?.includes("[INTERVENTION] PAUSE")));
  fs.rmSync(root, { recursive: true, force: true });
}

function testStopTerminatesRunning() {
  console.log("\n2. STOP terminates running (non-human), survives restart");
  const root = tempRoot();
  const queue = seedQueue(root);
  queue.markRunning("ctl-pending-high");
  queue.markRunning("ctl-pending-low");

  cmdStop({ root, reason: "test stop" });
  assertQueueIntact(root);

  const reloaded = createTaskQueue({ root });
  const high = reloaded.getTasks().find((t) => t.id === "ctl-pending-high");
  const low = reloaded.getTasks().find((t) => t.id === "ctl-pending-low");
  assert("running task blocked on stop", high?.status === "blocked");
  assert("second running task blocked", low?.status === "blocked");

  const control = loadControlState(root);
  assert("mode stopped", control.mode === "stopped");
  assert("terminate flag set", control.terminateRunningRequested === true);
  assert("stop survives restart", loadControlState(root).mode === "stopped");

  const log = readExecutionLog(root);
  assert("STOP logged", log.some((e) => e.nextTaskReason?.includes("[INTERVENTION] STOP")));
  fs.rmSync(root, { recursive: true, force: true });
}

function testStopPreservesHumanControlled() {
  console.log("\n3. STOP preserves human-controlled running tasks");
  const root = tempRoot();
  const queue = seedQueue(root);
  queue.markRunning("ctl-pending-high");
  const task = queue.getTasks().find((t) => t.id === "ctl-pending-high")!;
  task.humanControlled = true;
  queue.persist();

  cmdStop({ root, reason: "stop with human task" });
  const reloaded = createTaskQueue({ root });
  const human = reloaded.getTasks().find((t) => t.id === "ctl-pending-high");
  assert("human-controlled still running", human?.status === "running");
  assert("humanControlled flag kept", human?.humanControlled === true);
  fs.rmSync(root, { recursive: true, force: true });
}

function testResumeAutonomous() {
  console.log("\n4. RESUME returns to autonomous");
  const root = tempRoot();
  seedQueue(root);
  cmdPause({ root });
  const state = cmdResume({ root, reason: "test resume" });
  assert("mode autonomous", state.mode === "autonomous");
  assert("dispatch allowed", shouldDispatchNewTasks(state));
  assert("terminate flag cleared", state.terminateRunningRequested === false);

  const log = readExecutionLog(root);
  assert("RESUME logged", log.some((e) => e.nextTaskReason?.includes("[INTERVENTION] RESUME")));
  fs.rmSync(root, { recursive: true, force: true });
}

function testTakeoverNeverRedispatched() {
  console.log("\n5. TAKEOVER marks humanControlled, never redispatched");
  const root = tempRoot();
  seedQueue(root);
  cmdTakeover("ctl-pending-high", { root, reason: "human handling" });
  assertQueueIntact(root);

  const queue = createTaskQueue({ root });
  const task = queue.getTasks().find((t) => t.id === "ctl-pending-high");
  assert("humanControlled set", task?.humanControlled === true);

  const next = selectNextTask({ queue, consecutiveTestFailures: 0, consecutiveBuildFailures: 0 });
  assert("takeover task skipped", next.task?.id === "ctl-pending-low");

  const batch = selectParallelBatch(queue, { maxParallel: 3 });
  assert("parallel skips takeover", !batch.tasks.some((t) => t.task?.id === "ctl-pending-high"));

  const log = readExecutionLog(root);
  assert("TAKEOVER logged", log.some((e) => e.nextTaskReason?.includes("[INTERVENTION] TAKEOVER")));
  fs.rmSync(root, { recursive: true, force: true });
}

function testCancelPendingAndRunning() {
  console.log("\n6. CANCEL cancels with reason");
  const root = tempRoot();
  const queue = seedQueue(root);
  cmdCancel("ctl-pending-low", { root, reason: "not needed" });
  const pending = createTaskQueue({ root }).getTasks().find((t) => t.id === "ctl-pending-low");
  assert("pending cancelled blocked", pending?.status === "blocked");
  assert("cancelledByHuman set", pending?.cancelledByHuman === true);

  queue.markRunning("ctl-pending-high");
  cmdCancel("ctl-pending-high", { root, reason: "abort run" });
  const running = createTaskQueue({ root }).getTasks().find((t) => t.id === "ctl-pending-high");
  assert("running cancelled failed", running?.status === "failed");

  const log = readExecutionLog(root);
  assert("CANCEL logged", log.some((e) => e.nextTaskReason?.includes("[INTERVENTION] CANCEL")));
  assertQueueIntact(root);
  fs.rmSync(root, { recursive: true, force: true });
}

function testPriorityInjection() {
  console.log("\n7. PRIORITY injects highest priority task");
  const root = tempRoot();
  seedQueue(root);

  const id = cmdPriority(
    {
      prompt: validSupervisorTestPrompt("human priority injection"),
      reason: "urgent human task",
      priority: 0,
      allowedPaths: ["lib/supervisor/"],
      category: "diagnostic",
    },
    { root },
  );
  assertQueueIntact(root);

  const queue = createTaskQueue({ root });
  const created = queue.getTasks().find((t) => t.id === id);
  assert("priority task created", Boolean(created));
  assert("priority 0", created?.priority === 0);

  const next = queue.selectNextPending();
  assert("priority task selected first", next?.id === id);

  let rejected = false;
  try {
    cmdPriority(
      {
        prompt: "commit and push to main",
        reason: "bad task",
        priority: 0,
      },
      { root },
    );
  } catch (err) {
    rejected = err instanceof Error && err.message.includes("quality gate");
  }
  assert("quality gate rejects bad priority", rejected);

  const log = readExecutionLog(root);
  assert("PRIORITY logged", log.some((e) => e.nextTaskReason?.includes("[INTERVENTION] PRIORITY")));
  fs.rmSync(root, { recursive: true, force: true });
}

function testStatusReport() {
  console.log("\n8. STATUS returns expected fields");
  const root = tempRoot();
  const queue = seedQueue(root);
  queue.markRunning("ctl-pending-high");
  cmdPause({ root });

  const report = cmdStatus({ root });
  assert("has mode", report.mode === "paused");
  assert("has controlUpdatedAt", Boolean(report.controlUpdatedAt));
  assert("has running", report.running.some((t) => t.id === "ctl-pending-high"));
  assert("has pending", report.pending.length >= 1);
  assert("has humanControlled array", Array.isArray(report.humanControlled));
  assert("has activeAgents", Array.isArray(report.activeAgents));
  assert("has nextPlanned", Array.isArray(report.nextPlanned));
  fs.rmSync(root, { recursive: true, force: true });
}

async function testParallelRunnerRespectsPause() {
  console.log("\n9. parallel runner respects PAUSE (no new dispatch)");
  const root = tempRoot();
  const queue = createTaskQueue({ root, maxSize: 20 });
  queue.create({
    id: "par-a",
    prompt: validSupervisorTestPrompt("parallel A"),
    reason: "a",
    priority: 1,
    allowedPaths: ["lib/supervisor/"],
    category: "audit",
  });
  queue.create({
    id: "par-b",
    prompt: validSupervisorTestPrompt("parallel B"),
    reason: "b",
    priority: 2,
    allowedPaths: ["lib/research/replay/"],
    category: "audit",
  });
  cmdPause({ root, reason: "hold parallel" });

  const result = await runSupervisor({
    dryRun: true,
    autonomous: true,
    maxIterations: 2,
    maxParallel: 2,
    pollIntervalMs: 10,
    waitTimeoutMs: 100,
    projectRoot: process.cwd(),
    queueRoot: root,
    seedFromBacklog: false,
    skipNextTaskGeneration: true,
    transcriptRoot: path.join(root, "no-transcripts"),
  });

  assert("parallel loop stops under pause", result.stopReason === "manual_stop");
  assert("no tasks dispatched under pause", result.iterations === 0);
  assertQueueIntact(root);
  fs.rmSync(root, { recursive: true, force: true });
}

async function main() {
  console.log("=== Supervisor control tests ===");
  testPauseSurvivesRestart();
  testStopTerminatesRunning();
  testStopPreservesHumanControlled();
  testResumeAutonomous();
  testTakeoverNeverRedispatched();
  testCancelPendingAndRunning();
  testPriorityInjection();
  testStatusReport();
  await testParallelRunnerRespectsPause();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
