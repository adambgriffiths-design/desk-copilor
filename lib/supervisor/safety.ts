import type {
  BuildResult,
  GitSnapshot,
  ParsedCursorResult,
  StopReason,
  SupervisorTask,
  VerificationResult,
} from "./types";

const PROTECTED_PATH_PATTERNS: Array<{ pattern: RegExp; reason: StopReason }> = [
  { pattern: /lib\/research\/replay\/karen\.ts/i, reason: "production_trading_logic" },
  { pattern: /lib\/karen\//i, reason: "production_trading_logic" },
  { pattern: /lib\/tickstream\//i, reason: "tickstream_yahoo_authority" },
  { pattern: /lib\/yahoo\//i, reason: "tickstream_yahoo_authority" },
  { pattern: /lib\/fvg\//i, reason: "strategy_substantial_change" },
  { pattern: /lib\/pd-array\//i, reason: "strategy_substantial_change" },
  { pattern: /lib\/market-structure\//i, reason: "strategy_substantial_change" },
  { pattern: /lib\/decision-layer\//i, reason: "production_trading_logic" },
  { pattern: /lib\/verdict-engine\//i, reason: "production_trading_logic" },
];

const TASK_TEXT_STOP: Array<{ pattern: RegExp; reason: StopReason }> = [
  { pattern: /git push|push to (origin|remote|main|master)/i, reason: "git_push_proposed" },
  { pattern: /git commit|create a commit|commit these changes|commit the changes/i, reason: "git_commit_proposed" },
  { pattern: /vercel|deploy to prod|production deploy|npx vercel/i, reason: "deployment_proposed" },
  { pattern: /\b(place|send|submit) (an? )?(order|bracket|market order)|flatten (the )?position|arm (the )?order/i, reason: "order_placement_proposed" },
  { pattern: /\.env|\bapi[_-]?key\b|\bsecret\b|\bcredential|\bpassword/i, reason: "credentials_or_secrets" },
  { pattern: /delete all|rm -rf|mass delete|drop table/i, reason: "destructive_deletion" },
  {
    pattern: /substantially (change|refactor|rewrite).*(fvg|mss|bos|pd array|strategy)/i,
    reason: "strategy_substantial_change",
  },
  { pattern: /change (tickstream|yahoo).*(authority|source|fallback)/i, reason: "tickstream_yahoo_authority" },
  { pattern: /modify karen production|production karen/i, reason: "production_trading_logic" },
];

const AUTO_ALLOWED_CATEGORIES = new Set([
  "audit",
  "diagnostic",
  "test-fix",
  "build-fix",
  "refactor",
  "research-infra",
  "docs",
  "experiment",
]);

const AUTO_ALLOWED_PATH_PREFIXES = [
  "lib/supervisor/",
  "scripts/supervisor",
  "scripts/test-supervisor",
  "scripts/",
  "data/supervisor/",
  "lib/research/",
  "scripts/research",
  "scripts/test-research",
  "data/research/",
  "data/research-fixtures/",
  "docs/",
  "reports/",
];

export interface SafetyAssessment {
  stopReasons: StopReason[];
  safeToContinue: boolean;
  autoAllowed: boolean;
}

export function isTaskAutoAllowed(task: SupervisorTask): boolean {
  if (!AUTO_ALLOWED_CATEGORIES.has(task.category)) return false;
  if (task.allowedPaths && task.allowedPaths.length === 0) return true;
  if (!task.allowedPaths) return task.category === "audit" || task.category === "diagnostic";
  return task.allowedPaths.every((p) =>
    AUTO_ALLOWED_PATH_PREFIXES.some((prefix) => p.replace(/\\/g, "/").startsWith(prefix)),
  );
}

export function assessSafety(options: {
  task: SupervisorTask;
  parsed: ParsedCursorResult;
  git: GitSnapshot;
  verification?: VerificationResult;
  build: BuildResult;
  consecutiveTestFailures: number;
  consecutiveBuildFailures: number;
  /** When set, only flag protected paths present in this delta (not entire dirty tree). */
  changedFilesDelta?: string[];
  ignoreProtectedPaths?: boolean;
}): SafetyAssessment {
  const stopReasons: StopReason[] = [];

  if (options.parsed.humanInputSignals.length) {
    stopReasons.push("human_input_required");
  }

  const combinedText = `${options.task.prompt}\n${options.parsed.reportText}`;
  for (const { pattern, reason } of TASK_TEXT_STOP) {
    if (pattern.test(combinedText)) stopReasons.push(reason);
  }

  const filesToCheck = options.ignoreProtectedPaths
    ? []
    : options.changedFilesDelta ?? options.git.changedFiles ?? [];

  for (const file of filesToCheck) {
    const normalized = file.replace(/\\/g, "/");
    for (const { pattern, reason } of PROTECTED_PATH_PATTERNS) {
      if (pattern.test(normalized)) stopReasons.push(reason);
    }
  }

  if (options.consecutiveTestFailures >= 2) stopReasons.push("repeated_test_failures");
  if (options.consecutiveBuildFailures >= 2) stopReasons.push("repeated_build_failures");

  if (!isTaskAutoAllowed(options.task)) stopReasons.push("unsafe_task_scope");

  const unique = [...new Set(stopReasons)];
  return {
    stopReasons: unique,
    safeToContinue: unique.length === 0,
    autoAllowed: isTaskAutoAllowed(options.task),
  };
}

export function shouldStopBeforeDispatch(task: SupervisorTask): StopReason | undefined {
  if (!isTaskAutoAllowed(task)) return "unsafe_task_scope";
  for (const { pattern, reason } of TASK_TEXT_STOP) {
    if (pattern.test(task.prompt)) return reason;
  }
  return undefined;
}

export function getSafetyDocumentation(): string {
  return [
    "## Auto-allowed tasks",
    "- Categories: audit, diagnostic, test-fix, build-fix, refactor, research-infra, docs, experiment",
    "- Paths under: lib/supervisor/, lib/research/, scripts/research*, data/supervisor/, docs/, reports/",
    "- Read-only audits/diagnostics (empty allowedPaths)",
    "",
    "## Auto-STOP triggers",
    "- human_input_required — agent asks for user confirmation",
    "- credentials_or_secrets — .env, API keys, passwords in task/report",
    "- deployment_proposed — vercel/deploy language",
    "- git_push_proposed — push to remote",
    "- git_commit_proposed — git commit language",
    "- order_placement_proposed — place/send/arm order or flatten",
    "- destructive_deletion — mass delete commands",
    "- production_trading_logic — Karen/decision-layer/verdict changes",
    "- tickstream_yahoo_authority — TickStream/Yahoo source changes",
    "- strategy_substantial_change — FVG/PD/MSS/BOS/strategy rewrites",
    "- repeated_test_failures — 2+ consecutive verify failures",
    "- repeated_build_failures — 2+ consecutive build failures",
    "- unsafe_task_scope — task outside auto-allowed bounds",
    "- low_confidence_next_task — cannot pick safe next task",
    "- no_next_task — generator found no useful follow-up and queue is empty",
    "- max_iterations_reached — CLI limit hit",
  ].join("\n");
}
