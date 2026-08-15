/**
 * Replay TickStream NQ week sample and rank EQH/EQL by contextual importance.
 * Does not download data. Does not change production detectors.
 *
 * Run: npm run research:eqh-eql-importance
 */
import fs from "fs";
import path from "path";
import type { Bar } from "../lib/types";
import { formatEst, getEstDateKey, getEstMinutes } from "../lib/market-data";
import {
  detectEqhEqlLiquidity,
  formatFactorBreakdown,
  type EqhEqlPool,
} from "../lib/research/eqh-eql-liquidity";
import { RESEARCH_DATA_ROOT, RESEARCH_FIXTURES_DIR } from "../lib/research/paths";

const WEEK_DIR = path.join(RESEARCH_FIXTURES_DIR, "nq-week-aug05-aug12-2026-cme");
const OUT = path.join(RESEARCH_DATA_ROOT, "eqh-eql-importance-diagnostic.md");

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

function aggregateMinutes(bars: Bar[], minutes: number): Bar[] {
  const bucket = minutes * 60;
  const map = new Map<number, Bar>();
  for (const b of bars) {
    const ts = Math.floor(b.time.getTime() / 1000);
    const key = Math.floor(ts / bucket) * bucket;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        time: new Date(key * 1000),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      });
    } else {
      existing.high = Math.max(existing.high, b.high);
      existing.low = Math.min(existing.low, b.low);
      existing.close = b.close;
    }
  }
  return [...map.values()].sort((a, b) => a.time.getTime() - b.time.getTime());
}

function fmtTime(sec: number): string {
  return formatEst(new Date(sec * 1000));
}

