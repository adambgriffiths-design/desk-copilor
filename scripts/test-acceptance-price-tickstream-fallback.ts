/**
 * Acceptance #1 — TickStream price fallback when TV bridge broken.
 * Run: npm run test:acceptance-price-tickstream
 */
import {
  LIVE_PRICE_MAX_AGE_MS,
  formatAuthoritativePriceAnswer,
  isAuthoritativeLiveAvailable,
  isTickstreamLiveSource,
} from "../lib/chart-live-price";
import { resolveApiDataQuality } from "../lib/api-data-quality";
import { buildMarketState } from "../lib/market-state-build";
import { buildMarketObservation } from "../lib/observation-engine";
import { buildObservationFacts } from "../lib/observation-facts";
import { buildMarketInterpretation } from "../lib/interpretation-engine";
import {
  needsTickstreamFallback,
  maybeResolveTickstreamFallback,
} from "../lib/tickstream/stream-snapshot";
import { loadTickstreamApiKey } from "../lib/tickstream/quote";
import type { MarketContext } from "../lib/types";

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
      firstPresentedFvg: { nyOpening: null, postFhdr: null, activeSession: null },
    },
    premiumDiscount: {
      vsCurrentDayRange: "equilibrium",
      vsPreviousDayRange: "equilibrium",
    },
    activeSession: { id: "ny_am", label: "NY AM", killZone: false, amdPhase: "m", macroWindow: null },
    org: null,
    fetchedAt: new Date().toISOString(),
  }) as MarketContext;

console.log("=== needsTickstreamFallback (unit) ===");

assert(
  needsTickstreamFallback({
    chartLastPrice: null,
    chartExportFailed: true,
    barClose: 25000,
  }),
  "export_failed + no TV price triggers fallback"
);

assert(
  !needsTickstreamFallback({
    chartLastPrice: null,
    barClose: 25000,
  }),
  "no snapshot + no TV does not trigger fallback alone"
);

assert(
  !needsTickstreamFallback({
    chartLastPrice: 25100.25,
    chartLastPriceSource: "tradingview_live",
    chartLastPriceTs: Date.now() - 2000,
    chartSnapshot: { ok: true, candles: [{ t: 1, o: 1, h: 1, l: 1, c: 1 }], drawings: [], source: "tv" },
  }),
  "fresh TV live skips fallback"
);

console.log("\n=== formatAuthoritativePriceAnswer ===");

{
  const spoken = formatAuthoritativePriceAnswer(25100.25, {
    value: 25100.25,
    source: "tickstream_live",
    timestamp: Date.now() - 5000,
    ageMs: 5000,
  });
  assert(/tickstream_live/.test(spoken), "spoken includes tickstream source");
  assert(/5s ago/.test(spoken), "spoken includes age");
}

console.log("\n=== api data quality with tickstream auth ===");

{
  const ctx = mkCtx(25100.25);
  const auth = {
    value: 25100.25,
    source: "tickstream_live" as const,
    timestamp: Date.now() - 3000,
    ageMs: 3000,
  };
  const state = buildMarketState({
    ctx,
    chartLastPrice: auth.value,
    chartLastPriceSource: auth.source,
    chartLastPriceTs: auth.timestamp,
    authoritativePrice: auth,
  });
  const observation = buildMarketObservation(ctx, state);
  const intel = {
    ctx,
    state,
    observation,
    interpretation: buildMarketInterpretation(observation),
    facts: buildObservationFacts(ctx, state, observation),
    built_at: new Date().toISOString(),
    state_hash: state.stateHash,
    authoritativePrice: auth,
  };
  const dq = resolveApiDataQuality(intel, null, undefined);
  assert(dq.dataQuality === "LIVE", "tickstream-only price returns LIVE dataQuality");
  assert(dq.canDecide, "tickstream-only price canDecide");
}

console.log("\n=== live TickStream fallback (optional) ===");

async function maybeRunLiveTickstreamCheck(): Promise<void> {
  const apiKey = loadTickstreamApiKey();
  if (!apiKey) {
    console.log("  SKIP live TickStream — TICKSTREAM_API_KEY not set");
    return;
  }
  const auth = await maybeResolveTickstreamFallback({
    chartLastPrice: null,
    chartExportFailed: true,
    chartSnapshot: {
      ok: false,
      candles: [],
      drawings: [],
      source: "none",
      reason: "export_failed",
    },
    barClose: 25000,
  });
  if (auth) {
    assert(isTickstreamLiveSource(auth.source), "live fallback source is tickstream");
    assert(auth.ageMs <= LIVE_PRICE_MAX_AGE_MS, `lag ${auth.ageMs}ms within ${LIVE_PRICE_MAX_AGE_MS}ms`);
    assert(isAuthoritativeLiveAvailable(auth), "authoritative live available");
    console.log(
      `  live price=${auth.value} source=${auth.source} ageMs=${auth.ageMs} ts=${new Date(auth.timestamp).toISOString()}`
    );
  } else {
    console.log("  SKIP live TickStream — market closed or API unreachable");
  }
}

void maybeRunLiveTickstreamCheck()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
