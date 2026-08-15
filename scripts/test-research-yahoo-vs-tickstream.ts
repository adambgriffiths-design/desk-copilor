/**
 * Yahoo Finance vs TickStream/CME research dataset comparison.
 * Run: npm run test:research-yahoo-vs-tickstream
 */
import { estTimeOnDateKey, getEstDateKey, getEstMinutes } from "../lib/market-data";
import { cmeSessionDateKey } from "../lib/tickstream/htf-aggregate";
import type { Bar } from "../lib/types";
import { AUG12_CME_SESSION, findCachedAug12Dataset } from "../lib/research/dataset/aug12";
import {
  bucketCandlesTo15mUtc,
  compareCandleOhlc,
  compareDailyBySessionDate,
  compareHtfBiasAtTimestamps,
  compareOhlcDatasets,
  compareReplayFeatures,
  htfCandlesFromDataset,
  htfContextAtCutoff,
  summarizeHtfBiasDiff,
} from "../lib/research/dataset/compare-sources";
import { readFixtureBundle } from "../lib/research/dataset/store";
import { loadDatasetFromYahoo } from "../lib/research/dataset/yahoo";
import type { ResearchCandle } from "../lib/research/dataset/types";
import { buildDeterministicKarenResponse } from "../lib/research/replay/karen";
import { ReplayEngine } from "../lib/research/replay/engine";
import { researchDatasetToReplayMarketData } from "../lib/research/dataset/replay-bridge";

