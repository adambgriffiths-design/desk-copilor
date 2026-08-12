import type {
  ConceptEvaluation,
  ConceptKey,
  ConceptRollup,
  FeatureSet,
  SelfCheckResult,
  StepResult,
  VerdictEnum,
  VerdictProbabilities,
} from "./decision-schema";
import {
  CONFIDENCE_THRESHOLD,
  CONCEPT_WEIGHTS,
  CRITICAL_CONCEPTS,
} from "./decision-schema";

const WEIGHT_SUM = Object.values(CONCEPT_WEIGHTS).reduce((a, b) => a + b, 0);

export function aggregateConfidence(steps: StepResult[]): number {
  if (!steps.length) return 0;
  return Math.min(...steps.map((s) => s.confidence));
}

/** Weighted rollup — normalized 0–100 from concept scores × weights. */
export function rollupConceptScores(concepts: ConceptEvaluation[]): ConceptRollup {
  const failed_critical = concepts
    .filter((c) => CRITICAL_CONCEPTS.includes(c.concept) && c.status === "fail")
    .map((c) => c.concept);

  const parts = concepts.map(
    (c) => `${c.concept} ${c.score}×${c.weight}=${c.weighted_contribution.toFixed(1)}`
  );
  const raw_score = concepts.reduce((s, c) => s + c.weighted_contribution, 0);
  const weighted_total = Math.round((raw_score / WEIGHT_SUM) * 10) / 10;

  return {
    raw_score: Math.round(raw_score * 10) / 10,
    weighted_total,
    breakdown: `${parts.join(" + ")} = ${raw_score.toFixed(1)} raw → ${weighted_total} normalized`,
    critical_fail: failed_critical.length > 0,
    failed_critical,
  };
}

/** Deterministic probability calibration from concept scores — not LLM guessing. */
export function computeProbabilities(input: {
  rollup: ConceptRollup;
  concepts: ConceptEvaluation[];
  entry_status?: string;
}): VerdictProbabilities {
  if (input.rollup.critical_fail) {
    return { trade: 0, wait: 0, no_trade: 1 };
  }

  const wt = input.rollup.weighted_total / 100;
  const entry = input.concepts.find((c) => c.concept === "entry_zone");
  const entryActive = input.entry_status === "ACTIVE" || (entry?.score ?? 0) >= 88;
  const entryWait = input.entry_status === "WAIT" || (entry && entry.score >= 80 && entry.score < 88);

  let trade = 0;
  let wait = 0;
  let no_trade = 0;

  if (wt >= 0.8) {
    if (entryActive) {
      trade = 0.55 + (wt - 0.8) * 1.5;
      wait = 0.3 - (wt - 0.8) * 0.3;
      no_trade = 1 - trade - wait;
    } else if (entryWait) {
      wait = 0.5 + (wt - 0.8);
      trade = 0.25;
      no_trade = 1 - wait - trade;
    } else {
      trade = 0.4;
      wait = 0.35;
      no_trade = 0.25;
    }
  } else if (wt >= 0.6) {
    wait = 0.3 + (wt - 0.6) * 0.75;
    no_trade = 0.45 - (wt - 0.6) * 0.5;
    trade = 1 - wait - no_trade;
  } else {
    no_trade = 0.55 + (0.6 - wt) * 0.6;
    wait = 0.25;
    trade = 1 - no_trade - wait;
  }

  const sum = trade + wait + no_trade;
  return {
    trade: Math.round((trade / sum) * 1000) / 1000,
    wait: Math.round((wait / sum) * 1000) / 1000,
    no_trade: Math.round((no_trade / sum) * 1000) / 1000,
  };
}

export function resolveVerdictFromProbabilities(
  probs: VerdictProbabilities,
  rollup: ConceptRollup,
  entry_status?: string
): VerdictEnum {
  if (rollup.critical_fail) return "no_trade";
  if (rollup.weighted_total < CONFIDENCE_THRESHOLD) return "no_trade";

  const entries: Array<[VerdictEnum, number]> = [
    ["trade", probs.trade],
    ["wait", probs.wait],
    ["no_trade", probs.no_trade],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0][0];

  if (top === "trade" && entry_status === "WAIT") return "wait";
  if (top === "trade" && entry_status === "EXTENDED") return "wait";
  return top;
}

