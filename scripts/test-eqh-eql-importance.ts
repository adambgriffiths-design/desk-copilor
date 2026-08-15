/**
 * Liquidity-first EQH/EQL — run: npm run test:eqh-eql-importance
 *
 * Distinguishes obvious resting liquidity from similar prints.
 * Does not import or modify production detectRehRel / detectRelativeEqualPools.
 */
import type { Bar } from "../lib/types";
import {
  detectEqhEqlLiquidity,
  STRUCTURAL_TEST_ORDER,
  type EqhEqlConfig,
  type EqhEqlPool,
} from "../lib/research/eqh-eql-liquidity";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const WEAK: EqhEqlConfig = {
  symbol: "MNQ=F",
  atrOverride: 8,
  prominenceMinTicks: 3,
  prominenceAtrFrac: 0.05,
  valleyMinTicks: 3,
};

function bar(t: number, o: number, h: number, l: number, c: number): Bar {
  return { time: new Date(t * 1000), open: o, high: h, low: l, close: c };
}

function unix(b: Bar): number {
  return Math.floor(b.time.getTime() / 1000);
}

function swingHighAt(peak: number, tPeak: number, pullback = 16): Bar[] {
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

function swingLowAt(trough: number, tPeak: number, bounce = 16): Bar[] {
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

function tinyHighAt(peak: number, tPeak: number): Bar[] {
  const p = peak;
  return [
    bar(tPeak - 120, p - 1, p - 0.5, p - 1.25, p - 0.75),
    bar(tPeak - 60, p - 0.75, p - 0.25, p - 1, p - 0.5),
    bar(tPeak, p - 0.5, p, p - 0.75, p - 0.25),
    bar(tPeak + 60, p - 0.25, p - 0.25, p - 1, p - 0.75),
    bar(tPeak + 120, p - 0.75, p - 0.5, p - 1.25, p - 1),
  ];
}

function tinyLowAt(trough: number, tPeak: number): Bar[] {
  const p = trough;
  return [
    bar(tPeak - 120, p + 1, p + 1.25, p + 0.5, p + 0.75),
    bar(tPeak - 60, p + 0.75, p + 1, p + 0.25, p + 0.5),
    bar(tPeak, p + 0.5, p + 0.75, p, p + 0.25),
    bar(tPeak + 60, p + 0.25, p + 1, p + 0.25, p + 0.75),
    bar(tPeak + 120, p + 0.75, p + 1.25, p + 0.5, p + 1),
  ];
}

function valleyBars(fromT: number, n: number, mid: number, depth: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    out.push(bar(fromT + i * 60, mid, mid + 1, mid - depth, mid - 0.5));
  }
  return out;
}

function ridgeBars(fromT: number, n: number, mid: number, height: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    out.push(bar(fromT + i * 60, mid, mid + height, mid - 1, mid + 0.5));
  }
  return out;
}

function padAfter(bars: Bar[], n: number, price: number, step = 60): Bar[] {
  const last = bars.at(-1)!;
  const t0 = unix(last) + step;
  const out = [...bars];
  for (let i = 0; i < n; i++) {
    out.push(bar(t0 + i * step, price, price + 0.5, price - 0.5, price));
  }
  return out;
}

function twoHighs(h1: number, h2: number, t0: number, pullback = 16): Bar[] {
  const a = swingHighAt(h1, t0, pullback);
  const gap = valleyBars(t0 + 180, 6, Math.min(h1, h2) - 4, 12);
  const b = swingHighAt(h2, t0 + 180 + 6 * 60 + 120, pullback);
  return [...a, ...gap, ...b];
}

function twoLows(l1: number, l2: number, t0: number, bounce = 16): Bar[] {
  const a = swingLowAt(l1, t0, bounce);
  const gap = ridgeBars(t0 + 180, 6, Math.max(l1, l2) + 4, 12);
  const b = swingLowAt(l2, t0 + 180 + 6 * 60 + 120, bounce);
  return [...a, ...gap, ...b];
}

function twoTinyHighs(h1: number, h2: number, t0: number): Bar[] {
  const a = tinyHighAt(h1, t0);
  const gap = valleyBars(t0 + 180, 6, Math.min(h1, h2) - 4, 10);
  const b = tinyHighAt(h2, t0 + 180 + 6 * 60 + 120);
  return [...a, ...gap, ...b];
}

