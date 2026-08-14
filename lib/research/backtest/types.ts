import type { PointInTimeSnapshot, ReplayDirection, ReplayFeatures } from "../replay/types";
import type { Bar } from "../../types";

/** Deterministic setup lifecycle events — timestamp is when event becomes knowable. */
export type SetupEventType =
  | "SETUP_DETECTED"
  | "ENTRY"
  | "INVALIDATION"
  | "TARGET"
  | "CANCELLED"
  | "EXPIRED";

export type SetupEvent = {
  type: SetupEventType;
  timestamp: string;
  barIndex: number;
  price?: number;
  detail?: string;
};

export type BacktestOutcome =
  | "WIN"
  | "LOSS"
  | "NEUTRAL"
  | "AMBIGUOUS"
  | "CANCELLED"
  | "EXPIRED"
  | "OPEN";

export type SetupProposal = {
  setupType: string;
  direction: ReplayDirection;
  entry: number;
  stop: number;
  target: number;
  /** Point-in-time features at detection — no outcome labels. */
  features: Record<string, unknown>;
};

export type StrategyContext = {
  snapshot: PointInTimeSnapshot;
  bar: Bar;
  barIndex: number;
  /** Bars strictly at or before current T (same as snapshot cutoff). */
  barsAtT: Bar[];
};

/** Pluggable strategy — engine calls onBar each candle; strategy sees only data ≤ T. */
export type StrategyPlugin = {
  id: string;
  name: string;
  /** Return a setup proposal when conditions met at T, else null. */
  detectSetup(ctx: StrategyContext): SetupProposal | null;
  /** Max bars to wait for entry fill after setup detected (default 5). */
  maxBarsPending?: number;
  /** Max bars in trade after entry before EXPIRED (default 60). */
  maxBarsInTrade?: number;
  /** Optional per-run cache lifecycle — cleared between backtest invocations. */
  onRunStart?: () => void;
  onRunEnd?: () => void;
};

export type RiskParams = {
  /** Fixed position size in contracts/units (default 1). */
  positionSize?: number;
  /** Risk per trade in R-units for sizing (default 1). */
  riskPerTrade?: number;
};

export type BacktestEngineConfig = {
  dataset: {
    id?: string;
    symbol: string;
    m1: Bar[];
    daily?: Bar[];
    m5?: Bar[];
    m15?: Bar[];
  };
  strategy: StrategyPlugin;
  timeframe?: "1m";
  startTime?: Date;
  endTime?: Date;
  risk?: RiskParams;
};

export type BacktestSetupResult = {
  setup_id: string;
  timestamp: string;
  entry_timestamp: string | null;
  symbol: string;
  timeframe: "1m";
  features: Record<string, unknown>;
  direction: ReplayDirection;
  entry: number;
  stop: number;
  target: number;
  outcome: BacktestOutcome;
  MFE: number;
  MAE: number;
  bars_held: number;
  time_held_ms: number;
  target_hit: boolean;
  stop_hit: boolean;
  which_first: "target" | "stop" | "neither" | "ambiguous";
  ambiguity: boolean;
  result_R: number;
  events: SetupEvent[];
};

export type BacktestStatistics = {
  totalSetups: number;
  wins: number;
  losses: number;
  ambiguous: number;
  cancelled: number;
  expired: number;
  neutral: number;
  open: number;
  winRate: number;
  avgR: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
  avgMfe: number;
  avgMae: number;
  avgBarsHeld: number;
  avgTimeHeldMs: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
};

export type BacktestRunResult = {
  strategyId: string;
  strategyName: string;
  datasetId: string;
  symbol: string;
  timeframe: "1m";
  window: { start: string; end: string };
  setups: BacktestSetupResult[];
  statistics: BacktestStatistics;
  runAt: string;
};

/** Walk-forward split — interface only; chronological, no shuffle. */
export type WalkForwardPhase = "TRAIN" | "VALIDATION" | "TEST";

export type WalkForwardWindow = {
  phase: WalkForwardPhase;
  startIndex: number;
  endIndex: number;
  startTime: string;
  endTime: string;
};

export type WalkForwardPlan = {
  totalBars: number;
  windows: WalkForwardWindow[];
};

/** Re-export for strategy plugins that use replay features directly. */
export type { ReplayFeatures, PointInTimeSnapshot };
