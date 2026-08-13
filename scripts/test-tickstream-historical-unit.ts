/**
 * Offline unit tests for TickStream historical normalization & pagination mocks.
 * Run: npm run test:tickstream-historical-unit
 */
import {
  normalizeHistoricalTick,
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

console.log("=== normalizeHistoricalTick ===");

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
