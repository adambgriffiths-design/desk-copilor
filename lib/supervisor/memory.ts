import fs from "fs";
import path from "path";
import { CURSOR_DETECTION_LIMITATIONS } from "./completion";
import {
  ensureSupervisorDataRoot,
  SUPERVISOR_DATA_ROOT,
  SUPERVISOR_MEMORY_FINDINGS_PATH,
  SUPERVISOR_MEMORY_PATH,
  SUPERVISOR_MEMORY_TASKS_PATH,
} from "./paths";
import type {
  MemoryFinding,
  MemoryFindingKind,
  MemoryProjectState,
  MemoryTaskRecord,
  MemoryTaskStatus,
  QueueTask,
  QueueTaskStatus,
  ResearchMemoryOptions,
  StopReason,
  SupervisorMemorySnapshot,
  SupervisorTask,
} from "./types";

export const MEMORY_VERSION = 1 as const;
export const DEFAULT_MAX_INDEX_SIZE = 100;

function memoryPaths(root: string = SUPERVISOR_DATA_ROOT) {
  return {
    snapshot: path.join(root, "memory.json"),
    tasks: path.join(root, "memory-tasks.jsonl"),
    findings: path.join(root, "memory-findings.jsonl"),
  };
}

function defaultProjectState(): MemoryProjectState {
  return {
    updatedAt: new Date().toISOString(),
    consecutiveTestFailures: 0,
    consecutiveBuildFailures: 0,
  };
}

export function defaultMemorySnapshot(): SupervisorMemorySnapshot {
  return {
    version: MEMORY_VERSION,
    updatedAt: new Date().toISOString(),
    projectState: defaultProjectState(),
    knownLimitations: [...CURSOR_DETECTION_LIMITATIONS],
    taskIndex: { completed: [], failed: [], blocked: [] },
    investigatedTopics: [],
  };
}

function trimIndex(list: string[], maxSize: number): string[] {
  if (list.length <= maxSize) return list;
  return list.slice(list.length - maxSize);
}

function pushUnique(list: string[], value: string, maxSize: number): string[] {
  const next = list.filter((v) => v !== value);
  next.push(value);
  return trimIndex(next, maxSize);
}

function makeFindingId(timestamp: string): string {
  return `finding-${timestamp.replace(/[:.]/g, "-")}`;
}

export function topicKeyForTask(task: Pick<SupervisorTask, "id" | "verifyScript" | "category">): string {
  if (task.verifyScript) return `verify:${task.verifyScript}`;
  return `task:${task.id}`;
}

export function loadMemorySnapshot(root: string = SUPERVISOR_DATA_ROOT): SupervisorMemorySnapshot {
  const { snapshot: snapshotPath } = memoryPaths(root);
  if (!fs.existsSync(snapshotPath)) return defaultMemorySnapshot();
  try {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as SupervisorMemorySnapshot;
    if (raw.version !== MEMORY_VERSION) return defaultMemorySnapshot();
    return {
      ...defaultMemorySnapshot(),
      ...raw,
      taskIndex: {
        completed: raw.taskIndex?.completed ?? [],
        failed: raw.taskIndex?.failed ?? [],
        blocked: raw.taskIndex?.blocked ?? [],
      },
      investigatedTopics: raw.investigatedTopics ?? [],
      knownLimitations: raw.knownLimitations?.length ? raw.knownLimitations : [...CURSOR_DETECTION_LIMITATIONS],
    };
  } catch {
    return defaultMemorySnapshot();
  }
}

