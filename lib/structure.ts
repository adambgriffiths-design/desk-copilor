import type { Bar, FvgZone } from "./types";
import type { SessionId } from "./sessions";
import {
  barsInEstWindow,
  barTimeSec,
  formatEst,
  getEstDateKey,
  priorEstDateKey,
} from "./market-data";
import { detectFirstPresentedFvgs, detectUnfilledIntradayFvgs, isFvgInverted } from "./gap-zones";

export type MssEvent = {
  direction: "bullish" | "bearish";
  level: number;
  at: string;
  atTime: number;
  description: string;
};

export type LiquiditySweep = {
  levelId: string;
  label: string;
  price: number;
  side: "buy_side" | "sell_side";
  at: string;
  atTime: number;
};

export type RelativeEqualPool = {
  price: number;
  type: "reh" | "rel";
  startTime: number;
  endTime?: number;
  barCount: number;
};

type Swing = { type: "high" | "low"; price: number; index: number; time: number };

function findSwings(bars: Bar[], wing = 2): Swing[] {
  const swings: Swing[] = [];
  for (let i = wing; i < bars.length - wing; i++) {
    const bar = bars[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= wing; j++) {
      if (bars[i - j].high >= bar.high || bars[i + j].high >= bar.high) isHigh = false;
      if (bars[i - j].low <= bar.low || bars[i + j].low <= bar.low) isLow = false;
    }
    const time = barTimeSec(bar);
    if (isHigh) swings.push({ type: "high", price: bar.high, index: i, time });
    if (isLow) swings.push({ type: "low", price: bar.low, index: i, time });
  }
  return swings;
}

function mssFromBar(
  bar: Bar,
  swingHighs: Swing[],
  swingLows: Swing[],
  barIndex: number
): MssEvent | null {
  const priorHighs = swingHighs.filter((s) => s.index < barIndex - 1);
  const priorLows = swingLows.filter((s) => s.index < barIndex - 1);
  const sh = priorHighs.at(-1);
  const sl = priorLows.at(-1);

  if (sh && bar.close > sh.price) {
    const at = formatEst(bar.time);
    return {
      direction: "bullish",
      level: sh.price,
      at,
      atTime: Math.floor(bar.time.getTime() / 1000),
      description: `Bullish MSS — body close above swing high ${sh.price.toFixed(2)} at ${at}`,
    };
  }

  if (sl && bar.close < sl.price) {
    const at = formatEst(bar.time);
    return {
      direction: "bearish",
      level: sl.price,
      at,
      atTime: Math.floor(bar.time.getTime() / 1000),
      description: `Bearish MSS — body close below swing low ${sl.price.toFixed(2)} at ${at}`,
    };
  }

  return null;
}

/** Most recent 1m market structure shift (body close through swing, not CHoCH). */
export function detectMss(m1: Bar[], lookback = 80): MssEvent | null {
  const bars = m1.slice(-lookback);
  if (bars.length < 10) return null;

  const swings = findSwings(bars, 2);
  const swingHighs = swings.filter((s) => s.type === "high");
  const swingLows = swings.filter((s) => s.type === "low");

  for (let i = bars.length - 1; i >= Math.max(0, bars.length - 12); i--) {
    const event = mssFromBar(bars[i], swingHighs, swingLows, i);
    if (event) return event;
  }

  return null;
}

/** Body close beyond session / PD liquidity levels. */
export function detectLiquiditySweeps(
  m1: Bar[],
  levels: Array<{ id: string; label: string; price: number }>,
  lookback = 40
): LiquiditySweep[] {
  const recent = m1.slice(-lookback);
  const sweeps: LiquiditySweep[] = [];

  for (const level of levels) {
    for (let i = recent.length - 1; i >= 0; i--) {
      const bar = recent[i];
      if (bar.close < level.price && bar.low <= level.price) {
        sweeps.push({
          levelId: level.id,
          label: level.label,
          price: level.price,
          side: "sell_side",
          at: formatEst(bar.time),
          atTime: Math.floor(bar.time.getTime() / 1000),
        });
        break;
      }
      if (bar.close > level.price && bar.high >= level.price) {
        sweeps.push({
          levelId: level.id,
          label: level.label,
          price: level.price,
          side: "buy_side",
          at: formatEst(bar.time),
          atTime: Math.floor(bar.time.getTime() / 1000),
        });
        break;
      }
    }
  }

  return sweeps.slice(0, 10);
}

export function detectM1UnfilledFvgs(m1: Bar[], maxCount = 5): FvgZone[] {
  return detectUnfilledIntradayFvgs(m1, "1m", 80, maxCount);
}

/** MNQ tolerance: 2–4 pts or 0.1% of price — ICT relative equal high/low clustering. */
export function rehRelTolerance(referencePrice: number): number {
  const pct = referencePrice * 0.001;
  return Math.max(2, Math.min(4, pct));
}

function sessionScopeBars(
  m1: Bar[],
  sessionId: SessionId,
  todayKey: string,
  yesterdayKey: string
): Bar[] {
  switch (sessionId) {
    case "asia":
      return [
        ...barsInEstWindow(m1, 18 * 60, 24 * 60, yesterdayKey),
        ...barsInEstWindow(m1, 0, 60, todayKey),
      ];
    case "london":
      return barsInEstWindow(m1, 2 * 60, 5 * 60, todayKey);
    case "ny_pre":
      return barsInEstWindow(m1, 7 * 60, 9 * 60 + 30, todayKey);
    case "ny_am":
      return barsInEstWindow(m1, 9 * 60 + 30, 11 * 60, todayKey);
    case "ny_pm":
      return barsInEstWindow(m1, 13 * 60 + 30, 16 * 60, todayKey);
    default:
      return m1.slice(-120);
  }
}

