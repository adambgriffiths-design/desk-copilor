/**
 * Reconciliation tasks when parallel agents produce conflicting conclusions.
 */
import type { CreateQueueTaskInput, SupervisorTask } from "./types";
import type { TaskQueue } from "./queue";

export interface FindingConflict {
  topic: string;
  texts: string[];
  taskIds: string[];
}

/** Detect contradictory findings on the same topic (PASS vs FAIL, etc.). */
export function detectFindingConflict(
  topic: string,
  existingTexts: string[],
  newText: string,
): FindingConflict | null {
  const normalized = newText.toLowerCase();
  const hasPass = /\bpass\b|\bsuccess\b|\bcomplete\b/i.test(normalized);
  const hasFail = /\bfail\b|\berror\b|\bblocked\b/i.test(normalized);

  for (const prev of existingTexts) {
    const prevPass = /\bpass\b|\bsuccess\b|\bcomplete\b/i.test(prev);
    const prevFail = /\bfail\b|\berror\b|\bblocked\b/i.test(prev);
    if ((hasPass && prevFail) || (hasFail && prevPass)) {
      return { topic, texts: [...existingTexts, newText], taskIds: [] };
    }
  }
  return null;
}

export function buildReconciliationTask(conflict: FindingConflict): SupervisorTask {
  const id = `reconcile-${conflict.topic.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}-${Date.now()}`;
  return {
    id,
    title: `Reconcile conflicting conclusions: ${conflict.topic}`,
    prompt: [
      "READ-ONLY reconciliation task.",
      `Topic: ${conflict.topic}`,
      "Conflicting reports:",
      ...conflict.texts.map((t, i) => `${i + 1}. ${t.slice(0, 300)}`),
      "Determine which conclusion is supported by actual test/build output.",
      "Do NOT auto-pick one side — inspect evidence and report.",
      "Scope: lib/supervisor/ and related test output only unless topic requires otherwise.",
      "STOP after report.",
    ].join("\n"),
    category: "audit",
    allowedPaths: ["lib/supervisor/", "data/supervisor/"],
    dependsOn: conflict.taskIds.length ? [...conflict.taskIds] : undefined,
    priority: 1,
    confidence: 0.85,
  };
}

export function enqueueReconciliationTask(
  queue: TaskQueue,
  conflict: FindingConflict,
  supervisorTaskToQueueInput: (t: SupervisorTask, reason: string) => CreateQueueTaskInput,
): string | null {
  if (queue.hasTask(`reconcile-${conflict.topic}`)) return null;
  const task = buildReconciliationTask(conflict);
  const created = queue.create(supervisorTaskToQueueInput(task, `conflict reconciliation: ${conflict.topic}`));
  return created.id;
}
