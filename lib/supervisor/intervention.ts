/**
 * Human override / intervention commands — PAUSE, STOP, RESUME, TAKEOVER, CANCEL, PRIORITY, STATUS.
 */
import { appendExecutionLog } from "./logger";
import { refreshPendingPickupSignal } from "./live-pickup";
import { releaseTaskClaim } from "./pickup";
import { SUPERVISOR_DATA_ROOT } from "./paths";
import { createTaskQueue, type TaskQueue } from "./queue";
import {
  loadControlState,
  saveControlState,
  shouldDispatchNewTasks,
  shouldTerminateRunning,
  isPausedOrStopped,
} from "./control-state";
import type {
  CreateQueueTaskInput,
  ExecutionLogEntry,
  SupervisorControlState,
  SupervisorTask,
  TaskCategory,
} from "./types";
import { assessTaskQuality, qualityGateBlockMessage } from "./quality-gate";

export type InterventionCommand =
  | "PAUSE"
  | "STOP"
  | "RESUME"
  | "TAKEOVER"
  | "CANCEL"
  | "PRIORITY"
  | "STATUS";

export interface InterventionOptions {
  root?: string;
  taskId?: string;
  reason?: string;
  /** PRIORITY: task payload */
  task?: {
    prompt: string;
    reason: string;
    title?: string;
    category?: TaskCategory;
    allowedPaths?: string[];
    verifyScript?: string;
  };
}

export interface StatusReport {
  mode: SupervisorControlState["mode"];
  controlUpdatedAt: string;
  terminateRunningRequested: boolean;
  running: Array<{ id: string; title?: string; humanControlled?: boolean; startedAt?: string }>;
  pending: Array<{ id: string; title?: string; priority: number }>;
  blocked: Array<{ id: string; title?: string; errorMessage?: string }>;
  humanControlled: string[];
  lastCompleted?: { id: string; title?: string; completedAt?: string };
  nextPlanned: Array<{ id: string; title?: string; priority: number }>;
  activeAgents: string[];
}

function logIntervention(
  command: InterventionCommand,
  detail: {
    taskId?: string;
    reason?: string;
    mode?: SupervisorControlState["mode"];
    dryRun?: boolean;
  },
  root: string,
): void {
  const entry: ExecutionLogEntry = {
    iteration: 0,
    timestamp: new Date().toISOString(),
    state: "STOP",
    stopReason: command === "STOP" ? "manual_stop" : undefined,
    dryRun: detail.dryRun ?? false,
    autonomous: false,
    nextTaskReason: `[INTERVENTION] ${command}${detail.taskId ? ` task=${detail.taskId}` : ""}${detail.reason ? ` reason=${detail.reason}` : ""} mode=${detail.mode ?? "n/a"}`,
  };
  appendExecutionLog(entry, root);
}

export function cmdPause(options: InterventionOptions = {}): SupervisorControlState {
  const root = options.root ?? SUPERVISOR_DATA_ROOT;
  const state = saveControlState(
    {
      mode: "paused",
      terminateRunningRequested: false,
      lastIntervention: {
        command: "PAUSE",
        at: new Date().toISOString(),
        reason: options.reason ?? "human pause",
      },
    },
    root,
  );
  logIntervention("PAUSE", { mode: state.mode, reason: options.reason }, root);
  return state;
}

export function cmdStop(options: InterventionOptions = {}): SupervisorControlState {
  const root = options.root ?? SUPERVISOR_DATA_ROOT;
  const queue = createTaskQueue({ root });
  const state = saveControlState(
    {
      mode: "stopped",
      terminateRunningRequested: true,
      lastIntervention: {
        command: "STOP",
        at: new Date().toISOString(),
        reason: options.reason ?? "human stop",
      },
    },
    root,
  );

  for (const t of queue.getRunningTasks()) {
    if (!t.humanControlled) {
      queue.block(t.id, "human_stop: terminate requested");
      try {
        releaseTaskClaim(t.id);
      } catch {
        /* inbox may not exist */
      }
    }
  }
  refreshPendingPickupSignal();
  logIntervention("STOP", { mode: state.mode, reason: options.reason }, root);
  return state;
}

export function cmdResume(options: InterventionOptions = {}): SupervisorControlState {
  const root = options.root ?? SUPERVISOR_DATA_ROOT;
  const state = saveControlState(
    {
      mode: "autonomous",
      terminateRunningRequested: false,
      lastIntervention: {
        command: "RESUME",
        at: new Date().toISOString(),
        reason: options.reason ?? "human resume",
      },
    },
    root,
  );
  logIntervention("RESUME", { mode: state.mode, reason: options.reason }, root);
  return state;
}

