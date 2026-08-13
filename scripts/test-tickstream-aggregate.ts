/**
 * Unit tests for TickStream 1-minute OHLCV aggregation — run: npx tsx scripts/test-tickstream-aggregate.ts
 */
import {
  MinuteAggregator,
  aggregateTicksTo1m,
  type TickInput,
} from "../lib/tickstream/aggregate";

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

console.log("=== MinuteAggregator ===");

{
  const agg = new MinuteAggregator();
  const t0 = 1_749_556_800; // exact minute boundary
  const completed = agg.addTick({ price: 100, size: 2, ts: t0 + 5 });
  assert(completed.length === 0, "first tick does not complete a bar");
  const snap = agg.snapshot();
  assert(snap?.open === 100 && snap.high === 100 && snap.low === 100 && snap.close === 100, "OHLC from first tick");
  assert(snap?.volume === 2, "volume from first tick");
}

{
  const agg = new MinuteAggregator();
  const base = 1_749_556_800;
  agg.addTick({ price: 100, size: 1, ts: base + 10 });
  agg.addTick({ price: 105, size: 2, ts: base + 20 });
  agg.addTick({ price: 98, size: 3, ts: base + 50 });
  const snap = agg.snapshot();
  assert(snap?.open === 100, "open stays first tick");
  assert(snap?.high === 105, "high updated");
  assert(snap?.low === 98, "low updated");
  assert(snap?.close === 98, "close is last tick");
  assert(snap?.volume === 6, "volume sums sizes");
}

{
  const agg = new MinuteAggregator();
  const m1 = 1_749_556_800;
  const m2 = m1 + 60;
  agg.addTick({ price: 100, size: 1, ts: m1 + 30 });
  const rolled = agg.addTick({ price: 110, size: 2, ts: m2 + 5 });
  assert(rolled.length === 1, "minute rollover emits completed bar");
  assert(rolled[0].close === 100, "completed bar close from prior minute");
  assert(agg.snapshot()?.open === 110, "new minute starts fresh bar");
}

{
  const agg = new MinuteAggregator();
  const base = 1_749_556_800;
  agg.addTick({ price: 100, size: 1, ts: base + 40, id: "a" });
  agg.addTick({ price: 999, size: 99, ts: base + 41, id: "a" });
  assert(agg.snapshot()?.close === 100, "duplicate id ignored");
  assert(agg.snapshot()?.volume === 1, "duplicate id does not add volume");
}

{
  const agg = new MinuteAggregator();
  const m1 = 1_749_556_800;
  const m2 = m1 + 60;
  agg.addTick({ price: 100, size: 1, ts: m2 + 10 });
  agg.addTick({ price: 95, size: 2, ts: m1 + 50 });
  const past = agg.flush();
  assert(past.length === 2, "out-of-order minute retained");
  assert(past[0].minuteTs === m1 && past[0].close === 95, "older minute bar updated");
  assert(past[1].minuteTs === m2, "current minute bar included on flush");
}

{
  const ticks: TickInput[] = [
    { price: 10, size: 1, ts: 100 },
    { price: 12, size: 2, ts: 130 },
    { price: 11, size: 1, ts: 161 },
  ];
  const bars = aggregateTicksTo1m(ticks);
  assert(bars.length === 2, "helper splits two minutes");
  assert(bars[0].minuteTs === 60 && bars[1].minuteTs === 120, "helper buckets correctly");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
