export type Bar = {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type FvgZone = {
  timeframe: "daily" | "15m" | "5m" | "1m";
  type: "bullish" | "bearish";
  top: number;
  bottom: number;
  formedAt: string;
  /** Unix seconds — when the gap formed (third candle close). */
  startTime?: number;
  /** True when wick/body volume imbalances expand the fair value gap zone. */
  hasVolumeImbalance?: boolean;
};

export type MarketContext = {
  symbol: string;
  fetchedAt: string;
  chartTimeEst: string | null;
  daily: {
    previousDayHigh: number;
    previousDayLow: number;
    currentDayHigh: number;
    currentDayLow: number;
    equilibrium: number;
    biasHint: "bullish" | "bearish" | "neutral";
    lastClose: number;
    /** Unix seconds — first one-minute bar of the current EST day. */
    currentDayStartTime?: number;
  };
  nwog: {
    top: number;
    bottom: number;
    weekOpen: number;
    priorWeekClose: number;
    startTime?: number;
  } | null;
  org: {
    top: number;
    bottom: number;
    ce: number;
    level25: number;
    level75: number;
    close415: number;
    open930: number;
    /** Unix seconds — 9:30 AM open bar when the gap is defined. */
    formedAtTime?: number;
  } | null;
  activeSession: {
    id: "asia" | "london" | "ny_pre" | "ny_am" | "ny_pm" | "overnight";
    label: string;
    killZone: boolean;
    amdPhase: "accumulation" | "manipulation" | "distribution" | "ranging";
    macroWindow: string | null;
    summary: string;
  };
  sessions: {
    asiaHigh: number;
    asiaLow: number;
    asiaHighTime?: number;
    asiaLowTime?: number;
    londonHigh: number;
    londonLow: number;
    londonHighTime?: number;
    londonLowTime?: number;
    nyPreHigh: number;
    nyPreLow: number;
    nyPreHighTime?: number;
    nyPreLowTime?: number;
    nyRthHigh: number;
    nyRthLow: number;
    nyRthHighTime?: number;
    nyRthLowTime?: number;
    nyPmHigh: number;
    nyPmLow: number;
    nyPmHighTime?: number;
    nyPmLowTime?: number;
  };
  timeframe15m: {
    high: number;
    low: number;
    equilibrium: number;
    biasHint: "bullish" | "bearish" | "neutral";
    unfilledFvgs: FvgZone[];
  };
  timeframe5m: {
    high: number;
    low: number;
    equilibrium: number;
    biasHint: "bullish" | "bearish" | "neutral";
    unfilledFvgs: FvgZone[];
  };
  amdPhaseHint: "accumulation" | "manipulation" | "distribution" | "ranging";
  structureFacts: {
    mss: {
      direction: "bullish" | "bearish";
      level: number;
      at: string;
      atTime: number;
      description: string;
    } | null;
    liquiditySweeps: Array<{
      levelId: string;
      label: string;
      price: number;
      side: "buy_side" | "sell_side";
      at: string;
      atTime: number;
    }>;
    m1UnfilledFvgs: FvgZone[];
    summary: string;
  };
  /** Daily / HTF PD arrays — JSON only, not drawn on 1m chart. */
  htfPdArrays: {
    ndog: {
      top: number;
      bottom: number;
      priorClose: number;
      dayOpen: number;
    } | null;
    previousDay: {
      high: number;
      low: number;
      close: number;
      open: number;
      equilibrium: number;
    };
    currentDay: {
      high: number;
      low: number;
      open: number;
      equilibrium: number;
    };
    unfilledDailyFvgs: FvgZone[];
    /** Last 3 classic daily FVGs — always drawn on chart (filled or not). */
    recentDailyFvgs: FvgZone[];
    levels: Array<{ id: string; label: string; price: number }>;
    note: string;
  };
  premiumDiscount: {
    vsCurrentDayRange: "premium" | "discount" | "equilibrium";
    vsPreviousDayRange: "premium" | "discount" | "equilibrium";
    vsNwog: "premium" | "discount" | "inside" | "n/a";
    vsNdog: "premium" | "discount" | "inside" | "n/a";
    summary: string;
  };
  biasStack: {
    daily: "bullish" | "bearish" | "neutral";
    m15: "bullish" | "bearish" | "neutral";
    m5: "bullish" | "bearish" | "neutral";
    biasConflict: boolean;
    alignedCount: number;
    dominantBias: "bullish" | "bearish" | "neutral";
    tradeableBias: "bullish" | "bearish" | "neutral" | "conflicted";
    summary: string;
    conflictPairs: string[];
  };
};
