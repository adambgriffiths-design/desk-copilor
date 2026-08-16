/**
 * PIT-safe liquidity map stamp unit tests.
 * Run: npx tsx scripts/test-liquidity-map-stamp-features.ts
 *
 * Representation only — no outcomes, no unlock, no detector changes.
 */
import {
  LIQUIDITY_MAP_REPRESENTATION_VERSION,
  LIQUIDITY_MAP_EXTRA_NAMED_IDS,
  liquidityMapStructureCoverage,
  stampLiquidityMapFromEvidence,
  stampLiquidityMapFromObsAndContext,
} from "../lib/liquidity-map-stamp-features";
import { LIQUIDITY_REPRESENTATION_VERSION } from "../lib/liquidity-stamp-features";
import type { ReadonlyMarketObservation } from "../lib/desk-schema";
import type { MarketContext } from "../lib/types";
import type { LiquidityArea } from "../lib/research/eqh-eql-liquidity";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function minimalObs(
  overrides: Partial<ReadonlyMarketObservation> = {}
): ReadonlyMarketObservation {
  return {
    market_structure: "unclear",
    liquidity: {
      levels: [
        {
          id: "pdh",
          label: "PDH",
          price: 21000,
          taken: false,
          status: "UNTOUCHED",
          side: "buy_side",
          source: "cme_session_1m",
          formedAt: 1_700_000_000,
        },
        {
          id: "asia_high",
          label: "Asia high",
          price: 20950,
          taken: false,
          status: "UNTOUCHED",
          side: "buy_side",
          source: "session_1m",
          formedAt: 1_700_000_100,
        },
      ],
    },
    displacement: "absent",
    fvg: { status: "absent" },
    order_block: "irrelevant",
    premium_discount: { zone: "equilibrium", price_location: "mid" },
    htf_bias: {
      daily: "bullish",
      m15: "bullish",
      m5: "bullish",
      aligned: true,
      tradeable_bias: "bullish",
    },
    session: "ny",
    time_context: "NY AM",
    data_quality: "good",
    reh_rel: {
      status: "known",
      nearest_reh_above: null,
      nearest_rel_below: null,
      reh_levels: [],
      rel_levels: [],
      all_levels: [
        {
          id: "reh_1",
          type: "reh",
          level: 21050,
          range: { low: 21048, high: 21050 },
          sourceSwingPrices: [21048, 21050],
          sourceSwingTimestamps: [1_700_000_200, 1_700_000_260],
          timeframe: "1m",
          currentPriceAtDetection: 20980,
          distanceFromCurrentPrice: 70,
          confirmationStatus: "confirmed",
          status: "active",
        },
        {
          id: "rel_1",
          type: "rel",
          level: 20900,
          range: { low: 20900, high: 20902 },
          sourceSwingPrices: [20900, 20902],
          sourceSwingTimestamps: [1_700_000_300, 1_700_000_360],
          timeframe: "1m",
          currentPriceAtDetection: 20980,
          distanceFromCurrentPrice: 80,
          confirmationStatus: "confirmed",
          status: "active",
        },
      ],
    },
    evidence: {},
    state_hash: "test",
    ...overrides,
  } as ReadonlyMarketObservation;
}

