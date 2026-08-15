import { planWalkForward } from "../backtest/walkforward";
import type { Bar } from "../../types";
import type { EvidenceClass, SampleAdequacy, SplitPhase } from "./types";
import { MIN_N_MEANINGFUL, MIN_N_REPORT } from "./types";

export type TemporalSplit = {
  phase: SplitPhase;
  startIndex: number;
  endIndex: number;
  startTime: string;
  endTime: string;
};

/**
 * Strict chronological TRAIN / VALIDATION / OOS.
 * No shuffle. Architecture selection on VALIDATION or OOS is forbidden.
 */
export function planTemporalSplits(m1: Bar[]): TemporalSplit[] {
  const plan = planWalkForward(m1, { trainRatio: 0.6, validationRatio: 0.2, testRatio: 0.2 });
  return plan.windows.map((w) => ({
    phase: w.phase === "TEST" ? "OOS" : w.phase,
    startIndex: w.startIndex,
    endIndex: w.endIndex,
    startTime: w.startTime,
    endTime: w.endTime,
  }));
}

export function assignSplit(m1: Bar[], timestamp: string, splits: TemporalSplit[]): SplitPhase | null {
  const t = new Date(timestamp).getTime();
  for (const s of splits) {
    const a = new Date(s.startTime).getTime();
    const b = new Date(s.endTime).getTime();
    if (t >= a && t <= b) return s.phase;
  }
  const idx = m1.findIndex((b) => b.time.toISOString() === timestamp);
  if (idx < 0) return null;
  for (const s of splits) {
    if (idx >= s.startIndex && idx <= s.endIndex) return s.phase;
  }
  return null;
}

export function sampleAdequacy(n: number): SampleAdequacy {
  if (n < MIN_N_REPORT) return "insufficient";
  if (n < MIN_N_MEANINGFUL) return "minimum";
  return "adequate";
}

export function evidenceClassForDataset(input: {
  uniqueSessionDays: number;
  n: number;
  phase: SplitPhase;
}): EvidenceClass {
  if (input.uniqueSessionDays <= 1) return "INFRASTRUCTURE";
  if (input.n < MIN_N_MEANINGFUL) return "INFRASTRUCTURE";
  if (input.phase !== "OOS") return "INFRASTRUCTURE";
  return "EDGE";
}

export function assertNoSelectOnEval(meta: { selectedArchitectureFrom?: SplitPhase | null }): string[] {
  const errors: string[] = [];
  if (meta.selectedArchitectureFrom === "VALIDATION" || meta.selectedArchitectureFrom === "OOS") {
    errors.push("Architecture selection on VALIDATION/OOS is forbidden");
  }
  return errors;
}

export function uniqueSessionDays(timestamps: string[]): number {
  const days = new Set(timestamps.map((t) => t.slice(0, 10)));
  return days.size;
}
