import { createHash } from "crypto";
import type {
  DatasetRecord,
  OutcomeLabels,
  PointInTimeSnapshot,
  ReplayDirection,
  ReplayFeatures,
} from "./types";

export function buildDatasetRecord(input: {
  snapshot: PointInTimeSnapshot;
  setupType: string;
  direction: ReplayDirection;
  entry: number | null;
  invalidation: number | null;
  target: number | null;
  confidence: number;
  outcome?: OutcomeLabels;
}): DatasetRecord {
  const record: DatasetRecord = {
    datasetId: input.snapshot.datasetId,
    symbol: input.snapshot.symbol,
    timestamp: input.snapshot.asOf,
    timeframe: "1m",
    availableCandleRange: input.snapshot.availableCandleRange,
    features: input.snapshot.features,
    setupType: input.setupType,
    direction: input.direction,
    entry: input.entry,
    invalidation: input.invalidation,
    target: input.target,
    confidence: input.confidence,
  };
  if (input.outcome) {
    record.outcome = input.outcome;
  }
  return record;
}

/** Stable content hash for determinism checks — excludes volatile save timestamps. */
export function datasetRecordFingerprint(record: DatasetRecord): string {
  const stable = {
    datasetId: record.datasetId,
    symbol: record.symbol,
    timestamp: record.timestamp,
    timeframe: record.timeframe,
    availableCandleRange: record.availableCandleRange,
    features: record.features,
    setupType: record.setupType,
    direction: record.direction,
    entry: record.entry,
    invalidation: record.invalidation,
    target: record.target,
    confidence: record.confidence,
    outcome: record.outcome ?? null,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function serializeDatasetRecord(record: DatasetRecord): string {
  return JSON.stringify(record, null, 2);
}

export function featuresOnly(record: DatasetRecord): ReplayFeatures {
  return { ...record.features };
}
