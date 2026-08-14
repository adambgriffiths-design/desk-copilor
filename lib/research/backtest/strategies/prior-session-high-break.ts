import type { StrategyContext, SetupProposal } from "../types";

/**
 * Demo strategy plugin — enter long when price crosses above prior session high (PDH).
 * Uses only point-in-time features at T; not baked into the engine.
 */
export const priorSessionHighBreakStrategy = {
  id: "prior-session-high-break",
  name: "Long on PDH cross",
  maxBarsPending: 3,
  maxBarsInTrade: 30,

  detectSetup(ctx: StrategyContext): SetupProposal | null {
    const { snapshot, bar, barsAtT } = ctx;
    const pdh = snapshot.features.pdh;
    if (!Number.isFinite(pdh) || pdh <= 0) return null;
    if (barsAtT.length < 2) return null;

    const prev = barsAtT.at(-2)!;
    const crossedAbove = prev.close <= pdh && bar.close > pdh;
    if (!crossedAbove) return null;

    const entry = bar.close;
    const stop = Math.min(prev.low, bar.low) - 5;
    const target = entry + (entry - stop) * 2;

    return {
      setupType: "prior-session-high-break",
      direction: "LONG",
      entry,
      stop,
      target,
      features: {
        _detectedAt: snapshot.asOf,
        pdh,
        crossBarClose: bar.close,
        sessionHighAtCutoff: snapshot.features.sessionHighAtCutoff,
        bias: snapshot.features.bias,
        m1FvgCount: snapshot.features.m1FvgCount,
      },
    };
  },
};

export type DemoStrategyId = "prior-session-high-break";

export const DEMO_STRATEGIES: Record<DemoStrategyId, typeof priorSessionHighBreakStrategy> = {
  "prior-session-high-break": priorSessionHighBreakStrategy,
};

export function getDemoStrategy(id: string): typeof priorSessionHighBreakStrategy | null {
  return DEMO_STRATEGIES[id as DemoStrategyId] ?? null;
}