export function confidenceFromProbabilities(probs: VerdictProbabilities): number {
  return Math.round(Math.max(probs.trade, probs.wait, probs.no_trade) * 100);
}

export function passesRiskGate(input: {
  steps: StepResult[];
  data_quality_ok: boolean;
  quality_flag: string;
  rollup?: ConceptRollup;
}): { pass: boolean; confidence: number; failed_rules: string[] } {
  const failed_rules: string[] = [];
  const confidence = input.rollup?.weighted_total ?? aggregateConfidence(input.steps);

  if (input.rollup?.critical_fail) {
    failed_rules.push("critical_concept_fail");
    for (const c of input.rollup.failed_critical) {
      failed_rules.push(`critical_${c}_fail`);
    }
  }
  if (input.quality_flag !== "good" && input.quality_flag !== "degraded") {
    failed_rules.push("market_state_quality_unusable");
  }
  if (!input.data_quality_ok) {
    failed_rules.push("chart_data_missing_or_stale");
  }
  if (confidence < CONFIDENCE_THRESHOLD) {
    failed_rules.push(`weighted_total_below_${CONFIDENCE_THRESHOLD}`);
  }

  const pass =
    failed_rules.length === 0 &&
    confidence >= CONFIDENCE_THRESHOLD &&
    (input.quality_flag === "good" || input.quality_flag === "degraded");

  return { pass, confidence, failed_rules: [...new Set(failed_rules)] };
}

export function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 90) return "high";
  if (score >= CONFIDENCE_THRESHOLD) return "medium";
  return "low";
}

export function runSelfCheck(input: {
  steps: StepResult[];
  verdict: VerdictEnum;
  features: FeatureSet;
  aggregate_confidence: number;
  gate_pass: boolean;
  rollup: ConceptRollup;
  concepts: ConceptEvaluation[];
}): SelfCheckResult {
  const checks: string[] = [];
  const vetoReasons: string[] = [];

  checks.push("critical_concept_gate");
  if (input.rollup.critical_fail) {
    vetoReasons.push(
      `critical concept fail: ${input.rollup.failed_critical.join(", ")}`
    );
  }

  checks.push("quality_gate");
  if (
    input.features.market_state.quality.flag !== "good" &&
    input.features.market_state.quality.flag !== "degraded"
  ) {
    vetoReasons.push("market_state quality is not usable");
  }

  checks.push("data_completeness");
  if (!input.features.data_quality_ok) {
    vetoReasons.push("chart data missing, stale, or insufficient candles");
  }

  checks.push("confidence_gate");
  if (input.rollup.weighted_total < CONFIDENCE_THRESHOLD) {
    vetoReasons.push(
      `weighted total ${input.rollup.weighted_total} below ${CONFIDENCE_THRESHOLD}`
    );
  }

  checks.push("risk_gate");
  if (!input.gate_pass) {
    vetoReasons.push("risk gate failed");
  }

  const mss = input.concepts.find((c) => c.concept === "mss");
  if (mss?.status === "fail" && mss.evidence.some((e) => e.includes("opposes"))) {
    checks.push("mss_bias_alignment");
    vetoReasons.push("market structure shift opposes tradeable bias");
  }

  if (input.verdict === "trade" && !input.features.execution) {
    checks.push("execution_present");
    vetoReasons.push("trade verdict without execution scaffold");
  }

  checks.push("evidence_present");

  const passed = vetoReasons.length === 0;
  return {
    passed,
    ...(passed ? {} : { veto_reason: vetoReasons.join("; ") }),
    checks,
  };
}

export function applySelfCheckVeto(
  verdict: VerdictEnum,
  selfCheck: SelfCheckResult
): VerdictEnum {
  if (!selfCheck.passed) return "no_trade";
  return verdict;
}

/** Unit-testable rollup math — exported for test:replay. */
export function computeRollupMath(concepts: ConceptEvaluation[]): {
  raw_score: number;
  weighted_total: number;
  contributions: Record<ConceptKey, number>;
} {
  const rollup = rollupConceptScores(concepts);
  const contributions = Object.fromEntries(
    concepts.map((c) => [c.concept, c.weighted_contribution])
  ) as Record<ConceptKey, number>;
  return {
    raw_score: rollup.raw_score,
    weighted_total: rollup.weighted_total,
    contributions,
  };
}
