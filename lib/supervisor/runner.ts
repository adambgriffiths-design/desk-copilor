import fs from "fs";
import os from "os";
import path from "path";
import type {
  CursorDetectionResult,
  EvaluationResult,
  ExecutionLogEntry,
  SupervisorRunOptions,
  SupervisorRunResult,
  SupervisorTask,
  StopReason,
} from "./types";
import { detectCursorCompletion, detectLiveAutonomousCompletion } from "./completion";
import { dispatchTaskToCursor, resultFilePath, writeSyntheticResult } from "./dispatcher";
import { evaluateTaskResult } from "./evaluator";
import { captureGitSnapshot } from "./git";
import { appendExecutionLog } from "./logger";
import {
  recordFinding,
  ResearchMemory,
  summarizeQueueTasks,
  updateMemoryProjectState,
} from "./memory";
import { refreshPendingPickupSignal } from "./live-pickup";
import { releaseTaskClaim } from "./pickup";
import { parseCursorResult } from "./result-parser";
import {
  seedQueueFromBacklog,
  seedSyntheticDryRunTasks,
  selectInitialTask,
  selectNextTask,
  syntheticResultForTask,
} from "./next-task";
import { generateAndEnqueueNextTask, readTaskResultReport } from "./next-task-generator";
import {
  applyHumanControlToRunner,
  filterSupervisorManagedRunning,
  loadControlState,
  shouldDispatchNewTasks,
} from "./intervention";
import { SUPERVISOR_DATA_ROOT } from "./paths";
import { createTaskQueue, type TaskQueue } from "./queue";
import { assessTaskQuality, qualityGateBlockMessage, validSupervisorTestPrompt } from "./quality-gate";
import { shouldStopBeforeDispatch } from "./safety";
import { SupervisorStateMachine } from "./state-machine";

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

