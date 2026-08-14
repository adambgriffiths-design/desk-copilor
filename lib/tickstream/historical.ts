/**
 * TickStream historical tick archive — GET /history/ticks
 * @see https://tick-stream.xyz/docs/historical
 *
 * Archive `ts` values are in **microseconds** (CME futures era; e.g. ~1.7e15 for 2026).
 * Normalization to Unix seconds happens once at this ingestion boundary before
 * MinuteAggregator / aggregateTicksTo1m (which expect seconds).
 */

const DEFAULT_API = "https://api.tick-stream.xyz/v1";

/** Values above this are treated as microseconds; at or below as Unix seconds. */
export const HISTORICAL_TS_MICROSECOND_THRESHOLD = 1e12;

/** Default chunk size for dense CME session fetches (~5 minutes). */
export const DEFAULT_HISTORICAL_CHUNK_SECONDS = 300;

/** Safety cap on pagination loops per window. */
const MAX_PAGES_PER_WINDOW = 10_000;

export type HistoricalSide = "buy" | "sell" | "unknown";

export type NormalizedTick = {
  symbol: string;
  price: number;
  size: number;
  side: HistoricalSide;
  /** CME for MNQ/NQ futures; historical rows omit exchange — inferred from symbol catalog. */
  exchange: string;
  /** Exchange timestamp, Unix seconds UTC (normalized from archive µs when needed). */
  timestamp: number;
};

export type RawHistoricalTick = {
  ts: number;
  price: number;
  size: number;
  side?: string;
};

export type HistoricalTicksPage = {
  symbol: string;
  start: number;
  end: number;
  count: number;
  truncated: boolean;
  snapshot_until?: number;
  ticks: RawHistoricalTick[];
};

export type HistoricalFetchStats = {
  pages: number;
  chunks: number;
  truncatedPages: number;
  rawCount: number;
  normalizedCount: number;
  duplicatesSkipped: number;
  malformedCount: number;
  malformedSamples: string[];
  outOfOrderCorrected: boolean;
};

export type HistoricalFetchResult = {
  ticks: NormalizedTick[];
  stats: HistoricalFetchStats;
  lastPage: HistoricalTicksPage | null;
  symbolQueried: string;
  exchange: string;
};

export type FetchHistoricalTicksOptions = {
  apiKey: string;
  symbol: string;
  start: string | number;
  end: string | number;
  limit?: number;
  baseUrl?: string;
  exchange?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  /** When set (default 300), ranges longer than this are fetched in ~5-minute chunks. Set 0 to disable. */
  chunkSeconds?: number;
  onPage?: (page: HistoricalTicksPage, pageIndex: number) => void;
  onChunk?: (chunkIndex: number, chunkStartSec: number, chunkEndSec: number) => void;
};

export class HistoricalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "HistoricalApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tickDedupKey(t: NormalizedTick): string {
  return `${t.timestamp}:${t.price}:${t.size}:${t.side}`;
}

/** Builds [startSec, endSec) chunk windows for dense CME session fetches. */
export function buildHistoricalChunkRanges(
  startSec: number,
  endSec: number,
  chunkSeconds: number
): Array<{ startSec: number; endSec: number }> {
  const ranges: Array<{ startSec: number; endSec: number }> = [];
  for (let chunkStart = startSec; chunkStart < endSec; chunkStart += chunkSeconds) {
    ranges.push({
      startSec: chunkStart,
      endSec: Math.min(endSec, chunkStart + chunkSeconds),
    });
  }
  return ranges;
}

/** Dedupes by timestamp+price+size+side, then sorts ascending by timestamp. */
export function dedupeAndSortHistoricalTicks(ticks: NormalizedTick[]): {
  ticks: NormalizedTick[];
  duplicatesSkipped: number;
  outOfOrderCorrected: boolean;
} {
  const seen = new Set<string>();
  const unique: NormalizedTick[] = [];
  let duplicatesSkipped = 0;
  for (const tick of ticks) {
    const key = tickDedupKey(tick);
    if (seen.has(key)) {
      duplicatesSkipped++;
      continue;
    }
    seen.add(key);
    unique.push(tick);
  }
  const sorted = [...unique].sort((a, b) => a.timestamp - b.timestamp);
  return {
    ticks: sorted,
    duplicatesSkipped,
    outOfOrderCorrected: sorted.some((t, i) => t !== unique[i]),
  };
}

function normalizeSide(raw: string | undefined): HistoricalSide {
  if (raw === "buy" || raw === "sell") return raw;
  return "unknown";
}

