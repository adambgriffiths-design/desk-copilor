import type { TaskQueue } from "./queue";

export const STALE_RUNNING_RECONCILED = "stale_running_reconciled";

/** At most one running task may resume; block extras so they are not lost or double-run. */
export function reconcileStaleRunningTasks(queue: TaskQueue): string | undefined {
  const running = queue.getRunningTasks().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (running.length === 0) return undefined;

  const [primary, ...stale] = running;
  for (const task of stale) {
    queue.block(task.id, STALE_RUNNING_RECONCILED);
  }
  return primary!.id;
}
