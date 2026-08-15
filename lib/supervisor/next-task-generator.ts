import fs from "fs";
import path from "path";
import {
  isTopicInvestigated,
  recordFinding,
  ResearchMemory,
  shouldSkipTaskFromMemory,
  topicKeyForTask,
} from "./memory";
import { loadBacklog, supervisorTaskToQueueInput } from "./next-task";
import { SUPERVISOR_DATA_ROOT, SUPERVISOR_RESULTS_DIR } from "./paths";
import { assessTaskQuality, qualityGateBlockMessage } from "./quality-gate";
import { QueueFullError, type TaskQueue } from "./queue";
import { extractResultFields, parseCursorResult } from "./result-parser";
import { isTaskAutoAllowed, shouldStopBeforeDispatch } from "./safety";
import type {
  EnqueueNextTaskResult,
  EvaluationResult,
  GenerateNextTaskResult,
  GeneratedNextTask,
  NextTaskAiProvider,
  ResultContext,
  StopReason,
  SupervisorStatus,
  SupervisorTask,
} from "./types";

export interface GenerateNextTaskOptions {
  reportText: string;
  completedTask: SupervisorTask;
  evaluation?: EvaluationResult;
  rawStatus?: SupervisorStatus;
  memory?: ResearchMemory;
  queue?: TaskQueue;
  aiProvider?: NextTaskAiProvider;
}

export interface EnqueueNextTaskOptions extends GenerateNextTaskOptions {
  queue: TaskQueue;
  memory?: ResearchMemory;
  reasonPrefix?: string;
}

/** Stub AI provider — deterministic generator never calls unless injected. */
export const noopNextTaskAiProvider: NextTaskAiProvider = {
  async suggestTask() {
    return null;
  },
};

function buildResultContext(options: GenerateNextTaskOptions): ResultContext {
  const parsed =
    options.evaluation?.parsed ??
    parseCursorResult(options.reportText, options.rawStatus ?? "UNKNOWN");
  const gitFiles = options.evaluation?.git.changedFiles;
  const extracted = extractResultFields(options.reportText, { gitChangedFiles: gitFiles });
  if (options.evaluation?.verification && !options.evaluation.verification.passed) {
    extracted.testsFailed = true;
  }
  if (options.evaluation?.build.ran && !options.evaluation.build.passed) {
    extracted.buildFailed = true;
  }
  if (options.evaluation?.verification?.passed) {
    extracted.testsPassed = true;
  }
  if (options.evaluation?.build.ran && options.evaluation.build.passed) {
    extracted.buildPassed = true;
  }
  if (parsed.outcome === "UNKNOWN" || parsed.outcome === "ERROR") {
    extracted.suspicious = extracted.suspicious || parsed.outcome === "UNKNOWN";
  }
  return {
    reportText: options.reportText,
    parsed,
    completedTask: options.completedTask,
    evaluation: options.evaluation,
    extracted,
  };
}

function boundedPathsFromChanged(files: string[]): string[] {
  const allowedPrefixes = ["lib/supervisor/", "lib/research/", "scripts/test-research", "scripts/research", "data/supervisor/"];
  const normalized = files.map((f) => f.replace(/\\/g, "/"));
  const hits = normalized.filter((f) => allowedPrefixes.some((p) => f.startsWith(p)));
  return hits.length > 0 ? [...new Set(hits.map((f) => (f.includes("/") ? `${f.split("/").slice(0, 2).join("/")}/` : f)))] : ["lib/supervisor/"];
}

function buildTestFixTask(completedTask: SupervisorTask, script?: string): SupervisorTask {
  const verifyScript = script ?? completedTask.verifyScript ?? "test:research-replay";
  return {
    id: `fix-${verifyScript.replace(/[^a-z0-9:-]/gi, "-")}-${Date.now()}`,
    title: `Fix ${verifyScript} failure`,
    prompt: `READ-ONLY FIRST: Run npm run ${verifyScript}, capture failing test names. Only fix tests under scripts/test-research* or lib/research/ if clearly a wiring bug. Do NOT touch Karen, TickStream, FVG, strategy. STOP after report.`,
    category: "test-fix",
    verifyScript,
    allowedPaths: ["lib/research/", "scripts/test-research", "scripts/research"],
    priority: 5,
    confidence: 0.7,
  };
}