function minimalCtx(overrides: Partial<MarketContext> = {}): MarketContext {
  const base = {
    symbol: "MNQ1!",
    fetchedAt: "2024-01-02T15:00:00.000Z",
    chartTimeEst: null,
    daily: {
      previousDayHigh: 21000,
      previousDayLow: 20800,
      currentDayHigh: 20990,
      currentDayLow: 20850,
      equilibrium: 20900,
      biasHint: "bullish" as const,
      lastClose: 20980,
      pdhSource: "cme_session_1m" as const,
    },
    nwog: {
      top: 20750,
      bottom: 20720,
      weekOpen: 20750,
      priorWeekClose: 20720,
      startTime: 1_699_900_000,
    },
    org: {
      top: 20810,
      bottom: 20790,
      ce: 20800,
      level25: 20795,
      level75: 20805,
      close415: 20790,
      open930: 20810,
      formedAtTime: 1_700_010_000,
    },
    activeSession: {
      id: "ny_am" as const,
      label: "NY AM",
      killZone: true,
      amdPhase: "manipulation" as const,
      macroWindow: null,
      summary: "test",
    },
    sessions: {
      asiaHigh: 20950,
      asiaLow: 20880,
      londonHigh: 20970,
      londonLow: 20890,
      nyPreHigh: 20985,
      nyPreLow: 20920,
      nyPreHighTime: 1_700_020_000,
      nyPreLowTime: 1_700_015_000,
      nyRthHigh: 20990,
      nyRthLow: 20910,
      nyPmHigh: 0,
      nyPmLow: 0,
    },
    timeframe15m: {
      high: 21000,
      low: 20800,
      equilibrium: 20900,
      biasHint: "bullish" as const,
      unfilledFvgs: [],
    },
    timeframe5m: {
      high: 20995,
      low: 20850,
      equilibrium: 20922,
      biasHint: "bullish" as const,
      unfilledFvgs: [],
    },
    amdPhaseHint: "manipulation" as const,
    structureFacts: {
      mss: null,
      liquiditySweeps: [],
      levelInteractions: [
        {
          levelId: "ny_pre_high",
          status: "TOUCHED" as const,
          why: "wick test",
          atTime: 1_700_030_000,
          candleId: "c1",
          tickPrice: 20985.25,
        },
      ],
      relativeEqualPools: [
        {
          price: 21040,
          type: "reh" as const,
          startTime: 1_700_040_000,
          barCount: 3,
        },
      ],
      m1UnfilledFvgs: [],
      m1InvertedFvgs: [],
      firstPresentedFvg: {
        nyOpening: null,
        postFhdr: null,
        activeSession: null,
      },
      summary: "test",
    },
    htfPdArrays: {
      ndog: {
        top: 20850,
        bottom: 20830,
        priorClose: 20830,
        dayOpen: 20850,
      },
      previousDay: {
        high: 21000,
        low: 20800,
        close: 20900,
        open: 20850,
        equilibrium: 20900,
      },
      currentDay: {
        high: 20990,
        low: 20850,
        open: 20850,
        equilibrium: 20920,
      },
      unfilledDailyFvgs: [],
      recentDailyFvgs: [],
      levels: [],
      note: "test",
    },
    premiumDiscount: {
      vsCurrentDayRange: "equilibrium" as const,
      vsPreviousDayRange: "equilibrium" as const,
      vsNwog: "n/a" as const,
      vsNdog: "n/a" as const,
      summary: "test",
    },
    biasStack: {
      daily: "bullish" as const,
      m15: "bullish" as const,
      m5: "bullish" as const,
      biasConflict: false,
      alignedCount: 3,
      dominantBias: "bullish" as const,
      tradeableBias: "bullish" as const,
      summary: "test",
      conflictPairs: [],
    },
    ...overrides,
  };
  return base as MarketContext;
}

function sampleEqhArea(): LiquidityArea {
  return {
    id: "eqh_area_1",
    type: "BUY_SIDE",
    priceLow: 21060,
    priceHigh: 21065,
    representativeLevel: 21062.5,
    contributingSwings: [],
    formationTime: 1_700_050_000,
    confirmationTime: 1_700_050_120,
    status: "active",
    structuralContext: "test",
    visualClass: "A",
    confidence: "HIGH",
    whyMeaningful: "clustered highs",
    whyNotNearby: "n/a",
    liquidityLayer: "RELATIVE",
    liquidityRole: "PRIMARY",
    whyImportant: "test",
  };
}

