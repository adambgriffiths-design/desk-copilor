/**
 * Research-only mentor-quality evaluation — reasoning rubric, not win/loss.
 * Karen = trading mentor/decision support. Valid: LONG/SHORT/WAIT/NO_TRADE/insufficient info.
 */
import type { MarketInterpretation, MarketObservation, TradingDecision } from "../../desk-schema";
import type { KarenReplayResponse } from "../replay/types";
import {
  MENTOR_CRITERION_LABELS,
  MENTOR_FALSIFICATION_LABELS,
  type CriterionScore,
  type MentorCriterionId,
  type MentorCriterionResult,
  type MentorEvalInput,
  type MentorEvalResult,
  type MentorFalsification,
  type MentorFalsificationFlag,
} from "./types";

const CRITERION_ORDER: MentorCriterionId[] = [
  "sufficient_info",
  "structure_accuracy",
  "dominant_conflicting_evidence",
  "uncertainty",
  "invalidation",
  "no_hindsight",
  "no_forced_direction",
  "consistency",
  "trader_usefulness",
  "data_quality_honesty",
];

function criterion(id: MentorCriterionId, score: CriterionScore, note: string): MentorCriterionResult {
  return { id, label: MENTOR_CRITERION_LABELS[id], score, maxScore: 2, note };
}

function falsify(flag: MentorFalsificationFlag, detected: boolean, detail: string): MentorFalsification {
  return { flag, detected, detail: detected ? detail : MENTOR_FALSIFICATION_LABELS[flag] };
}

function parseIsoMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function extractCandleTimes(karen: KarenReplayResponse): string[] {
  const times: string[] = [];
  for (const line of karen.candlesUsed) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
    if (m) times.push(m[1]!);
  }
  return times;
}

function scoreSufficientInfo(karen: KarenReplayResponse): MentorCriterionResult {
  const fields = [karen.structureEvidence, karen.pdEvidence, karen.fvgEvidence, karen.entryIdea];
  const populated = fields.filter((f) => f && f.trim().length > 3).length;
  const hasCandles = karen.candlesUsed.length >= 1;
  if (populated >= 3 && hasCandles) return criterion("sufficient_info", 2, `${populated}/4 evidence fields + ${karen.candlesUsed.length} candles`);
  if (populated >= 2 || hasCandles) return criterion("sufficient_info", 1, `partial evidence (${populated}/4 fields)`);
  return criterion("sufficient_info", 0, "insufficient cited observable facts");
}

function scoreStructureAccuracy(
  karen: KarenReplayResponse,
  obs: MarketObservation
): MentorCriterionResult {
  if (obs.data_quality === "missing" || obs.data_quality === "stale") {
    return criterion("structure_accuracy", obs.market_structure === "unknown" ? 2 : 0, "structure unknown under bad data quality");
  }
  const struct = obs.market_structure;
  if (struct === "unknown" || struct === "unclear") {
    return criterion("structure_accuracy", 1, "structure unclear at cutoff — partial credit if not over-claimed");
  }
  const evidence = karen.structureEvidence.toLowerCase();
  const aligned =
    (struct === "bullish" && (evidence.includes("bull") || evidence.includes("long"))) ||
    (struct === "bearish" && (evidence.includes("bear") || evidence.includes("short"))) ||
    evidence.includes(struct);
  if (aligned) return criterion("structure_accuracy", 2, `structure ${struct} reflected in evidence`);
  return criterion("structure_accuracy", 0, `structure ${struct} not reflected in mentor evidence`);
}

function scoreDominantConflicting(
  interp: MarketInterpretation,
  decision: TradingDecision
): MentorCriterionResult {
  const longOk = interp.long_case.supported;
  const shortOk = interp.short_case.supported;
  if (longOk && shortOk) {
    const ok = decision.verdict === "WAIT" || decision.verdict === "NO_TRADE";
    return criterion(
      "dominant_conflicting_evidence",
      ok ? 2 : 1,
      ok ? "both cases supported — WAIT/NO_TRADE appropriate" : "both supported but directional verdict"
    );
  }
  if (longOk || shortOk) return criterion("dominant_conflicting_evidence", 2, "single dominant case — no conflict");
  return criterion("dominant_conflicting_evidence", 1, "neither case strongly supported");
}

