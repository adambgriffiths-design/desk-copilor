import { createHash } from "crypto";
import { execSync } from "node:child_process";
import type { DatasetVersionInfo, ResearchCandle } from "./types";

export const DATASET_LAYER_VERSION = "1.0.0";
export const LOADER_VERSION = "1.0.0";
export const AGGREGATION_VERSION = "1.0.0";
export const SESSION_DEFINITION_VERSION = "1.0.0";
export const TICKSTREAM_SOURCE_VERSION = "tickstream-historical-v1";

export function resolveGitRevision(cwd = process.cwd()): string {
  try {
    return execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function buildVersionInfo(source: string, sourceVersion: string): DatasetVersionInfo {
  return {
    dataset_version: DATASET_LAYER_VERSION,
    source,
    source_version: sourceVersion,
    loader_version: LOADER_VERSION,
    aggregation_version: AGGREGATION_VERSION,
    session_definition_version: SESSION_DEFINITION_VERSION,
    git_revision: resolveGitRevision(),
  };
}

/** Same inputs + version pins → same data_version digest. */
export function computeDataVersion(
  symbol: string,
  candles: ResearchCandle[],
  versions: DatasetVersionInfo
): string {
  const payload = {
    symbol,
    candles,
    versions: {
      dataset_version: versions.dataset_version,
      source: versions.source,
      source_version: versions.source_version,
      loader_version: versions.loader_version,
      aggregation_version: versions.aggregation_version,
      session_definition_version: versions.session_definition_version,
    },
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export function buildDatasetId(
  symbol: string,
  startTimestamp: number,
  endTimestamp: number,
  dataVersion: string
): string {
  const raw = `${symbol.toUpperCase()}_${startTimestamp}_${endTimestamp}_${dataVersion}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 20);
}

export function datasetFingerprint(dataset: { metadata: { data_version: string }; candles: ResearchCandle[] }): string {
  return createHash("sha256")
    .update(JSON.stringify({ data_version: dataset.metadata.data_version, candles: dataset.candles }))
    .digest("hex");
}
