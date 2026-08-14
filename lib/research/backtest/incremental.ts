import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";
import { ReplayEngine } from "../replay/engine";
import type { ReplayMarketData } from "../replay/types";
import type { ResearchCandleDataset } from "../dataset";
import {
  runBacktest,
  runBacktestIncremental,
  runBacktestSegment,
  runBacktestWindow,
  planBarChunks,
  createInitialBacktestState,
  type BacktestCheckpointState,
} from "./engine";
import type { BacktestRunResult } from "./types";
import type { BaselineProgressCallback, BaselineRunConfig, BaselineRunResult } from "./baseline";
import {
  runLookAheadPoisonTest,
  runReproducibilityTest,
  resolveDatasetForBaseline,
  planBaselineSplit,
  buildDataQualityReport,
  interpretBaseline,
  periodFromResult,
  tryGitHash,
} from "./baseline";
import {
  createPhase1DecisionPipelineStrategy,
  PHASE1_BASELINE_AMBIGUITIES,
  PHASE1_BASELINE_RULES,
  PHASE1_BASELINE_STRATEGY_VERSION,
} from "./strategies/phase1-decision-pipeline";
import { computeBacktestStatistics } from "./statistics";

export type IncrementalChunkPlan = {
  chunkSize: number;
  chunks: Array<{ chunkIndex: number; startIndex: number; endIndex: number }>;
};

export type IncrementalCheckpointManifest = {
  runId: string;
  datasetId: string;
  chunkSize: number;
  totalBars: number;
  gitRevision: string | null;
  strategyVersion: string;
  createdAt: string;
  chunks: IncrementalChunkPlan["chunks"];
};

export type IncrementalCheckpointState = {
  lastCompletedChunk: number;
  mergedSetupCount: number;
  fingerprintPartial: string;
  engineState: BacktestCheckpointState;
};

export type IncrementalRunOptions = {
  chunkSize?: number;
  resumeRunId?: string;
};

export const DEFAULT_CHUNK_SIZE = 100;

export function planIncrementalChunks(
  startIndex: number,
  endIndex: number,
  chunkSize = DEFAULT_CHUNK_SIZE
): IncrementalChunkPlan {
  return { chunkSize, chunks: planBarChunks(startIndex, endIndex, chunkSize) };
}

export function incrementalCheckpointDir(runId: string): string {
  return path.join(process.cwd(), "data", "research", "baseline-runs", runId, "checkpoints");
}

export function fingerprintSetups(setups: BacktestRunResult["setups"]): string {
  const stripIds = setups.map((s) => ({
    timestamp: s.timestamp,
    direction: s.direction,
    entry: s.entry,
    stop: s.stop,
    target: s.target,
    outcome: s.outcome,
    result_R: s.result_R,
  }));
  return createHash("sha256").update(JSON.stringify(stripIds)).digest("hex");
}

export function saveIncrementalCheckpoint(
  runId: string,
  manifest: IncrementalCheckpointManifest,
  chunkIndex: number,
  chunk: { startIndex: number; endIndex: number },
  state: IncrementalCheckpointState
): void {
  const dir = incrementalCheckpointDir(runId);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(
    path.join(dir, `chunk-${chunkIndex}.json`),
    JSON.stringify(
      {
        startIndex: chunk.startIndex,
        endIndex: chunk.endIndex,
        setupCount: state.mergedSetupCount,
        completedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(state, null, 2), "utf8");
}

export function loadIncrementalCheckpoint(runId: string): {
  manifest: IncrementalCheckpointManifest;
  state: IncrementalCheckpointState;
} | null {
  const dir = incrementalCheckpointDir(runId);
  const manifestPath = path.join(dir, "manifest.json");
  const statePath = path.join(dir, "state.json");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(statePath)) return null;
  return {
    manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")) as IncrementalCheckpointManifest,
    state: JSON.parse(fs.readFileSync(statePath, "utf8")) as IncrementalCheckpointState,
  };
}

export function validateChunkContinuity(chunks: IncrementalChunkPlan["chunks"]): boolean {
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i - 1]!.endIndex + 1 !== chunks[i]!.startIndex) return false;
  }
  return true;
}

