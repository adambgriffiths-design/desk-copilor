import fs from "fs";
import path from "path";
import { ensureSupervisorDirs, SUPERVISOR_DATA_ROOT } from "./paths";
import type { StopReason, SupervisorTask } from "./types";

export const SUPERVISOR_THROUGHPUT_LOG = path.join(SUPERVISOR_DATA_ROOT, "throughput.jsonl");

export interface ThroughputLogEntry {
  timestamp: string;
  batchId: string;
  tasksLaunched: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksBlocked: number;
  parallelismLevel: number;
  conflicts: string[];
  averageTaskDurationMs: number;
  usefulOutput: string[];
  taskIds: string[];
  stopReason?: StopReason;
  /** Adaptive concurrency snapshot when enabled. */
  adaptiveParallel?: number;
  adaptiveAction?: string;
  cpuUsagePct?: number;
  ramUsagePct?: number;
  launchBlocked?: boolean;
}

export function appendThroughputLog(entry: ThroughputLogEntry, root = SUPERVISOR_DATA_ROOT): void {
  ensureSupervisorDirs();
  const logPath = path.join(root, "throughput.jsonl");
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function summarizeUsefulOutput(tasks: SupervisorTask[], outcomes: string[]): string[] {
  return tasks.map((t, i) => `${t.id}: ${outcomes[i] ?? "unknown"}`);
}
