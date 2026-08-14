import type { Bar } from "../../types";
import { computeExcursion } from "./excursion";
import type { OutcomeLabels, ReplayDirection } from "./types";

/**
 * Outcome Evaluator — runs ONLY after decision is locked.
 * Accepts explicit entry/stop/target/direction; does not assume strategy.
 */
export function evaluateOutcome(input: {
  direction: ReplayDirection;
  entry: number | null;
  target: number | null;
  invalidation: number | null;
  forwardBars: Bar[];
}): OutcomeLabels {
  const result = computeExcursion(input);
  return {
    mfe: result.mfe,
    mae: result.mae,
    targetHit: result.targetHit,
    invalidationHit: result.invalidationHit,
    firstHit: result.firstHit,
    barsToTarget: result.barsToTarget,
    barsToInvalidation: result.barsToInvalidation,
    barsToOutcome: result.barsToOutcome,
    finalOutcome: result.outcome,
  };
}
