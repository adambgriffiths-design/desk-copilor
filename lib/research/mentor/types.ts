import type { MarketInterpretation, MarketObservation, TradingDecision } from "../../desk-schema";
import type { KarenReplayResponse } from "../replay/types";

/** Ten mentor-quality criteria — scored 0 (fail), 1 (partial), 2 (pass). Not win/loss. */
export type MentorCriterionId =
  | "sufficient_info"
  | "structure_accuracy"
  | "dominant_conflicting_evidence"
  | "uncertainty"
  | "invalidation"
  | "no_hindsight"
  | "no_forced_direction"
  | "consistency"
  | "trader_usefulness"
  | "data_quality_honesty";

export type CriterionScore = 0 | 1 | 2;

export type MentorCriterionResult = {
  id: MentorCriterionId;
  label: string;
  score: CriterionScore;
  maxScore: 2;
  note: string;
};

/** Automatic falsification flags — any true blocks mentor-eval readiness for that response. */
export type MentorFalsificationFlag =
  | "hindsight_leakage"
  | "overconfidence"
  | "forced_signal"
  | "cherry_pick"
  | "unavailable_info_cited";

export type MentorFalsification = {
  flag: MentorFalsificationFlag;
  detected: boolean;
  detail: string;
};

export type MentorEvalInput = {
  asOf: string;
  karen: KarenReplayResponse;
  observation: MarketObservation;
  interpretation: MarketInterpretation;
  decision: TradingDecision;
  /** Bar open times available strictly at cutoff T (ISO). */
  availableBarTimes: string[];
};

export type MentorEvalResult = {
  asOf: string;
  source: KarenReplayResponse["source"];
  pipelineVerdict: string;
  criteria: MentorCriterionResult[];
  totalScore: number;
  maxScore: number;
  pctScore: number;
  falsifications: MentorFalsification[];
  mentorEvalReady: boolean;
  summary: string;
};

export const MENTOR_CRITERION_LABELS: Record<MentorCriterionId, string> = {
  sufficient_info: "Sufficient observable info cited at cutoff",
  structure_accuracy: "Structure evidence aligns with observation",
  dominant_conflicting_evidence: "Dominant vs conflicting evidence acknowledged",
  uncertainty: "Uncertainty expressed when evidence mixed or incomplete",
  invalidation: "Actionable invalidation when directional",
  no_hindsight: "No future bar or outcome references",
  no_forced_direction: "No forced LONG/SHORT when evidence insufficient",
  consistency: "Verdict consistent with cited evidence",
  trader_usefulness: "Entry idea + levels useful to a trader",
  data_quality_honesty: "Honest handling of missing/stale data",
};

export const MENTOR_FALSIFICATION_LABELS: Record<MentorFalsificationFlag, string> = {
  hindsight_leakage: "References information after cutoff T",
  overconfidence: "High confidence despite mixed/insufficient evidence",
  forced_signal: "Direction forced without pipeline support",
  cherry_pick: "Cherry-picks one side while ignoring conflict",
  unavailable_info_cited: "Cites levels/data not available at cutoff",
};
