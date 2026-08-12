import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";

export function baseCtx(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    symbol: "MNQ1!",
    fetchedAt: new Date().toISOString(),
    chartTimeEst: "10:00",
    daily: {
      previousDayHigh: 25200,
      previousDayLow: 24800,
      currentDayHigh: 25150,
      currentDayLow: 24900,
      equilibrium: 25025,
      biasHint: "bullish",
      lastClose: 25100,
    },
    nwog: null,
    org: {
      top: 25120,
      bottom: 24980,
      ce: 25050,
      level25: 25015,
      level75: 25085,
      close415: 24980,
      open930: 25120,
    },
    activeSession: {
      id: "ny_am",
      label: "NY AM",
      killZone: true,
      amdPhase: "distribution",
      macroWindow: "9:50",
      summary: "NY AM kill zone",
    },
    sessions: {
      asiaHigh: 25050,
      asiaLow: 24920,
      londonHigh: 25100,
      londonLow: 24950,
      nyPreHigh: 25120,
      nyPreLow: 24980,
      nyRthHigh: 25150,
      nyRthLow: 24900,
      nyPmHigh: 25140,
      nyPmLow: 24950,
    },
    timeframe15m: { high: 25140, low: 24920, equilibrium: 25030, biasHint: "bullish", unfilledFvgs: [] },
    timeframe5m: { high: 25130, low: 24940, equilibrium: 25035, biasHint: "bullish", unfilledFvgs: [] },
    amdPhaseHint: "distribution",
    structureFacts: {
      mss: {
        direction: "bullish",
        level: 25080,
        at: "10:05",
        atTime: 1700000000,
        description: "Bullish market structure shift above 25080",
      },
      liquiditySweeps: [
        {
          levelId: "pdl",
          label: "PDL",
          price: 24800,
          side: "sell_side",
          at: "09:45",
          atTime: 1700000000,
        },
      ],
      relativeEqualPools: [],
      m1UnfilledFvgs: [
        {
          timeframe: "1m",
          type: "bullish",
          top: 25095,
          bottom: 25085,
          formedAt: "2026-08-12",
          startTime: 1700000000,
        },
      ],
      m1InvertedFvgs: [],
      firstPresentedFvg: { nyOpening: null, postFhdr: null, activeSession: null },
      summary: "Bullish one-minute structure with unfilled gap below",
    },
    htfPdArrays: {
      ndog: null,
      previousDay: { high: 25200, low: 24800, close: 25000, open: 24950, equilibrium: 25000 },
      currentDay: { high: 25150, low: 24900, open: 25100, equilibrium: 25025 },
      unfilledDailyFvgs: [],
      recentDailyFvgs: [],
      levels: [
        { id: "pdh", label: "PDH", price: 25200 },
        { id: "pdl", label: "PDL", price: 24800 },
        { id: "pdc", label: "PDC", price: 25000 },
      ],
      note: "PD arrays from JSON",
    },
    premiumDiscount: {
      vsCurrentDayRange: "premium",
      vsPreviousDayRange: "premium",
      vsNwog: "n/a",
      vsNdog: "n/a",
      summary: "Price in premium of current and previous day range",
    },
    biasStack: {
      daily: "bullish",
      m15: "bullish",
      m5: "bullish",
      biasConflict: false,
      alignedCount: 3,
      dominantBias: "bullish",
      tradeableBias: "bullish",
      summary: "Bullish alignment on three timeframes",
      conflictPairs: [],
    },
    ...overrides,
  } as MarketContext;
}

export function baseState(overrides: Partial<MarketState> = {}): MarketState {
  const candles = Array.from({ length: 30 }, (_, i) => ({
    t: 1700000000 + i * 60,
    o: 25090 + i * 0.25,
    h: 25105 + i * 0.25,
    l: 25085 + i * 0.25,
    c: 25100 + i * 0.25,
  }));
  // Impulsive last candle for displacement detection
  candles[candles.length - 1] = {
    t: 1700000000 + 29 * 60,
    o: 25095,
    h: 25120,
    l: 25094,
    c: 25118,
  };
  return {
    symbol: "MNQ1!",
    timeframe: "1",
    lastPrice: 25100,
    lastPriceSource: "tradingview",
    updatedAt: new Date().toISOString(),
    candles,
    session: {
      id: "ny_am",
      label: "NY AM",
      high: 25150,
      low: 24900,
      open: 25100,
      nyRthHigh: 25150,
      nyRthLow: 24900,
    },
    structure: { bias: "bullish", tradeableBias: "bullish", mss: "bullish", mssLevel: 25080 },
    levels: { pdh: 25200, pdl: 24800, pdc: 25000, nearestSupport: 25000, nearestResistance: 25200 },
    drawings: [],
    fvg: [{ top: 25095, bottom: 25085, direction: "bullish" as const }],
    quality: { flag: "good", reasons: [] },
    candleHash: "abc123",
    stateHash: "bullish-wait-001",
    ...overrides,
  };
}

export const REPLAY_FIXTURES: Record<string, { ctx: MarketContext; state: MarketState }> = {
  "ny-open-long-a-plus": { ctx: baseCtx(), state: baseState({ stateHash: "ny-open-long-001" }) },
  "bullish-wait": { ctx: baseCtx(), state: baseState({ stateHash: "bullish-wait-001" }) },
  "missing-quality": {
    ctx: baseCtx(),
    state: baseState({
      stateHash: "missing-quality-001",
      quality: { flag: "missing", reasons: ["export_failed"] },
      candles: [],
    }),
  },
  "neutral-no-trade": {
    ctx: baseCtx({
      biasStack: {
        daily: "neutral",
        m15: "neutral",
        m5: "neutral",
        biasConflict: false,
        alignedCount: 0,
        dominantBias: "neutral",
        tradeableBias: "conflicted",
        summary: "No edge",
        conflictPairs: [],
      },
      structureFacts: {
        ...baseCtx().structureFacts,
        mss: null,
        m1UnfilledFvgs: [],
        liquiditySweeps: [],
        summary: "No structure",
      },
    }),
    state: baseState({ stateHash: "neutral-no-trade-001" }),
  },
  "bearish-wait": {
    ctx: baseCtx({
      biasStack: {
        daily: "bearish",
        m15: "bearish",
        m5: "bearish",
        biasConflict: false,
        alignedCount: 3,
        dominantBias: "bearish",
        tradeableBias: "bearish",
        summary: "Bearish alignment",
        conflictPairs: [],
      },
      structureFacts: {
        ...baseCtx().structureFacts,
        mss: {
          direction: "bearish",
          level: 25120,
          at: "10:05",
          atTime: 1700000000,
          description: "Bearish MSS below 25120",
        },
        m1UnfilledFvgs: [
          {
            timeframe: "1m",
            type: "bearish",
            top: 25110,
            bottom: 25100,
            formedAt: "2026-08-12",
            startTime: 1700000000,
          },
        ],
      },
    }),
    state: baseState({
      stateHash: "bearish-wait-001",
      lastPrice: 25095,
      structure: { bias: "bearish", tradeableBias: "bearish", mss: "bearish", mssLevel: 25120 },
    }),
  },
  "similar-but-skip": {
    ctx: baseCtx({
      structureFacts: {
        ...baseCtx().structureFacts,
        m1UnfilledFvgs: [
          {
            timeframe: "1m",
            type: "bullish",
            top: 25095,
            bottom: 25085,
            formedAt: "2026-08-12",
            startTime: 1700000000,
          },
        ],
        liquiditySweeps: [],
      },
    }),
    state: baseState({ stateHash: "similar-skip-001" }),
  },
};
