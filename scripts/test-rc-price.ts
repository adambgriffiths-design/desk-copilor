/**
 * RC-PRICE authoritative source-of-truth regression — run: npm run test:rc-price
 */
import {
  LIVE_PRICE_MAX_AGE_MS,
  PRICE_HINT_MAX_AGE_MS,
  isAuthoritativeLiveAvailable,
  resolveAuthoritativePrice,
} from "../lib/chart-live-price";
import { buildMarketState } from "../lib/market-state-build";
import { buildMarketObservation } from "../lib/observation-engine";
import { detectRehRel } from "../lib/reh-rel";
import type { MarketContext } from "../lib/types";
import type { ChartCandle } from "../lib/chart-snapshot";

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

const now = Date.now();
const freshTs = now - 5000;
const staleTs = now - LIVE_PRICE_MAX_AGE_MS - 1000;
const yahooStale = 29784.5;
const tvLive = 29912.25;

console.log("=== resolveAuthoritativePrice ===");

{
  const q = resolveAuthoritativePrice({
    chartLastPrice: tvLive,
    chartLastPriceSource: "tradingview_live",
    chartLastPriceTs: freshTs,
    barClose: yahooStale,
    requireTvLive: true,
  });
  assert(q?.value === tvLive, "fresh TradingView price wins");
  assert(q?.source === "tradingview_live", "source is tradingview_live");
  assert((q?.ageMs ?? 0) <= LIVE_PRICE_MAX_AGE_MS, "fresh TV age within threshold");
}

{
  const q = resolveAuthoritativePrice({
    chartLastPrice: tvLive,
    chartLastPriceSource: "tradingview_live",
    chartLastPriceTs: staleTs,
    requireTvLive: true,
  });
  assert(q == null, "stale TradingView price rejected");
}

{
  const q = resolveAuthoritativePrice({
    chartLastPrice: yahooStale,
    chartLastPriceSource: "price_hint",
    chartLastPriceTs: now - PRICE_HINT_MAX_AGE_MS - 5000,
    requireTvLive: true,
  });
  assert(q == null, "stale priceHint rejected");
}

{
  const q = resolveAuthoritativePrice({
    chartLastPrice: yahooStale,
    chartLastPriceSource: "yahoo_bar_close",
    chartLastPriceTs: freshTs,
    barClose: yahooStale,
    requireTvLive: true,
  });
  assert(q == null, "Yahoo available but TV required → unavailable");
}

{
  const q = resolveAuthoritativePrice({
    chartLastPrice: tvLive,
    chartLastPriceSource: "tradingview_live",
    chartLastPriceTs: freshTs,
    barClose: yahooStale,
    requireTvLive: true,
  });
  assert(q?.value === tvLive, "TV live + Yahoo stale → TV wins");
  assert(isAuthoritativeLiveAvailable(q), "authoritative live flag set");
}

{
  const q = resolveAuthoritativePrice({
    chartLastPrice: tvLive,
    chartLastPriceSource: "tradingview_live",
    chartLastPriceTs: freshTs,
  });
  assert(q?.timestamp === freshTs, "timestamp propagated");
  assert(typeof q?.ageMs === "number", "ageMs propagated");
}

{
  const q = resolveAuthoritativePrice({
    chartLastPrice: tvLive,
    chartLastPriceSource: "tv_bar_close",
    chartLastPriceTs: freshTs,
    requireTvLive: true,
  });
  assert(q == null, "tv bar close never used as live tick");
}

console.log("\n=== market state + REH/REL use same price ===");

const mkCtx = (lastClose: number): MarketContext =>
  ({
    symbol: "MNQ1!",
    daily: { lastClose },
    htfPdArrays: {
      previousDay: { high: lastClose + 100, low: lastClose - 100, close: lastClose },
      currentDay: { open: lastClose },
      levels: [],
      unfilledDailyFvgs: [],
    },
    sessions: { nyRthHigh: lastClose + 50, nyRthLow: lastClose - 50 },
    biasStack: {
      daily: "neutral",
      m15: "neutral",
      m5: "neutral",
      dominantBias: "neutral",
      tradeableBias: "neutral",
      alignedCount: 0,
      summary: "",
      biasConflict: false,
      conflictPairs: [],
    },
    structureFacts: {
      m1UnfilledFvgs: [],
      m1InvertedFvgs: [],
      liquiditySweeps: [],
      summary: "",
      relativeEqualPools: [],
    },
    premiumDiscount: {
      vsCurrentDayRange: "equilibrium",
      vsPreviousDayRange: "equilibrium",
    },
    activeSession: { id: "ny_am", label: "NY AM", killZone: false, amdPhase: "m", macroWindow: null },
    org: null,
    fetchedAt: new Date().toISOString(),
  }) as MarketContext;

const mkCandle = (t: number, h: number, l: number): ChartCandle => ({
  t,
  o: (h + l) / 2,
  h,
  l,
  c: (h + l) / 2,
});

{
  const ctx = mkCtx(yahooStale);
  const candles: ChartCandle[] = [];
  let t = 1_700_000_000;
  for (let i = 0; i < 30; i++) {
    candles.push(mkCandle(t, 29900, 29880));
    t += 60;
  }
  const state = buildMarketState({
    ctx,
    chartLastPrice: tvLive,
    chartLastPriceSource: "tradingview_live",
    chartLastPriceTs: freshTs,
    chartSnapshot: {
      ok: true,
      candles,
      drawings: [],
      source: "tv_export",
      lastPrice: yahooStale,
    },
  });
  assert(state.lastPrice === tvLive, "state.lastPrice uses authoritative TV live");
  assert(state.lastPriceSource === "tradingview", "state.lastPriceSource tradingview");

  const obs = buildMarketObservation(ctx, state);
  const rehDirect = detectRehRel({ candles, currentPrice: state.lastPrice });
  assert(
    obs.reh_rel.nearest_reh_above?.level === rehDirect.nearest_reh_above?.level,
    "REH/REL filter uses same price as direct detectRehRel"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
