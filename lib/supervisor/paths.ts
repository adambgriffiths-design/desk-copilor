import fs from "fs";
import os from "os";
import path from "path";

export const SUPERVISOR_DATA_ROOT = path.join(process.cwd(), "data", "supervisor");
export const SUPERVISOR_HISTORY_PATH = path.join(SUPERVISOR_DATA_ROOT, "history.jsonl");
export const SUPERVISOR_STATE_PATH = path.join(SUPERVISOR_DATA_ROOT, "state.json");
export const SUPERVISOR_EXECUTIONS_LOG = path.join(SUPERVISOR_DATA_ROOT, "executions.jsonl");
export const SUPERVISOR_BACKLOG_PATH = path.join(SUPERVISOR_DATA_ROOT, "backlog.json");
export const SUPERVISOR_QUEUE_PATH = path.join(SUPERVISOR_DATA_ROOT, "queue.json");
export const SUPERVISOR_INBOX_DIR = path.join(SUPERVISOR_DATA_ROOT, "inbox");
export const SUPERVISOR_OUTBOX_DIR = path.join(SUPERVISOR_DATA_ROOT, "outbox");
export const SUPERVISOR_RESULTS_DIR = path.join(SUPERVISOR_DATA_ROOT, "results");
export const SUPERVISOR_WATCHDOG_LOG = path.join(SUPERVISOR_DATA_ROOT, "watchdog.jsonl");
export const SUPERVISOR_MEMORY_PATH = path.join(SUPERVISOR_DATA_ROOT, "memory.json");
export const SUPERVISOR_MEMORY_TASKS_PATH = path.join(SUPERVISOR_DATA_ROOT, "memory-tasks.jsonl");
export const SUPERVISOR_MEMORY_FINDINGS_PATH = path.join(SUPERVISOR_DATA_ROOT, "memory-findings.jsonl");
export const SUPERVISOR_CONTROL_PATH = path.join(SUPERVISOR_DATA_ROOT, "control.json");
export const SUPERVISOR_THROUGHPUT_LOG = path.join(SUPERVISOR_DATA_ROOT, "throughput.jsonl");

export function cursorProjectSlug(workspacePath: string): string {
  return workspacePath
    .replace(/\\/g, "/")
    .replace(/^([a-zA-Z]):/, (_, drive) => `${drive.toLowerCase()}-`)
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function defaultCursorTranscriptsDir(workspacePath: string = process.cwd()): string {
  const slug = cursorProjectSlug(path.resolve(workspacePath));
  return path.join(os.homedir(), ".cursor", "projects", slug, "agent-transcripts");
}

export function ensureSupervisorDataRoot(root: string = SUPERVISOR_DATA_ROOT): void {
  for (const dir of [root, SUPERVISOR_INBOX_DIR, SUPERVISOR_OUTBOX_DIR, SUPERVISOR_RESULTS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export const ensureSupervisorDirs = ensureSupervisorDataRoot;
