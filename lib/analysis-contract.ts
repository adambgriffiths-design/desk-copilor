/**
 * Agent response contract — structured market analysis output.
 * Source of truth: docs/ICT_DECISION_SPEC.md § Response Contract
 *
 * Observation facts only in WHY; interpretation in FINAL REASONING;
 * voice layer translates contract → natural speech (lib/voice-analysis-narrator.ts).
 */

import type { DeskPipelineResult, ReadonlyMarketObservation, TradingVerdict } from "./desk-schema";
import type { DataQualityReport } from "./data-quality-check";
import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import { expandTradingAbbreviations } from "./plain-language";
import { buildMtfHorizonSummaries, type MtfHorizonBlock } from "./mtf-horizons";
import {
  classifyLevelSide,
  describeSweptLevel,
  isLondonAsiaHighRaid,
  sessionLiquidityStayFlatReason,
  shouldBlockLongFromSessionLiquidity,
} from "./session-liquidity";
import {
  buildDecisionEnvelope,
  validateDecisionEnvelope,
  type DecisionEnvelope,
} from "./decision-envelope";
import { formatUnifiedDecisionOutput } from "./decision-contract-output";

export type ContractDataQuality = "GOOD" | "DEGRADED" | "INSUFFICIENT";

export type AnalysisWhyBlock = {
  liquidity: string;
  market_structure: string;
  displacement: string;
  fvg: string;
  order_block: string;
  premium_discount: string;
  session_time: string;
  other_ict: string;
};

export type MarketAnalysisContract = {
  verdict: TradingVerdict;
  setup: string;
  htf_bias: "bullish" | "bearish" | "neutral" | "unknown";
  entry: string;
  invalidation: string;
  target: string;
  risk_reward: string;
  why: AnalysisWhyBlock;
  contradictions: string[];
  rejected_alternative: string;
  data_quality: ContractDataQuality;
  final_reasoning: string;
  /** One-line WAIT explanation for the desk card — stay-flat vs waiting-to-trigger. */
  wait_reason?: string;
  mtf?: MtfHorizonBlock;
  /** Trader-facing decision envelope + reasoning chain. Does not change pipeline verdict math. */
  decision?: DecisionEnvelope;
};

function mapDataQuality(
  flag: ReadonlyMarketObservation["data_quality"],
  report?: DataQualityReport
): ContractDataQuality {
  const reportFlag = report?.flag;
  if (flag === "missing" || flag === "stale" || reportFlag === "missing" || reportFlag === "stale") {
    return "INSUFFICIENT";
  }
  if (flag === "degraded" || reportFlag === "degraded") return "DEGRADED";
  // Warning-only audit notes (yahoo_only, missing_context_price) must not paint
  // Karen DEGRADED when observation candles are actually good.
  return "GOOD";
}

function mapHtfBias(
  bias: string
): "bullish" | "bearish" | "neutral" | "unknown" {
  if (bias === "bullish" || bias === "bearish") return bias;
  if (bias === "neutral" || bias === "mixed") return "neutral";
  return "unknown";
}

function labelsOf(levels: Array<{ label: string }>): string {
  return levels.map((l) => l.label).join(", ");
}

function bothSidesTaken(obs: ReadonlyMarketObservation): boolean {
  const taken = new Set(obs.liquidity.levels.filter((l) => l.taken === true).map((l) => l.label));
  return taken.has("PDH") && taken.has("PDL");
}

function liquidityWhy(obs: ReadonlyMarketObservation): string {
  const swept = obs.liquidity.levels.filter((l) => l.taken === true);
  const resting = obs.liquidity.levels.filter((l) => l.taken === false);
  if (!swept.length && !resting.length) {
    return obs.data_quality === "missing" || obs.data_quality === "stale"
      ? "unknown — insufficient data"
      : "No major liquidity levels in observation";
  }
  const names = new Set(swept.map((l) => l.label));
  if (names.has("PDH") && names.has("PDL")) {
    const extra = swept.filter((l) => l.label !== "PDH" && l.label !== "PDL").map((l) => l.label);
    return extra.length
      ? `both sides taken (PDH + PDL); also ${extra.join(", ")}`
      : "both sides taken (PDH + PDL)";
  }
  if (swept.length >= 3) return `${swept.length} levels taken (${labelsOf(swept)})`;
  if (swept.length) {
    return swept
      .map((l) => describeSweptLevel(l.label, classifyLevelSide(l.label, l.side)))
      .join("; ");
  }
  const pdResting = resting.filter((l) => /^(PDH|PDL|PDC)$/.test(l.label)).slice(0, 3);
  const show = pdResting.length ? pdResting : resting.slice(0, 2);
  return `${labelsOf(show)} not yet taken`;
}

