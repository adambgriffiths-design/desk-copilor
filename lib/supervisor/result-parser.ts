import type { ExtractedResultFields, ParsedCursorResult, SupervisorStatus } from "./types";

const HUMAN_INPUT_PATTERNS = [
  /waiting for (your|user|human)/i,
  /need (your|user) (input|approval|confirmation)/i,
  /please confirm/i,
  /which (option|approach|one)/i,
  /should i (commit|push|deploy)/i,
  /do you want me to/i,
];

const WAITING_PATTERNS = [/in progress/i, /still running/i, /when .* finishes/i, /will report back/i];
const ERROR_PATTERNS = [/\bFAIL\b/, /✗/, /\berror\b/i, /\bfailed\b/i, /exception/i, /cannot proceed/i];
const COMPLETE_PATTERNS = [/\bPASS\b/, /✓/, /complete/i, /success/i, /report:/i, /=== .* ===/];

export function parseCursorResult(reportText: string, rawStatus: SupervisorStatus): ParsedCursorResult {
  const errors: string[] = [];
  const waitingSignals: string[] = [];
  const humanInputSignals: string[] = [];

  for (const p of ERROR_PATTERNS) {
    if (p.test(reportText)) errors.push(p.source);
  }
  for (const p of WAITING_PATTERNS) {
    if (p.test(reportText)) waitingSignals.push(p.source);
  }
  for (const p of HUMAN_INPUT_PATTERNS) {
    if (p.test(reportText)) humanInputSignals.push(p.source);
  }

  let outcome = rawStatus;
  if (humanInputSignals.length) outcome = "WAITING";
  else if (waitingSignals.length && outcome !== "ERROR") outcome = "WAITING";
  else if (!reportText.trim()) outcome = "UNKNOWN";
  else if (outcome === "UNKNOWN") {
    if (errors.length && !/\bPASS\b/i.test(reportText)) outcome = "ERROR";
    else if (COMPLETE_PATTERNS.some((p) => p.test(reportText))) outcome = "COMPLETE";
  }

  const summary =
    outcome === "COMPLETE"
      ? (reportText.split("\n").find((l) => l.trim())?.trim() ?? "Task completed")
      : outcome === "ERROR"
        ? `Error signals: ${errors.slice(0, 3).join(", ") || "unknown"}`
        : outcome === "WAITING"
          ? `Waiting: ${humanInputSignals[0] || waitingSignals[0] || "agent not finished"}`
          : "Outcome could not be determined from report text";

  return { outcome, summary, reportText, errors, waitingSignals, humanInputSignals };
}

export function parseMalformedResult(input: unknown): ParsedCursorResult {
  return parseCursorResult(typeof input === "string" ? input : "", "UNKNOWN");
}

const FOLLOW_UP_LINE = /^\s*(?:next step|follow[- ]?up|todo)\s*:\s*(.+)\s*$/gim;
const UNRESOLVED_LINE = /^\s*(?:unresolved|remaining|outstanding|issue)s?\s*:\s*(.+)$/gim;
const FILES_CHANGED_LINE = /^\s*files?\s+changed\s*:\s*(.+)$/gim;

const TEST_FAIL_PATTERNS = [/\btests?\s*:?\s*FAIL\b/i, /\b\d+\s+failing tests?\b/i, /\bfailing tests?:/i];
const TEST_PASS_PATTERNS = [/\btests?\s*:?\s*PASS\b/i, /\b\d+\s+passed\b/i, /\ball tests pass/i];
const BUILD_FAIL_PATTERNS = [/build\s*:?\s*FAIL/i, /Failed to compile/i, /error TS\d+/i];
const BUILD_PASS_PATTERNS = [/build\s*:?\s*PASS/i, /compiled successfully/i];
const SUSPICIOUS_PATTERNS = [
  /\buncertain\b/i,
  /\bnot sure\b/i,
  /\bmay need verification\b/i,
  /\bunverified\b/i,
  /\bsuspicious\b/i,
  /\bneeds (manual )?review\b/i,
];

function matchAllLines(text: string, pattern: RegExp): string[] {
  const results: string[] = [];
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = global.exec(text)) !== null) {
    const value = match[1]?.trim();
    if (value) results.push(value);
  }
  return results;
}

/** Deterministic structured extraction from report text (no AI). */
export function extractResultFields(
  reportText: string,
  options?: { gitChangedFiles?: string[] },
): ExtractedResultFields {
  const trimmed = typeof reportText === "string" ? reportText : "";
  const malformed = !trimmed.trim();

  const followUpLines = matchAllLines(trimmed, FOLLOW_UP_LINE);
  const unresolvedIssues = matchAllLines(trimmed, UNRESOLVED_LINE);
  const inlineFiles = matchAllLines(trimmed, FILES_CHANGED_LINE).flatMap((line) =>
    line.split(/[,;]/).map((f) => f.trim()).filter(Boolean),
  );
  const filesChanged = [...new Set([...(options?.gitChangedFiles ?? []), ...inlineFiles])];

  const testsFailed = TEST_FAIL_PATTERNS.some((p) => p.test(trimmed));
  const testsPassed = TEST_PASS_PATTERNS.some((p) => p.test(trimmed)) && !testsFailed;
  const buildFailed = BUILD_FAIL_PATTERNS.some((p) => p.test(trimmed));
  const buildPassed = BUILD_PASS_PATTERNS.some((p) => p.test(trimmed)) && !buildFailed;
  const suspicious = SUSPICIOUS_PATTERNS.some((p) => p.test(trimmed)) || malformed;

  const summaryLine = trimmed.split("\n").find((l) => l.trim())?.trim() ?? "";

  return {
    testsFailed,
    testsPassed,
    buildFailed,
    buildPassed,
    followUpLines,
    unresolvedIssues,
    filesChanged,
    completedWorkSummary: summaryLine,
    suspicious,
    malformed,
  };
}
