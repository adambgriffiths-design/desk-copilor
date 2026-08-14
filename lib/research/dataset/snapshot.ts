import type { DatasetSnapshot, ObservationAtT, OutcomeLabel, ResearchCandleDataset } from "./types";

function parseAsOfTimestamp(timestamp: string | number): number {
  if (typeof timestamp === "number") {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      throw new Error(`research dataset: invalid asOf timestamp: ${String(timestamp)}`);
    }
    return timestamp;
  }
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) {
    throw new Error(`research dataset: invalid asOf ISO timestamp: ${timestamp}`);
  }
  return Math.floor(ms / 1000);
}

/**
 * Point-in-time snapshot — ONLY candles with timestamp <= asOf.
 * Does not include future highs, structure, or outcome labels.
 */
export function getSnapshot(dataset: ResearchCandleDataset, timestamp: string | number): DatasetSnapshot {
  const asOf = parseAsOfTimestamp(timestamp);
  const candles = dataset.candles.filter((c) => c.timestamp <= asOf);

  let maxHigh: number | null = null;
  let minLow: number | null = null;
  for (const c of candles) {
    if (maxHigh == null || c.high > maxHigh) maxHigh = c.high;
    if (minLow == null || c.low < minLow) minLow = c.low;
  }

  return {
    metadata: dataset.metadata,
    asOf,
    candles,
    candleCount: candles.length,
    maxHigh,
    minLow,
  };
}

export function assertSnapshotNoFutureLeak(snapshot: DatasetSnapshot): void {
  for (const c of snapshot.candles) {
    if (c.timestamp > snapshot.asOf) {
      throw new Error(
        `Future leak: candle ${c.timestamp} exceeds snapshot asOf ${snapshot.asOf}`
      );
    }
  }
}

export function buildObservationAtT(
  dataset: ResearchCandleDataset,
  timestamp: string | number,
  features: Record<string, unknown>
): ObservationAtT {
  const asOf = parseAsOfTimestamp(timestamp);
  return {
    kind: "OBSERVATION",
    dataset_id: dataset.metadata.dataset_id,
    symbol: dataset.metadata.symbol,
    timestamp: asOf,
    features,
  };
}

export function buildOutcomeLabel(
  dataset: ResearchCandleDataset,
  observationTimestamp: string | number,
  labels: Record<string, unknown>
): OutcomeLabel {
  const ts = parseAsOfTimestamp(observationTimestamp);
  return {
    kind: "OUTCOME",
    dataset_id: dataset.metadata.dataset_id,
    observation_timestamp: ts,
    labels,
  };
}

/** Guard — observation and outcome must remain separate storage objects. */
export function isFeatureOutcomeSeparated(
  observation: ObservationAtT,
  outcome: OutcomeLabel
): boolean {
  return observation.kind === "OBSERVATION" && outcome.kind === "OUTCOME";
}
