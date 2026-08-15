/**
 * Research-only architecture versions.
 * architecture-v1 is a frozen snapshot of production rules — identity overlay.
 * v2/v3 are competing hypotheses applied to cloned observations only.
 */

import { buildDecisionEnvelope, type DecisionEnvelope } from "../../decision-envelope";
import { buildTradingDecision } from "../../decision-layer";
import { buildMarketInterpretation } from "../../interpretation-engine";
import type { DataQualityReport } from "../../data-quality-check";
import type { DeskPipelineResult, ReadonlyMarketObservation } from "../../desk-schema";
import type { MarketContext } from "../../types";
import type { MarketState } from "../../market-state";
import { cloneObservation, htfOpposesStructure, provenLiquidityTaken } from "./clone";
import type { ArchitectureVersionId, FrozenArchitectureSnapshot } from "./types";

export const ARCHITECTURE_SNAPSHOTS: Record<ArchitectureVersionId, FrozenArchitectureSnapshot> = {
  "architecture-v1": {
    id: "architecture-v1",
    name: "Production current (stay-flat on HTF vs LTF)",
    hypothesisId: null,
    description:
      "Frozen snapshot of the live envelope + pipeline. Neither HTF nor LTF automatically wins a conflict. Production path. Not claimed optimal.",
    production: true,
    conceptRules:
      "Playbook checklist always emitted. Detected ≠ used. Verdict uses interpretation confluence (≥2 reasons, known structure+FVG, no opposing-bias contradiction) plus session stay-out and both-sides.",
    conflictRules:
      "primary_vs_htf → stay flat, winner=neither, ltfAgainstHtfAllowed=false unless pipeline already LONG/SHORT against HTF. session_stay_out and both_sides block longs/direction as in production.",
    weights: "none",
    horizonRules:
      "HTF = daily/tradeable_bias context only. Primary = chart/1m structure. Stance is about the primary horizon. Unlabeled bullish/bearish is invalid.",
    entryRules:
      "Production getExecutionScaffold + observation FVG zone. WAIT if entryStatus WAIT/EXTENDED. No new entry model.",
    overlay: "identity",
  },
  "architecture-v2": {
    id: "architecture-v2",
    name: "LTF may override HTF on proven liquidity event",
    hypothesisId: "H-B",
    description:
      "Research overlay: when HTF opposes LTF AND a proven PDH/PDL take exists, neutralize the HTF veto so tactical structure can produce a one-sided case. Not production. Not tuned for P&L.",
    production: false,
    conceptRules:
      "Same detectors as v1. Overlay only removes the HTF-vs-structure contradiction when proven PDH/PDL liquidity is present.",
    conflictRules:
      "On proven liquidity + HTF/LTF disagreement, research path allows LTF to proceed (ltfAgainstHtfAllowed intended true if directional). Without proven liquidity, identical to v1.",
    weights: "none",
    horizonRules: "Same horizon labels as v1. Market HTF lean is preserved on the research trace even if the overlay clone is neutralized.",
    entryRules: "Unchanged production entry scaffold.",
    overlay: "ltf_override_on_proven_liquidity",
  },
  "architecture-v3": {
    id: "architecture-v3",
    name: "HTF is context and does not block tactical",
    hypothesisId: "H-C",
    description:
      "Research overlay: HTF lean remains labeled context on the trace, but the cloned observation does not use tradeable_bias as a veto. Tests whether HTF-as-context (hypothesis C) changes decisions vs stay-flat. Not production.",
    production: false,
    conceptRules: "Same detectors as v1. HTF veto stripped on the clone only.",
    conflictRules:
      "HTF/LTF disagreement does not stay-flat via the opposing-bias contradiction. Session stay-out and both-sides still apply (production helpers on the clone).",
    weights: "none",
    horizonRules: "Market HTF context still recorded on the trace from the original observation.",
    entryRules: "Unchanged production entry scaffold.",
    overlay: "htf_context_no_tactical_block",
  },
};

export function architectureSnapshot(id: ArchitectureVersionId): FrozenArchitectureSnapshot {
  return ARCHITECTURE_SNAPSHOTS[id];
}

export function applyArchitectureOverlay(
  obs: ReadonlyMarketObservation,
  version: ArchitectureVersionId
): { observation: ReadonlyMarketObservation; overlayApplied: boolean; overlayReason: string } {
  if (version === "architecture-v1") {
    return { observation: obs, overlayApplied: false, overlayReason: "identity — production observation" };
  }

  const clone = cloneObservation(obs);

  if (version === "architecture-v2") {
    if (!htfOpposesStructure(obs)) {
      return {
        observation: obs,
        overlayApplied: false,
        overlayReason: "no HTF vs structure conflict — overlay idle",
      };
    }
    if (!provenLiquidityTaken(obs)) {
      return {
        observation: obs,
        overlayApplied: false,
        overlayReason: "HTF conflict present but no proven PDH/PDL take — v2 requires liquidity event",
      };
    }
    clone.htf_bias = {
      ...clone.htf_bias,
      tradeable_bias: clone.market_structure,
      aligned: true,
    };
    return {
      observation: clone,
      overlayApplied: true,
      overlayReason: "v2 neutralized HTF veto after proven PDH/PDL take",
    };
  }

  // architecture-v3
  if (!htfOpposesStructure(obs)) {
    return {
      observation: obs,
      overlayApplied: false,
      overlayReason: "no HTF veto to strip",
    };
  }
  clone.htf_bias = {
    ...clone.htf_bias,
    tradeable_bias: "neutral",
    aligned: true,
  };
  return {
    observation: clone,
    overlayApplied: true,
    overlayReason: "v3 HTF tradeable_bias neutralized so it cannot block tactical",
  };
}

export type OverlayDecision = {
  observation: ReadonlyMarketObservation;
  interpretation: DeskPipelineResult["interpretation"];
  decision: DeskPipelineResult["decision"];
  envelope: DecisionEnvelope;
  overlayApplied: boolean;
  overlayReason: string;
};

/** Re-run interpretation+decision+envelope on a research clone. Production pipeline untouched. */
export function evaluateArchitectureVersion(input: {
  observation: ReadonlyMarketObservation;
  ctx: MarketContext;
  state?: MarketState;
  dataQuality: DataQualityReport | undefined;
  version: ArchitectureVersionId;
}): OverlayDecision {
  const { observation: overlayObs, overlayApplied, overlayReason } = applyArchitectureOverlay(
    input.observation,
    input.version
  );
  const interpretation = buildMarketInterpretation(overlayObs);
  const decision = buildTradingDecision(overlayObs, interpretation, input.ctx);
  const envelope = buildDecisionEnvelope(
    {
      observation: overlayObs,
      interpretation,
      decision,
      data_quality_report: input.dataQuality,
    },
    input.ctx,
    input.state
  );
  return { observation: overlayObs, interpretation, decision, envelope, overlayApplied, overlayReason };
}
