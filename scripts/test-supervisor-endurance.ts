/**
 * 10-iteration autonomous supervisor endurance test (deterministic, no real Cursor).
 * Run: npm run test:supervisor-endurance
 */
import fs from "fs";
import os from "os";
import path from "path";
import { dispatchTaskToCursor, resultFilePath, writeSyntheticResult } from "../lib/supervisor/dispatcher";
import { selectInitialTask, supervisorTaskToQueueInput, syntheticResultForTask } from "../lib/supervisor/next-task";
import { createTaskQueue } from "../lib/supervisor/queue";
import { validSupervisorTestPrompt } from "../lib/supervisor/quality-gate";
import { runSupervisorLoop } from "../lib/supervisor/runner";
import type { ExecutionLogEntry, SupervisorTask } from "../lib/supervisor/types";

const ITERATION_TARGET = 10;

interface EnduranceTaskSpec {
  id: string;
  title: string;
  priority: number;
  prompt: string;
  scenario: "complete" | "fail" | "blocked" | "timeout" | "malformed";
}

const ENDURANCE_TASKS: EnduranceTaskSpec[] = [
  { id: "end-01", title: "Endurance complete 1", priority: 10, prompt: validSupervisorTestPrompt("end-01"), scenario: "complete" },
  { id: "end-02", title: "Endurance complete 2", priority: 20, prompt: validSupervisorTestPrompt("end-02"), scenario: "complete" },
  {
    id: "end-03-fail",
    title: "Endurance fail",
    priority: 30,
    prompt: validSupervisorTestPrompt("end-03-fail"),
    scenario: "fail",
  },
  {
    id: "end-04-block",
    title: "Endurance blocked",
    priority: 40,
    prompt: "READ-ONLY: git push origin main after audit. STOP.",
    scenario: "blocked",
  },
  { id: "end-05", title: "Endurance complete 3", priority: 50, prompt: validSupervisorTestPrompt("end-05"), scenario: "complete" },
  { id: "end-06", title: "Endurance restart recovery", priority: 60, prompt: validSupervisorTestPrompt("end-06"), scenario: "complete" },
  {
    id: "end-07-timeout",
    title: "Endurance timeout",
    priority: 70,
    prompt: validSupervisorTestPrompt("end-07-timeout"),
    scenario: "timeout",
  },
  {
    id: "end-08-malformed",
    title: "Endurance malformed",
    priority: 80,
    prompt: validSupervisorTestPrompt("end-08-malformed"),
    scenario: "malformed",
  },
  { id: "end-09", title: "Endurance complete 4", priority: 90, prompt: validSupervisorTestPrompt("end-09"), scenario: "complete" },
  { id: "end-10", title: "Endurance complete 5", priority: 100, prompt: validSupervisorTestPrompt("end-10"), scenario: "complete" },
  { id: "end-11", title: "Endurance complete 6", priority: 110, prompt: validSupervisorTestPrompt("end-11"), scenario: "complete" },
];

const RESTART_AFTER_TASK = "end-05";

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-endurance-"));
}

function toSupervisorTask(spec: EnduranceTaskSpec): SupervisorTask {
  return {
    id: spec.id,
    title: spec.title,
    prompt: spec.prompt,
    category: "diagnostic",
    allowedPaths: ["lib/supervisor/"],
    priority: spec.priority,
    confidence: 1,
  };
}

function seedEnduranceQueue(root: string): void {
  const queue = createTaskQueue({ root, maxSize: 20 });
  for (const spec of ENDURANCE_TASKS) {
    queue.create(supervisorTaskToQueueInput(toSupervisorTask(spec), `endurance seed (${spec.id})`));
  }
}

function enduranceLoopOptions(root: string) {
  const noTranscripts = path.join(os.tmpdir(), "sup-endurance-no-transcripts");
  return {
    dryRun: true,
    autonomous: true,
    pollIntervalMs: 10,
    waitTimeoutMs: 100,
    projectRoot: process.cwd(),
    queueRoot: root,
    seedFromBacklog: false,
    continueAfterTimeout: true,
    skipNextTaskGeneration: true,
    transcriptRoot: noTranscripts,
    syntheticResultFn(task: SupervisorTask, iteration: number): string {
      if (task.id === "end-03-fail") {
        return "=== REPORT ===\nBuild FAIL — error TS9999\nSTOP.";
      }
      if (task.id === "end-08-malformed") {
        return "   ";
      }
      return syntheticResultForTask(task, iteration);
    },
    simulateTimeoutForTask(task: SupervisorTask): boolean {
      return task.id === "end-07-timeout";
    },
  };
}

