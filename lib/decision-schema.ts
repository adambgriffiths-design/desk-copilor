/**
 * Strict JSON schema for institutional decision pipeline.
 * Source of truth types — must conform to docs/ICT_DECISION_SPEC.md
 */

import type { ExecutionScaffold } from "./execution-plan";
import type { BiasStack } from "./bias-analysis";
import type { MarketState } from "./market-state";
import type { MarketContext } from "./types";

/** Verdict enum — underscore form for JSON/API. */
export type VerdictEnum = "trade" | "wait" | "no_trade";

export const CONFIDENCE_THRESHOLD = 80;

/** ICT concepts scored explicitly per ICT_DECISION_SPEC §ICT Concept Evaluation. */
export type ConceptKey =
  | "htf_bias"
  | "liquidity"
  | "premium_discount"
  | "mss"
  | "displacement"
  | "fvg"
  | "entry_zone"
  | "session"
  | "data_quality";

export type ConceptStatus = "pass" | "fail" | "neutral";

/** Tunable weights — sum to 1.0; see ICT_DECISION_SPEC §Rollup Weights. */
export const CONCEPT_WEIGHTS: Record<ConceptKey, number> = {
  data_quality: 0.15,
  htf_bias: 0.20,
  liquidity: 0.15,
  premium_discount: 0.10,
  mss: 0.10,
  displacement: 0.08,
  fvg: 0.1,
  entry_zone: 0.12,
  session: 0.1,
};

export type ConceptEvaluation = {
  concept: ConceptKey;
  score: number;
  weight: number;
  weighted_contribution: number;
  status: ConceptStatus;
  evidence: string[];
  rule_ref: string;
};

/** Critical concepts — status fail forces no_trade regardless of rollup. */
export const CRITICAL_CONCEPTS: ConceptKey[] = ["data_quality", "htf_bias"];

export type ConceptRollup = {
  raw_score: number;
  weighted_total: number;
  breakdown: string;
  critical_fail: boolean;
  failed_critical: ConceptKey[];
};

export type VerdictProbabilities = {
  trade: number;
  wait: number;
  no_trade: number;
};

export type StepResult = {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  result: string;
  confidence: number;
  evidence: string[];
  failed_rules?: string[];
};

export type SelfCheckResult = {
  passed: boolean;
  veto_reason?: string;
  checks: string[];
};

export type VerdictDelta = {
  verdict_changed: boolean;
  prev_verdict?: VerdictEnum;
  concept_deltas: Array<{
    concept: ConceptKey;
    prev_score: number;
    score: number;
    delta: number;
    direction: "up" | "down" | "unchanged";
  }>;
  field_changes: string[];
  mentor_brief: string;
};

export type FeatureSet = {
  market_state: MarketState;
  bias_stack: BiasStack;
  premium_discount: MarketContext["premiumDiscount"];
  liquidity_targets: {
    pdh: number;
    pdl: number;
    pdc: number;
    session_high: number;
    session_low: number;
    nearest_support?: number;
    nearest_support_label?: string;
    nearest_resistance?: number;
    nearest_resistance_label?: string;
    recent_sweeps: number;
  };
  structure: {
    mss_direction?: "bullish" | "bearish";
    mss_level?: number;
    mss_description?: string;
    unfilled_fvg_count: number;
    nearest_fvg_direction?: "bullish" | "bearish";
    summary: string;
  };
  execution: ExecutionScaffold | null;
  direction: "long" | "short" | null;
  data_quality_ok: boolean;
};

export type VerdictJSON = {
  verdict: VerdictEnum;
  probabilities: VerdictProbabilities;
  confidence: number;
  direction?: "long" | "short";
  call: string;
  concepts: ConceptEvaluation[];
  rollup: ConceptRollup;
  steps: StepResult[];
  evidence: string[];
  reason: string;
  self_check: SelfCheckResult;
  state_hash: string;
  panel_brief: string;
  spoken_brief: string;
  mentor_brief?: string;
  delta?: VerdictDelta;
  execution?: {
    entry_zone: string;
    entry_status: string;
    target_1: string;
    wait_for?: string;
  };
  meta: string;
  no_trade_reason?: string;
};