function mergeBarsByTime(...groups: Bar[][]): Bar[] {
  const seen = new Set<number>();
  const out: Bar[] = [];
  for (const group of groups) {
    for (const bar of group) {
      const t = bar.time.getTime();
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(bar);
    }
  }
  out.sort((a, b) => a.time.getTime() - b.time.getTime());
  return out;
}

/** Classic 3-bar swing (wing=1): center bar extreme beats left and right neighbors. */
function findSwings3Bar(bars: Bar[]): Swing[] {
  return findSwings(bars, 1);
}

/**
 * REH / REL from paired 3-bar swings: left swing first in time, right swing later and
 * slightly lower in price (within tolerance). Classic ICT equal lows often have the
 * right swing *higher* (shallower); this desk uses the user's spec — right lower than left.
 */
function pairRelativeEqualSwings(
  swings: Swing[],
  type: "reh" | "rel",
  maxPools: number
): RelativeEqualPool[] {
  const sorted = [...swings].sort((a, b) => a.time - b.time);
  const pools: RelativeEqualPool[] = [];
  const usedRight = new Set<number>();

  for (let j = 1; j < sorted.length; j++) {
    if (usedRight.has(j)) continue;
    const right = sorted[j];

    for (let i = j - 1; i >= 0; i--) {
      const left = sorted[i];
      if (right.price >= left.price) continue;

      const ref = (left.price + right.price) / 2;
      if (Math.abs(left.price - right.price) > rehRelTolerance(ref)) continue;

      pools.push({
        type,
        price: type === "reh" ? left.price : right.price,
        startTime: left.time,
        endTime: right.time,
        barCount: 2,
      });
      usedRight.add(j);
      break;
    }
  }

  return pools
    .sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime))
    .slice(0, maxPools);
}

/**
 * Relative equal highs (REH) / lows (REL) — pairs of 3-bar swing points where the
 * right swing is lower than the left (within MNQ tolerance). Scope: NY pre-market,
 * active session window, plus last 120 bars fallback.
 */
export function detectRelativeEqualPools(
  m1: Bar[],
  asOf: Date = new Date(),
  activeSessionId: SessionId = "ny_am",
  opts?: { maxPoolsPerSide?: number }
): RelativeEqualPool[] {
  const maxPools = opts?.maxPoolsPerSide ?? 3;
  const wing = 1;
  if (m1.length < wing * 2 + 3) return [];

  const todayKey = getEstDateKey(asOf);
  const yesterdayKey = priorEstDateKey(m1, todayKey) ?? todayKey;
  const nyPre = barsInEstWindow(m1, 7 * 60, 9 * 60 + 30, todayKey);
  const sessionBars = sessionScopeBars(m1, activeSessionId, todayKey, yesterdayKey);
  const scoped = mergeBarsByTime(nyPre, sessionBars, m1.slice(-120));
  if (scoped.length < wing * 2 + 3) return [];

  const swings = findSwings3Bar(scoped);
  const reh = pairRelativeEqualSwings(
    swings.filter((s) => s.type === "high"),
    "reh",
    maxPools
  );
  const rel = pairRelativeEqualSwings(
    swings.filter((s) => s.type === "low"),
    "rel",
    maxPools
  );

  return [...reh, ...rel].sort((a, b) => b.price - a.price);
}

export function buildStructureFacts(
  m1: Bar[],
  liquidityLevels: Array<{ id: string; label: string; price: number }>,
  asOf: Date = new Date(),
  activeSessionId: SessionId = "ny_am"
) {
  const mss = detectMss(m1);
  const liquiditySweeps = detectLiquiditySweeps(m1, liquidityLevels);
  const relativeEqualPools = detectRelativeEqualPools(m1, asOf, activeSessionId);
  const m1UnfilledFvgs = detectM1UnfilledFvgs(m1);
  const m1InvertedFvgs = m1UnfilledFvgs.filter((f) => f.inverted);
  const firstPresentedFvg = detectFirstPresentedFvgs(m1, asOf, activeSessionId);
  for (const key of ["nyOpening", "postFhdr", "activeSession"] as const) {
    const fp = firstPresentedFvg[key];
    if (fp?.fvg && fp.fvg.inverted == null) {
      fp.fvg.inverted = isFvgInverted(m1, fp.fvg);
    }
  }

  const fpSummary = firstPresentedFvg.nyOpening
    ? `NY opening first presented 1m FVG at ${firstPresentedFvg.nyOpening.fvg.formedAt}`
    : "No NY opening first presented 1m FVG yet";

  const rehRelSummary = relativeEqualPools.length
    ? `${relativeEqualPools.filter((p) => p.type === "reh").length} REH, ${relativeEqualPools.filter((p) => p.type === "rel").length} REL pool(s)`
    : "No relative equal high/low pools in scope";

  return {
    mss,
    liquiditySweeps,
    relativeEqualPools,
    m1UnfilledFvgs,
    m1InvertedFvgs,
    firstPresentedFvg,
    summary: [
      mss?.description ?? "No recent 1m MSS",
      liquiditySweeps.length
        ? `${liquiditySweeps.length} liquidity sweep(s) detected`
        : "No recent liquidity sweeps",
      m1UnfilledFvgs.length
        ? `${m1UnfilledFvgs.length} unfilled 1m FVG(s)${m1InvertedFvgs.length ? ` (${m1InvertedFvgs.length} inverted / IFVG)` : ""}`
        : "No unfilled 1m FVGs in lookback",
      fpSummary,
      rehRelSummary,
    ].join("; "),
  };
}
