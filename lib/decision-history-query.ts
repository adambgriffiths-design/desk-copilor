/**
 * Parse clock-time / compare queries for DecisionEnvelope history time-travel.
 * Does not change mentor intent taxonomy — callers may still use CHANGE_ANALYSIS.
 */
import {
  isChangeAnalysisQuestion,
  isDecisionAtTimeQuestion,
  normalizeMentorText,
  parseDecisionLookbackMinutes,
} from "./mentor-intent";

export type DecisionHistoryQueryKind =
  | "at_time"
  | "since"
  | "between"
  | "why_changed"
  | "minutes_ago"
  | "what_changed"
  | "last_recorded"
  | "immediately_before"
  | "none";

export type ParsedClockTime = {
  /** Hour 0–23 */
  hour: number;
  /** Minute 0–59 */
  minute: number;
  raw: string;
};

export type ParsedDecisionHistoryQuery = {
  kind: DecisionHistoryQueryKind;
  /** Single time for at_time / since / why_changed */
  time?: ParsedClockTime;
  /** Pair for between */
  from?: ParsedClockTime;
  to?: ParsedClockTime;
  /** Relative lookback in minutes ("10 minutes ago") */
  lookbackMinutes?: number;
};

const CLOCK_RE =
  /\b(?:at\s+|since\s+|from\s+|between\s+)?(\d{1,2})(?::|\.)(\d{2})\s*(am|pm)?\b/gi;

function parseOneClock(hourRaw: string, minuteRaw: string, ampm?: string | null): ParsedClockTime | null {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (minute < 0 || minute > 59) return null;
  const mer = (ampm || "").toLowerCase();
  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  if (!mer && hour > 23) return null;
  if (hour < 0 || hour > 23) return null;
  return {
    hour,
    minute,
    raw: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/** Extract all HH:MM (optional am/pm) clock tokens from text. */
export function extractClockTimes(text: string): ParsedClockTime[] {
  const q = String(text || "");
  const out: ParsedClockTime[] = [];
  const seen = new Set<string>();
  CLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLOCK_RE.exec(q)) != null) {
    const parsed = parseOneClock(m[1]!, m[2]!, m[3]);
    if (!parsed) continue;
    if (seen.has(parsed.raw)) continue;
    seen.add(parsed.raw);
    out.push(parsed);
  }
  return out;
}

export function clockToMinutes(t: ParsedClockTime): number {
  return t.hour * 60 + t.minute;
}

/**
 * Classify decision-history / what-changed questions that name clock times
 * or ask why the decision changed.
 */
export function parseDecisionHistoryQuery(text: string): ParsedDecisionHistoryQuery {
  const raw = String(text || "").trim();
  const q = normalizeMentorText(raw);
  if (!q) return { kind: "none" };

  const clocks = extractClockTimes(raw);
  const whyChanged =
    /\bwhy did (?:your|the) (?:decision|view|read|bias|call|stance) change\b/.test(q) ||
    /\bwhy did (?:you|it) change\b/.test(q);

  // why-changed takes priority over bare "since" when both appear
  if (whyChanged) {
    return clocks.length >= 1
      ? { kind: "why_changed", time: clocks[0] }
      : { kind: "why_changed" };
  }

  // Narrow recorded-history phrases (before generic at_time)
  if (
    /\blast recorded (?:decision|call|read|stance|view)\b/.test(q) ||
    /\byour last recorded decision\b/.test(q)
  ) {
    return { kind: "last_recorded" };
  }

  if (/\bimmediately before\b/.test(q) && clocks.length >= 1) {
    return { kind: "immediately_before", time: clocks[0] };
  }

  if (/\bbetween\b/.test(q) && clocks.length >= 2) {
    const a = clocks[0]!;
    const b = clocks[1]!;
    const from = clockToMinutes(a) <= clockToMinutes(b) ? a : b;
    const to = clockToMinutes(a) <= clockToMinutes(b) ? b : a;
    return { kind: "between", from, to };
  }

  if (/\bsince\b/.test(q) && clocks.length >= 1) {
    return { kind: "since", time: clocks[0] };
  }

  if (
    clocks.length >= 1 &&
    (/\bat\b/.test(q) ||
      /\bwhat was your (?:decision|call|read|stance|view)\b/.test(q) ||
      /\bdecision at\b/.test(q) ||
      /\b(?:your|the) decision\b/.test(q))
  ) {
    return { kind: "at_time", time: clocks[0] };
  }

  if (
    clocks.length >= 2 &&
    (/\bwhat(?:'s| is| was)? different\b/.test(q) || /\bwhat changed\b/.test(q))
  ) {
    const a = clocks[0]!;
    const b = clocks[1]!;
    const from = clockToMinutes(a) <= clockToMinutes(b) ? a : b;
    const to = clockToMinutes(a) <= clockToMinutes(b) ? b : a;
    return { kind: "between", from, to };
  }

  if (clocks.length === 1 && /\bwhat changed\b/.test(q)) {
    return { kind: "since", time: clocks[0] };
  }

  // Relative: "What was your decision 10 minutes ago?"
  if (isDecisionAtTimeQuestion(raw)) {
    const mins = parseDecisionLookbackMinutes(raw) ?? 10;
    return { kind: "minutes_ago", lookbackMinutes: mins };
  }

  // Bare / relative what-changed without clock
  if (isChangeAnalysisQuestion(raw)) {
    const mins = parseDecisionLookbackMinutes(raw);
    return mins != null
      ? { kind: "what_changed", lookbackMinutes: mins }
      : { kind: "what_changed" };
  }

  return { kind: "none" };
}

export function isDecisionHistoryTimeQuery(text: string): boolean {
  const p = parseDecisionHistoryQuery(text);
  return p.kind !== "none";
}
