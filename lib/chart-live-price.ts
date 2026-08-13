import type { MarketContext } from "./types";

/** Max age for TradingView `[data-field="last"]` before rejecting as stale. */
export const LIVE_PRICE_MAX_AGE_MS = 60_000;

/** Max age for cached priceHint.last in extension localStorage. */
export const PRICE_HINT_MAX_AGE_MS = 60_000;

export type LivePriceSource =
  | "tradingview_live"
  | "tradingview_quote"
  | "tickstream_live"
  | "tickstream_quote"
  | "yahoo_bar_close"
  | "tv_bar_close"
  | "price_hint"
  | "none";

export type AuthoritativePrice = {
  value: number;
  source: LivePriceSource;
  timestamp: number;
  ageMs: number;
};

export type LivePriceQuoteInput = {
  chartLastPrice?: number | null;
  chartLastPriceSource?: LivePriceSource | string | null;
  chartLastPriceTs?: number | null;
  barClose?: number | null;
  snapLastPrice?: number | null;
  /** When true, reject Yahoo/bar-close fallbacks (extension + live quote paths). */
  requireTvLive?: boolean;
};

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

/** MNQ index futures — reject volume-axis ~15k false reads. */
export function isMnqChartPrice(n: number): boolean {
  return Number.isFinite(n) && n >= 20000 && n <= 45000;
}

export function parseChartPriceInput(value: unknown): number | null {
  if (typeof value === "number" && isMnqChartPrice(value)) return roundMnq(value);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  const m = cleaned.match(/(\d{4,5}(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isMnqChartPrice(n) ? roundMnq(n) : null;
}

export function isLiveTvPriceSource(source: string | null | undefined): boolean {
  return source === "tradingview_live" || source === "tradingview_quote";
}

export function isTickstreamLiveSource(source: string | null | undefined): boolean {
  return source === "tickstream_live" || source === "tickstream_quote";
}

export function isBarClosePriceSource(source: string | null | undefined): boolean {
  return source === "tv_bar_close" || source === "yahoo_bar_close" || source === "price_hint";
}

export function isAuthoritativeLiveAvailable(quote: AuthoritativePrice | null): boolean {
  return (
    quote != null &&
    (isLiveTvPriceSource(quote.source) || isTickstreamLiveSource(quote.source)) &&
    quote.ageMs <= LIVE_PRICE_MAX_AGE_MS &&
    isMnqChartPrice(quote.value)
  );
}

/** Single resolver — TV live when fresh; no silent stale Yahoo/bar-close when TV expected. */
export function resolveAuthoritativePrice(input: LivePriceQuoteInput): AuthoritativePrice | null {
  const now = Date.now();
  const chartPx = input.chartLastPrice;
  const source = (input.chartLastPriceSource || "none") as LivePriceSource;
  const ts = input.chartLastPriceTs ?? now;

  if (chartPx != null && isMnqChartPrice(chartPx)) {
    const ageMs = Math.max(0, now - ts);

    if (source === "price_hint" && ageMs > PRICE_HINT_MAX_AGE_MS) return null;
    if (source === "tv_bar_close") return null;

    if (isLiveTvPriceSource(source) || isTickstreamLiveSource(source)) {
      if (ageMs > LIVE_PRICE_MAX_AGE_MS) return null;
      return { value: roundMnq(chartPx), source, timestamp: ts, ageMs };
    }

    if (input.requireTvLive) return null;

    if (source === "yahoo_bar_close") {
      return { value: roundMnq(chartPx), source, timestamp: ts, ageMs };
    }
  }

  if (input.requireTvLive) return null;

  const barClose = input.barClose;
  if (barClose != null && isMnqChartPrice(barClose)) {
    return {
      value: roundMnq(barClose),
      source: "yahoo_bar_close",
      timestamp: now,
      ageMs: 0,
    };
  }

  const snapPx = input.snapLastPrice;
  if (snapPx != null && isMnqChartPrice(snapPx) && !input.requireTvLive) {
    return {
      value: roundMnq(snapPx),
      source: "tv_bar_close",
      timestamp: now,
      ageMs: 0,
    };
  }

  return null;
}

/** Prefer fresh TradingView last print; never fall back to bar close when TV live required. */
export function resolveLiveLastPrice(
  barClose: number | null | undefined,
  chartLastPrice?: number | null,
  meta?: { source?: string; timestamp?: number; requireTvLive?: boolean }
): number {
  const auth = resolveAuthoritativePrice({
    barClose,
    chartLastPrice,
    chartLastPriceSource: meta?.source,
    chartLastPriceTs: meta?.timestamp,
    requireTvLive: meta?.requireTvLive,
  });
  return auth?.value ?? 0;
}

/** Spoken price line — includes TickStream provenance when TV bridge is down. */
export function formatAuthoritativePriceAnswer(
  price: number,
  auth?: AuthoritativePrice | null
): string {
  const last = roundMnq(price).toFixed(2);
  const base = `We're trading at ${last} on Nasdaq futures.`;
  if (!auth || !isTickstreamLiveSource(auth.source)) return base;
  const ageSec = Math.round(auth.ageMs / 1000);
  return `${base} Source ${auth.source}; tick ${new Date(auth.timestamp).toISOString()} (${ageSec}s ago).`;
}

export function parseChartPriceMeta(body: Record<string, unknown>): {
  source?: LivePriceSource;
  timestamp?: number;
} {
  const source =
    typeof body.chartLastPriceSource === "string"
      ? (body.chartLastPriceSource as LivePriceSource)
      : undefined;
  const timestamp =
    typeof body.chartLastPriceTs === "number" && Number.isFinite(body.chartLastPriceTs)
      ? body.chartLastPriceTs
      : undefined;
  return { source, timestamp };
}

/** @deprecated Pass chartLastPrice into buildMarketContext instead — only patches lastClose. */
export function withChartLivePrice(
  ctx: MarketContext,
  chartLastPrice?: number | null
): MarketContext {
  if (chartLastPrice == null || !isMnqChartPrice(chartLastPrice)) return ctx;
  const live = roundMnq(chartLastPrice);
  return {
    ...ctx,
    daily: {
      ...ctx.daily,
      lastClose: live,
    },
  };
}