function structureWhy(obs: ReadonlyMarketObservation): string {
  if (obs.market_structure === "unknown") return "unknown — insufficient data";
  if (obs.market_structure === "unclear") return "unclear — no clean directional structure";
  const ref = obs.evidence["structure.mss_direction"];
  if (ref && ref !== obs.market_structure) return `${obs.market_structure} (${ref})`;
  return obs.market_structure;
}

function displacementWhy(obs: ReadonlyMarketObservation): string {
  if (obs.displacement === "unknown") return "unknown — insufficient data";
  if (obs.displacement === "present") {
    const pts =
      obs.displacement_points != null
        ? ` — ${obs.displacement_points.toFixed(2)} points (${obs.evidence["structure.displacement"] || "evidence in observation"})`
        : "";
    return `present${pts}`;
  }
  return "absent — no impulsive move in lookback";
}

function fvgWhy(obs: ReadonlyMarketObservation): string {
  if (obs.fvg.status === "unknown") return "unknown — insufficient data";
  if (obs.fvg.status === "absent") return "absent — no unfilled gap in lookback";
  if (obs.fvg.status === "invalidated") return "invalidated — gap filled or inverted";
  const dir = obs.fvg.direction && obs.fvg.direction !== "unknown" ? obs.fvg.direction : "present";
  if (obs.fvg.top != null && obs.fvg.bottom != null) {
    const lo = Math.min(obs.fvg.top, obs.fvg.bottom).toFixed(2);
    const hi = Math.max(obs.fvg.top, obs.fvg.bottom).toFixed(2);
    return `${dir} ${lo}–${hi}`;
  }
  return dir;
}

function orderBlockWhy(obs: ReadonlyMarketObservation): string {
  if (obs.order_block === "unknown") return "unknown — insufficient data";
  const ref = obs.evidence["structure.order_block"];
  return ref ? `${obs.order_block} (${ref})` : obs.order_block;
}

function premiumDiscountWhy(obs: ReadonlyMarketObservation): string {
  const zone = obs.premium_discount.zone;
  if (zone === "unknown") return "unknown — insufficient data";
  const loc = obs.premium_discount.price_location || "";
  const matches = [...loc.matchAll(/vs\s+([^:]+):\s*([a-z/]+)/gi)];
  if (matches.length) {
    const refs = matches
      .filter((m) => m[2] && m[2].toLowerCase() !== "n/a")
      .map((m) => m[1].trim().replace(/\s*range$/i, ""));
    const values = matches.map((m) => String(m[2]).toLowerCase());
    const allZone = values.every((v) => v === zone || v === "n/a");
    if (allZone && refs.length) return `${zone} (${refs.join(", ")})`;
    const mixed = matches
      .filter((m) => String(m[2]).toLowerCase() !== "n/a")
      .map((m) => `${m[2]} vs ${m[1].trim()}`);
    if (mixed.length) return `${zone} — ${mixed.join("; ")}`;
  }
  if (/premium of current and previous/i.test(loc) && zone === "premium") {
    return "premium (today and prior day)";
  }
  if (loc && loc !== "unknown" && loc.toLowerCase() !== zone) {
    return `${zone} — ${loc}`;
  }
  return zone;
}

function sessionWhy(obs: ReadonlyMarketObservation): string {
  if (obs.session === "unknown") return "unknown — insufficient data";
  const tc = obs.time_context && obs.time_context !== "unknown" ? `; ${obs.time_context}` : "";
  return `${obs.session}${tc}`;
}