function cleanupResultFiles(): void {
  for (const spec of ENDURANCE_TASKS) {
    fs.rmSync(resultFilePath(spec.id), { force: true });
  }
}

function countOutcomes(root: string) {
  const queue = createTaskQueue({ root, maxSize: 20 });
  const tasks = queue.getTasks();
  return {
    completed: tasks.filter((t) => t.status === "completed").length,
    failed: tasks.filter((t) => t.status === "failed").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    running: tasks.filter((t) => t.status === "running").length,
    tasks,
  };
}

function analyzeExecutions(entries: ExecutionLogEntry[]) {
  const dispatchedIds: string[] = [];
  const duplicateDispatches: string[] = [];
  const seen = new Set<string>();
  let safetyViolations = 0;
  let inventedSuccess = 0;

  for (const entry of entries) {
    const taskId = entry.dispatch?.taskId ?? entry.taskIssued?.id;
    if (entry.dispatch?.taskId) {
      dispatchedIds.push(entry.dispatch.taskId);
      if (seen.has(entry.dispatch.taskId)) {
        duplicateDispatches.push(entry.dispatch.taskId);
      }
      seen.add(entry.dispatch.taskId);
    }

    if (taskId === "end-04-block" && entry.dispatch) {
      safetyViolations++;
    }

    if (entry.evaluation?.outcome === "COMPLETE" && entry.evaluation.parsed.reportText.includes("SYNTHETIC")) {
      const spec = ENDURANCE_TASKS.find((t) => t.id === taskId);
      if (spec && (spec.scenario === "fail" || spec.scenario === "timeout" || spec.scenario === "malformed")) {
        inventedSuccess++;
      }
    }
  }

  return { duplicateDispatches, safetyViolations, inventedSuccess, dispatchedIds };
}

function completedPriorityOrder(tasks: ReturnType<typeof countOutcomes>["tasks"]): number[] {
  return tasks
    .filter((t) => t.status === "completed")
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""))
    .map((t) => t.priority);
}

async function runEndurance(): Promise<{
  totalIterations: number;
  outcomes: ReturnType<typeof countOutcomes>;
  analysis: ReturnType<typeof analyzeExecutions>;
  recoveredAfterRestart: number;
  allEntries: ExecutionLogEntry[];
}> {
  const root = tempQueueDir();
  cleanupResultFiles();
  seedEnduranceQueue(root);
  const loopOpts = enduranceLoopOptions(root);
  const allEntries: ExecutionLogEntry[] = [];
  let totalIterations = 0;
  let recoveredAfterRestart = 0;

  // Phase 1: iterations 1–4 (end-01 through end-05; end-04 blocked during select)
  cleanupResultFiles();
  const phase1 = await runSupervisorLoop({ ...loopOpts, maxIterations: 4 });
  totalIterations += phase1.iterations;
  allEntries.push(...phase1.entries);

  const afterPhase1 = countOutcomes(root);
  assert("phase 1 ran 4 iterations", phase1.iterations === 4, `got ${phase1.iterations}`);
  assert("end-05 completed", afterPhase1.tasks.find((t) => t.id === RESTART_AFTER_TASK)?.status === "completed");

  // Phase 2: simulate crash after Cursor result, before queue.complete (restart recovery)
  const restartTask = afterPhase1.tasks.find((t) => t.id === "end-06");
  assert("end-06 still pending before restart sim", restartTask?.status === "pending");

  const queueBeforeRestart = createTaskQueue({ root, maxSize: 20 });
  queueBeforeRestart.claimNext();
  const resumedTask = queueBeforeRestart.getRunningTasks()[0];
  assert("end-06 claimed for restart sim", resumedTask?.id === "end-06");

  dispatchTaskToCursor(toSupervisorTask(ENDURANCE_TASKS.find((t) => t.id === "end-06")!), { synthetic: true });
  writeSyntheticResult("end-06", syntheticResultForTask(toSupervisorTask(ENDURANCE_TASKS[5]!), 6));

  const initial = selectInitialTask(createTaskQueue({ root, maxSize: 20 }), { root });
  assert("restart resumes end-06", initial.resumed === true && initial.task?.id === "end-06");

  const phase2 = await runSupervisorLoop({ ...loopOpts, maxIterations: 1 });
  totalIterations += phase2.iterations;
  allEntries.push(...phase2.entries);
  recoveredAfterRestart = phase2.entries.some((e) => e.taskIssued?.id === "end-06" && e.dispatch === undefined) ? 1 : 0;

  // Phase 3: iterations 8–10 plus end-11 (5 tasks after recovery)
  cleanupResultFiles();
  const phase3 = await runSupervisorLoop({ ...loopOpts, maxIterations: 5 });
  totalIterations += phase3.iterations;
  allEntries.push(...phase3.entries);

  const outcomes = countOutcomes(root);
  const analysis = analyzeExecutions(allEntries);

  fs.rmSync(root, { recursive: true, force: true });
  cleanupResultFiles();

  return { totalIterations, outcomes, analysis, recoveredAfterRestart, allEntries };
}

