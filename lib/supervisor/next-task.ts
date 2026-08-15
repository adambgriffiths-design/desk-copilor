import fs from "fs";
import path from "path";
import { ResearchMemory, shouldSkipTaskFromMemory } from "./memory";
import { SUPERVISOR_DATA_ROOT } from "./paths";
import { QueueFullError, type TaskQueue } from "./queue";
import type {
  CreateQueueTaskInput,
  EvaluationResult,
  NextTaskSelection,
  QueueTask,
  StopReason,
  SupervisorTask,
  WatchdogOptions,
} from "./types";
import { isTaskAutoAllowed, shouldStopBeforeDispatch } from "./safety";
import { reconcileStaleRunningTasks } from "./crash-recovery";
import { assessTaskQuality, qualityGateBlockMessage } from "./quality-gate";
import { checkAndBlockTimedOutTasks } from "./watchdog";

const DEFAULT_BACKLOG: SupervisorTask[] = [
  {
    id: "diag-research-replay",
    title: "Run research replay diagnostics",
    prompt:
      "READ-ONLY: Run `npm run test:research-replay` and report pass/fail counts. Do not modify code. STOP after report.",
    category: "diagnostic",
    verifyScript: "test:research-replay",
    allowedPaths: [],
    priority: 10,
    confidence: 0.95,
  },
  {
    id: "audit-supervisor-health",
    title: "Supervisor self-health audit",
    prompt:
      "READ-ONLY: Inspect lib/supervisor/ and data/supervisor/ — list files, confirm executions.jsonl append works. No code changes unless test failure. STOP.",
    category: "audit",
    allowedPaths: ["lib/supervisor/", "data/supervisor/"],
    priority: 20,
    confidence: 0.9,
  },
  {
    id: "research-replay-record-check",
    title: "Verify replay record CLI",
    prompt:
      "READ-ONLY: Run `npm run test:research-replay-record` if script exists, else verify research:replay-record CLI. Report only. STOP.",
    category: "diagnostic",
    verifyScript: "test:research-replay-record",
    allowedPaths: [],
    priority: 30,
    confidence: 0.85,
  },
  {
    id: "docs-supervisor-readme",
    title: "Document supervisor limitations",
    prompt:
      "Update data/supervisor/README.md with detection limitations and file-based dispatch workflow. Only touch data/supervisor/README.md. STOP.",
    category: "docs",
    allowedPaths: ["data/supervisor/README.md"],
    priority: 40,
    confidence: 0.8,
  },
];

/** Built-in seed tasks used when backlog.json is missing (fresh workspace). */
export function getDefaultBacklogTasks(): SupervisorTask[] {
  return [...DEFAULT_BACKLOG];
}

function backlogPath(dataRoot: string = SUPERVISOR_DATA_ROOT): string {
  return path.join(dataRoot, "backlog.json");
}

/**
 * Load backlog.json for seed/import only — not used for runtime task selection.
 * - Missing file → built-in DEFAULT_BACKLOG (fresh workspace convenience).
 * - Explicit `{ "tasks": [] }` → no tasks (empty backlog means empty).
 */
export function loadBacklog(dataRoot: string = SUPERVISOR_DATA_ROOT): SupervisorTask[] {
  const filePath = backlogPath(dataRoot);
  if (!fs.existsSync(filePath)) return getDefaultBacklogTasks();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { tasks?: SupervisorTask[] };
    if (raw.tasks === undefined) return getDefaultBacklogTasks();
    return raw.tasks;
  } catch {
    return getDefaultBacklogTasks();
  }
}

export function queueTaskToSupervisorTask(q: QueueTask): SupervisorTask {
  return {
    id: q.id,
    title: q.title ?? q.reason.slice(0, 80),
    prompt: q.prompt,
    category: q.category ?? "diagnostic",
    verifyScript: q.verifyScript,
    allowedPaths: q.allowedPaths,
    dependsOn: q.dependsOn,
    priority: q.priority,
    confidence: q.confidence ?? 0.8,
  };
}

export function supervisorTaskToQueueInput(task: SupervisorTask, reason: string): CreateQueueTaskInput {
  return {
    id: task.id,
    prompt: task.prompt,
    reason,
    priority: task.priority,
    title: task.title,
    category: task.category,
    verifyScript: task.verifyScript,
    allowedPaths: task.allowedPaths,
    confidence: task.confidence,
    dependsOn: task.dependsOn,
  };
}

/** Import backlog tasks into queue.json (skip ids already present). Returns count seeded. */
export function seedQueueFromBacklog(queue: TaskQueue, backlog = loadBacklog()): number {
  const existingIds = new Set(queue.getTasks().map((t) => t.id));
  let seeded = 0;
  for (const task of [...backlog].sort((a, b) => a.priority - b.priority)) {
    if (existingIds.has(task.id)) continue;
    try {
      queue.create(supervisorTaskToQueueInput(task, `backlog seed (${task.id})`));
      seeded++;
    } catch (err) {
      if (err instanceof QueueFullError) break;
      throw err;
    }
  }
  return seeded;
}

function stopReasonWhenQueueEmpty(options: {
  consecutiveTestFailures: number;
  consecutiveBuildFailures: number;
  lastGenerationStopReason?: StopReason;
}): StopReason {
  if (options.lastGenerationStopReason === "no_next_task") return "no_next_task";
  if (options.consecutiveTestFailures >= 2) return "repeated_test_failures";
  if (options.consecutiveBuildFailures >= 2) return "repeated_build_failures";
  return "low_confidence_next_task";
}

