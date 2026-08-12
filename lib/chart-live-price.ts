import type { MarketContext } from "./types";

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

/** Prefer TradingView last print over stale Yahoo 1m bar close. */
export function resolveLiveLastPrice(
  barClose: number | null | undefined,
  chartLastPrice?: number | null
): number {
  if (chartLastPrice != null && isMnqChartPrice(chartLastPrice)) {
    return roundMnq(chartLastPrice);
  }
  return barClose ?? 0;
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
