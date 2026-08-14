import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type { BacktestRunResult, BacktestSetupResult } from "./types";
import { buildBacktestManifest, writeRunManifest, type ResearchRunManifest } from "../manifest";
import type { BacktestEngineConfig } from "./types";
import { createRunDirectory } from "../paths";

/** Export label-free features separately from outcome fields. */
export function toExportRecord(setup: BacktestSetupResult): Record<string, unknown> {
  return {
    setup_id: setup.setup_id,
    timestamp: setup.timestamp,
    entry_timestamp: setup.entry_timestamp,
    symbol: setup.symbol,
    timeframe: setup.timeframe,
    features: setup.features,
    direction: setup.direction,
    entry: setup.entry,
    stop: setup.stop,
    target: setup.target,
    outcome: setup.outcome,
    MFE: setup.MFE,
    MAE: setup.MAE,
    bars_held: setup.bars_held,
    time_held_ms: setup.time_held_ms,
    ambiguity: setup.ambiguity,
    result_R: setup.result_R,
    target_hit: setup.target_hit,
    stop_hit: setup.stop_hit,
    which_first: setup.which_first,
  };
}

export function runFingerprint(result: BacktestRunResult): string {
  const stable = {
    strategyId: result.strategyId,
    datasetId: result.datasetId,
    window: result.window,
    setups: result.setups.map(toExportRecord),
    statistics: result.statistics,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export type BacktestExportResult = {
  runId: string;
  runDir: string;
  resultsPath: string;
  manifestPath: string;
  fingerprint: string;
  manifest: ResearchRunManifest;
};

export function exportBacktestRun(
  result: BacktestRunResult,
  config: BacktestEngineConfig,
  runId: string,
  format: "json" | "jsonl" = "json"
): BacktestExportResult {
  const fingerprint = runFingerprint(result);
  const manifest = buildBacktestManifest(runId, config, result, fingerprint);
  const runDir = createRunDirectory(runId);
  const manifestPath = writeRunManifest(manifest);

  if (format === "jsonl") {
    const resultsPath = path.join(runDir, "results.jsonl");
    const lines = result.setups.map((s) => JSON.stringify(toExportRecord(s)));
    fs.writeFileSync(resultsPath, lines.join("\n") + "\n", "utf8");
    return { runId, runDir, resultsPath, manifestPath, fingerprint, manifest };
  }

  const resultsPath = path.join(runDir, "results.json");
  const payload = {
    meta: {
      runId,
      strategyId: result.strategyId,
      strategyName: result.strategyName,
      datasetId: result.datasetId,
      symbol: result.symbol,
      timeframe: result.timeframe,
      window: result.window,
      runAt: result.runAt,
      fingerprint,
    },
    statistics: result.statistics,
    setups: result.setups.map(toExportRecord),
  };
  fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2), "utf8");
  return { runId, runDir, resultsPath, manifestPath, fingerprint, manifest };
}
