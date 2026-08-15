import type { SupervisorTask } from "./types";

/** Deterministic pre-dispatch rejection codes — no AI. */
export type QualityGateRejection =
  | "empty"
  | "duplicated"
  | "excessively_large"
  | "missing_objective"
  | "missing_scope"
  | "commit_push_deploy_requested"
  | "broad_production_change";

export interface QualityGateResult {
  passed: boolean;
  rejection?: QualityGateRejection;
  message: string;
}

export interface QualityGateExistingTask {
  id: string;
  prompt: string;
}

export interface QualityGateContext {
  /** Queue or history tasks used for prompt dedupe (exclude current task id). */
  existingTasks?: QualityGateExistingTask[];
}

export const MAX_TASK_PROMPT_CHARS = 8000;

const OBJECTIVE_PATTERN =
  /\b(run|fix|audit|investigate|update|report|implement|add|remove|test|verify|document|refactor|inspect|check|create|write|read|analyze|debug|build|seed|export|parse|validate|ensure|confirm|list|compare|review|pick up|stop)\b/i;

const SCOPE_PATTERNS = [
  /\bread-only\b/i,
  /\bonly touch\b/i,
  /\bdo not modify\b/i,
  /\bno code changes\b/i,
  /\[SYNTHETIC\]/i,
  /\blib\/[\w.-]+\//i,
  /\bscripts\//i,
  /\bdata\/[\w.-]+\//i,
  /\bdocs\//i,
  /\breports\//i,
];

const COMMIT_PUSH_DEPLOY_LINE = [
  /\b(create|make|write)\s+(a\s+)?git?\s*commit\b/i,
  /\bcommit\s+(and\s+)?push\b/i,
  /\bgit\s+push\b/i,
  /\bpush\s+to\s+(origin|remote|main|master)\b/i,
  /\bdeploy\s+to\s+(prod|production)\b/i,
  /\bnpx\s+vercel\b/i,
  /\bvercel\s+--prod\b/i,
  /\bproduction\s+deploy\b/i,
];

const BROAD_PRODUCTION_PATTERNS = [
  /\b(refactor|rewrite|overhaul)\s+(entire|all|whole|full)\b/i,
  /\bacross\s+(the\s+)?(entire\s+)?codebase\b/i,
  /\bchange\s+(all|every)\b/i,
  /\blib\/(karen|tickstream|yahoo|fvg|pd-array|market-structure|decision-layer|verdict-engine)\b/i,
  /\bmodify\s+(karen|tickstream|production\s+trading)\b/i,
  /\bproduction\s+(trading|logic)\s+changes?\b/i,
];

const PROTECTED_ALLOWED_PATH = /lib\/(karen|tickstream|yahoo|fvg|pd-array|market-structure|decision-layer|verdict-engine)\//i;

function normalizePrompt(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasObjective(task: SupervisorTask): boolean {
  return OBJECTIVE_PATTERN.test(`${task.title}\n${task.prompt}`);
}

function hasScope(task: SupervisorTask): boolean {
  if (task.allowedPaths && task.allowedPaths.length > 0) return true;
  if (task.verifyScript) return true;
  if (SCOPE_PATTERNS.some((pattern) => pattern.test(task.prompt))) return true;
  return false;
}

function lineRequestsCommitPushDeploy(line: string): boolean {
  if (/\b(do not|don't|never|without)\b/i.test(line) && /\b(commit|push|deploy|vercel)\b/i.test(line)) {
    return false;
  }
  return COMMIT_PUSH_DEPLOY_LINE.some((pattern) => pattern.test(line));
}

function requestsCommitPushDeploy(text: string): boolean {
  return text.split("\n").some((line) => lineRequestsCommitPushDeploy(line));
}

function attemptsBroadProductionChange(task: SupervisorTask): boolean {
  const combined = `${task.title}\n${task.prompt}`;
  if (BROAD_PRODUCTION_PATTERNS.some((pattern) => pattern.test(combined))) return true;
  if (task.allowedPaths?.some((p) => PROTECTED_ALLOWED_PATH.test(p.replace(/\\/g, "/")))) return true;
  return false;
}

function findDuplicatePrompt(task: SupervisorTask, existingTasks: QualityGateExistingTask[]): QualityGateExistingTask | undefined {
  const normalized = normalizePrompt(task.prompt);
  return existingTasks.find(
    (existing) => existing.id !== task.id && normalizePrompt(existing.prompt) === normalized,
  );
}

export function qualityGateBlockMessage(rejection: QualityGateRejection): string {
  return `quality_gate:${rejection}`;
}

export function parseQualityGateBlockMessage(message: string | undefined): QualityGateRejection | undefined {
  if (!message?.startsWith("quality_gate:")) return undefined;
  return message.slice("quality_gate:".length) as QualityGateRejection;
}

/** Lightweight deterministic gate — run before dispatch. */
export function assessTaskQuality(task: SupervisorTask, context: QualityGateContext = {}): QualityGateResult {
  if (!task.prompt?.trim() || !task.title?.trim()) {
    return { passed: false, rejection: "empty", message: "Task prompt or title is empty" };
  }

  const duplicate = findDuplicatePrompt(task, context.existingTasks ?? []);
  if (duplicate) {
    return {
      passed: false,
      rejection: "duplicated",
      message: `Duplicate prompt matches existing task ${duplicate.id}`,
    };
  }

  if (task.prompt.length > MAX_TASK_PROMPT_CHARS) {
    return {
      passed: false,
      rejection: "excessively_large",
      message: `Prompt exceeds ${MAX_TASK_PROMPT_CHARS} characters`,
    };
  }

  if (!hasObjective(task)) {
    return {
      passed: false,
      rejection: "missing_objective",
      message: "No clear action objective in title or prompt",
    };
  }

  if (!hasScope(task)) {
    return {
      passed: false,
      rejection: "missing_scope",
      message: "Missing scope: set allowedPaths, verifyScript, READ-ONLY, or name target paths",
    };
  }

  const combined = `${task.title}\n${task.prompt}`;
  if (requestsCommitPushDeploy(combined)) {
    return {
      passed: false,
      rejection: "commit_push_deploy_requested",
      message: "Task explicitly requests commit, push, or deploy",
    };
  }

  if (attemptsBroadProductionChange(task)) {
    return {
      passed: false,
      rejection: "broad_production_change",
      message: "Task attempts broad or protected production changes",
    };
  }

  return { passed: true, message: "Task passes quality gate" };
}

export function shouldBlockBeforeDispatch(
  task: SupervisorTask,
  context: QualityGateContext = {},
): QualityGateRejection | undefined {
  const result = assessTaskQuality(task, context);
  return result.passed ? undefined : result.rejection;
}

export function getQualityGateDocumentation(): string {
  return [
    "## Task quality gate (pre-dispatch)",
    "Deterministic checks — no AI. Failed tasks are queue.block() with quality_gate:<reason>.",
    "- empty — blank title or prompt",
    "- duplicated — normalized prompt matches another queued task",
    `- excessively_large — prompt > ${MAX_TASK_PROMPT_CHARS} chars`,
    "- missing_objective — no action verb in title/prompt",
    "- missing_scope — no allowedPaths, verifyScript, READ-ONLY, or path hints",
    "- commit_push_deploy_requested — explicit commit/push/deploy (negations ignored)",
    "- broad_production_change — protected paths or codebase-wide production edits",
  ].join("\n");
}

/** Valid minimal prompt for supervisor integration tests. */
export function validSupervisorTestPrompt(label: string): string {
  return `READ-ONLY: Run ${label} check in lib/supervisor/. Report only. STOP.`;
}
