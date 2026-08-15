/**
 * Find quiet pure-1m bars where updateEqhEqlLiquidity reuses; time force vs incr.
 * Run: npx tsx scripts/bench-eqh-force-off-reuse.ts
 */
import { performance } from "perf_hooks";
import { writeFileSync } from "fs";
import { join } from "path";
import { loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import { createIncrementalMarketEngine, fingerprintEqhAreas } from "../lib/incremental-market-engine";
import { detectEqhEqlLiquidity } from "../lib/research/eqh-eql-liquidity";
import { updateEqhEqlLiquidity } from "../lib/research/eqh-eql-incremental";
import type { Bar } from "../lib/types";
import type { MarketFeed } from "../lib/incremental-market-engine";

function clone(b: Bar): Bar {
  return { time: new Date(b.time.getTime()), open: b.open, high: b.high, low: b.low, close: b.close };
}
function cut(bars: Bar[], t: Date): Bar[] {
  const ms = t.getTime();
  return bars.filter((b) => b.time.getTime() <= ms).map(clone);
}

async function main() {
  const nq = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const candidates: number[] = [];
  for (let i = 200; i < Math.min(nq.m1.length - 1, 900); i++) {
    const t0 = nq.m1[i]!.time;
    const t1 = nq.m1[i + 1]!.time;
    if (t1.getTime() - t0.getTime() !== 60_000) continue;
    if (cut(nq.m5, t0).length !== cut(nq.m5, t1).length) continue;
    if (cut(nq.m15, t0).length !== cut(nq.m15, t1).length) continue;
    if (cut(nq.daily, t0).length !== cut(nq.daily, t1).length) continue;
    candidates.push(i);
  }

  const reuseHits: Array<Record<string, unknown>> = [];
  // Sample every ~40th candidate to keep RAM/time low
  for (const idx of candidates.filter((_, n) => n % 40 === 0).slice(0, 8)) {
    const t0 = nq.m1[idx]!.time;
    const newBar = clone(nq.m1[idx + 1]!);
    const prefix: MarketFeed = {
      symbol: nq.symbol,
      daily: cut(nq.daily, t0),
      m15: cut(nq.m15, t0),
      m5: cut(nq.m5, t0),
      m1: cut(nq.m1, t0),
    };
    const eng = createIncrementalMarketEngine();
    eng.initialize({ data: prefix, asOf: t0, lastPrice: prefix.m1.at(-1)!.close });
    const prev = eng.getEqhEql()!;
    const barsAfter = [...prefix.m1, newBar];
    const a0 = performance.now();
    const forced = detectEqhEqlLiquidity(barsAfter, {
      symbol: nq.symbol,
      currentPrice: newBar.close,
      lookback: 720,
      asOfIndex: barsAfter.length - 1,
    });
    const forceMs = performance.now() - a0;
    const a1 = performance.now();
    const incr = updateEqhEqlLiquidity(
      prev,
      barsAfter,
      { symbol: nq.symbol, currentPrice: newBar.close, lookback: 720, asOfIndex: barsAfter.length - 1 },
      prefix.m1.length
    );
    const incrMs = performance.now() - a1;
    const s0 = eng.stats();
    const a2 = performance.now();
    eng.applyClosedBar(newBar);
    const barMs = performance.now() - a2;
    const s1 = eng.stats();
    const ok = fingerprintEqhAreas(eng.getEqhEql()!) === fingerprintEqhAreas(forced);
    reuseHits.push({
      idx,
      t1: newBar.time.toISOString(),
      m1: prefix.m1.length,
      mode: incr.mode,
      forceMs: +forceMs.toFixed(2),
      incrMs: +incrMs.toFixed(2),
      applyClosedBarMs: +barMs.toFixed(2),
      lastStructureMs: +s1.lastStructureMs.toFixed(2),
      lastEqhMs: +s1.lastEqhMs.toFixed(2),
      eqhReusedDelta: s1.eqhEqlReused - s0.eqhEqlReused,
      parity: ok,
    });
  }

  const out = {
    when: new Date().toISOString(),
    sampled: reuseHits.length,
    reuseCount: reuseHits.filter((r) => r.mode === "reuse").length,
    rebuildCount: reuseHits.filter((r) => r.mode === "rebuild").length,
    allParity: reuseHits.every((r) => r.parity === true),
    rows: reuseHits,
  };
  const path = join(process.cwd(), "data", "research", "karen-eqh-force-off-reuse-sample.json");
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
  console.log("wrote", path);
  if (!out.allParity) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
