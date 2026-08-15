import fs from "fs";
import path from "path";
import { captureGitSnapshot } from "./git";
import {
  ensureSupervisorDataRoot,
  SUPERVISOR_EXECUTIONS_LOG,
  SUPERVISOR_HISTORY_PATH,
  SUPERVISOR_STATE_PATH,
} from "./paths";
import type { DetectionResult, ExecutionLogEntry, ResearchLogEntry, SupervisorDedupeState } from "./types";

function makeEntryId(timestamp: string): string {
  const safe = timestamp.replace(/[:.]/g, "-");
  return `supervisor-${safe}`;
}

export function buildLogEntry(
  detection: DetectionResult,
  gitCwd?: string
): ResearchLogEntry {
  const timestamp = detection.detectedAt;
  return {
    id: makeEntryId(timestamp),
    timestamp,
    status: detection.status,
    taskText: detection.taskText,
    reportText: detection.reportText,
    errorMessage: detection.errorMessage,
    git: captureGitSnapshot(gitCwd),
    detection: {
      source: detection.source,
      transcriptRef: detection.transcriptRef,
      limitations: detection.limitations,
    },
  };
}

export function appendResearchLog(
  entry: ResearchLogEntry,
  historyPath: string = SUPERVISOR_HISTORY_PATH
): void {
  ensureSupervisorDataRoot(path.dirname(historyPath));
  fs.appendFileSync(historyPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function appendExecutionLog(entry: ExecutionLogEntry, root?: string): void {
  const logRoot = root ?? path.dirname(SUPERVISOR_EXECUTIONS_LOG);
  ensureSupervisorDataRoot(logRoot);
  const logPath = path.join(logRoot, path.basename(SUPERVISOR_EXECUTIONS_LOG));
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function readResearchLog(historyPath: string = SUPERVISOR_HISTORY_PATH): ResearchLogEntry[] {
  if (!fs.existsSync(historyPath)) return [];
  return fs
    .readFileSync(historyPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ResearchLogEntry);
}

export function loadSupervisorState(
  statePath: string = SUPERVISOR_STATE_PATH
): SupervisorDedupeState {
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as SupervisorDedupeState;
  } catch {
    return {};
  }
}

export function saveSupervisorState(
  state: SupervisorDedupeState,
  statePath: string = SUPERVISOR_STATE_PATH
): void {
  ensureSupervisorDataRoot(path.dirname(statePath));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export interface LogDetectionOptions {
  historyPath?: string;
  statePath?: string;
  gitCwd?: string;
  dedupe?: boolean;
}

export function logDetection(
  detection: DetectionResult,
  fingerprint: string,
  options: LogDetectionOptions = {}
): { entry: ResearchLogEntry; written: boolean; duplicate: boolean } {
  const statePath = options.statePath ?? SUPERVISOR_STATE_PATH;
  const historyPath = options.historyPath ?? SUPERVISOR_HISTORY_PATH;
  const state = loadSupervisorState(statePath);

  if (options.dedupe !== false && state.lastEventFingerprint === fingerprint) {
    const entry = buildLogEntry(detection, options.gitCwd);
    return { entry, written: false, duplicate: true };
  }

  const entry = buildLogEntry(detection, options.gitCwd);
  appendResearchLog(entry, historyPath);
  saveSupervisorState(
    {
      lastEventFingerprint: fingerprint,
      lastCheckedAt: detection.detectedAt,
    },
    statePath
  );
  return { entry, written: true, duplicate: false };
}