export function cmdTakeover(taskId: string, options: InterventionOptions = {}): void {
  const root = options.root ?? SUPERVISOR_DATA_ROOT;
  const queue = createTaskQueue({ root });
  const task = queue.getTasks().find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  task.humanControlled = true;
  if (options.reason) task.errorMessage = `human_controlled: ${options.reason}`;
  queue.persist();

  try {
    releaseTaskClaim(taskId);
  } catch {
    /* ok */
  }
  refreshPendingPickupSignal();
  logIntervention("TAKEOVER", { taskId, reason: options.reason }, root);
}

export function cmdCancel(taskId: string, options: InterventionOptions = {}): void {
  const root = options.root ?? SUPERVISOR_DATA_ROOT;
  const queue = createTaskQueue({ root });
  const task = queue.getTasks().find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const reason = options.reason ?? "human cancel";
  task.humanControlled = true;
  task.cancelledByHuman = true;

  if (task.status === "running") {
    queue.fail(taskId, `human_cancel: ${reason}`);
  } else if (task.status === "pending") {
    queue.block(taskId, `human_cancel: ${reason}`);
  } else {
    task.errorMessage = `human_cancel: ${reason}`;
    queue.persist();
  }

  try {
    releaseTaskClaim(taskId);
  } catch {
    /* ok */
  }
  refreshPendingPickupSignal();
  logIntervention("CANCEL", { taskId, reason }, root);
}

export function cmdPriority(input: CreateQueueTaskInput, options: InterventionOptions = {}): string {
  const root = options.root ?? SUPERVISOR_DATA_ROOT;
  const queue = createTaskQueue({ root });

  const taskInput: CreateQueueTaskInput = {
    ...input,
    priority: input.priority ?? 0,
    reason: input.reason || "human priority injection",
  };

  const asSupervisorTask: SupervisorTask = {
    id: taskInput.id ?? "pending",
    title: taskInput.title ?? taskInput.reason.slice(0, 80),
    prompt: taskInput.prompt,
    category: taskInput.category ?? "diagnostic",
    verifyScript: taskInput.verifyScript,
    allowedPaths: taskInput.allowedPaths,
    priority: taskInput.priority,
    confidence: taskInput.confidence ?? 0.95,
  };

  const quality = assessTaskQuality(asSupervisorTask, {
    existingTasks: queue.getTasks().map((t) => ({ id: t.id, prompt: t.prompt })),
  });
  if (!quality.passed && quality.rejection) {
    throw new Error(`Priority task rejected by quality gate: ${qualityGateBlockMessage(quality.rejection)}`);
  }

  const created = queue.create(taskInput);
  logIntervention("PRIORITY", { taskId: created.id, reason: input.reason }, root);
  return created.id;
}

export function cmdStatus(options: InterventionOptions = {}): StatusReport {
  const root = options.root ?? SUPERVISOR_DATA_ROOT;
  const control = loadControlState(root);
  const queue = createTaskQueue({ root });

  const tasks = queue.getTasks();
  const running = tasks
    .filter((t) => t.status === "running")
    .map((t) => ({
      id: t.id,
      title: t.title,
      humanControlled: t.humanControlled,
      startedAt: t.startedAt,
    }));

  const pending = tasks
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.priority - b.priority)
    .map((t) => ({ id: t.id, title: t.title, priority: t.priority }));

  const blocked = tasks
    .filter((t) => t.status === "blocked")
    .map((t) => ({ id: t.id, title: t.title, errorMessage: t.errorMessage }));

  const completed = tasks
    .filter((t) => t.status === "completed")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const humanControlled = tasks.filter((t) => t.humanControlled).map((t) => t.id);

  const nextPlanned = pending.slice(0, 5);

  const activeAgents = running.filter((t) => !t.humanControlled).map((t) => t.id);

  return {
    mode: control.mode,
    controlUpdatedAt: control.updatedAt,
    terminateRunningRequested: control.terminateRunningRequested ?? false,
    running,
    pending,
    blocked,
    humanControlled,
    lastCompleted: completed[0]
      ? { id: completed[0].id, title: completed[0].title, completedAt: completed[0].completedAt }
      : undefined,
    nextPlanned,
    activeAgents,
  };
}

export function applyHumanControlToRunner(
  control: SupervisorControlState,
  queue: TaskQueue,
): { allowNewDispatch: boolean; terminatedIds: string[] } {
  const terminatedIds: string[] = [];
  if (shouldTerminateRunning(control)) {
    for (const t of queue.getRunningTasks()) {
      if (!t.humanControlled && t.status === "running") {
        queue.block(t.id, "human_stop: terminate requested");
        terminatedIds.push(t.id);
        try {
          releaseTaskClaim(t.id);
        } catch {
          /* ok */
        }
      }
    }
  }
  return { allowNewDispatch: shouldDispatchNewTasks(control), terminatedIds };
}

export function filterSupervisorManagedRunning(queue: TaskQueue) {
  return queue.getRunningTasks().filter((t) => !t.humanControlled);
}

export {
  loadControlState,
  saveControlState,
  shouldDispatchNewTasks,
  shouldTerminateRunning,
  isPausedOrStopped,
};
