/**
 * Quality gate before trading verdicts — fast ack allowed; premature verdict is not.
 */
import type { DeskMarketIntelligence } from "./market-intelligence";
import { auditDataQuality } from "./data-quality-check";
import { buildAnalysisContract, validateContractNoInvention } from "./analysis-contract";
import { runDecisionPipeline } from "./desk-pipeline";
import type { AnalysisDepth } from "./analysis-depth";
import { requiresDeepAnalysisPipeline } from "./analysis-depth";

export type QualityGateResult = {
  canDeliverVerdict: boolean;
  canAcknowledge: boolean;
  missing: string[];
  dataQuality: "GOOD" | "DEGRADED" | "INSUFFICIENT";
  waitReason: string | null;
  contractErrors: string[];
};

function mapQuality(
  flag: string
): "GOOD" | "DEGRADED" | "INSUFFICIENT" {
  if (flag === "missing" || flag === "stale") return "INSUFFICIENT";
  if (flag === "degraded") return "DEGRADED";
  return "GOOD";
}

/** Verify market data and observations before Karen states a trading verdict. */
export function evaluateAnalysisQualityGate(
  intel: DeskMarketIntelligence,
  depth: AnalysisDepth = "DEEP_ANALYSIS"
): QualityGateResult {
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
  const contract = buildAnalysisContract(pipeline.deskPipeline);
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

  return {
    canDeliverVerdict,
    canAcknowledge: true,
    missing,
    dataQuality,
    waitReason,
    contractErrors,
  };
}

/** Prompt block injected for DEEP_ANALYSIS — conditional tone, no transcript-only answers. */
export function formatQualityGateForPrompt(gate: QualityGateResult): string {
  const lines = [
    "QUALITY GATE (mandatory for trading verdicts):",
    "- Acknowledgement may be immediate; the verdict must wait for validated observations.",
    "- Do NOT answer from the transcript or memory alone — every price/level must come from the intelligence block.",
    "- Use conditional language: lean vs entry call are separate (e.g. 'I'm leaning bullish, but I'm not calling the entry yet').",
    "- Never sound certain just because you responded quickly.",
  ];
  if (!gate.canDeliverVerdict) {
    lines.push(
      `- Data gate FAILED — do NOT guess. State exactly what is missing: ${gate.missing.slice(0, 5).join("; ")}.`,
      "- Verdict must be WAIT or stand aside until observations confirm.",
      gate.waitReason ? `- Required opener tone: "${gate.waitReason}."` : ""
    );
  } else if (gate.dataQuality === "DEGRADED") {
    lines.push("- Data quality DEGRADED — cite uncertainty; prefer WAIT over a forced entry call.");
  } else {
    lines.push(
      "- Cite actual observations in reasoning; state invalidation and what would invalidate the lean.",
      "- If entry is not active, say what you are waiting for (e.g. retrace into 1m FVG)."
    );
  }
  return lines.filter(Boolean).join("\n");
}
