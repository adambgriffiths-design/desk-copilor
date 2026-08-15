import fs from "fs";
import os from "os";
import path from "path";
import { refreshPendingPickupSignal } from "./live-pickup";
import { ensureSupervisorDirs, SUPERVISOR_INBOX_DIR, SUPERVISOR_RESULTS_DIR } from "./paths";
import { resultFilePath, writeSyntheticResult } from "./dispatcher";
import type { TaskCategory } from "./types";

export type InboxTaskStatus = "pending" | "picked_up" | "completed" | "failed";

export interface InboxTaskPayload {
  id: string;
  status: InboxTaskStatus;
  dispatchedAt: string;
  pickedUpAt?: string;
  pickedUpBy?: string;
  completedAt?: string;
  failedAt?: string;
  errorMessage?: string;
  title: string;
  prompt: string;
  category: TaskCategory;
  verifyScript?: string;
  allowedPaths?: string[];
  instructions: string[];
}

export interface ClaimResult {
  claimed: boolean;
  task?: InboxTaskPayload;
  claimedPath?: string;
  reason?: "already_claimed" | "not_found" | "not_pending";
}

const PENDING_SUFFIX = ".json";
const CLAIMED_SUFFIX = ".claimed.json";
const COMPLETED_SUFFIX = ".completed.json";
const FAILED_SUFFIX = ".failed.json";

function inboxPaths(taskId: string, inboxDir: string = SUPERVISOR_INBOX_DIR) {
  return {
    pending: path.join(inboxDir, `${taskId}${PENDING_SUFFIX}`),
    claimed: path.join(inboxDir, `${taskId}${CLAIMED_SUFFIX}`),
    completed: path.join(inboxDir, `${taskId}${COMPLETED_SUFFIX}`),
    failed: path.join(inboxDir, `${taskId}${FAILED_SUFFIX}`),
  };
}

function readPayload(filePath: string): InboxTaskPayload | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as InboxTaskPayload;
  } catch {
    return null;
  }
}

