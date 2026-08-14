import type { ResearchCandle } from "./types";

const BASE_TS = Math.floor(new Date("2026-08-12T14:00:00Z").getTime() / 1000);

function candle(offsetMinutes: number, o: number, h: number, l: number, c: number): ResearchCandle {
  return {
    timestamp: BASE_TS + offsetMinutes * 60,
    open: o,
    high: h,
    low: l,
    close: c,
  };
}

/** Five contiguous valid 1m candles for baseline tests. */
export function syntheticValidCandles(): ResearchCandle[] {
  return [
    candle(0, 21000, 21005, 20998, 21002),
    candle(1, 21002, 21008, 21000, 21006),
    candle(2, 21006, 21010, 21004, 21008),
    candle(3, 21008, 21012, 21006, 21010),
    candle(4, 21010, 21015, 21008, 21012),
  ];
}

/** Includes duplicate timestamp at minute 2 (adjacent duplicate). */
export function syntheticDuplicateCandles(): ResearchCandle[] {
  const base = syntheticValidCandles();
  return [...base.slice(0, 3), { ...base[2]! }, ...base.slice(3)];
}

/** Missing minute between index 1 and 3 (skips minute 2). */
export function syntheticMissingMinuteCandles(): ResearchCandle[] {
  return [
    candle(0, 21000, 21005, 20998, 21002),
    candle(1, 21002, 21008, 21000, 21006),
    candle(3, 21008, 21012, 21006, 21010),
    candle(4, 21010, 21015, 21008, 21012),
  ];
}

/** high < low on one candle. */
export function syntheticInvalidOhlcCandles(): ResearchCandle[] {
  const base = syntheticValidCandles();
  base[2] = { timestamp: base[2]!.timestamp, open: 21006, high: 21000, low: 21010, close: 21008 };
  return base;
}

/** Out-of-order timestamps. */
export function syntheticOutOfOrderCandles(): ResearchCandle[] {
  return [
    candle(0, 21000, 21005, 20998, 21002),
    candle(2, 21006, 21010, 21004, 21008),
    candle(1, 21002, 21008, 21000, 21006),
  ];
}

/** Future poison bar at minute 4 for snapshot leak tests. */
export function syntheticPoisonFutureCandles(): ResearchCandle[] {
  const base = syntheticValidCandles();
  base[4] = { timestamp: base[4]!.timestamp, open: 99999, high: 99999, low: 1, close: 99999 };
  return base;
}

/** Partial session — missing first minute and last minute of requested window. */
export function syntheticPartialSessionCandles(): ResearchCandle[] {
  return [
    candle(1, 21002, 21008, 21000, 21006),
    candle(2, 21006, 21010, 21004, 21008),
    candle(3, 21008, 21012, 21006, 21010),
  ];
}

/** Gap spanning CME session boundary (6 PM ET roll). */
export function syntheticSessionBoundaryCandles(): ResearchCandle[] {
  const beforeBoundary = Math.floor(new Date("2026-08-12T21:59:00Z").getTime() / 1000);
  const afterBoundary = Math.floor(new Date("2026-08-12T23:05:00Z").getTime() / 1000);
  return [
    { timestamp: beforeBoundary, open: 21000, high: 21005, low: 20998, close: 21002 },
    { timestamp: afterBoundary, open: 21002, high: 21008, low: 21000, close: 21006 },
  ];
}

export function syntheticRequestedWindow(): { start: number; end: number } {
  return { start: BASE_TS, end: BASE_TS + 4 * 60 };
}
