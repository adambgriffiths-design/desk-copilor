import path from "path";
import { atomicWriteQueueSnapshot, loadQueueSnapshot, QUEUE_BACKUP_SUFFIX } from "./queue-persist";
import { ensureSupervisorDataRoot, SUPERVISOR_DATA_ROOT, SUPERVISOR_QUEUE_PATH } from "./paths";
import type { CreateQueueTaskInput, QueueSnapshot, QueueTask, QueueTaskStatus, TaskQueueOptions } from "./types";

export const DEFAULT_MAX_QUEUE_SIZE = 50;

export class QueueFullError extends Error {
  constructor(maxSize: number) {
    super(`Task queue full (max ${maxSize} active tasks)`);
    this.name = "QueueFullError";
  }
}

export class QueueTaskNotFoundError extends Error {
  constructor(id: string) {
    super(`Queue task not found: ${id}`);
    this.name = "QueueTaskNotFoundError";
  }
}

export class QueueInvalidStatusError extends Error {
  readonly taskId: string;
  readonly currentStatus: QueueTaskStatus;
  readonly operation: string;

  constructor(taskId: string, currentStatus: QueueTaskStatus, operation: string) {
    super(`Cannot ${operation} queue task ${taskId} in status ${currentStatus}`);
    this.name = "QueueInvalidStatusError";
    this.taskId = taskId;
    this.currentStatus = currentStatus;
    this.operation = operation;
  }
}

function makeTaskId(): string {
  return `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isActiveStatus(status: QueueTaskStatus): boolean {
  return status === "pending" || status === "running" || status === "blocked";
}

export class TaskQueue {
  readonly root: string;
  readonly queuePath: string;
  maxSize: number;
  private tasks: QueueTask[] = [];

  constructor(options: TaskQueueOptions = {}) {
    this.root = options.root ?? SUPERVISOR_DATA_ROOT;
    this.queuePath = path.join(this.root, "queue.json");
    this.maxSize = options.maxSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.reload();
  }

  getTasks(): QueueTask[] {
    return [...this.tasks];
  }

  getActiveCount(): number {
    return this.tasks.filter((t) => isActiveStatus(t.status)).length;
  }

  getHistory(): QueueTask[] {
    return this.tasks.filter((t) => t.status === "completed" || t.status === "failed");
  }

  getRunningTasks(): QueueTask[] {
    return this.tasks.filter((t) => t.status === "running");
  }

  hasTask(id: string): boolean {
    return this.tasks.some((t) => t.id === id);
  }

  create(input: CreateQueueTaskInput): QueueTask {
    if (this.getActiveCount() >= this.maxSize) {
      throw new QueueFullError(this.maxSize);
    }

    const task: QueueTask = {
      id: input.id ?? makeTaskId(),
      createdAt: new Date().toISOString(),
      prompt: input.prompt,
      reason: input.reason,
      priority: input.priority,
      status: "pending",
      title: input.title,
      category: input.category,
      verifyScript: input.verifyScript,
      allowedPaths: input.allowedPaths,
      confidence: input.confidence,
      dependsOn: input.dependsOn?.length ? [...input.dependsOn] : undefined,
    };

    this.tasks.push(task);
    this.persist();
    return task;
  }

  selectNextPending(): QueueTask | null {
    const pending = this.tasks
      .filter((t) => t.status === "pending" && !t.humanControlled)
      .sort((a, b) => a.priority - b.priority);
    return pending[0] ?? null;
  }

  markRunning(id: string): QueueTask {
    return this.updateStatus(id, "running");
  }

  claimNext(): QueueTask | null {
    const next = this.selectNextPending();
    if (!next) return null;
    return this.markRunning(next.id);
  }

  complete(id: string): QueueTask {
    const task = this.requireRunning(id, "complete");
    task.status = "completed";
    task.completedAt = new Date().toISOString();
    delete task.errorMessage;
    delete task.startedAt;
    this.persist();
    return task;
  }

  fail(id: string, errorMessage?: string): QueueTask {
    const task = this.requireRunning(id, "fail");
    task.status = "failed";
    task.completedAt = new Date().toISOString();
    if (errorMessage) task.errorMessage = errorMessage;
    delete task.startedAt;
    this.persist();
    return task;
  }

  block(id: string, reason?: string): QueueTask {
    const task = this.requireTask(id);
    if (task.status !== "running" && task.status !== "pending") {
      throw new QueueInvalidStatusError(id, task.status, "block");
    }
    task.status = "blocked";
    if (reason) task.errorMessage = reason;
    delete task.startedAt;
    this.persist();
    return task;
  }

  reload(): void {
    const loaded = loadQueueSnapshot(this.queuePath, this.maxSize);
    this.maxSize = loaded.snapshot.maxSize ?? this.maxSize;
    this.tasks = loaded.snapshot.tasks;
    if (loaded.source === "backup") {
      this.persist();
    }
  }

  persist(): void {
    ensureSupervisorDataRoot(this.root);
    const snapshot: QueueSnapshot = {
      maxSize: this.maxSize,
      tasks: this.tasks,
    };
    atomicWriteQueueSnapshot(this.queuePath, snapshot);
  }

  private requireTask(id: string): QueueTask {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) throw new QueueTaskNotFoundError(id);
    return task;
  }

  private requireRunning(id: string, operation: string): QueueTask {
    const task = this.requireTask(id);
    if (task.status !== "running") {
      throw new QueueInvalidStatusError(id, task.status, operation);
    }
    return task;
  }

  private updateStatus(id: string, status: QueueTaskStatus): QueueTask {
    const task = this.requireTask(id);
    if (status === "running" && task.status !== "pending") {
      throw new QueueInvalidStatusError(id, task.status, "mark running");
    }
    task.status = status;
    if (status === "running") {
      task.startedAt = new Date().toISOString();
    }
    this.persist();
    return task;
  }
}

export function createTaskQueue(options?: TaskQueueOptions): TaskQueue {
  return new TaskQueue(options);
}

export { QUEUE_BACKUP_SUFFIX, SUPERVISOR_QUEUE_PATH };
