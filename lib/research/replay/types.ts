import type { Bar } from "../../types";
import type { MarketContext } from "../../types";
import type { DeskPipelineResult } from "../../desk-schema";
import type { ValidationSeverity } from "../dataset/types";
import type { ResearchReplayMode } from "./mode";

export type ReplayDirection = "LONG" | "SHORT" | "WAIT";

export type SerializedBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ReplayFixture = {
  id: string;
  label: string;
  symbol: string;
  sessionDate: string;
  daily: SerializedBar[];
  m15: SerializedBar[];
  m5: SerializedBar[];
  m1: SerializedBar[];
};

export type ReplayMarketData = {
  daily: Bar[];
  m15: Bar[];
  m5: Bar[];
  m1: Bar[];
  symbol: string;
};

export type KarenReplayResponse = {
  entryIdea: string;
  invalidation: string;
  target: string;
  fvgEvidence: string;
  pdEvidence: string;
  structureEvidence: string;
  confidence: number;
  candlesUsed: string[];
  levelsUsed: string[];
  pipelineVerdict: string;
  source: "pipeline" | "deterministic";
};

export type LockedVerdict = {
  direction: ReplayDirection;
  entry: number | null;
  invalidation: number | null;
  target: number | null;
  lockedAt: string;
  karen: KarenReplayResponse;
};

export type ExcursionResult = {
  mfe: number;
  mae: number;
  targetHit: boolean;
  invalidationHit: boolean;
  firstHit: "target" | "invalidation" | "neither";
  outcome: "WIN" | "LOSS" | "NEUTRAL";
  barsToTarget: number | null;
  barsToInvalidation: number | null;
  barsToOutcome: number | null;
  barsAnalyzed: number;
  forwardCandles: SerializedBar[];
};

/** Point-in-time feature slice at replay timestamp T — no future labels. */
export type ReplayFeatures = {
  bias: string;
  currentDayHigh: number;
  currentDayLow: number;
  sessionHighAtCutoff: number;
  sessionLowAtCutoff: number;
  m1FvgCount: number;
  mssDirection: string | null;
  pdVsRange: string;
  pdh: number;
  pdl: number;
};

export type PointInTimeSnapshot = {
  datasetId: string;
  symbol: string;
  asOf: string;
  currentPrice: number;
  barCountAtCutoff: number;
  availableCandleRange: { start: string; end: string };
  structureSummary: string;
  features: ReplayFeatures;
  /** Full market context at cutoff — research/backtest reuse to avoid duplicate build. */
  marketContext?: MarketContext;
};

export type ReplayEngineConfig = {
  startTime?: Date;
  endTime?: Date;
  initialIndex?: number;
  /** CURRENT = full rebuild; OPTIMIZED = incremental applyClosedBar/syncSeries. */
  mode?: ResearchReplayMode;
};

/** Post-decision outcome labels — only populated after lock + reveal. */
export type OutcomeLabels = {
  mfe: number;
  mae: number;
  targetHit: boolean;
  invalidationHit: boolean;
  firstHit: "target" | "invalidation" | "neither";
  barsToTarget: number | null;
  barsToInvalidation: number | null;
  barsToOutcome: number | null;
  finalOutcome: "WIN" | "LOSS" | "NEUTRAL";
};

/** Serializable market structure visible strictly at cutoff T. */
export type MarketStructureSnapshot = {
  summary: string;
  structureSummary: string;
  bias: string;
  mss: { direction: string; level: number; at: string } | null;
  m1FvgCount: number;
  pdVsRange: string;
};

/** Candle integrity state for bars available at cutoff T. */
export type DataQualityState = {
  status: ValidationSeverity;
  candleCount: number;
  missingMinuteCount: number;
  duplicateCount: number;
  invalidOhlcCount: number;
  issueCount: number;
};

/** Point-in-time research record — only information available at timestamp T. */
export type PointInTimeResearchRecord = {
  schemaVersion: "1.0";
  datasetId: string;
  symbol: string;
  timestamp: string;
  currentPrice: number;
  barCountAtCutoff: number;
  availableCandleRange: { start: string; end: string };
  m1: SerializedBar[];
  features: ReplayFeatures;
  marketStructure: MarketStructureSnapshot;
  karen: KarenReplayResponse;
  dataQuality: DataQualityState;
};

/** Deterministic research dataset record — features at T, labels after lock. */
export type DatasetRecord = {
  datasetId: string;
  symbol: string;
  timestamp: string;
  timeframe: "1m";
  availableCandleRange: { start: string; end: string };
  features: ReplayFeatures;
  setupType: string;
  direction: ReplayDirection;
  entry: number | null;
  invalidation: number | null;
  target: number | null;
  confidence: number;
  outcome?: OutcomeLabels;
};

export type ReplaySession = {
  id: string;
  fixtureId: string;
  asOf: string;
  locked: LockedVerdict | null;
  revealCount: number;
  createdAt: string;
};

export type ReplaySnapshot = {
  fixtureId: string;
  asOf: string;
  symbol: string;
  chartTimeEst: string;
  currentPrice: number;
  structureSummary: string;
  ctx: MarketContext;
  karen: KarenReplayResponse;
  availableTimestamps: string[];
  barCountAtCutoff: number;
};

export type ReplayResultRecord = {
  id: string;
  savedAt: string;
  fixtureId: string;
  sessionDate: string;
  asOf: string;
  direction: ReplayDirection;
  entry: number | null;
  invalidation: number | null;
  target: number | null;
  karen: KarenReplayResponse;
  excursion: ExcursionResult | null;
  pipelineMeta?: Pick<DeskPipelineResult, "decision" | "observation">;
};
