/** Internal research candle dataset — raw NQ OHLC, isolated from production market state. */

export const RESEARCH_DATASET_TIMEFRAME = "1m" as const;
export const RESEARCH_SESSION_DEFINITION = "CME_GLOBEX_18:00_ET" as const;
export const RESEARCH_TIMEZONE = "America/New_York" as const;

export type ValidationSeverity = "VALID" | "WARNING" | "INVALID";

export type ValidationIssueCode =
  | "OUT_OF_ORDER"
  | "DUPLICATE_TIMESTAMP"
  | "MISSING_MINUTES"
  | "INVALID_OHLC"
  | "HIGH_BELOW_LOW"
  | "OPEN_OUTSIDE_RANGE"
  | "CLOSE_OUTSIDE_RANGE"
  | "IMPOSSIBLE_TIMESTAMP"
  | "PARTIAL_FIRST"
  | "PARTIAL_LAST"
  | "SESSION_BOUNDARY_GAP"
  | "EMPTY_DATASET";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: ValidationIssueCode;
  message: string;
  /** Unix seconds UTC — affected minute bucket when applicable. */
  timestamp?: number;
};

export type ValidationReport = {
  status: ValidationSeverity;
  issues: ValidationIssue[];
  candleCount: number;
  duplicateCount: number;
  missingMinuteCount: number;
  invalidOhlcCount: number;
};

export type DatasetVersionInfo = {
  dataset_version: string;
  source: string;
  source_version: string;
  loader_version: string;
  aggregation_version: string;
  session_definition_version: string;
  git_revision: string;
};

/** Candle schema — volume omitted (tick aggregation volume != exchange candle volume). */
export type ResearchCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ResearchDatasetMetadata = {
  dataset_id: string;
  /** Source instrument queried from TickStream (raw NQ — no /4 scaling). */
  source_symbol: string;
  /** Research target label — MNQ-equivalent prices (same raw NQ OHLC). */
  target_instrument: "MNQ-equivalent";
  symbol: string;
  source: string;
  source_version: string;
  timeframe: typeof RESEARCH_DATASET_TIMEFRAME;
  start_timestamp: number;
  end_timestamp: number;
  timezone: typeof RESEARCH_TIMEZONE;
  session_definition: typeof RESEARCH_SESSION_DEFINITION;
  created_at: string;
  code_version: string;
  data_version: string;
  versions: DatasetVersionInfo;
};

export type ResearchCandleDataset = {
  metadata: ResearchDatasetMetadata;
  candles: ResearchCandle[];
  validation: ValidationReport;
};

export type DatasetSnapshot = {
  metadata: ResearchDatasetMetadata;
  asOf: number;
  candles: ResearchCandle[];
  candleCount: number;
  maxHigh: number | null;
  minLow: number | null;
};

/** Features observable at timestamp T — no post-T labels. */
export type ObservationAtT = {
  kind: "OBSERVATION";
  dataset_id: string;
  symbol: string;
  timestamp: number;
  features: Record<string, unknown>;
};

/** Outcome labels knowable only after T — stored separately from observations. */
export type OutcomeLabel = {
  kind: "OUTCOME";
  dataset_id: string;
  observation_timestamp: number;
  labels: Record<string, unknown>;
};

export type BuildDatasetOptions = {
  symbol: string;
  candles: ResearchCandle[];
  source: string;
  source_version: string;
  /** Requested window start (Unix seconds) — used for partial-boundary warnings. */
  requestedStart?: number;
  /** Requested window end (Unix seconds) — used for partial-boundary warnings. */
  requestedEnd?: number;
  created_at?: string;
};

export type DatasetBuildReport = {
  metadata: ResearchDatasetMetadata;
  candleCount: number;
  first: number | null;
  last: number | null;
  missingMinutes: number;
  duplicateCount: number;
  invalidCount: number;
  warnings: ValidationIssue[];
  versions: DatasetVersionInfo;
  integrityStatus: ValidationSeverity;
  datasetPath?: string;
};
