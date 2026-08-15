/**
 * Before/after bench for closed-bar eqhForce=false (updateEqhEqlLiquidity).
 * In-process fixture only — no HTTP, no next-dev.
 *
 * Run: npx tsx scripts/bench-eqh-force-off.ts
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

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function main() {
  const nq = loadResearchDatasetFixture("nq-aug12-2026-cme");
  let idx = -1;
  for (let i = 200; i < nq.m1.length - 1; i++) {
    const t0 = nq.m1[i]!.time;
    const t1 = nq.m1[i + 1]!.time;
    if (t1.getTime() - t0.getTime() !== 60_000) continue;
    if (cut(nq.m5, t0).length !== cut(nq.m5, t1).length) continue;
    if (cut(nq.m15, t0).length !== cut(nq.m15, t1).length) continue;
    if (cut(nq.daily, t0).length !== cut(nq.daily, t1).length) continue;
    idx = i;
    if (i > 600) break;
  }
  if (idx < 0) throw new Error("no pure 1m step");

  const t0 = nq.m1[idx]!.time;
  const t1 = nq.m1[idx + 1]!.time;
  const prefix: MarketFeed = {
    symbol: nq.symbol,
    daily: cut(nq.daily, t0),
    m15: cut(nq.m15, t0),
    m5: cut(nq.m5, t0),
    m1: cut(nq.m1, t0),
  };
  const newBar = clone(nq.m1[idx + 1]!);
  const barsAfter = [...prefix.m1, newBar];

  const eng = createIncrementalMarketEngine();
  const initA = performance.now();
  eng.initialize({ data: prefix, asOf: t0, lastPrice: prefix.m1.at(-1)!.close });
  const initMs = performance.now() - initA;
  const s0 = eng.stats();
  const prevEqh = eng.getEqhEql()!;

  // Leaf: forced full detect (pre-optimization closed-bar path)
  const forceSamples: number[] = [];
  let forceLiq = null as ReturnType<typeof detectEqhEqlLiquidity> | null;
  for (let i = 0; i < 3; i++) {
    const a = performance.now();
    forceLiq = detectEqhEqlLiquidity(barsAfter, {
      symbol: nq.symbol,
      currentPrice: newBar.close,
      lookback: 720,
      asOfIndex: barsAfter.length - 1,
    });
    forceSamples.push(performance.now() - a);
  }

  // Leaf: incremental update (post-optimization path)
  const incrSamples: number[] = [];
  let incr = null as ReturnType<typeof updateEqhEqlLiquidity> | null;
  for (let i = 0; i < 3; i++) {
    const a = performance.now();
    incr = updateEqhEqlLiquidity(
      prevEqh,
      barsAfter,
      {
        symbol: nq.symbol,
        currentPrice: newBar.close,
        lookback: 720,
        asOfIndex: barsAfter.length - 1,
      },
      prefix.m1.length
    );
    incrSamples.push(performance.now() - a);
  }

  const barA = performance.now();
  eng.applyClosedBar(newBar);
  const applyClosedBarMs = performance.now() - barA;
  const s1 = eng.stats();

  const engineFp = fingerprintEqhAreas(eng.getEqhEql()!);
  const forceFp = fingerprintEqhAreas(forceLiq!);
  const incrFp = fingerprintEqhAreas(incr!.liquidity);

  // Estimated total new-bar before = structure (unchanged) + forced EQH
  const structureMs = s1.lastStructureMs;
  const forceEqhMs = median(forceSamples);
  const incrEqhMs = median(incrSamples);
  const estimatedBeforeBarMs = structureMs + forceEqhMs;
  const afterBarMs = s1.lastBarMs;

  const out = {
    when: new Date().toISOString(),
    meta: {
      idx,
      t0: t0.toISOString(),
      t1: t1.toISOString(),
      m1Prefix: prefix.m1.length,
      dataset: "nq-aug12-2026-cme",
    },
    initMs,
    eqhLeaf: {
      forceMedianMs: forceEqhMs,
      forceSamples,
      incrMedianMs: incrEqhMs,
      incrSamples,
      incrMode: incr!.mode,
      deltaMs: forceEqhMs - incrEqhMs,
    },
    newBarTotals: {
      estimatedBeforeMs: estimatedBeforeBarMs,
      afterApplyClosedBarMs: afterBarMs,
      wallApplyClosedBarMs: applyClosedBarMs,
      lastStructureMs: structureMs,
      lastEqhMs: s1.lastEqhMs,
      eqhRebuildsDelta: s1.eqhEqlRebuilds - s0.eqhEqlRebuilds,
      eqhReusedDelta: s1.eqhEqlReused - s0.eqhEqlReused,
    },
    parity: {
      engineVsForce: engineFp === forceFp,
      incrVsForce: incrFp === forceFp,
      engineFpLen: engineFp.length,
    },
  };

  const path = join(process.cwd(), "data", "research", "karen-eqh-force-off-bench.json");
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
  console.log("wrote", path);
  if (!out.parity.engineVsForce || !out.parity.incrVsForce) {
    console.error("PARITY FAIL");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