function scoreUncertainty(
  karen: KarenReplayResponse,
  interp: MarketInterpretation,
  decision: TradingDecision
): MentorCriterionResult {
  const mixed = interp.long_case.supported && interp.short_case.supported;
  const weak = !interp.long_case.supported && !interp.short_case.supported;
  const waitish = decision.verdict === "WAIT" || decision.verdict === "NO_TRADE";
  if (mixed || weak || waitish) {
    if (karen.confidence <= 55) return criterion("uncertainty", 2, `confidence ${karen.confidence} appropriate for mixed/weak/wait`);
    if (karen.confidence <= 65) return criterion("uncertainty", 1, `confidence ${karen.confidence} slightly high for uncertainty`);
    return criterion("uncertainty", 0, `confidence ${karen.confidence} too high given mixed/weak evidence`);
  }
  if (karen.confidence <= 75) return criterion("uncertainty", 2, "directional with moderate confidence");
  return criterion("uncertainty", 1, "directional with elevated confidence");
}

function scoreInvalidation(karen: KarenReplayResponse, decision: TradingDecision): MentorCriterionResult {
  if (decision.verdict !== "LONG" && decision.verdict !== "SHORT") {
    return criterion("invalidation", 2, "non-directional — invalidation not required");
  }
  const inv = parseFloat(karen.invalidation);
  if (Number.isFinite(inv) && karen.invalidation.trim().length > 0) {
    return criterion("invalidation", 2, `invalidation ${karen.invalidation}`);
  }
  if (karen.invalidation.trim().length > 0) {
    return criterion("invalidation", 1, "invalidation present but not numeric");
  }
  return criterion("invalidation", 0, "directional verdict without invalidation");
}

function scoreNoHindsight(karen: KarenReplayResponse, asOf: string): MentorCriterionResult {
  const cutoffMs = parseIsoMs(asOf);
  if (cutoffMs == null) return criterion("no_hindsight", 1, "cutoff unparseable");
  const candleTimes = extractCandleTimes(karen);
  const future = candleTimes.filter((t) => {
    const ms = parseIsoMs(t);
    return ms != null && ms > cutoffMs;
  });
  if (future.length === 0) return criterion("no_hindsight", 2, `all ${candleTimes.length} cited candles ≤ cutoff`);
  return criterion("no_hindsight", 0, `${future.length} candle(s) after cutoff`);
}

function scoreNoForcedDirection(
  karen: KarenReplayResponse,
  obs: MarketObservation,
  decision: TradingDecision
): MentorCriterionResult {
  if (karen.source === "deterministic") {
    return criterion("no_forced_direction", 0, "deterministic path always emits LONG/SHORT");
  }
  if (obs.data_quality === "missing" || obs.data_quality === "stale") {
    const ok = decision.verdict === "NO_TRADE";
    return criterion("no_forced_direction", ok ? 2 : 0, ok ? "NO_TRADE under bad data" : "directional despite bad data");
  }
  if (decision.verdict === "WAIT" || decision.verdict === "NO_TRADE") {
    return criterion("no_forced_direction", 2, `${decision.verdict} — not forcing trade`);
  }
  return criterion("no_forced_direction", 2, "pipeline directional with acceptable data");
}

function scoreConsistency(
  karen: KarenReplayResponse,
  obs: MarketObservation,
  decision: TradingDecision
): MentorCriterionResult {
  const verdict = decision.verdict;
  const bias = obs.htf_bias.tradeable_bias;
  if (verdict === "NO_TRADE" || verdict === "WAIT") {
    const aligned = karen.pipelineVerdict === verdict;
    return criterion("consistency", aligned ? 2 : 1, aligned ? "mentor matches pipeline wait/no-trade" : "mentor verdict differs from pipeline");
  }
  if (verdict === "LONG" && (bias === "bullish" || obs.market_structure === "bullish")) {
    return criterion("consistency", 2, "LONG aligned with bullish context");
  }
  if (verdict === "SHORT" && (bias === "bearish" || obs.market_structure === "bearish")) {
    return criterion("consistency", 2, "SHORT aligned with bearish context");
  }
  if (karen.pipelineVerdict === verdict) return criterion("consistency", 1, "mentor matches pipeline despite mixed bias");
  return criterion("consistency", 0, "verdict conflicts with dominant evidence");
}

function scoreTraderUsefulness(karen: KarenReplayResponse): MentorCriterionResult {
  const hasEntry = karen.entryIdea.trim().length > 5;
  const hasLevels = karen.levelsUsed.length >= 1;
  const hasInv = karen.invalidation.trim().length > 0;
  if (hasEntry && hasLevels && hasInv) return criterion("trader_usefulness", 2, "entry + levels + invalidation present");
  if (hasEntry && (hasLevels || hasInv)) return criterion("trader_usefulness", 1, "partial trader scaffolding");
  return criterion("trader_usefulness", 0, "insufficient actionable detail");
}