function buildBuildFixTask(paths?: string[]): SupervisorTask {
  const allowedPaths = paths?.length ? paths : ["lib/research/", "lib/supervisor/"];
  return {
    id: `fix-build-${Date.now()}`,
    title: "Fix build failure",
    prompt:
      "Run npm run build, capture TypeScript errors. Only fix errors in lib/research/ or lib/supervisor/. STOP after report.",
    category: "build-fix",
    allowedPaths,
    priority: 5,
    confidence: 0.65,
  };
}

function buildFollowUpTask(line: string, completedTask: SupervisorTask): SupervisorTask | null {
  const slug = line
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "");
  if (!slug) return null;

  const pathMatch = line.match(/(?:lib|data|scripts|docs)\/[\w./-]+/i);
  const allowedPaths = pathMatch ? [pathMatch[0].replace(/\\/g, "/")] : ["lib/supervisor/"];

  return {
    id: `follow-up-${slug}-${Date.now()}`,
    title: `Follow-up: ${line.slice(0, 60)}`,
    prompt: `Complete this bounded follow-up from the previous task (${completedTask.id}):\n${line}\nOnly touch ${allowedPaths.join(", ")}. STOP after report.`,
    category: "diagnostic",
    allowedPaths,
    priority: 8,
    confidence: 0.75,
  };
}

function buildVerifyTask(completedTask: SupervisorTask, reason: string): SupervisorTask {
  const script = completedTask.verifyScript ?? "test:supervisor";
  return {
    id: `verify-${completedTask.id}-${Date.now()}`,
    title: `Verify ${completedTask.title}`,
    prompt: `READ-ONLY: Re-run npm run ${script} to verify the previous result (${reason}). Report pass/fail only. STOP.`,
    category: "diagnostic",
    verifyScript: script,
    allowedPaths: completedTask.allowedPaths ?? ["lib/supervisor/"],
    priority: 12,
    confidence: 0.6,
  };
}

function buildValidationTask(completedTask: SupervisorTask): SupervisorTask {
  const script = completedTask.verifyScript ?? "test:supervisor";
  return {
    id: `validate-${completedTask.id}-${Date.now()}`,
    title: `Add validation for ${completedTask.id}`,
    prompt: `READ-ONLY FIRST: Confirm npm run ${script} covers the change from ${completedTask.id}. If missing, add a minimal test under lib/supervisor/ or scripts/test-supervisor*. STOP after report.`,
    category: "test-fix",
    verifyScript: script,
    allowedPaths: ["lib/supervisor/", "scripts/test-supervisor"],
    priority: 15,
    confidence: 0.55,
  };
}

function buildReliabilityTask(completedTask: SupervisorTask, issue: string): SupervisorTask {
  return {
    id: `reliability-${completedTask.id}-${Date.now()}`,
    title: `Improve reliability: ${completedTask.title}`,
    prompt: `Investigate and harden: ${issue}. Only touch lib/supervisor/ or lib/research/. STOP after report.`,
    category: "research-infra",
    allowedPaths: ["lib/supervisor/", "lib/research/"],
    priority: 18,
    confidence: 0.5,
  };
}

