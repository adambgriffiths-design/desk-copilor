/**
 * Replay TickStream NQ week sample as liquidity AREAS (not equality-as-signal).
 * Does not download data. Does not change production detectors.
 *
 * Run: npm run research:eqh-eql-areas
 */
import fs from "fs";
import path from "path";
import type { Bar } from "../lib/types";
import { formatEst, getEstDateKey, getEstMinutes } from "../lib/market-data";
import {
  detectEqhEqlLiquidity,
  type EqhEqlPool,
  type RejectedEqhEql,
} from "../lib/research/eqh-eql-liquidity";
import { RESEARCH_DATA_ROOT, RESEARCH_FIXTURES_DIR } from "../lib/research/paths";

const WEEK_DIR = path.join(RESEARCH_FIXTURES_DIR, "nq-week-aug05-aug12-2026-cme");
const OUT = path.join(RESEARCH_DATA_ROOT, "eqh-eql-liquidity-areas-diagnostic.md");

function loadBars(file: string): Bar[] {
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  return raw.map((b) => ({
    time: new Date(b.timestamp * 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

function fmtTime(sec: number): string {
  return formatEst(new Date(sec * 1000));
}

function findNyAmIndex(bars: Bar[]): number {
  for (let i = bars.length - 1; i >= 0; i--) {
    const m = getEstMinutes(bars[i]!.time);
    if (m >= 9 * 60 + 45 && m < 11 * 60) return i;
  }
  return Math.floor(bars.length * 0.55);
}

function rankAreas(pools: EqhEqlPool[], side: "eqh" | "eql"): EqhEqlPool[] {
  return pools
    .filter((p) => p.kind === side)
    .sort((a, b) => {
      const ia = a.importance === "HIGH" ? 3 : a.importance === "MEDIUM" ? 2 : 1;
      const ib = b.importance === "HIGH" ? 3 : b.importance === "MEDIUM" ? 2 : 1;
      if (ib !== ia) return ib - ia;
      const la = a.lifecycle === "ACTIVE" ? 1 : 0;
      const lb = b.lifecycle === "ACTIVE" ? 1 : 0;
      if (lb !== la) return lb - la;
      if (b.structuralPriority !== a.structuralPriority) return b.structuralPriority - a.structuralPriority;
      return a.formationTime - b.formationTime;
    });
}

function areaBlock(p: EqhEqlPool, last: number): string {
  const swings = p.swings
    .map((s) => `${s.price.toFixed(2)} @ ${fmtTime(s.barTime)} (prom ${s.prominence.toFixed(2)})`)
    .join("; ");
  const gates = [
    "confirmedSwing",
    "meaningfulVsPa",
    "genuineReturn",
    "visualRecognition",
    "clearPoolVsNoise",
    "alreadySwept",
    "relevantStructure",
    "actionableAtT",
    "relativeEquality",
    "visualClass",
  ] as const;
  const gateLines = gates.map((k) => {
    const f = p.factors[k];
    return `- ${k}: ${f.score ? "PASS" : "FAIL"} — ${f.note}`;
  });
  return [
    `### ${p.liquidityArea.type} ${p.liquidityArea.priceLow.toFixed(2)}–${p.liquidityArea.priceHigh.toFixed(2)} (${p.importance})`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| TYPE | ${p.liquidityArea.type} |`,
    `| FORMATION | ${p.formedAtLabel} (${p.formationTime}) |`,
    `| PRICE AREA | ${p.liquidityArea.priceLow.toFixed(2)} – ${p.liquidityArea.priceHigh.toFixed(2)} (rep ${p.liquidityArea.representativeLevel.toFixed(2)}) |`,
    `| CONTRIBUTING SWINGS | ${swings} |`,
    `| WHY MEANINGFUL | ${p.why} |`,
    `| WHY THIS vs NEARBY | ${p.whyNotNearby || "n/a"} |`,
    `| STRUCTURAL CONTEXT | ${p.structuralContext} |`,
    `| STATUS | ${p.lifecycle} (${p.status}) |`,
    `| CONFIDENCE | ${p.importance} (class ${p.visualClass}, ${p.confidence.toFixed(2)}) |`,
    `| SESSION / TF | ${p.sessionLabel} · ${p.timeframeContext} |`,
    `| LAST vs AREA | last=${last.toFixed(2)} (${p.factors.actionableAtT.note}) |`,
    `| SWEEP | ${p.sweptAt != null ? `${p.sweepPrice?.toFixed(2)} at ${fmtTime(p.sweptAt)}${p.sweepRange ? ` range ${p.sweepRange.low.toFixed(2)}–${p.sweepRange.high.toFixed(2)}` : ""}` : "unswept"} |`,
    ``,
    `Gates:`,
    ``,
    ...gateLines,
    ``,
  ].join("\n");
}

function rejectedBlock(r: RejectedEqhEql, i: number): string {
  const swings = r.swings
    .map((s) => `${s.price.toFixed(2)} @ ${fmtTime(s.barTime)} (prom ${s.prominence.toFixed(2)})`)
    .join("; ");
  return [
    `### Rejected ${i + 1}: ${r.kind.toUpperCase()} ${r.prices.map((p) => p.toFixed(2)).join(" / ")} (class ${r.visualClass})`,
    ``,
    `- **WHY:** ${r.why}`,
    `- **Failed tests:** ${r.failedTests.join(", ") || "n/a"}`,
    `- **Contributing swings:** ${swings}`,
    ``,
  ].join("\n");
}

function leakCheck(liq: { pools: EqhEqlPool[] }, cutoffSec: number): string {
  return liq.pools.some((p) => p.swings.some((s) => s.confirmationTime > cutoffSec))
    ? "LEAK"
    : "none";
}

function main(): void {
  const candlesPath = path.join(WEEK_DIR, "candles.json");
  const manifestPath = path.join(WEEK_DIR, "manifest.json");
  if (!fs.existsSync(candlesPath)) {
    throw new Error(`Week sample missing: ${candlesPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    dataset_id?: string;
    source?: string;
    start_timestamp?: number;
    end_timestamp?: number;
  };
  const m1 = loadBars(candlesPath);
  const last = m1.at(-1)!;
  const lastPx = last.close;
  const lastIdx = m1.length - 1;
  const nyAmIdx = findNyAmIndex(m1);
  const midIdx = Math.min(Math.floor(m1.length * 0.55), m1.length - 1);

  const cfg = {
    symbol: "NQ" as const,
    lookback: 4000,
    maxPoolsPerSide: 24,
    maxRejected: 50,
  };

  const live = detectEqhEqlLiquidity(m1, {
    ...cfg,
    currentPrice: lastPx,
  });
  const nyAm = detectEqhEqlLiquidity(m1, {
    ...cfg,
    asOfIndex: nyAmIdx,
    currentPrice: m1[nyAmIdx]!.close,
  });
  const mid = detectEqhEqlLiquidity(m1, {
    ...cfg,
    asOfIndex: midIdx,
    currentPrice: m1[midIdx]!.close,
  });

  const buy = rankAreas(live.pools, "eqh").slice(0, 10);
  const sell = rankAreas(live.pools, "eql").slice(0, 10);
  const rejected = live.rejected.slice(0, 20);
  const high = live.pools.filter((p) => p.importance === "HIGH");
  const noisyHigh = high.filter(
    (p) =>
      p.visualClass !== "A" ||
      p.factors.meaningfulVsPa.score < 1 ||
      p.factors.genuineReturn.score < 1 ||
      /minor internal|isolated swing/i.test(p.why)
  );

  const nyCutoff = Math.floor(m1[nyAmIdx]!.time.getTime() / 1000);
  const midCutoff = Math.floor(m1[midIdx]!.time.getTime() / 1000);

  const acceptedExample = buy[0] ?? sell[0];
  const rejectedExample = rejected[0];

  const md = [
    `# EQH/EQL liquidity areas diagnostic`,
    ``,
    `Research only — production \`lib/reh-rel.ts\` / \`lib/structure.ts\` were not modified.`,
    ``,
    `- **Dataset:** \`${path.relative(process.cwd(), WEEK_DIR)}\` (${manifest.source ?? "tickstream"} ${manifest.dataset_id ?? ""})`,
    `- **Bars:** ${m1.length} × 1m, last ${formatEst(last.time)} last=${lastPx.toFixed(2)}`,
    `- **Window:** ${manifest.start_timestamp ?? "?"} → ${manifest.end_timestamp ?? "?"}`,
    `- **Question:** Would a trader looking at structure available at T call this obvious resting liquidity?`,
    `- **Not the question:** Did we detect more REH/EQL?`,
    ``,
    `## How liquidity-first works`,
    ``,
    `REH/EQL are **evidence** for a liquidity pool. Two similar prints are not automatically liquidity.`,
    ``,
    `1. Confirmed 5-bar swings only (right wing closed at T).`,
    `2. Meaningful vs surrounding PA (prominence vs ATR) — tiny internals are rejected.`,
    `3. Second swing must genuinely return after leaving the area.`,
    `4. A trader would visually recognize one horizontal.`,
    `5. Clear pool vs random noise (visual class A).`,
    `6. If already swept: keep the area, mark SWEPT, keep contributing swings — do not retro-delete.`,
    `7. Part of current relevant structure (dealing range / BOS-MSS / lookback extreme / held displacement).`,
    `8. Still actionable/relevant at T.`,
    ``,
    `Relative equality is **one supporting component** of "same visible shelf" (vol/structure justified).`,
    `18500 vs 18500.75 can be one area if both swings are obvious. 18500 vs 18501 does not auto-qualify because the number is small.`,
    `Nearby prints (18500 / 18500.50 / 18500.75) collapse to **one** buy-side or sell-side area; underlying swings are kept.`,
    `Visual class: **A** obvious repeated highs/lows (normally the only HIGH). **B** minor internals, **C** isolated, **D** overlapping structure — rejected, not scored into HIGH.`,
    `There is **no weighted mystery score**. HIGH/MEDIUM/LOW is the gate outcome. The numeric \`score\` field is only a 90/60/30 rank token from that label.`,
    ``,
    `## Snapshot counts (1m @ last bar)`,
    ``,
    `- Accepted areas: ${live.areas.length} (BUY_SIDE ${live.eqh.length}, SELL_SIDE ${live.eql.length})`,
    `- HIGH ${high.length} · MEDIUM ${live.pools.filter((p) => p.importance === "MEDIUM").length} · LOW ${live.pools.filter((p) => p.importance === "LOW").length}`,
    `- ACTIVE ${live.pools.filter((p) => p.lifecycle === "ACTIVE").length} · SWEPT ${live.pools.filter((p) => p.lifecycle === "SWEPT").length}`,
    `- Rejected similar pairs: ${live.rejected.length}`,
    `- NY AM PIT leak: **${leakCheck(nyAm, nyCutoff)}** · mid-sample PIT leak: **${leakCheck(mid, midCutoff)}**`,
    ``,
    `## TOP 10 BUY-SIDE LIQUIDITY AREAS`,
    ``,
    buy.length ? buy.map((p) => areaBlock(p, lastPx)).join("\n") : "_None._",
    ``,
    `## TOP 10 SELL-SIDE LIQUIDITY AREAS`,
    ``,
    sell.length ? sell.map((p) => areaBlock(p, lastPx)).join("\n") : "_None._",
    ``,
    `## Rejected REH/EQL (the proof)`,
    ``,
    `These looked like equal highs/lows (similar prices) and failed the structural test. That is the point of liquidity-first.`,
    ``,
    rejected.length ? rejected.map((r, i) => rejectedBlock(r, i)).join("\n") : "_No rejected similar pairs in this window._",
    ``,
    `## Accepted vs rejected example`,
    ``,
    acceptedExample
      ? `- **Accepted:** ${acceptedExample.liquidityArea.type} ${acceptedExample.liquidityArea.priceLow.toFixed(2)}–${acceptedExample.liquidityArea.priceHigh.toFixed(2)} — ${acceptedExample.why}`
      : "- No accepted area in the last-bar window.",
    rejectedExample
      ? `- **Rejected:** ${rejectedExample.kind.toUpperCase()} ${rejectedExample.prices.map((p) => p.toFixed(2)).join("/")} — ${rejectedExample.why}`
      : "- No rejection in the last-bar window.",
    acceptedExample?.whyNotNearby ? `- **Contrast:** ${acceptedExample.whyNotNearby}` : "",
    ``,
    `## NY AM cutoff (${getEstDateKey(m1[nyAmIdx]!.time)} ${formatEst(m1[nyAmIdx]!.time)}, last=${m1[nyAmIdx]!.close.toFixed(2)})`,
    ``,
    `Areas ${nyAm.areas.length} · HIGH ${nyAm.pools.filter((p) => p.importance === "HIGH").length} · rejected ${nyAm.rejected.length}. Future bars after this T are not used.`,
    ``,
    ...rankAreas(nyAm.pools, "eqh")
      .concat(rankAreas(nyAm.pools, "eql"))
      .filter((p) => p.importance === "HIGH" || p.lifecycle === "ACTIVE")
      .slice(0, 6)
      .map((p) => areaBlock(p, m1[nyAmIdx]!.close)),
    ``,
    `## Noise check`,
    ``,
    `- HIGH areas at last bar: ${high.length}`,
    `- HIGH that fail visual/meaning gates: **${noisyHigh.length}**`,
    noisyHigh.length
      ? noisyHigh.map((p) => `  - ${p.liquidityArea.type} ${p.level.toFixed(2)}: ${p.why}`).join("\n")
      : `- All HIGH areas are class A with explainable gates.`,
    `- Rejected set exists: **${live.rejected.length > 0 ? "yes" : "NO — classifier may be too loose or too tight"}**`,
    ``,
    `## Remaining gaps`,
    ``,
    `- HTF context is inferred from swing span / session mix on 1m, not a separate 15m/1h structure engine.`,
    `- Visual class D (overlapping PD arrays / session highs) is conservative; some messy-but-real shelves may be rejected.`,
    `- Overlay still draws one representative line per area (backward compatible). The area band is on the research payload.`,
    ``,
    `Last-bar as-of index ${lastIdx}; NY AM as-of index ${nyAmIdx}.`,
    ``,
  ]
    .filter((line) => line !== "")
    .join("\n");

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md, "utf8");
  console.log(`wrote ${OUT}`);
  console.log(`areas ${live.areas.length} buy ${live.eqh.length} sell ${live.eql.length} rejected ${live.rejected.length}`);
  console.log(`HIGH ${high.length} noisy HIGH ${noisyHigh.length}`);
}

main();
