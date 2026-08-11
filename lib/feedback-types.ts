export type FeedbackRating = "correct" | "partial" | "wrong" | "miss";

export const ICT_CONCEPTS = [
  "ORG",
  "CE",
  "NWOG",
  "NDOG",
  "FVG",
  "OB",
  "MSS",
  "AMD",
  "liquidity",
  "premium_discount",
  "consolidation",
  "bias_daily",
  "bias_15m",
  "bias_5m",
  "macro_time",
  "OTE",
  "wick_gap",
  "session_levels",
  "displacement",
  "breaker",
  "volume_imbalance",
] as const;

export type IctConcept = (typeof ICT_CONCEPTS)[number];

export type FeedbackEntry = {
  id: string;
  createdAt: string;
  rating: FeedbackRating;
  predictMode: boolean;
  chartTime?: string;
  note?: string;
  verdict: string;
  correction?: string;
  failedConcepts?: IctConcept[];
  failureReason?: string;
  marketContext?: unknown;
};

export type FeedbackStats = {
  total: number;
  correct: number;
  partial: number;
  wrong: number;
  miss: number;
  trainingExamples: number;
};

export type LearnedRule = {
  concept: string;
  rule: string;
  source: string;
  addedAt: string;
};

export type LearnedRulesFile = {
  version: number;
  updatedAt: string;
  conceptErrorCounts: Record<string, number>;
  rules: LearnedRule[];
  promptAddendum: string;
};
