/**
 * Consecutive closed-bar walk: count EQH reuse vs rebuild + timings.
 * Run: npx tsx scripts/bench-eqh-force-off-walk.ts
 */
import { performance } from "perf_hooks";
import { writeFileSync } from "fs";
import { join } from "path";
import { loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import { createIncrementalMarketEngine, fingerprintEqhAreas } from "../lib/incremental-market-engine";
import { detectEqhEqlLiquidity } from "../lib/research/eqh-eql-liquidity";
import type { Bar } from "../lib/types";
import type { MarketFeed } from "../lib/incremental-market-engine";

function clone(b: Bar): Bar {
  return { time: new Date(b.time.getTime()), open: b.open, high: b.high, low: b.low, close: b.close };
}
function cut(bars: Bar[], t: Date): Bar[] {
  const ms = t.getTime();
  return bars.filter((b) => b.time.getTime() <= ms).map(clone);
}
function med(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

async function main() {
  const nq = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const start = 500;
  const n = 40;
  const t0 = nq.m1[start]!.time;
  const prefix: MarketFeed = {
    symbol: nq.symbol,
    daily: cut(nq.daily, t0),
    m15: cut(nq.m15, t0),
    m5: cut(nq.m5, t0),
    m1: cut(nq.m1, t0),
  };
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: prefix, asOf: t0, lastPrice: prefix.m1.at(-1)!.close });

  let reuse = 0;
  let rebuild = 0;
  let mismatches = 0;
  const reuseEqh: number[] = [];
  const rebuildEqh: number[] = [];
  const reuseBar: number[] = [];
  const rebuildBar: number[] = [];

  for (let i = 1; i <= n; i++) {
    const bar = clone(nq.m1[start + i]!);
    const s0 = eng.stats();
    const a = performance.now();
    eng.applyClosedBar(bar);
    const barMs = performance.now() - a;
    const s1 = eng.stats();
    const dReuse = s1.eqhEqlReused - s0.eqhEqlReused;
    const dReb = s1.eqhEqlRebuilds - s0.eqhEqlRebuilds;
    if (dReuse) {
      reuse += 1;
      reuseEqh.push(s1.lastEqhMs);
      reuseBar.push(barMs);
    }
    if (dReb) {
      rebuild += 1;
      rebuildEqh.push(s1.lastEqhMs);
      rebuildBar.push(barMs);
    }
    const forced = detectEqhEqlLiquidity(cut(nq.m1, bar.time), {
      symbol: nq.symbol,
      currentPrice: bar.close,
      lookback: 720,
    });
    if (fingerprintEqhAreas(eng.getEqhEql()!) !== fingerprintEqhAreas(forced)) mismatches += 1;
  }

  const out = {
    when: new Date().toISOString(),
    start,
    n,
    reuse,
    rebuild,
    mismatches,
    reuseEqhMedMs: med(reuseEqh),
    rebuildEqhMedMs: med(rebuildEqh),
    reuseBarMedMs: med(reuseBar),
    rebuildBarMedMs: med(rebuildBar),
  };
  const path = join(process.cwd(), "data", "research", "karen-eqh-force-off-walk.json");
  writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
  console.log("wrote", path);
  if (mismatches) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
