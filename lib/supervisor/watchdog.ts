import fs from "fs";
import path from "path";
import { ensureSupervisorDataRoot, SUPERVISOR_WATCHDOG_LOG } from "./paths";
import type { TaskQueue } from "./queue";
import type { QueueTask, WatchdogOptions, WatchdogRecord } from "./types";

export const DEFAULT_RUNNING_TIMEOUT_MS = 30 * 60 * 1000;

export const WATCHDOG_BLOCK_REASON = "task_running_timeout";

export interface WatchdogCheckResult {
  blocked: WatchdogRecord[];
  stillRunning: string[];
}

function watchdogLogPath(root?: string): string {
  return root ? path.join(root, "watchdog.jsonl") : SUPERVISOR_WATCHDOG_LOG;
}

export function appendWatchdogLog(record: WatchdogRecord, root?: string): void {
  const logPath = watchdogLogPath(root);
  ensureSupervisorDataRoot(root ?? path.dirname(logPath));
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

export function readWatchdogLog(root?: string): WatchdogRecord[] {
  const logPath = watchdogLogPath(root);
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as WatchdogRecord);
}

export function isTaskTimedOut(
  task: QueueTask,
  timeoutMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (task.status !== "running") return false;
  if (!task.startedAt) return false;
  return nowMs - Date.parse(task.startedAt) > timeoutMs;
}

export function elapsedRunningMs(task: QueueTask, nowMs: number = Date.now()): number {
  if (!task.startedAt) return 0;
  return Math.max(0, nowMs - Date.parse(task.startedAt));
}

/** Block running tasks that exceeded runningTimeoutMs; append watchdog log entries. */
export function checkAndBlockTimedOutTasks(
  queue: TaskQueue,
  options: WatchdogOptions = {},
): WatchdogCheckResult {
  const timeoutMs = options.runningTimeoutMs ?? DEFAULT_RUNNING_TIMEOUT_MS;
  const nowMs = options.nowMs ?? Date.now();
  const blocked: WatchdogRecord[] = [];
  const stillRunning: string[] = [];

  for (const task of queue.getRunningTasks()) {
    if (!isTaskTimedOut(task, timeoutMs, nowMs)) {
      stillRunning.push(task.id);
      continue;
    }

    const startedAt = task.startedAt ?? new Date(nowMs - timeoutMs - 1).toISOString();
    const reason = WATCHDOG_BLOCK_REASON;
    const record: WatchdogRecord = {
      taskId: task.id,
      startedAt,
      timeoutMs,
      reason,
      blockedAt: new Date(nowMs).toISOString(),
    };

    queue.block(task.id, reason);
    appendWatchdogLog(record, options.root ?? queue.root);
    blocked.push(record);
  }

  return { blocked, stillRunning };
}

export function getWatchdogDocumentation(): string {
  return [
    "## Stuck-task watchdog",
    `Running tasks exceeding runningTimeoutMs (default ${DEFAULT_RUNNING_TIMEOUT_MS}ms) → blocked.`,
    "Records taskId, startedAt, timeoutMs, reason to data/supervisor/watchdog.jsonl.",
    "No auto-retry — blocked tasks stay blocked until manually cleared.",
  ].join("\n");
}