/**
 * Converts TickStream historical archive `ts` to Unix seconds.
 * Archive rows use microseconds; values already in seconds pass through unchanged.
 */
export function normalizeHistoricalTimestamp(rawTs: number): number {
  if (rawTs > HISTORICAL_TS_MICROSECOND_THRESHOLD) {
    return Math.floor(rawTs / 1_000_000);
  }
  return rawTs;
}

/** Parses start/end option to Unix seconds (handles ISO strings and µs/second numbers). */
export function parseHistoricalTimeParam(v: string | number): number {
  if (typeof v === "number") {
    return normalizeHistoricalTimestamp(v);
  }
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) {
    throw new Error(`tickstream historical: invalid time param: ${String(v)}`);
  }
  return Math.floor(ms / 1000);
}

/** Formats a Unix-second boundary for the API (ISO UTC). */
function formatApiTime(sec: number): string {
  return new Date(sec * 1000).toISOString();
}

/** Validates and normalizes one raw historical tick row. Returns null + reason when malformed. */
export function normalizeHistoricalTick(
  raw: RawHistoricalTick,
  symbol: string,
  exchange: string
): { tick: NormalizedTick | null; error: string | null } {
  if (!Number.isFinite(raw.ts) || raw.ts <= 0) {
    return { tick: null, error: `invalid ts: ${String(raw.ts)}` };
  }
  if (!Number.isFinite(raw.price)) {
    return { tick: null, error: `invalid price: ${String(raw.price)}` };
  }
  if (!Number.isFinite(raw.size) || raw.size < 0) {
    return { tick: null, error: `invalid size: ${String(raw.size)}` };
  }
  return {
    tick: {
      symbol,
      price: raw.price,
      size: raw.size,
      side: normalizeSide(raw.side),
      exchange,
      timestamp: normalizeHistoricalTimestamp(raw.ts),
    },
    error: null,
  };
}

