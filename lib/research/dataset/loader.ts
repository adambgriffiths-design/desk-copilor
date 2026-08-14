import { aggregateTicksTo1m } from "../../tickstream/aggregate";
import { fetchHistoricalTicks, parseHistoricalTimeParam } from "../../tickstream/historical";
import { buildResearchDataset } from "./build";
import { minuteBarsToCandles } from "./candles";
import { TICKSTREAM_SOURCE_VERSION } from "./version";
import type { ResearchCandleDataset } from "./types";

export type LoadTickstreamDatasetOptions = {
  apiKey: string;
  symbol: string;
  start: string | number;
  end: string | number;
  baseUrl?: string;
  chunkSeconds?: number;
};

/**
 * TickStream NQ → validated loader → 1m OHLC research dataset.
 * Raw NQ prices — no /4 scaling.
 */
export async function loadDatasetFromTickstream(
  opts: LoadTickstreamDatasetOptions
): Promise<ResearchCandleDataset> {
  const requestedStart = parseHistoricalTimeParam(opts.start);
  const requestedEnd = parseHistoricalTimeParam(opts.end);

  const result = await fetchHistoricalTicks({
    apiKey: opts.apiKey,
    symbol: opts.symbol,
    start: opts.start,
    end: opts.end,
    baseUrl: opts.baseUrl,
    chunkSeconds: opts.chunkSeconds,
  });

  const bars = aggregateTicksTo1m(
    result.ticks.map((t) => ({
      price: t.price,
      size: t.size,
      ts: t.timestamp,
    }))
  );

  const candles = minuteBarsToCandles(bars);

  return buildResearchDataset({
    symbol: opts.symbol,
    candles,
    source: "tickstream",
    source_version: TICKSTREAM_SOURCE_VERSION,
    requestedStart,
    requestedEnd,
    created_at: new Date().toISOString(),
  });
}
