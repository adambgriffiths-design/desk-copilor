import type { Bar, FvgZone } from "./types";
import { formatEst } from "./market-data";

const MIN_GAP_POINTS = 3;

export function isGapFilled(
  bars: Bar[],
  fromIndex: number,
  bottom: number,
  top: number
): boolean {
  const lo = Math.min(bottom, top);
  const hi = Math.max(bottom, top);
  if (hi - lo < 0.01) return true;
  for (let j = fromIndex + 1; j < bars.length; j++) {
    if (bars[j].low <= hi && bars[j].high >= lo) {
      if (bars[j].low <= lo && bars[j].high >= hi) return true;
      const overlap = Math.min(bars[j].high, hi) - Math.max(bars[j].low, lo);
      if (overlap >= (hi - lo) * 0.5) return true;
    }
  }
  return false;
}

/** 15m / 5m unfilled fair value gaps for market context. */
export function detectUnfilledIntradayFvgs(
  bars: Bar[],
  timeframe: FvgZone["timeframe"],
  lookback = 40,
  maxCount = 5
): FvgZone[] {
  const fvgs: FvgZone[] = [];
  const start = Math.max(2, bars.length - lookback);

  for (let i = start; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];
    if (!c1 || !c3) continue;

    if (c1.high < c3.low && c3.low - c1.high >= MIN_GAP_POINTS) {
      const bottom = c1.high;
      const top = c3.low;
      if (isGapFilled(bars, i, bottom, top)) continue;
      fvgs.push({
        timeframe,
        type: "bullish",
        top,
        bottom,
        formedAt: formatEst(c3.time),
        startTime: Math.floor(c3.time.getTime() / 1000),
      });
    }

    if (c1.low > c3.high && c1.low - c3.high >= MIN_GAP_POINTS) {
      const bottom = c3.high;
      const top = c1.low;
      if (isGapFilled(bars, i, bottom, top)) continue;
      fvgs.push({
        timeframe,
        type: "bearish",
        top,
        bottom,
        formedAt: formatEst(c3.time),
        startTime: Math.floor(c3.time.getTime() / 1000),
      });
    }
  }

  return fvgs.slice(-maxCount);
}