function computeRiskReward(
  entry: string | null,
  invalidation: number | null,
  target: number | null
): string {
  if (invalidation == null || target == null || !entry) return "unknown";
  const entryMid = entry.includes("–")
    ? entry.split("–").map((s) => parseFloat(s)).reduce((a, b) => a + b, 0) / 2
    : parseFloat(entry);
  if (!Number.isFinite(entryMid)) return "unknown";
  const risk = Math.abs(entryMid - invalidation);
  const reward = Math.abs(target - entryMid);
  if (risk < 0.25) return "unknown";
  return `1:${(reward / risk).toFixed(1)}`;
}

function buildRejectedAlternative(result: DeskPipelineResult): string {
  const { decision, interpretation } = result;
  if (decision.verdict === "LONG") {
    return interpretation.short_case.supported
      ? `SHORT not taken: ${interpretation.contradictions.join("; ") || interpretation.short_case.reasons.slice(0, 2).join("; ")}`
      : "SHORT rejected — insufficient bearish confluence from observed facts";
  }
  if (decision.verdict === "SHORT") {
    return interpretation.long_case.supported
      ? `LONG not taken: ${interpretation.contradictions.join("; ") || interpretation.long_case.reasons.slice(0, 2).join("; ")}`
      : "LONG rejected — insufficient bullish confluence from observed facts";
  }
  if (decision.verdict === "WAIT") {
    if (hasBiasStructureConflict(result) || bothSidesTaken(result.observation)) {
      return "Neither direction forced — stay flat until bias and structure agree";
    }
    if (shouldBlockLongFromSessionLiquidity(result.observation)) {
      return "LONG rejected — buy-side liquidity taken is not a bullish continuation";
    }
    if (interpretation.long_case.supported && !interpretation.short_case.supported) {
      return "LONG not forced — waiting for retrace/confirmation per entry model";
    }
    if (interpretation.short_case.supported && !interpretation.long_case.supported) {
      return "SHORT not forced — waiting for retrace/confirmation per entry model";
    }
    return "Neither direction forced — setup incomplete or conflicting";
  }
  return interpretation.contradictions.join("; ") || "No actionable setup from observed facts";
}

function hasBiasStructureConflict(result: DeskPipelineResult): boolean {
  const obs = result.observation;
  const bias = obs.htf_bias.tradeable_bias;
  const structure = obs.market_structure;
  if (
    (bias === "bullish" && structure === "bearish") ||
    (bias === "bearish" && structure === "bullish")
  ) {
    return true;
  }
  const items = result.contradiction_report?.items || [];
  if (items.some((i) => i.id === "structure_vs_bias")) return true;
  return (result.interpretation.contradictions || []).some((t) => /opposes/i.test(t));
}

function isNumericEntryZone(entry: string | null | undefined): boolean {
  if (!entry) return false;
  return /\d/.test(entry) && !/wait for/i.test(entry);
}

/** WAIT with a real retrace setup — not a stay-flat conflict. */
function isWaitForTrigger(result: DeskPipelineResult): boolean {
  const { decision, interpretation } = result;
  if (decision.verdict !== "WAIT") return false;
  if (hasBiasStructureConflict(result)) return false;
  if (bothSidesTaken(result.observation)) return false;
  if (shouldBlockLongFromSessionLiquidity(result.observation)) return false;
  const setup = interpretation.entry_model || "";
  return /retrace|fvg|sweep/i.test(setup) && isNumericEntryZone(decision.entry_zone);
}

