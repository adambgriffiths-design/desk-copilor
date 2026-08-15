import type { TaskQueue } from "./queue";
import {
  generateAndEnqueueNextTask,
} from "./next-task-generator";
import {
  seedSyntheticDryRunTasks,
  supervisorTaskToQueueInput,
  syntheticDryRunTasks,
} from "./next-task";
import type {
  NextTaskProposalResult,
  SupervisorStatus,
  SupervisorTask,
  TaskCategory,
} from "./types";

export interface ProposeNextTaskOptions {
  reportText: string;
  completedTask: SupervisorTask;
  queue: TaskQueue;
  rawStatus?: SupervisorStatus;
}

/**
 * DRY-RUN next-task generator: given a completed Cursor report, derive exactly one
 * proposed next task and store it in the queue as PENDING. Never claims or dispatches.
 */
export async function proposeNextTaskDryRun(options: ProposeNextTaskOptions): Promise<NextTaskProposalResult> {
  const result = await generateAndEnqueueNextTask({
    reportText: options.reportText,
    completedTask: options.completedTask,
    queue: options.queue,
    rawStatus: options.rawStatus,
    reasonPrefix: `dry-run proposal after ${options.completedTask.id}`,
  });

  return {
    proposed: result.generated,
    reason: result.reason,
    enqueued: result.enqueued,
    queueTaskId: result.queueTaskId,
    stopped: result.stopped,
    stopReason: result.stopReason,
    dryRun: true,
  };
}

export function getNextTaskProposalDocumentation(): string {
  return [
    "## Result-driven next-task proposal",
    "Delegates to next-task-generator.ts — parse report, derive ONE task, enqueue PENDING.",
    "Never claimNext() or dispatch. STOP on human input, unsafe scope, or NO_NEXT_TASK.",
  ].join("\n");
}

/** Test helper: seed queue state for a fixture scenario. */
export function seedQueueForFixture(queue: TaskQueue, fixtureName: string): void {
  if (fixtureName === "complete-clean") {
    seedSyntheticDryRunTasks(queue);
    const first = queue.getTasks().find((t) => t.id === "dry-1-diagnostic");
    if (first) {
      queue.markRunning(first.id);
      queue.complete(first.id);
    }
    return;
  }
  if (fixtureName === "complete-with-todo") {
    seedSyntheticDryRunTasks(queue);
    const audit = queue.getTasks().find((t) => t.id === "dry-2-audit");
    if (audit) {
      queue.markRunning(audit.id);
      queue.complete(audit.id);
    }
    return;
  }
  if (fixtureName === "fresh-queue-seed") {
    const diag = queue.getTasks().find((t) => t.id === "dry-1-diagnostic");
    if (diag) {
      queue.markRunning(diag.id);
      queue.complete(diag.id);
    } else {
      queue.create(supervisorTaskToQueueInput(syntheticDryRunTasks()[0]!, "fixture seed"));
      queue.claimNext();
      queue.complete("dry-1-diagnostic");
    }
  }
}

export function matchesExpectedCategory(task: SupervisorTask | null, category: TaskCategory): boolean {
  return task?.category === category;
}