export async function runSupervisorLoop(options: SupervisorRunOptions): Promise<SupervisorRunResult> {
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
    (options.dryRun ? (queueTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-runner-queue-"))) : SUPERVISOR_DATA_ROOT);
  const queue = createTaskQueue({ root: queueRoot });
  const memory = new ResearchMemory({ root: queueRoot });

  if (options.seedFromBacklog !== false) {
    if (options.dryRun) {
      seedSyntheticDryRunTasks(queue);
    } else {
      seedQueueFromBacklog(queue);
    }
  }

  let currentSelection = selectInitialTask(queue, { root: queueRoot, memory });
  const initialControl = loadControlState(queueRoot);
  if (initialControl.mode === "stopped" && filterSupervisorManagedRunning(queue).length === 0) {
    if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });
    return { iterations: 0, stopped: true, stopReason: "manual_stop", entries };
  }
  if (initialControl.mode === "paused" && !queue.getRunningTasks().filter((t) => !t.humanControlled).length) {
    if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });
    return { iterations: 0, stopped: true, stopReason: "manual_stop", entries };
  }

  let currentTask: SupervisorTask | null = currentSelection.task;
  let currentQueueTaskId = currentSelection.queueTaskId;
  let resumedTask = currentSelection.resumed ?? false;

  if (!options.autonomous && !options.dryRun) {
    if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });
    return { iterations: 0, stopped: true, stopReason: "autonomous_disabled", entries };
  }

  if (!currentTask || !currentQueueTaskId) {
    stopReason = currentSelection.stopReason ?? "low_confidence_next_task";
    if (queueTempDir) fs.rmSync(queueTempDir, { recursive: true, force: true });
    return { iterations: 0, stopped: true, stopReason, entries };
  }

  while (iteration < options.maxIterations && !sm.isTerminal()) {
    iteration++;
    const timestamp = new Date().toISOString();

    const control = loadControlState(queueRoot);
    applyHumanControlToRunner(control, queue);

    if (control.mode === "stopped" && filterSupervisorManagedRunning(queue).length === 0) {
      stopReason = "manual_stop";
      sm.forceStop();
      break;
    }

    if (control.mode !== "autonomous" && !currentTask) {
      stopReason = "manual_stop";
      sm.forceStop();
      break;
    }

    if (!currentTask || !currentQueueTaskId) {
      stopReason = currentSelection.stopReason ?? "low_confidence_next_task";
      sm.forceStop();
      break;
    }

    if (!resumedTask) {
      const preStop = shouldStopBeforeDispatch(currentTask);
      const quality = assessTaskQuality(currentTask, {
        existingTasks: queue.getTasks().map((t) => ({ id: t.id, prompt: t.prompt })),
      });
      if (!quality.passed && quality.rejection) {
        stopReason = "task_quality_failed";
        queue.block(currentQueueTaskId, qualityGateBlockMessage(quality.rejection));
        const stopEntry: ExecutionLogEntry = {
          iteration,
          timestamp,
          state: "STOP",
          taskIssued: currentTask,
          stopReason,
          nextTaskReason: quality.message,
          dryRun: options.dryRun,
          autonomous: options.autonomous,
        };
        entries.push(stopEntry);
        appendExecutionLog(stopEntry);
        sm.forceStop();
        break;
      }

      if (preStop) {
        stopReason = preStop;
        queue.block(currentQueueTaskId, preStop);
        memory.recordTask(currentTask, "blocked", { stopReason: preStop });
        const stopEntry: ExecutionLogEntry = {
          iteration,
          timestamp,
          state: "STOP",
          taskIssued: currentTask,
          stopReason,
          dryRun: options.dryRun,
          autonomous: options.autonomous,
        };
        entries.push(stopEntry);
        appendExecutionLog(stopEntry);
        sm.forceStop();
        break;
      }
    }

    let dispatched;
    let limitation: string | undefined;

    sm.transition("DISPATCH");
    if (resumedTask) {
      limitation = "Resumed running queue task — skip re-dispatch (inbox already written).";
      resumedTask = false;
    } else if (!shouldDispatchNewTasks(control)) {
      limitation = `Control mode ${control.mode} — skip dispatch, finish running task only.`;
    } else {
      const dispatchResult = dispatchTaskToCursor(currentTask, { synthetic: options.dryRun });
      dispatched = dispatchResult.dispatched;
      limitation = dispatchResult.limitation;
    }

    const dispatchedAtMs = dispatched ? Date.parse(dispatched.dispatchedAt) : Date.now();

    if (options.dryRun) {
      if (!options.simulateTimeoutForTask?.(currentTask)) {
        const reportText =
          options.syntheticResultFn?.(currentTask, iteration) ??
          syntheticResultForTask(currentTask, iteration);
        writeSyntheticResult(currentTask.id, reportText);
      }
    }

    sm.transition("WAIT");
    let detection: CursorDetectionResult | undefined;
    const waitStart = Date.now();

    if (options.dryRun) {
      detection = detectCursorCompletion({
        dispatchedAtMs,
        taskId: currentTask.id,
        resultFilePath: resultFilePath(currentTask.id),
        transcriptRoot: options.transcriptRoot,
      });
    } else {
      while (Date.now() - waitStart < options.waitTimeoutMs) {
        detection = detectLiveAutonomousCompletion({
          dispatchedAtMs,
          taskId: currentTask.id,
          resultFilePath: resultFilePath(currentTask.id),
        });
        if (detection.detected && detection.rawStatus !== "WAITING") break;
        await sleep(options.pollIntervalMs);
      }
      detection ??= detectLiveAutonomousCompletion({
        dispatchedAtMs,
        taskId: currentTask.id,
        resultFilePath: resultFilePath(currentTask.id),
      });
    }

    const simulatedTimeout = options.dryRun && options.simulateTimeoutForTask?.(currentTask);
    if (!detection.detected && (!options.dryRun || simulatedTimeout)) {
      const liveWaiting = !options.dryRun && !options.continueAfterTimeout;
      stopReason = "cursor_wait_timeout";

      if (liveWaiting) {
        releaseTaskClaim(currentTask.id);
        refreshPendingPickupSignal();
        memory.recordTask(currentTask, "blocked", {
          stopReason: "cursor_wait_timeout",
          summary: "Waiting for active Cursor session pickup",
        });
      } else {
        queue.fail(currentQueueTaskId, "cursor_wait_timeout");
        memory.recordTask(currentTask, "failed", { errorMessage: "cursor_wait_timeout" });
      }

      const timeoutEntry: ExecutionLogEntry = {
        iteration,
        timestamp,
        state: liveWaiting ? "STOP" : options.continueAfterTimeout ? "EVALUATE" : "STOP",
        taskIssued: currentTask,
        dispatch: dispatched,
        cursorResult: detection,
        stopReason,
        nextTaskReason: liveWaiting
          ? "Cursor unavailable — task released to inbox, queue task stays running for resume"
          : limitation,
        dryRun: options.dryRun,
        autonomous: options.autonomous,
      };
      entries.push(timeoutEntry);
      appendExecutionLog(timeoutEntry);

      if (liveWaiting || !options.continueAfterTimeout) {
        sm.forceStop();
        break;
      }

      if (iteration >= options.maxIterations) {
        stopReason = "max_iterations_reached";
        sm.forceStop();
        break;
      }

      sm.transition("EVALUATE");
      sm.transition("SELECT_NEXT");
      const nextAfterTimeout = selectNextTask({
        queue,
        consecutiveTestFailures,
        consecutiveBuildFailures,
        memory,
      });

      const selectAfterTimeout: ExecutionLogEntry = {
        iteration,
        timestamp: new Date().toISOString(),
        state: nextAfterTimeout.stopped ? "STOP" : "SELECT_NEXT",
        nextTask: nextAfterTimeout.task,
        nextTaskReason: nextAfterTimeout.reason,
        confidence: nextAfterTimeout.confidence,
        stopReason: nextAfterTimeout.stopReason,
        dryRun: options.dryRun,
        autonomous: options.autonomous,
      };
      entries.push(selectAfterTimeout);
      appendExecutionLog(selectAfterTimeout);

      if (nextAfterTimeout.stopped || !nextAfterTimeout.task) {
        stopReason = nextAfterTimeout.stopReason ?? "low_confidence_next_task";
        sm.transition("STOP");
        break;
      }

      currentTask = nextAfterTimeout.task;
      currentQueueTaskId = nextAfterTimeout.queueTaskId;
      currentSelection = nextAfterTimeout;
      resumedTask = nextAfterTimeout.resumed ?? false;
      sm.state = "IDLE";
      continue;
    }

    sm.transition("EVALUATE");
    const parsed = parseCursorResult(detection!.reportText, detection!.rawStatus);
    const evaluation = evaluateTaskResult({
      parsed,
      task: currentTask,
      projectRoot: options.projectRoot,
      consecutiveTestFailures,
      consecutiveBuildFailures,
      skipBuild: options.dryRun,
      skipVerification: options.dryRun,
      ignoreProtectedPaths: options.dryRun,
      gitBaselineFiles,
    });

    if (evaluation.verification && !evaluation.verification.passed) consecutiveTestFailures++;
    else consecutiveTestFailures = 0;

    if (evaluation.build.ran && !evaluation.build.passed) consecutiveBuildFailures++;
    else consecutiveBuildFailures = 0;

    const entry: ExecutionLogEntry = {
      iteration,
      timestamp,
      state: "EVALUATE",
      taskIssued: currentTask,
      dispatch: dispatched,
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
        evaluation.stopReasons[0] ?? (evaluation.outcome === "WAITING" ? "human_input_required" : "manual_stop");
      applyQueueOutcome(queue, currentQueueTaskId, currentTask, evaluation, memory, stopReason);
      sm.transition("STOP");
      entry.state = "STOP";
      entry.stopReason = stopReason;
      entries.push(entry);
      appendExecutionLog(entry);
      break;
    }

    applyQueueOutcome(queue, currentQueueTaskId, currentTask, evaluation, memory, stopReason);
    entries.push(entry);
    appendExecutionLog(entry);

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

    if (!options.skipNextTaskGeneration) {
      const reportText =
        detection!.reportText ||
        readTaskResultReport(currentTask.id) ||
        parsed.reportText;

      const generation = await generateAndEnqueueNextTask({
        reportText,
        completedTask: currentTask,
        evaluation,
        queue,
        memory,
      });

      const generateEntry: ExecutionLogEntry = {
        iteration,
        timestamp: new Date().toISOString(),
        state: generation.stopped ? "STOP" : "SELECT_NEXT",
        nextTask: generation.generated,
        nextTaskReason: generation.reason,
        confidence: generation.generated?.confidence,
        stopReason: generation.stopReason,
        dryRun: options.dryRun,
        autonomous: options.autonomous,
      };
      entries.push(generateEntry);
      appendExecutionLog(generateEntry);
    }

    const next = selectNextTask({
      queue,
      lastEvaluation: evaluation,
      consecutiveTestFailures,
      consecutiveBuildFailures,
      memory,
    });

    const selectEntry: ExecutionLogEntry = {
      iteration,
      timestamp: new Date().toISOString(),
      state: next.stopped ? "STOP" : "SELECT_NEXT",
      nextTask: next.task,
      nextTaskReason: next.reason,
      confidence: next.confidence,
      stopReason: next.stopReason,
      dryRun: options.dryRun,
      autonomous: options.autonomous,
    };
    entries.push(selectEntry);
    appendExecutionLog(selectEntry);

    if (next.stopped || !next.task) {
      stopReason = next.stopReason ?? "low_confidence_next_task";
      sm.transition("STOP");
      break;
    }

    currentTask = next.task;
    currentQueueTaskId = next.queueTaskId;
    currentSelection = next;
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

  if (queueTempDir) {
    fs.rmSync(queueTempDir, { recursive: true, force: true });
  }

  return { iterations: iteration, stopped: true, stopReason, entries };
}
