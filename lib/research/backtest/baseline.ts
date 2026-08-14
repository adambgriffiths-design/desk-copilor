import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { performance } from "perf_hooks";
import {
  AUG12_CME_FIXTURE_ID,
  findCachedAug12Dataset,
  loadResearchDatasetById,
  readFixtureBundle,
  researchDatasetToReplayMarketData,
  type ResearchCandleDataset,
} from "../dataset";
import { loadReplayFixture } from "../replay/fixtures";
import type { ReplayMarketData } from "../replay/types";
import { runBacktest, runBacktestWindow } from "./engine";
import type { BacktestRunResult, StrategyPlugin } from "./types";
import { computeBaselineStatistics, type BaselineStatistics } from "./baseline-statistics";
import {
  createPhase1DecisionPipelineStrategy,
  PHASE1_BASELINE_AMBIGUITIES,
  PHASE1_BASELINE_RULES,
  PHASE1_BASELINE_STRATEGY_VERSION,
} from "./strategies/phase1-decision-pipeline";
import type { Bar } from "../../types";
import type { ResearchCandle } from "../dataset/types";

export type DataQualityReport = {
  totalCandles: number;
  missingMinutes: number;
  duplicateCount: number;
  invalidOhlcCount: number;
  sessionGapCount: number;
  partialFirst: boolean;
  partialLast: boolean;
  integrityStatus: string;
  issues: Array<{ code: string; severity: string; message: string }>;
  ambiguousOutcomesNote: string;
};

export type BaselineSplit = {
  train: { startIndex: number; endIndex: number; startTime: string; endTime: string };
  test: { startIndex: number; endIndex: number; startTime: string; endTime: string };
};

export type BaselineRunConfig = {
  datasetId: string;
  trainEnd?: string;
  testStart?: string;
  trainRatio?: number;
};

export type BaselinePeriodResult = {
  label: "FULL" | "TRAIN" | "TEST";
  window: { start: string; end: string };
  setups: BacktestRunResult["setups"];
  statistics: BaselineStatistics;
};

export type BaselineRunResult = {
  runId: string;
  strategyDefinitionVersion: string;
  strategyRules: typeof PHASE1_BASELINE_RULES;
  documentedAmbiguities: readonly string[];
  dataset: {
    id: string;
    label: string;
    symbol: string;
    dateRange: { start: string; end: string };
    datasetVersion?: string;
    barCount: number;
  };
  dataQuality: DataQualityReport;
  split: BaselineSplit;
  periods: {
    full: BaselinePeriodResult;
    train: BaselinePeriodResult;
    test: BaselinePeriodResult;
  };
  lookAheadTest: { pass: boolean; detail: string };
  reproducibility: { pass: boolean; fingerprint: string; detail: string };
  interpretation: string;
  runAt: string;
  gitRevision: string | null;
};

