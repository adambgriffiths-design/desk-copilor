import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import { expandTradingAbbreviations } from "./plain-language";
import type { DeskPipelineResult, ObservationDelta, TradingVerdict, UncertaintyReport } from "./desk-schema";
import { toLegacyCall, toLegacyPipelineVerdict } from "./desk-schema";
import { buildMarketObservation } from "./observation-engine";
import { buildMarketInterpretation } from "./interpretation-engine";
import { buildTradingDecision } from "./decision-layer";
import { validateInterpretationContamination } from "./contamination-guard";
import { getExecutionScaffold } from "./execution-plan";
import { buildPipelineMeta } from "./pipeline-version";
import { auditDataQuality } from "./data-quality-check";
import { buildContradictionReport } from "./contradiction-report";
import { buildExplainabilityReport, formatExplainabilityBrief } from "./explainability";
import { buildAnalysisContract, formatAnalysisContract } from "./analysis-contract";
import { narrateAnalysisContractForVoice } from "./voice-analysis-narrator";
import {
  isDecisionHistoryRecordSuppressed,
  recordDecisionEnvelopeHistory,
} from "./decision-envelope-history";

export const NO_TRADE_EXPORT_MESSAGE = "No call — couldn't read the chart data right now.";

let lastPipeline: DeskPipelineResult | null = null;

export function getLastPipelineResult(): DeskPipelineResult | null {
  return lastPipeline;
}

/** Test / historical-UI isolation — swap or clear without running the pipeline. */
export function replaceLastPipelineResult(
  next: DeskPipelineResult | null
): DeskPipelineResult | null {
  const prev = lastPipeline;
  lastPipeline = next;
  return prev;
}

function computeObservationDelta(
  prev: DeskPipelineResult | null,
  current: DeskPipelineResult
): ObservationDelta {
  if (!prev) {
    return {
      verdict_changed: false,
      field_changes: [],
      observation_changes: [],
      mentor_brief: "First read this session — no prior verdict to compare.",
    };
  }

  const field_changes: string[] = [];
  const observation_changes: string[] = [];

  if (prev.observation.htf_bias.tradeable_bias !== current.observation.htf_bias.tradeable_bias) {
    observation_changes.push(
      `bias ${prev.observation.htf_bias.tradeable_bias} → ${current.observation.htf_bias.tradeable_bias}`
    );
  }
  if (prev.observation.fvg.status !== current.observation.fvg.status) {
    observation_changes.push(`FVG ${prev.observation.fvg.status} → ${current.observation.fvg.status}`);
    if (current.observation.fvg.status === "absent" && prev.observation.fvg.status === "present") {
      field_changes.push("FVG filled");
    }
  }
  if (prev.observation.displacement !== current.observation.displacement) {
    observation_changes.push(
      `displacement ${prev.observation.displacement} → ${current.observation.displacement}`
    );
  }
  if (prev.decision.entry_zone !== current.decision.entry_zone && current.decision.entry_zone) {
    field_changes.push("entry zone now ready");
  }

  const verdict_changed = prev.decision.verdict !== current.decision.verdict;
  const parts = ["Since last check:"];
  if (!observation_changes.length && !field_changes.length && !verdict_changed) {
    parts.push("nothing material changed — verdict unchanged.");
  } else {
    if (observation_changes.length === 0) parts.push("bias unchanged");
    observation_changes.slice(0, 2).forEach((c) => parts.push(c));
    field_changes.slice(0, 2).forEach((c) => parts.push(c));
    if (verdict_changed) {
      parts.push(`verdict moved ${prev.decision.verdict} → ${current.decision.verdict}`);
    } else {
      parts.push("entry model unchanged");
    }
  }

  return {
    verdict_changed,
    prev_verdict: prev.decision.verdict,
    field_changes,
    observation_changes,
    mentor_brief: parts.join(", ") + ".",
  };
}

function buildMentorBrief(result: DeskPipelineResult): string {
  const contract = result.analysis_contract ?? buildAnalysisContract(result);
  return narrateAnalysisContractForVoice(contract);
}

