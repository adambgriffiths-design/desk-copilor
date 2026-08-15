/**
 * TickStream REST quote — GET /quote
 * @see https://tick-stream.xyz/docs/rest
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TICKSTREAM_QUOTE_TIMEOUT_MS,
  MarketDataError,
  mapFetchAbortToMarketDataError,
} from "../market-data-errors";

export { TICKSTREAM_QUOTE_TIMEOUT_MS } from "../market-data-errors";

const DEFAULT_API = "https://api.tick-stream.xyz/v1";

export type RawQuoteResponse = {
  symbol?: string;
  price?: number;
  bid?: number;
  ask?: number;
  /** Exchange timestamp, Unix seconds UTC. */
  ts?: number;
};

export type TickstreamQuote = {
  symbol: string;
  price: number;
  bid: number | null;
  ask: number | null;
  ts: number;
  exchangeTimestampIso: string;
  lagSec: number;
  source: "tickstream_quote";
};

export class QuoteApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "QuoteApiError";
  }
}

/** Load key from process.env or `.env.local` / `.env` (never logged). */
export function loadTickstreamApiKey(cwd = process.cwd()): string | undefined {
  if (process.env.TICKSTREAM_API_KEY?.trim()) {
    return process.env.TICKSTREAM_API_KEY.trim();
  }
  for (const name of [".env.local", ".env"]) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?TICKSTREAM_API_KEY\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  }
  return undefined;
}

export type FetchTickstreamQuoteOptions = {
  apiKey: string;
  symbol?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  nowSec?: () => number;
  /** Override default AbortSignal.timeout budget (ms). */
  timeoutMs?: number;
  signal?: AbortSignal;
};

export function normalizeQuoteResponse(
  raw: RawQuoteResponse,
  nowSec: () => number = () => Date.now() / 1000
): TickstreamQuote {
  const symbol = raw.symbol?.toUpperCase();
  const price = raw.price;
  const ts = raw.ts;

  if (!symbol) {
    throw new QuoteApiError("tickstream quote: missing symbol", 0);
  }
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new QuoteApiError("tickstream quote: missing or invalid price", 0);
  }
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) {
    throw new QuoteApiError("tickstream quote: missing or invalid ts", 0);
  }

  const bid =
    typeof raw.bid === "number" && Number.isFinite(raw.bid) && raw.bid > 0
      ? raw.bid
      : null;
  const ask =
    typeof raw.ask === "number" && Number.isFinite(raw.ask) && raw.ask > 0
      ? raw.ask
      : null;
  const lagSec = Math.max(0, Math.round((nowSec() - ts) * 1000) / 1000);

  return {
    symbol,
    price,
    bid,
    ask,
    ts,
    exchangeTimestampIso: new Date(ts * 1000).toISOString(),
    lagSec,
    source: "tickstream_quote",
  };
}

export async function fetchTickstreamQuote(
  opts: FetchTickstreamQuoteOptions
): Promise<TickstreamQuote> {
  const baseUrl = (opts.baseUrl ?? process.env.TICKSTREAM_API_URL ?? DEFAULT_API).replace(
    /\/$/,
    ""
  );
  const symbol = (opts.symbol ?? "MNQ").toUpperCase();
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${baseUrl}/quote?symbol=${encodeURIComponent(symbol)}`;
  const timeoutMs = opts.timeoutMs ?? TICKSTREAM_QUOTE_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort(
      new DOMException("The operation was aborted due to timeout", "TimeoutError")
    );
  }, timeoutMs);
  const any = (AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  const signal =
    opts.signal && typeof any === "function"
      ? any([ac.signal, opts.signal])
      : ac.signal;

  let res: Response;
  let raceTimer: ReturnType<typeof setTimeout> | undefined;
  const fetchPromise = fetchFn(url, {
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    signal,
  });
  fetchPromise.catch(() => {});
  try {
    res = await Promise.race([
      fetchPromise,
      new Promise<never>((_, reject) => {
        raceTimer = setTimeout(() => {
          reject(
            new MarketDataError(
              "MARKET_DATA_TIMEOUT",
              "MARKET_DATA_TIMEOUT — Tickstream quote timed out"
            )
          );
        }, timeoutMs + 25);
      }),
    ]);
  } catch (err) {
    if (err instanceof MarketDataError) throw err;
    throw mapFetchAbortToMarketDataError(err, "tickstream");
  } finally {
    clearTimeout(timer);
    if (!ac.signal.aborted) {
      ac.abort(
        new DOMException("The operation was aborted due to timeout", "TimeoutError")
      );
    }
    if (raceTimer) clearTimeout(raceTimer);
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
    throw new QuoteApiError(`tickstream quote: ${msg}`, res.status, body);
  }

  const raw = (await res.json()) as RawQuoteResponse;
  return normalizeQuoteResponse(raw, opts.nowSec);
}