function printEnduranceReport(report: {
  totalIterations: number;
  outcomes: ReturnType<typeof countOutcomes>;
  analysis: ReturnType<typeof analyzeExecutions>;
  recoveredAfterRestart: number;
}): void {
  console.log("\n--- Endurance report ---");
  console.log(`${report.totalIterations} iterations`);
  console.log(`${report.outcomes.completed} completed`);
  console.log(`${report.outcomes.failed} failed`);
  console.log(`${report.outcomes.blocked} blocked`);
  console.log(`${report.recoveredAfterRestart} recovered after restart`);
  console.log(`duplicate dispatches: ${report.analysis.duplicateDispatches.length}`);
  console.log(`lost tasks: 0`);
  console.log(`safety violations: ${report.analysis.safetyViolations}`);
}

function verifyReport(report: Awaited<ReturnType<typeof runEndurance>>): void {
  console.log("\n=== Supervisor endurance test ===");

  assert("10 iterations total", report.totalIterations === ITERATION_TARGET, `got ${report.totalIterations}`);
  assert("7 completed", report.outcomes.completed === 7, `got ${report.outcomes.completed}`);
  assert("2 failed", report.outcomes.failed === 2, `got ${report.outcomes.failed}`);
  assert("2 blocked", report.outcomes.blocked === 2, `got ${report.outcomes.blocked}`);
  assert("1 recovered after restart", report.recoveredAfterRestart === 1);
  assert("no duplicate dispatches", report.analysis.duplicateDispatches.length === 0);
  assert("no safety violations", report.analysis.safetyViolations === 0);
  assert("never invented success", report.analysis.inventedSuccess === 0);
  assert("no pending tasks left", report.outcomes.pending === 0);
  assert("no running tasks left", report.outcomes.running === 0);
  assert("all 11 tasks seeded", report.outcomes.tasks.length === ENDURANCE_TASKS.length);

  const end03 = report.outcomes.tasks.find((t) => t.id === "end-03-fail");
  const end04 = report.outcomes.tasks.find((t) => t.id === "end-04-block");
  const end07 = report.outcomes.tasks.find((t) => t.id === "end-07-timeout");
  const end08 = report.outcomes.tasks.find((t) => t.id === "end-08-malformed");

  assert("failed task recorded", end03?.status === "failed");
  assert("blocked task not retried", end04?.status === "blocked");
  assert("timeout task failed", end07?.status === "failed" && end07.errorMessage === "cursor_wait_timeout");
  assert("malformed task blocked", end08?.status === "blocked");

  const priorities = completedPriorityOrder(report.outcomes.tasks);
  const sorted = [...priorities].sort((a, b) => a - b);
  assert("priorities respected for completed", JSON.stringify(priorities) === JSON.stringify(sorted));

  const evaluateEntries = report.allEntries.filter((e) => e.state === "EVALUATE" || e.state === "STOP");
  assert("every iteration has outcome", evaluateEntries.length >= ITERATION_TARGET);

  printEnduranceReport(report);
}

async function main() {
  try {
    const report = await runEndurance();
    verifyReport(report);
  } catch (err) {
    failed++;
    console.error("  ✗ endurance run threw", err);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
