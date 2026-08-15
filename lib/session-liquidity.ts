/**
 * Session / PD liquidity interpretation — BSL vs SSL.
 *
 * ICT: sweeping a high takes buy-side liquidity (stops above the high). That is a
 * raid, not a bullish continuation. Sweeping a low takes sell-side liquidity.
 * London taking Asia session high (ASH) is the classic Judas / BSL raid.
 */

import type { ReadonlyMarketObservation } from "./desk-schema";

export type LiquidityPoolSide = "buy_side" | "sell_side" | "unknown";

export type LiquidityLevelLike = {
  label: string;
  price: number;
  taken: boolean | "unknown";
  side?: LiquidityPoolSide;
};

export function classifyLevelSide(
  label: string,
  explicit?: LiquidityPoolSide | string | null
): LiquidityPoolSide {
  if (explicit === "buy_side" || explicit === "sell_side") return explicit;
  const s = label.toLowerCase();
  if (/\b(pdh|reh)\b/.test(s) || /\bhighs?\b/.test(s)) return "buy_side";
  if (/\b(pdl|rel)\b/.test(s) || /\blows?\b/.test(s)) return "sell_side";
  return "unknown";
}

export function isAsiaHighLevel(label: string, levelId?: string): boolean {
  const s = `${label} ${levelId ?? ""}`.toLowerCase().replace(/[_-]+/g, " ");
  return s.includes("asia high") || /\bash\b/.test(s);
}

export function takenLevels(obs: ReadonlyMarketObservation): LiquidityLevelLike[] {
  return obs.liquidity.levels.filter((l) => l.taken === true);
}

export function bslTaken(obs: ReadonlyMarketObservation): boolean {
  return takenLevels(obs).some((l) => classifyLevelSide(l.label, l.side) === "buy_side");
}

export function sslTaken(obs: ReadonlyMarketObservation): boolean {
  return takenLevels(obs).some((l) => classifyLevelSide(l.label, l.side) === "sell_side");
}

/** Highs taken, lows not — BSL raid is not a long. */
export function isBslOnlyRaid(obs: ReadonlyMarketObservation): boolean {
  return bslTaken(obs) && !sslTaken(obs);
}

export function isLondonAsiaHighRaid(obs: ReadonlyMarketObservation): boolean {
  if (obs.session !== "london") return false;
  return takenLevels(obs).some((l) => isAsiaHighLevel(l.label));
}

/** Block LONG from a high being taken. Do not auto-force SHORT. */
export function shouldBlockLongFromSessionLiquidity(obs: ReadonlyMarketObservation): boolean {
  if (isLondonAsiaHighRaid(obs)) return true;
  return isBslOnlyRaid(obs);
}

export function describeSweptLevel(label: string, side: LiquidityPoolSide): string {
  if (side === "buy_side") {
    return `${label} taken (buy-side liquidity — raid on highs, not a bullish continuation)`;
  }
  if (side === "sell_side") {
    return `${label} taken (sell-side liquidity — raid on lows, not a bearish continuation)`;
  }
  return `${label} taken`;
}

export function describeSweepFact(side: LiquidityPoolSide, price: string, at: string): string {
  if (side === "buy_side") {
    return `buy-side liquidity taken (raid on highs — not bullish) at ${price} (${at})`;
  }
  if (side === "sell_side") {
    return `sell-side liquidity taken (raid on lows — not bearish) at ${price} (${at})`;
  }
  return `liquidity taken at ${price} (${at})`;
}

export function sweptStatusNote(side: LiquidityPoolSide): string {
  if (side === "buy_side") return "swept — buy-side liquidity (raid on highs, not bullish)";
  if (side === "sell_side") return "swept — sell-side liquidity (raid on lows, not bearish)";
  return "swept";
}

export function sessionLiquidityStayFlatReason(obs: ReadonlyMarketObservation): string | null {
  if (isLondonAsiaHighRaid(obs)) {
    return "Stay flat — Asia high taken in London is a buy-side liquidity raid, not a reason to flip bullish. Look for displacement or continuation lower, or wait until one-minute structure confirms. A high being taken is not a long.";
  }
  if (isBslOnlyRaid(obs)) {
    const highs = takenLevels(obs)
      .filter((l) => classifyLevelSide(l.label, l.side) === "buy_side")
      .map((l) => l.label);
    return `Stay flat — ${highs.join(", ") || "session high"} taken is buy-side liquidity (raid on highs), not a bullish continuation. Do not recommend longs because a high was swept. Wait for displacement/structure confirmation; do not auto-force a short from the raid alone.`;
  }
  return null;
}
