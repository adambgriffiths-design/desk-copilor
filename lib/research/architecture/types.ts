/**
 * Research-only types for decision-architecture traces and hypothesis tests.
 * Does not change production envelope or pipeline math.
 */

import type { DecisionEnvelope, DecisionStance, HorizonLean } from "../../decision-envelope";
import type { TradingVerdict } from "../../desk-schema";

export const ARCHITECTURE_VERSION_IDS = [
  "architecture-v1",
  "architecture-v2",
  "architecture-v3",
] as const;

export type ArchitectureVersionId = (typeof ARCHITECTURE_VERSION_IDS)[number];

export type ConceptUsage = "DETECTED" | "USED" | "INFLUENTIAL" | "IGNORED";

export type EvidenceClass = "DEBUGGING" | "INFRASTRUCTURE" | "EDGE";

export type SampleAdequacy = "insufficient" | "minimum" | "adequate";

export type SplitPhase = "TRAIN" | "VALIDATION" | "OOS";

export type HypothesisStatus = "UNTESTED" | "SUPPORTED" | "WEAK" | "FALSIFIED" | "INCONCLUSIVE";

export type ConceptStatus = {
  concept: string;
  detected: boolean;
  used: boolean;
  influential: boolean;
  usage: ConceptUsage;
  role: "PRIMARY" | "SUPPORTING" | "NONE";
  outcome: "true" | "false" | "uncertain";
  evidence: string;
  contribution: string;
};

export type LabeledHorizon = {
  role: "HTF_CONTEXT" | "TACTICAL_TF" | "EXECUTION_TF";
  timeframe: string;
  lean: HorizonLean;
};

export type DecisionTrace = {
  schemaVersion: "1.0";
  architectureVersion: ArchitectureVersionId;
  timestamp: string;
  snapshotId: string;
  datasetId: string;
  symbol: string;
  session: string;
  timeframe: string;
  regime: string;
  htfContext: LabeledHorizon;
  tactical: LabeledHorizon;
  execution: LabeledHorizon;
  concepts: ConceptStatus[];
  conflicts: {
    disagree: boolean;
    between: string;
    resolution: string;
    ltfAgainstHtfAllowed: boolean | null;
    winner: string;
  };
  stance: DecisionStance;
  pipelineVerdict: TradingVerdict;
  entry: string | null;
  target: string | null;
  invalidation: string | null;
  confidence: string;
  overlayApplied: boolean;
  overlayReason: string;
  evidenceClass: EvidenceClass;
  envelope: DecisionEnvelope;
};

export type MarketDecisionContext = {
  session: string;
  timeOfDay: string;
  htfTrend: HorizonLean;
  ltfTrend: HorizonLean;
  trendOrRange: "trend" | "range" | "unclear";
  volProxy: "quiet" | "normal" | "elevated" | "unknown";
  premiumDiscount: string;
  distanceFromLiquidity: number | null;
  nearestLiquidityLabel: string | null;
  recentSweep: boolean;
  recentMss: boolean;
  activeFvg: boolean;
  activeEqh: boolean;
  activeEql: boolean;
  pdh: number | null;
  pdl: number | null;
  sessionLiquidityTaken: string[];
};

export type ConceptRelationship = {
  a: string;
  b: string;
  extra?: string;
  relationship: string;
  context: string;
  impact: string;
  outcome: string;
};

export type RichOutcomeLabels = {
  mfe: number;
  mae: number;
  targetReached: boolean;
  invalidationReached: boolean;
  timeToTargetBars: number | null;
  timeToInvalidationBars: number | null;
  liquidityReached: boolean;
  structureInvalidated: boolean;
  directionAfter: "up" | "down" | "unchanged" | "unknown";
  futureVol: number | null;
  firstHit: "target" | "invalidation" | "neither";
  winLossNeutral: "WIN" | "LOSS" | "NEUTRAL";
  counterfactual: boolean;
};

export type FrozenArchitectureSnapshot = {
  id: ArchitectureVersionId;
  name: string;
  hypothesisId: string | null;
  description: string;
  production: boolean;
  conceptRules: string;
  conflictRules: string;
  weights: "none";
  horizonRules: string;
  entryRules: string;
  overlay:
    | "identity"
    | "ltf_override_on_proven_liquidity"
    | "htf_context_no_tactical_block";
};

export type HypothesisRecord = {
  id: string;
  description: string;
  architectureVersion: ArchitectureVersionId | null;
  requiredEvidence: string;
  dataset: string;
  results: string;
  confidence: "none" | "low" | "medium" | "high";
  status: HypothesisStatus;
};

export const MIN_N_REPORT = 10;
export const MIN_N_MEANINGFUL = 30;
