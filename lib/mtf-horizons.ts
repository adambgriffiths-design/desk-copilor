/**
 * Short / medium / long-term desk read from existing bias stack + chart TF.
 * No extra market fetch — maps daily / 15-minute / 5-minute / chart candles.
 */

import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import type { ReadonlyMarketObservation } from "./desk-schema";

export type MtfHorizonBlock = {
  chart_timeframe: string;
  short_label: string;
  medium_label: string;
  long_label: string;
  short: string;
  medium: string;
  long: string;
};

export function normalizeChartTimeframe(tf?: string | null): string {
  const s = String(tf || "1").trim().toLowerCase();
  if (s === "1" || s === "1m") return "1-minute";
  if (s === "5" || s === "5m") return "5-minute";
  if (s === "15" || s === "15m") return "15-minute";
  if (s === "60" || s === "1h" || s === "60m") return "1-hour";
  if (s === "240" || s === "4h") return "4-hour";
  if (s === "d" || s === "1d" || s === "day" || s === "daily") return "daily";
  return s || "1-minute";
}

export function resolveHorizonLabels(chartTf?: string | null): {
  short: string;
  medium: string;
  long: string;
} {
  const tf = normalizeChartTimeframe(chartTf);
  if (tf === "daily" || tf === "4-hour") {
    return { short: tf, medium: "15-minute and 5-minute", long: "daily premium/discount" };
  }
  if (tf === "1-hour") {
    return { short: "1-hour", medium: "15-minute", long: "daily" };
  }
  if (tf === "15-minute") {
    return { short: "15-minute", medium: "5-minute", long: "daily" };
  }
  if (tf === "5-minute") {
    return { short: "5-minute", medium: "15-minute", long: "daily" };
  }
  return { short: "1-minute", medium: "5-minute and 15-minute", long: "daily" };
}

function lean(bias: string | undefined): string {
  if (bias === "bullish") return "bullish";
  if (bias === "bearish") return "bearish";
  if (bias === "neutral" || bias === "mixed" || bias === "conflicted") return "neutral";
  return "unclear";
}

function fvgClause(obs: ReadonlyMarketObservation): string {
  if (obs.fvg.status === "present") {
    const dir = obs.fvg.direction && obs.fvg.direction !== "unknown" ? `${obs.fvg.direction} ` : "";
    if (obs.fvg.top != null && obs.fvg.bottom != null) {
      const lo = Math.min(obs.fvg.top, obs.fvg.bottom).toFixed(2);
      const hi = Math.max(obs.fvg.top, obs.fvg.bottom).toFixed(2);
      return `unfilled ${dir}fair value gap ${lo}–${hi}`;
    }
    return `unfilled ${dir}fair value gap`;
  }
  if (obs.fvg.status === "absent") return "no unfilled fair value gap in lookback";
  if (obs.fvg.status === "invalidated") return "fair value gap filled or inverted";
  return "fair value gap unclear";
}

/** Build three-horizon copy from pipeline facts already on hand. */
export function buildMtfHorizonSummaries(input: {
  observation: ReadonlyMarketObservation;
  ctx?: MarketContext;
  state?: MarketState;
}): MtfHorizonBlock {
  const chartTf = normalizeChartTimeframe(input.state?.timeframe);
  const labels = resolveHorizonLabels(input.state?.timeframe);
  const obs = input.observation;
  const ctx = input.ctx;

  const disp =
    obs.displacement === "present"
      ? "displacement present"
      : obs.displacement === "absent"
        ? "no displacement"
        : "displacement unclear";

  const short = `Short term (${labels.short}, this chart): structure is ${obs.market_structure}; ${disp}; ${fvgClause(obs)}.`;

  const mediumParts = [`Medium term (${labels.medium}):`];
  if (labels.medium.includes("5-minute")) mediumParts.push(`five-minute lean ${lean(obs.htf_bias.m5)}`);
  if (labels.medium.includes("15-minute")) mediumParts.push(`fifteen-minute lean ${lean(obs.htf_bias.m15)}`);
  if (ctx?.timeframe15m) {
    mediumParts.push(
      `fifteen-minute range ${ctx.timeframe15m.low.toFixed(2)}–${ctx.timeframe15m.high.toFixed(2)}`
    );
  }
  if (ctx?.timeframe5m) {
    mediumParts.push(
      `five-minute range ${ctx.timeframe5m.low.toFixed(2)}–${ctx.timeframe5m.high.toFixed(2)}`
    );
  }
  const medium = mediumParts.join("; ").replace(":;", ":") + ".";

  const pdh = ctx?.htfPdArrays?.previousDay;
  const pd =
    obs.premium_discount.zone !== "unknown"
      ? `price in ${obs.premium_discount.zone}`
      : "premium/discount unclear";
  const longBits = [
    `Long term (${labels.long}): daily lean ${lean(obs.htf_bias.daily)}`,
    pd,
  ];
  if (pdh) {
    longBits.push(
      `previous day high ${pdh.high.toFixed(2)}, previous day low ${pdh.low.toFixed(2)}`
    );
  }
  const long = longBits.join("; ") + ".";

  return {
    chart_timeframe: chartTf,
    short_label: labels.short,
    medium_label: labels.medium,
    long_label: labels.long,
    short,
    medium,
    long,
  };
}
