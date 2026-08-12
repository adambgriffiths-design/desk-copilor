import type { StepResult } from "./decision-types";
import { CONFIDENCE_THRESHOLD } from "./decision-types";

/** Aggregate confidence = minimum step score (weakest link). */
export function aggregateConfidence(steps: StepResult[]): number {
  if (!steps.length) return 0;
  return Math.min(...steps.map((s) => s.confidence));
}

export function passesRiskGate(input: {
  steps: StepResult[];
  dataQualityOk: boolean;
  qualityFlag: string;
}): { pass: boolean; confidence: number; failedRules: string[] } {
  const failedRules: string[] = [];
  const confidence = aggregateConfidence(input.steps);

  if (input.qualityFlag !== "good" && input.qualityFlag !== "degraded") {
    failedRules.push("market_state_quality_unusable");
  }
  if (!input.dataQualityOk) {
    failedRules.push("chart_data_missing_or_stale");
  }
  for (const step of input.steps) {
    if (step.confidence < CONFIDENCE_THRESHOLD) {
      failedRules.push(`step_${step.step}_below_${CONFIDENCE_THRESHOLD}`);
    }
    if (step.failedRules?.length) {
      failedRules.push(...step.failedRules);
    }
  }

  const pass =
    failedRules.length === 0 &&
    confidence >= CONFIDENCE_THRESHOLD &&
    (input.qualityFlag === "good" || input.qualityFlag === "degraded");

  return { pass, confidence, failedRules: [...new Set(failedRules)] };
}

export function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 90) return "high";
  if (score >= CONFIDENCE_THRESHOLD) return "medium";
  return "low";
}
