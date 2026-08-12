/**
 * Three-layer desk pipeline schema — source of truth for docs/ICT_DECISION_SPEC.md
 * Observation (facts) → Interpretation (meaning) → Decision (verdict)
 *
 * HARD RULE: observation JSON is immutable once produced. Interpretation must not
 * modify, invent, or reinterpret observations. Unknown fields propagate as unknown.
 */

import type { MarketState } from "./market-state";

export type ObservationStructure = "unknown" | "bullish" | "bearish" | "unclear";
export type DisplacementStatus = "unknown" | "present" | "absent";
export type FvgObservationStatus = "unknown" | "present" | "absent" | "invalidated";
export type OrderBlockRelevance = "unknown" | "relevant" | "irrelevant" | "unclear";
export type PremiumDiscountZone = "unknown" | "premium" | "discount" | "equilibrium";
export type SessionBucket = "unknown" | "london" | "ny" | "asia" | "off_hours";
export type DataQualityFlag = "good" | "degraded" | "stale" | "missing";

export type RehRelLevelStatus = "active" | "swept" | "unknown";
export type RehRelConfirmationStatus = "confirmed" | "unknown";

export type RehRelLevelObservation = {
  id: string;
  type: "reh" | "rel";
  level: number;
  range: { low: number; high: number };
  sourceSwingPrices: number[];
  sourceSwingTimestamps: number[];
  timeframe: string;
  currentPriceAtDetection: number;
  distanceFromCurrentPrice: number;
  confirmationStatus: RehRelConfirmationStatus;
  status: RehRelLevelStatus;
};

export type RehRelObservationBlock = {
  status: "known" | "unknown";
  nearest_reh_above: RehRelLevelObservation | null;
  nearest_rel_below: RehRelLevelObservation | null;
  reh_levels: RehRelLevelObservation[];
  rel_levels: RehRelLevelObservation[];
  all_levels: RehRelLevelObservation[];
};

export type MarketObservation = {
  market_structure: ObservationStructure;
  liquidity: {
    levels: Array<{ label: string; price: number; taken: boolean | "unknown" }>;
  };
  displacement: DisplacementStatus;
  displacement_points?: number | null;
  fvg: {
    status: FvgObservationStatus;
    top?: number;
    bottom?: number;
    direction?: "bullish" | "bearish" | "unknown";
  };
  order_block: OrderBlockRelevance;
  premium_discount: {
    zone: PremiumDiscountZone;
    price_location: string;
  };
  htf_bias: {
    daily: string;
    m15: string;
    m5: string;
    aligned: boolean | "unknown";
    tradeable_bias: string;
  };
  session: SessionBucket;
  time_context: string;
  data_quality: DataQualityFlag;
  reh_rel: RehRelObservationBlock;
  evidence: Record<string, string>;
  state_hash: string;
};

/** Immutable observation — Layer 1 output must be frozen before Layer 2. */
export type ReadonlyMarketObservation = Readonly<MarketObservation>;

export type MarketInterpretation = {
  entry_model: string | null;
  invalidation: number | null;
  target: number | null;
  risk_reward: string | null;
  contradictions: string[];
  long_case: { supported: boolean; reasons: string[] };
  short_case: { supported: boolean; reasons: string[] };
  reasoning: string;
  /** Field paths from observation cited in this interpretation. */
  observation_refs: string[];
};

export type TradingVerdict = "LONG" | "SHORT" | "WAIT" | "NO_TRADE";

export type TradingDecision = {
  verdict: TradingVerdict;
  verdict_reason: string;
  invalidation: number | null;
  entry_zone: string | null;
  target: number | null;
  observation_ref: ReadonlyMarketObservation;
  interpretation_ref: MarketInterpretation;
};

export type ObservationDelta = {
  verdict_changed: boolean;
  prev_verdict?: TradingVerdict;
  field_changes: string[];
  observation_changes: string[];
  mentor_brief: string;
};

export type UncertaintyReport = {
  /** True when required facts are unknown — verdict must be NO_TRADE or WAIT. */
  i_dont_know: boolean;
  unknown_fields: string[];
  message: string;
};

export type DeskPipelineResult = {
  observation: ReadonlyMarketObservation;
  interpretation: MarketInterpretation;
  decision: TradingDecision;
  mentor_brief: string;
  panel_brief: string;
  spoken_brief: string;
  delta?: ObservationDelta;
  state_hash: string;
  /** Version stamp for replay reproducibility — lib/pipeline-version.ts */
  meta?: import("./pipeline-version").PipelineMeta;
  /** Pre-observation data audit — lib/data-quality-check.ts */
  data_quality_report?: import("./data-quality-check").DataQualityReport;
  /** Structured contradictions — lib/contradiction-report.ts */
  contradiction_report?: import("./contradiction-report").ContradictionReport;
  /** Evidence citations for every claim — lib/explainability.ts */
  explainability?: import("./explainability").ExplainabilityReport;
  /** Explicit uncertainty — "I don't know" when facts missing */
  uncertainty?: UncertaintyReport;
  /** Structured agent response contract — docs/ICT_DECISION_SPEC § Response Contract */
  analysis_contract?: import("./analysis-contract").MarketAnalysisContract;
};

/** Deep-freeze observation for audit trail — Layer 2 receives copy only. */
export function freezeObservation(obs: MarketObservation): ReadonlyMarketObservation {
  Object.freeze(obs.evidence);
  Object.freeze(obs.liquidity.levels);
  for (const level of obs.liquidity.levels) Object.freeze(level);
  Object.freeze(obs.liquidity);
  Object.freeze(obs.fvg);
  Object.freeze(obs.premium_discount);
  Object.freeze(obs.htf_bias);
  Object.freeze(obs.reh_rel);
  for (const lvl of obs.reh_rel.reh_levels) {
    Object.freeze(lvl);
    Object.freeze(lvl.range);
  }
  for (const lvl of obs.reh_rel.rel_levels) {
    Object.freeze(lvl);
    Object.freeze(lvl.range);
  }
  for (const lvl of obs.reh_rel.all_levels) {
    Object.freeze(lvl);
    Object.freeze(lvl.range);
  }
  if (obs.reh_rel.nearest_reh_above) {
    Object.freeze(obs.reh_rel.nearest_reh_above);
    Object.freeze(obs.reh_rel.nearest_reh_above.range);
  }
  if (obs.reh_rel.nearest_rel_below) {
    Object.freeze(obs.reh_rel.nearest_rel_below);
    Object.freeze(obs.reh_rel.nearest_rel_below.range);
  }
  return Object.freeze(obs) as ReadonlyMarketObservation;
}

export function toLegacyPipelineVerdict(v: TradingVerdict): "trade" | "wait" | "no trade" {
  if (v === "LONG" || v === "SHORT") return "trade";
  if (v === "WAIT") return "wait";
  return "no trade";
}

export function toLegacyCall(v: TradingVerdict, executionCall?: string): string {
  if (v === "NO_TRADE") return "no trade";
  if (v === "WAIT" && executionCall) return executionCall;
  if (v === "LONG") return executionCall || "potential buy";
  if (v === "SHORT") return executionCall || "potential sell";
  return "stand aside";
}

export type { MarketState };