function buildPanelBrief(result: DeskPipelineResult): string {
  const contract = result.analysis_contract ?? buildAnalysisContract(result);
  const { meta, uncertainty, explainability } = result;
  const lines = [
    meta ? `=== PIPELINE v${meta.pipeline_version} spec v${meta.spec_version} ===` : "",
    "=== MARKET ANALYSIS (response contract) ===",
    formatAnalysisContract(contract),
  ];
  if (uncertainty?.i_dont_know) {
    lines.push("", "=== UNCERTAINTY ===", uncertainty.message);
  }
  if (explainability) {
    lines.push("", "=== EVIDENCE PATHS ===", formatExplainabilityBrief(explainability, contract.verdict));
  }
  if (result.delta && !result.delta.mentor_brief.startsWith("First read")) {
    lines.push("", "=== CHANGES ===", result.delta.mentor_brief);
  }
  return lines.filter(Boolean).join("\n");
}

function buildSpokenBrief(result: DeskPipelineResult): string {
  if (
    result.decision.verdict === "NO_TRADE" &&
    result.observation.data_quality !== "good" &&
    result.observation.data_quality !== "degraded"
  ) {
    return NO_TRADE_EXPORT_MESSAGE;
  }
  const contract = result.analysis_contract ?? buildAnalysisContract(result);
  const voice = narrateAnalysisContractForVoice(contract);
  const delta =
    result.delta && !result.delta.mentor_brief.startsWith("First read")
      ? " " + result.delta.mentor_brief
      : "";
  return expandTradingAbbreviations(voice + delta);
}

function buildUncertaintyReport(
  observation: DeskPipelineResult["observation"],
  qualityReport: ReturnType<typeof auditDataQuality>
): UncertaintyReport {
  const unknown_fields: string[] = [];
  if (observation.market_structure === "unknown") unknown_fields.push("market_structure");
  if (observation.displacement === "unknown") unknown_fields.push("displacement");
  if (observation.fvg.status === "unknown") unknown_fields.push("fvg");
  if (observation.htf_bias.tradeable_bias === "unknown") unknown_fields.push("htf_bias");
  if (observation.order_block === "unknown") unknown_fields.push("order_block");
  if (!qualityReport.can_observe) unknown_fields.push("data_quality");

  const i_dont_know = unknown_fields.length > 0 || !qualityReport.can_decide;
  let message = "Sufficient observed facts for framework application.";
  if (i_dont_know) {
    message =
      unknown_fields.length > 0
        ? `I don't know — missing or unknown: ${unknown_fields.join(", ")}.`
        : "I don't know — chart data quality too low for a call.";
  }
  return { i_dont_know, unknown_fields, message };
}

/** Three-layer pipeline — observation, interpretation, decision kept as separate JSON objects. */
export function runDeskPipeline(ctx: MarketContext, state: MarketState): DeskPipelineResult {
  const meta = buildPipelineMeta();
  const data_quality_report = auditDataQuality(ctx, state);
  const observation = buildMarketObservation(ctx, state);
  const interpretation = buildMarketInterpretation(observation);

  const contamination = validateInterpretationContamination(observation, interpretation);
  const decision = !contamination.passed
    ? {
        verdict: "NO_TRADE" as const,
        verdict_reason: `Interpretation contamination blocked: ${contamination.violations.join("; ")}`,
        invalidation: null,
        entry_zone: null,
        target: null,
        observation_ref: observation,
        interpretation_ref: interpretation,
      }
    : buildTradingDecision(observation, interpretation, ctx);
  const contradiction_report = buildContradictionReport(observation, interpretation);
  const explainability = buildExplainabilityReport(observation, interpretation, decision, contradiction_report);
  const uncertainty = buildUncertaintyReport(observation, data_quality_report);

  const delta = computeObservationDelta(lastPipeline, {
    observation,
    interpretation,
    decision,
    mentor_brief: "",
    panel_brief: "",
    spoken_brief: "",
    state_hash: state.stateHash,
    meta,
    data_quality_report,
    contradiction_report,
    explainability,
    uncertainty,
  });

  const result: DeskPipelineResult = {
    observation,
    interpretation,
    decision,
    delta,
    mentor_brief: "",
    panel_brief: "",
    spoken_brief: "",
    state_hash: state.stateHash,
    meta,
    data_quality_report,
    contradiction_report,
    explainability,
    uncertainty,
    analysis_contract: undefined,
  };
  result.analysis_contract = buildAnalysisContract(result, ctx, state);
  result.mentor_brief = buildMentorBrief(result);
  result.panel_brief = buildPanelBrief(result);
  result.spoken_brief = buildSpokenBrief(result);

  lastPipeline = result;

  // LIVE DecisionEnvelope history only — historical builds must suppress recording.
  const liveEnv = result.analysis_contract?.decision;
  if (liveEnv && !isDecisionHistoryRecordSuppressed()) {
    const barSec = state.quality?.lastBarTime;
    const asOf =
      typeof barSec === "number" && Number.isFinite(barSec) && barSec > 0
        ? new Date(barSec * 1000)
        : new Date(state.updatedAt || Date.now());
    const asOfIso = asOf.toISOString();
    const verdict = result.decision.verdict;
    let entryStatus: string | undefined;
    try {
      entryStatus = getExecutionScaffold(ctx)?.entryStatus;
    } catch {
      entryStatus = undefined;
    }
    recordDecisionEnvelopeHistory({
      asOf,
      dataMode: "LIVE",
      envelope: liveEnv,
      verdict,
      stateHash: state.stateHash,
      decisionKey: `${"LIVE"}@?|${liveEnv.stance}|${verdict}|${asOfIso}`,
      entryStatus,
      marketState: {
        price: state.lastPrice ?? null,
        stateHash: state.stateHash ?? null,
        snapshotId: state.snapshotId ?? null,
        htfBias: result.observation.htf_bias?.tradeable_bias ?? null,
        structure: result.observation.market_structure ?? null,
        displacement: result.observation.displacement ?? null,
        fvgStatus: result.observation.fvg?.status ?? null,
        verdict: verdict ?? null,
      },
    });
  }

  return result;
}

