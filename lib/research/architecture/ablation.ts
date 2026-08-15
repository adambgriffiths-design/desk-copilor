/**
 * Research-only ablation â€” mask evidence channels on cloned observation/context.
 * Re-runs interpretation + decision. Does not change production Karen.
 */

import { buildDecisionEnvelope } from "../../decision-envelope";
import { buildTradingDecision } from "../../decision-layer";
import { buildMarketInterpretation } from "../../interpretation-engine";
import type { DataQualityReport } from "../../data-quality-check";
import type { ReadonlyMarketObservation, TradingVerdict } from "../../desk-schema";
import type { DecisionStance } from "../../decision-envelope";
import type { MarketContext } from "../../types";
import type { MarketState } from "../../market-state";
import { cloneContext, cloneObservation } from "./clone";

export const ABLATION_CHANNELS = ["pdh", "eqh_eql", "fvg", "mss", "session", "htf"] as const;
export type AblationChannel = (typeof ABLATION_CHANNELS)[number];

export type AblationResult = {
  channel: AblationChannel;
  baselineVerdict: TradingVerdict;
  ablatedVerdict: TradingVerdict;
  baselineStance: DecisionStance;
  ablatedStance: DecisionStance;
  changed: boolean;
  informationContribution: "changed_decision" | "no_change";
};

function maskObservation(obs: ReadonlyMarketObservation, channel: AblationChannel): ReadonlyMarketObservation {
  const clone = cloneObservation(obs);
  switch (channel) {
    case "pdh":
      clone.liquidity.levels = clone.liquidity.levels.map((l) =>
        /^(PDH|PDL|PDC)$/i.test(l.label)
          ? {
              ...l,
              taken: false as const,
              status: "UNTOUCHED" as const,
              qualifyingTickAt: undefined,
              candleId: undefined,
              why: "research-ablation",
            }
          : l
      );
      break;
    case "eqh_eql":
      clone.reh_rel = {
        status: "unknown",
        nearest_reh_above: null,
        nearest_rel_below: null,
        reh_levels: [],
        rel_levels: [],
        all_levels: [],
      };
      break;
    case "fvg":
      clone.fvg = { status: "absent", direction: "unknown" };
      break;
    case "mss":
      clone.market_structure = "unclear";
      break;
    case "session":
      clone.session = "off_hours";
      clone.liquidity.levels = clone.liquidity.levels.filter((l) => !/asia|london|ny/i.test(l.label));
      break;
    case "htf":
      clone.htf_bias = {
        daily: "unknown",
        m15: "unknown",
        m5: "unknown",
        aligned: "unknown",
        tradeable_bias: "unknown",
      };
      break;
  }
  return clone;
}

function maskContext(ctx: MarketContext, channel: AblationChannel): MarketContext {
  const clone = cloneContext(ctx);
  switch (channel) {
    case "pdh":
      clone.structureFacts.liquiditySweeps = clone.structureFacts.liquiditySweeps.filter(
        (s) => !/^pd[hlc]$/i.test(s.levelId)
      );
      break;
    case "eqh_eql":
      clone.structureFacts.relativeEqualPools = [];
      break;
    case "fvg":
      clone.structureFacts.m1UnfilledFvgs = [];
      clone.structureFacts.m1InvertedFvgs = [];
      break;
    case "mss":
      clone.structureFacts.mss = null;
      break;
    case "htf":
      clone.biasStack.tradeableBias = "neutral";
      clone.biasStack.daily = "neutral";
      clone.biasStack.dominantBias = "neutral";
      break;
    default:
      break;
  }
  return clone;
}

export function ablateChannel(input: {
  observation: ReadonlyMarketObservation;
  ctx: MarketContext;
  state?: MarketState;
  dataQuality?: DataQualityReport;
  baselineVerdict: TradingVerdict;
  baselineStance: DecisionStance;
  channel: AblationChannel;
}): AblationResult {
  const obs = maskObservation(input.observation, input.channel);
  const ctx = maskContext(input.ctx, input.channel);
  const interpretation = buildMarketInterpretation(obs);
  const decision = buildTradingDecision(obs, interpretation, ctx);
  const envelope = buildDecisionEnvelope(
    {
      observation: obs,
      interpretation,
      decision,
      data_quality_report: input.dataQuality,
    },
    ctx,
    input.state
  );
  const changed = decision.verdict !== input.baselineVerdict || envelope.stance !== input.baselineStance;
  return {
    channel: input.channel,
    baselineVerdict: input.baselineVerdict,
    ablatedVerdict: decision.verdict,
    baselineStance: input.baselineStance,
    ablatedStance: envelope.stance,
    changed,
    informationContribution: changed ? "changed_decision" : "no_change",
  };
}

export function ablateAllChannels(
  input: Omit<Parameters<typeof ablateChannel>[0], "channel">
): AblationResult[] {
  return ABLATION_CHANNELS.map((channel) => ablateChannel({ ...input, channel }));
}

const ORDER_GROUPS: Record<string, AblationChannel[]> = {
  htf: ["htf"],
  liq: ["pdh", "session", "eqh_eql"],
  structure: ["mss"],
  entry: ["fvg"],
};

export const INFORMATION_ORDERS = [
  { id: "htf_liq_structure_entry", steps: ["htf", "liq", "structure", "entry"] },
  { id: "htf_structure_liq_entry", steps: ["htf", "structure", "liq", "entry"] },
  { id: "liq_htf_structure_entry", steps: ["liq", "htf", "structure", "entry"] },
] as const;

/** Staged unmasking â€” deterministic contribution order on identical inputs. */
export function stagedInformationOrder(input: {
  observation: ReadonlyMarketObservation;
  ctx: MarketContext;
  state?: MarketState;
  dataQuality?: DataQualityReport;
  orderId: (typeof INFORMATION_ORDERS)[number]["id"];
}): Array<{ step: string; verdict: TradingVerdict; stance: DecisionStance }> {
  const spec = INFORMATION_ORDERS.find((o) => o.id === input.orderId)!;
  const allChannels = ABLATION_CHANNELS.slice();
  const revealed = new Set<AblationChannel>();
  const rows: Array<{ step: string; verdict: TradingVerdict; stance: DecisionStance }> = [];

  for (const step of spec.steps) {
    for (const ch of ORDER_GROUPS[step] ?? []) revealed.add(ch);
    let obs = input.observation;
    let ctx = input.ctx;
    for (const ch of allChannels) {
      if (!revealed.has(ch)) {
        obs = maskObservation(obs, ch);
        ctx = maskContext(ctx, ch);
      }
    }
    const interpretation = buildMarketInterpretation(obs);
    const decision = buildTradingDecision(obs, interpretation, ctx);
    const envelope = buildDecisionEnvelope(
      {
        observation: obs,
        interpretation,
        decision,
        data_quality_report: input.dataQuality,
      },
      ctx,
      input.state
    );
    rows.push({ step, verdict: decision.verdict, stance: envelope.stance });
  }
  return rows;
}
