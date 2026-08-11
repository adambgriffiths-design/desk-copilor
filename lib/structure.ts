import type { Bar, FvgZone } from "./types";
import { formatEst } from "./market-data";
import { detectUnfilledIntradayFvgs } from "./gap-zones";

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

type Swing = { type: "high" | "low"; price: number; index: number };

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
    if (isHigh) swings.push({ type: "high", price: bar.high, index: i });
    if (isLow) swings.push({ type: "low", price: bar.low, index: i });
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

export function buildStructureFacts(
  m1: Bar[],
  liquidityLevels: Array<{ id: string; label: string; price: number }>
) {
  const mss = detectMss(m1);
  const liquiditySweeps = detectLiquiditySweeps(m1, liquidityLevels);
  const m1UnfilledFvgs = detectM1UnfilledFvgs(m1);

  return {
    mss,
    liquiditySweeps,
    m1UnfilledFvgs,
    summary: [
      mss?.description ?? "No recent 1m MSS",
      liquiditySweeps.length
        ? `${liquiditySweeps.length} liquidity sweep(s) detected`
        : "No recent liquidity sweeps",
      m1UnfilledFvgs.length
        ? `${m1UnfilledFvgs.length} unfilled 1m FVG(s)`
        : "No unfilled 1m FVGs in lookback",
    ].join("; "),
  };
}
