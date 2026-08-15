/**
 * ICT EQH/EQL liquidity tracker — run: npm run test:eqh-eql-liquidity
 */
import fs from "fs";
import path from "path";
import type { Bar } from "../lib/types";
import { detectRelativeEqualPools } from "../lib/structure";
import {
  detectEqhEqlLiquidity,
  eqhEqlInstrumentTickSize,
  eqhEqlTolerance,
  mergeNearbySwings,
  roundToTick,
  toEqhEqlTrackRows,
  toRelativeEqualPools,
  type EqhEqlConfig,
} from "../lib/research/eqh-eql-liquidity";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const TICK = 0.25;
const BASE = 1_700_000_000;

function bar(t: number, o: number, h: number, l: number, c: number): Bar {
  return { time: new Date(t * 1000), open: o, high: h, low: l, close: c };
}

/** Quiet 5-bar pivot high (wing=2) ending at peak time + 120s. */
function swingHighAt(peak: number, tPeak: number, pullback = 8): Bar[] {
  const p = peak;
  const pb = pullback;
  return [
    bar(tPeak - 120, p - pb + 1, p - 3, p - pb, p - 4),
    bar(tPeak - 60, p - 4, p - 2, p - pb + 1, p - 3),
    bar(tPeak, p - 3, p, p - pb + 2, p - 2),
    bar(tPeak + 60, p - 2, p - 2, p - pb + 1, p - 4),
    bar(tPeak + 120, p - 4, p - 3, p - pb, p - 5),
  ];
}

function swingLowAt(trough: number, tPeak: number, bounce = 8): Bar[] {
  const p = trough;
  const b = bounce;
  return [
    bar(tPeak - 120, p + b - 1, p + b, p + 3, p + 4),
    bar(tPeak - 60, p + 4, p + b - 1, p + 2, p + 3),
    bar(tPeak, p + 3, p + b - 2, p, p + 2),
    bar(tPeak + 60, p + 2, p + b - 1, p + 2, p + 4),
    bar(tPeak + 120, p + 4, p + b, p + 3, p + 5),
  ];
}

function valleyBars(fromT: number, n: number, mid: number, depth: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const t = fromT + i * 60;
    out.push(bar(t, mid, mid + 1, mid - depth, mid - 0.5));
  }
  return out;
}

function ridgeBars(fromT: number, n: number, mid: number, height: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const t = fromT + i * 60;
    out.push(bar(t, mid, mid + height, mid - 1, mid + 0.5));
  }
  return out;
}

const DETECT: EqhEqlConfig = {
  symbol: "MNQ=F",
  atrOverride: 8,
  currentPrice: 20990,
};

function detect(bars: Bar[], extra: EqhEqlConfig = {}) {
  return detectEqhEqlLiquidity(bars, { ...DETECT, ...extra });
}

function flatBars(fromT: number, n: number, mid: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const t = fromT + i * 60;
    out.push(bar(t, mid, mid + 0.5, mid - 0.5, mid));
  }
  return out;
}

function padAfter(bars: Bar[], n: number, price: number): Bar[] {
  const last = bars.at(-1)!;
  const t0 = unix(last) + 60;
  const out = [...bars];
  for (let i = 0; i < n; i++) {
    out.push(bar(t0 + i * 60, price, price + 0.5, price - 0.5, price));
  }
  return out;
}

function unix(b: Bar): number {
  return Math.floor(b.time.getTime() / 1000);
}

function twoHighs(h1: number, h2: number, t0 = BASE): Bar[] {
  const a = swingHighAt(h1, t0);
  const gap = valleyBars(t0 + 180, 6, Math.min(h1, h2) - 4, 10);
  const b = swingHighAt(h2, t0 + 180 + 6 * 60 + 120);
  return [...a, ...gap, ...b];
}

