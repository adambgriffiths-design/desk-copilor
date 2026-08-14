/**
 * Offline unit tests for TickStream historical normalization & pagination mocks.
 * Run: npm run test:tickstream-historical-unit
 */
import {
  buildHistoricalChunkRanges,
  dedupeAndSortHistoricalTicks,
  normalizeHistoricalTick,
  normalizeHistoricalTimestamp,
  parseHistoricalTimeParam,
  DEFAULT_HISTORICAL_CHUNK_SECONDS,
  type NormalizedTick,
  type RawHistoricalTick,
} from "../lib/tickstream/historical";
import { aggregateHtfFrom1m, cmeSessionDateKey, tradeCountsFromTicks } from "../lib/tickstream/htf-aggregate";
import { aggregateTicksTo1m } from "../lib/tickstream/aggregate";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\n=== normalizeHistoricalTimestamp (µs → seconds) ===");

{
  // Aug 2026 ~1.755e9 seconds → ~1.755e15 microseconds
  const us = 1_755_000_000_000_000;
  const sec = normalizeHistoricalTimestamp(us);
  assert(sec === 1_755_000_000, "microsecond timestamp converts to Unix seconds");
}

{
  const sec = 1_709_000_000;
  assert(normalizeHistoricalTimestamp(sec) === sec, "second timestamp passes through unchanged");
}

{
  const exactMinuteUs = 1_755_000_000_000_000; // exactly on minute boundary in seconds after convert
  const sec = normalizeHistoricalTimestamp(exactMinuteUs);
  assert(sec % 60 === 0, "exact minute boundary preserved after µs conversion");
}

{
  // One microsecond before next minute boundary
  const nearBoundaryUs = 1_755_000_059_999_999;
  const sec = normalizeHistoricalTimestamp(nearBoundaryUs);
  assert(sec === 1_755_000_059, "timestamp near minute boundary floors correctly");
}

{
  const us = 1_755_000_000_000_000;
  const once = normalizeHistoricalTimestamp(us);
  const twice = normalizeHistoricalTimestamp(once);
  assert(once === twice, "no double conversion when already normalized to seconds");
}

console.log("\n=== normalizeHistoricalTick with µs archive ts ===");

{
  const usTs = 1_755_000_000_000_000;
  const { tick, error } = normalizeHistoricalTick(
    { ts: usTs, price: 21000.5, size: 2, side: "buy" },
    "NQ",
    "CME"
  );
  assert(error == null && tick != null, "valid microsecond tick normalizes");
  assert(tick!.timestamp === 1_755_000_000, "normalized tick timestamp is Unix seconds");
}

{
  const { tick, error } = normalizeHistoricalTick(
    { ts: 1_709_000_000, price: 21000.5, size: 2, side: "buy" },
    "MNQ",
    "CME"
  );
  assert(error == null && tick != null, "valid second tick normalizes");
  assert(tick!.timestamp === 1_709_000_000, "second timestamp stored as-is");
}

console.log("\n=== parseHistoricalTimeParam ===");

{
  const iso = "2026-08-12T14:30:00Z";
  const sec = parseHistoricalTimeParam(iso);
  assert(sec === Math.floor(new Date(iso).getTime() / 1000), "ISO string parses to seconds");
}

console.log("\n=== aggregate 1m with normalized historical ticks ===");

{
  const usBase = 1_755_000_000_000_000; // 2026-08-12-ish
  const { tick: t1 } = normalizeHistoricalTick({ ts: usBase + 10_000_000, price: 100, size: 1 }, "NQ", "CME");
  const { tick: t2 } = normalizeHistoricalTick({ ts: usBase + 20_000_000, price: 105, size: 2 }, "NQ", "CME");
  const { tick: t3 } = normalizeHistoricalTick({ ts: usBase + 70_000_000, price: 110, size: 1 }, "NQ", "CME");
  const bars = aggregateTicksTo1m([
    { price: t1!.price, size: t1!.size, ts: t1!.timestamp },
    { price: t2!.price, size: t2!.size, ts: t2!.timestamp },
    { price: t3!.price, size: t3!.size, ts: t3!.timestamp },
  ]);
  assert(bars.length >= 1, "1m bars from µs-normalized ticks span multiple ticks in one minute");
}

console.log("\n=== normalizeHistoricalTick (legacy) ===");

{
  const { tick, error } = normalizeHistoricalTick(
    { ts: 1_709_000_000, price: 21000.5, size: 2, side: "buy" },
    "MNQ",
    "CME"
  );
  assert(error == null && tick != null, "valid tick normalizes");
  assert(tick!.exchange === "CME" && tick!.side === "buy", "exchange and side preserved");
}

{
  const { tick, error } = normalizeHistoricalTick(
    { ts: NaN, price: 1, size: 1 },
    "MNQ",
    "CME"
  );
  assert(tick == null && error != null, "invalid ts rejected");
}

{
  const { tick } = normalizeHistoricalTick(
    { ts: 100, price: 1, size: 1, side: "maybe" },
    "MNQ",
    "CME"
  );
  assert(tick?.side === "unknown", "unknown side coerced");
}

console.log("\n=== buildHistoricalChunkRanges (~5min CME session chunks) ===");

