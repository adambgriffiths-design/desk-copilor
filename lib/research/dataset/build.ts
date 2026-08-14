import {
  buildDatasetId,
  buildVersionInfo,
  computeDataVersion,
  DATASET_LAYER_VERSION,
} from "./version";
import { validateCandles } from "./validate";
import type {
  BuildDatasetOptions,
  DatasetBuildReport,
  ResearchCandleDataset,
  RESEARCH_DATASET_TIMEFRAME,
  RESEARCH_SESSION_DEFINITION,
  RESEARCH_TIMEZONE,
} from "./types";

export function buildResearchDataset(opts: BuildDatasetOptions): ResearchCandleDataset {
  const candles = opts.candles.map((c) => ({ ...c }));
  const validation = validateCandles(candles, {
    requestedStart: opts.requestedStart,
    requestedEnd: opts.requestedEnd,
  });

  const versions = buildVersionInfo(opts.source, opts.source_version);
  const startTimestamp = candles.length ? candles[0]!.timestamp : (opts.requestedStart ?? 0);
  const endTimestamp = candles.length
    ? candles.at(-1)!.timestamp
    : (opts.requestedEnd ?? opts.requestedStart ?? 0);
  const dataVersion = computeDataVersion(opts.symbol, candles, versions);
  const datasetId = buildDatasetId(opts.symbol, startTimestamp, endTimestamp, dataVersion);

  const sourceSymbol = opts.symbol.toUpperCase();
  const metadata = {
    dataset_id: datasetId,
    source_symbol: sourceSymbol,
    target_instrument: "MNQ-equivalent" as const,
    symbol: sourceSymbol,
    source: opts.source,
    source_version: opts.source_version,
    timeframe: "1m" as typeof RESEARCH_DATASET_TIMEFRAME,
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    timezone: "America/New_York" as typeof RESEARCH_TIMEZONE,
    session_definition: "CME_GLOBEX_18:00_ET" as typeof RESEARCH_SESSION_DEFINITION,
    created_at: opts.created_at ?? new Date().toISOString(),
    code_version: DATASET_LAYER_VERSION,
    data_version: dataVersion,
    versions,
  };

  return { metadata, candles, validation };
}

export function toBuildReport(dataset: ResearchCandleDataset, datasetPath?: string): DatasetBuildReport {
  const warnings = dataset.validation.issues.filter((i) => i.severity === "WARNING");
  const invalidCount = dataset.validation.issues.filter((i) => i.severity === "INVALID").length;

  return {
    metadata: dataset.metadata,
    candleCount: dataset.candles.length,
    first: dataset.candles[0]?.timestamp ?? null,
    last: dataset.candles.at(-1)?.timestamp ?? null,
    missingMinutes: dataset.validation.missingMinuteCount,
    duplicateCount: dataset.validation.duplicateCount,
    invalidCount,
    warnings,
    versions: dataset.metadata.versions,
    integrityStatus: dataset.validation.status,
    datasetPath,
  };
}