/** Claim next pending queue task (single source of truth). Blocks unsafe tasks and retries. */
export function selectNextTask(options: {
  queue: TaskQueue;
  lastEvaluation?: EvaluationResult;
  consecutiveTestFailures: number;
  consecutiveBuildFailures: number;
  memory?: ResearchMemory;
  lastGenerationStopReason?: StopReason;
}): NextTaskSelection {
  const memory = options.memory ?? new ResearchMemory({ root: options.queue.root });

  while (true) {
    const claimed = options.queue.claimNext();
    if (!claimed) {
      const stopReason = stopReasonWhenQueueEmpty(options);
      return {
        task: null,
        reason: stopReason === "no_next_task" ? "NO_NEXT_TASK — queue empty after generation" : "No pending queue tasks",
        confidence: 0,
        stopped: true,
        stopReason,
      };
    }

    const task = queueTaskToSupervisorTask(claimed);
    const memorySkip = shouldSkipTaskFromMemory(task, memory.load());
    if (memorySkip.skip) {
      options.queue.complete(claimed.id);
      memory.recordTask(task, "completed", { summary: memorySkip.reason });
      continue;
    }

    const preStop = shouldStopBeforeDispatch(task);
    const quality = assessTaskQuality(task, {
      existingTasks: options.queue.getTasks().map((t) => ({ id: t.id, prompt: t.prompt })),
    });
    if (!quality.passed && quality.rejection) {
      options.queue.block(claimed.id, qualityGateBlockMessage(quality.rejection));
      memory.recordTask(task, "blocked", { stopReason: "task_quality_failed" });
      continue;
    }

    if (preStop) {
      options.queue.block(claimed.id, preStop);
      memory.recordTask(task, "blocked", { stopReason: preStop });
      continue;
    }
    if (!isTaskAutoAllowed(task)) {
      options.queue.block(claimed.id, "unsafe_task_scope");
      memory.recordTask(task, "blocked", { stopReason: "unsafe_task_scope" });
      continue;
    }

    return {
      task,
      reason: claimed.reason,
      confidence: task.confidence,
      stopped: false,
      queueTaskId: claimed.id,
    };
  }
}

/** Resume a running queue task after restart, or claim the next pending task. */
export function selectInitialTask(
  queue: TaskQueue,
  options?: WatchdogOptions & { memory?: ResearchMemory },
): NextTaskSelection {
  checkAndBlockTimedOutTasks(queue, { ...options, root: options?.root ?? queue.root });

  const memory = options?.memory ?? new ResearchMemory({ root: queue.root });
  reconcileStaleRunningTasks(queue);
  const running = queue
    .getRunningTasks()
    .filter((t) => !t.humanControlled)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (running.length > 0) {
    const q = running[0]!;
    const task = queueTaskToSupervisorTask(q);
    return {
      task,
      reason: "Resume running queue task after restart",
      confidence: task.confidence,
      stopped: false,
      queueTaskId: q.id,
      resumed: true,
    };
  }

  return selectNextTask({
    queue,
    consecutiveTestFailures: 0,
    consecutiveBuildFailures: 0,
    memory,
  });
}

export function getNextTaskDocumentation(): string {
  return [
    "## Next-task generation (result-driven + persistent queue)",
    "1. After each task: generateAndEnqueueNextTask() reads result report + evaluation",
    "2. Priority: fix failure → follow-up → verify → validation → reliability → backlog",
    "3. Memory dedupe + quality gate before queue.create() as PENDING",
    "4. claimNext() on queue.json — lowest priority number first",
    "5. NO_NEXT_TASK when generator finds no useful work and queue is empty",
    "Note: backlog.json seeds queue on startup only — not selection authority.",
  ].join("\n");
}

export function syntheticDryRunTasks(): SupervisorTask[] {
  return [
    {
      id: "dry-1-diagnostic",
      title: "[DRY] Research replay diagnostic",
      prompt: "[SYNTHETIC] Run research replay tests",
      category: "diagnostic",
      verifyScript: "test:research-replay",
      allowedPaths: [],
      priority: 1,
      confidence: 1,
    },
    {
      id: "dry-2-audit",
      title: "[DRY] Supervisor audit",
      prompt: "[SYNTHETIC] Audit supervisor state",
      category: "audit",
      allowedPaths: ["lib/supervisor/"],
      priority: 2,
      confidence: 1,
    },
    {
      id: "dry-3-docs",
      title: "[DRY] Update supervisor docs",
      prompt: "[SYNTHETIC] Document supervisor",
      category: "docs",
      allowedPaths: ["data/supervisor/README.md"],
      priority: 3,
      confidence: 1,
    },
  ];
}

export function seedSyntheticDryRunTasks(queue: TaskQueue): void {
  for (const task of syntheticDryRunTasks()) {
    if (queue.hasTask(task.id)) continue;
    queue.create(supervisorTaskToQueueInput(task, "synthetic dry-run"));
  }
}

export function syntheticResultForTask(task: SupervisorTask, iteration: number): string {
  return [
    `=== SYNTHETIC REPORT (iteration ${iteration}) ===`,
    `Task: ${task.title}`,
    "Status: COMPLETE",
    "Tests: PASS (synthetic — no Cursor agent invoked)",
    "Build: PASS (synthetic)",
    "STOP.",
  ].join("\n");
}
