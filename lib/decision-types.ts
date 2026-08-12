/** Institutional decision pipeline types. */

import type { ExecutionScaffold } from "./execution-plan";
import type { BiasStack } from "./bias-analysis";
import type { MarketState } from "./market-state";
import type { MarketContext } from "./types";

export type PipelineVerdict = "trade" | "wait" | "no trade";

export type StepResult = {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  result: string;
  confidence: number;
  evidence: string[];
  failedRules?: string[];
};

export type FeatureSet = {
  marketState: MarketState;
  biasStack: BiasStack;
  premiumDiscount: MarketContext["premiumDiscount"];
  liquidityTargets: {
    pdh: number;
    pdl: number;
    pdc: number;
    sessionHigh: number;
    sessionLow: number;
    nearestSupport?: number;
    nearestSupportLabel?: string;
    nearestResistance?: number;
    nearestResistanceLabel?: string;
    recentSweeps: number;
  };
  structure: {
    mssDirection?: "bullish" | "bearish";
    mssLevel?: number;
    mssDescription?: string;
    unfilledFvgCount: number;
    nearestFvgDirection?: "bullish" | "bearish";
    summary: string;
  };
  execution: ExecutionScaffold | null;
  direction: "long" | "short" | null;
  dataQualityOk: boolean;
};

export type DecisionResult = {
  verdict: PipelineVerdict;
  direction?: "long" | "short";
  call: string;
  aggregateConfidence: number;
  steps: StepResult[];
  panelBrief: string;
  spokenBrief: string;
  execution: ExecutionScaffold | null;
  noTradeReason?: string;
  stateHash: string;
  meta: string;
};

export const NO_TRADE_EXPORT_MESSAGE = "No call — couldn't read the chart data right now.";

export const CONFIDENCE_THRESHOLD = 80;