function twoTinyLows(l1: number, l2: number, t0: number): Bar[] {
  const a = tinyLowAt(l1, t0);
  const gap = ridgeBars(t0 + 180, 6, Math.max(l1, l2) + 4, 10);
  const b = tinyLowAt(l2, t0 + 180 + 6 * 60 + 120);
  return [...a, ...gap, ...b];
}

const NY_AM = Math.floor(Date.UTC(2026, 7, 12, 14, 5, 0) / 1000);
const ASIA = Math.floor(Date.UTC(2026, 7, 11, 0, 30, 0) / 1000);

function detect(bars: Bar[], extra: EqhEqlConfig = {}) {
  const last = bars.at(-1)!;
  return detectEqhEqlLiquidity(bars, {
    symbol: "MNQ=F",
    atrOverride: 8,
    currentPrice: extra.currentPrice ?? last.close,
    ...extra,
  });
}

let passed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ok  ${name}`);
}

{
  assert(STRUCTURAL_TEST_ORDER.length === 10, "ten structural/supporting checks");
  assert(STRUCTURAL_TEST_ORDER.includes("relativeEquality"), "relative equality is supporting, not the detector");
  assert(STRUCTURAL_TEST_ORDER.includes("meaningfulVsPa"), "meaningful vs PA is a gate");
  ok("structural gates exist; no weighted mystery score");
}

{
  const bars = padAfter(twoTinyHighs(21000, 21000, NY_AM), 4, 20990);
  const r = detect(bars, { ...WEAK, currentPrice: 20990 });
  assert(r.eqh.length === 0, `insignificant exact equals must not become a pool (got ${r.eqh.length})`);
  assert(r.rejected.length >= 1, "rejected set records the similar prints");
  const rej = r.rejected.find((x) => x.kind === "eqh")!;
  assert(rej != null, "EQH-like pair was considered and rejected");
  assert(
    rej.failedTests.includes("meaningfulVsPa") || /not meaningful|minor|fluctuation/i.test(rej.why),
    `rejection explains weakness: ${rej.why}`
  );
  ok("insignificant equal highs → rejected, not a liquidity area");
}

{
  const formed = twoHighs(21000, 21000, NY_AM, 16);
  const dumped = padAfter(formed, 8, 20972);
  dumped[dumped.length - 1] = {
    ...dumped[dumped.length - 1]!,
    close: 20972,
    high: 20974,
    low: 20970,
  };
  const r = detect(dumped, { currentPrice: 20972 });
  assert(r.eqh.length === 1, "significant EQH detected as a buy-side area");
  const p = r.eqh[0]!;
  assert(p.visualClass === "A", `class A, got ${p.visualClass}`);
  assert(p.importance === "HIGH", `significant EQH HIGH, got ${p.importance} ${p.why}`);
  assert(/buy-side liquidity area/i.test(p.why), `why leads with liquidity area: ${p.why}`);
  assert(p.liquidityArea.type === "BUY_SIDE", "area type BUY_SIDE");
  assert(p.liquidityArea.representativeLevel === 21000, "representative level is the high");
  assert(p.lifecycle === "ACTIVE", "unswept stays ACTIVE");
  assert(p.factors.relativeEquality.score === 1, "relative equality supports, does not create the pool");
  ok("significant equal highs → class-A HIGH buy-side area");
}

{
  const bars = padAfter(twoTinyLows(20970, 20970, NY_AM), 4, 20990);
  const r = detect(bars, { ...WEAK, currentPrice: 20990 });
  assert(r.eql.length === 0, "insignificant EQL rejected");
  assert(r.rejected.some((x) => x.kind === "eql"), "rejected EQL recorded");
  ok("insignificant equal lows → rejected");
}

{
  const formed = twoLows(20970, 20970, NY_AM, 16);
  const rally = padAfter(formed, 8, 21005);
  rally[rally.length - 1] = {
    ...rally[rally.length - 1]!,
    close: 21005,
    high: 21008,
    low: 21002,
  };
  const r = detect(rally, { currentPrice: 21005 });
  assert(r.eql.length === 1, "significant EQL detected");
  assert(r.eql[0]!.importance === "HIGH", `got ${r.eql[0]!.importance} ${r.eql[0]!.why}`);
  assert(r.eql[0]!.liquidityType === "EQL", "liquidityType EQL");
  assert(r.eql[0]!.liquidityArea.type === "SELL_SIDE", "sell-side area");
  ok("significant equal lows → HIGH sell-side area");
}

{
  const h1 = swingHighAt(21000, NY_AM, 16);
  const g1 = valleyBars(NY_AM + 180, 5, 20986, 12);
  const t2 = NY_AM + 180 + 5 * 60 + 120;
  const h2 = swingHighAt(21000.25, t2, 16);
  const g2 = valleyBars(t2 + 180, 5, 20986, 12);
  const h3 = swingHighAt(20999.75, t2 + 180 + 5 * 60 + 120, 16);
  const r = detect(padAfter([...h1, ...g1, ...h2, ...g2, ...h3], 4, 20980), {
    currentPrice: 20980,
  });
  const p = r.eqh[0]!;
  assert(p.swings.length === 3, `three swings in one area, got ${p.swings.length}`);
  assert(r.eqh.length === 1, "one area, not three levels");
  assert(p.liquidityArea.priceLow <= 20999.75 && p.liquidityArea.priceHigh >= 21000.25, "area band covers contributing prints");
  assert(p.importance === "HIGH", `got ${p.importance} ${p.why}`);
  ok("18500 / 18500.50 / 18500.75-style cluster is one area");
}

{
  const bars = padAfter(twoTinyHighs(21000, 21001, NY_AM), 4, 20990);
  const r = detect(bars, { ...WEAK, currentPrice: 20990 });
  assert(r.eqh.length === 0, "1.00 pt between weak swings must not auto-become EQH");
  assert(
    r.rejected.some((x) => x.kind === "eqh"),
    "rejected because the number is small is not a reason to accept"
  );
  ok("18500 vs 18501 does not auto-become EQH");
}

{
  let t = NY_AM;
  const parts: Bar[] = [];
  for (let n = 0; n < 5; n++) {
    parts.push(...tinyHighAt(21000 + (n % 2) * 0.25, t));
    t += 180;
    parts.push(...valleyBars(t, 4, 20992, 8));
    t += 4 * 60 + 120;
  }
  const r = detect(padAfter(parts, 3, 20990), { ...WEAK, currentPrice: 20990 });
  assert(
    r.eqh.every((p) => p.importance !== "HIGH"),
    "repeated noise must not rank HIGH"
  );
  assert(r.eqh.length === 0 || r.rejected.length >= 1, "noise is rejected or not an area");
  ok("repeated noise does not inflate importance");
}

{
  const nearBars = padAfter(twoHighs(21000, 21000, NY_AM, 16), 6, 20998);
  const farBars = padAfter(twoHighs(21000, 21000, NY_AM, 16), 6, 20880);
  farBars[farBars.length - 1] = {
    ...farBars[farBars.length - 1]!,
    close: 20880,
    high: 20882,
    low: 20878,
  };
  const near = detect(nearBars, { currentPrice: 20998 }).eqh[0]!;
  const far = detect(farBars, { currentPrice: 20880, lookback: 400 }).eqh[0]!;
  assert(near.lifecycle === "ACTIVE" && far.lifecycle === "ACTIVE", "both still tracked");
  const nearRank = importanceOrder(near.importance);
  const farRank = importanceOrder(far.importance);
  assert(
    Math.abs(nearRank - farRank) <= 1,
    `distance must not flip HIGH↔LOW: near=${near.importance} far=${far.importance}`
  );
  assert(far.importance !== "LOW" || near.importance !== "HIGH", "distance alone must not decide");
  ok("near vs distant liquidity — distance is not the rank");
}

{
  const formed = twoHighs(21000, 21000, NY_AM, 16);
  const t = unix(formed.at(-1)!) + 60;
  const sweep = bar(t, 20990, 21008, 20988, 20992);
  const r = detect([...formed, sweep], { currentPrice: 20992 });
  const p = r.eqh[0]!;
  assert(p.status === "swept", `status ${p.status}`);
  assert(p.lifecycle === "SWEPT", `lifecycle ${p.lifecycle}`);
  assert(p.level === 21000, "original level preserved");
  assert(p.sweepPrice === 21008, "sweep price recorded");
  assert(p.sweepRange != null, "sweep range recorded");
  assert(p.liquidityArea.contributingSwings.length === 2, "contributing swings kept after sweep");
  assert(p.importance !== "HIGH", `swept must not stay HIGH, got ${p.importance}`);
  assert(p.sweepReaction != null, "sweep reaction recorded");
  assert(/swept/i.test(p.why), p.why);
  ok("swept liquidity preserved, demoted, explainable");
}

{
  const formed = twoHighs(21000, 21000, NY_AM, 16);
  const later = padAfter(formed, 80, 20980, 600);
  const r = detect(later, { currentPrice: 20980, lookback: 400 });
  const p = r.eqh[0]!;
  assert(p.lifecycle === "ACTIVE", `old unswept stays ACTIVE, got ${p.lifecycle}`);
  assert(p.importance !== "LOW", `age must not auto-kill significant EQH, got ${p.importance} ${p.why}`);
  ok("old unswept liquidity remains in play");
}

{
  const t1 = NY_AM;
  const t2 = NY_AM + 12 * 60;
  const bars = [
    ...swingHighAt(21000, t1, 16),
    ...valleyBars(t1 + 180, 6, 20984, 12),
    ...swingHighAt(21000, t2, 16),
  ];
  const r = detect(padAfter(bars, 3, 20985), { currentPrice: 20985 });
  const p = r.eqh[0]!;
  assert(p.timeframeContext === "session" || p.sessionContext === "ny_am", `session ctx ${p.timeframeContext}/${p.sessionContext}`);
  assert(/New York AM|session/i.test(p.sessionLabel + p.structuralContext), p.structuralContext);
  ok("current-session liquidity tagged");
}

{
  const bars = [
    ...swingHighAt(21000, ASIA, 16),
    ...valleyBars(ASIA + 180, 6, 20984, 12),
    ...swingHighAt(20999.75, NY_AM, 16),
  ];
  const r = detect(padAfter(bars, 3, 20980), { currentPrice: 20980, lookback: 400 });
  const p = r.eqh[0]!;
  assert(p.timeframeContext === "htf", `HTF context, got ${p.timeframeContext} (${p.sessionContext})`);
  assert(p.importance !== "LOW", `HTF significant cluster must not be LOW, got ${p.importance}`);
  ok("higher-timeframe liquidity tagged separately");
}

{
  const formed = twoHighs(21000, 20999.75, NY_AM, 16);
  const tLow = unix(formed.at(-1)!) + 180;
  const sl = swingLowAt(20978, tLow, 14);
  const tMss = unix(sl.at(-1)!) + 60;
  const mssBar = bar(tMss, 20980, 20982, 20968, 20970);
  const r = detect([...formed, ...sl, mssBar], { currentPrice: 20970 });
  const p = r.eqh[0]!;
  assert(p.factors.relevantStructure.score === 1, `structural ${p.factors.relevantStructure.note}`);
  assert(
    /structure|MSS|dealing|lookback|held|shift/i.test(p.factors.relevantStructure.note),
    p.factors.relevantStructure.note
  );
  ok("structure-associated liquidity");
}

{
  const first = swingHighAt(21000, NY_AM, 16);
  const gap = valleyBars(NY_AM + 180, 6, 20986, 12);
  const t2 = NY_AM + 180 + 6 * 60 + 120;
  const second = swingHighAt(21000, t2, 16);
  const sweep = bar(unix(second.at(-1)!) + 60, 20990, 21006, 20988, 20992);
  const full = [...first, ...gap, ...second, sweep];
  const secondPeak = full.length - 4;
  const beforeConfirm = detect(full, { asOfIndex: secondPeak + 1, currentPrice: 20990 });
  assert(beforeConfirm.eqh.length === 0, "no EQH before second swing confirms");
  const atConfirm = detect(full, { asOfIndex: secondPeak + 2, currentPrice: 20990 });
  assert(atConfirm.eqh.length === 1, "EQH exists at confirmation T");
  assert(atConfirm.eqh[0]!.lifecycle === "ACTIVE", "at T, sweep in the future is invisible");
  assert(atConfirm.eqh[0]!.sweptAt == null, "must not use eventual sweep");
  const afterSweep = detect(full, { currentPrice: 20992 });
  assert(afterSweep.eqh[0]!.lifecycle === "SWEPT", "after T+sweep, marked SWEPT");
  ok("historical point-in-time scoring (no future sweep leakage)");
}

{
  const formed = twoHighs(21000, 21000, NY_AM, 16);
  const mid = padAfter(formed, 6, 20980);
  mid[mid.length - 1] = { ...mid[mid.length - 1]!, close: 20980, high: 20982, low: 20978 };
  const early = detect(mid, { currentPrice: 20980 });
  const p1 = early.eqh[0]!;
  assert(p1.lifecycle === "ACTIVE", "before sweep: ACTIVE");
  const formation = p1.formationTime;
  const confirmation = p1.confirmationTime;
  const swings = p1.swings.map((s) => s.price).join(",");

  const sweep = bar(unix(mid.at(-1)!) + 60, 20985, 21005, 20984, 20990);
  const later = detect([...mid, sweep], { currentPrice: 20990 });
  const p2 = later.eqh[0]!;
  assert(p2.lifecycle === "SWEPT", "after sweep: SWEPT");
  assert(p2.formationTime === formation, "formation timestamp intact");
  assert(p2.confirmationTime === confirmation, "confirmation timestamp intact");
  assert(p2.swings.map((s) => s.price).join(",") === swings, "contributing swings intact");
  assert(p2.level === 21000, "price intact");
  assert(
    importanceOrder(p2.importance) <= importanceOrder(p1.importance),
    `importance may fall as structure changes: ${p1.importance} → ${p2.importance}`
  );
  assert(p1.importance !== "LOW", "was meaningful before the sweep — not rewritten as noise");
  ok("importance changes with structure; historical facts stay");
}

{
  const far = twoLows(20920, 20920.25, NY_AM, 16);
  const lastFar = unix(far.at(-1)!);
  const mid = ridgeBars(lastFar + 60, 8, 20980, 12);
  const nearT = lastFar + 60 + 8 * 60 + 120;
  const near = twoLows(20986, 20986.25, nearT, 16);
  const r = detect([...far, ...mid, ...near], {
    currentPrice: 20990,
    maxPoolsPerSide: 1,
    atrOverride: 8,
  });
  assert(r.eql.length === 1, "maxPerSide 1");
  assert(
    r.eql[0]!.level === 20920,
    `importance ranking keeps structural EQL ${r.eql[0]!.level}, not proximity ${r.eql[0]!.why}`
  );
  ok("ranking prefers structural pool over nearer pair");
}

{
  const weakNear = padAfter(twoTinyHighs(20995, 20995.25, NY_AM), 3, 20993);
  const strongFar = padAfter(twoHighs(21120, 21120, NY_AM - 3600, 16), 3, 20993);
  const mixed = detect([...strongFar, ...weakNear], {
    ...WEAK,
    currentPrice: 20993,
    lookback: 500,
    maxPoolsPerSide: 2,
  });
  const weak = mixed.eqh.find((p) => Math.abs(p.level - 20995.25) < 1);
  const strong = mixed.eqh.find((p) => Math.abs(p.level - 21120) < 1);
  assert(strong != null, "distant significant pool kept");
  assert(strong!.importance !== "LOW", `far significant ${strong!.importance} ${strong!.why}`);
  assert(weak == null, "near noise must not be an accepted area");
  assert(mixed.rejected.some((x) => x.prices.some((px) => Math.abs(px - 20995) < 1)), "near noise is in the rejected set");
  ok("nearby noise cannot outrank distant meaningful liquidity");
}

{
  const r = detect(padAfter(twoHighs(21000, 21000.75, NY_AM, 16), 4, 20980), { currentPrice: 20980 });
  const p = r.eqh[0]!;
  assert(p != null, "0.75 pt between strong swings can be the same area");
  assert(p.visualClass === "A", "class A");
  assert(p.whyNotNearby.length > 0, "contrast field present");
  ok("strong 0.75 pt shelf is one area; contrast is recorded");
}

function importanceOrder(i: EqhEqlPool["importance"]): number {
  return i === "HIGH" ? 3 : i === "MEDIUM" ? 2 : 1;
}

console.log(`test-eqh-eql-importance: ok (${passed} cases)`);
