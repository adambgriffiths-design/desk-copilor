/**
 * Supervisor tests — prototype detection + autonomous loop + queue dispatch
 * Run: npm run test:supervisor
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  detectFromTranscriptLines,
  detectCursorCompletion,
  detectLiveAutonomousCompletion,
  inferOutcomeFromText,
  parseCursorResult,
  parseMalformedResult,
  parseTranscriptLine,
  mapTurnStatus,
  SYNTHETIC_COMPLETE,
  SYNTHETIC_ERROR,
  SYNTHETIC_WAITING,
  SYNTHETIC_UNKNOWN,
  SYNTHETIC_EMPTY,
  SupervisorStateMachine,
  TRANSITIONS,
  assessSafety,
  isTaskAutoAllowed,
  shouldStopBeforeDispatch,
  selectNextTask,
  selectInitialTask,
  seedQueueFromBacklog,
  getDefaultBacklogTasks,
  loadBacklog,
  supervisorTaskToQueueInput,
  syntheticDryRunTasks,
  runSupervisorLoop,
  captureGitSnapshot,
  createTaskQueue,
  dispatchTaskToCursor,
  ensureSupervisorDataRoot,
  runQualityGateTests,
  validSupervisorTestPrompt,
  SUPERVISOR_EXECUTIONS_LOG,
  SUPERVISOR_INBOX_DIR,
} from "../lib/supervisor";
import { runCrashRecoveryLoopTests } from "../lib/supervisor/crash-recovery-tests";
import { runNextTaskGeneratorTests } from "../lib/supervisor/next-task-generator.test";
import type { SupervisorTask } from "../lib/supervisor/types";

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-test-"));
}

function testPrototypeDetection() {
  console.log("\n1. prototype transcript detection");
  const complete = detectFromTranscriptLines(SYNTHETIC_COMPLETE.lines, "synthetic/complete.jsonl");
  assert("COMPLETE", complete.status === "COMPLETE");
  const err = detectFromTranscriptLines(SYNTHETIC_ERROR.lines, "synthetic/error.jsonl");
  assert("ERROR", err.status === "ERROR");
  const waiting = detectFromTranscriptLines(SYNTHETIC_WAITING.lines, "synthetic/waiting.jsonl", {
    allowWaiting: true,
  });
  assert("WAITING", waiting.status === "WAITING");
  const unknown = detectFromTranscriptLines(SYNTHETIC_UNKNOWN.lines, "synthetic/unknown.jsonl");
  assert("UNKNOWN malformed", unknown.status === "UNKNOWN");
  const empty = detectFromTranscriptLines(SYNTHETIC_EMPTY.lines, "synthetic/empty.jsonl");
  assert("UNKNOWN empty", empty.status === "UNKNOWN");
  assert("turn_ended parser", parseTranscriptLine('{"type":"turn_ended","status":"success"}').kind === "turn_ended");
  assert("mapTurnStatus success", mapTurnStatus("success") === "COMPLETE");
}

function testStateMachineTransitions() {
  console.log("\n2. state machine transitions");
  const sm = new SupervisorStateMachine();
  assert("starts IDLE", sm.state === "IDLE");
  sm.transition("DISPATCH");
  sm.transition("WAIT");
  sm.transition("EVALUATE");
  sm.transition("SELECT_NEXT");
  assert("reaches SELECT_NEXT", sm.state === "SELECT_NEXT");
  sm.transition("DISPATCH");
  sm.transition("STOP");
  assert("terminal STOP", sm.isTerminal());
  let threw = false;
  try {
    new SupervisorStateMachine().transition("EVALUATE");
  } catch {
    threw = true;
  }
  assert("invalid transition throws", threw);
  assert("STOP has no outgoing", TRANSITIONS.STOP.length === 0);
}

function testResultParser() {
  console.log("\n3. result parser outcomes");
  assert("COMPLETE", parseCursorResult("=== REPORT ===\nAll tests PASS\nSTOP.", "UNKNOWN").outcome === "COMPLETE");
  assert("ERROR", parseCursorResult("Build FAIL — error TS2345", "UNKNOWN").outcome === "ERROR");
  assert(
    "WAITING",
    parseCursorResult("Waiting for your approval before proceeding.", "COMPLETE").outcome === "WAITING",
  );
  assert("UNKNOWN empty", parseMalformedResult("").outcome === "UNKNOWN");
}

function testCompletionAdapter() {
  console.log("\n4. completion adapter");
  assert("infer COMPLETE", inferOutcomeFromText("Report: all PASS") === "COMPLETE");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sup-detect-"));
  const resultPath = path.join(tmp, "task.md");
  fs.writeFileSync(resultPath, "=== DONE ===\nPASS", "utf8");
  const det = detectCursorCompletion({ dispatchedAtMs: Date.now(), taskId: "t1", resultFilePath: resultPath });
  assert("outbox result detection", det.detected && det.method === "outbox_result");
  const staleMs = Date.now() - 60_000;
  fs.utimesSync(resultPath, staleMs / 1000, staleMs / 1000);
  const staleDet = detectCursorCompletion({
    dispatchedAtMs: Date.now(),
    taskId: "t1",
    resultFilePath: resultPath,
    transcriptRoot: tmp,
  });
  assert("ignores stale outbox result", !staleDet.detected || staleDet.method !== "outbox_result");
  fs.rmSync(tmp, { recursive: true, force: true });
}

function testLiveAutonomousIgnoresTranscript() {
  console.log("\n4b. live autonomous ignores unrelated transcript");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sup-live-"));
  const transcriptDir = path.join(tmp, "agent-transcripts");
  fs.mkdirSync(transcriptDir, { recursive: true });
  const transcriptPath = path.join(transcriptDir, "session.jsonl");
  const dispatchedAtMs = Date.now();
  const lines = [
    JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "prep report" }] } }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "## Final Readiness Report\nLIVE PILOT READY: YES\nAll tests PASS. STOP." }] },
    }),
    JSON.stringify({ type: "turn_ended", status: "success" }),
  ];
  fs.writeFileSync(transcriptPath, `${lines.join("\n")}\n`, "utf8");

  const liveDet = detectLiveAutonomousCompletion({
    dispatchedAtMs,
    taskId: "pilot-diag-research-replay",
    resultFilePath: path.join(tmp, "missing-result.md"),
  });
  assert("live mode not detected without result file", !liveDet.detected);
  assert("live mode stays WAITING", liveDet.rawStatus === "WAITING");
  assert("live mode method none", liveDet.method === "none");

  const diagDet = detectCursorCompletion({
    baseline: { rootTranscriptPath: transcriptPath, lineCount: 0, mtimeMs: Date.now() },
    dispatchedAtMs,
    taskId: "pilot-diag-research-replay",
    resultFilePath: path.join(tmp, "missing-result.md"),
    transcriptRoot: transcriptDir,
  });
  assert("diagnostic transcript still detectable", diagDet.detected && diagDet.rawStatus === "COMPLETE");

  fs.rmSync(tmp, { recursive: true, force: true });
}

function testEmptyBacklogExplicit() {
  console.log("\n4c. empty backlog.json means no tasks");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sup-backlog-"));
  fs.writeFileSync(path.join(tmp, "backlog.json"), JSON.stringify({ tasks: [] }), "utf8");
  assert("explicit empty backlog", loadBacklog(tmp).length === 0);
  assert("missing file uses default seed", loadBacklog(path.join(tmp, "no-backlog-dir")).length === getDefaultBacklogTasks().length);
  fs.rmSync(tmp, { recursive: true, force: true });
}

function testStopConditions() {
  console.log("\n5. stop conditions");
  const safeTask: SupervisorTask = {
    id: "t",
    title: "diag",
    prompt: "read-only audit",
    category: "diagnostic",
    allowedPaths: [],
    priority: 1,
    confidence: 1,
  };
  assert("diagnostic auto-allowed", isTaskAutoAllowed(safeTask));
  assert(
    "research dataset paths auto-allowed",
    isTaskAutoAllowed({
      ...safeTask,
      category: "experiment",
      allowedPaths: [
        "lib/research/",
        "scripts/",
        "data/research/",
        "data/research-fixtures/",
        "data/supervisor/results/",
      ],
    }),
  );
  assert(
    "deployment stop",
    shouldStopBeforeDispatch({ ...safeTask, prompt: "deploy to production with vercel --prod" }) ===
      "deployment_proposed",
  );
  assert(
    "git push stop",
    shouldStopBeforeDispatch({ ...safeTask, prompt: "git push origin main" }) === "git_push_proposed",
  );
  assert(
    "credentials stop",
    shouldStopBeforeDispatch({ ...safeTask, prompt: "read .env API_KEY" }) === "credentials_or_secrets",
  );
  assert(
    "env-var name in STOP instruction is not credentials stop",
    shouldStopBeforeDispatch({
      ...safeTask,
      prompt: "Load NQ via existing tooling. STOP if TICKSTREAM_API_KEY missing.",
    }) === undefined,
  );
  const safety = assessSafety({
    task: safeTask,
    parsed: parseCursorResult("please confirm which option", "COMPLETE"),
    git: captureGitSnapshot(),
    build: { ran: false, passed: true, output: "", durationMs: 0 },
    consecutiveTestFailures: 2,
    consecutiveBuildFailures: 2,
  });
  assert("human input stop", safety.stopReasons.includes("human_input_required"));
  assert("repeated failures", safety.stopReasons.includes("repeated_test_failures"));
}

function testTaskSelection() {
  console.log("\n6. task selection rules (queue-backed)");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 50 });
  seedQueueFromBacklog(queue, getDefaultBacklogTasks());

  const first = selectNextTask({
    queue,
    consecutiveTestFailures: 0,
    consecutiveBuildFailures: 0,
  });
  assert("claims first task", first.task !== null && first.queueTaskId !== undefined);
  assert("first is running", queue.getRunningTasks().some((t) => t.id === first.queueTaskId));
  queue.complete(first.queueTaskId!);

  const next = selectNextTask({
    queue,
    consecutiveTestFailures: 0,
    consecutiveBuildFailures: 0,
  });
  assert("skips completed id", next.task?.id !== first.task?.id);

  while (queue.selectNextPending()) {
    const sel = selectNextTask({ queue, consecutiveTestFailures: 0, consecutiveBuildFailures: 0 });
    if (!sel.task) break;
    queue.complete(sel.queueTaskId!);
  }

  const exhausted = selectNextTask({
    queue,
    consecutiveTestFailures: 0,
    consecutiveBuildFailures: 0,
  });
  assert("stops when queue empty", exhausted.stopped);
  fs.rmSync(root, { recursive: true, force: true });
}

function testQueuePriorityOrdering() {
  console.log("\n7. queue priority ordering in selectNextTask");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  queue.create({ prompt: validSupervisorTestPrompt("low"), reason: "r", priority: 30, title: "Run low check", category: "diagnostic", allowedPaths: [] });
  queue.create({ prompt: validSupervisorTestPrompt("high"), reason: "r", priority: 5, title: "Run high check", category: "diagnostic", allowedPaths: [] });
  queue.create({ prompt: validSupervisorTestPrompt("mid"), reason: "r", priority: 15, title: "Run mid check", category: "diagnostic", allowedPaths: [] });

  const sel = selectNextTask({ queue, consecutiveTestFailures: 0, consecutiveBuildFailures: 0 });
  assert("picks highest priority", sel.task?.title === "Run high check");
  fs.rmSync(root, { recursive: true, force: true });
}

function testCannotDispatchTwice() {
  console.log("\n8. cannot dispatch same task twice");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  queue.create({
    prompt: validSupervisorTestPrompt("once"),
    reason: "r",
    priority: 1,
    id: "once-only",
    title: "Run once check",
    category: "diagnostic",
    allowedPaths: [],
  });

  const first = queue.claimNext();
  assert("first claim succeeds", first?.id === "once-only");
  const second = queue.claimNext();
  assert("second claim empty", second === null);
  assert("still running not pending", queue.selectNextPending() === null);

  const reloaded = createTaskQueue({ root, maxSize: 5 });
  assert("reload preserves running", reloaded.getRunningTasks()[0]?.id === "once-only");
  assert("reload cannot re-claim", reloaded.claimNext() === null);
  fs.rmSync(root, { recursive: true, force: true });
}

function testRestartWhileRunning() {
  console.log("\n10. restart while running resumes without re-claim");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  queue.create({
    prompt: validSupervisorTestPrompt("resume"),
    reason: "r",
    priority: 1,
    id: "running-task",
    title: "Run resume check",
    category: "diagnostic",
    allowedPaths: [],
  });
  queue.claimNext();

  const reloaded = createTaskQueue({ root, maxSize: 5 });
  const initial = selectInitialTask(reloaded);
  assert("resumes running task", initial.resumed === true);
  assert("same task id", initial.task?.id === "running-task");
  assert("no duplicate running", reloaded.getRunningTasks().length === 1);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testPendingToDispatched() {
  console.log("\n11. pending → selected → dispatched");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  queue.create({
    prompt: validSupervisorTestPrompt("dispatch"),
    reason: "integration",
    priority: 1,
    id: "dispatch-test",
    title: "Run dispatch check",
    category: "diagnostic",
    allowedPaths: [],
  });

  const sel = selectNextTask({ queue, consecutiveTestFailures: 0, consecutiveBuildFailures: 0 });
  assert("selected from queue", sel.task?.id === "dispatch-test");
  assert("marked running", queue.getRunningTasks()[0]?.status === "running");

  const { dispatched } = dispatchTaskToCursor(sel.task!);
  assert("inbox written", fs.existsSync(path.join(SUPERVISOR_INBOX_DIR, "dispatch-test.json")));
  assert("outbox path set", fs.existsSync(dispatched.outboxPath));

  fs.rmSync(path.join(SUPERVISOR_INBOX_DIR, "dispatch-test.json"), { force: true });
  fs.rmSync(dispatched.outboxPath, { force: true });
  fs.rmSync(root, { recursive: true, force: true });
}

async function testCompletionUpdatesQueue() {
  console.log("\n12. completion updates queue via dry-run loop");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  for (const t of syntheticDryRunTasks()) {
    queue.create(supervisorTaskToQueueInput(t, "dry"));
  }

  const result = await runSupervisorLoop({
    dryRun: true,
    autonomous: true,
    maxIterations: 1,
    pollIntervalMs: 10,
    waitTimeoutMs: 100,
    projectRoot: process.cwd(),
    queueRoot: root,
  });

  assert("ran one iteration", result.iterations === 1);
  const reloaded = createTaskQueue({ root, maxSize: 10 });
  const completed = reloaded.getHistory().filter((t) => t.status === "completed");
  assert("one task completed", completed.length === 1);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testFailureUpdatesQueue() {
  console.log("\n13. failure updates queue on ERROR evaluation");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 5 });
  const task = queue.create({
    prompt: "READ-ONLY: Report build FAIL for test. STOP.",
    reason: "r",
    priority: 1,
    id: "fail-test",
    title: "Fail test",
    category: "diagnostic",
    allowedPaths: [],
  });
  queue.claimNext();

  const { writeSyntheticResult, resultFilePath } = await import("../lib/supervisor/dispatcher");
  writeSyntheticResult(task.id, "Build FAIL — error TS9999");

  const result = await runSupervisorLoop({
    dryRun: false,
    autonomous: true,
    maxIterations: 1,
    pollIntervalMs: 10,
    waitTimeoutMs: 500,
    projectRoot: process.cwd(),
    queueRoot: root,
    seedFromBacklog: false,
  });

  const reloaded = createTaskQueue({ root, maxSize: 5 });
  const failed = reloaded.getTasks().find((t) => t.id === "fail-test");
  assert("task marked failed", failed?.status === "failed");
  assert("loop stopped", result.stopped);
  fs.rmSync(resultFilePath(task.id), { force: true });
  fs.rmSync(root, { recursive: true, force: true });
}

async function testEmptyQueue() {
  console.log("\n14. empty queue stops immediately");
  const root = tempQueueDir();
  const result = await runSupervisorLoop({
    dryRun: false,
    autonomous: true,
    maxIterations: 3,
    pollIntervalMs: 10,
    waitTimeoutMs: 100,
    projectRoot: process.cwd(),
    queueRoot: root,
    seedFromBacklog: false,
  });
  assert("zero iterations on empty queue", result.iterations === 0);
  assert("stopped with low confidence", result.stopReason === "low_confidence_next_task");
  fs.rmSync(root, { recursive: true, force: true });
}

async function testDryRunThreeIterations() {
  console.log("\n9. dry-run 3 simulated iterations");
  ensureSupervisorDataRoot();
  const beforeSize = fs.existsSync(SUPERVISOR_EXECUTIONS_LOG) ? fs.statSync(SUPERVISOR_EXECUTIONS_LOG).size : 0;
  const result = await runSupervisorLoop({
    dryRun: true,
    autonomous: true,
    maxIterations: 3,
    pollIntervalMs: 10,
    waitTimeoutMs: 100,
    projectRoot: process.cwd(),
  });
  assert("ran 3 iterations", result.iterations === 3);
  assert("max iterations stop", result.stopReason === "max_iterations_reached");
  assert("has evaluate entries", result.entries.some((e) => e.state === "EVALUATE"));
  assert("synthetic tasks", syntheticDryRunTasks().length === 3);
  const afterSize = fs.existsSync(SUPERVISOR_EXECUTIONS_LOG) ? fs.statSync(SUPERVISOR_EXECUTIONS_LOG).size : 0;
  assert("executions.jsonl appended", afterSize > beforeSize);
}

async function testMaxIterations() {
  console.log("\n15. max iterations limit");
  const result = await runSupervisorLoop({
    dryRun: true,
    autonomous: true,
    maxIterations: 1,
    pollIntervalMs: 10,
    waitTimeoutMs: 100,
    projectRoot: process.cwd(),
  });
  assert("respects max=1", result.iterations === 1);
}

function testGitCapture() {
  console.log("\n16. git snapshot capture");
  const git = captureGitSnapshot(process.cwd());
  assert("branch present", git.branch.length > 0);
  assert("status summary present", git.statusSummary.length > 0);
}

async function main() {
  console.log("=== Supervisor tests ===");
  testPrototypeDetection();
  testStateMachineTransitions();
  testResultParser();
  testCompletionAdapter();
  testLiveAutonomousIgnoresTranscript();
  testEmptyBacklogExplicit();
  testStopConditions();
  testTaskSelection();
  testQueuePriorityOrdering();
  testCannotDispatchTwice();
  testRestartWhileRunning();
  await testPendingToDispatched();
  await testCompletionUpdatesQueue();
  await testFailureUpdatesQueue();
  await testEmptyQueue();
  await testDryRunThreeIterations();
  await testMaxIterations();
  testGitCapture();
  runQualityGateTests(assert);
  await runNextTaskGeneratorTests(assert);
  await runCrashRecoveryLoopTests({ assert, tempQueueDir });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
