/**
 * TickStream historical tick archive — GET /history/ticks
 * @see https://tick-stream.xyz/docs/historical
 */

const DEFAULT_API = "https://api.tick-stream.xyz/v1";

export type HistoricalSide = "buy" | "sell" | "unknown";

export type NormalizedTick = {
  symbol: string;
  price: number;
  size: number;
  side: HistoricalSide;
  /** CME for MNQ/NQ futures; historical rows omit exchange — inferred from symbol catalog. */
  exchange: string;
  /** Exchange timestamp, Unix seconds UTC. */
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
  onPage?: (page: HistoricalTicksPage, pageIndex: number) => void;
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

function normalizeSide(raw: string | undefined): HistoricalSide {
  if (raw === "buy" || raw === "sell") return raw;
  return "unknown";
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
      timestamp: raw.ts,
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
 * Fetches all pages from GET /history/ticks with pagination per docs:
 * when truncated=true, set start to the last returned ts.
 */
export async function fetchHistoricalTicks(
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
  let rawCount = 0;
  let lastPage: HistoricalTicksPage | null = null;

  let pageStart: string | number = opts.start;

  for (;;) {
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
    pageStart = lastTs;
  }

  const sorted = [...allTicks].sort((a, b) => a.timestamp - b.timestamp);
  const outOfOrderCorrected = sorted.some((t, i) => t !== allTicks[i]);

  return {
    ticks: sorted,
    stats: {
      pages,
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
