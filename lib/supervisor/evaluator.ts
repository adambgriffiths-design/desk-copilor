import { spawnSync } from "child_process";
import type {
  BuildResult,
  EvaluationResult,
  ParsedCursorResult,
  SupervisorTask,
  VerificationResult,
} from "./types";
import { captureGitSnapshot } from "./git";
import { assessSafety } from "./safety";

function runNpmScript(script: string, cwd: string, timeoutMs = 180_000): { ok: boolean; output: string; ms: number } {
  const started = Date.now();
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", script], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    shell: process.platform === "win32",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, output, ms: Date.now() - started };
}

export function runBuild(projectRoot: string): BuildResult {
  const started = Date.now();
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "build"], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 300_000,
    shell: process.platform === "win32",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return {
    ran: true,
    passed: result.status === 0,
    output: output.slice(-4000),
    durationMs: Date.now() - started,
  };
}

export function runVerification(script: string | undefined, projectRoot: string): VerificationResult | undefined {
  if (!script) return undefined;
  const { ok, output, ms } = runNpmScript(script, projectRoot);
  return {
    script,
    ran: true,
    passed: ok,
    output: output.slice(-4000),
    durationMs: ms,
  };
}

export function evaluateTaskResult(options: {
  parsed: ParsedCursorResult;
  task: SupervisorTask;
  projectRoot: string;
  consecutiveTestFailures: number;
  consecutiveBuildFailures: number;
  skipBuild?: boolean;
  skipVerification?: boolean;
  ignoreProtectedPaths?: boolean;
  gitBaselineFiles?: Set<string>;
}): EvaluationResult {
  const git = captureGitSnapshot(options.projectRoot);
  const changedFilesDelta = options.gitBaselineFiles
    ? (git.changedFiles ?? []).filter((f) => !options.gitBaselineFiles!.has(f))
    : undefined;
  const verification = options.skipVerification
    ? options.task.verifyScript
      ? {
          script: options.task.verifyScript,
          ran: false,
          passed: true,
          output: "(synthetic — skipped in dry-run)",
          durationMs: 0,
        }
      : undefined
    : runVerification(options.task.verifyScript, options.projectRoot);
  const build = options.skipBuild
    ? { ran: false, passed: true, output: "(synthetic — skipped in dry-run)", durationMs: 0 }
    : runBuild(options.projectRoot);

  const safety = assessSafety({
    task: options.task,
    parsed: options.parsed,
    git,
    verification,
    build,
    consecutiveTestFailures: options.consecutiveTestFailures,
    consecutiveBuildFailures: options.consecutiveBuildFailures,
    changedFilesDelta,
    ignoreProtectedPaths: options.ignoreProtectedPaths,
  });

  let outcome = options.parsed.outcome;
  if (verification && !verification.passed) outcome = "ERROR";
  if (build.ran && !build.passed) outcome = "ERROR";

  return {
    outcome,
    parsed: options.parsed,
    git,
    verification,
    build,
    stopReasons: safety.stopReasons,
    safeToContinue: safety.safeToContinue,
  };
}

export function inferFailuresFromOutput(output: string): { testsFailed: boolean; buildFailed: boolean } {
  return {
    testsFailed: /✗|FAIL|failed/i.test(output) && !/0 failed/i.test(output),
    buildFailed: /Failed to compile|error TS/i.test(output),
  };
}