function poolBlock(p: EqhEqlPool, last: number, tf: string): string {
  const swings = p.swings
    .map((s) => `${s.price.toFixed(2)} @ ${fmtTime(s.barTime)} (prom ${s.prominence.toFixed(2)})`)
    .join("; ");
  const reaction = p.sweepReaction
    ? `${p.sweepReaction.displacement ? "yes" : "no"} — ${p.sweepReaction.reactionNote}`
    : "n/a";
  return [
    `### ${p.liquidityType} ${p.level.toFixed(2)} — ${p.importance} (${tf})`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| PRICE | ${p.level.toFixed(2)} |`,
    `| TYPE | ${p.liquidityType} |`,
    `| IMPORTANCE | ${p.importance} (score ${p.score.toFixed(1)}, confidence ${p.confidence.toFixed(2)}) |`,
    `| WHY IT MATTERS | ${p.why} |`,
    `| CONTRIBUTING SWINGS | ${swings} |`,
    `| STRUCTURAL CONTEXT | ${p.factors.relevantStructure.note} |`,
    `| DISTANCE | ${p.distanceFromPrice.toFixed(2)} pts from last ${last.toFixed(2)} |`,
    `| STATUS | ${p.lifecycle} (${p.status}) |`,
    `| SESSION / TF | ${p.sessionLabel} · ${p.timeframeContext} |`,
    `| FORMATION TIME | ${p.formedAtLabel} (${p.formationTime}) |`,
    `| CONFIRMATION TIME | ${p.confirmationLabel} (${p.confirmationTime}) |`,
    `| SWEEP | ${p.sweptAt != null ? `${p.sweepPrice?.toFixed(2)} at ${fmtTime(p.sweptAt)}` : "unswept"} |`,
    `| SWEEP REACTION | ${reaction} |`,
    ``,
    `Factor breakdown:`,
    ``,
    ...formatFactorBreakdown(p.factors).map((line) => `- ${line}`),
    ``,
  ].join("\n");
}

function counts(pools: EqhEqlPool[]): string {
  const n = (imp: string) => pools.filter((p) => p.importance === imp).length;
  return `HIGH ${n("HIGH")} · MEDIUM ${n("MEDIUM")} · LOW ${n("LOW")} · ACTIVE ${pools.filter((p) => p.lifecycle === "ACTIVE").length} · SWEPT ${pools.filter((p) => p.lifecycle === "SWEPT").length}`;
}

function findNyAmIndex(bars: Bar[]): number {
  for (let i = bars.length - 1; i >= 0; i--) {
    const m = getEstMinutes(bars[i]!.time);
    if (m >= 9 * 60 + 45 && m < 11 * 60) return i;
  }
  return Math.floor(bars.length * 0.55);
}

function noisyHigh(p: EqhEqlPool): boolean {
  return (
    p.importance === "HIGH" &&
    (p.factors.meaningfulVsPa.score < 1 ||
      p.factors.visualClass.score < 1 ||
      /minor local|tiny fluctuations|not an obvious/i.test(p.why))
  );
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

  const live = detectEqhEqlLiquidity(m1, {
    symbol: "NQ",
    currentPrice: lastPx,
    lookback: 1440,
    maxPoolsPerSide: 16,
  });

  const m15 = aggregateMinutes(m1, 15);
  const htf = detectEqhEqlLiquidity(m15, {
    symbol: "NQ",
    currentPrice: m15.at(-1)!.close,
    lookback: 400,
    maxPoolsPerSide: 12,
    wing: 2,
  });

  const midIdx = Math.min(Math.floor(m1.length * 0.55), m1.length - 1);
  const mid = detectEqhEqlLiquidity(m1, {
    symbol: "NQ",
    asOfIndex: midIdx,
    currentPrice: m1[midIdx]!.close,
    lookback: 1440,
    maxPoolsPerSide: 16,
  });

  const nyAmIdx = findNyAmIndex(m1);
  const nyAm = detectEqhEqlLiquidity(m1, {
    symbol: "NQ",
    asOfIndex: nyAmIdx,
    currentPrice: m1[nyAmIdx]!.close,
    lookback: 1440,
    maxPoolsPerSide: 16,
  });

  const rankDisplay = (pools: EqhEqlPool[]) =>
    [...pools].sort((a, b) => {
      const ia = a.importance === "HIGH" ? 3 : a.importance === "MEDIUM" ? 2 : 1;
      const ib = b.importance === "HIGH" ? 3 : b.importance === "MEDIUM" ? 2 : 1;
      if (ib !== ia) return ib - ia;
      const la = a.lifecycle === "ACTIVE" ? 1 : 0;
      const lb = b.lifecycle === "ACTIVE" ? 1 : 0;
      if (lb !== la) return lb - la;
      return b.score - a.score;
    });

  const top1m = rankDisplay(live.pools);
  const topShow = top1m.slice(0, 8);
  const topNy = rankDisplay(nyAm.pools).slice(0, 8);
  const topHtf = rankDisplay(htf.pools).slice(0, 6);

  const allHigh = [...live.pools, ...nyAm.pools, ...mid.pools, ...htf.pools].filter(
    (p) => p.importance === "HIGH"
  );
  const badHigh = allHigh.filter(noisyHigh);
  const highPools = allHigh;

  const weightLines = [
    `- Structural gates (not a weighted score): confirmed swing, meaningful vs PA, genuine return, visual recognition, clear pool vs noise, already swept, relevant structure, actionable at T.`,
    `- Relative equality and visual class are supporting — they do not create the pool.`,
  ].join("\n");

  const leak = (liq: typeof mid, idx: number) =>
    liq.pools.some((p) =>
      p.swings.some((s) => s.confirmationTime > Math.floor(m1[idx]!.time.getTime() / 1000))
    )
      ? "LEAK"
      : "none";

  const md = [
    `# EQH/EQL importance diagnostic`,
    ``,
    `Research only — production \`lib/reh-rel.ts\` / \`lib/structure.ts\` were not modified.`,
    ``,
    `- **Dataset:** \`${path.relative(process.cwd(), WEEK_DIR)}\` (${manifest.source ?? "tickstream"} ${manifest.dataset_id ?? ""})`,
    `- **Bars:** ${m1.length} × 1m, last ${formatEst(last.time)} last=${lastPx.toFixed(2)}`,
    `- **Window:** ${manifest.start_timestamp ?? "?"} → ${manifest.end_timestamp ?? "?"}`,
    `- **Question:** Can Karen distinguish meaningful liquidity from random similar highs/lows?`,
    `- **Not the question:** Did we detect more REH/EQL?`,
    ``,
    `## How importance is classified`,
    ``,
    `Every pool gets LOW / MEDIUM / HIGH from weighted factors. Distance, touch count, and age cannot decide the grade alone. HIGH requires strong swing quality plus equality and (visibility or structure), and cannot be awarded to swept pools.`,
    ``,
    weightLines,
    ``,
    `## 1m replay @ New York AM (${getEstDateKey(m1[nyAmIdx]!.time)} ${formatEst(m1[nyAmIdx]!.time)}, last=${m1[nyAmIdx]!.close.toFixed(2)})`,
    ``,
    `Best window for unswept resting liquidity. ${counts(nyAm.pools)}. PIT leak: **${leak(nyAm, nyAmIdx)}**.`,
    ``,
    ...topNy.map((p) => poolBlock(p, m1[nyAmIdx]!.close, "1m @ NY AM")),
    ``,
    `## 1m replay @ last bar (${formatEst(last.time)})`,
    ``,
    `End of sample — most equal highs/lows in the lookback have already been taken. ${counts(live.pools)}`,
    ``,
    ...topShow.map((p) => poolBlock(p, lastPx, "1m @ last")),
    ``,
    `## 15m higher-timeframe replay`,
    ``,
    `${counts(htf.pools)}`,
    ``,
    ...topHtf.map((p) => poolBlock(p, m15.at(-1)!.close, "15m")),
    ``,
    `## Point-in-time mid-sample`,
    ``,
    `Cutoff bar ${midIdx} (${formatEst(m1[midIdx]!.time)}, last=${m1[midIdx]!.close.toFixed(2)}).`,
    `Pools: ${counts(mid.pools)}. Future bars after this T are not used. Confirmation timestamps after cutoff: **${leak(mid, midIdx)}**.`,
    ``,
    ...rankDisplay(mid.pools)
      .filter((p) => p.importance === "HIGH" || p.lifecycle === "ACTIVE")
      .slice(0, 4)
      .map((p) => poolBlock(p, m1[midIdx]!.close, "1m @ mid T")),
    ``,
    `## Noise check`,
    ``,
    `- HIGH pools across NY AM / last / mid / 15m: ${highPools.length}`,
    `- HIGH pools that look like noise (weak swings / noisy why): **${badHigh.length}**`,
    badHigh.length
      ? badHigh.map((p) => `  - ${p.liquidityType} ${p.level.toFixed(2)}: ${p.why}`).join("\n")
      : `- All HIGH pools have explainable swing quality and a human-readable why.`,
    ``,
    `## Verdict`,
    ``,
    badHigh.length === 0 && highPools.length > 0
      ? `HIGH pools are explainable. Ranking is not "more equals"; it is "why this liquidity matters." Swept history stays marked SWEPT instead of being deleted.`
      : highPools.length === 0
        ? `No HIGH pools in these cutoffs — classifier is conservative. MEDIUM pools should still explain themselves.`
        : `Tighten gates: ${badHigh.length} HIGH pool(s) failed the noise check.`,
    ``,
    `Last-bar as-of index ${lastIdx}; NY AM as-of index ${nyAmIdx}.`,
    ``,
  ].join("\n");

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md, "utf8");
  console.log(`wrote ${OUT}`);
  console.log(`1m last ${counts(live.pools)}`);
  console.log(`1m NY AM ${counts(nyAm.pools)}`);
  console.log(`15m ${counts(htf.pools)}`);
  console.log(`HIGH ${highPools.length} noisy HIGH: ${badHigh.length}`);
}

main();