function scoreDataQualityHonesty(
  karen: KarenReplayResponse,
  obs: MarketObservation,
  decision: TradingDecision
): MentorCriterionResult {
  if (obs.data_quality === "missing" || obs.data_quality === "stale") {
    const honest =
      decision.verdict === "NO_TRADE" &&
      obs.market_structure === "unknown" &&
      karen.source === "pipeline";
    return criterion(
      "data_quality_honesty",
      honest ? 2 : 0,
      honest ? "NO_TRADE + unknown structure under bad data" : "claims structure despite bad data quality"
    );
  }
  if (karen.source === "deterministic") {
    return criterion("data_quality_honesty", 0, "deterministic path ignores data_quality gate");
  }
  return criterion("data_quality_honesty", 2, `data_quality=${obs.data_quality} — pipeline evaluated`);
}

function detectFalsifications(input: MentorEvalInput): MentorFalsification[] {
  const { karen, observation, interpretation, decision, asOf } = input;
  const cutoffMs = parseIsoMs(asOf);
  const candleTimes = extractCandleTimes(karen);
  const hindsight =
    cutoffMs != null && candleTimes.some((t) => {
      const ms = parseIsoMs(t);
      return ms != null && ms > cutoffMs;
    });

  const mixed = interpretation.long_case.supported && interpretation.short_case.supported;
  const overconfidence =
    karen.confidence >= 70 &&
    (mixed || decision.verdict === "WAIT" || decision.verdict === "NO_TRADE" || observation.data_quality !== "good");

  const forcedSignal =
    karen.source === "deterministic" ||
    ((observation.data_quality === "missing" || observation.data_quality === "stale") &&
      (decision.verdict === "LONG" || decision.verdict === "SHORT"));

  const cherryPick =
    mixed &&
    karen.source === "deterministic" &&
    (karen.pipelineVerdict === "LONG" || karen.pipelineVerdict === "SHORT");

  const unavailableInfo =
    (observation.data_quality === "missing" || observation.data_quality === "stale") &&
    karen.source === "deterministic";

  return [
    falsify("hindsight_leakage", hindsight, `${candleTimes.filter((t) => cutoffMs != null && (parseIsoMs(t) ?? 0) > cutoffMs!).length} future candle refs`),
    falsify("overconfidence", overconfidence, `confidence=${karen.confidence} with verdict=${decision.verdict}`),
    falsify("forced_signal", forcedSignal, karen.source === "deterministic" ? "deterministic bias-only path" : "directional under bad data"),
    falsify("cherry_pick", cherryPick, "deterministic pick ignores conflicting interpretation"),
    falsify("unavailable_info_cited", unavailableInfo, "structure cited when observation blocked"),
  ];
}

/** Evaluate mentor response quality at point-in-time cutoff T. */
export function evaluateMentorResponse(input: MentorEvalInput): MentorEvalResult {
  const { karen, observation, interpretation, decision, asOf } = input;

  const criteria: MentorCriterionResult[] = [
    scoreSufficientInfo(karen),
    scoreStructureAccuracy(karen, observation),
    scoreDominantConflicting(interpretation, decision),
    scoreUncertainty(karen, interpretation, decision),
    scoreInvalidation(karen, decision),
    scoreNoHindsight(karen, asOf),
    scoreNoForcedDirection(karen, observation, decision),
    scoreConsistency(karen, observation, decision),
    scoreTraderUsefulness(karen),
    scoreDataQualityHonesty(karen, observation, decision),
  ];

  // Preserve canonical order
  criteria.sort(
    (a, b) => CRITERION_ORDER.indexOf(a.id) - CRITERION_ORDER.indexOf(b.id)
  );

  const falsifications = detectFalsifications(input);
  const totalScore = criteria.reduce((s, c) => s + c.score, 0);
  const maxScore = criteria.length * 2;
  const pctScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const anyFalsification = falsifications.some((f) => f.detected);
  const mentorEvalReady = !anyFalsification && pctScore >= 70 && karen.source === "pipeline";

  const failedCriteria = criteria.filter((c) => c.score === 0).map((c) => c.id);
  const summary = anyFalsification
    ? `Falsification: ${falsifications.filter((f) => f.detected).map((f) => f.flag).join(", ")}`
    : failedCriteria.length > 0
      ? `Weak: ${failedCriteria.join(", ")} (${pctScore}%)`
      : `Mentor-quality pass (${pctScore}%)`;

  return {
    asOf,
    source: karen.source,
    pipelineVerdict: decision.verdict,
    criteria,
    totalScore,
    maxScore,
    pctScore,
    falsifications,
    mentorEvalReady,
    summary,
  };
}

/** Build eval input from pipeline layers + Karen formatted response. */
export function buildMentorEvalInput(input: {
  asOf: string;
  karen: KarenReplayResponse;
  observation: MarketObservation;
  interpretation: MarketInterpretation;
  decision: TradingDecision;
  availableBarTimes: string[];
}): MentorEvalInput {
  return input;
}