{
  const start = Math.floor(new Date("2026-08-11T22:00:00Z").getTime() / 1000);
  const end = Math.floor(new Date("2026-08-12T22:00:00Z").getTime() / 1000);
  const ranges = buildHistoricalChunkRanges(start, end, DEFAULT_HISTORICAL_CHUNK_SECONDS);
  assert(ranges.length === 288, "24h session splits into 288 five-minute chunks");
  assert(ranges[0]!.startSec === start, "first chunk starts at session open");
  assert(ranges.at(-1)!.endSec === end, "last chunk ends at session close");
  assert(ranges[0]!.endSec - ranges[0]!.startSec === 300, "interior chunk is 300 seconds");
  assert(ranges[1]!.startSec === ranges[0]!.endSec, "chunks are contiguous without gaps");
}

{
  const ranges = buildHistoricalChunkRanges(1000, 1400, 300);
  assert(ranges.length === 2, "400s range yields 2 chunks with partial last chunk");
  assert(ranges[1]!.endSec === 1400 && ranges[1]!.startSec === 1300, "last chunk is 100 seconds");
}

console.log("\n=== dedupeAndSortHistoricalTicks ===");

{
  const ticks: NormalizedTick[] = [
    { symbol: "NQ", price: 21000, size: 1, side: "buy", exchange: "CME", timestamp: 300 },
    { symbol: "NQ", price: 21000, size: 1, side: "buy", exchange: "CME", timestamp: 300 },
    { symbol: "NQ", price: 21001, size: 2, side: "sell", exchange: "CME", timestamp: 100 },
    { symbol: "NQ", price: 21002, size: 1, side: "buy", exchange: "CME", timestamp: 200 },
  ];
  const { ticks: out, duplicatesSkipped, outOfOrderCorrected } = dedupeAndSortHistoricalTicks(ticks);
  assert(out.length === 3, "duplicate tick removed");
  assert(duplicatesSkipped === 1, "one duplicate skipped");
  assert(out[0]!.timestamp === 100 && out.at(-1)!.timestamp === 300, "sorted ascending");
  assert(outOfOrderCorrected === true, "out-of-order input detected");
}

{
  const ticks: NormalizedTick[] = [
    { symbol: "NQ", price: 1, size: 1, side: "buy", exchange: "CME", timestamp: 100 },
    { symbol: "NQ", price: 2, size: 1, side: "sell", exchange: "CME", timestamp: 200 },
  ];
  const { ticks: out, duplicatesSkipped, outOfOrderCorrected } = dedupeAndSortHistoricalTicks(ticks);
  assert(out.length === 2 && duplicatesSkipped === 0, "unique ordered ticks unchanged");
  assert(outOfOrderCorrected === false, "already ordered input");
}

console.log("\n=== pagination mock (truncated chain) ===");

function simulatePagination(pages: Array<{ ticks: RawHistoricalTick[]; truncated: boolean }>) {
  const all: RawHistoricalTick[] = [];
  let start = 0;
  for (const page of pages) {
    const filtered = page.ticks.filter((t) => t.ts >= start);
    all.push(...filtered);
    if (!page.truncated || filtered.length === 0) break;
    start = filtered[filtered.length - 1].ts;
  }
  return all;
}

{
  const pages = [
    {
      truncated: true,
      ticks: [
        { ts: 100, price: 1, size: 1, side: "buy" },
        { ts: 200, price: 2, size: 1, side: "sell" },
      ],
    },
    {
      truncated: false,
      ticks: [
        { ts: 200, price: 2, size: 1, side: "sell" },
        { ts: 300, price: 3, size: 1, side: "buy" },
      ],
    },
  ];
  const merged = simulatePagination(pages);
  assert(merged.length === 4, "pagination includes overlap at boundary ts (deduped in fetchHistoricalTicks)");
  assert(merged[0].ts === 100 && merged.at(-1)!.ts === 300, "ordered merge");
}

console.log("\n=== aggregate.ts + HTF ===");

{
  const base = 1_749_556_800;
  const ticks = [
    { price: 100, size: 1, ts: base + 10 },
    { price: 105, size: 2, ts: base + 20 },
    { price: 110, size: 1, ts: base + 70 },
  ];
  const bars = aggregateTicksTo1m(ticks);
  const tc = tradeCountsFromTicks(ticks.map((t) => ({ timestamp: t.ts })));
  const htf = aggregateHtfFrom1m(bars, tc, ["5m"]);
  assert(bars.length >= 1, "1m bars from ticks");
  assert(htf["5m"].length >= 1, "5m HTF from 1m");
}

console.log("\n=== CME session date key ===");

{
  // 2025-03-03 17:00 ET = 22:00 UTC → still same session day
  const tsBefore6pm = Math.floor(new Date("2025-03-03T22:00:00Z").getTime() / 1000);
  const keyBefore = cmeSessionDateKey(tsBefore6pm);
  assert(keyBefore === "2025-03-03", "before 6 PM ET stays calendar day");

  // 2025-03-03 19:00 ET = 2025-03-04 00:00 UTC → next session day
  const tsAfter6pm = Math.floor(new Date("2025-03-04T00:00:00Z").getTime() / 1000);
  const keyAfter = cmeSessionDateKey(tsAfter6pm);
  assert(keyAfter === "2025-03-04", "at/after 6 PM ET rolls to next session day");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
