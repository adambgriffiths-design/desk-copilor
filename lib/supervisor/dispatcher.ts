import fs from "fs";
import path from "path";
import { refreshPendingPickupSignal } from "./live-pickup";
import {
  ensureSupervisorDirs,
  SUPERVISOR_INBOX_DIR,
  SUPERVISOR_OUTBOX_DIR,
  SUPERVISOR_RESULTS_DIR,
} from "./paths";
import type { DispatchedTask, SupervisorTask } from "./types";
import { captureTranscriptBaseline } from "./completion";

export interface DispatchResult {
  dispatched: DispatchedTask;
  limitation: string;
}

/** File-based dispatch — does NOT auto-invoke Cursor without inbox pickup or @cursor/sdk. */
export function dispatchTaskToCursor(task: SupervisorTask, options?: { synthetic?: boolean }): DispatchResult {
  ensureSupervisorDirs();
  const dispatchedAt = new Date().toISOString();
  const payload = {
    id: task.id,
    status: "pending" as const,
    dispatchedAt,
    title: task.title,
    prompt: task.prompt,
    category: task.category,
    verifyScript: task.verifyScript,
    allowedPaths: task.allowedPaths,
    instructions: [
      "Pick up this task from data/supervisor/inbox/",
      "When complete, write report to data/supervisor/results/{id}.md",
      "Do NOT commit, push, or deploy unless explicitly requested.",
    ],
  };

  const outboxPath = path.join(SUPERVISOR_OUTBOX_DIR, `${task.id}.json`);
  const inboxPath = path.join(SUPERVISOR_INBOX_DIR, `${task.id}.json`);
  fs.writeFileSync(outboxPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(inboxPath, JSON.stringify(payload, null, 2), "utf8");
  if (!options?.synthetic) {
    refreshPendingPickupSignal();
  }

  const dispatched: DispatchedTask = {
    taskId: task.id,
    dispatchedAt,
    outboxPath,
    inboxPath,
    method: options?.synthetic ? "synthetic" : "file_outbox",
    transcriptBaseline: options?.synthetic ? undefined : captureTranscriptBaseline(),
  };

  const limitation = options?.synthetic
    ? "Dry-run: synthetic dispatch — no inbox pickup required."
    : "File-based dispatch. Active Cursor session picks up via pending-pickup.json + supervisor-pickup rule.";

  return { dispatched, limitation };
}

export function resultFilePath(taskId: string): string {
  return path.join(SUPERVISOR_RESULTS_DIR, `${taskId}.md`);
}

export function writeSyntheticResult(taskId: string, reportText: string): void {
  ensureSupervisorDirs();
  fs.writeFileSync(resultFilePath(taskId), reportText, "utf8");
}

export function getDispatcherDocumentation(): string {
  return [
    "## Cursor task dispatcher",
    "Method: file-based outbox + inbox mirror under data/supervisor/",
    "Pickup: npm run supervisor:pickup (atomic claim on data/supervisor/inbox/).",
  ].join("\n");
}
