/**
 * PHASE 1 regression — NQ TickStream historical vs Yahoo MNQ=F (raw NQ, NO /4 scaling).
 * Run: npx tsx scripts/test-tickstream-phase1-validation.ts
 */
import { aggregateTicksTo1m, type MinuteBar } from "../lib/tickstream/aggregate";
import { fetchHistoricalTicks, HistoricalApiError } from "../lib/tickstream/historical";
import { loadTickstreamApiKey } from "../lib/tickstream/quote";
import { fetchBars } from "../lib/market-data";
import type { Bar } from "../lib/types";

type SessionSpec = {
  label: string;
  startUtc: string;
  endUtc: string;
};

const AUG12: SessionSpec = {
  label: "Aug 12 2026 CME session",
  startUtc: "2026-08-11T22:00:00Z",
  endUtc: "2026-08-12T22:00:00Z",
};

const AUG11: SessionSpec = {
  label: "Aug 11 2026 CME session",
  startUtc: "2026-08-10T22:00:00Z",
  endUtc: "2026-08-11T22:00:00Z",
};

function iso(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function barMinuteTs(bar: Bar): number {
  return Math.floor(bar.time.getTime() / 1000);
}

function ohlcDiff(a: number, b: number): number {
  return Math.abs(a - b);
}

type SessionResult = {
  session: SessionSpec;
  ticks: number;
  chunks: number;
  pages: number;
  truncatedPages: number;
  duplicatesSkipped: number;
  candles: number;
  yahooCandles: number;
  yahooAligned: boolean;
  timestampOverlap: number;
  avgOhlcDiff: number;
  maxOhlcDiff: number;
  missingMinutes: number;
  duplicateMinutes: number;
  missingMinuteSamples: string[];
  duplicateMinuteSamples: string[];
  error?: string;
};

async function validateSession(
  apiKey: string,
  session: SessionSpec,
  yahooAll: Bar[]
): Promise<SessionResult> {
  const startSec = Math.floor(new Date(session.startUtc).getTime() / 1000);
  const endSec = Math.floor(new Date(session.endUtc).getTime() / 1000);

  const base: SessionResult = {
    session,
    ticks: 0,
    chunks: 0,
    pages: 0,
    truncatedPages: 0,
    duplicatesSkipped: 0,
    candles: 0,
    yahooCandles: 0,
    yahooAligned: false,
    timestampOverlap: 0,
    avgOhlcDiff: NaN,
    maxOhlcDiff: NaN,
    missingMinutes: 0,
    duplicateMinutes: 0,
    missingMinuteSamples: [],
    duplicateMinuteSamples: [],
  };

  try {
    const nqResult = await fetchHistoricalTicks({
      apiKey,
      symbol: "NQ",
      exchange: "CME",
      start: session.startUtc,
      end: session.endUtc,
    });

    base.ticks = nqResult.ticks.length;
    base.chunks = nqResult.stats.chunks;
    base.pages = nqResult.stats.pages;
    base.truncatedPages = nqResult.stats.truncatedPages;
    base.duplicatesSkipped = nqResult.stats.duplicatesSkipped;

    const tickInputs = nqResult.ticks.map((t) => ({
      price: t.price,
      size: t.size,
      ts: t.timestamp,
      id: `${t.timestamp}:${t.price}:${t.size}:${t.side}`,
    }));

    const allBars = aggregateTicksTo1m(tickInputs);
    const nqBars = allBars.filter((b) => b.minuteTs >= startSec && b.minuteTs < endSec);
    base.candles = nqBars.length;

    const yahooSession = yahooAll.filter((b) => {
      const ts = barMinuteTs(b);
      return ts >= startSec && ts < endSec;
    });
    base.yahooCandles = yahooSession.length;

    const nqByTs = new Map<number, MinuteBar>();
    for (const b of nqBars) {
      if (nqByTs.has(b.minuteTs)) {
        base.duplicateMinutes++;
        if (base.duplicateMinuteSamples.length < 5) {
          base.duplicateMinuteSamples.push(iso(b.minuteTs));
        }
      }
      nqByTs.set(b.minuteTs, b);
    }

    const yahooByTs = new Map<number, Bar>();
    for (const b of yahooSession) {
      yahooByTs.set(barMinuteTs(b), b);
    }

    const alignedTs = [...nqByTs.keys()].filter((t) => yahooByTs.has(t)).sort((a, b) => a - b);
    base.timestampOverlap = alignedTs.length;

    const yahooGatePass = yahooSession.length > 0 && alignedTs.length > 0;
    base.yahooAligned =
      yahooGatePass &&
      alignedTs.every((t, i) => i === 0 || t - alignedTs[i - 1]! === 60);

    for (const ts of yahooByTs.keys()) {
      if (!nqByTs.has(ts)) {
        base.missingMinutes++;
        if (base.missingMinuteSamples.length < 5) base.missingMinuteSamples.push(iso(ts));
      }
    }

    const allDiffs: number[] = [];
    for (const ts of alignedTs) {
      const nq = nqByTs.get(ts)!;
      const y = yahooByTs.get(ts)!;
      allDiffs.push(
        ohlcDiff(nq.open, y.open),
        ohlcDiff(nq.high, y.high),
        ohlcDiff(nq.low, y.low),
        ohlcDiff(nq.close, y.close)
      );
    }

    base.avgOhlcDiff = allDiffs.length
      ? allDiffs.reduce((a, b) => a + b, 0) / allDiffs.length
      : NaN;
    base.maxOhlcDiff = allDiffs.length ? Math.max(...allDiffs) : NaN;

    return base;
  } catch (err) {
    base.error =
      err instanceof HistoricalApiError
        ? `HTTP ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return base;
  }
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(4) : "n/a";
}

async function main() {
  const apiKey = loadTickstreamApiKey();
  if (!apiKey) {
    console.error("TICKSTREAM_API_KEY required");
    process.exit(1);
  }

  let yahooAll: Bar[];
  try {
    yahooAll = await fetchBars("1m", "7d");
  } catch (err) {
    console.error(`Yahoo fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const aug12 = await validateSession(apiKey, AUG12, yahooAll);
  const aug11 = await validateSession(apiKey, AUG11, yahooAll);

  // Unit test counts — run separately but capture for report
  const unitExit = await new Promise<number>((resolve) => {
    const { spawn } = require("node:child_process") as typeof import("node:child_process");
    const child = spawn("npm.cmd", ["run", "test:tickstream-historical-unit"], {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", (code: number | null) => {
      const m = out.match(/(\d+) passed, (\d+) failed/);
      (global as { __unitResult?: string }).__unitResult = m ? `${m[1]}/${Number(m[1]) + Number(m[2])}` : "?/?";
      resolve(code ?? 1);
    });
  });

  const unitResult = (global as { __unitResult?: string }).__unitResult ?? "?/?";

  const tsNormPass =
    aug12.ticks > 0 &&
    aug12.candles > 1 &&
    !aug12.error;
  const chunkPass =
    aug12.chunks > 1 &&
    aug12.pages >= aug12.chunks &&
    !aug12.error;

  console.log("=== PHASE 1 HISTORICAL TICKSTREAM FIX ===\n");
  console.log(`Timestamp normalization: ${tsNormPass ? "PASS" : "FAIL"}`);
  console.log(`Chunked pagination: ${chunkPass ? "PASS" : "FAIL"}`);
  console.log(`Unit tests: ${unitResult}`);

  console.log("\nAugust 12 validation:");
  if (aug12.error) {
    console.log(`ERROR: ${aug12.error}`);
  } else {
    console.log(
      [
        `ticks=${aug12.ticks}`,
        `chunks=${aug12.chunks}`,
        `pages=${aug12.pages}`,
        `truncatedPages=${aug12.truncatedPages}`,
        `deduped=${aug12.duplicatesSkipped}`,
        `1m candles=${aug12.candles}`,
        `Yahoo aligned=${aug12.yahooAligned ? "PASS" : "FAIL"}`,
        `timestamp overlap=${aug12.timestampOverlap}`,
        `avg OHLC diff=${fmt(aug12.avgOhlcDiff)}`,
        `max OHLC diff=${fmt(aug12.maxOhlcDiff)}`,
      ].join(", ")
    );
  }

  console.log("\nSecond-session validation:");
  console.log(`date=${AUG11.label}`);
  if (aug11.error) {
    console.log(`ERROR: ${aug11.error}`);
  } else {
    console.log(
      [
        `ticks=${aug11.ticks}`,
        `chunks=${aug11.chunks}`,
        `pages=${aug11.pages}`,
        `1m candles=${aug11.candles}`,
        `Yahoo aligned=${aug11.yahooAligned ? "PASS" : "FAIL"}`,
        `timestamp overlap=${aug11.timestampOverlap}`,
        `avg OHLC diff=${fmt(aug11.avgOhlcDiff)}`,
        `max OHLC diff=${fmt(aug11.maxOhlcDiff)}`,
      ].join(", ")
    );
  }

  // Material difference check between sessions (close ratio proxy via avg diff)
  if (
    Number.isFinite(aug12.avgOhlcDiff) &&
    Number.isFinite(aug11.avgOhlcDiff) &&
    aug12.timestampOverlap > 50 &&
    aug11.timestampOverlap > 50
  ) {
    const ratio12 = aug12.avgOhlcDiff;
    const ratio11 = aug11.avgOhlcDiff;
    if (Math.abs(ratio12 - ratio11) > 5 && ratio12 > 10 && ratio11 < 3) {
      console.log("\n*** STOP: materially different price relationship between sessions ***");
    }
  }

  console.log("\nMissing minutes:");
  console.log(`  Aug 12: ${aug12.missingMinutes}${aug12.missingMinuteSamples.length ? ` (e.g. ${aug12.missingMinuteSamples.join(", ")})` : ""}`);
  console.log(`  Aug 11: ${aug11.missingMinutes}${aug11.missingMinuteSamples.length ? ` (e.g. ${aug11.missingMinuteSamples.join(", ")})` : ""}`);

  console.log("\nDuplicate minutes:");
  console.log(`  Aug 12: ${aug12.duplicateMinutes}${aug12.duplicateMinuteSamples.length ? ` (e.g. ${aug12.duplicateMinuteSamples.join(", ")})` : ""}`);
  console.log(`  Aug 11: ${aug11.duplicateMinutes}${aug11.duplicateMinuteSamples.length ? ` (e.g. ${aug11.duplicateMinuteSamples.join(", ")})` : ""}`);

  process.exit(unitExit !== 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