function matchBacklogTask(text: string, candidates: SupervisorTask[]): SupervisorTask | undefined {
  const lower = text.toLowerCase();
  let best: { task: SupervisorTask; score: number } | undefined;

  for (const t of candidates) {
    let score = 0;
    if (lower.includes(t.id.toLowerCase())) score = Math.max(score, 80);
    if (t.title && lower.includes(t.title.toLowerCase())) score = Math.max(score, 60);
    for (const p of t.allowedPaths ?? []) {
      const norm = p.toLowerCase().replace(/\\/g, "/");
      if (lower.includes(norm)) {
        score = Math.max(score, 40 + norm.length);
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { task: t, score };
    }
  }

  return best?.task;
}

function backlogDataRoot(queue?: TaskQueue): string {
  return queue?.root ?? SUPERVISOR_DATA_ROOT;
}

function nextBacklogCandidate(
  queue: TaskQueue | undefined,
  completedTask: SupervisorTask,
  memory?: ResearchMemory,
): SupervisorTask | null {
  const candidates = loadBacklog(backlogDataRoot(queue)).sort((a, b) => a.priority - b.priority);
  const snapshot = memory?.load();

  for (const task of candidates) {
    if (task.id === completedTask.id) continue;
    if (snapshot && shouldSkipTaskFromMemory(task, snapshot).skip) continue;
    if (queue) {
      const existing = queue.getTasks().find((t) => t.id === task.id);
      if (existing?.status === "pending") return task;
      if (existing && (existing.status === "running" || existing.status === "completed")) {
        continue;
      }
    }
    return task;
  }
  return null;
}

function topicAlreadyInvestigated(task: SupervisorTask, memory?: ResearchMemory): boolean {
  if (!memory) return false;
  const snapshot = memory.load();
  const topic = topicKeyForTask(task);
  if (isTopicInvestigated(topic, snapshot)) return true;
  if (task.category === "test-fix" && task.verifyScript && isTopicInvestigated(`verify:${task.verifyScript}`, snapshot)) {
    return true;
  }
  if (task.category === "build-fix" && isTopicInvestigated("build:failure", snapshot)) {
    return true;
  }
  return false;
}

function selectCandidate(context: ResultContext, queue?: TaskQueue, memory?: ResearchMemory): GeneratedNextTask | null {
  const { extracted, completedTask, parsed, evaluation } = context;

  if (parsed.outcome === "WAITING" || parsed.humanInputSignals.length > 0) {
    return null;
  }

  const combined = `${completedTask.prompt}\n${context.reportText}`;
  const reportStop = shouldStopBeforeDispatch({ ...completedTask, prompt: combined });
  if (reportStop) return null;

  // 1. Fix concrete failure
  if (evaluation?.verification && !evaluation.verification.passed) {
    const task = buildTestFixTask(completedTask, evaluation.verification.script);
    if (!topicAlreadyInvestigated(task, memory)) {
      return { task, reason: `Verification failed for ${evaluation.verification.script}`, selectionRule: "fix_failure", safetyClassification: "test-fix" };
    }
  }
  if (evaluation?.build.ran && !evaluation.build.passed) {
    const paths = boundedPathsFromChanged(extracted.filesChanged);
    const task = buildBuildFixTask(paths);
    if (!topicAlreadyInvestigated(task, memory)) {
      return { task, reason: "Build failed after task completion", selectionRule: "fix_failure", safetyClassification: "build-fix" };
    }
  }
  if (extracted.testsFailed) {
    const task = buildTestFixTask(completedTask);
    if (!topicAlreadyInvestigated(task, memory)) {
      return { task, reason: "Report signals test failure", selectionRule: "fix_failure", safetyClassification: "test-fix" };
    }
  }
  if (extracted.buildFailed) {
    const task = buildBuildFixTask(boundedPathsFromChanged(extracted.filesChanged));
    if (!topicAlreadyInvestigated(task, memory)) {
      return { task, reason: "Report signals build failure", selectionRule: "fix_failure", safetyClassification: "build-fix" };
    }
  }

  // 2. Explicit follow-up
  for (const line of extracted.followUpLines) {
    const followUp = buildFollowUpTask(line, completedTask);
    if (followUp && !topicAlreadyInvestigated(followUp, memory)) {
      return {
        task: followUp,
        reason: `Explicit follow-up: ${line.slice(0, 80)}`,
        selectionRule: "explicit_follow_up",
        safetyClassification: "diagnostic",
      };
    }

    const backlogMatch = matchBacklogTask(line, loadBacklog(backlogDataRoot(queue)));
    if (backlogMatch && backlogMatch.id !== completedTask.id && !topicAlreadyInvestigated(backlogMatch, memory)) {
      return {
        task: backlogMatch,
        reason: `Explicit follow-up matches backlog task ${backlogMatch.id}`,
        selectionRule: "explicit_follow_up",
        safetyClassification: backlogMatch.category,
      };
    }
  }

  for (const issue of extracted.unresolvedIssues) {
    const followUp = buildFollowUpTask(issue, completedTask);
    if (followUp && !topicAlreadyInvestigated(followUp, memory)) {
      return { task: followUp, reason: `Unresolved issue: ${issue.slice(0, 80)}`, selectionRule: "explicit_follow_up", safetyClassification: "diagnostic" };
    }
  }

  // 3. Verify uncertain/suspicious result
  if (extracted.suspicious || parsed.outcome === "UNKNOWN" || extracted.malformed) {
    const task = buildVerifyTask(completedTask, extracted.malformed ? "malformed report" : "uncertain outcome");
    if (!topicAlreadyInvestigated(task, memory)) {
      return { task, reason: "Result uncertain — verification task", selectionRule: "verify_uncertain", safetyClassification: "diagnostic" };
    }
  }

  // 4. Missing test/validation
  if (
    completedTask.verifyScript &&
    evaluation &&
    !evaluation.verification?.ran &&
    parsed.outcome === "COMPLETE"
  ) {
    const task = buildValidationTask(completedTask);
    if (!topicAlreadyInvestigated(task, memory)) {
      return { task, reason: "Verify script was not run — add validation", selectionRule: "add_validation", safetyClassification: "test-fix" };
    }
  }

  // 5. Improve reliability
  if (extracted.unresolvedIssues.length === 0 && /flaky|intermittent|race|timeout/i.test(context.reportText)) {
    const task = buildReliabilityTask(completedTask, extracted.completedWorkSummary || "intermittent behavior");
    if (!topicAlreadyInvestigated(task, memory)) {
      return { task, reason: "Report mentions reliability concern", selectionRule: "improve_reliability", safetyClassification: "research-infra" };
    }
  }

  // 6. Research backlog (only on clean completion)
  if (parsed.outcome === "COMPLETE" && !extracted.testsFailed && !extracted.buildFailed) {
    const backlog = nextBacklogCandidate(queue, completedTask, memory);
    if (backlog) {
      return {
        task: backlog,
        reason: `Next backlog task (${backlog.id})`,
        selectionRule: "research_backlog",
        safetyClassification: backlog.category,
      };
    }
  }

  return null;
}

/** Read result file from data/supervisor/results/{taskId}.md if present. */
export function readTaskResultReport(taskId: string, resultsDir?: string): string {
  const dir = resultsDir ?? SUPERVISOR_RESULTS_DIR;
  const filePath = path.join(dir, `${taskId}.md`);
  if (!fs.existsSync(filePath)) return "";
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Deterministic next-task generator — exactly zero or one task, no AI by default.
 */
export async function generateNextTask(options: GenerateNextTaskOptions): Promise<GenerateNextTaskResult> {
  const context = buildResultContext(options);

  if (context.parsed.outcome === "WAITING" || context.parsed.humanInputSignals.length > 0) {
    return {
      generated: null,
      reason: "Agent waiting for human input — no task generated",
      stopped: true,
      stopReason: "human_input_required",
      aiUsed: false,
    };
  }

  const reportStop = shouldStopBeforeDispatch({
    ...options.completedTask,
    prompt: `${options.completedTask.prompt}\n${options.reportText}`,
  });
  if (reportStop) {
    return {
      generated: null,
      reason: `Report triggers safety stop (${reportStop})`,
      stopped: true,
      stopReason: reportStop,
      aiUsed: false,
    };
  }

  let candidate = selectCandidate(context, options.queue, options.memory);

  if (!candidate && options.aiProvider && options.aiProvider !== noopNextTaskAiProvider) {
    const aiTask = await options.aiProvider.suggestTask(context);
    if (aiTask) {
      candidate = {
        task: aiTask,
        reason: "AI-suggested follow-up (stub provider)",
        selectionRule: "explicit_follow_up",
        safetyClassification: aiTask.category,
      };
    }
  }

  if (!candidate) {
    return {
      generated: null,
      reason: "NO_NEXT_TASK — no useful follow-up identified",
      stopped: true,
      stopReason: "no_next_task",
      aiUsed: false,
    };
  }

  const preStop = shouldStopBeforeDispatch(candidate.task);
  if (preStop || !isTaskAutoAllowed(candidate.task)) {
    return {
      generated: candidate.task,
      reason: `Generated task blocked by safety (${preStop ?? "unsafe_task_scope"})`,
      selectionRule: candidate.selectionRule,
      stopped: true,
      stopReason: preStop ?? "unsafe_task_scope",
      aiUsed: false,
    };
  }

  return {
    generated: candidate.task,
    reason: candidate.reason,
    selectionRule: candidate.selectionRule,
    stopped: false,
    aiUsed: false,
  };
}

/** Generate one task and enqueue as PENDING after quality gate + memory dedupe. */
export async function generateAndEnqueueNextTask(options: EnqueueNextTaskOptions): Promise<EnqueueNextTaskResult> {
  const memory = options.memory ?? new ResearchMemory({ root: options.queue.root });
  const generated = await generateNextTask({ ...options, memory, queue: options.queue });

  if (!generated.generated) {
    return { ...generated, enqueued: false };
  }

  const task = generated.generated;
  const memorySkip = shouldSkipTaskFromMemory(task, memory.load());
  if (memorySkip.skip) {
    recordFinding({
      topic: topicKeyForTask(task),
      text: `Skipped enqueue — ${memorySkip.reason}`,
      kind: "state",
      taskId: options.completedTask.id,
      root: memory.root,
    });
    return {
      ...generated,
      enqueued: false,
      reason: memorySkip.reason ?? "Task skipped by memory",
    };
  }

  const existingPending = options.queue.getTasks().find((t) => t.id === task.id && t.status === "pending");
  if (existingPending) {
    return {
      ...generated,
      enqueued: false,
      queueTaskId: existingPending.id,
      reason: `Task ${task.id} already pending in queue`,
    };
  }

  const quality = assessTaskQuality(task, {
    existingTasks: options.queue.getTasks().map((t) => ({ id: t.id, prompt: t.prompt })),
  });
  if (!quality.passed && quality.rejection) {
    return {
      ...generated,
      enqueued: false,
      blocked: true,
      blockReason: qualityGateBlockMessage(quality.rejection),
      reason: quality.message,
      stopped: true,
      stopReason: "task_quality_failed",
    };
  }

  const reason = options.reasonPrefix
    ? `${options.reasonPrefix}: ${generated.reason}`
    : `Generated after ${options.completedTask.id} — ${generated.reason}`;

  try {
    const queued = options.queue.create(supervisorTaskToQueueInput(task, reason));
    recordFinding({
      topic: `next-task:${generated.selectionRule ?? "unknown"}`,
      text: `Enqueued ${task.id} (${generated.selectionRule})`,
      kind: "state",
      taskId: task.id,
      root: memory.root,
    });
    return {
      ...generated,
      enqueued: true,
      queueTaskId: queued.id,
      stopped: false,
    };
  } catch (err) {
    if (err instanceof QueueFullError) {
      return {
        ...generated,
        enqueued: false,
        stopped: true,
        stopReason: "low_confidence_next_task",
        reason: "Queue full — task not enqueued",
      };
    }
    throw err;
  }
}

export function getNextTaskGeneratorDocumentation(): string {
  return [
    "## Result-driven next-task generator",
    "1. Read results/{id}.md + evaluation (tests/build/git)",
    "2. extractResultFields() — deterministic parsing, no AI",
    "3. Priority: fix failure → follow-up → verify uncertain → validation → reliability → backlog",
    "4. Memory dedupe via investigatedTopics and taskIndex",
    "5. assessTaskQuality() before queue.create() as PENDING",
    "6. NO_NEXT_TASK when no useful work — loop stops cleanly",
    "7. AI isolated behind NextTaskAiProvider stub (not used by default)",
  ].join("\n");
}

export function buildResultContextFromReport(
  reportText: string,
  completedTask: SupervisorTask,
  evaluation?: EvaluationResult,
): ResultContext {
  return buildResultContext({ reportText, completedTask, evaluation });
}
