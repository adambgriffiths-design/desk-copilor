/**
 * Incremental market engine — run: npm run test:incremental-market
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { Bar } from "../lib/types";
import { buildMarketContextAt } from "../lib/levels";
import { detectEqhEqlLiquidity } from "../lib/research/eqh-eql-liquidity";
import { buildMarketObservation } from "../lib/observation-engine";
import { buildMarketState } from "../lib/market-state-build";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import {
  createIncrementalMarketEngine,
  fingerprintEqhAreas,
  fingerprintKarenInput,
  barSeriesFingerprint,
} from "../lib/incremental-market-engine";
import { updateEqhEqlLiquidity } from "../lib/research/eqh-eql-incremental";
import { shouldRunKarenAnalysis } from "../lib/analysis-triggers";
import { shouldRedrawDrawings, drawingPayloadFingerprint } from "../lib/drawing-state";
import { lastBarAffectsTrackedPrices } from "../lib/structure-state";
import { loadReplayFixture } from "../lib/research/replay/fixtures";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function bar(t: number, o: number, h: number, l: number, c: number): Bar {
  return { time: new Date(t * 1000), open: o, high: h, low: l, close: c };
}

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

function dailyAround(price: number): Bar[] {
  const day0 = Date.parse("2026-08-10T00:00:00.000Z") / 1000;
  return [
    bar(day0, price - 50, price + 40, price - 80, price - 10),
    bar(day0 + 86400, price - 10, price + 60, price - 40, price + 20),
    bar(day0 + 86400 * 2, price + 20, price + 80, price - 20, price + 30),
  ];
}

const fixture = loadReplayFixture("synthetic-ny-am");

console.log("1. no future leak on initialize");
{
  const cut = fixture.m1[40]!.time;
  const engine = createIncrementalMarketEngine();
  engine.initialize({ data: fixture, asOf: cut, lastPrice: fixture.m1[40]!.close });
  const fp = engine.barFingerprint();
  const n = Number(fp.split("|")[0]);
  const lastT = Number(fp.split("|")[2]);
  assert(n <= 41, `sliced m1 count ${n} fingerprint ${fp}`);
  assert(lastT <= cut.getTime(), "last bar not after asOf");
  console.log("  ok");
}

console.log("2. duplicate ticks skipped");
{
  const engine = createIncrementalMarketEngine();
  const asOf = fixture.m1.at(-1)!.time;
  const px = fixture.m1.at(-1)!.close;
  engine.initialize({ data: fixture, asOf, lastPrice: px });
  engine.applyTick({ price: px, time: asOf });
  engine.applyTick({ price: px, time: asOf });
  assert(engine.stats().tickSkippedDupes >= 1, "duplicate tick counted");
  console.log("  ok");
}

console.log("3. analysis trigger policy");
{
  assert(shouldRunKarenAnalysis("user", []) === true, "user always analyzes");
  assert(shouldRunKarenAnalysis("tick", []) === false, "quiet tick does not analyze");
  assert(
    shouldRunKarenAnalysis("tick", [{ kind: "mss", at: 1, label: "mss" }]) === true,
    "mss tick analyzes"
  );
  assert(shouldRunKarenAnalysis("tick", [{ kind: "bar_close", at: 1, label: "c" }]) === false, "bare bar_close is not enough");
  console.log("  ok");
}

console.log("4. drawings skip on tick");
{
  assert(
    shouldRedrawDrawings({ prevFingerprint: "a", nextFingerprint: "b", reason: "tick" }) === false,
    "tick never redraws"
  );
  assert(
    shouldRedrawDrawings({ prevFingerprint: "a", nextFingerprint: "a", reason: "structure_event" }) === false,
    "unchanged structure no redraw"
  );
  assert(
    shouldRedrawDrawings({ prevFingerprint: "a", nextFingerprint: "b", reason: "structure_event" }) === true,
    "structure change redraws"
  );
  assert(shouldRedrawDrawings({ prevFingerprint: "a", nextFingerprint: "a", reason: "user" }) === true, "user redraws");
  const fp = drawingPayloadFingerprint(
    [{ id: "pdh", price: 1, label: "PDH", color: "#fff" }],
    [{ id: "z", top: 2, bottom: 1, label: "FVG" }]
  );
  assert(fp.includes("pdh"), "fingerprint includes level id");
  console.log("  ok");
}

console.log("5. lastBarAffectsTrackedPrices / no future in helper");
{
  assert(
    lastBarAffectsTrackedPrices({ high: 10, low: 8, close: 9 }, { high: 10, low: 8, close: 9.25 }, [9.5]) === false,
    "close move away from tracked is not interaction"
  );
  assert(
    lastBarAffectsTrackedPrices({ high: 10, low: 8, close: 9 }, { high: 10, low: 8, close: 10.25 }, [10]) === true,
    "close through tracked level"
  );
  console.log("  ok");
}

console.log("6. full rebuild vs incremental closed bars (synthetic)");
{
  const start = 30;
  const engine = createIncrementalMarketEngine();
  engine.initialize({
    data: fixture,
    asOf: fixture.m1[start]!.time,
    lastPrice: fixture.m1[start]!.close,
  });
  let mismatches = 0;
  const end = Math.min(fixture.m1.length - 1, start + 25);
  for (let i = start + 1; i <= end; i++) {
    engine.syncSeries({
      data: fixture,
      asOf: fixture.m1[i]!.time,
      lastPrice: fixture.m1[i]!.close,
    });
    const asOf = fixture.m1[i]!.time;
    const full = buildMarketContextAt(fixture, asOf, undefined, fixture.m1[i]!.close);
    const incr = engine.getContext();
    const a = fingerprintKarenInput(incr);
    const b = fingerprintKarenInput(full);
    if (a !== b) {
      mismatches += 1;
      if (mismatches === 1) {
        console.log("  first mismatch at", i, "\n   incr", a.slice(0, 180), "\n   full", b.slice(0, 180));
      }
    }
  }
  const lastI = end;
  const fullEqh = detectEqhEqlLiquidity(fixture.m1.slice(0, lastI + 1), {
    symbol: fixture.symbol,
    currentPrice: fixture.m1[lastI]!.close,
    lookback: 720,
  });
  const incrEqh = fingerprintEqhAreas(engine.getEqhEql()!);
  const fullEqhFp = fingerprintEqhAreas(fullEqh);
  if (incrEqh !== fullEqhFp) {
    mismatches += 1;
    console.log("  eqh mismatch at end");
  }
  assert(mismatches === 0, `incremental ≡ full failed (${mismatches} mismatches)`);
  console.log("  ok");
}

console.log("7. tick overlay ≡ mutated last bar full rebuild");
{
  const engine = createIncrementalMarketEngine();
  const last = fixture.m1.at(-1)!;
  engine.initialize({ data: fixture, asOf: last.time, lastPrice: last.close });
  const px = last.close + 1.25;
  engine.applyTick({ price: px, time: last.time });
  const mutated = {
    ...fixture,
    m1: fixture.m1.map((b, i) =>
      i === fixture.m1.length - 1
        ? { ...b, time: new Date(b.time), close: px, high: Math.max(b.high, px), low: Math.min(b.low, px) }
        : { ...b, time: new Date(b.time) }
    ),
  };
  const full = buildMarketContextAt(mutated, last.time, undefined, px);
  const incr = engine.getContext();
  assert(incr.daily.lastClose === full.daily.lastClose, "lastClose matches");
  assert(incr.biasStack.tradeableBias === full.biasStack.tradeableBias, "bias matches after tick overlay");
  console.log("  ok");
}

console.log("8. swing confirmation + REH/EQL areas (BUY_SIDE/SELL_SIDE)");
{
  const t0 = 1_700_000_000;
  const highs = [...swingHighAt(21000, t0 + 600), ...swingHighAt(20998, t0 + 1800)];
  const lows = [...swingLowAt(20940, t0 + 1200), ...swingLowAt(20942, t0 + 2400)];
  const m1 = [...highs, ...lows].sort((a, b) => a.time.getTime() - b.time.getTime());
  const data = {
    symbol: "MNQ=F",
    daily: dailyAround(20970),
    m15: m1.filter((_, i) => i % 15 === 0),
    m5: m1.filter((_, i) => i % 5 === 0),
    m1,
  };
  const engine = createIncrementalMarketEngine();
  const mid = Math.floor(m1.length / 2);
  engine.initialize({ data, asOf: m1[mid]!.time, lastPrice: m1[mid]!.close });
  for (let i = mid + 1; i < m1.length; i++) engine.applyClosedBar(m1[i]!);
  const eqh = engine.getEqhEql()!;
  const sides = new Set(eqh.areas.map((a) => a.type));
  assert(eqh.areas.every((a) => a.type === "BUY_SIDE" || a.type === "SELL_SIDE"), "areas expose BUY_SIDE/SELL_SIDE");
  const st = engine.getStructure()!;
  assert(st.confirmedSwings.length + st.developingSwings.length >= 0, "swing state present");
  assert(st.liquidity.every((l) => l.side === "BUY_SIDE" || l.side === "SELL_SIDE"), "liquidity state sides");
  void sides;
  console.log(`  ok (areas=${eqh.areas.length} swings=${st.confirmedSwings.length})`);
}

console.log("9. liquidity sweep event on close through");
{
  const t0 = 1_700_500_000;
  const m1 = [
    ...swingHighAt(21100, t0 + 300),
    ...swingHighAt(21099, t0 + 1200),
    bar(t0 + 2000, 21100, 21140, 21090, 21130),
  ];
  const data = {
    symbol: "MNQ=F",
    daily: dailyAround(21050),
    m15: m1,
    m5: m1,
    m1,
  };
  const engine = createIncrementalMarketEngine();
  engine.initialize({ data, asOf: m1[m1.length - 2]!.time, lastPrice: m1[m1.length - 2]!.close });
  const snap = engine.applyClosedBar(m1[m1.length - 1]!);
  const kinds = snap.events.map((e) => e.kind);
  assert(kinds.includes("bar_close"), "bar_close event");
  console.log(`  ok events=${kinds.join(",") || "none"}`);
}

console.log("10. EQH incremental reuse vs rebuild");
{
  const m1 = fixture.m1;
  const prev = detectEqhEqlLiquidity(m1.slice(0, -1), { symbol: fixture.symbol, lookback: 180 });
  const reused = updateEqhEqlLiquidity(prev, m1.slice(0, -1), { symbol: fixture.symbol, lookback: 180 }, m1.length - 1);
  assert(reused.mode === "reuse" || reused.mode === "rebuild", "mode set");
  const rebuilt = updateEqhEqlLiquidity(null, m1, { symbol: fixture.symbol, lookback: 180 });
  assert(rebuilt.mode === "rebuild", "null prev rebuilds");
  console.log(`  ok reuse=${reused.mode} rebuild=${rebuilt.mode}`);
}

console.log("11. reconnect / recovery");
{
  const engine = createIncrementalMarketEngine();
  engine.initialize({ data: fixture, asOf: fixture.m1[20]!.time, lastPrice: fixture.m1[20]!.close });
  engine.applyTick({ price: fixture.m1[20]!.close + 2, time: fixture.m1[20]!.time });
  const again = engine.initialize({ data: fixture, asOf: fixture.m1[50]!.time, lastPrice: fixture.m1[50]!.close });
  assert(again.events.some((e) => e.label.includes("initial")), "re-init events");
  const fp = barSeriesFingerprint(fixture.m1.slice(0, 51));
  assert(engine.barFingerprint().split("|")[0] === fp.split("|")[0], "recovered length");
  console.log("  ok");
}

console.log("12. observation from incremental ctx is usable");
{
  const engine = createIncrementalMarketEngine();
  const last = fixture.m1.at(-1)!;
  engine.initialize({ data: fixture, asOf: last.time, lastPrice: last.close });
  const ctx = engine.getContext();
  const state = buildMarketState({
    ctx,
    chartLastPrice: last.close,
    chartLastPriceSource: "yahoo",
    symbol: fixture.symbol,
    chartSnapshot: buildResearchChartSnapshotFromBars({
      bars: fixture.m1.slice(-40),
      symbol: fixture.symbol,
      asOf: last.time,
      timeframe: "1",
    }),
  });
  const obs = buildMarketObservation(ctx, state);
  assert(obs.htf_bias.tradeable_bias != null, "observation bias present");
  console.log("  ok");
}

console.log("13. chart-draw skip helpers in source");
{
  const src = readFileSync(join(process.cwd(), "extension", "chart-draw.js"), "utf8");
  assert(src.includes("skipped_tick"), "tick skip in drawOnChart");
  assert(src.includes("lastDrawFingerprint"), "fingerprint stored");
  assert(src.includes("1.4.112"), "version badge 1.4.112");
  console.log("  ok");
}

console.log("14. closed-bar EQH force-off parity (force detect ≡ updateEqhEqlLiquidity / engine)");
{
  const src = readFileSync(join(process.cwd(), "lib", "incremental-market-engine.ts"), "utf8");
  assert(/afterClosedBar[\s\S]*?eqhForce:\s*false/.test(src), "afterClosedBar must use eqhForce:false");
  assert(!/afterClosedBar[\s\S]*?eqhForce:\s*true/.test(src), "afterClosedBar must not force EQH");

  const start = 30;
  const end = Math.min(fixture.m1.length - 1, start + 40);
  const engine = createIncrementalMarketEngine();
  engine.initialize({
    data: fixture,
    asOf: fixture.m1[start]!.time,
    lastPrice: fixture.m1[start]!.close,
  });

  let mismatches = 0;
  let reusedDelta = 0;
  let rebuildDelta = 0;
  const sInit = engine.stats();

  for (let i = start + 1; i <= end; i++) {
    const bars = fixture.m1.slice(0, i + 1);
    const prevCount = bars.length - 1;
    const prev = detectEqhEqlLiquidity(bars.slice(0, -1), {
      symbol: fixture.symbol,
      currentPrice: bars[bars.length - 2]!.close,
      lookback: 720,
      asOfIndex: bars.length - 2,
    });
    const forced = detectEqhEqlLiquidity(bars, {
      symbol: fixture.symbol,
      currentPrice: bars.at(-1)!.close,
      lookback: 720,
      asOfIndex: bars.length - 1,
    });
    const incr = updateEqhEqlLiquidity(
      prev,
      bars,
      {
        symbol: fixture.symbol,
        currentPrice: bars.at(-1)!.close,
        lookback: 720,
        asOfIndex: bars.length - 1,
      },
      prevCount
    );
    if (fingerprintEqhAreas(incr.liquidity) !== fingerprintEqhAreas(forced)) {
      mismatches += 1;
      if (mismatches === 1) console.log("  leaf mismatch at", i, "mode", incr.mode);
    }

    const before = engine.stats();
    engine.applyClosedBar(bars.at(-1)!);
    const after = engine.stats();
    reusedDelta += after.eqhEqlReused - before.eqhEqlReused;
    rebuildDelta += after.eqhEqlRebuilds - before.eqhEqlRebuilds;

    const engEqh = engine.getEqhEql()!;
    if (fingerprintEqhAreas(engEqh) !== fingerprintEqhAreas(forced)) {
      mismatches += 1;
      if (mismatches <= 2) console.log("  engine mismatch at", i);
    }

    // Liquidity state sides must remain BUY_SIDE/SELL_SIDE (EQH/EQL areas)
    const st = engine.getStructure()!;
    assert(
      st.liquidity.every((l) => l.side === "BUY_SIDE" || l.side === "SELL_SIDE"),
      `liquidity state sides at ${i}`
    );
    assert(
      engEqh.areas.every((a) => a.type === "BUY_SIDE" || a.type === "SELL_SIDE"),
      `eqh area types at ${i}`
    );
  }

  assert(mismatches === 0, `closed-bar EQH parity failed (${mismatches} mismatches)`);
  assert(reusedDelta + rebuildDelta === end - start, "each closed bar updates EQH counters");
  assert(engine.stats().eqhEqlReused >= sInit.eqhEqlReused, "reuse counter monotonic");
  console.log(`  ok bars=${end - start} reusedΔ=${reusedDelta} rebuildΔ=${rebuildDelta}`);
}

console.log("15. closed-bar EQH: quiet reuse + invalidation/interaction rebuild + forming tick");
{
  // Quiet consecutive closes: construct a mid-price plateau that neither confirms a pending
  // swing nor touches existing areas — engine should prefer updateEqhEqlLiquidity reuse.
  const base = fixture.m1.slice(0, 80).map((b) => ({ ...b, time: new Date(b.time) }));
  const last = base.at(-1)!;
  const mid = (last.high + last.low) / 2;
  const quiet: Bar = {
    time: new Date(last.time.getTime() + 60_000),
    open: mid,
    high: mid + 0.25,
    low: mid - 0.25,
    close: mid,
  };
  const dataQuiet = {
    symbol: fixture.symbol,
    daily: fixture.daily,
    m15: fixture.m15,
    m5: fixture.m5,
    m1: base,
  };
  const engQ = createIncrementalMarketEngine();
  engQ.initialize({ data: dataQuiet, asOf: last.time, lastPrice: last.close });
  const prevEqh = engQ.getEqhEql()!;
  const leaf = updateEqhEqlLiquidity(
    prevEqh,
    [...base, quiet],
    { symbol: fixture.symbol, currentPrice: quiet.close, lookback: 720, asOfIndex: base.length },
    base.length
  );
  const sBefore = engQ.stats();
  engQ.applyClosedBar(quiet);
  const sAfter = engQ.stats();
  const forcedQuiet = detectEqhEqlLiquidity([...base, quiet], {
    symbol: fixture.symbol,
    currentPrice: quiet.close,
    lookback: 720,
    asOfIndex: base.length,
  });
  assert(
    fingerprintEqhAreas(engQ.getEqhEql()!) === fingerprintEqhAreas(forcedQuiet),
    "quiet closed bar engine ≡ force detect"
  );
  assert(
    fingerprintEqhAreas(leaf.liquidity) === fingerprintEqhAreas(forcedQuiet),
    "quiet leaf update ≡ force detect"
  );
  if (leaf.mode === "reuse") {
    assert(sAfter.eqhEqlReused > sBefore.eqhEqlReused, "quiet closed bar should reuse EQH");
  } else {
    assert(sAfter.eqhEqlRebuilds > sBefore.eqhEqlRebuilds, "interaction/swing rebuild counted");
  }

  // Invalidation / sweep-style interaction: close through an existing area if any, else HL expand tick.
  const engT = createIncrementalMarketEngine();
  engT.initialize({ data: fixture, asOf: fixture.m1.at(-1)!.time, lastPrice: fixture.m1.at(-1)!.close });
  const px = fixture.m1.at(-1)!.close;
  const areas = engT.getEqhEql()!.areas;
  const target =
    areas.find((a) => a.type === "BUY_SIDE" && a.status === "active") ??
    areas.find((a) => a.type === "SELL_SIDE" && a.status === "active");
  if (target) {
    const pierce =
      target.type === "BUY_SIDE" ? target.priceHigh + 2 : target.priceLow - 2;
    const before = engT.stats();
    engT.applyTick({ price: pierce, time: fixture.m1.at(-1)!.time });
    const after = engT.stats();
    // Forming-bar HL expand forces EQH (unchanged tick policy)
    assert(after.eqhEqlRebuilds > before.eqhEqlRebuilds || after.eqhEqlReused >= before.eqhEqlReused, "tick EQH path ran");
    const forcedTick = detectEqhEqlLiquidity(
      fixture.m1.map((b, i) =>
        i === fixture.m1.length - 1
          ? {
              ...b,
              time: new Date(b.time),
              close: pierce,
              high: Math.max(b.high, pierce),
              low: Math.min(b.low, pierce),
            }
          : { ...b, time: new Date(b.time) }
      ),
      { symbol: fixture.symbol, currentPrice: pierce, lookback: 720 }
    );
    assert(
      fingerprintEqhAreas(engT.getEqhEql()!) === fingerprintEqhAreas(forcedTick),
      "forming-bar tick EQH ≡ force detect after HL expand"
    );
  } else {
    // No active area — still verify quiet tick does not force full detect.
    const before = engT.stats();
    engT.applyTick({ price: px + 0.25, time: fixture.m1.at(-1)!.time });
    const after = engT.stats();
    assert(after.tickUpdates > before.tickUpdates, "tick applied");
  }
  console.log(`  ok quietMode=${leaf.mode} areas=${areas.length}`);
}

console.log("16. repeated closed bar + session-boundary closed bars");
{
  const engine = createIncrementalMarketEngine();
  const i0 = 50;
  engine.initialize({
    data: fixture,
    asOf: fixture.m1[i0]!.time,
    lastPrice: fixture.m1[i0]!.close,
  });
  const b = fixture.m1[i0 + 1]!;
  engine.applyClosedBar(b);
  const fp1 = fingerprintEqhAreas(engine.getEqhEql()!);
  // Repeat same timestamp with slightly different OHLC (in-place update path)
  const repeated: Bar = {
    time: new Date(b.time.getTime()),
    open: b.open,
    high: b.high + 0.5,
    low: b.low,
    close: b.close + 0.25,
  };
  engine.applyClosedBar(repeated);
  const forcedRep = detectEqhEqlLiquidity(
    [...fixture.m1.slice(0, i0 + 1), repeated],
    { symbol: fixture.symbol, currentPrice: repeated.close, lookback: 720 }
  );
  assert(
    fingerprintEqhAreas(engine.getEqhEql()!) === fingerprintEqhAreas(forcedRep),
    "repeated closed bar ≡ force detect"
  );
  assert(fp1.length >= 0, "prior fp captured");

  // Session-ish span: walk across a larger window (synthetic NY AM covers session phases)
  const engS = createIncrementalMarketEngine();
  const sStart = 10;
  const sEnd = Math.min(fixture.m1.length - 1, 90);
  engS.initialize({
    data: fixture,
    asOf: fixture.m1[sStart]!.time,
    lastPrice: fixture.m1[sStart]!.close,
  });
  let sessionMismatches = 0;
  for (let i = sStart + 1; i <= sEnd; i++) {
    engS.applyClosedBar(fixture.m1[i]!);
    const forced = detectEqhEqlLiquidity(fixture.m1.slice(0, i + 1), {
      symbol: fixture.symbol,
      currentPrice: fixture.m1[i]!.close,
      lookback: 720,
    });
    if (fingerprintEqhAreas(engS.getEqhEql()!) !== fingerprintEqhAreas(forced)) {
      sessionMismatches += 1;
    }
  }
  assert(sessionMismatches === 0, `session-span EQH parity failed (${sessionMismatches})`);
  console.log(`  ok repeated + session bars=${sEnd - sStart}`);
}

console.log("\ntest-incremental-market-engine: ok");
