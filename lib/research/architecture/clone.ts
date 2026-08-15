import type { MarketObservation, ReadonlyMarketObservation } from "../../desk-schema";
import type { MarketContext } from "../../types";
import type { MarketState } from "../../market-state";

/** JSON clone — research copies of frozen production objects. Never mutate production. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneObservation(obs: ReadonlyMarketObservation): MarketObservation {
  return cloneJson(obs);
}

export function cloneContext(ctx: MarketContext): MarketContext {
  return cloneJson(ctx);
}

export function cloneState(state: MarketState): MarketState {
  return cloneJson(state);
}

export function provenLiquidityTaken(obs: ReadonlyMarketObservation): boolean {
  return obs.liquidity.levels.some(
    (l) =>
      (l.label === "PDH" || l.label === "PDL") &&
      l.taken === true &&
      (l.status === "CLOSED_BEYOND" || Boolean(l.candleId && l.qualifyingTickAt))
  );
}

export function htfOpposesStructure(obs: ReadonlyMarketObservation): boolean {
  const bias = obs.htf_bias.tradeable_bias;
  const structure = obs.market_structure;
  return (
    (bias === "bullish" && structure === "bearish") ||
    (bias === "bearish" && structure === "bullish")
  );
}
