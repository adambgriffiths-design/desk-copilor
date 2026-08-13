/** Pure 1-minute OHLCV aggregation from exchange-timestamped ticks. */

export type TickInput = {
  price: number;
  size: number;
  /** Exchange timestamp in Unix seconds. */
  ts: number;
  /** Optional dedup id — duplicates with the same id are ignored. */
  id?: string | number;
};

export type MinuteBar = {
  /** Start of the minute bucket in Unix seconds. */
  minuteTs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function minuteBucket(ts: number): number {
  return Math.floor(ts / 60) * 60;
}

function mergeTickIntoBar(bar: MinuteBar, tick: TickInput): void {
  bar.high = Math.max(bar.high, tick.price);
  bar.low = Math.min(bar.low, tick.price);
  bar.close = tick.price;
  bar.volume += tick.size;
}

function newBar(minuteTs: number, tick: TickInput): MinuteBar {
  return {
    minuteTs,
    open: tick.price,
    high: tick.price,
    low: tick.price,
    close: tick.price,
    volume: tick.size,
  };
}

/**
 * Aggregates ticks into 1-minute OHLCV bars keyed by exchange timestamp.
 * Handles minute rollover, out-of-order ticks, and optional id-based dedup.
 */
export class MinuteAggregator {
  private currentMinute: number | null = null;
  private currentBar: MinuteBar | null = null;
  private pastBars = new Map<number, MinuteBar>();
  private seenIds = new Set<string>();

  addTick(tick: TickInput): MinuteBar[] {
    if (!Number.isFinite(tick.price) || !Number.isFinite(tick.size) || !Number.isFinite(tick.ts)) {
      return [];
    }

    if (tick.id != null) {
      const key = String(tick.id);
      if (this.seenIds.has(key)) return [];
      this.seenIds.add(key);
    }

    const bucket = minuteBucket(tick.ts);
    const completed: MinuteBar[] = [];

    if (this.currentMinute == null) {
      this.currentMinute = bucket;
      this.currentBar = newBar(bucket, tick);
      return completed;
    }

    if (bucket > this.currentMinute) {
      if (this.currentBar) completed.push(this.currentBar);
      this.currentMinute = bucket;
      this.currentBar = newBar(bucket, tick);
      return completed;
    }

    if (bucket < this.currentMinute) {
      const existing = this.pastBars.get(bucket);
      if (existing) {
        mergeTickIntoBar(existing, tick);
      } else {
        this.pastBars.set(bucket, newBar(bucket, tick));
      }
      return completed;
    }

    if (this.currentBar) mergeTickIntoBar(this.currentBar, tick);
    return completed;
  }

  /** Returns the in-progress bar for the current minute, if any. */
  snapshot(): MinuteBar | null {
    return this.currentBar ? { ...this.currentBar } : null;
  }

  /** Finalizes and returns all bars (current + any out-of-order buckets). */
  flush(): MinuteBar[] {
    const bars: MinuteBar[] = [];
    if (this.currentBar) bars.push(this.currentBar);
    for (const bar of this.pastBars.values()) bars.push(bar);
    bars.sort((a, b) => a.minuteTs - b.minuteTs);
    this.currentMinute = null;
    this.currentBar = null;
    this.pastBars.clear();
    return bars;
  }
}

/** Convenience helper for one-shot aggregation over an array of ticks. */
export function aggregateTicksTo1m(ticks: TickInput[]): MinuteBar[] {
  const agg = new MinuteAggregator();
  const bars: MinuteBar[] = [];
  for (const tick of ticks) {
    bars.push(...agg.addTick(tick));
  }
  bars.push(...agg.flush());
  return bars;
}
