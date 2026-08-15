/**
 * Explicit market-data failure kinds — never collapse these into bare "operation aborted".
 */

export type MarketDataFailureKind =
  | "MARKET_DATA_TIMEOUT"
  | "MARKET_DATA_UNAVAILABLE"
  | "REQUEST_ABORTED"
  | "USER_CANCELLED"
  | "INTERNAL_ERROR";

/** Per Yahoo chart HTTP call (1d/15m/5m/1m run in parallel — wall clock ≈ this). */
export const YAHOO_FETCH_TIMEOUT_MS = 15_000;

/** Tickstream REST /quote bound. */
export const TICKSTREAM_QUOTE_TIMEOUT_MS = 8_000;

export class MarketDataError extends Error {
  readonly kind: MarketDataFailureKind;

  constructor(kind: MarketDataFailureKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MarketDataError";
    this.kind = kind;
  }
}

export function isAbortLike(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: number | string };
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  if (e.code === 20 /* DOMException ABORT_ERR */) return true;
  const msg = e.message ?? "";
  return /aborted|abort(ed)?|timed?\s*out|TimeoutError/i.test(msg);
}

export function isTimeoutAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "TimeoutError") return true;
  const msg = e.message ?? "";
  return /timed?\s*out|TimeoutError|aborted due to timeout|The operation was aborted due to timeout/i.test(
    msg
  );
}

export function classifyMarketDataFailure(err: unknown): MarketDataFailureKind {
  if (err instanceof MarketDataError) return err.kind;

  const msg = err instanceof Error ? err.message : String(err ?? "");
  const name = err instanceof Error ? err.name : "";

  if (/\bUSER_CANCELLED\b/i.test(msg) || /user\s*cancel/i.test(msg)) {
    return "USER_CANCELLED";
  }
  if (/\bMARKET_DATA_TIMEOUT\b/i.test(msg) || name === "TimeoutError" || isTimeoutAbort(err)) {
    return "MARKET_DATA_TIMEOUT";
  }
  if (/\bMARKET_DATA_UNAVAILABLE\b/i.test(msg)) {
    return "MARKET_DATA_UNAVAILABLE";
  }
  if (
    /\bREQUEST_ABORTED\b/i.test(msg) ||
    name === "AbortError" ||
    (/This operation was aborted/i.test(msg) && !isTimeoutAbort(err))
  ) {
    return "REQUEST_ABORTED";
  }
  if (
    /Yahoo Finance error|No quote data|tickstream quote|market data unavailable|unavailable/i.test(
      msg
    )
  ) {
    return "MARKET_DATA_UNAVAILABLE";
  }
  if (isAbortLike(err)) {
    return isTimeoutAbort(err) ? "MARKET_DATA_TIMEOUT" : "REQUEST_ABORTED";
  }
  return "INTERNAL_ERROR";
}

/** User-facing WAIT copy — never LONG/SHORT; never raw "This operation was aborted". */
export function formatMarketDataWaitReply(kind: MarketDataFailureKind): string {
  switch (kind) {
    case "MARKET_DATA_TIMEOUT":
      return (
        "WAIT — MARKET_DATA_TIMEOUT — current market data could not be confirmed in time. " +
        "No LONG/SHORT. Click RECONNECT and try again."
      );
    case "MARKET_DATA_UNAVAILABLE":
      return (
        "WAIT — MARKET_DATA_UNAVAILABLE — current market data is unavailable. " +
        "No LONG/SHORT. Click RECONNECT and try again."
      );
    case "REQUEST_ABORTED":
      return (
        "WAIT — REQUEST_ABORTED — the desk request was aborted before market data finished. " +
        "No LONG/SHORT."
      );
    case "USER_CANCELLED":
      return "WAIT — USER_CANCELLED — request cancelled. No LONG/SHORT.";
    case "INTERNAL_ERROR":
    default:
      return (
        "WAIT — INTERNAL_ERROR — market data failed. No LONG/SHORT. " +
        "Click RECONNECT and try again."
      );
  }
}

export function mapFetchAbortToMarketDataError(
  err: unknown,
  source: "yahoo" | "tickstream"
): MarketDataError {
  const label = source === "yahoo" ? "Yahoo OHLC" : "Tickstream quote";
  if (isTimeoutAbort(err)) {
    return new MarketDataError(
      "MARKET_DATA_TIMEOUT",
      `MARKET_DATA_TIMEOUT — ${label} timed out`,
      { cause: err }
    );
  }
  if (isAbortLike(err)) {
    return new MarketDataError(
      "REQUEST_ABORTED",
      `REQUEST_ABORTED — ${label} aborted`,
      { cause: err }
    );
  }
  if (err instanceof MarketDataError) return err;
  const msg = err instanceof Error ? err.message : String(err ?? "unknown");
  return new MarketDataError(
    "MARKET_DATA_UNAVAILABLE",
    `MARKET_DATA_UNAVAILABLE — ${label}: ${msg}`,
    { cause: err }
  );
}