export function saveMemorySnapshot(snapshot: SupervisorMemorySnapshot, root: string = SUPERVISOR_DATA_ROOT): void {
  ensureSupervisorDataRoot(root);
  const { snapshot: snapshotPath } = memoryPaths(root);
  const next = { ...snapshot, updatedAt: new Date().toISOString() };
  fs.writeFileSync(snapshotPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function readMemoryTasks(root: string = SUPERVISOR_DATA_ROOT): MemoryTaskRecord[] {
  const { tasks } = memoryPaths(root);
  if (!fs.existsSync(tasks)) return [];
  return fs
    .readFileSync(tasks, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemoryTaskRecord);
}

export function appendMemoryTask(record: MemoryTaskRecord, root: string = SUPERVISOR_DATA_ROOT): void {
  ensureSupervisorDataRoot(root);
  const { tasks } = memoryPaths(root);
  fs.appendFileSync(tasks, `${JSON.stringify(record)}\n`, "utf8");
}

export function readMemoryFindings(root: string = SUPERVISOR_DATA_ROOT): MemoryFinding[] {
  const { findings } = memoryPaths(root);
  if (!fs.existsSync(findings)) return [];
  return fs
    .readFileSync(findings, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemoryFinding);
}

export function appendMemoryFinding(finding: MemoryFinding, root: string = SUPERVISOR_DATA_ROOT): void {
  ensureSupervisorDataRoot(root);
  const { findings } = memoryPaths(root);
  fs.appendFileSync(findings, `${JSON.stringify(finding)}\n`, "utf8");
}

export function recordFinding(options: {
  topic: string;
  text: string;
  kind?: MemoryFindingKind;
  taskId?: string;
  root?: string;
}): MemoryFinding {
  const timestamp = new Date().toISOString();
  const finding: MemoryFinding = {
    id: makeFindingId(timestamp),
    timestamp,
    topic: options.topic,
    text: options.text,
    kind: options.kind ?? "finding",
    taskId: options.taskId,
  };
  appendMemoryFinding(finding, options.root);
  const snapshot = loadMemorySnapshot(options.root);
  if (finding.kind === "limitation" && !snapshot.knownLimitations.includes(finding.text)) {
    snapshot.knownLimitations.push(finding.text);
    saveMemorySnapshot(snapshot, options.root);
  }
  return finding;
}

export function isTaskInMemoryIndex(
  taskId: string,
  status: MemoryTaskStatus,
  snapshot: SupervisorMemorySnapshot,
): boolean {
  return snapshot.taskIndex[status].includes(taskId);
}

export function isTopicInvestigated(topic: string, snapshot: SupervisorMemorySnapshot): boolean {
  return snapshot.investigatedTopics.includes(topic);
}

/** Skip re-dispatch when task id already completed or verifyScript already passed. */
export function shouldSkipTaskFromMemory(
  task: SupervisorTask,
  snapshot: SupervisorMemorySnapshot,
): { skip: boolean; reason?: string } {
  if (isTaskInMemoryIndex(task.id, "completed", snapshot)) {
    return { skip: true, reason: `Task ${task.id} already completed (memory)` };
  }
  const topic = topicKeyForTask(task);
  if (isTopicInvestigated(topic, snapshot)) {
    return { skip: true, reason: `Topic ${topic} already investigated (memory)` };
  }
  return { skip: false };
}

export function recordTaskOutcome(options: {
  task: SupervisorTask;
  status: MemoryTaskStatus;
  summary?: string;
  errorMessage?: string;
  stopReason?: StopReason | string;
  root?: string;
  maxIndexSize?: number;
}): MemoryTaskRecord {
  const root = options.root;
  const maxIndexSize = options.maxIndexSize ?? DEFAULT_MAX_INDEX_SIZE;
  const timestamp = new Date().toISOString();
  const record: MemoryTaskRecord = {
    taskId: options.task.id,
    title: options.task.title,
    category: options.task.category,
    verifyScript: options.task.verifyScript,
    status: options.status,
    timestamp,
    summary: options.summary,
    errorMessage: options.errorMessage,
    stopReason: options.stopReason,
  };

  appendMemoryTask(record, root);

  const snapshot = loadMemorySnapshot(root);
  snapshot.taskIndex[options.status] = pushUnique(
    snapshot.taskIndex[options.status],
    options.task.id,
    maxIndexSize,
  );

  if (options.status === "completed") {
    const topic = topicKeyForTask(options.task);
    snapshot.investigatedTopics = pushUnique(snapshot.investigatedTopics, topic, maxIndexSize);
    if (options.task.verifyScript) {
      snapshot.investigatedTopics = pushUnique(
        snapshot.investigatedTopics,
        `verify:${options.task.verifyScript}`,
        maxIndexSize,
      );
    }
    if (options.task.category === "build-fix") {
      snapshot.investigatedTopics = pushUnique(snapshot.investigatedTopics, "build:failure", maxIndexSize);
    }
  }

  snapshot.projectState.updatedAt = timestamp;
  saveMemorySnapshot(snapshot, root);
  return record;
}

export function updateMemoryProjectState(
  patch: Partial<Omit<MemoryProjectState, "updatedAt">> & {
    lastStopReason?: StopReason;
    queueSummary?: Partial<Record<QueueTaskStatus, number>>;
  },
  root: string = SUPERVISOR_DATA_ROOT,
): SupervisorMemorySnapshot {
  const snapshot = loadMemorySnapshot(root);
  snapshot.projectState = {
    ...snapshot.projectState,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveMemorySnapshot(snapshot, root);
  return snapshot;
}

export function summarizeQueueTasks(tasks: QueueTask[]): Partial<Record<QueueTaskStatus, number>> {
  const summary: Partial<Record<QueueTaskStatus, number>> = {};
  for (const task of tasks) {
    summary[task.status] = (summary[task.status] ?? 0) + 1;
  }
  return summary;
}

export class ResearchMemory {
  readonly root: string;
  readonly maxIndexSize: number;

  constructor(options: ResearchMemoryOptions = {}) {
    this.root = options.root ?? SUPERVISOR_DATA_ROOT;
    this.maxIndexSize = options.maxIndexSize ?? DEFAULT_MAX_INDEX_SIZE;
  }

  load(): SupervisorMemorySnapshot {
    return loadMemorySnapshot(this.root);
  }

  save(snapshot: SupervisorMemorySnapshot): void {
    saveMemorySnapshot(snapshot, this.root);
  }

  reload(): SupervisorMemorySnapshot {
    return this.load();
  }

  readTasks(): MemoryTaskRecord[] {
    return readMemoryTasks(this.root);
  }

  readFindings(): MemoryFinding[] {
    return readMemoryFindings(this.root);
  }

  recordTask(
    task: SupervisorTask,
    status: MemoryTaskStatus,
    details?: { summary?: string; errorMessage?: string; stopReason?: StopReason | string },
  ): MemoryTaskRecord {
    return recordTaskOutcome({
      task,
      status,
      summary: details?.summary,
      errorMessage: details?.errorMessage,
      stopReason: details?.stopReason,
      root: this.root,
      maxIndexSize: this.maxIndexSize,
    });
  }

  shouldSkip(task: SupervisorTask): { skip: boolean; reason?: string } {
    return shouldSkipTaskFromMemory(task, this.load());
  }
}

export function getMemoryDocumentation(): string {
  return [
    "## Research memory (data/supervisor/)",
    "- memory.json — compact snapshot: project state, limitations, task index, investigated topics",
    "- memory-tasks.jsonl — append-only completed/failed/blocked task records",
    "- memory-findings.jsonl — append-only findings and state notes",
    "Next-task selection reads memory to skip already-completed tasks and investigated verifyScripts.",
  ].join("\n");
}

export {
  SUPERVISOR_MEMORY_FINDINGS_PATH,
  SUPERVISOR_MEMORY_PATH,
  SUPERVISOR_MEMORY_TASKS_PATH,
};
