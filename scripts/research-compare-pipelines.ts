#!/usr/bin/env npx tsx
/**
 * Stage-by-stage comparison: replay deterministic Karen vs full pipeline vs baseline detectSetup.
 * Run: npx tsx scripts/research-compare-pipelines.ts [--dataset synthetic-ny-am|nq-aug12-2026-cme] [--timestamp ISO]
 */
import { buildMarketState } from "../lib/market-state-build";
import { buildTradingDecision } from "../lib/decision-layer";
import { buildMarketInterpretation } from "../lib/interpretation-engine";
import { buildMarketObservation } from "../lib/observation-engine";
import { getExecutionScaffold } from "../lib/execution-plan";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import { createPhase1DecisionPipelineStrategy } from "../lib/research/backtest/strategies/phase1-decision-pipeline";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { ReplayEngine } from "../lib/research/replay/engine";
import {
  buildDeterministicKarenResponse,
  buildKarenReplayResponse,
} from "../lib/research/replay/karen";
import {
  ensureResearchFixtures,
  loadReplayFixture,
  loadResearchDatasetFixture,
} from "../lib/research/replay/fixtures";
import type { ReplayMarketData } from "../lib/research/replay/types";

type StageRow = {
  asOf: string;
  barIndex: number;
  barCount: number;
  bias: string | null;
  mss: string | null;
  dataQuality: string;
  replayDeterministic: string;
  pipelineVerdict: string;
  entryStatus: string | null;
  baselineSetup: string;
  rejectReason: string | null;
};

function loadFixture(id: string): ReplayMarketData & { id: string; label?: string } {
  ensureResearchFixtures();
  if (id === "nq-aug12-2026-cme" || id.startsWith("256")) {
    return loadResearchDatasetFixture("nq-aug12-2026-cme");
  }
  return loadReplayFixture(id);
}

function analyzeAt(fixture: ReplayMarketData & { id: string }, asOf: Date, barIndex: number): StageRow {
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();

  const deterministic = buildDeterministicKarenResponse(ctx, fixture, asOf);
  const { karen: pipelineKaren, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);
  const execution = getExecutionScaffold(ctx);

  const state = buildMarketState({
    ctx,
    chartLastPrice: m1.at(-1)?.close ?? ctx.daily.lastClose,
    chartLastPriceSource: "yahoo",
    symbol: ctx.symbol,
    chartSnapshot: buildResearchChartSnapshotFromBars({
      bars: m1,
      symbol: ctx.symbol,
      asOf,
      timeframe: "1",
    }),
  });
  const observation = buildMarketObservation(ctx, state);
  const interpretation = buildMarketInterpretation(observation);
  const decision = buildTradingDecision(observation, interpretation, ctx);

  const strategy = createPhase1DecisionPipelineStrategy(fixture);
  strategy.onRunStart?.();
  const proposal = strategy.detectSetup({
    snapshot: {
      datasetId: fixture.id,
      symbol: fixture.symbol,
      asOf: asOf.toISOString(),
      currentPrice: m1.at(-1)?.close ?? ctx.daily.lastClose,
      barCountAtCutoff: m1.length,
      availableCandleRange: {
        start: fixture.m1[0]!.time.toISOString(),
        end: asOf.toISOString(),
      },
      structureSummary: "",
      features: {},
      marketContext: ctx,
    },
    bar: fixture.m1[barIndex]!,
    barIndex,
    barsAtT: m1,
  });
  strategy.onRunEnd?.();

  let rejectReason: string | null = null;
  if (!proposal) {
    if (decision.verdict !== "LONG" && decision.verdict !== "SHORT") {
      rejectReason = `verdict=${decision.verdict}`;
    } else if (!execution || execution.entryStatus !== "ACTIVE") {
      rejectReason = `entryStatus=${execution?.entryStatus ?? "null"}`;
    } else if (decision.invalidation == null || !Number.isFinite(decision.invalidation)) {
      rejectReason = "invalidation missing";
    } else if (!Number.isFinite(execution.target1Price) || execution.target1Price <= 0) {
      rejectReason = `target1=${execution.target1Price}`;
    } else {
      rejectReason = "risk<=0 or other";
    }
  }

  return {
    asOf: asOf.toISOString(),
    barIndex,
    barCount: m1.length,
    bias: ctx.biasStack.dominantBias ?? ctx.daily.biasHint ?? null,
    mss: ctx.structureFacts.mss?.direction ?? null,
    dataQuality: observation.data_quality,
    replayDeterministic: `${deterministic.pipelineVerdict} (${deterministic.source})`,
    pipelineVerdict: `${pipelineKaren.pipelineVerdict} (${pipelineKaren.source})`,
    entryStatus: execution?.entryStatus ?? null,
    baselineSetup: proposal ? `${proposal.direction} @ ${proposal.entry}` : "NONE",
    rejectReason,
  };
}