function twoLows(l1: number, l2: number, t0 = BASE + 50_000): Bar[] {
  const a = swingLowAt(l1, t0);
  const gap = ridgeBars(t0 + 180, 6, Math.max(l1, l2) + 4, 10);
  const b = swingLowAt(l2, t0 + 180 + 6 * 60 + 120);
  return [...a, ...gap, ...b];
}

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ok  ${name}`);
}

// --- 0. instrument / tolerance ---
{
  assert(eqhEqlInstrumentTickSize("MNQ=F") === 0.25, "MNQ tick 0.25");
  assert(eqhEqlInstrumentTickSize("NQ1!") === 0.25, "NQ tick 0.25");
  assert(eqhEqlInstrumentTickSize("NQ") === 0.25, "NQ root tick 0.25");
  const quiet = eqhEqlTolerance({ atr: 1, tickSize: TICK });
  const loud = eqhEqlTolerance({ atr: 20, tickSize: TICK });
  assert(quiet === 0.5, `quiet tol 0.50 got ${quiet}`);
  assert(loud === 2, `volatile tol caps at 2.00 got ${loud}`);
  assert(roundToTick(21000.07, TICK) === 21000, "sub-tick snaps down");
  assert(roundToTick(21000.18, TICK) === 21000.25, "sub-tick snaps to nearest tick");
  ok("0 instrument tick + ATR-clamped tolerance");
}

// --- 1. exact equal highs ---
{
  const bars = twoHighs(21000, 21000);
  const r = detect(bars);
  assert(r.status === "known", "status known");
  assert(r.eqh.length === 1, `exact EQH count ${r.eqh.length}`);
  assert(r.eqh[0]!.level === 21000, "EQH level is the high");
  assert(r.eqh[0]!.swings.length === 2, "two contributing highs");
  assert(r.eqh[0]!.tickDifference === 0, "zero tick spread");
  assert(r.eqh[0]!.status === "active", "untouched stays active");
  ok("1 exact equal highs");
}

// --- 2. slightly different highs within tolerance ---
{
  const bars = twoHighs(21000, 20999.25);
  const r = detect(bars);
  assert(r.eqh.length === 1, "relative EQH (0.75 pt / 3 ticks)");
  assert(r.eqh[0]!.level === 21000, "liquidity at max high, not the lower right");
  assert(r.eqh[0]!.tickDifference === 3, "3 tick spread");
  assert(
    r.eqh[0]!.why.includes("priming") || r.eqh[0]!.whyDetection.includes("priming"),
    "WHY notes ICT priming (left higher)"
  );
  assert(r.eqh[0]!.importance != null, "importance classified");
  assert(r.eqh[0]!.factors.relativeEquality.note.length > 0, "relative equality explained as supporting");
  ok("2 slightly different highs within tolerance");
}

// --- 3. highs outside tolerance ---
{
  const bars = twoHighs(21000, 20997);
  const r = detect(bars);
  assert(r.eqh.length === 0, "3 pt gap is not relative-equal at 4-tick band");
  ok("3 highs outside tolerance");
}

// --- 4. exact equal lows ---
{
  const bars = twoLows(20970, 20970);
  const r = detect(bars, { currentPrice: 20990 });
  assert(r.eql.length === 1, `exact EQL count ${r.eql.length}`);
  assert(r.eql[0]!.level === 20970, "EQL level is the low");
  assert(r.eql[0]!.tickDifference === 0, "zero tick spread");
  ok("4 exact equal lows");
}

// --- 5. slightly different lows ---
{
  const bars = twoLows(20970, 20970.75);
  const r = detect(bars, { currentPrice: 20990 });
  assert(r.eql.length === 1, "relative EQL (right slightly higher)");
  assert(r.eql[0]!.level === 20970, "liquidity at min low");
  assert(
    r.eql[0]!.why.includes("failure swing") || r.eql[0]!.whyDetection.includes("failure swing"),
    "WHY notes ICT failure swing"
  );
  ok("5 slightly different lows");
}

// --- 6. multiple swings → one cluster ---
{
  const h1 = swingHighAt(21000, BASE);
  const g1 = valleyBars(BASE + 180, 5, 20992, 10);
  const h2 = swingHighAt(21000.25, BASE + 180 + 5 * 60 + 120);
  const t2 = BASE + 180 + 5 * 60 + 120;
  const g2 = valleyBars(t2 + 180, 5, 20992, 10);
  const h3 = swingHighAt(20999.75, t2 + 180 + 5 * 60 + 120);
  const r = detect([...h1, ...g1, ...h2, ...g2, ...h3]);
  assert(r.eqh.length === 1, `one cluster not three pools (got ${r.eqh.length})`);
  assert(r.eqh[0]!.swings.length === 3, `three contributing swings (got ${r.eqh[0]!.swings.length})`);
  assert(r.eqh[0]!.level === 21000.25, "cluster level is max high");
  ok("6 multiple swings forming one liquidity cluster");
}

// --- 7. separate nearby pools ---
{
  const pairA = twoHighs(21000, 21000.25, BASE);
  const lastA = unix(pairA.at(-1)!);
  const mid = valleyBars(lastA + 60, 8, 20970, 12);
  const pairB = twoHighs(21008, 21008.25, lastA + 60 + 8 * 60 + 120);
  const r = detect([...pairA, ...mid, ...pairB], { currentPrice: 20990 });
  assert(r.eqh.length === 2, `two separate EQH pools (got ${r.eqh.length})`);
  const levels = r.eqh.map((p) => p.level).sort((a, b) => a - b);
  assert(levels[0] === 21000.25 && levels[1] === 21008.25, `levels ${levels}`);
  ok("7 separate nearby liquidity pools");
}

// --- 8. unconfirmed swing must not create EQH ---
{
  const first = swingHighAt(21000, BASE);
  const gap = valleyBars(BASE + 180, 6, 20990, 10);
  const t2 = BASE + 180 + 6 * 60 + 120;
  const left = swingHighAt(21000, t2).slice(0, 3);
  const early = [...first, ...gap, ...left];
  const r = detect(early);
  assert(r.eqh.length === 0, "second high not confirmed — no EQH");
  assert(
    r.pendingSwings.some((s) => s.type === "high" && s.price === 21000),
    "pending high recorded, not treated as liquidity"
  );
  const full = [...first, ...gap, ...swingHighAt(21000, t2)];
  const later = detect(full);
  assert(later.eqh.length === 1, "EQH appears only after confirmation delay");
  ok("8 unconfirmed swing must not create EQH/EQL");
}

// --- 9. EQH sweep ---
{
  const formed = twoHighs(21000, 21000);
  const t = unix(formed.at(-1)!) + 60;
  const sweep = bar(t, 20995, 21000.75, 20994, 20998);
  const r = detect([...formed, sweep]);
  assert(r.eqh.length === 1, "pool preserved after sweep");
  assert(r.eqh[0]!.status === "swept", `status ${r.eqh[0]!.status}`);
  assert(r.eqh[0]!.level === 21000, "level not moved to sweep price");
  assert(r.eqh[0]!.sweepPrice === 21000.75, "sweep price recorded");
  assert(r.eqh[0]!.sweptAt != null, "sweep time recorded");
  ok("9 EQH sweep");
}

// --- 10. EQL sweep ---
{
  const formed = twoLows(20970, 20970);
  const t = unix(formed.at(-1)!) + 60;
  const sweep = bar(t, 20975, 20976, 20969.25, 20972);
  const r = detect([...formed, sweep], { currentPrice: 20980 });
  assert(r.eql[0]!.status === "swept", `status ${r.eql[0]?.status}`);
  assert(r.eql[0]!.level === 20970, "EQL level frozen");
  assert(r.eql[0]!.sweepPrice === 20969.25, "sweep price is the wick, not the level");
  ok("10 EQL sweep");
}

// --- 11. touch without sweep ---
{
  const formed = twoHighs(21000, 21000);
  const t = unix(formed.at(-1)!) + 60;
  const touch = bar(t, 20996, 21000, 20995, 20997);
  const r = detect([...formed, touch]);
  assert(r.eqh[0]!.status === "touched", `status ${r.eqh[0]!.status}`);
  assert(r.eqh[0]!.sweptAt == null, "touch is not a sweep");
  assert(r.eqh[0]!.level === 21000, "level unchanged");
  ok("11 touch without sweep");
}

// --- 12. close through liquidity ---
{
  const formed = twoHighs(21000, 21000);
  const t = unix(formed.at(-1)!) + 60;
  const closeThru = bar(t, 20998, 21002, 20997, 21001);
  const r = detect([...formed, closeThru]);
  assert(r.eqh[0]!.status === "closed_through", `status ${r.eqh[0]!.status}`);
  assert(r.eqh[0]!.closedThroughAt != null, "close-through time recorded");
  assert(r.eqh[0]!.level === 21000, "level not moved to close");
  ok("12 close through liquidity");
}

// --- 13. invalidation (left untaken, price abandoned the pool) ---
{
  const formed = twoHighs(21000, 21000);
  const dumped = padAfter(formed, 4, 20960);
  dumped[dumped.length - 1] = {
    ...dumped[dumped.length - 1]!,
    close: 20960,
    high: 20962,
    low: 20958,
  };
  const r = detect(dumped, { atrOverride: 8, invalidationAtrMult: 2.5 });
  assert(r.eqh.length === 1, "invalidated pool still tracked");
  assert(r.eqh[0]!.status === "invalidated", `status ${r.eqh[0]!.status}`);
  assert(r.eqh[0]!.level === 21000, "original level preserved");
  ok("13 invalidation");
}

// --- 14. historical replay with no future leakage ---
{
  const first = swingHighAt(21000, BASE);
  const gap = valleyBars(BASE + 180, 6, 20990, 10);
  const t2 = BASE + 180 + 6 * 60 + 120;
  const second = swingHighAt(21000, t2);
  const full = [...first, ...gap, ...second];
  const confirmDelay = 2;
  const secondPeakIndex = full.length - 3;
  const beforeConfirm = secondPeakIndex + 1;
  const early = detect(full, { asOfIndex: beforeConfirm });
  assert(early.eqh.length === 0, "at T before second confirmation, no EQH");
  assert(
    !early.pools.some((p) => p.swings.some((s) => s.barIndex >= secondPeakIndex && s.confirmationDelayBars === 0)),
    "no zero-delay confirmation from the future"
  );
  const atConfirm = detect(full, { asOfIndex: secondPeakIndex + confirmDelay });
  assert(atConfirm.eqh.length === 1, "EQH exists once right-wing bar has closed");
  const leakPrice = 21111;
  const future = [...full, bar(unix(full.at(-1)!) + 60, leakPrice, leakPrice, leakPrice - 1, leakPrice)];
  const atFullMinus1 = detect(future, { asOfIndex: full.length - 1 });
  assert(
    !atFullMinus1.eqh.some((p) => p.swings.some((s) => s.price === leakPrice)),
    "future bar after T is invisible"
  );
  ok("14 historical replay with no future leakage");
}

// --- 15. changing volatility / tolerance ---
{
  const bars = twoHighs(21000, 20999);
  const quiet = detect(bars, { atrOverride: 1 });
  const loud = detect(bars, { atrOverride: 20 });
  assert(quiet.tolerance === 0.5, `quiet tol ${quiet.tolerance}`);
  assert(loud.tolerance === 2, `loud tol ${loud.tolerance}`);
  assert(quiet.eqh.length === 0, "1.00 pt gap rejected on quiet tape");
  assert(loud.eqh.length === 1, "same 1.00 pt gap accepted when ATR widens band");
  ok("15 changing volatility/tolerance behaviour");
}

// --- 16. NQ tick-size handling ---
{
  const bars = twoHighs(21000.07, 21000.18);
  const r = detect(bars, { symbol: "NQ1!", tickSize: 0.25 });
  assert(r.tickSize === 0.25, "NQ tick size 0.25");
  const snapped = r.eqh[0]?.swings.map((s) => s.price) ?? [];
  assert(
    snapped.every((p) => Math.abs(p / TICK - Math.round(p / TICK)) < 1e-9),
    `swings on tick grid ${snapped}`
  );
  assert(r.eqh.length === 1, "sub-tick noise still forms one EQH after snap");
  assert(r.eqh[0]!.tickDifference <= 1, "spread is 0 or 1 tick after snap");
  ok("16 NQ tick-size handling");
}

// Overlay mapping + panel rows
{
  const bars = twoHighs(21000, 20999.75);
  const r = detect(bars);
  const mapped = toRelativeEqualPools(r.pools);
  assert(mapped.length === 1 && mapped[0]!.type === "reh", "maps to reh for overlay");
  const rows = toEqhEqlTrackRows(r);
  assert(rows[0]!.label === "Relative Equal Highs", "panel label is full ICT name");
  assert(rows[0]!.whyDetection.includes("Relative equality"), "detection WHY explains relative equality as supporting");
  assert(["LOW", "MEDIUM", "HIGH"].includes(rows[0]!.importance), "row has importance");
  assert(mapped[0]!.importance === r.eqh[0]!.importance, "overlay carries importance");
  assert(typeof rows[0]!.why === "string" && rows[0]!.why.includes(rows[0]!.importance), "row WHY starts from importance");
  ok("mapping to overlay + Levels rows");
}

// --- ordinary candle bottoms are not REL ---
{
  const collapsed = mergeNearbySwings(
    [
      { barIndex: 10, price: 20970, type: "low" as const },
      { barIndex: 13, price: 20970, type: "low" as const },
      { barIndex: 16, price: 20970.25, type: "low" as const },
      { barIndex: 30, price: 20970, type: "low" as const },
    ],
    8
  );
  assert(collapsed.length === 2, `nearby wicks merge to distinct swings (got ${collapsed.length})`);
  assert(collapsed[0]!.barIndex === 10 && collapsed[1]!.barIndex === 30, "kept extremes 8+ bars apart");

  const low = 20970;
  const grind: Bar[] = [];
  let t = BASE;
  for (let i = 0; i < 24; i++) {
    grind.push(bar(t, low + 1, low + 2, low, low + 0.75));
    t += 60;
  }
  const r = detect(grind, { currentPrice: 20980 });
  assert(r.eql.length === 0, `non-swing candle bottoms must not form REL (got ${r.eql.length})`);
  const mapped = toRelativeEqualPools(r.pools);
  assert(mapped.every((p) => p.type !== "rel"), "overlay emits no REL from bar bottoms");
  ok("ordinary candle lows are not REL");
}

// --- two confirmed swing lows with structure between them ARE a REL ---
{
  const bars = twoLows(20970, 20970);
  const r = detect(bars, { currentPrice: 20990 });
  assert(r.eql.length === 1, "distinct swing lows with a rally between them form EQL");
  const gap =
    r.eql[0]!.swings[1]!.barIndex - r.eql[0]!.swings[0]!.barIndex;
  assert(gap >= 8, `swing points are separated (${gap} bars), not adjacent wicks`);
  assert(r.eql[0]!.swings.every((s) => s.confirmationDelayBars >= 2), "each leg is a confirmed swing");
  ok("REL from confirmed swing lows, not raw wicks");
}

// --- 3–4 bar local fractals collapse; overlay never uses adjacent wicks ---
{
  const low = 20970;
  const bounce = 8;
  const close: Bar[] = [];
  let t = BASE;
  for (let d = 0; d < 8; d++) {
    close.push(bar(t, low + bounce - 1, low + bounce, low + 3, low + 4));
    t += 60;
    close.push(bar(t, low + 4, low + bounce - 1, low + 2, low + 3));
    t += 60;
    close.push(bar(t, low + 3, low + bounce - 2, low, low + 2));
    t += 60;
    close.push(bar(t, low + 2, low + bounce - 1, low + 2, low + 4));
    t += 60;
  }
  const r = detect(close, { currentPrice: 20980 });
  for (const p of r.eql) {
    const ordered = [...p.swings].sort((a, b) => a.barIndex - b.barIndex);
    for (let i = 1; i < ordered.length; i++) {
      const gap = ordered[i]!.barIndex - ordered[i - 1]!.barIndex;
      assert(gap >= 8, `pool members ${gap} bars apart — adjacent wicks are not swings`);
    }
  }
  const mapped = toRelativeEqualPools(r.pools);
  for (const p of mapped) {
    assert((p.barCount ?? 0) >= 2, "overlay REL still requires two swing points");
  }
  ok("close local fractals are merged, not drawn as bar-bottom REL");
}

// --- far EQL stays tracked (not proximity-filtered) ---
{
  const formed = twoLows(20920, 20920);
  const later = padAfter(formed, 4, 20990);
  const r = detect(later, { currentPrice: 20990, atrOverride: 8 });
  assert(r.eql.length === 1, `far EQL still detected (got ${r.eql.length})`);
  assert(r.eql[0]!.level === 20920, "level is the distant equal low");
  assert(r.eql[0]!.status === "active", `far EQL stays active, got ${r.eql[0]!.status}`);
  const mapped = toRelativeEqualPools(r.pools);
  assert(
    mapped.some((p) => p.type === "rel" && p.price === 20920),
    "overlay still draws the far REL"
  );
  ok("far EQL tracked, not only near last");
}

// --- ranking prefers earlier/stronger EQL over a nearer pair ---
{
  const far = twoLows(20920, 20920.25, BASE);
  const lastFar = unix(far.at(-1)!);
  const mid = ridgeBars(lastFar + 60, 8, 20980, 12);
  const nearT = lastFar + 60 + 8 * 60 + 120;
  const near = twoLows(20986, 20986.25, nearT);
  const r = detect([...far, ...mid, ...near], {
    currentPrice: 20990,
    maxPoolsPerSide: 1,
    atrOverride: 8,
  });
  assert(r.eql.length === 1, `maxPerSide 1 keeps one EQL (got ${r.eql.length})`);
  assert(
    r.eql[0]!.level === 20920,
    `kept structural EQL ${r.eql[0]!.level}, not the near-price pair`
  );
  ok("ranking keeps structural EQL over near-price pair");
}

// --- distance invalidation still draws until sweep ---
{
  const formed = twoHighs(21000, 21000);
  const dumped = padAfter(formed, 4, 20960);
  dumped[dumped.length - 1] = {
    ...dumped[dumped.length - 1]!,
    close: 20960,
    high: 20962,
    low: 20958,
  };
  const r = detect(dumped, { atrOverride: 8, invalidationAtrMult: 2.5 });
  assert(r.eqh[0]!.status === "invalidated", "explicit ATR abandon still works");
  const mapped = toRelativeEqualPools(r.pools);
  assert(
    mapped.some((p) => p.type === "reh" && p.price === 21000),
    "invalidated-by-distance still maps to overlay"
  );
  ok("distance-invalidated pool still overlays");
}

// Screenshot failure: two swing lows (support) + nearby highs in the same tick band
// must be REL only — never dual REH/REL, never three stacked REL.
{
  const t0 = BASE + 90_000;
  const high1 = swingHighAt(21000.75, t0, 6);
  const dip = valleyBars(t0 + 180, 8, 20999.5, 3);
  const high2 = swingHighAt(21000.5, t0 + 180 + 8 * 60 + 120, 6);
  const tH2 = t0 + 180 + 8 * 60 + 120;
  const wait = flatBars(tH2 + 180, 10, 21002);
  const tL1 = unix(wait.at(-1)!) + 180;
  const low1 = swingLowAt(21000, tL1, 16);
  const bounce = ridgeBars(tL1 + 180, 8, 21001, 3);
  const low2 = swingLowAt(21000.25, tL1 + 180 + 8 * 60 + 120, 16);
  const tL2 = tL1 + 180 + 8 * 60 + 120;
  const low3wait = flatBars(tL2 + 180, 8, 21002);
  const low3 = swingLowAt(20999.75, unix(low3wait.at(-1)!) + 180, 16);
  const bars = padAfter(
    [...high1, ...dip, ...high2, ...wait, ...low1, ...bounce, ...low2, ...low3wait, ...low3],
    4,
    21020
  );
  const r = detect(bars, { currentPrice: 21020, atrOverride: 8, lookback: 500 });
  const inBand = (px: number) => Math.abs(px - 21000) <= 2;
  const midEqh = r.eqh.filter((p) => inBand(p.level));
  const midEql = r.eql.filter((p) => inBand(p.level));
  assert(midEqh.length === 0, `middle support must not be REH (got ${midEqh.map((p) => p.level).join(",")})`);
  assert(midEql.length === 1, `one sell-side area from the swing lows, got ${midEql.length} REL`);
  assert(
    midEql[0]!.swings.every((s) => s.type === "low"),
    "REL contributing swings are lows only"
  );
  const mapped = toRelativeEqualPools(r.pools);
  const midMap = mapped.filter((p) => inBand(p.price));
  assert(midMap.length === 1, `overlay one line in the band, got ${midMap.length}`);
  assert(midMap[0]!.type === "rel", `overlay is REL not REH/REL, got ${midMap[0]?.type}`);
  assert(
    !mapped.some((p) => inBand(p.price) && p.type === "reh"),
    "nearby high in the tick band must not draw REH on the support"
  );
  for (const p of r.pools) {
    const types = new Set(p.swings.map((s) => s.type));
    assert(!(types.has("high") && types.has("low")), `${p.id} mixed highs and lows`);
  }
  ok("mid-range two swing lows → REL only, not dual REH/REL, not stacked REL");
}

{
  const highs = twoHighs(21000, 21000.25);
  const t = unix(highs.at(-1)!) + 60;
  const wait = flatBars(t, 10, 20996);
  const loneLow = swingLowAt(21000, unix(wait.at(-1)!) + 180, 16);
  const r = detect(padAfter([...highs, ...wait, ...loneLow], 4, 20990), {
    currentPrice: 20990,
    atrOverride: 8,
  });
  const bandEqh = r.eqh.filter((p) => Math.abs(p.level - 21000) <= 2);
  const bandEql = r.eql.filter((p) => Math.abs(p.level - 21000) <= 2);
  assert(bandEqh.length === 1, "two swing highs still form buy-side");
  assert(bandEql.length === 0, "a lone low at the same price is not REL and must not pair with those highs");
  const mapped = toRelativeEqualPools(r.pools);
  assert(
    mapped.filter((p) => Math.abs(p.price - 21000) <= 2).every((p) => p.type === "reh"),
    "overlay at X is buy-side only"
  );
  ok("two highs + one low at ~X → REH only; low does not borrow the highs");
}

function lastUnix(bars: Bar[]): number {
  return unix(bars.at(-1)!);
}

function appendBars(parts: Bar[], next: Bar[]): Bar[] {
  if (!next.length) return parts;
  if (!parts.length) return [...next];
  const t = lastUnix(parts);
  const shift = t + 60 - unix(next[0]!);
  if (shift === 0) return parts.concat(next);
  return parts.concat(
    next.map((b) => ({
      ...b,
      time: new Date((unix(b) + shift) * 1000),
    }))
  );
}

/** MNQU2026 PRIMARY regression: 4 near-price REL lines after London High. */
const MNQU_4REL = {
  londonHigh: 30290,
  structural: [30218, 30218.5] as const,
  internals: [
    [30221, 30221.5],
    [30224, 30224.5],
    [30227, 30227.25],
  ] as const,
  chop: 30252,
  currentPrice: 30227.25,
  bandLo: 30210,
  bandHi: 30240,
};

function buildMnqu4RelCluster(): Bar[] {
  const t0 = Math.floor(Date.UTC(2026, 7, 14, 6, 0, 0) / 1000);
  let parts: Bar[] = [];
  const rallyStart = 30130;
  for (let i = 0; i < 24; i++) {
    const px = rallyStart + ((30270 - rallyStart) * i) / 24;
    parts.push(bar(t0 + i * 60, px, px + 4, px - 2, px + 2));
  }
  parts = appendBars(parts, swingHighAt(MNQU_4REL.londonHigh, lastUnix(parts) + 180, 42));
  parts = appendBars(parts, valleyBars(lastUnix(parts) + 60, 8, 30245, 12));
  const addEqlPair = (l1: number, l2: number) => {
    parts = appendBars(parts, swingLowAt(l1, lastUnix(parts) + 180, 18));
    parts = appendBars(parts, ridgeBars(lastUnix(parts) + 60, 10, MNQU_4REL.chop, 8));
    parts = appendBars(parts, swingLowAt(l2, lastUnix(parts) + 180, 18));
    parts = appendBars(parts, ridgeBars(lastUnix(parts) + 60, 16, MNQU_4REL.chop, 8));
    parts = appendBars(parts, flatBars(lastUnix(parts) + 60, 6, MNQU_4REL.chop));
  };
  addEqlPair(MNQU_4REL.structural[0], MNQU_4REL.structural[1]);
  for (const [a, b] of MNQU_4REL.internals) addEqlPair(a, b);
  parts = appendBars(parts, ridgeBars(lastUnix(parts) + 60, 6, 30245, 6));
  return padAfter(parts, 4, 30245);
}

const MNQU_4REH = {
  londonLow: 30120,
  structural: [30180.5, 30180] as const,
  internals: [
    [30177.5, 30177],
    [30174.5, 30174],
    [30171.25, 30171],
  ] as const,
  chop: 30148,
  currentPrice: 30171,
  bandLo: 30165,
  bandHi: 30190,
};

function buildMnqu4RehCluster(): Bar[] {
  const t0 = Math.floor(Date.UTC(2026, 7, 14, 6, 0, 0) / 1000);
  let parts: Bar[] = [];
  const dumpStart = 30240;
  for (let i = 0; i < 24; i++) {
    const px = dumpStart - ((dumpStart - 30140) * i) / 24;
    parts.push(bar(t0 + i * 60, px, px + 2, px - 4, px - 2));
  }
  parts = appendBars(parts, swingLowAt(MNQU_4REH.londonLow, lastUnix(parts) + 180, 42));
  parts = appendBars(parts, ridgeBars(lastUnix(parts) + 60, 8, 30150, 12));
  const addEqhPair = (h1: number, h2: number) => {
    parts = appendBars(parts, swingHighAt(h1, lastUnix(parts) + 180, 18));
    parts = appendBars(parts, valleyBars(lastUnix(parts) + 60, 10, MNQU_4REH.chop, 8));
    parts = appendBars(parts, swingHighAt(h2, lastUnix(parts) + 180, 18));
    parts = appendBars(parts, valleyBars(lastUnix(parts) + 60, 16, MNQU_4REH.chop, 8));
    parts = appendBars(parts, flatBars(lastUnix(parts) + 60, 6, MNQU_4REH.chop));
  };
  addEqhPair(MNQU_4REH.structural[0], MNQU_4REH.structural[1]);
  for (const [a, b] of MNQU_4REH.internals) addEqhPair(a, b);
  parts = appendBars(parts, valleyBars(lastUnix(parts) + 60, 6, 30145, 6));
  return padAfter(parts, 4, 30145);
}

const CLUSTER_DETECT: EqhEqlConfig = {
  symbol: "MNQU2026",
  atrOverride: 8,
  lookback: 500,
  currentPrice: MNQU_4REL.currentPrice,
};

{
  const specPath = path.join(process.cwd(), "data", "research", "eqh-eql-mnqu2026-4rel-cluster.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8")) as { expectedOld: { overlayRelInCluster: number }; expectedNew: { overlayRelInCluster: number; primaryLevel: number } };
  const bars = buildMnqu4RelCluster();
  const old = detect(bars, { ...CLUSTER_DETECT, recognizableAreaCollapse: false });
  const neu = detect(bars, CLUSTER_DETECT);
  const inBand = (px: number) => px >= MNQU_4REL.bandLo && px <= MNQU_4REL.bandHi;
  const oldMap = toRelativeEqualPools(old.pools).filter((p) => p.type === "rel" && inBand(p.price));
  const newMap = toRelativeEqualPools(neu.pools).filter((p) => p.type === "rel" && inBand(p.price));
  const oldEql = old.eql.filter((p) => inBand(p.level));
  const newEql = neu.eql.filter((p) => inBand(p.level));
  console.log(
    `  MNQU 4-REL cluster: OLD overlay REL=${oldMap.length} levels=[${oldMap.map((p) => p.price.toFixed(2)).join(", ")}] ` +
      `NEW overlay REL=${newMap.length} level=${newMap[0]?.price.toFixed(2)} role=${newEql[0]?.liquidityRole} swings=${newEql[0]?.swings.length}`
  );
  console.log(`  PRIMARY whyImportant: ${newEql[0]?.whyImportant}`);
  console.log(
    `  INTERNAL: ${neu.internal.map((p) => `${p.level.toFixed(2)} [${p.swings.map((s) => s.price.toFixed(2)).join("/")}]`).join(" | ")}`
  );
  console.log(`  REJECTED count=${neu.rejected.length} DISPLAYED=${neu.displayed.length} RAW lows=${neu.rawSwings.lows.length}`);
  assert(oldMap.length === spec.expectedOld.overlayRelInCluster, `OLD over-detect must be 4 REL, got ${oldMap.length} (${oldMap.map((p) => p.price).join(",")})`);
  assert(oldEql.length === 4, `OLD eql pools in band ${oldEql.length}`);
  assert(newMap.length === spec.expectedNew.overlayRelInCluster, `NEW overlay must be 1 REL, got ${newMap.length}`);
  assert(newEql.length === 1, `NEW one sell-side area, got ${newEql.length}`);
  assert(newEql[0]!.liquidityRole === "PRIMARY", `PRIMARY role, got ${newEql[0]!.liquidityRole}`);
  assert(newEql[0]!.liquidityLayer === "RELATIVE", "detector layer is RELATIVE, not EXTERNAL session/PD");
  assert(newMap[0]!.liquidityRole === "PRIMARY", "overlay carries PRIMARY");
  assert(typeof newEql[0]!.whyImportant === "string" && newEql[0]!.whyImportant.length > 20, `PRIMARY has evidence: ${newEql[0]!.whyImportant}`);
  assert(newEql[0]!.level === spec.expectedNew.primaryLevel, `representative level is structural low ${spec.expectedNew.primaryLevel}, got ${newEql[0]!.level}`);
  assert(
    newEql[0]!.swings.length >= 8,
    `internal lows preserved on the area (got ${newEql[0]!.swings.length} swings)`
  );
  assert(
    newEql[0]!.swings.every((s) => s.type === "low"),
    "contributing swings are lows only"
  );
  assert(neu.internal.length >= 3, `three internal pairs kept as INTERNAL (got ${neu.internal.length})`);
  assert(
    neu.internal.every((p) => p.liquidityRole === "INTERNAL" && p.liquidityLayer === "INTERNAL"),
    "absorbed pairs are INTERNAL layer, not REJECTED noise"
  );
  assert(
    !toRelativeEqualPools(neu.internal).length,
    "INTERNAL is hidden from the main overlay"
  );
  assert(neu.displayed.filter((p) => inBand(p.level)).length === 1, "displayed count in cluster is 1");
  assert(
    /internal/i.test(newEql[0]!.why),
    `why explains absorbed internals: ${newEql[0]!.why}`
  );
  assert(
    !newMap.some((p) => Math.abs(p.price - MNQU_4REL.londonHigh) < 1),
    "London High is named session liquidity — not absorbed into REL"
  );
  assert(
    !neu.eqh.some((p) => inBand(p.level)),
    "chop highs in-band must not spawn REH on the REL cluster"
  );
  const beforeLast = detect(bars, {
    ...CLUSTER_DETECT,
    asOfIndex: Math.max(10, bars.length - 20),
  });
  assert(
    !beforeLast.eql.some((p) =>
      p.swings.some((s) => s.confirmationTime > Math.floor(bars[Math.max(10, bars.length - 20)]!.time.getTime() / 1000))
    ),
    "PIT: no post-T confirmation on the 4-REL fixture"
  );
  ok("MNQU2026 4-REL near-price cluster → one PRIMARY sell-side area");
}

{
  const bars = buildMnqu4RehCluster();
  const old = detect(bars, {
    ...CLUSTER_DETECT,
    currentPrice: MNQU_4REH.currentPrice,
    recognizableAreaCollapse: false,
  });
  const neu = detect(bars, { ...CLUSTER_DETECT, currentPrice: MNQU_4REH.currentPrice });
  const inBand = (px: number) => px >= MNQU_4REH.bandLo && px <= MNQU_4REH.bandHi;
  const oldMap = toRelativeEqualPools(old.pools).filter((p) => p.type === "reh" && inBand(p.price));
  const newMap = toRelativeEqualPools(neu.pools).filter((p) => p.type === "reh" && inBand(p.price));
  console.log(
    `  MNQU 4-REH equivalent: OLD overlay REH=${oldMap.length} NEW=${newMap.length} level=${newMap[0]?.price.toFixed(2)}`
  );
  assert(oldMap.length === 4, `OLD EQH over-detect must be 4 REH, got ${oldMap.length} (${oldMap.map((p) => p.price).join(",")})`);
  assert(newMap.length === 1, `NEW one REH overlay, got ${newMap.length}`);
  assert(neu.eqh.filter((p) => inBand(p.level)).length === 1, "one buy-side area");
  assert(neu.eqh.find((p) => inBand(p.level))!.liquidityRole === "PRIMARY", "EQH cluster is PRIMARY");
  assert(neu.eqh.find((p) => inBand(p.level))!.liquidityLayer === "RELATIVE", "EQH is RELATIVE not EXTERNAL");
  assert(neu.internal.length >= 3, "EQH internals preserved as INTERNAL");
  assert(neu.eqh.find((p) => inBand(p.level))!.whyImportant.length > 20, "PRIMARY EQH has evidence");
  assert(neu.eqh.find((p) => inBand(p.level))!.level === 30180.5, "representative level is structural high");
  assert(
    neu.eqh.find((p) => inBand(p.level))!.swings.length >= 8,
    "internal highs preserved on the area"
  );
  assert(!neu.eql.some((p) => inBand(p.level)), "chop lows in-band must not spawn REL on the REH cluster");
  ok("EQH equivalent: 4 overlapping REH → one PRIMARY buy-side area");
}

{
  const far = twoLows(20920, 20920.25, BASE);
  const lastFar = unix(far.at(-1)!);
  const mid = ridgeBars(lastFar + 60, 10, 20980, 16);
  const nearT = lastFar + 60 + 10 * 60 + 120;
  const near = twoLows(20986, 20986.25, nearT);
  const r = detect([...far, ...mid, ...near], {
    currentPrice: 20990,
    atrOverride: 8,
    lookback: 400,
  });
  const eql = r.eql.filter((p) => p.level === 20920 || p.level === 20986);
  assert(eql.length === 2, `deep rally between EQL shelves stays two areas, got ${r.eql.map((p) => p.level).join(",")}`);
  const roles = new Set(eql.map((p) => p.liquidityRole));
  assert(roles.has("PRIMARY") && roles.has("SECONDARY"), `distinct shelves rank PRIMARY+SECONDARY, got ${[...roles]}`);
  const mapped = toRelativeEqualPools(r.pools).filter((p) => p.type === "rel");
  assert(
    mapped.some((p) => p.price === 20920) && mapped.some((p) => p.price === 20986),
    `both distinct REL shelves still overlay (${mapped.map((p) => p.price).join(",")})`
  );
  ok("distinct EQL shelves with a real leave stay separate (PRIMARY + SECONDARY)");
}

// Fixture compare (no live TV)
{
  const fixturePath = path.join(process.cwd(), "data", "replay-fixtures", "synthetic-ny-am.json");
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    m1: Array<{ time: string; open: number; high: number; low: number; close: number }>;
  };
  const m1: Bar[] = raw.m1.map((b) => ({
    time: new Date(b.time),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
  const neu = detectEqhEqlLiquidity(m1, { symbol: "MNQ=F", currentPrice: m1.at(-1)?.close });
  const old = detectRelativeEqualPools(m1, m1.at(-1)!.time, "ny_am");
  console.log(
    `  fixture synthetic-ny-am: new EQH=${neu.eqh.length} EQL=${neu.eql.length} ` +
      `pending=${neu.pendingSwings.length} | old reh/rel pools=${old.length}`
  );
  assert(neu.status === "known", "fixture detector returns known");
  ok("fixture replay (synthetic-ny-am)");
}

// NQ historical dataset — point-in-time + old vs new (no live TV)
{
  const dsPath = path.join(
    process.cwd(),
    "data",
    "research",
    "datasets",
    "229d1bea359bcc6777ff",
    "candles.json"
  );
  if (fs.existsSync(dsPath)) {
    const raw = JSON.parse(fs.readFileSync(dsPath, "utf8")) as Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }>;
    const m1: Bar[] = raw.map((b) => ({
      time: new Date(b.timestamp * 1000),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    const cutoff = Math.min(2400, m1.length - 1);
    const early = detectEqhEqlLiquidity(m1, {
      symbol: "NQ",
      asOfIndex: cutoff,
      currentPrice: m1[cutoff]!.close,
    });
    const leaked = early.pools.some((p) =>
      p.swings.some((s) => s.confirmationTime > Math.floor(m1[cutoff]!.time.getTime() / 1000))
    );
    assert(!leaked, "NQ cutoff has no post-T confirmation timestamps");
    const old = detectRelativeEqualPools(m1.slice(0, cutoff + 1), m1[cutoff]!.time, "ny_am");
    console.log(
      `  NQ dataset @ bar ${cutoff}: new EQH=${early.eqh.length} EQL=${early.eql.length} ` +
        `(active ${early.pools.filter((p) => p.status === "active").length}, ` +
        `swept ${early.pools.filter((p) => p.status === "swept" || p.status === "closed_through").length}) ` +
        `| old paired pools=${old.length}`
    );
    ok("NQ historical dataset replay (no future leakage)");
  } else {
    ok("NQ historical dataset replay skipped (no candles.json)");
  }
}

console.log(`test-eqh-eql-liquidity: ok (${passed} cases)`);
