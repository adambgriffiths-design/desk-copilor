import type { MinuteBar } from "../../tickstream/aggregate";
import type { ResearchCandle } from "./types";

/** Converts aggregated 1m bars to research candles — volume intentionally omitted. */
export function minuteBarsToCandles(bars: MinuteBar[]): ResearchCandle[] {
  return bars.map((b) => ({
    timestamp: b.minuteTs,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

/** Returns candles unchanged — validation layer must flag issues; no silent repair. */
export function candlesFromRawInput(candles: ResearchCandle[]): ResearchCandle[] {
  return candles.map((c) => ({ ...c }));
}
