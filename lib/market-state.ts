/** Canonical market state — single object AI paths reason over. */

import type { ChartCandle, ChartQuality, ChartSnapshotPayload } from "./chart-snapshot";

export type MarketStateDrawing = {
  type: string;
  price?: number;
  top?: number;
  bottom?: number;
  label?: string;
};

export type MarketStateFvg = {
  top: number;
  bottom: number;
  direction: "bullish" | "bearish";
  timeframe?: string;
  inverted?: boolean;
};

export type MarketState = {
  symbol: string;
  timeframe: string;
  lastPrice: number;
  lastPriceSource: "tradingview" | "yahoo" | "tickstream";
  updatedAt: string;
  candles: ChartCandle[];
  session: {
    id: string;
    label: string;
    high: number;
    low: number;
    open: number;
    nyRthHigh: number;
    nyRthLow: number;
  };
  structure: {
    bias: string;
    tradeableBias: string;
    mss?: string;
    mssLevel?: number;
    summary?: string;
  };
  levels: {
    pdh: number;
    pdl: number;
    pdc: number;
    /** cme_session_1m = last Globex 1m close; yahoo_daily_fallback = settlement/calendar. */
    pdcSource?: "cme_session_1m" | "yahoo_daily_fallback";
    /** Unix seconds — PDC source candle. */
    pdcFormedAt?: number;
    nearestSupport?: number;
    nearestSupportLabel?: string;
    nearestResistance?: number;
    nearestResistanceLabel?: string;
    orgTop?: number;
    orgBottom?: number;
    orgCe?: number;
  };
  drawings: MarketStateDrawing[];
  fvg: MarketStateFvg[];
  quality: {
    flag: ChartQuality;
    reasons: string[];
    timestampDriftSec?: number;
    lastBarTime?: number;
  };
  candleHash: string;
  stateHash: string;
  snapshotId?: string;
  priceAgreement?: {
    tv?: { value: number; timestamp?: number | null; source: string };
    backend: { value: number; source: string };
    marketState: { value: number; source: string };
    agree: boolean;
    difference: number;
  };
};

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildCandleHash(candles: ChartCandle[]): string {
  if (!candles.length) return "empty";
  const first = candles[0];
  const last = candles[candles.length - 1];
  return simpleHash(`${candles.length}|${first.t}|${last.t}|${last.c.toFixed(2)}`);
}

export function buildStateHash(state: Pick<MarketState, "candleHash" | "lastPrice" | "quality">): string {
  return simpleHash(`${state.candleHash}|${state.lastPrice.toFixed(2)}|${state.quality.flag}`);
}

export function isMarketStateUsable(state: MarketState | null | undefined): boolean {
  if (!state) return false;
  return state.quality.flag === "good" || state.quality.flag === "degraded";
}

/** Truncated JSON for model prompt — analyze ONLY this object. */
export function formatMarketStateForPrompt(state: MarketState): string {
  const recentCandles = state.candles.slice(-60);
  const payload = {
    symbol: state.symbol,
    timeframe: state.timeframe,
    lastPrice: state.lastPrice,
    lastPriceSource: state.lastPriceSource,
    updatedAt: state.updatedAt,
    quality: state.quality,
    session: state.session,
    structure: state.structure,
    levels: state.levels,
    drawings: state.drawings.slice(0, 30),
    fvg: state.fvg.slice(0, 8),
    candles: recentCandles,
    candleHash: state.candleHash,
    stateHash: state.stateHash,
    snapshotId: state.snapshotId,
    priceAgreement: state.priceAgreement,
  };
  return [
    "=== MARKET_STATE (analyze ONLY this object — do not invent prices or levels not listed) ===",
    JSON.stringify(payload),
    "Step-by-step: (1) price action from candles (2) structure/bias from structure + levels (3) nearest levels/FVGs (4) directional call with confidence 0-100 in META.",
  ].join("\n");
}

/** Compact summary for reasoning I/O logs — no full candle dump. */
export function summarizeMarketStateForLog(state: MarketState): {
  stateHash: string;
  candleHash: string;
  quality: ChartQuality;
  reasons: string[];
  candleCount: number;
  lastPrice: number;
  lastBarTime?: number;
  keyLevels: string[];
} {
  const keys: string[] = [];
  if (state.levels.nearestSupport != null) {
    keys.push(`support@${state.levels.nearestSupport.toFixed(1)}`);
  }
  if (state.levels.nearestResistance != null) {
    keys.push(`resistance@${state.levels.nearestResistance.toFixed(1)}`);
  }
  keys.push(`pdh@${state.levels.pdh.toFixed(1)}`, `pdl@${state.levels.pdl.toFixed(1)}`);
  for (const d of state.drawings.slice(0, 4)) {
    if (d.price != null) keys.push(`${d.label || d.type}@${d.price.toFixed(1)}`);
  }
  return {
    stateHash: state.stateHash,
    candleHash: state.candleHash,
    quality: state.quality.flag,
    reasons: state.quality.reasons,
    candleCount: state.candles.length,
    lastPrice: state.lastPrice,
    lastBarTime: state.quality.lastBarTime,
    keyLevels: keys.slice(0, 8),
  };
}

export function parseMarketStateInput(value: unknown): MarketState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.symbol !== "string" || typeof raw.lastPrice !== "number") return null;
  if (!raw.quality || typeof raw.quality !== "object") return null;
  const q = raw.quality as Record<string, unknown>;
  if (typeof q.flag !== "string") return null;
  return raw as unknown as MarketState;
}
