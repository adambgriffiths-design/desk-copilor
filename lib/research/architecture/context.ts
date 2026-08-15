import type { ReadonlyMarketObservation } from "../../desk-schema";
import type { MarketContext } from "../../types";
import type { HorizonLean } from "../../decision-envelope";
import type { MarketDecisionContext } from "./types";

function lean(raw: string | undefined): HorizonLean {
  if (raw === "bullish" || raw === "bearish") return raw;
  if (raw === "neutral" || raw === "mixed") return "neutral";
  return "unclear";
}

function parsePrice(n: number | undefined | null): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

/** Market context around a decision — enables “when is X useful?” not “is X always useful?” */
export function buildMarketDecisionContext(input: {
  observation: ReadonlyMarketObservation;
  ctx?: MarketContext;
  lastPrice?: number | null;
}): MarketDecisionContext {
  const { observation: obs, ctx, lastPrice } = input;
  const levels = obs.liquidity.levels;
  const pdh = levels.find((l) => l.label === "PDH");
  const pdl = levels.find((l) => l.label === "PDL");
  const price = lastPrice ?? ctx?.daily.lastClose ?? null;
  let nearest: { label: string; dist: number } | null = null;
  if (price != null) {
    for (const l of levels) {
      const dist = Math.abs(l.price - price);
      if (!nearest || dist < nearest.dist) nearest = { label: l.label, dist };
    }
  }
  const taken = levels.filter((l) => l.taken === true).map((l) => l.label);
  const htf = lean(obs.htf_bias.tradeable_bias);
  const ltf = lean(obs.market_structure === "unclear" ? "unclear" : obs.market_structure);
  const aligned = htf === ltf && (htf === "bullish" || htf === "bearish");
  return {
    session: obs.session,
    timeOfDay: obs.time_context || ctx?.chartTimeEst || "unknown",
    htfTrend: htf,
    ltfTrend: ltf,
    trendOrRange: aligned ? "trend" : htf === "unclear" && ltf === "unclear" ? "unclear" : "range",
    volProxy:
      obs.displacement === "present" ? "elevated" : obs.displacement === "absent" ? "quiet" : "unknown",
    premiumDiscount: obs.premium_discount.zone,
    distanceFromLiquidity: nearest ? Math.round(nearest.dist * 100) / 100 : null,
    nearestLiquidityLabel: nearest?.label ?? null,
    recentSweep: taken.length > 0,
    recentMss: obs.market_structure === "bullish" || obs.market_structure === "bearish",
    activeFvg: obs.fvg.status === "present",
    activeEqh: obs.reh_rel.status === "known" && obs.reh_rel.reh_levels.length > 0,
    activeEql: obs.reh_rel.status === "known" && obs.reh_rel.rel_levels.length > 0,
    pdh: parsePrice(pdh?.price ?? ctx?.htfPdArrays.previousDay.high),
    pdl: parsePrice(pdl?.price ?? ctx?.htfPdArrays.previousDay.low),
    sessionLiquidityTaken: taken.filter((l) => /asia|london|ny/i.test(l)),
  };
}
