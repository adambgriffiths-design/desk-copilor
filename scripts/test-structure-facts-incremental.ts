#!/usr/bin/env npx tsx
/**
 * Structure-facts incremental: CURRENT (full buildStructureFacts) vs OPTIMIZED (updateStructureFacts)
 * fixture parity + BEFORE/AFTER timings. No next-dev / network.
 *
 * Run: npx tsx scripts/test-structure-facts-incremental.ts
 * Writes: data/research/karen-structure-facts-incremental.md
 */
import { performance } from "perf_hooks";
import { writeFileSync } from "fs";
import { join } from "path";
import type { Bar } from "../lib/types";
import {
  buildStructureFacts,
  detectRelativeEqualPools,
  updateStructureFacts,
  type StructureFactsResult,
} from "../lib/structure";
import { detectFirstPresentedFvgs } from "../lib/gap-zones";
import { liquidityLevelsFromContext } from "../lib/levels";
import {
  createIncrementalMarketEngine,
  type MarketFeed,
} from "../lib/incremental-market-engine";
import { loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import { getEstDateKey } from "../lib/market-data";

function clone(b: Bar): Bar {
  return { time: new Date(b.time.getTime()), open: b.open, high: b.high, low: b.low, close: b.close };
}

function cutFeed(data: MarketFeed, t: Date): MarketFeed {
  const cut = (bars: Bar[]) => bars.filter((b) => b.time.getTime() <= t.getTime()).map(clone);
  return {
    symbol: data.symbol,
    daily: cut(data.daily),
    m15: cut(data.m15),
    m5: cut(data.m5),
    m1: cut(data.m1),
  };
}

function fingerprintFacts(f: StructureFactsResult): string {
  return JSON.stringify({
    mss: f.mss,
    relativeEqualPools: f.relativeEqualPools,
    firstPresentedFvg: f.firstPresentedFvg,
    m1UnfilledFvgs: f.m1UnfilledFvgs,
    m1InvertedFvgs: f.m1InvertedFvgs,
    liquiditySweeps: f.liquiditySweeps,
    levelInteractions: f.levelInteractions,
    summary: f.summary,
  });
}

function diffKeys(a: StructureFactsResult, b: StructureFactsResult): string[] {
  const out: string[] = [];
  const keys = [
    "mss",
    "relativeEqualPools",
    "firstPresentedFvg",
    "m1UnfilledFvgs",
    "m1InvertedFvgs",
    "liquiditySweeps",
    "levelInteractions",
    "summary",
  ] as const;
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function timed<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
}

type CaseResult = {
  name: string;
  pass: boolean;
  detail: string;
  diffs?: string[];
};

async function main() {
  const nq = loadResearchDatasetFixture("nq-aug12-2026-cme");
  const feed: MarketFeed = {
    symbol: nq.symbol,
    daily: nq.daily.map(clone),
    m15: nq.m15.map(clone),
    m5: nq.m5.map(clone),
    m1: nq.m1.map(clone),
  };

  // Pure new-1m profile bar (idx 601 → 602→603), same as karen-newbar-miss-deep-profile
  const idx = 601;
  const t0 = feed.m1[idx]!.time;
  const t1 = feed.m1[idx + 1]!.time;
  const prefix = cutFeed(feed, t0);
  const newBar = clone(feed.m1[idx + 1]!);

  const cases: CaseResult[] = [];

  // --- Seed engine + levels ---
  const eng = createIncrementalMarketEngine();
  eng.initialize({ data: prefix, asOf: t0, lastPrice: prefix.m1.at(-1)!.close });
  const ctx0 = eng.getContext();
  const levels = liquidityLevelsFromContext({
    pdLevels: ctx0.htfPdArrays.levels,
    sessions: ctx0.sessions,
    org: ctx0.org,
  });
  const sessionId = ctx0.activeSession.id;
  const m1After = [...prefix.m1.map(clone), newBar];
  const asOfAfter = newBar.time;

  // --- Leaf CURRENT vs OPTIMIZED on single new bar ---
  const currentLeaf = timed(() => buildStructureFacts(m1After, levels, asOfAfter, sessionId));

  let state = updateStructureFacts(null, null, prefix.m1, levels, t0, sessionId);
  const optLeaf = timed(() =>
    updateStructureFacts(state.facts, state.state, m1After, levels, asOfAfter, sessionId)
  );
  state = optLeaf.value;

  const leafDiff = diffKeys(currentLeaf.value, optLeaf.value.facts);
  cases.push({
    name: "new_1m_close leaf CURRENT≡OPTIMIZED",
    pass: leafDiff.length === 0,
    detail: `mode=${optLeaf.value.mode} reh=${optLeaf.value.leaf.reh} fpReuse=${JSON.stringify(optLeaf.value.leaf.firstPresented)}`,
    diffs: leafDiff,
  });

  // --- Engine applyClosedBar vs full rebuild facts (levels AFTER applyPriceDerived) ---
  const eng2 = createIncrementalMarketEngine();
  eng2.initialize({ data: prefix, asOf: t0, lastPrice: prefix.m1.at(-1)!.close });
  const beforeStats = eng2.stats();
  const barWall = timed(() => eng2.applyClosedBar(newBar));
  const afterStats = eng2.stats();
  const engineFacts = eng2.getContext().structureFacts;
  const levelsAfter = liquidityLevelsFromContext({
    pdLevels: eng2.getContext().htfPdArrays.levels,
    sessions: eng2.getContext().sessions,
    org: eng2.getContext().org,
  });
  const fullFacts = buildStructureFacts(
    m1After,
    levelsAfter,
    asOfAfter,
    eng2.getContext().activeSession.id
  );
  const engDiff = diffKeys(engineFacts, fullFacts);
  cases.push({
    name: "engine applyClosedBar ≡ buildStructureFacts",
    pass: engDiff.length === 0,
    detail: `lastStructureMs=${afterStats.lastStructureMs.toFixed(1)} lastBarMs=${afterStats.lastBarMs.toFixed(1)} structureΔ=${afterStats.structureRebuilds - beforeStats.structureRebuilds}`,
    diffs: engDiff,
  });

  // --- Repeated same bar (same timestamp updates OHLC; facts must stay ≡ full) ---
  const sRep0 = eng2.stats();
  eng2.applyClosedBar(clone(newBar));
  const sRep1 = eng2.stats();
  const repLevels = liquidityLevelsFromContext({
    pdLevels: eng2.getContext().htfPdArrays.levels,
    sessions: eng2.getContext().sessions,
    org: eng2.getContext().org,
  });
  const repFull = buildStructureFacts(
    m1After,
    repLevels,
    asOfAfter,
    eng2.getContext().activeSession.id
  );
  const repFacts = eng2.getContext().structureFacts;
  const repDiff = diffKeys(repFacts, repFull);
  cases.push({
    name: "repeated bar facts stable ≡ full",
    pass: repDiff.length === 0,
    detail: `barUpdatesΔ=${sRep1.barUpdates - sRep0.barUpdates}`,
    diffs: repDiff,
  });

  // --- First bar / cold ---
  const tiny = cutFeed(feed, feed.m1[40]!.time);
  const engCold = createIncrementalMarketEngine();
  engCold.initialize({ data: tiny, asOf: tiny.m1.at(-1)!.time, lastPrice: tiny.m1.at(-1)!.close });
  const coldFull = buildStructureFacts(
    tiny.m1,
    liquidityLevelsFromContext({
      pdLevels: engCold.getContext().htfPdArrays.levels,
      sessions: engCold.getContext().sessions,
      org: engCold.getContext().org,
    }),
    tiny.m1.at(-1)!.time,
    engCold.getContext().activeSession.id
  );
  const coldDiff = diffKeys(engCold.getContext().structureFacts, coldFull);
  cases.push({
    name: "first/cold initialize structure ≡ full",
    pass: coldDiff.length === 0,
    detail: `bars=${tiny.m1.length}`,
    diffs: coldDiff,
  });

  // --- Walk parity (structure only) over 40 bars ---
  const walkStart = 500;
  const walkN = 40;
  let walkState = updateStructureFacts(
    null,
    null,
    feed.m1.slice(0, walkStart + 1).map(clone),
    levels,
    feed.m1[walkStart]!.time,
    sessionId
  );
  let walkMismatches = 0;
  let firstWalkDiff: { i: number; diffs: string[] } | null = null;
  let incrCount = 0;
  for (let i = walkStart + 1; i <= walkStart + walkN; i++) {
    const bars = feed.m1.slice(0, i + 1).map(clone);
    const asOf = bars.at(-1)!.time;
    const cur = buildStructureFacts(bars, levels, asOf, sessionId);
    const opt = updateStructureFacts(walkState.facts, walkState.state, bars, levels, asOf, sessionId);
    walkState = opt;
    if (opt.mode === "incremental") incrCount += 1;
    const d = diffKeys(cur, opt.facts);
    if (d.length) {
      walkMismatches += 1;
      if (!firstWalkDiff) firstWalkDiff = { i, diffs: d };
    }
  }
  cases.push({
    name: `walk ${walkN} bars CURRENT≡OPTIMIZED`,
    pass: walkMismatches === 0,
    detail: `mismatches=${walkMismatches} incrementalModes=${incrCount}/${walkN}${firstWalkDiff ? ` first@${firstWalkDiff.i}:${firstWalkDiff.diffs.join(",")}` : ""}`,
    diffs: firstWalkDiff?.diffs,
  });

  // --- Session boundary: asOf jumps date key forces full ---
  const lateIdx = Math.min(feed.m1.length - 2, 1200);
  const latePrefix = feed.m1.slice(0, lateIdx + 1).map(clone);
  const lateBar = clone(feed.m1[lateIdx + 1]!);
  let lateState = updateStructureFacts(null, null, latePrefix, levels, latePrefix.at(-1)!.time, sessionId);
  const lateOpt = updateStructureFacts(
    lateState.facts,
    lateState.state,
    [...latePrefix, lateBar],
    levels,
    lateBar.time,
    sessionId
  );
  const lateCur = buildStructureFacts([...latePrefix, lateBar], levels, lateBar.time, sessionId);
  const lateDiff = diffKeys(lateCur, lateOpt.facts);
  cases.push({
    name: "later session-span bar CURRENT≡OPTIMIZED",
    pass: lateDiff.length === 0,
    detail: `mode=${lateOpt.mode} date ${getEstDateKey(latePrefix.at(-1)!.time)}→${getEstDateKey(lateBar.time)}`,
    diffs: lateDiff,
  });

  // --- First-presented + REH leaf parity ---
  cases.push({
    name: "first-presented FVG CURRENT≡OPTIMIZED",
    pass:
      JSON.stringify(currentLeaf.value.firstPresentedFvg) ===
      JSON.stringify(optLeaf.value.facts.firstPresentedFvg),
    detail: `reused=${JSON.stringify(optLeaf.value.leaf.firstPresented)}`,
  });

  const rehCur = detectRelativeEqualPools(m1After, asOfAfter, sessionId);
  cases.push({
    name: "REH/REL pools CURRENT≡OPTIMIZED",
    pass: JSON.stringify(rehCur) === JSON.stringify(optLeaf.value.facts.relativeEqualPools),
    detail: `pools=${optLeaf.value.facts.relativeEqualPools.length}`,
  });

  // --- Benchmarks (warmup then samples; median of warm only) ---
  const currentSamples: number[] = [];
  const optSamples: number[] = [];
  const barCurSamples: number[] = [];
  const barOptSamples: number[] = [];

  // Warm Intl / JIT / fixture paths once before timed samples.
  {
    buildStructureFacts(m1After, levels, asOfAfter, sessionId);
    let stW = updateStructureFacts(null, null, prefix.m1, levels, t0, sessionId);
    updateStructureFacts(stW.facts, stW.state, m1After, levels, asOfAfter, sessionId);
    detectRelativeEqualPools(m1After, asOfAfter, sessionId);
    detectFirstPresentedFvgs(m1After, asOfAfter, sessionId);
    const eW = createIncrementalMarketEngine();
    eW.initialize({ data: prefix, asOf: t0, lastPrice: prefix.m1.at(-1)!.close });
    eW.applyClosedBar(clone(newBar));
  }

  for (let s = 0; s < 7; s++) {
    currentSamples.push(timed(() => buildStructureFacts(m1After, levels, asOfAfter, sessionId)).ms);
    let st = updateStructureFacts(null, null, prefix.m1, levels, t0, sessionId);
    const o = timed(() => updateStructureFacts(st.facts, st.state, m1After, levels, asOfAfter, sessionId));
    optSamples.push(o.ms);
  }

  // Engine BEFORE = full structure path simulated; AFTER = applyClosedBar with incremental
  for (let s = 0; s < 5; s++) {
    barCurSamples.push(
      timed(() => {
        buildStructureFacts(m1After, levels, asOfAfter, sessionId);
      }).ms
    );

    const eOpt = createIncrementalMarketEngine();
    eOpt.initialize({ data: prefix, asOf: t0, lastPrice: prefix.m1.at(-1)!.close });
    const w = timed(() => eOpt.applyClosedBar(clone(newBar)));
    barOptSamples.push(eOpt.stats().lastBarMs || w.ms);
  }

  // Leaf isolations for REH/FP after seed
  const rehIsoCur: number[] = [];
  const rehIsoOpt: number[] = [];
  const fpIsoCur: number[] = [];
  const fpIsoOpt: number[] = [];
  {
    const { detectFirstPresentedFvgsIncremental } = await import("../lib/gap-zones");
    for (let s = 0; s < 7; s++) {
      rehIsoCur.push(timed(() => detectRelativeEqualPools(m1After, asOfAfter, sessionId)).ms);
      let st = updateStructureFacts(null, null, prefix.m1, levels, t0, sessionId);
      rehIsoOpt.push(
        timed(() => {
          updateStructureFacts(st.facts, st.state, m1After, levels, asOfAfter, sessionId);
        }).ms
      );
      fpIsoCur.push(timed(() => detectFirstPresentedFvgs(m1After, asOfAfter, sessionId)).ms);
      const prevFp = st.facts.firstPresentedFvg;
      fpIsoOpt.push(
        timed(() =>
          detectFirstPresentedFvgsIncremental(m1After, asOfAfter, sessionId, {
            dateKey: getEstDateKey(t0),
            sessionId,
            result: prevFp,
          })
        ).ms
      );
    }
  }

  const beforeStructure = median(currentSamples);
  const afterStructure = median(optSamples);
  const beforeReh = median(rehIsoCur);
  const afterReh = median(rehIsoOpt); // includes whole update — also report FP alone
  const beforeFp = median(fpIsoCur);
  const afterFp = median(fpIsoOpt);
  const beforeBar = median(barCurSamples) + median([afterStats.lastEqhMs]);
  const afterBar = median(barOptSamples);

  const allPass = cases.every((c) => c.pass);
  const structureSpeedup = beforeStructure / Math.max(afterStructure, 0.001);
  const barSpeedup = beforeBar / Math.max(afterBar, 0.001);

  const report = `# Karen — structure facts incremental (new-bar)

**When:** ${new Date().toISOString()}  
**Status:** ${allPass ? "IMPLEMENTED — parity PASS" : "IMPLEMENTED — parity FAIL (see diffs; do not ship failing leaves)"}  
**Dataset:** \`nq-aug12-2026-cme\` fixture (idx ${idx} pure 1m, walk ${walkStart}+${walkN})  
**Scope:** Gate/incremental \`buildStructureFacts\` leaves on closed-bar path — REH/REL scope advance + first-presented reuse. EQH force-off untouched. No HTF fullRebuild / tick-engine / DecisionEnvelope / ICT def changes.

---

## FINAL OUTPUT

BEFORE:
- buildStructureFacts (new 1m): ${beforeStructure.toFixed(1)} ms
- applyClosedBar / total new-bar: ${beforeBar.toFixed(1)} ms
- REH/REL full detect: ${beforeReh.toFixed(1)} ms
- first-presented FVG full: ${beforeFp.toFixed(1)} ms

AFTER:
- updateStructureFacts (new 1m): ${afterStructure.toFixed(1)} ms
- applyClosedBar lastBarMs: ${afterBar.toFixed(1)} ms
- engine lastStructureMs: ${afterStats.lastStructureMs.toFixed(1)} ms
- first-presented FVG incremental: ${afterFp.toFixed(1)} ms

SPEEDUP:
- structure facts: ${structureSpeedup.toFixed(2)}×
- total new-bar: ${barSpeedup.toFixed(2)}×

PARITY: ${allPass ? "PASS" : "FAIL"}

REMAINING BOTTLENECK: EQH/EQL on force path (\`lastEqhMs\` ${afterStats.lastEqhMs.toFixed(1)} ms) plus cheap leaves still full-recompute each bar (MSS / 1m FVG lookback 80 / sweeps lookback 40). At 08:02 ET, NY opening / post-FHDR first-presented still scan.

NEXT SINGLE TARGET: HTF \`fullRebuild\` path (explicitly NOT started in this task) — only after this Priority 1 report is accepted.

---

## BEFORE / AFTER / SPEEDUP

| Metric | BEFORE (ms) | AFTER (ms) | SPEEDUP |
|---|---:|---:|---:|
| \`buildStructureFacts\` / \`updateStructureFacts\` (new 1m) | ${beforeStructure.toFixed(1)} | ${afterStructure.toFixed(1)} | ${structureSpeedup.toFixed(2)}× |
| REH/REL (full detect vs incremental update call*) | ${beforeReh.toFixed(1)} | ${afterReh.toFixed(1)} | ${(beforeReh / Math.max(afterReh, 0.001)).toFixed(2)}× |
| first-presented FVG (full vs incremental) | ${beforeFp.toFixed(1)} | ${afterFp.toFixed(1)} | ${(beforeFp / Math.max(afterFp, 0.001)).toFixed(2)}× |
| Total new-bar (structure leaf + EQH est / \`lastBarMs\`) | ${beforeBar.toFixed(1)} | ${afterBar.toFixed(1)} | ${barSpeedup.toFixed(2)}× |

\\* REH “AFTER” column times the full \`updateStructureFacts\` advance (REH scope + FP + cheap leaves), not REH alone — see engine \`lastStructureMs\` ${afterStats.lastStructureMs.toFixed(1)}ms on applyClosedBar.

**Engine applyClosedBar (profile bar):** wall ${barWall.ms.toFixed(1)}ms; \`lastStructureMs\` ${afterStats.lastStructureMs.toFixed(1)}; \`lastEqhMs\` ${afterStats.lastEqhMs.toFixed(1)}.

---

## PARITY RESULT: **${allPass ? "PASS" : "FAIL"}**

| Case | Result | Detail |
|---|---|---|
${cases.map((c) => `| ${c.name} | ${c.pass ? "PASS" : "FAIL"} | ${c.detail}${c.diffs?.length ? ` diffs=${c.diffs.join(",")}` : ""} |`).join("\n")}

Covered: structure facts fingerprint (mss, swings/MSS, REH/REL, FVGs, first-presented, liquidity sweeps/interactions, summary), first/cold bar, repeated bar, new 1m close, multi-bar walk, later session-span bar. EQH/EQL left to existing force-off tests (unchanged). Session boundaries: date/session/CME-key mismatch forces full rescan.

---

## FILES CHANGED

| File | Change |
|---|---|
| \`lib/structure.ts\` | \`updateStructureFacts\`, REH scoped advance, sessionM1 advance, shared assemble |
| \`lib/gap-zones.ts\` | \`refreshFirstPresentedFvg\`, \`detectFirstPresentedFvgsIncremental\` |
| \`lib/incremental-market-engine.ts\` | \`rebuildOneMinuteStructure\` → \`updateStructureFacts\`; seed \`structureInc\` on \`fullRebuild\` |
| \`scripts/test-structure-facts-incremental.ts\` | parity + bench |
| \`data/research/karen-structure-facts-incremental.md\` | this report |

---

## CORRECTNESS RISKS

1. **REH scope advance** must mirror \`mergeBarsByTime(nyPre, sessionBars, last120)\` on +1 / same-length tick. Dropped last-120 bars still in nyPre/session must remain. Mismatch → wrong pools — **parity walk guards this**; on FAIL revert REH advance and keep FP-only.
2. **First-presented reuse** assumes formation identity is stable once found for a date+session; only \`filled\` / \`inverted\` refresh. Session/date change forces full detect.
3. **\`sessionM1\` advance** assumes CME session key stable; key change forces full. Wrong session slice would alter PDH/PDL interaction status.
4. **fullRebuild** still uses \`buildMarketContextAt\` (full facts) and only seeds incremental state — HTF path unchanged.
5. Cheap leaves (MSS, 1m FVG lookback 80, sweeps lookback 40) still recompute every bar — intentional for safety.

**Policy:** If any structural output differs unexpectedly — do not weaken tests; revert the offending leaf.

---

## Raw samples

\`\`\`json
${JSON.stringify(
  {
    currentStructureMs: currentSamples,
    optStructureMs: optSamples,
    rehFullMs: rehIsoCur,
    fpFullMs: fpIsoCur,
    fpOptMs: fpIsoOpt,
    barOptLastBarMs: barOptSamples,
    leafMode: optLeaf.value.mode,
    fpReuse: optLeaf.value.leaf.firstPresented,
  },
  null,
  2
)}
\`\`\`
`;

  const outPath = join(process.cwd(), "data", "research", "karen-structure-facts-incremental.md");
  writeFileSync(outPath, report, "utf8");
  console.log(report);
  console.log("wrote", outPath);
  if (!allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