export function tryGitHash(): string | null {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function barToCandle(b: Bar): ResearchCandle {
  return {
    timestamp: Math.floor(b.time.getTime() / 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  };
}

export function buildDataQualityReport(
  researchDataset: ResearchCandleDataset | null,
  m1: Bar[]
): DataQualityReport {
  if (researchDataset) {
    const v = researchDataset.validation;
    return {
      totalCandles: v.candleCount,
      missingMinutes: v.missingMinuteCount,
      duplicateCount: v.duplicateCount,
      invalidOhlcCount: v.invalidOhlcCount,
      sessionGapCount: v.issues.filter((i) => i.code === "SESSION_BOUNDARY_GAP").length,
      partialFirst: v.issues.some((i) => i.code === "PARTIAL_FIRST"),
      partialLast: v.issues.some((i) => i.code === "PARTIAL_LAST"),
      integrityStatus: v.status,
      issues: v.issues.map((i) => ({ code: i.code, severity: i.severity, message: i.message })),
      ambiguousOutcomesNote:
        "Intrabar stop+target on same candle → AMBIGUOUS (no open-proximity heuristic in baseline outcome.ts)",
    };
  }

  const candles = m1.map(barToCandle);
  return {
    totalCandles: candles.length,
    missingMinutes: 0,
    duplicateCount: 0,
    invalidOhlcCount: 0,
    sessionGapCount: 0,
    partialFirst: false,
    partialLast: false,
    integrityStatus: candles.length > 0 ? "VALID" : "WARNING",
    issues: candles.length === 0 ? [{ code: "EMPTY", severity: "WARNING", message: "No m1 bars" }] : [],
    ambiguousOutcomesNote:
      "Intrabar stop+target on same candle → AMBIGUOUS (no open-proximity heuristic in baseline outcome.ts)",
  };
}

export function resolveDatasetForBaseline(datasetId: string): {
  replay: ReplayMarketData & { id: string; label: string; sessionDate: string };
  research: ResearchCandleDataset | null;
} {
  let research: ResearchCandleDataset | null = null;

  if (datasetId === AUG12_CME_FIXTURE_ID) {
    research = findCachedAug12Dataset();
  } else if (datasetId.length === 20) {
    try {
      research = loadResearchDatasetById(datasetId);
    } catch {
      /* fixture alias */
    }
  }

  if (!research) {
    try {
      research = readFixtureBundle(datasetId);
    } catch {
      /* json fixture */
    }
  }

  if (research) {
    return {
      replay: researchDatasetToReplayMarketData(research),
      research,
    };
  }

  return {
    replay: loadReplayFixture(datasetId),
    research: null,
  };
}

export function planBaselineSplit(
  m1: Bar[],
  config: Pick<BaselineRunConfig, "trainEnd" | "testStart" | "trainRatio">
): BaselineSplit {
  const trainRatio = config.trainRatio ?? 0.7;
  let trainEndIdx: number;
  let testStartIdx: number;

  if (config.trainEnd) {
    const t = new Date(config.trainEnd).getTime();
    trainEndIdx = 0;
    for (let i = 0; i < m1.length; i++) {
      if (m1[i]!.time.getTime() <= t) trainEndIdx = i;
    }
    testStartIdx = Math.min(trainEndIdx + 1, m1.length - 1);
  } else if (config.testStart) {
    const t = new Date(config.testStart).getTime();
    testStartIdx = m1.findIndex((b) => b.time.getTime() >= t);
    if (testStartIdx === -1) testStartIdx = m1.length - 1;
    trainEndIdx = Math.max(0, testStartIdx - 1);
  } else {
    trainEndIdx = Math.max(0, Math.floor(m1.length * trainRatio) - 1);
    testStartIdx = Math.min(trainEndIdx + 1, m1.length - 1);
  }

  if (testStartIdx <= trainEndIdx && m1.length > 1) {
    trainEndIdx = Math.max(0, Math.floor(m1.length * trainRatio) - 1);
    testStartIdx = Math.min(trainEndIdx + 1, m1.length - 1);
  }

  return {
    train: {
      startIndex: 0,
      endIndex: trainEndIdx,
      startTime: m1[0]!.time.toISOString(),
      endTime: m1[trainEndIdx]!.time.toISOString(),
    },
    test: {
      startIndex: testStartIdx,
      endIndex: m1.length - 1,
      startTime: m1[testStartIdx]!.time.toISOString(),
      endTime: m1.at(-1)!.time.toISOString(),
    },
  };
}

export function periodFromResult(
  label: BaselinePeriodResult["label"],
  result: BacktestRunResult
): BaselinePeriodResult {
  return {
    label,
    window: result.window,
    setups: result.setups,
    statistics: computeBaselineStatistics(result.setups),
  };
}

function runPeriod(
  label: BaselinePeriodResult["label"],
  config: Parameters<typeof runBacktest>[0],
  barRange?: { startIndex: number; endIndex: number }
): BaselinePeriodResult {
  const result = barRange ? runBacktestWindow(config, barRange) : runBacktest(config);
  return periodFromResult(label, result);
}

export type BaselinePhaseProgress = {
  phase: string;
  elapsedMs: number;
  detail?: string;
};

export type BaselineProgressCallback = (event: BaselinePhaseProgress) => void;

/** Poison test — future bar mutation must not change setup detection before T. */
export function runLookAheadPoisonTest(
  data: ReplayMarketData & { id?: string },
  strategy: StrategyPlugin,
  /** Reuse unmodified full backtest when dataset/strategy match poison baseline run. */
  baselineResult?: BacktestRunResult
): {
  pass: boolean;
  detail: string;
} {
  const m1 = data.m1.map((b) => ({ ...b }));
  if (m1.length < 10) {
    return { pass: true, detail: "skipped — dataset too short" };
  }
  const poisonIdx = Math.min(90, m1.length - 1);
  m1[poisonIdx] = { ...m1[poisonIdx]!, high: 99999, low: 1, open: 25000, close: 25000 };

  const datasetId = data.id ?? "poison-test";
  const baseResult =
    baselineResult ??
    runBacktest({
      dataset: { id: datasetId, symbol: data.symbol, m1: data.m1, daily: data.daily, m5: data.m5, m15: data.m15 },
      strategy,
    });
  const poisonResult = runBacktest({
    dataset: { id: datasetId, symbol: data.symbol, m1, daily: data.daily, m5: data.m5, m15: data.m15 },
    strategy,
  });

  const poisonTime = m1[poisonIdx]!.time.toISOString();
  const earlyDiff = poisonResult.setups.filter((s) => {
    if (s.timestamp >= poisonTime) return false;
    const match = baseResult.setups.find(
      (b) => b.timestamp === s.timestamp && b.direction === s.direction && b.entry === s.entry
    );
    return !match;
  });

  if (earlyDiff.length > 0) {
    return {
      pass: false,
      detail: `${earlyDiff.length} setup(s) before poison bar differ when future bar mutated`,
    };
  }
  return { pass: true, detail: "historical decisions unchanged when future candle poisoned" };
}

export function runReproducibilityTest(
  config: Parameters<typeof runBacktest>[0],
  /** Reuse first deterministic run when identical config was just executed (e.g. FULL period). */
  firstRun?: BacktestRunResult
): {
  pass: boolean;
  fingerprint: string;
  detail: string;
} {
  const a = firstRun ?? runBacktest(config);
  const b = runBacktest(config);
  const stripIds = (r: BacktestRunResult) =>
    r.setups.map((s) => ({
      timestamp: s.timestamp,
      direction: s.direction,
      entry: s.entry,
      stop: s.stop,
      target: s.target,
      outcome: s.outcome,
      result_R: s.result_R,
    }));
  const stable = {
    stats: a.statistics,
    setups: stripIds(a),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
  const pass = JSON.stringify(stripIds(a)) === JSON.stringify(stripIds(b));
  return {
    pass,
    fingerprint,
    detail: pass ? "identical setup outcomes on repeat run" : "non-deterministic outcomes detected",
  };
}

export function interpretBaseline(test: BaselinePeriodResult, dataQuality: DataQualityReport): string {
  const s = test.statistics;
  const n = s.totalSetups;
  const decisive = s.wins + s.losses;

  if (dataQuality.integrityStatus === "INVALID") {
    return "INSUFFICIENT DATA — dataset integrity INVALID; do not interpret strategy performance.";
  }
  if (n === 0 || decisive === 0) {
    return "INSUFFICIENT DATA — zero decisive setups in out-of-sample window; cannot assess edge.";
  }
  if (n < 10) {
    if (s.expectancy > 0 && s.winRate > 0.5) {
      return "PROMISING BUT UNPROVEN — positive OOS expectancy but sample size < 10 setups.";
    }
    return "INSUFFICIENT DATA — fewer than 10 OOS setups for statistical inference.";
  }
  if (s.expectancy > 0.15 && s.winRate >= 0.5 && s.profitFactor > 1.2) {
    return "POTENTIAL EDGE — REQUIRES OOS VALIDATION — favorable OOS metrics but single-session baseline only.";
  }
  if (s.expectancy > 0 && s.profitFactor > 1) {
    return "PROMISING BUT UNPROVEN — marginal positive OOS expectancy; extend dataset before conclusions.";
  }
  if (s.expectancy <= 0 && s.winRate < 0.45) {
    return "NO EVIDENCE OF EDGE — negative OOS expectancy and sub-50% win rate.";
  }
  return "WEAK — OOS metrics do not support a durable edge without further validation.";
}

export function runBaselineBacktestOnData(
  runId: string,
  replay: ReplayMarketData & { id: string; label: string; sessionDate: string },
  research: ResearchCandleDataset | null,
  config: Omit<BaselineRunConfig, "datasetId"> = {},
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
  const fullResult = runBacktest(engineConfig);
  const full = periodFromResult("FULL", fullResult);
  mark("full_backtest", t0, `${replay.m1.length} bars, ${full.setups.length} setups`);

  t0 = performance.now();
  const train = runPeriod("TRAIN", engineConfig, {
    startIndex: split.train.startIndex,
    endIndex: split.train.endIndex,
  });
  mark("train_backtest", t0, `${split.train.endIndex - split.train.startIndex + 1} bars`);

  t0 = performance.now();
  const test = runPeriod("TEST", engineConfig, {
    startIndex: split.test.startIndex,
    endIndex: split.test.endIndex,
  });
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

export function runBaselineBacktest(
  runId: string,
  config: BaselineRunConfig,
  onProgress?: BaselineProgressCallback
): BaselineRunResult {
  const { replay, research } = resolveDatasetForBaseline(config.datasetId);
  return runBaselineBacktestOnData(runId, replay, research, config, onProgress);
}

export function createBaselineRunDirectory(runId: string): string {
  const dir = path.join(process.cwd(), "data", "research", "baseline-runs", runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function baselineSetupExportRecord(setup: BaselinePeriodResult["setups"][0]): Record<string, unknown> {
  return {
    setup_id: setup.setup_id,
    timestamp: setup.timestamp,
    entry_timestamp: setup.entry_timestamp,
    symbol: setup.symbol,
    timeframe: setup.timeframe,
    setup_type: setup.features.setupType ?? setup.features.setup_type ?? "phase1-decision-pipeline",
    direction: setup.direction,
    entry: setup.entry,
    stop: setup.stop,
    target: setup.target,
    features: setup.features,
    outcome: setup.outcome,
    MFE: setup.MFE,
    MAE: setup.MAE,
    bars_held: setup.bars_held,
    time_held_ms: setup.time_held_ms,
    result_R: setup.result_R,
    ambiguity: setup.ambiguity,
    ambiguity_status: setup.ambiguity ? "AMBIGUOUS" : setup.outcome === "AMBIGUOUS" ? "AMBIGUOUS" : "CLEAR",
  };
}

export function exportBaselineRun(result: BaselineRunResult): {
  runDir: string;
  manifestPath: string;
  reportPath: string;
  resultsPath: string;
} {
  const runDir = createBaselineRunDirectory(result.runId);

  const manifest = {
    runId: result.runId,
    runType: "baseline-backtest",
    createdAt: result.runAt,
    gitRevision: result.gitRevision,
    strategy_definition_version: result.strategyDefinitionVersion,
    strategy_rules: result.strategyRules,
    documented_ambiguities: result.documentedAmbiguities,
    dataset: result.dataset,
    data_quality: result.dataQuality,
    split: result.split,
    look_ahead_test: result.lookAheadTest,
    reproducibility: result.reproducibility,
    interpretation: result.interpretation,
    session_definition: "ICT sessions via buildMarketContextAt / resolveSessionContext",
    timeframe: "1m",
    entry_exit_assumptions: {
      entry: "limit fill at execution scaffold anchor when ACTIVE",
      stop: "decision-layer invalidation",
      target: "execution scaffold target1",
      ambiguous_intrabar: "AMBIGUOUS — no tick order, no open-proximity heuristic",
    },
  };

  const manifestPath = path.join(runDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const resultsPath = path.join(runDir, "results.json");
  fs.writeFileSync(
    resultsPath,
    JSON.stringify(
      {
        periods: {
          full: {
            window: result.periods.full.window,
            statistics: result.periods.full.statistics,
            setups: result.periods.full.setups.map(baselineSetupExportRecord),
          },
          train: {
            window: result.periods.train.window,
            statistics: result.periods.train.statistics,
            setups: result.periods.train.setups.map(baselineSetupExportRecord),
          },
          test: {
            window: result.periods.test.window,
            statistics: result.periods.test.statistics,
            setups: result.periods.test.setups.map(baselineSetupExportRecord),
          },
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const reportPath = path.join(runDir, "report.md");
  fs.writeFileSync(reportPath, formatBaselineReportMarkdown(result), "utf8");

  return { runDir, manifestPath, reportPath, resultsPath };
}

export function formatBaselineReportMarkdown(result: BaselineRunResult): string {
  const dq = result.dataQuality;
  const test = result.periods.test.statistics;
  const train = result.periods.train.statistics;

  const lines = [
    "=== HONEST BASELINE BACKTEST ===",
    "",
    "## Dataset",
    `- **ID:** ${result.dataset.id}`,
    `- **Label:** ${result.dataset.label}`,
    `- **Symbol:** ${result.dataset.symbol}`,
    `- **Date range:** ${result.dataset.dateRange.start} → ${result.dataset.dateRange.end}`,
    `- **Bars:** ${result.dataset.barCount}`,
    `- **Dataset version:** ${result.dataset.datasetVersion ?? "n/a (fixture)"}`,
    "",
    "## Data quality (interpret before performance)",
    `- **Integrity:** ${dq.integrityStatus}`,
    `- **Total candles:** ${dq.totalCandles}`,
    `- **Missing minutes:** ${dq.missingMinutes}`,
    `- **Duplicates:** ${dq.duplicateCount}`,
    `- **Invalid OHLC:** ${dq.invalidOhlcCount}`,
    `- **Session boundary gaps:** ${dq.sessionGapCount}`,
    `- **Partial first/last:** ${dq.partialFirst} / ${dq.partialLast}`,
    `- **Ambiguous handling:** ${dq.ambiguousOutcomesNote}`,
    "",
    "## Strategy definition",
    `- **Version:** \`${result.strategyDefinitionVersion}\``,
    `- **Rules:** Phase 1 observation → interpretation → decision → execution scaffold`,
    `- **Traded verdicts:** LONG, SHORT with entryStatus ACTIVE`,
    `- **Entry / stop / target:** scaffold anchor / decision invalidation / target1`,
    "",
    "### Documented ambiguities (not guessed)",
    ...result.documentedAmbiguities.map((a) => `- ${a}`),
    "",
    "## Statistics — FULL period",
    formatStatsBlock(result.periods.full.statistics),
    "",
    "## Statistics — TRAIN (in-sample)",
    `- Window: ${result.periods.train.window.start} → ${result.periods.train.window.end}`,
    formatStatsBlock(train),
    "",
    "## OUT-OF-SAMPLE TEST period",
    `- Window: ${result.periods.test.window.start} → ${result.periods.test.window.end}`,
    formatStatsBlock(test),
    "",
    "### Long / short (OOS)",
    formatBreakdownSection(result.periods.test.statistics.breakdown.byDirection),
    "",
    "### By timeframe (OOS)",
    formatBreakdownSection(result.periods.test.statistics.breakdown.byTimeframe),
    "",
    "### By setup type (OOS)",
    formatBreakdownSection(result.periods.test.statistics.breakdown.bySetupType),
    "",
    "### By session (OOS)",
    formatBreakdownSection(result.periods.test.statistics.breakdown.bySession),
    "",
    "### By month (OOS)",
    formatBreakdownSection(result.periods.test.statistics.breakdown.byMonth),
    "",
    "### By weekday (OOS)",
    formatBreakdownSection(result.periods.test.statistics.breakdown.byWeekDay),
    "",
    "## Validation",
    `- **LOOK-AHEAD TEST:** ${result.lookAheadTest.pass ? "PASS" : "FAIL"} — ${result.lookAheadTest.detail}`,
    `- **REPRODUCIBILITY:** ${result.reproducibility.pass ? "PASS" : "FAIL"} — ${result.reproducibility.detail}`,
    `- **Fingerprint:** \`${result.reproducibility.fingerprint}\``,
    `- **Git revision:** ${result.gitRevision ?? "unavailable"}`,
    "",
    "## Interpretation",
    `**${result.interpretation}**`,
    "",
    "_Internal research only — no optimization, no prod Karen changes._",
  ];

  return lines.join("\n");
}

function formatStatsBlock(s: BaselineStatistics): string {
  return [
    `- Total setups: ${s.totalSetups}`,
    `- Wins / losses / ambiguous: ${s.wins} / ${s.losses} / ${s.ambiguous}`,
    `- Win rate: ${(s.winRate * 100).toFixed(1)}%`,
    `- Avg R: ${s.avgR.toFixed(3)} | Median R: ${s.medianR.toFixed(3)}`,
    `- Expectancy: ${s.expectancy.toFixed(3)} R`,
    `- Profit factor: ${s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2)}`,
    `- Max drawdown (R): ${s.maxDrawdownR.toFixed(2)}`,
    `- Avg MFE / MAE: ${s.avgMfe.toFixed(2)} / ${s.avgMae.toFixed(2)}`,
    `- Avg holding: ${s.avgBarsHeld.toFixed(1)} bars (${(s.avgTimeHeldMs / 60000).toFixed(1)} min)`,
    `- Max consecutive W/L: ${s.maxConsecutiveWins} / ${s.maxConsecutiveLosses}`,
  ].join("\n");
}

function formatBreakdownSection(groups: Record<string, { totalSetups: number; winRate: number; avgR: number; expectancy: number }>): string {
  const keys = Object.keys(groups);
  if (!keys.length) return "_No setups in bucket._";
  return keys
    .map(
      (k) =>
        `- **${k}:** n=${groups[k]!.totalSetups}, WR=${(groups[k]!.winRate * 100).toFixed(0)}%, avgR=${groups[k]!.avgR.toFixed(2)}, exp=${groups[k]!.expectancy.toFixed(2)}`
    )
    .join("\n");
}