function buildMarketDataFromConfig(config: Parameters<typeof runBacktest>[0]): ReplayMarketData {
  return {
    symbol: config.dataset.symbol,
    daily: config.dataset.daily ?? [],
    m15: config.dataset.m15 ?? [],
    m5: config.dataset.m5 ?? [],
    m1: config.dataset.m1,
  };
}

/** Incremental full backtest with disk checkpoints — semantically equivalent to runBacktest. */
export function runIncrementalFullBacktest(
  config: Parameters<typeof runBacktest>[0],
  runId: string,
  options: IncrementalRunOptions = {},
  onProgress?: (event: { phase: string; chunkIndex?: number; totalChunks?: number; setupCount: number }) => void
): BacktestRunResult {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const marketData = buildMarketDataFromConfig(config);
  const engine = new ReplayEngine({ ...marketData, id: config.dataset.id }, {});
  engine.reset();

  const plan = planIncrementalChunks(engine.startIndex, engine.endIndex, chunkSize);
  if (!validateChunkContinuity(plan.chunks)) {
    throw new Error("Invalid chunk plan — gaps or overlaps detected");
  }

  const resumeFrom = options.resumeRunId ? loadIncrementalCheckpoint(options.resumeRunId) : null;
  let engineState = resumeFrom?.state.engineState ?? createInitialBacktestState(engine.startIndex);
  let startChunk = resumeFrom ? resumeFrom.state.lastCompletedChunk + 1 : 0;

  if (resumeFrom && resumeFrom.manifest.datasetId !== (config.dataset.id ?? "unknown")) {
    throw new Error("Resume runId dataset mismatch");
  }

  config.strategy.onRunStart?.();

  const manifest: IncrementalCheckpointManifest = resumeFrom?.manifest ?? {
    runId,
    datasetId: config.dataset.id ?? "unknown",
    chunkSize,
    totalBars: marketData.m1.length,
    gitRevision: tryGitHash(),
    strategyVersion: PHASE1_BASELINE_STRATEGY_VERSION,
    createdAt: new Date().toISOString(),
    chunks: plan.chunks,
  };

  for (let i = startChunk; i < plan.chunks.length; i++) {
    const chunk = plan.chunks[i]!;
    const isLast = i === plan.chunks.length - 1;
    engine.setCursor(engineState.cursorIndex);
    engineState = runBacktestSegment(config, chunk.endIndex, engineState, {
      finalize: isLast,
      engine,
      marketData,
    });

    const checkpointState: IncrementalCheckpointState = {
      lastCompletedChunk: chunk.chunkIndex,
      mergedSetupCount: engineState.completedSetups.length,
      fingerprintPartial: fingerprintSetups(engineState.completedSetups),
      engineState,
    };
    saveIncrementalCheckpoint(runId, manifest, chunk.chunkIndex, chunk, checkpointState);

    onProgress?.({
      phase: "chunk",
      chunkIndex: chunk.chunkIndex,
      totalChunks: plan.chunks.length,
      setupCount: engineState.completedSetups.length,
    });
  }

  config.strategy.onRunEnd?.();

  const setups = engineState.completedSetups;
  const statistics = computeBacktestStatistics(setups);

  return {
    strategyId: config.strategy.id,
    strategyName: config.strategy.name,
    datasetId: config.dataset.id ?? "unknown",
    symbol: marketData.symbol,
    timeframe: config.timeframe ?? "1m",
    window: {
      start: marketData.m1[engine.startIndex]!.time.toISOString(),
      end: marketData.m1[engine.endIndex]!.time.toISOString(),
    },
    setups,
    statistics,
    runAt: new Date().toISOString(),
  };
}