const WEEK_FIXTURE_ID = "nq-week-aug05-aug12-2026-cme";

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
  const [yahoo1m7d, yahoo5m60d, yahoo15m60d, yahooDaily] = await Promise.all([
    loadDatasetFromYahoo({ interval: "1m", range: "7d" }),
    loadDatasetFromYahoo({ interval: "5m", range: "60d" }),
    loadDatasetFromYahoo({ interval: "15m", range: "60d" }),
    loadDatasetFromYahoo({ interval: "1d", range: "3mo" }),
  ]);
  const htfMs = performance.now() - htfStart;

  console.log(`\n=== 60d HTF screening (Yahoo native vs TickStream overlap) ===`);
  console.log(`  Yahoo 1m 7d: ${yahoo1m7d.candles.length} bars`);
  console.log(`  Yahoo 5m 60d: ${yahoo5m60d.candles.length} bars`);
  console.log(`  Yahoo 15m 60d: ${yahoo15m60d.candles.length} bars`);
  console.log(`  Yahoo daily 3mo: ${yahooDaily.candles.length} bars`);
  console.log(`  Yahoo HTF bundle fetch: ${htfMs.toFixed(0)}ms`);

  assert("Yahoo 15m 60d loaded", yahoo15m60d.candles.length > 500, `n=${yahoo15m60d.candles.length}`);
  assert("Yahoo daily loaded", yahooDaily.candles.length > 20, `n=${yahooDaily.candles.length}`);

  let week: ReturnType<typeof readFixtureBundle> | null = null;
  try {
    week = readFixtureBundle(WEEK_FIXTURE_ID);
  } catch {
    week = null;
  }

  if (!week) {
    console.log(`\n  Week TickStream fixture ${WEEK_FIXTURE_ID} missing — overlap limited to Aug 12 1m.`);
  } else {
    const weekStart = week.metadata.start_timestamp;
    const weekEnd = week.metadata.end_timestamp;
    console.log(
      `\n  TickStream week: ${week.candles.length} 1m bars ${iso(weekStart)} → ${iso(weekEnd)} (${week.validation.status})`
    );

    const y1mOverlap = yahoo1m7d.candles.filter((c) => c.timestamp >= weekStart && c.timestamp <= weekEnd);
    const y15Overlap = bucketCandlesTo15mUtc(
      yahoo15m60d.candles.filter((c) => c.timestamp >= weekStart && c.timestamp <= weekEnd)
    );
    const yDailyOverlap = yahooDaily.candles.filter(
      (c) => c.timestamp >= weekStart - 86400 && c.timestamp <= weekEnd + 86400
    );
    const ts15 = htfCandlesFromDataset(week, "15m");
    const tsDailyAll = htfCandlesFromDataset(week, "D");
    const tsDaily = tsDailyAll.length > 1 ? tsDailyAll.slice(0, -1) : tsDailyAll;
    const ohlc15 = compareCandleOhlc(ts15, y15Overlap);
    const dailyDiff = compareDailyBySessionDate(tsDaily, yDailyOverlap);

    console.log(`  Yahoo 1m in week window: ${y1mOverlap.length} bars`);
    console.log("\n--- 15m OHLC (TS-derived vs Yahoo native, week overlap) ---");
    logOhlc(ohlc15);
    console.log("\n--- Daily OHLC by session date (TS CME Globex vs Yahoo calendar; last TS session dropped if partial) ---");
    logOhlc(dailyDiff);
    console.log(`  Matched session dates: ${dailyDiff.matchedSessionDates.join(", ") || "(none)"}`);

    assert("15m overlap aligned > 20", ohlc15.alignedCount > 20, `aligned=${ohlc15.alignedCount}`);
    assert(
      "daily session matches >= 2",
      dailyDiff.matchedSessionDates.length >= 2,
      `n=${dailyDiff.matchedSessionDates.length}`
    );

    const tsReplay = researchDatasetToReplayMarketData(week, { label: "tickstream-week" });
    const yahooNativeHtf = {
      daily: candlesToBars(yahooDaily.candles),
      m15: candlesToBars(yahoo15m60d.candles),
      m5: candlesToBars(yahoo5m60d.candles),
      m1: candlesToBars(y1mOverlap),
      symbol: "MNQ=F",
    };
    const sessionDates = [...new Set(week.candles.map((c) => cmeSessionDateKey(c.timestamp)))].sort();
    const cutoffSec = sessionDates.map((d) => estTimeOnDateKey(d, 9, 30));
    const overlapRows = compareHtfBiasAtTimestamps(tsReplay, yahooNativeHtf, cutoffSec);
    const overlapSum = summarizeHtfBiasDiff(overlapRows);

    console.log("\n--- HTF bias/MSS @ NY 09:30 (TS-derived HTF vs Yahoo native 15m/daily) ---");
    for (const row of overlapRows) {
      console.log(
        `  ${row.asOf.slice(0, 16)} daily ${row.tsDaily}/${row.yahooDaily}${row.dailyMatch ? "" : " DIVERGE"} m15 ${row.tsM15}/${row.yahooM15}${row.m15Match ? "" : " DIVERGE"} dominant ${row.tsDominant}/${row.yahooDominant}${row.biasMatch ? "" : " DIVERGE"} mss ${row.tsMss}/${row.yahooMss}${row.mssMatch ? "" : " DIVERGE"}`
      );
    }
    console.log(
      `  n=${overlapSum.n}  daily div ${overlapSum.dailyDivergencePct.toFixed(0)}%  15m div ${overlapSum.m15DivergencePct.toFixed(0)}%  dominant div ${overlapSum.biasDivergencePct.toFixed(0)}%  MSS div ${overlapSum.mssDivergencePct.toFixed(0)}%`
    );

    assert("overlap HTF probes >= 3", overlapSum.n >= 3, `n=${overlapSum.n}`);
    console.log("SCREEN_OVERLAP_JSON " + JSON.stringify(overlapSum));
    console.log(
      "SCREEN_OHLC15_JSON " +
        JSON.stringify({
          alignedCount: ohlc15.alignedCount,
          avgCloseDiff: ohlc15.avgCloseDiff,
          maxCloseDiff: ohlc15.maxCloseDiff,
          pctWithinOnePoint: ohlc15.pctWithinOnePoint,
          tsOnlyCount: ohlc15.tsOnlyCount,
          yahooOnlyCount: ohlc15.yahooOnlyCount,
        })
    );
    console.log(
      "SCREEN_DAILY_JSON " +
        JSON.stringify({
          matched: dailyDiff.matchedSessionDates,
          alignedCount: dailyDiff.alignedCount,
          avgCloseDiff: dailyDiff.avgCloseDiff,
          maxCloseDiff: dailyDiff.maxCloseDiff,
        })
    );
  }

  const nyOpens = nyOpenCutoffsFrom15m(yahoo15m60d.candles);
  const yahooHtfData = {
    daily: candlesToBars(yahooDaily.candles),
    m15: candlesToBars(yahoo15m60d.candles),
    m5: candlesToBars(yahoo5m60d.candles),
    m1: candlesToBars(yahoo1m7d.candles),
    symbol: "MNQ=F",
  };
  const biasCounts = { bullish: 0, bearish: 0, neutral: 0 };
  const m15Counts = { bullish: 0, bearish: 0, neutral: 0 };
  let mssBull = 0;
  let mssBear = 0;
  let mssNone = 0;
  let mssWith1m = 0;
  const scanRows: Array<{
    date: string;
    daily: string;
    m15: string;
    dominant: string;
    mss: string | null;
    has1m: boolean;
  }> = [];

  for (const { dateKey, asOfSec } of nyOpens) {
    const asOf = new Date(asOfSec * 1000);
    const ctx = htfContextAtCutoff(yahooHtfData, asOf);
    const daily = ctx.biasStack.daily;
    const m15b = ctx.biasStack.m15;
    const dominant = ctx.biasStack.dominantBias;
    const mss = ctx.structureFacts.mss?.direction ?? null;
    const has1m = yahoo1m7d.candles.some((c) => Math.abs(c.timestamp - asOfSec) <= 900);
    if (daily === "bullish" || daily === "bearish" || daily === "neutral") biasCounts[daily]++;
    if (m15b === "bullish" || m15b === "bearish" || m15b === "neutral") m15Counts[m15b]++;
    if (mss === "bullish") mssBull++;
    else if (mss === "bearish") mssBear++;
    else mssNone++;
    if (has1m) mssWith1m++;
    scanRows.push({ date: dateKey, daily, m15: m15b, dominant, mss, has1m });
  }

  console.log("\n--- Yahoo-only 60d HTF bias scan @ NY 09:30 ET ---");
  console.log(`  Sample days: ${scanRows.length}`);
  console.log(`  Daily bias: bullish=${biasCounts.bullish} bearish=${biasCounts.bearish} neutral=${biasCounts.neutral}`);
  console.log(`  15m bias: bullish=${m15Counts.bullish} bearish=${m15Counts.bearish} neutral=${m15Counts.neutral}`);
  console.log(
    `  MSS (1m lookback; only last ~7d has 1m): bull=${mssBull} bear=${mssBear} none=${mssNone} (1m-covered days=${mssWith1m})`
  );
  for (const r of scanRows.slice(-8)) {
    console.log(
      `  ${r.date} daily=${r.daily} m15=${r.m15} dominant=${r.dominant} mss=${r.mss ?? "n/a"} 1m=${r.has1m}`
    );
  }

  assert("60d HTF NY-open samples >= 20", scanRows.length >= 20, `n=${scanRows.length}`);
  console.log(
    "SCREEN_YAHOO60_JSON " +
      JSON.stringify({
        sampleDays: scanRows.length,
        dailyBias: biasCounts,
        m15Bias: m15Counts,
        mss: { bullish: mssBull, bearish: mssBear, none: mssNone, daysWith1m: mssWith1m },
        firstDate: scanRows[0]?.date ?? null,
        lastDate: scanRows.at(-1)?.date ?? null,
      })
  );

  console.log(`\n--- Runtime ---`);
  console.log(`  Yahoo 1m fetch (Aug12 overlap slice): ${yahooFetchMs.toFixed(0)}ms`);
  console.log(`  Yahoo HTF bundle (1m/5m/15m/daily via loadDatasetFromYahoo): ${htfMs.toFixed(0)}ms`);
  console.log(`  TickStream fixtures: disk (0 API)`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

function logOhlc(s: {
  alignedCount: number;
  tsOnlyCount: number;
  yahooOnlyCount: number;
  avgOpenDiff: number;
  avgHighDiff: number;
  avgLowDiff: number;
  avgCloseDiff: number;
  maxOpenDiff: number;
  maxHighDiff: number;
  maxLowDiff: number;
  maxCloseDiff: number;
  pctWithinQuarterPoint: number;
  pctWithinOnePoint: number;
}) {
  console.log(`  Aligned: ${s.alignedCount}  TS-only: ${s.tsOnlyCount}  Yahoo-only: ${s.yahooOnlyCount}`);
  console.log(
    `  Avg diff O/H/L/C: ${s.avgOpenDiff.toFixed(2)} / ${s.avgHighDiff.toFixed(2)} / ${s.avgLowDiff.toFixed(2)} / ${s.avgCloseDiff.toFixed(2)}`
  );
  console.log(
    `  Max diff O/H/L/C: ${s.maxOpenDiff.toFixed(2)} / ${s.maxHighDiff.toFixed(2)} / ${s.maxLowDiff.toFixed(2)} / ${s.maxCloseDiff.toFixed(2)}`
  );
  console.log(
    `  Within 0.25pt: ${s.pctWithinQuarterPoint.toFixed(1)}%  Within 1.0pt: ${s.pctWithinOnePoint.toFixed(1)}%`
  );
}

function candlesToBars(candles: ResearchCandle[]): Bar[] {
  return candles.map((c) => ({
    time: new Date(c.timestamp * 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

function nyOpenCutoffsFrom15m(candles: ResearchCandle[]): Array<{ dateKey: string; asOfSec: number }> {
  const targetMins = 9 * 60 + 30;
  const first = new Map<string, number>();
  for (const c of candles) {
    const d = new Date(c.timestamp * 1000);
    const mins = getEstMinutes(d);
    if (mins < targetMins || mins >= targetMins + 60) continue;
    const key = getEstDateKey(d);
    if (!first.has(key)) first.set(key, c.timestamp);
  }
  return [...first.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, asOfSec]) => ({ dateKey, asOfSec }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