function buildWaitReason(result: DeskPipelineResult): string {
  const { observation: obs, interpretation, decision } = result;
  if (isWaitForTrigger(result)) {
    if (decision.entry_zone) return `Waiting for a retrace into ${decision.entry_zone}.`;
    if (interpretation.entry_model) return `Waiting for confirmation of ${interpretation.entry_model}.`;
    return "Waiting for entry confirmation — one-sided setup, trigger not yet hit.";
  }

  const bits: string[] = [];
  const bias = obs.htf_bias.tradeable_bias;
  const structure = obs.market_structure;
  if (
    (bias === "bullish" && structure === "bearish") ||
    (bias === "bearish" && structure === "bullish")
  ) {
    bits.push(`${bias} bias vs ${structure} structure`);
  }
  if (bothSidesTaken(obs)) {
    bits.push("both PDH and PDL taken");
  }
  const sessionFlat = sessionLiquidityStayFlatReason(obs);
  if (sessionFlat && !bothSidesTaken(obs)) {
    bits.push(
      isLondonAsiaHighRaid(obs)
        ? "Asia high taken in London (buy-side liquidity raid)"
        : "buy-side liquidity taken"
    );
  }
  if (obs.premium_discount.zone === "premium" || obs.premium_discount.zone === "discount") {
    bits.push(`price in ${obs.premium_discount.zone}`);
  }
  if (!bits.length) {
    const blocking = (result.contradiction_report?.items || []).find((i) => i.severity === "blocking");
    if (blocking) bits.push(blocking.description);
    else if (interpretation.contradictions.length) bits.push(interpretation.contradictions[0]);
  }

  let change = "";
  if (
    (bias === "bullish" && structure === "bearish") ||
    (bias === "bearish" && structure === "bullish")
  ) {
    change =
      "Needs structure and bias to agree — not a long or short while they disagree.";
  } else if (bothSidesTaken(obs)) {
    change = "Needs a fresh one-sided liquidity event before a directional lean.";
  } else if (shouldBlockLongFromSessionLiquidity(obs)) {
    change =
      "Needs displacement or continuation lower, or stay flat — not a long because the high was swept.";
  }

  if (bits.length && change) return `Stay flat — ${bits.join("; ")}. ${change}`;
  if (bits.length) return `Stay flat — ${bits.join("; ")}.`;
  if (change) return change;
  return (
    decision.verdict_reason ||
    interpretation.reasoning ||
    "Setup incomplete — stay flat."
  ).slice(0, 280);
}

