import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { BacktestEngineConfig, BacktestRunResult } from "./backtest/types";
import { createRunDirectory } from "./paths";

export type ResearchRunManifest = {
  runId: string;
  runType: "backtest" | "replay";
  createdAt: string;
  gitHash: string | null;
  dataset: {
    id: string;
    version?: string;
    symbol: string;
    barCount: number;
    dateRange: { start: string; end: string };
  };
  strategy: {
    id: string;
    name: string;
    parameters: Record<string, unknown>;
  };
  sessionDefinition: string;
  timeframe: string;
  window: { start: string; end: string };
  config: Record<string, unknown>;
  fingerprint: string;
};

function tryGitHash(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function buildRunId(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${ts}`;
}

export function buildBacktestManifest(
  runId: string,
  config: BacktestEngineConfig,
  result: BacktestRunResult,
  fingerprint: string,
  extra?: Record<string, unknown>
): ResearchRunManifest {
  const m1 = config.dataset.m1;
  return {
    runId,
    runType: "backtest",
    createdAt: new Date().toISOString(),
    gitHash: tryGitHash(),
    dataset: {
      id: config.dataset.id ?? result.datasetId,
      symbol: config.dataset.symbol,
      barCount: m1.length,
      dateRange: {
        start: m1[0]?.time.toISOString() ?? result.window.start,
        end: m1.at(-1)?.time.toISOString() ?? result.window.end,
      },
    },
    strategy: {
      id: config.strategy.id,
      name: config.strategy.name,
      parameters: {
        maxBarsPending: config.strategy.maxBarsPending ?? 5,
        maxBarsInTrade: config.strategy.maxBarsInTrade ?? 60,
      },
    },
    sessionDefinition: "NY AM RTH (ICT session boundaries via buildMarketContextAt)",
    timeframe: config.timeframe ?? "1m",
    window: result.window,
    config: {
      startTime: config.startTime?.toISOString() ?? null,
      endTime: config.endTime?.toISOString() ?? null,
      risk: config.risk ?? null,
      ...extra,
    },
    fingerprint,
  };
}

export function writeRunManifest(manifest: ResearchRunManifest): string {
  const dir = createRunDirectory(manifest.runId);
  const filepath = path.join(dir, "manifest.json");
  fs.writeFileSync(filepath, JSON.stringify(manifest, null, 2), "utf8");
  return filepath;
}