function writePayload(filePath: string, payload: InboxTaskPayload): void {
  ensureSupervisorDirs();
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function defaultClaimedBy(): string {
  return process.env.USERNAME ?? process.env.USER ?? os.hostname();
}

/** List inbox tasks still awaiting pickup (status pending, *.json only). */
export function listPendingTasks(inboxDir: string = SUPERVISOR_INBOX_DIR): InboxTaskPayload[] {
  if (!fs.existsSync(inboxDir)) return [];
  const files = fs
    .readdirSync(inboxDir)
    .filter((f) => f.endsWith(PENDING_SUFFIX) && !f.endsWith(CLAIMED_SUFFIX))
    .filter((f) => !f.endsWith(COMPLETED_SUFFIX) && !f.endsWith(FAILED_SUFFIX));

  const tasks: InboxTaskPayload[] = [];
  for (const file of files) {
    const taskId = file.slice(0, -PENDING_SUFFIX.length);
    const paths = inboxPaths(taskId, inboxDir);
    if (fs.existsSync(paths.claimed) || fs.existsSync(paths.completed) || fs.existsSync(paths.failed)) {
      continue;
    }
    const payload = readPayload(path.join(inboxDir, file));
    if (payload && (payload.status === "pending" || !payload.status)) {
      tasks.push({ ...payload, status: "pending" });
    }
  }
  return tasks.sort((a, b) => a.dispatchedAt.localeCompare(b.dispatchedAt));
}

/** Atomically claim one pending task via rename — prevents double pickup. */
export function claimTaskById(
  taskId: string,
  options?: { claimedBy?: string; inboxDir?: string },
): ClaimResult {
  const inboxDir = options?.inboxDir ?? SUPERVISOR_INBOX_DIR;
  const paths = inboxPaths(taskId, inboxDir);
  const pendingPath = paths.pending;
  const claimedPath = paths.claimed;

  if (fs.existsSync(claimedPath) || fs.existsSync(paths.completed) || fs.existsSync(paths.failed)) {
    return { claimed: false, reason: "already_claimed" };
  }
  if (!fs.existsSync(pendingPath)) {
    return { claimed: false, reason: "not_found" };
  }

  const payload = readPayload(pendingPath);
  if (!payload) return { claimed: false, reason: "not_found" };
  if (payload.status && payload.status !== "pending") {
    return { claimed: false, reason: "not_pending" };
  }

  try {
    fs.renameSync(pendingPath, claimedPath);
  } catch {
    return { claimed: false, reason: "already_claimed" };
  }

  payload.status = "picked_up";
  payload.pickedUpAt = new Date().toISOString();
  payload.pickedUpBy = options?.claimedBy ?? defaultClaimedBy();
  writePayload(claimedPath, payload);

  refreshPendingPickupSignal(inboxDir);
  return { claimed: true, task: payload, claimedPath };
}

/** Release a claimed task back to pending (Cursor unavailable / timeout recovery). */
export function releaseTaskClaim(
  taskId: string,
  inboxDir: string = SUPERVISOR_INBOX_DIR,
): InboxTaskPayload | null {
  const claimedPath = path.join(inboxDir, `${taskId}${CLAIMED_SUFFIX}`);
  const pendingPath = path.join(inboxDir, `${taskId}${PENDING_SUFFIX}`);
  if (!fs.existsSync(claimedPath)) return null;

  const payload = readPayload(claimedPath);
  if (!payload) return null;

  payload.status = "pending";
  delete payload.pickedUpAt;
  delete payload.pickedUpBy;

  fs.renameSync(claimedPath, pendingPath);
  writePayload(pendingPath, payload);
  refreshPendingPickupSignal(inboxDir);
  return payload;
}

/** Claim the oldest pending inbox task. */
export function claimNextPending(options?: { claimedBy?: string; inboxDir?: string }): ClaimResult | null {
  const pending = listPendingTasks(options?.inboxDir);
  if (!pending.length) return null;
  return claimTaskById(pending[0]!.id, options);
}

export function getTaskPickupStatus(taskId: string, inboxDir: string = SUPERVISOR_INBOX_DIR): InboxTaskStatus | null {
  const paths = {
    pending: path.join(inboxDir, `${taskId}${PENDING_SUFFIX}`),
    claimed: path.join(inboxDir, `${taskId}${CLAIMED_SUFFIX}`),
    completed: path.join(inboxDir, `${taskId}${COMPLETED_SUFFIX}`),
    failed: path.join(inboxDir, `${taskId}${FAILED_SUFFIX}`),
  };
  if (fs.existsSync(paths.completed)) return "completed";
  if (fs.existsSync(paths.failed)) return "failed";
  if (fs.existsSync(paths.claimed)) return "picked_up";
  if (fs.existsSync(paths.pending)) return "pending";
  return null;
}

/** Mark a claimed task complete; writes results/{id}.md when reportText provided. */
export function markTaskCompleted(
  taskId: string,
  reportText?: string,
  inboxDir: string = SUPERVISOR_INBOX_DIR,
): InboxTaskPayload {
  const claimedPath = path.join(inboxDir, `${taskId}${CLAIMED_SUFFIX}`);
  const completedPath = path.join(inboxDir, `${taskId}${COMPLETED_SUFFIX}`);

  if (!fs.existsSync(claimedPath)) {
    throw new Error(`Task not in picked_up state: ${taskId}`);
  }

  const payload = readPayload(claimedPath)!;
  payload.status = "completed";
  payload.completedAt = new Date().toISOString();
  delete payload.errorMessage;

  if (reportText) {
    writeSyntheticResult(taskId, reportText);
  }

  fs.renameSync(claimedPath, completedPath);
  writePayload(completedPath, payload);
  refreshPendingPickupSignal(inboxDir);
  return payload;
}

/** Mark a claimed task failed. */
export function markTaskFailed(
  taskId: string,
  errorMessage: string,
  inboxDir: string = SUPERVISOR_INBOX_DIR,
): InboxTaskPayload {
  const claimedPath = path.join(inboxDir, `${taskId}${CLAIMED_SUFFIX}`);
  const failedPath = path.join(inboxDir, `${taskId}${FAILED_SUFFIX}`);

  if (!fs.existsSync(claimedPath)) {
    throw new Error(`Task not in picked_up state: ${taskId}`);
  }

  const payload = readPayload(claimedPath)!;
  payload.status = "failed";
  payload.failedAt = new Date().toISOString();
  payload.errorMessage = errorMessage;

  fs.renameSync(claimedPath, failedPath);
  writePayload(failedPath, payload);
  refreshPendingPickupSignal(inboxDir);
  return payload;
}

export function formatPickupPrompt(task: InboxTaskPayload): string {
  const resultPath = resultFilePath(task.id).replace(/\\/g, "/");
  return [
    `# Supervisor task: ${task.title}`,
    "",
    `Task ID: ${task.id}`,
    `Category: ${task.category}`,
    task.verifyScript ? `Verify: npm run ${task.verifyScript}` : "",
    task.allowedPaths?.length ? `Allowed paths: ${task.allowedPaths.join(", ")}` : "",
    "",
    task.prompt,
    "",
    "## Completion",
    `Write report to \`${resultPath}\`, then run:`,
    `\`npm run supervisor:pickup -- --complete --id ${task.id}\``,
    "",
    "Do NOT commit, push, or deploy unless explicitly requested.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function getPickupDocumentation(): string {
  return [
    "## Cursor task pickup (filesystem)",
    "Pending: data/supervisor/inbox/{id}.json",
    "Claim: atomic rename to {id}.claimed.json (npm run supervisor:pickup)",
    "Complete: results/{id}.md + npm run supervisor:pickup -- --complete --id {id}",
    "Live: pending-pickup.json + alwaysApply rule surfaces tasks to active Cursor session.",
  ].join("\n");
}
