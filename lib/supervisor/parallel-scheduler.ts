/**
 * Multi-task parallel scheduling — select independent tasks safe to run concurrently.
 */
import { ResearchMemory, shouldSkipTaskFromMemory } from "./memory";
import { assessTaskQuality, qualityGateBlockMessage } from "./quality-gate";
import type { TaskQueue } from "./queue";
import { isTaskAutoAllowed, shouldStopBeforeDispatch } from "./safety";
import { queueTaskToSupervisorTask, selectNextTask } from "./next-task";
import type { NextTaskSelection, QueueTask, SupervisorTask } from "./types";

export const DEFAULT_MAX_PARALLEL = 4;

/** Categories safe to parallelize when scopes are disjoint. */
const PARALLEL_FRIENDLY = new Set<SupervisorTask["category"]>([
  "audit",
  "diagnostic",
  "experiment",
  "research-infra",
]);

/** Categories that modify code — require disjoint scopes. */
const IMPLEMENTATION_CATEGORIES = new Set<SupervisorTask["category"]>([
  "test-fix",
  "build-fix",
  "refactor",
  "docs",
]);

export interface ParallelIncompatReason {
  taskA: string;
  taskB: string;
  reason: string;
}

export interface ParallelBatchSelection {
  tasks: NextTaskSelection[];
  parallelism: number;
  skipped: Array<{ taskId: string; reason: string }>;
  stopped: boolean;
  stopReason?: NextTaskSelection["stopReason"];
}

export interface ParallelSchedulerOptions {
  maxParallel?: number;
  memory?: ResearchMemory;
  /** Running + newly selected must not exceed this. */
  runningTaskIds?: string[];
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

/** True when a bounded path targets a specific file (not a directory prefix scope). */
function pathLooksLikeFileScope(p: string): boolean {
  if (!p || p === "/") return false;
  const base = p.split("/").pop() ?? p;
  return base.includes(".");
}

/** True when scopes overlap or either is unbounded (empty allowedPaths on write task). */
export function scopePathsConflict(a?: string[], b?: string[]): boolean {
  const pa = a?.map(normalizePath).filter(Boolean) ?? [];
  const pb = b?.map(normalizePath).filter(Boolean) ?? [];

  if (pa.length === 0 && pb.length === 0) return true;
  if (pa.length === 0 || pb.length === 0) {
    const bounded = pa.length ? pa : pb;
    // Empty allowedPaths = read-only whole-repo inspection; conflicts only with file-scoped tasks.
    return bounded.some((p) => pathLooksLikeFileScope(p));
  }

  for (const x of pa) {
    for (const y of pb) {
      if (x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)) return true;
    }
  }
  return false;
}

export function isReadOnlyTask(task: SupervisorTask): boolean {
  if (task.allowedPaths && task.allowedPaths.length === 0) return true;
  const prompt = `${task.title} ${task.prompt}`.toLowerCase();
  return (
    (task.category === "audit" || task.category === "diagnostic") &&
    (prompt.includes("read-only") || prompt.includes("report only") || !task.allowedPaths?.length)
  );
}

export function dependenciesSatisfied(task: QueueTask, queue: TaskQueue): boolean {
  const deps = task.dependsOn ?? [];
  if (!deps.length) return true;
  const byId = new Map(queue.getTasks().map((t) => [t.id, t]));
  return deps.every((id) => byId.get(id)?.status === "completed");
}

export function canRunInParallel(a: SupervisorTask, b: SupervisorTask): ParallelIncompatReason | null {
  if (a.id === b.id) {
    return { taskA: a.id, taskB: b.id, reason: "same task" };
  }

  if (a.dependsOn?.includes(b.id) || b.dependsOn?.includes(a.id)) {
    return { taskA: a.id, taskB: b.id, reason: "explicit dependency" };
  }

  if (scopePathsConflict(a.allowedPaths, b.allowedPaths)) {
    return { taskA: a.id, taskB: b.id, reason: "overlapping scope paths" };
  }

  const aImpl = IMPLEMENTATION_CATEGORIES.has(a.category);
  const bImpl = IMPLEMENTATION_CATEGORIES.has(b.category);
  if (aImpl && bImpl && a.verifyScript && b.verifyScript && a.verifyScript === b.verifyScript) {
    return { taskA: a.id, taskB: b.id, reason: "same verify script" };
  }

  if (
    !isReadOnlyTask(a) &&
    !isReadOnlyTask(b) &&
    !PARALLEL_FRIENDLY.has(a.category) &&
    !PARALLEL_FRIENDLY.has(b.category)
  ) {
    return { taskA: a.id, taskB: b.id, reason: "both are implementation tasks" };
  }

  return null;
}

export function batchCompatible(batch: SupervisorTask[], candidate: SupervisorTask): ParallelIncompatReason | null {
  for (const t of batch) {
    const conflict = canRunInParallel(t, candidate);
    if (conflict) return conflict;
  }
  return null;
}

function parallelPriority(task: SupervisorTask): number {
  let score = task.priority;
  if (isReadOnlyTask(task)) score -= 100;
  if (PARALLEL_FRIENDLY.has(task.category)) score -= 50;
  if (task.category === "diagnostic" || task.category === "research-infra") score -= 25;
  return score;
}

