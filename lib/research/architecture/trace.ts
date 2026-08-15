import type { DecisionEnvelope, HorizonLean } from "../../decision-envelope";
import type { DeskPipelineResult, ReadonlyMarketObservation } from "../../desk-schema";
import type { MarketContext } from "../../types";
import type {
  ArchitectureVersionId,
  ConceptStatus,
  ConceptUsage,
  DecisionTrace,
  EvidenceClass,
  LabeledHorizon,
} from "./types";

function usageOf(detected: boolean, used: boolean, influential: boolean): ConceptUsage {
  if (influential) return "INFLUENTIAL";
  if (used) return "USED";
  if (detected) return "DETECTED";
  return "IGNORED";
}

export function conceptStatusesFromEnvelope(env: DecisionEnvelope): ConceptStatus[] {
  return env.reasoningChain.map((item) => {
    const detected = item.detected;
    const used = item.usedInDecision;
    const influential = used && item.role === "PRIMARY";
    return {
      concept: item.concept,
      detected,
      used,
      influential,
      usage: usageOf(detected, used, influential),
      role: item.role,
      outcome: item.outcome,
      evidence: [
        item.evidence.source,
        item.evidence.status,
        item.evidence.candleId,
        item.evidence.candleTime,
      ]
        .filter(Boolean)
        .join(" "),
      contribution: item.impact,
    };
  });
}

function mapLean(raw: string | undefined): HorizonLean {
  if (raw === "bullish" || raw === "bearish") return raw;
  if (raw === "neutral" || raw === "mixed") return "neutral";
  return "unclear";
}

function executionLean(env: DecisionEnvelope): HorizonLean {
  if (env.read.tradeDirection === "LONG") return "bullish";
  if (env.read.tradeDirection === "SHORT") return "bearish";
  return "neutral";
}

export function marketHorizonsFromObservation(
  obs: ReadonlyMarketObservation,
  env: DecisionEnvelope
): { htfContext: LabeledHorizon; tactical: LabeledHorizon; execution: LabeledHorizon } {
  return {
    htfContext: {
      role: "HTF_CONTEXT",
      timeframe: env.htfContext.timeframe || env.read.htfContext.horizon || "daily",
      lean: mapLean(obs.htf_bias.tradeable_bias),
    },
    tactical: {
      role: "TACTICAL_TF",
      timeframe: env.primaryHorizon.timeframe || env.read.currentStructure.horizon || "1m",
      lean: mapLean(obs.market_structure === "unclear" ? "unclear" : obs.market_structure),
    },
    execution: {
      role: "EXECUTION_TF",
      timeframe: env.primaryHorizon.timeframe || "1m",
      lean: executionLean(env),
    },
  };
}

function unlabeledLean(h: LabeledHorizon): boolean {
  return !h.timeframe || !h.lean;
}

export function assertLabeledHorizons(trace: DecisionTrace): string[] {
  const errors: string[] = [];
  for (const h of [trace.htfContext, trace.tactical, trace.execution]) {
    if (unlabeledLean(h)) errors.push(`${h.role} missing timeframe or lean`);
  }
  return errors;
}

export function classifyRegime(obs: ReadonlyMarketObservation, ctx?: MarketContext): string {
  const htf = obs.htf_bias.tradeable_bias;
  const ltf = obs.market_structure;
  if (htf === "bullish" && ltf === "bullish") return "aligned_bullish";
  if (htf === "bearish" && ltf === "bearish") return "aligned_bearish";
  if (
    (htf === "bullish" && ltf === "bearish") ||
    (htf === "bearish" && ltf === "bullish")
  ) {
    return "htf_ltf_conflict";
  }
  if (ctx?.premiumDiscount.vsCurrentDayRange === "premium") return "premium_unclear";
  if (ctx?.premiumDiscount.vsCurrentDayRange === "discount") return "discount_unclear";
  return "unclear";
}

export function buildDecisionTrace(input: {
  pipeline: Pick<DeskPipelineResult, "observation" | "decision" | "state_hash">;
  envelope: DecisionEnvelope;
  architectureVersion: ArchitectureVersionId;
  timestamp: string;
  datasetId: string;
  symbol: string;
  overlayApplied: boolean;
  overlayReason: string;
  evidenceClass: EvidenceClass;
  originalObservation?: ReadonlyMarketObservation;
  ctx?: MarketContext;
}): DecisionTrace {
  const obs = input.originalObservation ?? input.pipeline.observation;
  const env = input.envelope;
  const horizons = marketHorizonsFromObservation(obs, env);
  return {
    schemaVersion: "1.0",
    architectureVersion: input.architectureVersion,
    timestamp: input.timestamp,
    snapshotId: obs.state_hash || input.pipeline.state_hash || env.reasoningChain[0]?.evidence.snapshotId || "unknown",
    datasetId: input.datasetId,
    symbol: input.symbol,
    session: obs.session,
    timeframe: horizons.tactical.timeframe,
    regime: classifyRegime(obs, input.ctx),
    htfContext: horizons.htfContext,
    tactical: horizons.tactical,
    execution: horizons.execution,
    concepts: conceptStatusesFromEnvelope(env),
    conflicts: {
      disagree: env.conflictLog.disagree,
      between: env.conflictResolution.between,
      resolution: env.conflictResolution.sentence,
      ltfAgainstHtfAllowed: env.conflictLog.ltfAgainstHtfAllowed,
      winner: env.conflictResolution.winner,
    },
    stance: env.stance,
    pipelineVerdict: input.pipeline.decision.verdict,
    entry: input.pipeline.decision.entry_zone,
    target:
      input.pipeline.decision.target != null
        ? String(input.pipeline.decision.target)
        : env.read.target,
    invalidation:
      input.pipeline.decision.invalidation != null
        ? String(input.pipeline.decision.invalidation)
        : env.read.invalidation,
    confidence: env.confidence,
    overlayApplied: input.overlayApplied,
    overlayReason: input.overlayReason,
    evidenceClass: input.evidenceClass,
    envelope: env,
  };
}
