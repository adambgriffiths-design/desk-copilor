/**
 * Multi-task parallel supervisor loop — batch dispatch/evaluate when tasks are independent.
 */
import fs from "fs";
import os from "os";
import path from "path";
import type {
  CursorDetectionResult,
  EvaluationResult,
  ExecutionLogEntry,
  NextTaskSelection,
  SupervisorRunOptions,
  SupervisorRunResult,
  SupervisorTask,
  StopReason,
} from "./types";
import { detectCursorCompletion, detectLiveAutonomousCompletion } from "./completion";
import { detectFindingConflict, enqueueReconciliationTask } from "./conflict-reconciliation";
import { dispatchTaskToCursor, resultFilePath, writeSyntheticResult } from "./dispatcher";
import { evaluateTaskResult } from "./evaluator";
import { captureGitSnapshot } from "./git";
import { appendExecutionLog } from "./logger";
import { refreshPendingPickupSignal } from "./live-pickup";
import { releaseTaskClaim } from "./pickup";
import { parseCursorResult } from "./result-parser";
import {
  seedQueueFromBacklog,
  seedSyntheticDryRunTasks,
  supervisorTaskToQueueInput,
  syntheticResultForTask,
} from "./next-task";
import { generateAndEnqueueNextTask, readTaskResultReport } from "./next-task-generator";
import {
  recordFinding,
  readMemoryFindings,
  ResearchMemory,
  summarizeQueueTasks,
  updateMemoryProjectState,
} from "./memory";
import { selectParallelBatch, selectResumedParallelBatch } from "./parallel-scheduler";
import {
  AdaptiveConcurrencyController,
  sampleMachineMetrics,
  type AdaptiveScaleDecision,
} from "./adaptive-concurrency";
import { SUPERVISOR_DATA_ROOT } from "./paths";
import { createTaskQueue, type TaskQueue } from "./queue";
import { assessTaskQuality, qualityGateBlockMessage } from "./quality-gate";
import { shouldStopBeforeDispatch } from "./safety";
import { SupervisorStateMachine } from "./state-machine";
import { appendThroughputLog, summarizeUsefulOutput } from "./throughput-log";
import { runSupervisorLoop } from "./runner";
import {
  applyHumanControlToRunner,
  filterSupervisorManagedRunning,
  loadControlState,
  shouldDispatchNewTasks,
} from "./intervention";
import { selectInitialTask } from "./next-task";
import { checkAndBlockTimedOutTasks } from "./watchdog";
import { reconcileStaleRunningTasks } from "./crash-recovery";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyQueueOutcome(
  queue: TaskQueue,
  queueTaskId: string,
  task: SupervisorTask,
  evaluation: EvaluationResult,
  memory: ResearchMemory,
  stopReason?: StopReason,
): void {
  if (evaluation.outcome === "COMPLETE" && evaluation.safeToContinue) {
    queue.complete(queueTaskId);
    memory.recordTask(task, "completed", { summary: evaluation.parsed.summary });
    if (evaluation.verification?.passed) {
      recordFinding({
        topic: `verify:${evaluation.verification.script}`,
        text: `${evaluation.verification.script} passed (${evaluation.verification.durationMs}ms)`,
        kind: "finding",
        taskId: task.id,
        root: memory.root,
      });
    }
    return;
  }
  if (evaluation.outcome === "ERROR") {
    const msg =
      evaluation.parsed.errors.join("; ") ||
      evaluation.parsed.summary ||
      evaluation.verification?.output?.slice(-200) ||
      "Task evaluation ERROR";
    queue.fail(queueTaskId, msg);
    memory.recordTask(task, "failed", { errorMessage: msg, summary: evaluation.parsed.summary });
    return;
  }
  const reason = stopReason ?? evaluation.stopReasons[0] ?? evaluation.parsed.outcome;
  queue.block(queueTaskId, reason);
  memory.recordTask(task, "blocked", { stopReason: reason });
}

