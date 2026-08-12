import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import { isMarketStateUsable } from "./market-state";
import { nearestPdLevels } from "./pd-arrays";
import { getExecutionScaffold } from "./execution-plan";
import type { FeatureSet } from "./decision-types";

function tradeDirection(ctx: MarketContext): "long" | "short" | null {
  const tb = ctx.biasStack.tradeableBias;
  if (tb === "bullish") return "long";
  if (tb === "bearish") return "short";
  if (tb === "conflicted" && ctx.biasStack.dominantBias !== "neutral") {
    return ctx.biasStack.dominantBias === "bullish" ? "long" : "short";
  }
  return null;
}

/** Deterministic ICT feature extraction from MarketState + MarketContext. */
export function extractFeatures(ctx: MarketContext, state: MarketState): FeatureSet {
  const price = state.lastPrice;
  const { support, resistance } = nearestPdLevels(price, ctx.htfPdArrays.levels);
  const mss = ctx.structureFacts.mss;
  const fvgs = ctx.structureFacts.m1UnfilledFvgs;
  const nearestFvg = fvgs.length ? fvgs[fvgs.length - 1] : undefined;

  return {
    marketState: state,
    biasStack: ctx.biasStack,
    premiumDiscount: ctx.premiumDiscount,
    liquidityTargets: {
      pdh: ctx.htfPdArrays.previousDay.high,
      pdl: ctx.htfPdArrays.previousDay.low,
      pdc: ctx.htfPdArrays.previousDay.close,
      sessionHigh: ctx.sessions.nyRthHigh,
      sessionLow: ctx.sessions.nyRthLow,
      ...(support
        ? { nearestSupport: support.price, nearestSupportLabel: support.label }
        : {}),
      ...(resistance
        ? { nearestResistance: resistance.price, nearestResistanceLabel: resistance.label }
        : {}),
      recentSweeps: ctx.structureFacts.liquiditySweeps.length,
    },
    structure: {
      ...(mss
        ? {
            mssDirection: mss.direction,
            mssLevel: mss.level,
            mssDescription: mss.description,
          }
        : {}),
      unfilledFvgCount: fvgs.length,
      ...(nearestFvg ? { nearestFvgDirection: nearestFvg.type } : {}),
      summary: ctx.structureFacts.summary,
    },
    execution: getExecutionScaffold(ctx),
    direction: tradeDirection(ctx),
    dataQualityOk: isMarketStateUsable(state) && state.candles.length >= 20,
  };
}

export function summarizeFeatureSet(features: FeatureSet): Record<string, unknown> {
  return {
    stateHash: features.marketState.stateHash,
    quality: features.marketState.quality.flag,
    bias: features.biasStack.tradeableBias,
    alignedCount: features.biasStack.alignedCount,
    direction: features.direction,
    entryStatus: features.execution?.entryStatus,
    call: features.execution?.call,
    mss: features.structure.mssDirection,
    dataQualityOk: features.dataQualityOk,
  };
}
