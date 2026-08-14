import type { Bar } from "../../types";
import type { WalkForwardPlan, WalkForwardWindow } from "./types";

export type WalkForwardSplitConfig = {
  trainRatio?: number;
  validationRatio?: number;
  testRatio?: number;
};

const DEFAULT_RATIOS = { trainRatio: 0.6, validationRatio: 0.2, testRatio: 0.2 };

/**
 * Chronological walk-forward split — interface only.
 * No shuffle, no training hooks. Returns index windows for backtest scoping.
 */
export function planWalkForward(m1: Bar[], config: WalkForwardSplitConfig = {}): WalkForwardPlan {
  const { trainRatio, validationRatio, testRatio } = { ...DEFAULT_RATIOS, ...config };
  const sum = trainRatio + validationRatio + testRatio;
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Walk-forward ratios must sum to 1.0 (got ${sum})`);
  }

  const totalBars = m1.length;
  const trainEnd = Math.floor(totalBars * trainRatio);
  const valEnd = trainEnd + Math.floor(totalBars * validationRatio);

  const windows: WalkForwardWindow[] = [
    sliceWindow(m1, "TRAIN", 0, trainEnd - 1),
    sliceWindow(m1, "VALIDATION", trainEnd, valEnd - 1),
    sliceWindow(m1, "TEST", valEnd, totalBars - 1),
  ].filter((w) => w.startIndex <= w.endIndex);

  return { totalBars, windows };
}

function sliceWindow(
  m1: Bar[],
  phase: WalkForwardWindow["phase"],
  startIndex: number,
  endIndex: number
): WalkForwardWindow {
  const start = Math.max(0, startIndex);
  const end = Math.min(m1.length - 1, endIndex);
  return {
    phase,
    startIndex: start,
    endIndex: end,
    startTime: m1[start]?.time.toISOString() ?? "",
    endTime: m1[end]?.time.toISOString() ?? "",
  };
}