function printTable(rows: StageRow[]) {
  console.log("\n| asOf | bars | bias | MSS | dataQ | replay(det) | pipeline | entryStatus | baseline | reject |");
  console.log("|------|------|------|-----|-------|---------------|----------|-------------|----------|--------|");
  for (const r of rows) {
    console.log(
      `| ${r.asOf.slice(11, 19)} | ${r.barCount} | ${r.bias ?? "-"} | ${r.mss ?? "-"} | ${r.dataQuality} | ${r.replayDeterministic} | ${r.pipelineVerdict} | ${r.entryStatus ?? "-"} | ${r.baselineSetup} | ${r.rejectReason ?? "-"} |`
    );
  }
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetId = args.dataset ?? "synthetic-ny-am";
  const fixture = loadFixture(datasetId);

  console.log(`\n=== Pipeline comparison: ${fixture.label ?? datasetId} ===`);

  if (args.timestamp) {
    const engine = new ReplayEngine(fixture);
    engine.seekTo(args.timestamp);
    const snap = engine.snapshot();
    const rows = [analyzeAt(fixture, new Date(snap.asOf), engine.cursor)];
    printTable(rows);
    return;
  }

  const rows: StageRow[] = [];
  const engine = new ReplayEngine(fixture);
  engine.reset();

  const total = engine.endIndex - engine.startIndex;
  const sampleEvery = datasetId.includes("nq") ? 100 : 10;

  for (let step = 0; step <= total; step++) {
    const barIndex = engine.cursor;
    const asOf = engine.replayTimestamp;
    if (step % sampleEvery === 0 || step === total) {
      rows.push(analyzeAt(fixture, asOf, barIndex));
    }
    if (step < total) engine.advance(1);
  }

  printTable(rows);

  const detLongShort = rows.filter((r) => r.replayDeterministic.startsWith("LONG") || r.replayDeterministic.startsWith("SHORT")).length;
  const pipeLongShort = rows.filter((r) => {
    const v = r.pipelineVerdict.split(" ")[0];
    return v === "LONG" || v === "SHORT";
  }).length;
  const baselineSetups = rows.filter((r) => r.baselineSetup !== "NONE").length;

  console.log(`\nSummary (${rows.length} sample points):`);
  console.log(`  replay deterministic LONG|SHORT: ${detLongShort}/${rows.length}`);
  console.log(`  full pipeline LONG|SHORT:       ${pipeLongShort}/${rows.length}`);
  console.log(`  baseline setups:                ${baselineSetups}/${rows.length}`);

  const entryWait = rows.filter((r) => r.rejectReason?.startsWith("entryStatus=WAIT")).length;
  const entryExtended = rows.filter((r) => r.rejectReason?.startsWith("entryStatus=EXTENDED")).length;
  const verdictWait = rows.filter((r) => r.rejectReason?.startsWith("verdict=WAIT")).length;
  const verdictNoTrade = rows.filter((r) => r.rejectReason?.startsWith("verdict=NO_TRADE")).length;
  console.log(`  reject: entryStatus=WAIT ${entryWait}, EXTENDED ${entryExtended}, verdict=WAIT ${verdictWait}, NO_TRADE ${verdictNoTrade}`);
}

main();