export type RunningStateEntry = {
  ts: string;
  verdict: VerdictEnum;
  reason: string;
  state_hash: string;
  confidence: number;
};

export type RunningState = {
  last_verdict: VerdictJSON | null;
  last_market_state_hash: string | null;
  last_updated: string;
  history: RunningStateEntry[];
};

export type LabeledCall = {
  id: string;
  fixture: string;
  expected_verdict: VerdictEnum;
  expected_direction?: "long" | "short";
  label_reason: string;
  expected_concepts?: Partial<Record<ConceptKey, ConceptStatus>>;
};

export type ReplayConceptResult = {
  concept: ConceptKey;
  expected_status?: ConceptStatus;
  actual_status: ConceptStatus;
  actual_score: number;
  match: boolean;
};

export type ReplayResult = {
  id: string;
  expected_verdict: VerdictEnum;
  actual_verdict: VerdictEnum;
  match: boolean;
  confidence: number;
  probabilities: VerdictProbabilities;
  concept_results: ReplayConceptResult[];
  step_diffs: string[];
  label_reason: string;
};

export type ReplayReport = {
  ts: string;
  total: number;
  verdict_match_pct: number;
  concept_accuracy_pct: Record<ConceptKey, number>;
  calibration: {
    avg_prob_correct: number;
    avg_prob_incorrect: number;
  };
  results: ReplayResult[];
};

const VERDICT_ENUMS: VerdictEnum[] = ["trade", "wait", "no_trade"];

export const CONCEPT_KEYS: ConceptKey[] = [
  "htf_bias",
  "liquidity",
  "premium_discount",
  "mss",
  "displacement",
  "fvg",
  "entry_zone",
  "session",
  "data_quality",
];

export function isVerdictEnum(v: unknown): v is VerdictEnum {
  return typeof v === "string" && VERDICT_ENUMS.includes(v as VerdictEnum);
}

export function normalizeVerdict(v: string): VerdictEnum {
  const s = v.trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "no_trade" || s === "no_call" || s === "notrade") return "no_trade";
  if (s === "wait") return "wait";
  if (s === "trade") return "trade";
  return "no_trade";
}

export function toLegacyVerdict(v: VerdictEnum): "trade" | "wait" | "no trade" {
  if (v === "no_trade") return "no trade";
  return v;
}

export function fromLegacyVerdict(v: string): VerdictEnum {
  return normalizeVerdict(v);
}

export function scoreToStatus(score: number): ConceptStatus {
  if (score >= CONFIDENCE_THRESHOLD) return "pass";
  if (score >= 60) return "neutral";
  return "fail";
}

export function attachWeights(concepts: Omit<ConceptEvaluation, "weight" | "weighted_contribution">[]): ConceptEvaluation[] {
  return concepts.map((c) => {
    const weight = CONCEPT_WEIGHTS[c.concept];
    return {
      ...c,
      weight,
      weighted_contribution: Math.round(c.score * weight * 10) / 10,
    };
  });
}

export function validateVerdictJSON(v: VerdictJSON): string[] {
  const errors: string[] = [];
  if (!isVerdictEnum(v.verdict)) errors.push("invalid verdict enum");
  if (v.confidence < 0 || v.confidence > 100) errors.push("confidence out of range");
  if (!v.concepts?.length) errors.push("concepts array required");
  if (v.concepts?.length !== CONCEPT_KEYS.length) errors.push("expected 9 concept evaluations");
  if (!v.rollup) errors.push("rollup required");
  if (!v.probabilities) errors.push("probabilities required");
  const probSum = v.probabilities.trade + v.probabilities.wait + v.probabilities.no_trade;
  if (Math.abs(probSum - 1) > 0.02) errors.push("probabilities must sum to ~1.0");
  if (v.steps.length !== 6) errors.push("expected 6 pipeline steps");
  if (!v.evidence.length && v.verdict !== "no_trade") errors.push("evidence required for trade/wait");
  for (const step of v.steps) {
    if (step.confidence < 0 || step.confidence > 100) {
      errors.push(`step ${step.step} confidence out of range`);
    }
  }
  return errors;
}