async function fetchHistoryPage(
  apiKey: string,
  baseUrl: string,
  params: URLSearchParams,
  maxRetries: number,
  retryDelayMs: number
): Promise<HistoricalTicksPage> {
  const url = `${baseUrl}/history/ticks?${params.toString()}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.status === 429 || res.status >= 500) {
      lastError = new HistoricalApiError(
        `tickstream historical: ${res.status} (retry ${attempt + 1}/${maxRetries + 1})`,
        res.status
      );
      if (attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw lastError;
    }

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      const msg =
        typeof body === "object" && body && "error" in body
          ? String((body as { error?: { message?: string } }).error?.message ?? res.status)
          : `HTTP ${res.status}`;
      throw new HistoricalApiError(`tickstream historical: ${msg}`, res.status, body);
    }

    return (await res.json()) as HistoricalTicksPage;
  }

  throw lastError ?? new Error("tickstream historical: fetch failed");
}

/**
 * Fetches all pages for one [start, end) window with pagination per docs:
 * when truncated=true, set start to the last returned ts (raw archive units).
 */
async function fetchHistoricalTicksWindow(
  opts: FetchHistoricalTicksOptions
): Promise<HistoricalFetchResult> {
  const baseUrl = (opts.baseUrl ?? process.env.TICKSTREAM_API_URL ?? DEFAULT_API).replace(/\/$/, "");
  const exchange = opts.exchange ?? "CME";
  const maxRetries = opts.maxRetries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 1000;
  const limit = opts.limit ?? 50_000;

  const allTicks: NormalizedTick[] = [];
  const seen = new Set<string>();
  let duplicatesSkipped = 0;
  let malformedCount = 0;
  const malformedSamples: string[] = [];
  let pages = 0;
  let truncatedPages = 0;
  let rawCount = 0;
  let lastPage: HistoricalTicksPage | null = null;

  let pageStart: string | number = opts.start;

  for (;;) {
    if (pages >= MAX_PAGES_PER_WINDOW) {
      throw new Error(
        `tickstream historical: pagination exceeded ${MAX_PAGES_PER_WINDOW} pages — possible infinite loop`
      );
    }

    const params = new URLSearchParams({
      symbol: opts.symbol.toUpperCase(),
      start: String(pageStart),
      end: String(opts.end),
      limit: String(limit),
    });

    const page = await fetchHistoryPage(
      opts.apiKey,
      baseUrl,
      params,
      maxRetries,
      retryDelayMs
    );
    pages++;
    lastPage = page;
    opts.onPage?.(page, pages);

    if (page.truncated) truncatedPages++;

    for (const raw of page.ticks ?? []) {
      rawCount++;
      const { tick, error } = normalizeHistoricalTick(raw, page.symbol, exchange);
      if (error || !tick) {
        malformedCount++;
        if (malformedSamples.length < 5) malformedSamples.push(error ?? "unknown");
        continue;
      }
      const key = tickDedupKey(tick);
      if (seen.has(key)) {
        duplicatesSkipped++;
        continue;
      }
      seen.add(key);
      allTicks.push(tick);
    }

    if (!page.truncated || page.ticks.length === 0) break;

    const lastTs = page.ticks[page.ticks.length - 1]?.ts;
    if (lastTs == null || !Number.isFinite(lastTs)) {
      throw new Error("tickstream historical: truncated but last ts missing");
    }

    if (String(lastTs) === String(pageStart)) {
      throw new Error(
        "tickstream historical: pagination stuck — start did not advance past last ts"
      );
    }
    pageStart = lastTs;
  }

  const sorted = [...allTicks].sort((a, b) => a.timestamp - b.timestamp);
  const outOfOrderCorrected = sorted.some((t, i) => t !== allTicks[i]);

  return {
    ticks: sorted,
    stats: {
      pages,
      chunks: 1,
      truncatedPages,
      rawCount,
      normalizedCount: sorted.length,
      duplicatesSkipped,
      malformedCount,
      malformedSamples,
      outOfOrderCorrected,
    },
    lastPage,
    symbolQueried: opts.symbol.toUpperCase(),
    exchange,
  };
}

/**
 * Fetches all pages from GET /history/ticks with optional ~5-minute chunking for dense CME sessions.
 * Chunks are paginated independently; ticks are deduped, sorted, and never silently discarded.
 */
export async function fetchHistoricalTicks(
  opts: FetchHistoricalTicksOptions
): Promise<HistoricalFetchResult> {
  const chunkSeconds =
    opts.chunkSeconds === 0 ? 0 : (opts.chunkSeconds ?? DEFAULT_HISTORICAL_CHUNK_SECONDS);

  const startSec = parseHistoricalTimeParam(opts.start);
  const endSec = parseHistoricalTimeParam(opts.end);

  if (endSec <= startSec) {
    throw new Error("tickstream historical: end must be after start");
  }

  const rangeSec = endSec - startSec;
  if (chunkSeconds <= 0 || rangeSec <= chunkSeconds) {
    return fetchHistoricalTicksWindow(opts);
  }

  const allTicks: NormalizedTick[] = [];
  let pages = 0;
  let truncatedPages = 0;
  let rawCount = 0;
  let duplicatesSkipped = 0;
  let malformedCount = 0;
  const malformedSamples: string[] = [];
  let lastPage: HistoricalTicksPage | null = null;
  let chunks = 0;

  const chunkRanges = buildHistoricalChunkRanges(startSec, endSec, chunkSeconds);
  for (const { startSec: chunkStart, endSec: chunkEnd } of chunkRanges) {
    chunks++;
    opts.onChunk?.(chunks, chunkStart, chunkEnd);

    const chunkResult = await fetchHistoricalTicksWindow({
      ...opts,
      start: formatApiTime(chunkStart),
      end: formatApiTime(chunkEnd),
    });

    pages += chunkResult.stats.pages;
    truncatedPages += chunkResult.stats.truncatedPages;
    rawCount += chunkResult.stats.rawCount;
    duplicatesSkipped += chunkResult.stats.duplicatesSkipped;
    malformedCount += chunkResult.stats.malformedCount;
    for (const sample of chunkResult.stats.malformedSamples) {
      if (malformedSamples.length < 5) malformedSamples.push(sample);
    }
    lastPage = chunkResult.lastPage;
    allTicks.push(...chunkResult.ticks);
  }

  const { ticks: sorted, duplicatesSkipped: crossChunkDupes, outOfOrderCorrected } =
    dedupeAndSortHistoricalTicks(allTicks);
  duplicatesSkipped += crossChunkDupes;

  return {
    ticks: sorted,
    stats: {
      pages,
      chunks,
      truncatedPages,
      rawCount,
      normalizedCount: sorted.length,
      duplicatesSkipped,
      malformedCount,
      malformedSamples,
      outOfOrderCorrected,
    },
    lastPage,
    symbolQueried: opts.symbol.toUpperCase(),
    exchange: opts.exchange ?? "CME",
  };
}