/** Baseline backtest using incremental full pass + standard train/test/poison/repro phases. */
export function runBaselineBacktestIncremental(
  runId: string,
  replay: ReplayMarketData & { id: string; label: string; sessionDate: string },
  research: ResearchCandleDataset | null,
  config: Omit<BaselineRunConfig, "datasetId"> = {},
  options: IncrementalRunOptions = {},
  onProgress?: BaselineProgressCallback
): BaselineRunResult {
  const mark = (phase: string, start: number, detail?: string) =>
    onProgress?.({ phase, elapsedMs: Math.round(performance.now() - start), detail });

  let t0 = performance.now();
  const strategy = createPhase1DecisionPipelineStrategy(replay);
  mark("strategy_init", t0);
  const split = planBaselineSplit(replay.m1, config);

  const engineConfig = {
    dataset: {
      id: replay.id,
      symbol: replay.symbol,
      m1: replay.m1,
      daily: replay.daily,
      m5: replay.m5,
      m15: replay.m15,
    },
    strategy,
  };

  t0 = performance.now();
  const fullResult = runIncrementalFullBacktest(
    engineConfig,
    runId,
    options,
    (ev) => {
      onProgress?.({
        phase: "full_backtest_chunk",
        elapsedMs: 0,
        detail: `chunk ${(ev.chunkIndex ?? 0) + 1}/${ev.totalChunks ?? "?"}, ${ev.setupCount} setups`,
      });
    }
  );
  const full = periodFromResult("FULL", fullResult);
  mark("full_backtest", t0, `${replay.m1.length} bars (incremental), ${full.setups.length} setups`);

  t0 = performance.now();
  const trainResult = runBacktestWindow(engineConfig, {
    startIndex: split.train.startIndex,
    endIndex: split.train.endIndex,
  });
  const train = periodFromResult("TRAIN", trainResult);
  mark("train_backtest", t0, `${split.train.endIndex - split.train.startIndex + 1} bars`);

  t0 = performance.now();
  const testResult = runBacktestWindow(engineConfig, {
    startIndex: split.test.startIndex,
    endIndex: split.test.endIndex,
  });
  const test = periodFromResult("TEST", testResult);
  mark("test_backtest", t0, `${split.test.endIndex - split.test.startIndex + 1} bars`);

  t0 = performance.now();
  const lookAheadTest = runLookAheadPoisonTest(replay, strategy, fullResult);
  mark("lookahead_poison", t0);

  t0 = performance.now();
  const reproducibility = runReproducibilityTest(engineConfig, fullResult);
  mark("reproducibility", t0);

  t0 = performance.now();
  const dataQuality = buildDataQualityReport(research, replay.m1);
  mark("data_quality", t0);

  return {
    runId,
    strategyDefinitionVersion: PHASE1_BASELINE_STRATEGY_VERSION,
    strategyRules: PHASE1_BASELINE_RULES,
    documentedAmbiguities: PHASE1_BASELINE_AMBIGUITIES,
    dataset: {
      id: replay.id,
      label: replay.label,
      symbol: replay.symbol,
      dateRange: {
        start: replay.m1[0]!.time.toISOString(),
        end: replay.m1.at(-1)!.time.toISOString(),
      },
      datasetVersion: research?.metadata.data_version,
      barCount: replay.m1.length,
    },
    dataQuality,
    split,
    periods: { full, train, test },
    lookAheadTest,
    reproducibility,
    interpretation: interpretBaseline(test, dataQuality),
    runAt: new Date().toISOString(),
    gitRevision: tryGitHash(),
  };
}

export function runBaselineBacktestIncrementalById(
  runId: string,
  config: BaselineRunConfig,
  options: IncrementalRunOptions = {},
  onProgress?: BaselineProgressCallback
): BaselineRunResult {
  const { replay, research } = resolveDatasetForBaseline(config.datasetId);
  return runBaselineBacktestIncremental(runId, replay, research, config, options, onProgress);
}

/** Verify incremental full backtest matches monolithic runBacktest fingerprint. */
export function verifyIncrementalEquivalence(
  config: Parameters<typeof runBacktest>[0],
  chunkSize: number
): { pass: boolean; monolithicFingerprint: string; incrementalFingerprint: string } {
  const mono = runBacktest(config);
  const incr = runBacktestIncremental(config, chunkSize);
  const monoFp = fingerprintSetups(mono.setups);
  const incrFp = fingerprintSetups(incr.setups);
  return {
    pass: monoFp === incrFp && JSON.stringify(mono.setups) === JSON.stringify(incr.setups),
    monolithicFingerprint: monoFp,
    incrementalFingerprint: incrFp,
  };
}
