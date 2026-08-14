import { aggregateHtfFrom1m } from "../../tickstream/htf-aggregate";
import type { MinuteBar } from "../../tickstream/aggregate";
import type { Bar } from "../../types";
import type { ReplayMarketData } from "../replay/types";
import type { ResearchCandle, ResearchCandleDataset } from "./types";

function candleToMinuteBar(c: ResearchCandle): MinuteBar {
  return {
    minuteTs: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: 0,
  };
}

function htfToBar(bucketTs: number, o: number, h: number, l: number, c: number): Bar {
  return { time: new Date(bucketTs * 1000), open: o, high: h, low: l, close: c };
}

/** Converts validated research candles → replay market data (m1 + derived HTF). Raw NQ OHLC. */
export function researchDatasetToReplayMarketData(
  dataset: ResearchCandleDataset,
  opts?: { label?: string; sessionDate?: string }
): ReplayMarketData & { id: string; label: string; sessionDate: string } {
  const minuteBars = dataset.candles.map(candleToMinuteBar);
  const emptyTradeCounts = new Map<number, number>();
  const htf = aggregateHtfFrom1m(minuteBars, emptyTradeCounts, ["5m", "15m", "D"]);

  const m1: Bar[] = minuteBars.map((b) =>
    htfToBar(b.minuteTs, b.open, b.high, b.low, b.close)
  );
  const m5: Bar[] = htf["5m"].map((b) =>
    htfToBar(b.bucketTs, b.open, b.high, b.low, b.close)
  );
  const m15: Bar[] = htf["15m"].map((b) =>
    htfToBar(b.bucketTs, b.open, b.high, b.low, b.close)
  );
  const daily: Bar[] = htf.D.map((b) =>
    htfToBar(b.bucketTs, b.open, b.high, b.low, b.close)
  );

  const sessionDate =
    opts?.sessionDate ??
    new Date(dataset.metadata.start_timestamp * 1000).toISOString().slice(0, 10);

  return {
    id: dataset.metadata.dataset_id,
    label:
      opts?.label ??
      `${dataset.metadata.source_symbol} ${sessionDate} (${dataset.metadata.session_definition})`,
    sessionDate,
    symbol: `${dataset.metadata.target_instrument}:${dataset.metadata.source_symbol}`,
    daily,
    m15,
    m5,
    m1,
  };
}