interface ActiveSlot {
  selection: NextTaskSelection;
  task: SupervisorTask;
  queueTaskId: string;
  dispatchedAtMs: number;
  dispatched?: ReturnType<typeof dispatchTaskToCursor>["dispatched"];
  waitStart: number;
}

async function waitForTaskResult(
  slot: ActiveSlot,
  options: SupervisorRunOptions,
): Promise<CursorDetectionResult | undefined> {
  const { task } = slot;
  if (options.dryRun) {
    if (!options.simulateTimeoutForTask?.(task)) {
      const reportText =
        options.syntheticResultFn?.(task, 0) ?? syntheticResultForTask(task, 0);
      writeSyntheticResult(task.id, reportText);
    }
    return detectCursorCompletion({
      dispatchedAtMs: slot.dispatchedAtMs,
      taskId: task.id,
      resultFilePath: resultFilePath(task.id),
      transcriptRoot: options.transcriptRoot,
    });
  }

  let detection: CursorDetectionResult | undefined;
  const waitStart = Date.now();
  while (Date.now() - waitStart < options.waitTimeoutMs) {
    detection = detectLiveAutonomousCompletion({
      dispatchedAtMs: slot.dispatchedAtMs,
      taskId: task.id,
      resultFilePath: resultFilePath(task.id),
    });
    if (detection.detected && detection.rawStatus !== "WAITING") break;
    await sleep(options.pollIntervalMs);
  }
  return (
    detection ??
    detectLiveAutonomousCompletion({
      dispatchedAtMs: slot.dispatchedAtMs,
      taskId: task.id,
      resultFilePath: resultFilePath(task.id),
    })
  );
}

function checkConflictsAndEnqueue(
  queue: TaskQueue,
  memory: ResearchMemory,
  task: SupervisorTask,
  evaluation: EvaluationResult,
): string[] {
  const conflicts: string[] = [];
  const topic = task.verifyScript ? `verify:${task.verifyScript}` : `task:${task.id}`;
  const findings = readMemoryFindings(memory.root).filter((f) => f.topic === topic);
  const prevTexts = findings.map((f) => f.text);
  const conflict = detectFindingConflict(topic, prevTexts, evaluation.parsed.summary);
  if (conflict) {
    conflict.taskIds = [task.id];
    const id = enqueueReconciliationTask(queue, conflict, supervisorTaskToQueueInput);
    if (id) conflicts.push(`reconciliation enqueued: ${id}`);
  }
  return conflicts;
}

