/**
 * Agent response contract — structured market analysis output.
 * Source of truth: docs/ICT_DECISION_SPEC.md § Response Contract
 *
 * Observation facts only in WHY; interpretation in FINAL REASONING;
 * voice layer translates contract → natural speech (lib/voice-analysis-narrator.ts).
 */

import type { DeskPipelineResult, ReadonlyMarketObservation, TradingVerdict } from "./desk-schema";
import type { DataQualityReport } from "./data-quality-check";
import type { ContradictionReport } from "./contradiction-report";
import { expandTradingAbbreviations } from "./plain-language";

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
};

function mapDataQuality(
  flag: ReadonlyMarketObservation["data_quality"],
  report?: DataQualityReport
): ContractDataQuality {
  if (flag === "missing" || flag === "stale") return "INSUFFICIENT";
  if (flag === "degraded" || (report && report.issues.length > 0)) return "DEGRADED";
  return "GOOD";
}

function mapHtfBias(
  bias: string
): "bullish" | "bearish" | "neutral" | "unknown" {
  if (bias === "bullish" || bias === "bearish") return bias;
  if (bias === "neutral" || bias === "mixed") return "neutral";
  return "unknown";
}

function liquidityWhy(obs: ReadonlyMarketObservation): string {
  const swept = obs.liquidity.levels.filter((l) => l.taken === true);
  const unswept = obs.liquidity.levels.filter((l) => l.taken !== true);
  if (swept.length) {
    return swept
      .map((l) => `${l.label} at ${l.price.toFixed(2)} was taken`)
      .join("; ");
  }
  if (unswept.length) {
    return unswept
      .slice(0, 3)
      .map((l) => `${l.label} at ${l.price.toFixed(2)} not yet taken`)
      .join("; ");
  }
  return obs.data_quality === "missing" || obs.data_quality === "stale"
    ? "unknown — insufficient data"
    : "No major liquidity levels in observation";
}

function structureWhy(obs: ReadonlyMarketObservation): string {
  if (obs.market_structure === "unknown") return "unknown — insufficient data";
  if (obs.market_structure === "unclear") return "unclear — no clean directional structure";
  const ref = obs.evidence["structure.mss_direction"] || obs.evidence["bias_stack.tradeable_bias"];
  return ref ? `${obs.market_structure} (${ref})` : obs.market_structure;
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
  if (obs.fvg.top != null && obs.fvg.bottom != null) {
    const lo = Math.min(obs.fvg.top, obs.fvg.bottom).toFixed(2);
    const hi = Math.max(obs.fvg.top, obs.fvg.bottom).toFixed(2);
    return `${obs.fvg.direction || "unknown"} present — zone ${lo}–${hi}`;
  }
  return `${obs.fvg.status}`;
}

function orderBlockWhy(obs: ReadonlyMarketObservation): string {
  if (obs.order_block === "unknown") return "unknown — insufficient data";
  const ref = obs.evidence["structure.order_block"];
  return ref ? `${obs.order_block} (${ref})` : obs.order_block;
}

function premiumDiscountWhy(obs: ReadonlyMarketObservation): string {
  if (obs.premium_discount.zone === "unknown") return "unknown — insufficient data";
  return `${obs.premium_discount.zone} — ${obs.premium_discount.price_location}`;
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
    return [
      interpretation.entry_model
        ? `Setup forming (${interpretation.entry_model}) but entry not ready.`
        : "Framework sees partial confluence but not enough to force an entry.",
      interpretation.contradictions.length
        ? `Waiting because: ${interpretation.contradictions.slice(0, 2).join("; ")}.`
        : "Disciplined wait — confirmation required before acting.",
    ].join(" ");
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
export function buildAnalysisContract(result: DeskPipelineResult): MarketAnalysisContract {
  const { observation, interpretation, decision, data_quality_report, contradiction_report } =
    result;

  const entry =
    decision.entry_zone ||
    (decision.verdict === "WAIT" ? "wait for entry zone — not ready" : "none");
  const invalidation =
    decision.invalidation != null ? decision.invalidation.toFixed(2) : "unknown";
  const target =
    decision.target != null
      ? decision.target.toFixed(2)
      : interpretation.target != null
        ? interpretation.target.toFixed(2)
        : "unknown";

  const contradictions =
    contradiction_report?.items.map((c) => c.description) ||
    interpretation.contradictions;

  return {
    verdict: decision.verdict,
    setup: interpretation.entry_model || "none identified",
    htf_bias: mapHtfBias(observation.htf_bias.tradeable_bias),
    entry,
    invalidation,
    target,
    risk_reward: computeRiskReward(entry, decision.invalidation, decision.target),
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
  };
}

/** Panel / audit text — exact contract format. */
export function formatAnalysisContract(c: MarketAnalysisContract): string {
  const lines = [
    `VERDICT: ${c.verdict}`,
    `SETUP: ${c.setup}`,
    `HTF BIAS: ${c.htf_bias}`,
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
  return expandTradingAbbreviations(lines.join("\n"));
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
  return errors;
}
