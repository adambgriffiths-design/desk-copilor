/**
 * Yahoo Finance vs TickStream/CME research dataset comparison.
 * Run: npm run test:research-yahoo-vs-tickstream
 */
import { estTimeOnDateKey, fetchAllTimeframesForBacktest } from "../lib/market-data";
import { AUG12_CME_SESSION, findCachedAug12Dataset } from "../lib/research/dataset/aug12";
import { compareOhlcDatasets, compareReplayFeatures } from "../lib/research/dataset/compare-sources";
import { loadDatasetFromYahoo } from "../lib/research/dataset/yahoo";
import { buildDeterministicKarenResponse } from "../lib/research/replay/karen";
import { ReplayEngine } from "../lib/research/replay/engine";
import { researchDatasetToReplayMarketData } from "../lib/research/dataset/replay-bridge";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function iso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function findBarIndex(candles: { timestamp: number }[], targetSec: number): number {
  let best = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i]!.timestamp <= targetSec) best = i;
    else break;
  }
  return best;
}

async function main() {
  console.log("=== Research: Yahoo vs TickStream/CME ===\n");

  const tickstream = findCachedAug12Dataset();
  if (!tickstream) {
    console.error("FAIL: nq-aug12-2026-cme fixture missing — run test:research-dataset-replay first");
    process.exit(1);
  }

  const tsStart = tickstream.metadata.start_timestamp;
  const tsEnd = tickstream.metadata.end_timestamp;
  console.log(`TickStream fixture: ${tickstream.candles.length} candles`);
  console.log(`  Range: ${iso(tsStart)} → ${iso(tsEnd)}`);
  console.log(`  Validation: ${tickstream.validation.status} (missing=${tickstream.validation.missingMinuteCount})`);

  const yahooStart = performance.now();
  const yahoo = await loadDatasetFromYahoo({
    interval: "1m",
    range: "7d",
    startSec: tsStart,
    endSec: tsEnd,
  });
  const yahooFetchMs = performance.now() - yahooStart;

  console.log(`\nYahoo MNQ=F (index points): ${yahoo.candles.length} candles in ${yahooFetchMs.toFixed(0)}ms`);
  console.log(`  Range: ${iso(yahoo.metadata.start_timestamp)} → ${iso(yahoo.metadata.end_timestamp)}`);
  console.log(`  Validation: ${yahoo.validation.status} (missing=${yahoo.validation.missingMinuteCount})`);

  const ohlc = compareOhlcDatasets(tickstream, yahoo);
  console.log("\n--- OHLC alignment ---");
  console.log(`  Aligned minutes: ${ohlc.alignedCount}`);
  console.log(`  TS-only minutes: ${ohlc.tsOnlyCount}`);
  console.log(`  Yahoo-only minutes: ${ohlc.yahooOnlyCount}`);
  console.log(`  Avg diff O/H/L/C: ${ohlc.avgOpenDiff.toFixed(2)} / ${ohlc.avgHighDiff.toFixed(2)} / ${ohlc.avgLowDiff.toFixed(2)} / ${ohlc.avgCloseDiff.toFixed(2)}`);
  console.log(`  Max diff O/H/L/C: ${ohlc.maxOpenDiff.toFixed(2)} / ${ohlc.maxHighDiff.toFixed(2)} / ${ohlc.maxLowDiff.toFixed(2)} / ${ohlc.maxCloseDiff.toFixed(2)}`);
  console.log(`  Within 0.25pt: ${ohlc.pctWithinQuarterPoint.toFixed(1)}%`);
  console.log(`  Within 1.0pt: ${ohlc.pctWithinOnePoint.toFixed(1)}%`);

  assert("overlap exists", ohlc.alignedCount > 500, `aligned=${ohlc.alignedCount}`);
  assert("avg close diff < 5 NQ pts", ohlc.avgCloseDiff < 5, `avg=${ohlc.avgCloseDiff.toFixed(2)}`);
  assert("max close diff < 50 NQ pts", ohlc.maxCloseDiff < 50, `max=${ohlc.maxCloseDiff.toFixed(2)}`);

  const sessionDate = AUG12_CME_SESSION.sessionDate;
  const nyOpenSec = estTimeOnDateKey(sessionDate, 9, 30);
  const nyCloseSec = estTimeOnDateKey(sessionDate, 16, 15);
  const globexOpenSec = estTimeOnDateKey("2026-08-11", 18, 0);

  const probeIndices = [
    findBarIndex(tickstream.candles, globexOpenSec),
    findBarIndex(tickstream.candles, nyOpenSec),
    findBarIndex(tickstream.candles, nyOpenSec + 30 * 60),
    findBarIndex(tickstream.candles, nyCloseSec),
    Math.floor(tickstream.candles.length * 0.75),
    tickstream.candles.length - 1,
  ].filter((i) => i >= 0);

  const featureRows = compareReplayFeatures(tickstream, yahoo, probeIndices);
  console.log("\n--- Replay feature probes ---");
  let biasMatches = 0;
  let mssMatches = 0;
  let fvgMatches = 0;
  for (const row of featureRows) {
    if (row.biasMatch) biasMatches++;
    if (row.mssMatch) mssMatches++;
    if (row.fvgCountMatch) fvgMatches++;
    console.log(
      `  ${row.asOf} idx=${row.barIndex}: bias ${row.tsBias}/${row.yahooBias} mss ${row.tsMss}/${row.yahooMss} fvg ${row.tsFvgCount}/${row.yahooFvgCount}`
    );
  }

  const biasPct = featureRows.length ? (biasMatches / featureRows.length) * 100 : 0;
  const mssPct = featureRows.length ? (mssMatches / featureRows.length) * 100 : 0;
  const fvgPct = featureRows.length ? (fvgMatches / featureRows.length) * 100 : 0;
  console.log(`  Bias match: ${biasPct.toFixed(0)}%  MSS match: ${mssPct.toFixed(0)}%  FVG count match: ${fvgPct.toFixed(0)}%`);

  assert("bias match >= 60% at probes", biasPct >= 60, `${biasPct.toFixed(0)}%`);
  assert("MSS direction match >= 45% at probes", mssPct >= 45, `${mssPct.toFixed(0)}%`);

  const tsReplay = researchDatasetToReplayMarketData(tickstream);
  const yReplay = researchDatasetToReplayMarketData(yahoo);
  const nyOpenIdx = findBarIndex(tickstream.candles, nyOpenSec);
  const tsEng = new ReplayEngine(tsReplay, { initialIndex: nyOpenIdx });
  const yEng = new ReplayEngine(yReplay, { initialIndex: findBarIndex(yahoo.candles, nyOpenSec) });
  const tsSnap = tsEng.snapshot();
  const ySnap = yEng.snapshot();
  const tsKaren = buildDeterministicKarenResponse(tsSnap.marketContext, tsReplay, tsEng.replayTimestamp);
  const yKaren = buildDeterministicKarenResponse(ySnap.marketContext, yReplay, yEng.replayTimestamp);

  console.log("\n--- Deterministic Karen @ NY open ---");
  console.log(`  TS: ${tsKaren.pipelineVerdict} — ${tsKaren.structureEvidence.slice(0, 60)}`);
  console.log(`  Yahoo: ${yKaren.pipelineVerdict} — ${yKaren.structureEvidence.slice(0, 60)}`);
  assert(
    "deterministic verdict match at NY open",
    tsKaren.pipelineVerdict === yKaren.pipelineVerdict,
    `ts=${tsKaren.pipelineVerdict} y=${yKaren.pipelineVerdict}`
  );

  const htfStart = performance.now();
  await fetchAllTimeframesForBacktest();
  const htfMs = performance.now() - htfStart;
  console.log(`\n--- Runtime ---`);
  console.log(`  Yahoo 1m fetch (overlap slice): ${yahooFetchMs.toFixed(0)}ms`);
  console.log(`  Yahoo full backtest bundle (1m/5m/15m/daily): ${htfMs.toFixed(0)}ms`);
  console.log(`  TickStream Aug12 fixture load: disk (0 API)`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
