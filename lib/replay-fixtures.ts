import type { MarketContext, Bar } from "./types";
import type { MarketState } from "./market-state";
import type { ChartCandle } from "./chart-snapshot";
import { buildStructureFacts } from "./structure";

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
    snapshotId: "ms_bullish-wait-001",
    ...overrides,
  };
}


function mkCandle(t: number, o: number, h: number, l: number, c: number): ChartCandle {
  return { t, o, h, l, c };
}

function padQuietCandles(n: number, startPrice: number, t0: number): ChartCandle[] {
  const bars: ChartCandle[] = [];
  for (let i = 0; i < n; i++) {
    const p = startPrice + i * 0.25;
    bars.push(mkCandle(t0 + i * 60, p, p + 0.5, p - 0.5, p + 0.125));
  }
  return bars;
}

function swingHighCandles(highs: number[], baseT: number): ChartCandle[] {
  const bars: ChartCandle[] = [];
  let t = baseT;
  for (const peak of highs) {
    bars.push(mkCandle(t, peak - 10, peak - 3, peak - 12, peak - 8));
    t += 60;
    bars.push(mkCandle(t, peak - 8, peak, peak - 10, peak - 4));
    t += 60;
    bars.push(mkCandle(t, peak - 4, peak - 3, peak - 12, peak - 9));
    t += 60;
  }
  const last = highs[highs.length - 1];
  bars.push(mkCandle(t, last - 20, last - 18, last - 22, last - 20));
  return bars;
}

/** ≥20 candles; wing-2 swing high @ 21005; close 21007 for bullish MSS + FVG present. */
export function chartProofMssCandles(): ChartCandle[] {
  const t0 = 1_700_000_000;
  const bars = padQuietCandles(16, 20970, t0);
  let t = t0 + 16 * 60;
  bars.push(mkCandle(t, 20995, 20998, 20993, 20996)); t += 60;
  bars.push(mkCandle(t, 20996, 21000, 20994, 20998)); t += 60;
  bars.push(mkCandle(t, 20998, 21005, 20997, 21002)); t += 60;
  bars.push(mkCandle(t, 21002, 21003, 20996, 20998)); t += 60;
  bars.push(mkCandle(t, 20998, 21000, 20994, 20996)); t += 60;
  bars.push(mkCandle(t, 20996, 21010, 20995, 21007)); t += 60;
  bars.push(mkCandle(t, 21007, 21009, 21005, 21007));
  return bars;
}

/** REH pool 29887 / 29886.25 above price 29807.25. */
export function chartProofRehCandles(): ChartCandle[] {
  const t0 = 1_700_100_000;
  const pad = padQuietCandles(14, 29780, t0);
  const highs = swingHighCandles([29887.0, 29886.25], t0 + 14 * 60);
  const merged = [...pad, ...highs];
  const last = merged.at(-1)!;
  merged.push(mkCandle(last.t + 60, 29850, 29855, 29800, 29807.25));
  return merged;
}

/** Bullish unfilled FVG 21000–21005; no MSS. */
export function chartProofFvgCandles(): ChartCandle[] {
  const t0 = 1_700_200_000;
  const bars = padQuietCandles(16, 20970, t0);
  let t = t0 + 16 * 60;
  bars.push(mkCandle(t, 20998, 21000, 20996, 20999)); t += 60;
  bars.push(mkCandle(t, 20999, 21008, 20998, 21006)); t += 60;
  bars.push(mkCandle(t, 21006, 21012, 21005, 21010)); t += 60;
  bars.push(mkCandle(t, 21010, 21020, 21008, 21015));
  return bars;
}

function chartProofBaseState(
  candles: ChartCandle[],
  lastPrice: number,
  stateHash: string,
): MarketState {
  return baseState({
    stateHash,
    lastPrice,
    candles,
    fvg: [],
    structure: { bias: "neutral", tradeableBias: "neutral" },
    levels: {
      pdh: lastPrice + 100,
      pdl: lastPrice - 100,
      pdc: lastPrice,
      nearestSupport: lastPrice - 50,
      nearestResistance: lastPrice + 50,
    },
  });
}

function chartCandlesToBars(candles: ChartCandle[]): Bar[] {
  return candles.map((c) => ({
    time: new Date(c.t * 1000),
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
  }));
}

/**
 * Rebuild structureFacts (and safe PD liquidity levels) from OHLC candles.
 * Used by observation chart-proof harness so detection is proven from price action.
 */
export function rebuildCtxFromCandles(
  _fixtureId: string,
  fixture: { ctx: MarketContext; state: MarketState },
): MarketContext {
  const candles = fixture.state.candles;
  const bars = chartCandlesToBars(candles);
  const price = fixture.state.lastPrice;
  const levels = [
    { id: "pdh", label: "PDH", price: price + 100 },
    { id: "pdl", label: "PDL", price: price - 100 },
    { id: "pdc", label: "PDC", price },
  ];
  const asOf = bars.at(-1)?.time ?? new Date();
  const sessionId = fixture.ctx.activeSession?.id ?? "ny_am";
  const facts = buildStructureFacts(bars, levels, asOf, sessionId);
  return {
    ...fixture.ctx,
    daily: {
      ...fixture.ctx.daily,
      previousDayHigh: price + 100,
      previousDayLow: price - 100,
      currentDayHigh: candles.length ? Math.max(...candles.map((c) => c.h)) : price,
      currentDayLow: candles.length ? Math.min(...candles.map((c) => c.l)) : price,
      lastClose: price,
      equilibrium: price,
    },
    htfPdArrays: {
      ...fixture.ctx.htfPdArrays,
      levels,
      previousDay: {
        high: price + 100,
        low: price - 100,
        close: price,
        open: price - 20,
        equilibrium: price,
      },
    },
    structureFacts: facts,
  };
}

const emptyStructurePlaceholder: MarketContext["structureFacts"] = {
  mss: null,
  liquiditySweeps: [],
  relativeEqualPools: [],
  m1UnfilledFvgs: [],
  m1InvertedFvgs: [],
  fhdr: null,
  firstPresentedFvg: { nyOpening: null, postFhdr: null, activeSession: null },
  summary: "placeholder — rebuilt from OHLC in proof harness",
};

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

  "chart-proof-mss-bullish": {
    ctx: baseCtx({
      biasStack: {
        daily: "neutral",
        m15: "neutral",
        m5: "neutral",
        biasConflict: false,
        alignedCount: 0,
        dominantBias: "neutral",
        tradeableBias: "neutral",
        summary: "Neutral — MSS drives structure field",
        conflictPairs: [],
      },
      structureFacts: { ...emptyStructurePlaceholder },
    }),
    state: chartProofBaseState(chartProofMssCandles(), 21007, "chart-proof-mss-001"),
  },
  "chart-proof-reh-above": {
    ctx: baseCtx({
      structureFacts: { ...emptyStructurePlaceholder },
    }),
    state: chartProofBaseState(chartProofRehCandles(), 29807.25, "chart-proof-reh-001"),
  },
  "chart-proof-fvg-present": {
    ctx: baseCtx({
      structureFacts: { ...emptyStructurePlaceholder },
    }),
    state: chartProofBaseState(chartProofFvgCandles(), 21015, "chart-proof-fvg-001"),
  },
};
