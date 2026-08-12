/**
 * REH / REL detection for the observation engine — OHLC swing clustering,
 * current-price-relative filtering, candle-close crossing semantics.
 *
 * Tolerance (MNQ): max(2, min(4, referencePrice × 0.001)) points.
 * Example @ 29807: tol = 4; highs 29887.00 & 29886.25 → diff 0.75 ≤ 4 → REH ✓
 */
import type { ChartCandle } from "./chart-snapshot";
import { requiresCandleClose } from "./confirmation-policy";
import { REH_REL_PRICE_EPS } from "./drawing-levels";
import { rehRelTolerance } from "./structure";

export type RehRelLevelStatus = "active" | "swept" | "unknown";
export type RehRelConfirmationStatus = "confirmed" | "unknown";

export type RehRelLevel = {
  /** Stable id — liquidity.reh.{level} or liquidity.rel.{level} */
  id: string;
  type: "reh" | "rel";
  /** Consolidated liquidity price — max high (REH) or min low (REL). */
  level: number;
  range: { low: number; high: number };
  sourceSwingPrices: number[];
  sourceSwingTimestamps: number[];
  timeframe: string;
  currentPriceAtDetection: number;
  /** Signed distance: REH = level − price (positive above); REL = price − level (positive below). */
  distanceFromCurrentPrice: number;
  confirmationStatus: RehRelConfirmationStatus;
  status: RehRelLevelStatus;
};

export type RehRelObservation = {
  status: "known" | "unknown";
  nearest_reh_above: RehRelLevel | null;
  nearest_rel_below: RehRelLevel | null;
  /** Active REH pools above price, nearest first. */
  reh_levels: RehRelLevel[];
  /** Active REL pools below price, nearest first. */
  rel_levels: RehRelLevel[];
  /** All detected pools including swept — ranked by proximity at detection. */
  all_levels: RehRelLevel[];
};

type SwingPoint = {
  type: "high" | "low";
  price: number;
  time: number;
};

const DEFAULT_WING = 1;
const MIN_CANDLES = DEFAULT_WING * 2 + 3;

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

/** 3-bar swing: center extreme strictly beats left and right neighbors (candle-close OHLC). */
export function findConfirmedSwings(candles: ChartCandle[], wing = DEFAULT_WING): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = wing; i < candles.length - wing; i++) {
    const bar = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= wing; j++) {
      if (candles[i - j].h >= bar.h || candles[i + j].h >= bar.h) isHigh = false;
      if (candles[i - j].l <= bar.l || candles[i + j].l <= bar.l) isLow = false;
    }
    if (isHigh) swings.push({ type: "high", price: bar.h, time: bar.t });
    if (isLow) swings.push({ type: "low", price: bar.l, time: bar.t });
  }
  return swings;
}