export async function runSupervisorParallelLoop(
  options: SupervisorRunOptions,
): Promise<SupervisorRunResult> {
  const useAdaptive =
    options.adaptiveConcurrency === true ||
    (options.adaptiveConcurrency !== false && options.maxParallel === undefined);
  const adaptive = useAdaptive
    ? new AdaptiveConcurrencyController(options.queueRoot ?? SUPERVISOR_DATA_ROOT)
    : undefined;
  const fixedMaxParallel = options.maxParallel ?? 1;
  const initialParallel = adaptive?.getCurrentParallel() ?? fixedMaxParallel;
  if (initialParallel <= 1 && !adaptive && !options.forceParallelLoop) {
    return runSupervisorLoop(options);
  }

  const sm = new SupervisorStateMachine();
  const entries: ExecutionLogEntry[] = [];
  let consecutiveTestFailures = 0;
  let consecutiveBuildFailures = 0;
  let iteration = 0;
  let stopReason: StopReason | undefined;
  const gitBaselineFiles = new Set(captureGitSnapshot(options.projectRoot).changedFiles ?? []);

  let queueTempDir: string | undefined;
  const queueRoot =
    options.queueRoot ??
    (options.dryRun
      ? (queueTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-parallel-queue-")))
      : SUPERVISOR_DATA_ROOT);
  const queue = createTaskQueue({ root: queueRoot });
  const memory = new ResearchMemory({ root: queueRoot });

  if (options.seedFromBacklog !== false) {
    if (options.dryRun) seedSyntheticDryRunTasks(queue);
    else seedQueueFromBacklog(queue);
  }

  checkAndBlockTimedOutTasks(queue, { root: queueRoot });
  reconcileStaleRunningTasks(queue);

  if (!options.autonomous && !options.dryRun) {
    if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });
    return { iterations: 0, stopped: true, stopReason: "autonomous_disabled", entries };
  }

  let lastAdaptiveDecision: AdaptiveScaleDecision | undefined;

  function sampleMetrics() {
    return options.metricsOverride
      ? sampleMachineMetrics(options.metricsOverride)
      : sampleMachineMetrics();
  }

  function selectBatchWithControl(): {
    selections: NextTaskSelection[];
    stopReason?: StopReason;
    adaptive?: AdaptiveScaleDecision;
  } {
    const control = loadControlState(queueRoot);
    applyHumanControlToRunner(control, queue);

    const resumed = selectResumedParallelBatch(queue);
    if (resumed.length) return { selections: resumed };

    if (!shouldDispatchNewTasks(control)) {
      return { selections: [], stopReason: "manual_stop" };
    }

    const metrics = sampleMetrics();
    let effectiveMax = adaptive?.getCurrentParallel() ?? fixedMaxParallel;
    if (adaptive) {
      lastAdaptiveDecision = adaptive.evaluate(metrics, queue.getRunningTasks().length);
      effectiveMax = lastAdaptiveDecision.effectiveParallel;
      if (lastAdaptiveDecision.launchBlocked && queue.getRunningTasks().length === 0) {
        effectiveMax = adaptive.getConfig().minParallel;
      }
      if (lastAdaptiveDecision.launchBlocked && queue.getRunningTasks().length > 0) {
        return { selections: [], adaptive: lastAdaptiveDecision };
      }
    }

    const batch = selectParallelBatch(queue, { maxParallel: effectiveMax, memory });
    if (batch.stopped && !batch.tasks.length) {
      return {
        selections: [],
        stopReason: batch.stopReason ?? "no_next_task",
        adaptive: lastAdaptiveDecision,
      };
    }
    return { selections: batch.tasks, adaptive: lastAdaptiveDecision };
  }

  const initialControl = loadControlState(queueRoot);
  applyHumanControlToRunner(initialControl, queue);
  if (
    initialControl.mode === "stopped" &&
    filterSupervisorManagedRunning(queue).length === 0
  ) {
    if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });
    return { iterations: 0, stopped: true, stopReason: "manual_stop", entries };
  }
  if (
    initialControl.mode === "paused" &&
    filterSupervisorManagedRunning(queue).length === 0
  ) {
    if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });
    return { iterations: 0, stopped: true, stopReason: "manual_stop", entries };
  }

  let batchPick = selectBatchWithControl();
  if (!batchPick.selections.length) {
    stopReason = batchPick.stopReason ?? "no_next_task";
    if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });
    return { iterations: 0, stopped: true, stopReason, entries };
  }
  let batchSelections = batchPick.selections;

  while (iteration < options.maxIterations && !sm.isTerminal() && batchSelections.length) {
    iteration++;
    const control = loadControlState(queueRoot);
    applyHumanControlToRunner(control, queue);

    if (control.mode === "stopped" && filterSupervisorManagedRunning(queue).length === 0) {
      stopReason = "manual_stop";
      sm.forceStop();
      break;
    }
    const batchId = `batch-${iteration}-${Date.now()}`;
    const batchStart = Date.now();
    let completed = 0;
    let failed = 0;
    let blocked = 0;
    const conflicts: string[] = [];
    const usefulOutcomes: string[] = [];
    const taskDurations: number[] = [];

    const slots: ActiveSlot[] = [];

    if (sm.state === "IDLE") {
      sm.transition("DISPATCH");
    }

    for (const sel of batchSelections) {
      if (!sel.task || !sel.queueTaskId) continue;
      const task = sel.task;
      const queueTaskId = sel.queueTaskId;

      if (!sel.resumed) {
        const preStop = shouldStopBeforeDispatch(task);
        const quality = assessTaskQuality(task, {
          existingTasks: queue.getTasks().map((t) => ({ id: t.id, prompt: t.prompt })),
        });
        if (!quality.passed && quality.rejection) {
          stopReason = "task_quality_failed";
          queue.block(queueTaskId, qualityGateBlockMessage(quality.rejection));
          blocked++;
          sm.forceStop();
          break;
        }
        if (preStop) {
          stopReason = preStop;
          queue.block(queueTaskId, preStop);
          blocked++;
          sm.forceStop();
          break;
        }
      }

      let dispatched;
      if (sel.resumed) {
        /* skip re-dispatch */
      } else if (!shouldDispatchNewTasks(control)) {
        /* paused/stopped — only finish already-running slots */
        continue;
      } else {
        const dr = dispatchTaskToCursor(task, { synthetic: options.dryRun });
        dispatched = dr.dispatched;
      }

      slots.push({
        selection: sel,
        task,
        queueTaskId,
        dispatchedAtMs: dispatched ? Date.parse(dispatched.dispatchedAt) : Date.now(),
        dispatched,
        waitStart: Date.now(),
      });
    }

    if (stopReason) break;

    if (slots.length === 0) {
      stopReason = "low_confidence_next_task";
      break;
    }

    sm.transition("WAIT");
    const detections = await Promise.all(slots.map((slot) => waitForTaskResult(slot, options)));

    sm.transition("EVALUATE");
    const evaluations: EvaluationResult[] = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const detection = detections[i];
      const taskStart = slot.waitStart;

      if (!detection?.detected && !options.dryRun) {
        releaseTaskClaim(slot.task.id);
        refreshPendingPickupSignal();
        blocked++;
        usefulOutcomes.push("timeout-waiting");
        continue;
      }

      const parsed = parseCursorResult(detection!.reportText, detection!.rawStatus);
      const evaluation = evaluateTaskResult({
        parsed,
        task: slot.task,
        projectRoot: options.projectRoot,
        consecutiveTestFailures,
        consecutiveBuildFailures,
        skipBuild: options.dryRun,
        skipVerification: options.dryRun,
        ignoreProtectedPaths: options.dryRun,
        gitBaselineFiles,
      });
      evaluations.push(evaluation);
      taskDurations.push(Date.now() - taskStart);

      if (evaluation.verification && !evaluation.verification.passed) consecutiveTestFailures++;
      else consecutiveTestFailures = 0;
      if (evaluation.build.ran && !evaluation.build.passed) consecutiveBuildFailures++;
      else consecutiveBuildFailures = 0;

      const entry: ExecutionLogEntry = {
        iteration,
        timestamp: new Date().toISOString(),
        state: "EVALUATE",
        taskIssued: slot.task,
        dispatch: slot.dispatched,
        cursorResult: detection,
        parsed,
        evaluation,
        git: evaluation.git,
        verification: evaluation.verification,
        build: evaluation.build,
        dryRun: options.dryRun,
        autonomous: options.autonomous,
      };

      if (evaluation.outcome === "WAITING" || !evaluation.safeToContinue) {
        stopReason =
          evaluation.stopReasons[0] ??
          (evaluation.outcome === "WAITING" ? "human_input_required" : "manual_stop");
        applyQueueOutcome(queue, slot.queueTaskId, slot.task, evaluation, memory, stopReason);
        blocked++;
        entry.state = "STOP";
        entry.stopReason = stopReason;
        entries.push(entry);
        appendExecutionLog(entry);
        sm.forceStop();
        break;
      }

      applyQueueOutcome(queue, slot.queueTaskId, slot.task, evaluation, memory);
      if (evaluation.outcome === "COMPLETE") completed++;
      else if (evaluation.outcome === "ERROR") failed++;
      else blocked++;

      usefulOutcomes.push(evaluation.parsed.summary.slice(0, 120));
      conflicts.push(...checkConflictsAndEnqueue(queue, memory, slot.task, evaluation));

      entries.push(entry);
      appendExecutionLog(entry);

      if (!options.skipNextTaskGeneration) {
        const reportText =
          detection!.reportText ||
          readTaskResultReport(slot.task.id) ||
          parsed.reportText;
        await generateAndEnqueueNextTask({
          reportText,
          completedTask: slot.task,
          evaluation,
          queue,
          memory,
        });
      }
    }

    if (stopReason) break;

    const avgDuration =
      taskDurations.length > 0
        ? Math.round(taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length)
        : 0;

    appendThroughputLog(
      {
        timestamp: new Date().toISOString(),
        batchId,
        tasksLaunched: slots.length,
        tasksCompleted: completed,
        tasksFailed: failed,
        tasksBlocked: blocked,
        parallelismLevel: slots.length,
        conflicts,
        averageTaskDurationMs: avgDuration,
        usefulOutput: summarizeUsefulOutput(
          slots.map((s) => s.task),
          usefulOutcomes,
        ),
        taskIds: slots.map((s) => s.task.id),
        adaptiveParallel: lastAdaptiveDecision?.currentParallel,
        adaptiveAction: lastAdaptiveDecision?.action,
        cpuUsagePct: lastAdaptiveDecision?.metrics.cpuUsagePct,
        ramUsagePct: lastAdaptiveDecision?.metrics.ramUsagePct,
        launchBlocked: lastAdaptiveDecision?.launchBlocked,
      },
      queueRoot,
    );

    if (adaptive) {
      adaptive.recordBatchOutcome(
        {
          tasksLaunched: slots.length,
          tasksCompleted: completed,
          tasksFailed: failed,
          tasksBlocked: blocked,
          averageTaskDurationMs: avgDuration,
          parallelismLevel: slots.length,
        },
        sampleMetrics(),
      );
    }

    if (iteration >= options.maxIterations) {
      stopReason = "max_iterations_reached";
      sm.forceStop();
      break;
    }

    sm.transition("SELECT_NEXT");
    const postControl = loadControlState(queueRoot);
    if (!shouldDispatchNewTasks(postControl)) {
      stopReason = "manual_stop";
      sm.transition("STOP");
      break;
    }

    batchPick = selectBatchWithControl();
    if (!batchPick.selections.length) {
      stopReason = batchPick.stopReason ?? "no_next_task";
      sm.transition("STOP");
      break;
    }

    batchSelections = batchPick.selections;
    sm.state = "IDLE";
  }

  if (iteration >= options.maxIterations && !stopReason) {
    stopReason = "max_iterations_reached";
  }

  updateMemoryProjectState(
    {
      lastStopReason: stopReason,
      consecutiveTestFailures,
      consecutiveBuildFailures,
      queueSummary: summarizeQueueTasks(queue.getTasks()),
    },
    queueRoot,
  );

  if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });

  return { iterations: iteration, stopped: true, stopReason, entries };
}

/** Entry: parallel when maxParallel > 1, else sequential runner. */
export async function runSupervisor(options: SupervisorRunOptions): Promise<SupervisorRunResult> {
  return runSupervisorParallelLoop(options);
}

export function selectInitialParallelOrSingle(
  queue: TaskQueue,
  options: { maxParallel?: number; memory?: ResearchMemory; root?: string },
): NextTaskSelection[] {
  checkAndBlockTimedOutTasks(queue, { root: options.root ?? queue.root });
  reconcileStaleRunningTasks(queue);
  const resumed = selectResumedParallelBatch(queue);
  if (resumed.length) return resumed;
  if ((options.maxParallel ?? 1) <= 1) {
    const single = selectInitialTask(queue, { memory: options.memory, root: options.root });
    return single.task ? [single] : [];
  }
  return selectParallelBatch(queue, {
    maxParallel: options.maxParallel,
    memory: options.memory,
  }).tasks;
}