function buildFinalReasoning(result: DeskPipelineResult): string {
  const { decision, interpretation, uncertainty } = result;
  if (uncertainty?.i_dont_know || decision.verdict === "NO_TRADE") {
    return (
      uncertainty?.message ||
      decision.verdict_reason ||
      "Evidence insufficient — no trade until observation engine has usable facts."
    ).slice(0, 400);
  }
  if (decision.verdict === "WAIT") {
    const sessionFlat = sessionLiquidityStayFlatReason(result.observation);
    if (sessionFlat && !isWaitForTrigger(result)) {
      return sessionFlat.slice(0, 400);
    }
    return buildWaitReason(result).slice(0, 400);
  }
  const dir = decision.verdict === "LONG" ? "Long" : "Short";
  return [
    `${dir} follows from observed liquidity, structure, and entry model.`,
    interpretation.reasoning.slice(0, 200),
    decision.invalidation != null ? `Invalidation below/above ${decision.invalidation.toFixed(2)}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 400);
}

/** Build structured response contract from pipeline layers — no invented fields. */
export function buildAnalysisContract(
  result: DeskPipelineResult,
  ctx?: MarketContext,
  state?: MarketState
): MarketAnalysisContract {
  const { observation, interpretation, decision, data_quality_report, contradiction_report } =
    result;

  const waitTrigger = isWaitForTrigger(result);
  const stayFlatWait = decision.verdict === "WAIT" && !waitTrigger;
  const entry = stayFlatWait
    ? "—"
    : decision.entry_zone ||
      (decision.verdict === "WAIT" ? "wait for entry zone — not ready" : "none");
  const invalidation = stayFlatWait
    ? "unknown"
    : decision.invalidation != null
      ? decision.invalidation.toFixed(2)
      : "unknown";
  const target = stayFlatWait
    ? "unknown"
    : decision.target != null
      ? decision.target.toFixed(2)
      : interpretation.target != null
        ? interpretation.target.toFixed(2)
        : "unknown";

  const contradictions =
    contradiction_report?.items.map((c) => c.description) ||
    interpretation.contradictions;

  const wait_reason =
    decision.verdict === "WAIT"
      ? sessionLiquidityStayFlatReason(observation) && !waitTrigger
        ? sessionLiquidityStayFlatReason(observation)!
        : buildWaitReason(result)
      : undefined;
  const setup = stayFlatWait
    ? "none identified"
    : interpretation.entry_model || "none identified";

  const decisionEnvelope = buildDecisionEnvelope(result, ctx, state);

  return {
    verdict: decision.verdict,
    setup,
    htf_bias: mapHtfBias(observation.htf_bias.tradeable_bias),
    entry,
    invalidation,
    target,
    risk_reward: stayFlatWait
      ? "unknown"
      : computeRiskReward(entry, decision.invalidation, decision.target),
    why: {
      liquidity: liquidityWhy(observation),
      market_structure: structureWhy(observation),
      displacement: displacementWhy(observation),
      fvg: fvgWhy(observation),
      order_block: orderBlockWhy(observation),
      premium_discount: premiumDiscountWhy(observation),
      session_time: sessionWhy(observation),
      other_ict: observation.evidence["structure.summary"] || "none",
    },
    contradictions,
    rejected_alternative: buildRejectedAlternative(result),
    data_quality: mapDataQuality(observation.data_quality, data_quality_report),
    final_reasoning: buildFinalReasoning(result),
    wait_reason,
    mtf: buildMtfHorizonSummaries({ observation, ctx, state }),
    decision: decisionEnvelope,
  };
}

/** Panel / audit text — exact contract format. */
export function formatAnalysisContract(c: MarketAnalysisContract): string {
  const envelope = c.decision ? `${formatUnifiedDecisionOutput(c.decision)}\n\n` : "";
  const lines = [
    `VERDICT: ${c.verdict}`,
    `SETUP: ${c.setup}`,
    `HTF BIAS: ${c.htf_bias}`,
    ...(c.wait_reason ? [`WHY WAIT: ${c.wait_reason}`] : []),
    ...(c.mtf
      ? [
          `SHORT TERM (${c.mtf.short_label}): ${c.mtf.short}`,
          `MEDIUM TERM (${c.mtf.medium_label}): ${c.mtf.medium}`,
          `LONG TERM (${c.mtf.long_label}): ${c.mtf.long}`,
        ]
      : []),
    `ENTRY: ${c.entry}`,
    `INVALIDATION: ${c.invalidation}`,
    `TARGET: ${c.target}`,
    `R:R: ${c.risk_reward}`,
    "",
    "WHY:",
    "",
    `Liquidity: ${c.why.liquidity}`,
    `Market structure: ${c.why.market_structure}`,
    `Displacement: ${c.why.displacement}`,
    `FVG: ${c.why.fvg}`,
    `Order block: ${c.why.order_block}`,
    `Premium/discount: ${c.why.premium_discount}`,
    `Session/time: ${c.why.session_time}`,
    `Other ICT concepts: ${c.why.other_ict}`,
    "",
    "CONTRADICTIONS:",
    c.contradictions.length ? c.contradictions.map((x) => `- ${x}`).join("\n") : "- none",
    "",
    "REJECTED ALTERNATIVE:",
    c.rejected_alternative,
    "",
    `DATA QUALITY: ${c.data_quality}`,
    "",
    "FINAL REASONING:",
    c.final_reasoning,
  ];
  return `${envelope}${expandTradingAbbreviations(lines.join("\n"))}`;
}

export function validateContractNoInvention(
  contract: MarketAnalysisContract,
  obs: ReadonlyMarketObservation
): string[] {
  const errors: string[] = [];
  if (contract.data_quality === "INSUFFICIENT" && contract.verdict !== "NO_TRADE") {
    errors.push("INSUFFICIENT data must yield NO_TRADE verdict");
  }
  if (obs.market_structure === "unknown" && /bullish|bearish structure/i.test(contract.final_reasoning)) {
    errors.push("final_reasoning claims structure when observation unknown");
  }
  if (contract.verdict === "LONG" || contract.verdict === "SHORT") {
    if (contract.invalidation === "unknown") {
      errors.push(`${contract.verdict} requires invalidation price`);
    }
  }
  if (contract.decision) {
    errors.push(...validateDecisionEnvelope(contract.decision));
  }
  return errors;
}