/** Group swings whose pairwise diff ≤ rehRelTolerance(midpoint). Requires ≥ 2 members. */
export function groupEqualSwings(swings: SwingPoint[], referencePrice: number): SwingPoint[][] {
  if (swings.length < 2) return [];
  const tol = rehRelTolerance(referencePrice);
  const parent = swings.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number): void {
    parent[find(a)] = find(b);
  }

  for (let i = 0; i < swings.length; i++) {
    for (let j = i + 1; j < swings.length; j++) {
      const mid = (swings[i].price + swings[j].price) / 2;
      if (Math.abs(swings[i].price - swings[j].price) <= rehRelTolerance(mid)) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, SwingPoint[]>();
  for (let i = 0; i < swings.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(swings[i]);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

function poolLevel(type: "reh" | "rel", prices: number[]): number {
  return type === "reh" ? Math.max(...prices) : Math.min(...prices);
}

function crossingStatus(
  type: "reh" | "rel",
  level: number,
  currentPrice: number,
  lastClose: number | undefined
): RehRelLevelStatus {
  if (!requiresCandleClose("liquidity_sweep") || lastClose == null) {
    if (type === "reh" && currentPrice >= level - REH_REL_PRICE_EPS) return "swept";
    if (type === "rel" && currentPrice <= level + REH_REL_PRICE_EPS) return "swept";
    return "active";
  }
  if (type === "reh" && lastClose > level) return "swept";
  if (type === "rel" && lastClose < level) return "swept";
  return "active";
}

function buildLevel(
  type: "reh" | "rel",
  group: SwingPoint[],
  currentPrice: number,
  timeframe: string,
  lastClose: number | undefined
): RehRelLevel {
  const prices = group.map((s) => roundMnq(s.price));
  const level = roundMnq(poolLevel(type, prices));
  const range = { low: roundMnq(Math.min(...prices)), high: roundMnq(Math.max(...prices)) };
  const distanceFromCurrentPrice =
    type === "reh"
      ? roundMnq(level - currentPrice)
      : roundMnq(currentPrice - level);
  const status = crossingStatus(type, level, currentPrice, lastClose);
  const priceKey = level.toFixed(2).replace(".", "_");

  return {
    id: `liquidity.${type}.${priceKey}`,
    type,
    level,
    range,
    sourceSwingPrices: prices,
    sourceSwingTimestamps: group.map((s) => s.time),
    timeframe,
    currentPriceAtDetection: roundMnq(currentPrice),
    distanceFromCurrentPrice,
    confirmationStatus: "confirmed",
    status,
  };
}

function isAbovePrice(level: RehRelLevel, currentPrice: number): boolean {
  return level.type === "reh" && level.level >= currentPrice + REH_REL_PRICE_EPS;
}

function isBelowPrice(level: RehRelLevel, currentPrice: number): boolean {
  return level.type === "rel" && level.level <= currentPrice - REH_REL_PRICE_EPS;
}

function rankByProximity(levels: RehRelLevel[]): RehRelLevel[] {
  return [...levels].sort((a, b) => a.distanceFromCurrentPrice - b.distanceFromCurrentPrice);
}

export type DetectRehRelInput = {
  candles: ChartCandle[];
  currentPrice: number;
  timeframe?: string;
  wing?: number;
  lookback?: number;
};

/** Detect REH/REL pools from OHLC candles relative to currentPrice. */
export function detectRehRel(input: DetectRehRelInput): RehRelObservation {
  const empty: RehRelObservation = {
    status: "unknown",
    nearest_reh_above: null,
    nearest_rel_below: null,
    reh_levels: [],
    rel_levels: [],
    all_levels: [],
  };

  const { candles, currentPrice, timeframe = "1m", wing = DEFAULT_WING } = input;
  const lookback = input.lookback ?? 120;

  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    candles.length < MIN_CANDLES
  ) {
    return empty;
  }

  const scoped = candles.slice(-lookback);
  if (scoped.length < MIN_CANDLES) return empty;

  const swings = findConfirmedSwings(scoped, wing);
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");
  const lastClose = scoped.at(-1)?.c;

  const rehGroups = groupEqualSwings(highs, currentPrice);
  const relGroups = groupEqualSwings(lows, currentPrice);

  const allLevels: RehRelLevel[] = [
    ...rehGroups.map((g) => buildLevel("reh", g, currentPrice, timeframe, lastClose)),
    ...relGroups.map((g) => buildLevel("rel", g, currentPrice, timeframe, lastClose)),
  ];

  if (!allLevels.length) {
    return { ...empty, status: "known" };
  }

  const activeReh = rankByProximity(
    allLevels.filter((l) => l.type === "reh" && l.status === "active" && isAbovePrice(l, currentPrice))
  );
  const activeRel = rankByProximity(
    allLevels.filter((l) => l.type === "rel" && l.status === "active" && isBelowPrice(l, currentPrice))
  );
  const allRanked = rankByProximity(allLevels);

  return {
    status: "known",
    nearest_reh_above: activeReh[0] ?? null,
    nearest_rel_below: activeRel[0] ?? null,
    reh_levels: activeReh,
    rel_levels: activeRel,
    all_levels: allRanked,
  };
}

/** Documented tolerance formula — exported for tests and docs. */
export function describeRehRelTolerance(referencePrice: number): {
  formula: string;
  tolerance: number;
  example: string;
} {
  const pct = referencePrice * 0.001;
  const tolerance = rehRelTolerance(referencePrice);
  return {
    formula: "max(2, min(4, referencePrice × 0.001))",
    tolerance,
    example: `@ ${referencePrice.toFixed(2)} → tol=${tolerance.toFixed(2)} pts`,
  };
}