/** Legacy adapter for verdict-engine / decision-pipeline callers. */
export function runDecisionPipeline(ctx: MarketContext, state: MarketState) {
  const pipeline = runDeskPipeline(ctx, state);
  const execution = getExecutionScaffold(ctx);
  const legacyVerdict = toLegacyPipelineVerdict(pipeline.decision.verdict);

  return {
    verdict: legacyVerdict,
    direction:
      pipeline.decision.verdict === "LONG"
        ? ("long" as const)
        : pipeline.decision.verdict === "SHORT"
          ? ("short" as const)
          : undefined,
    call: toLegacyCall(pipeline.decision.verdict, execution?.call),
    aggregateConfidence: 0,
    steps: [],
    panelBrief: pipeline.panel_brief,
    spokenBrief: pipeline.spoken_brief,
    execution,
    noTradeReason: legacyVerdict === "no trade" ? pipeline.decision.verdict_reason : undefined,
    stateHash: pipeline.state_hash,
    meta: `verdict=${pipeline.decision.verdict} | model=${pipeline.interpretation.entry_model || "none"}`,
    deskPipeline: pipeline,
  };
}

export function buildDecisionReasoningLog(pipeline: DeskPipelineResult, state: MarketState) {
  return {
    ts: new Date().toISOString(),
    meta: pipeline.meta,
    input: {
      state_hash: state.stateHash,
      data_quality: pipeline.data_quality_report,
      observation: pipeline.observation,
    },
    output: {
      interpretation: pipeline.interpretation,
      decision: pipeline.decision,
      analysis_contract: pipeline.analysis_contract,
      contradictions: pipeline.contradiction_report,
      explainability: pipeline.explainability,
      uncertainty: pipeline.uncertainty,
      mentor_brief: pipeline.mentor_brief,
      spoken_brief: pipeline.spoken_brief,
    },
  };
}

export function pipelineBiasSummary(ctx: MarketContext, state: MarketState): string {
  const obs = buildMarketObservation(ctx, state);
  if (obs.htf_bias.tradeable_bias === "unknown") {
    return "Cannot lean — higher-timeframe bias unknown due to data quality.";
  }
  if (obs.htf_bias.tradeable_bias === "bullish") {
    return `Bias is bullish — ${obs.evidence["bias_stack.tradeable_bias"]}.`;
  }
  if (obs.htf_bias.tradeable_bias === "bearish") {
    return `Bias is bearish — ${obs.evidence["bias_stack.tradeable_bias"]}.`;
  }
  return `Bias is ${obs.htf_bias.tradeable_bias} — no clear directional lean from observed facts.`;
}