/** Example verdict for docs and tests. */
export const EXAMPLE_VERDICT_JSON: VerdictJSON = {
  verdict: "wait",
  probabilities: { trade: 0.12, wait: 0.68, no_trade: 0.2 },
  confidence: 68,
  direction: "long",
  call: "potential buy",
  concepts: attachWeights([
    {
      concept: "htf_bias",
      status: "pass",
      score: 92,
      evidence: ["bias_stack.tradeable_bias: bullish", "bias_stack.aligned_count: 3"],
      rule_ref: "ICT_DECISION_SPEC §4.1",
    },
    {
      concept: "liquidity",
      status: "pass",
      score: 90,
      evidence: ["market_state.levels.pdh: 25200.00", "session.ny_rth_high: 25150.00"],
      rule_ref: "ICT_DECISION_SPEC §5.1",
    },
    {
      concept: "premium_discount",
      status: "pass",
      score: 88,
      evidence: ["premium_discount.vs_current_day_range: premium"],
      rule_ref: "ICT_DECISION_SPEC §6.1",
    },
    {
      concept: "mss",
      status: "pass",
      score: 90,
      evidence: ["structure.mss_direction: bullish"],
      rule_ref: "ICT_DECISION_SPEC §7.1",
    },
    {
      concept: "displacement",
      status: "pass",
      score: 85,
      evidence: ["market_state.candles: impulsive bullish body in lookback"],
      rule_ref: "ICT_DECISION_SPEC §7.2",
    },
    {
      concept: "fvg",
      status: "pass",
      score: 82,
      evidence: ["structure.unfilled_fvg_count: 1", "structure.nearest_fvg_direction: bullish"],
      rule_ref: "ICT_DECISION_SPEC §7.3",
    },
    {
      concept: "entry_zone",
      status: "neutral",
      score: 80,
      evidence: ["execution.entry_status: WAIT"],
      rule_ref: "ICT_DECISION_SPEC §8.1",
    },
    {
      concept: "session",
      status: "pass",
      score: 88,
      evidence: ["active_session.id: ny_am", "active_session.kill_zone: true"],
      rule_ref: "ICT_DECISION_SPEC §8.2",
    },
    {
      concept: "data_quality",
      status: "pass",
      score: 95,
      evidence: ["market_state.quality.flag: good"],
      rule_ref: "ICT_DECISION_SPEC §9.1",
    },
  ]),
  rollup: {
    raw_score: 88.7,
    weighted_total: 88.7,
    breakdown:
      "htf_bias 92×0.20=18.4 + liquidity 90×0.15=13.5 + premium_discount 88×0.10=8.8 + mss 90×0.10=9.0 + displacement 85×0.08=6.8 + fvg 82×0.10=8.2 + entry_zone 80×0.12=9.6 + session 88×0.10=8.8 + data_quality 95×0.15=14.3 = 88.7",
    critical_fail: false,
    failed_critical: [],
  },
  steps: [],
  evidence: [
    "market_state.last_price: 25100.00",
    "market_state.levels.pdh: 25200.00",
    "bias_stack.tradeable_bias: bullish",
    "execution.entry_status: WAIT",
  ],
  reason: "Higher timeframe bias is bullish but entry zone is not ready",
  self_check: { passed: true, checks: ["confidence_gate", "quality_gate", "evidence_present"] },
  state_hash: "abc12345",
  panel_brief: "Price: 25100.00\nCall: potential buy\nEntry status: WAIT",
  spoken_brief:
    "Bias pass, entry wait, confidence 68 — wait. Nasdaq futures at 25100 with bullish bias; entry zone not ready yet.",
  mentor_brief:
    "Since last check: bias unchanged, structure intact, entry still waiting for retrace — verdict stays wait.",
  execution: {
    entry_zone: "25085.00–25095.00",
    entry_status: "WAIT",
    target_1: "25200.00 (previous day high)",
    wait_for: "Retrace to entry zone",
  },
  meta: "confidence=68 | prob_wait=0.68 | call=potential buy | weighted=88.7",
};

export type { MarketState } from "./market-state";
