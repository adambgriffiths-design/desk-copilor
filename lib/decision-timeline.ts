/**
 * Decision timeline — version control for chart state. Scrub backward to replay Karen's read.
 */
import type { DeskTrackerPhase, TrackerStatusColor } from "./desk-state-machine";
import type { TrackerEvent } from "./pending-events";
import type { TradingVerdict } from "./desk-schema";

export type TimelineEntry = {
  id: string;
  ts: string;
  bar_time?: number;
  price: number;
  phase: DeskTrackerPhase;
  status_color: TrackerStatusColor;
  verdict: TradingVerdict | "—";
  transition: string;
  what_changed: string;
  watching: string[];
  pending_count: number;
  state_hash: string;
  frozen: boolean;
};

const MAX_ENTRIES = 80;
let timeline: TimelineEntry[] = [];

export function getDecisionTimeline(): TimelineEntry[] {
  return [...timeline];
}

export function getTimelineEntry(id: string): TimelineEntry | undefined {
  return timeline.find((e) => e.id === id);
}

export function getLatestTimelineEntry(): TimelineEntry | undefined {
  return timeline.at(-1);
}

export function addTimelineEntry(entry: Omit<TimelineEntry, "id">): TimelineEntry {
  const id = `tl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const full: TimelineEntry = { ...entry, id };
  timeline.push(full);
  if (timeline.length > MAX_ENTRIES) timeline = timeline.slice(-MAX_ENTRIES);
  return full;
}

export function freezeTimelineAt(index: number): TimelineEntry | null {
  const entry = timeline[index];
  if (!entry) return null;
  entry.frozen = true;
  return entry;
}

export function clearDecisionTimeline(): void {
  timeline = [];
}

export function serializeTimeline(): string {
  return JSON.stringify(timeline);
}

export function loadTimeline(json: string): void {
  try {
    const parsed = JSON.parse(json) as TimelineEntry[];
    if (Array.isArray(parsed)) timeline = parsed.slice(-MAX_ENTRIES);
  } catch {
    timeline = [];
  }
}

export function transitionBrief(
  prev: TimelineEntry | null,
  next: {
    phase: DeskTrackerPhase;
    verdict: TradingVerdict | "—";
    confirmed: TrackerEvent[];
    pending: TrackerEvent[];
  }
): string {
  if (!prev) return "First tracker snapshot this session.";
  if (prev.phase === next.phase && prev.verdict === next.verdict) {
    if (next.pending.length) {
      return `Nothing confirmed changed — watching ${next.pending.length} pending item(s).`;
    }
    return "Nothing material changed since last close.";
  }
  const parts: string[] = [];
  if (prev.phase !== next.phase) {
    parts.push(`Phase ${prev.phase.replace(/_/g, " ")} → ${next.phase.replace(/_/g, " ")}`);
  }
  if (prev.verdict !== next.verdict) {
    parts.push(`Verdict ${prev.verdict} → ${next.verdict}`);
  }
  for (const c of next.confirmed.slice(0, 2)) {
    parts.push(c.detail);
  }
  return parts.join(". ") || "State updated on candle close.";
}

export function formatTimelineForPanel(entry: TimelineEntry): string {
  return [
    `${entry.ts.slice(11, 19)} · ${entry.price.toFixed(2)} · ${entry.phase.replace(/_/g, " ")}`,
    entry.transition,
    entry.watching.length ? `Watching: ${entry.watching.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
