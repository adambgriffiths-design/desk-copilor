import type {
  ReadonlyMarketObservation,
  MarketInterpretation,
  TradingDecision,
  TradingVerdict,
} from "./desk-schema";
import type { ContradictionReport } from "./contradiction-report";

export type EvidenceCitation = {
  claim: string;
  evidence_paths: string[];
  values: Record<string, string>;
};

export type ExplainabilityReport = {
  citations: EvidenceCitation[];
  verdict_citation: EvidenceCitation;
  unknown_fields: string[];
  all_claims_traced: boolean;
};

function resolveEvidence(obs: ReadonlyMarketObservation, paths: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const p of paths) {
    if (obs.evidence[p]) values[p] = obs.evidence[p];
  }
  return values;
}

function collectUnknownFields(obs: ReadonlyMarketObservation): string[] {
  const unknown: string[] = [];
  if (obs.market_structure === "unknown") unknown.push("market_structure");
  if (obs.displacement === "unknown") unknown.push("displacement");
  if (obs.fvg.status === "unknown") unknown.push("fvg.status");
  if (obs.order_block === "unknown") unknown.push("order_block");
  if (obs.premium_discount.zone === "unknown") unknown.push("premium_discount.zone");
  if (obs.session === "unknown") unknown.push("session");
  if (obs.htf_bias.tradeable_bias === "unknown") unknown.push("htf_bias.tradeable_bias");
  return unknown;
}

/** Every conclusion must point to exact observation evidence paths. */
export function buildExplainabilityReport(
  obs: ReadonlyMarketObservation,
  interp: MarketInterpretation,
  decision: TradingDecision,
  contradictions: ContradictionReport
): ExplainabilityReport {
  const citations: EvidenceCitation[] = [];

  citations.push({
    claim: `Market structure: ${obs.market_structure}`,
    evidence_paths: ["structure.mss_direction", "bias_stack.tradeable_bias"].filter((p) => obs.evidence[p]),
    values: resolveEvidence(obs, ["structure.mss_direction", "bias_stack.tradeable_bias"]),
  });

  if (obs.liquidity.levels.length) {
    const paths = obs.liquidity.levels.map((l) => `liquidity.${l.label.toLowerCase().replace(/\s+/g, "_")}`);
    citations.push({
      claim: `Liquidity levels: ${obs.liquidity.levels.map((l) => `${l.label}@${l.price}${l.taken === true ? " swept" : ""}`).join(", ")}`,
      evidence_paths: paths.filter((p) => obs.evidence[p]),
      values: resolveEvidence(obs, paths),
    });
  }

  if (obs.fvg.status !== "unknown") {
    citations.push({
      claim: `FVG: ${obs.fvg.status}${obs.fvg.top != null ? ` ${obs.fvg.bottom}–${obs.fvg.top}` : ""}`,
      evidence_paths: ["structure.fvg.status", "structure.fvg.top", "structure.fvg.bottom"].filter(
        (p) => obs.evidence[p]
      ),
      values: resolveEvidence(obs, ["structure.fvg.status", "structure.fvg.top", "structure.fvg.bottom"]),
    });
  }

  if (interp.entry_model) {
    citations.push({
      claim: `Entry model: ${interp.entry_model}`,
      evidence_paths: interp.observation_refs,
      values: resolveEvidence(obs, interp.observation_refs),
    });
  }

  for (const c of contradictions.items.slice(0, 5)) {
    citations.push({
      claim: `Contradiction: ${c.description}`,
      evidence_paths: c.evidence_paths,
      values: resolveEvidence(obs, c.evidence_paths),
    });
  }

  const verdictPaths = [
    ...interp.observation_refs,
    ...(decision.invalidation != null ? ["structure.mss_level"] : []),
  ].filter((p) => obs.evidence[p]);

  const verdict_citation: EvidenceCitation = {
    claim: `Verdict ${decision.verdict}: ${decision.verdict_reason.slice(0, 120)}`,
    evidence_paths: [...new Set(verdictPaths)],
    values: resolveEvidence(obs, verdictPaths),
  };

  const unknown_fields = collectUnknownFields(obs);
  const all_claims_traced =
    citations.every((c) => c.evidence_paths.length > 0 || c.claim.includes("unknown")) &&
    (decision.verdict === "NO_TRADE" || verdict_citation.evidence_paths.length > 0);

  return { citations, verdict_citation, unknown_fields, all_claims_traced };
}

export function formatExplainabilityBrief(report: ExplainabilityReport, verdict: TradingVerdict): string {
  if (report.unknown_fields.length > 0 && verdict === "NO_TRADE") {
    return `I don't know enough to call this — unknown: ${report.unknown_fields.join(", ")}.`;
  }
  const top = report.citations.slice(0, 3).map((c) => {
    const refs = c.evidence_paths.map((p) => `${p}=${c.values[p] ?? "?"}`).join(", ");
    return `${c.claim.split(":")[0]} → ${refs || "no evidence path"}`;
  });
  return top.join(" | ");
}
