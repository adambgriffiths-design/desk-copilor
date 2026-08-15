/**
 * Quality gate before trading verdicts — fast ack allowed; premature verdict is not.
 */
import type { DeskMarketIntelligence } from "./market-intelligence";
import { auditDataQuality } from "./data-quality-check";
import { buildAnalysisContract, formatAnalysisContract, validateContractNoInvention } from "./analysis-contract";
import { runDecisionPipeline } from "./desk-pipeline";
import type { AnalysisDepth } from "./analysis-depth";
import { requiresDeepAnalysisPipeline } from "./analysis-depth";
import type { DecisionEnvelope } from "./decision-envelope";
import { formatCanonicalEnvelopeForPrompt } from "./decision-contract-output";

import { bumpLiveLatency, noteLiveLatency } from "./live-latency-profile";
import {
  type MarketDataFailureKind,
  formatMarketDataWaitReply,
} from "./market-data-errors";

export type QualityGateResult = {
  canDeliverVerdict: boolean;
  canAcknowledge: boolean;
  missing: string[];
  dataQuality: "GOOD" | "DEGRADED" | "INSUFFICIENT";
  waitReason: string | null;
  contractErrors: string[];
  decisionEnvelope?: DecisionEnvelope;
  envelopeText?: string;
};

function mapQuality(
  flag: string
): "GOOD" | "DEGRADED" | "INSUFFICIENT" {
  if (flag === "missing" || flag === "stale") return "INSUFFICIENT";
  if (flag === "degraded") return "DEGRADED";
  return "GOOD";
}

let lastGateCache: { stateHash: string; depth: AnalysisDepth; result: QualityGateResult } | null =
  null;

export function resetQualityGateCache(): void {
  lastGateCache = null;
}

/**
 * Synthetic gate when OHLC/market fetch never completed — preserves WAIT semantics
 * without inventing a DecisionEnvelope LONG/SHORT.
 */
export function marketDataFailureQualityGate(
  kind: MarketDataFailureKind
): QualityGateResult {
  const waitReason = formatMarketDataWaitReply(kind);
  return {
    canDeliverVerdict: false,
    canAcknowledge: true,
    missing: [kind],
    dataQuality: "INSUFFICIENT",
    waitReason,
    contractErrors: [],
  };
}

/** Verify market data and observations before Karen states a trading verdict. */
export function evaluateAnalysisQualityGate(
  intel: DeskMarketIntelligence,
  depth: AnalysisDepth = "DEEP_ANALYSIS"
): QualityGateResult {
  if (lastGateCache && lastGateCache.stateHash === intel.state_hash && lastGateCache.depth === depth) {
    bumpLiveLatency("quality_gate_reuse");
    noteLiveLatency("quality_gate=hit");
    return lastGateCache.result;
  }

  const missing: string[] = [];
  const audit = auditDataQuality(intel.ctx, intel.state);
  const obs = intel.observation;

  if (!audit.can_observe) missing.push("OHLC / market state unavailable");
  if (!audit.timestamp_aligned) missing.push("bar timestamps not aligned with live price");
  if (intel.state.lastPrice <= 0 || !Number.isFinite(intel.state.lastPrice)) {
    missing.push("current price unknown");
  }
  if (obs.data_quality === "missing" || obs.data_quality === "stale") {
    missing.push(`market data ${obs.data_quality}`);
  }
  if (requiresDeepAnalysisPipeline(depth)) {
    if (obs.market_structure === "unknown") missing.push("market structure not confirmed");
    if (obs.htf_bias.tradeable_bias === "unknown") missing.push("higher-timeframe bias unknown");
  }

  const pipeline = runDecisionPipeline(intel.ctx, intel.state);
  const contract = buildAnalysisContract(pipeline.deskPipeline, intel.ctx, intel.state);
  const contractErrors = validateContractNoInvention(contract, obs);

  const dataQuality = mapQuality(obs.data_quality);
  const criticalMissing = missing.filter((m) =>
    /unavailable|missing|stale|unknown|not aligned/i.test(m)
  );

  let canDeliverVerdict = audit.can_decide && criticalMissing.length === 0;
  if (contract.data_quality === "INSUFFICIENT" && contract.verdict !== "NO_TRADE") {
    canDeliverVerdict = false;
    if (!missing.includes("insufficient data for directional call")) {
      missing.push("insufficient data for directional call");
    }
  }
  if (contractErrors.length) {
    canDeliverVerdict = false;
    missing.push(...contractErrors);
  }

  const waitReason =
    !canDeliverVerdict && missing.length
      ? `WAIT — ${missing.slice(0, 4).join("; ")}`
      : null;

  const result: QualityGateResult = {
    canDeliverVerdict,
    canAcknowledge: true,
    missing,
    dataQuality,
    waitReason,
    contractErrors,
    decisionEnvelope: contract.decision,
    // Canonical structured envelope once (+ STANCE ROLE / WAIT FOR only).
    // Do not use formatUnifiedDecisionOutput here — it re-states STANCE/FACTS/THESIS/TARGET.
    envelopeText: contract.decision
      ? formatCanonicalEnvelopeForPrompt(contract.decision)
      : formatAnalysisContract(contract),
  };
  lastGateCache = { stateHash: intel.state_hash, depth, result };
  return result;
}