// --- 1. obs levels + extras from context ---
{
  const stamp = stampLiquidityMapFromObsAndContext({
    obs: minimalObs(),
    ctx: minimalCtx(),
  });
  assert(
    stamp.liquidityMapRepresentationVersion === LIQUIDITY_MAP_REPRESENTATION_VERSION,
    "map version"
  );
  assert(
    stamp.liquidityRepresentationVersion === LIQUIDITY_REPRESENTATION_VERSION,
    "keeps liquidity_repr_v1"
  );
  assert(stamp.liquidityLevels.length === 2, "liquidityLevels from obs only");
  assert(
    stamp.liquidityPools.some((p) => p.id === "pdh" && p.detector === "obs_levels"),
    "pdh from obs"
  );
  assert(
    stamp.liquidityPools.some((p) => p.id === "ny_pre_high"),
    "ny_pre_high stamped"
  );
  assert(
    stamp.liquidityPools.some((p) => p.id === "ny_pre_low"),
    "ny_pre_low stamped"
  );
  assert(
    stamp.liquidityPools.some((p) => p.id === "org_top"),
    "org_top stamped"
  );
  assert(
    stamp.liquidityPools.some((p) => p.id === "org_bottom"),
    "org_bottom stamped"
  );
  assert(
    stamp.liquidityPools.some((p) => p.id === "org_ce"),
    "org_ce stamped"
  );
  assert(
    stamp.liquidityPools.some((p) => p.id === "ndog_top"),
    "ndog_top stamped"
  );
  assert(
    stamp.liquidityPools.some((p) => p.id === "nwog_bot"),
    "nwog_bot stamped"
  );
  assert(
    stamp.liquidityPools.some((p) => p.kind === "gap_band" && p.id === "ndog_band"),
    "ndog gap_band"
  );
  assert(
    stamp.liquidityPools.some((p) => p.detector === "reh_rel" && p.id === "reh_1"),
    "REH from obs.reh_rel"
  );
  assert(
    stamp.liquidityPools.some((p) => p.detector === "reh_rel" && p.id === "rel_1"),
    "REL from obs.reh_rel"
  );
  assert(
    stamp.liquidityPools.some((p) => p.detector === "relativeEqualPools"),
    "relativeEqualPools stamped distinctly"
  );
  const nyPre = stamp.liquidityPools.find((p) => p.id === "ny_pre_high")!;
  assert(nyPre.status === "TOUCHED", "ny_pre interaction status preserved");
  assert(nyPre.qualifyingTickAt === 1_700_030_000, "qualifying tick preserved");
  assert(nyPre.formedAt === 1_700_020_000, "ny_pre formedAt from sessions");
}

// --- 2. missing context → omit honestly ---
{
  const stamp = stampLiquidityMapFromObsAndContext({
    obs: minimalObs({
      reh_rel: {
        status: "unknown",
        nearest_reh_above: null,
        nearest_rel_below: null,
        reh_levels: [],
        rel_levels: [],
        all_levels: [],
      },
    }),
    ctx: null,
  });
  assert(
    !stamp.liquidityPools.some((p) =>
      (LIQUIDITY_MAP_EXTRA_NAMED_IDS as readonly string[]).includes(p.id)
    ),
    "no invented extras without ctx"
  );
  assert(
    !stamp.liquidityPools.some((p) => p.detector === "reh_rel"),
    "no reh when status unknown"
  );
  assert(
    !stamp.liquidityPools.some((p) => p.detector === "eqh_eql"),
    "no invented EQH"
  );
}

// --- 3. EQH/EQL when provided ---
{
  const stamp = stampLiquidityMapFromObsAndContext({
    obs: minimalObs(),
    ctx: minimalCtx(),
    eqhAreas: [sampleEqhArea()],
  });
  const eqh = stamp.liquidityPools.find((p) => p.detector === "eqh_eql");
  assert(eqh != null, "EQH area stamped");
  assert(eqh!.kind === "equal_area", "equal_area kind");
  assert(eqh!.representativeLevel === 21062.5, "representativeLevel");
  assert(eqh!.side === "buy_side", "EQH buy_side");
}

// --- 4. evidence path passthrough ---
{
  const fromObs = stampLiquidityMapFromObsAndContext({
    obs: minimalObs(),
    ctx: minimalCtx(),
    eqhAreas: [sampleEqhArea()],
  });
  const fromEv = stampLiquidityMapFromEvidence({
    liquidityLevels: fromObs.liquidityLevels,
    liquidityPools: fromObs.liquidityPools,
  });
  assert(
    fromEv.liquidityPoolCount === fromObs.liquidityPoolCount,
    "evidence pool count matches"
  );
  assert(
    JSON.stringify(fromEv.liquidityPools) === JSON.stringify(fromObs.liquidityPools),
    "evidence pools deterministic passthrough"
  );
}

// --- 5. coverage helper + determinism ---
{
  const a = stampLiquidityMapFromObsAndContext({
    obs: minimalObs(),
    ctx: minimalCtx(),
    eqhAreas: [sampleEqhArea()],
  });
  const b = stampLiquidityMapFromObsAndContext({
    obs: minimalObs(),
    ctx: minimalCtx(),
    eqhAreas: [sampleEqhArea()],
  });
  assert(
    JSON.stringify(a.liquidityPools) === JSON.stringify(b.liquidityPools),
    "deterministic stamp"
  );
  const cov = liquidityMapStructureCoverage(a.liquidityPools);
  assert(cov.ny_pre && cov.org && cov.gaps && cov.reh_rel && cov.eqh_eql, "coverage flags");
}

console.log(
  JSON.stringify({
    ok: true,
    version: LIQUIDITY_MAP_REPRESENTATION_VERSION,
    tests: 5,
  })
);