function tryClaimSafeTask(
  queue: TaskQueue,
  memory: ResearchMemory,
  batch: SupervisorTask[],
): NextTaskSelection | null {
  const pending = queue
    .getTasks()
    .filter((t) => t.status === "pending")
    .sort((a, b) => {
      const ta = queueTaskToSupervisorTask(a);
      const tb = queueTaskToSupervisorTask(b);
      return parallelPriority(ta) - parallelPriority(tb);
    });

  for (const q of pending) {
    if (q.humanControlled) continue;
    if (!dependenciesSatisfied(q, queue)) continue;

    const task = queueTaskToSupervisorTask(q);
    const memorySkip = shouldSkipTaskFromMemory(task, memory.load());
    if (memorySkip.skip) {
      queue.markRunning(q.id);
      queue.complete(q.id);
      memory.recordTask(task, "completed", { summary: memorySkip.reason });
      continue;
    }

    const quality = assessTaskQuality(task, {
      existingTasks: queue.getTasks().map((t) => ({ id: t.id, prompt: t.prompt })),
    });
    if (!quality.passed && quality.rejection) {
      queue.block(q.id, qualityGateBlockMessage(quality.rejection));
      memory.recordTask(task, "blocked", { stopReason: "task_quality_failed" });
      continue;
    }

    const preStop = shouldStopBeforeDispatch(task);
    if (preStop) {
      queue.block(q.id, preStop);
      memory.recordTask(task, "blocked", { stopReason: preStop });
      continue;
    }

    if (!isTaskAutoAllowed(task)) {
      queue.block(q.id, "unsafe_task_scope");
      memory.recordTask(task, "blocked", { stopReason: "unsafe_task_scope" });
      continue;
    }

    if (batch.length && batchCompatible(batch, task)) continue;

    queue.markRunning(q.id);
    return {
      task,
      reason: q.reason,
      confidence: task.confidence,
      stopped: false,
      queueTaskId: q.id,
    };
  }

  return null;
}

/** Select up to maxParallel independent pending tasks (claims each as running). */
export function selectParallelBatch(
  queue: TaskQueue,
  options: ParallelSchedulerOptions = {},
): ParallelBatchSelection {
  const maxParallel = Math.max(1, options.maxParallel ?? DEFAULT_MAX_PARALLEL);
  const memory = options.memory ?? new ResearchMemory({ root: queue.root });
  const batch: SupervisorTask[] = [];
  const selections: NextTaskSelection[] = [];
  const skipped: Array<{ taskId: string; reason: string }> = [];

  const runningCount = queue.getRunningTasks().length;
  const slots = Math.max(0, maxParallel - runningCount);

  for (let i = 0; i < slots; i++) {
    const sel = tryClaimSafeTask(queue, memory, batch);
    if (!sel?.task || !sel.queueTaskId) break;
    batch.push(sel.task);
    selections.push(sel);
  }

  if (selections.length === 0) {
    const pendingCount = queue.getTasks().filter((t) => t.status === "pending").length;
    if (pendingCount === 0) {
      const single = selectNextTask({
        queue,
        consecutiveTestFailures: 0,
        consecutiveBuildFailures: 0,
        memory,
      });
      return {
        tasks: single.task ? [single] : [],
        parallelism: single.task ? 1 : 0,
        skipped,
        stopped: single.stopped,
        stopReason: single.stopReason,
      };
    }
    const single = tryClaimSafeTask(queue, memory, []);
    if (single?.task) {
      return {
        tasks: [single],
        parallelism: 1,
        skipped,
        stopped: false,
      };
    }
    return {
      tasks: [],
      parallelism: 0,
      skipped,
      stopped: true,
      stopReason: "low_confidence_next_task",
    };
  }

  return {
    tasks: selections,
    parallelism: selections.length,
    skipped,
    stopped: selections.length === 0 && queue.selectNextPending() === null,
    stopReason: selections.length === 0 ? "no_next_task" : undefined,
  };
}

/** Resume all running tasks after restart (parallel-safe — already dispatched). */
export function selectResumedParallelBatch(queue: TaskQueue): NextTaskSelection[] {
  return queue
    .getRunningTasks()
    .filter((t) => !t.humanControlled)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((q) => {
      const task = queueTaskToSupervisorTask(q);
      return {
        task,
        reason: "Resume running queue task after restart",
        confidence: task.confidence,
        stopped: false,
        queueTaskId: q.id,
        resumed: true,
      };
    });
}

export function getParallelSchedulerDocumentation(): string {
  return [
    "## Multi-task parallel scheduling",
    "- selectParallelBatch() claims up to maxParallel independent pending tasks",
    "- Blocks: overlapping allowedPaths, explicit dependsOn, same verifyScript, dual implementation",
    "- Read-only audits/diagnostics parallelize when scopes disjoint",
    "- Scheduler prioritizes read-only diagnostics, independent datasets, validation tests",
    "- Implementation → validation: use dependsOn on validation task",
    "- Conflicting agent conclusions → reconciliation task (category audit)",
  ].join("\n");
}