/** Prompt block injected for DEEP_ANALYSIS — conditional tone, no transcript-only answers. */
export function formatQualityGateForPrompt(gate: QualityGateResult): string {
  const lines = [
    "QUALITY GATE (mandatory for trading verdicts):",
    "- Acknowledgement may be immediate; the verdict must wait for validated observations.",
    "- Do NOT answer from the transcript or memory alone — every price/level must come from the intelligence block.",
    "- Copy the DECISION ENVELOPE below. Separate MENTOR VIEW (what the market is doing) from TRADE DECISION (what you would actually trade). Seven layers first: HTF CONTEXT → CURRENT STRUCTURE → TRADEABLE OPPORTUNITY → TRADE DIRECTION → TARGET → INVALIDATION → OVERALL STANCE.",
    "- Then STRATEGIC BIAS → TACTICAL BIAS → EXECUTION, then FACTS | INTERPRETATION | DECISION | INVALIDATION and REASONING CHAIN. One STANCE: long | short | flat | wait | monitor.",
    "- Never unlabeled bullish/bearish/LONG/SHORT. Incomplete thesis cannot be named long/short (wait or monitor). Chain rows distinguish detected vs used (PRIMARY / SUPPORTING / NONE).",
    "- Visible text MUST NOT contradict the envelope. stance=flat must not become \"I'd look for a long\". Explain bullish evidence in MENTOR VIEW without converting TRADE DECISION.",
    "- WAIT must state WAIT FOR: exact condition. Never \"WAIT for entry.\" FLAT = no trade justified. MONITOR = observing, no active thesis.",
    "- Never say you are leaning long/bullish (or short) while stance is flat/wait/monitor unless you include the CONFLICT LOG and the chain impact that produced that stance.",
    "- Never sound certain just because you responded quickly.",
  ];
  if (!gate.canDeliverVerdict) {
    lines.push(
      `- Data gate FAILED — do NOT guess. State exactly what is missing: ${gate.missing.slice(0, 5).join("; ")}.`,
      "- Stance must be wait or monitor until observations confirm. Do not invent a long or short.",
      gate.waitReason ? `- Required opener tone: "${gate.waitReason}."` : ""
    );
  } else if (gate.dataQuality === "DEGRADED") {
    lines.push("- Data quality DEGRADED — cite uncertainty; prefer wait or flat over a forced entry call.");
  } else {
    lines.push(
      "- Cite actual observations in FACTS; INTERPRETATION is meaning only; DECISION is one stance that cites the chain.",
      "- If stance is wait, say the named trigger. If flat, say the conflict. Invalidation must be present."
    );
  }
  if (gate.envelopeText) {
    lines.push("", "DECISION ENVELOPE (source of truth — copy stance and chain; do not contradict):", gate.envelopeText);
  }
  return lines.filter(Boolean).join("\n");
}
