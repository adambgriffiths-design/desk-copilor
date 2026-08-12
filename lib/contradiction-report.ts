import type { ReadonlyMarketObservation, MarketInterpretation } from "./desk-schema";

export type ContradictionItem = {
  id: string;
  description: string;
  severity: "blocking" | "warning";
  evidence_paths: string[];
  affects: "long" | "short" | "both" | "decision";
};

export type ContradictionReport = {
  items: ContradictionItem[];
  has_blocking: boolean;
  long_blocked: boolean;
  short_blocked: boolean;
  summary: string;
};

/** Structured contradiction detection — separate from free-text interpretation.contradictions. */
export function buildContradictionReport(
  obs: ReadonlyMarketObservation,
  interp: MarketInterpretation
): ContradictionReport {
  const items: ContradictionItem[] = [];

  if (obs.market_structure === "bullish" && obs.htf_bias.tradeable_bias === "bearish") {
    items.push({
      id: "structure_vs_bias",
      description: "Bullish structure opposes bearish tradeable bias",
      severity: "blocking",
      evidence_paths: ["structure.mss_direction", "bias_stack.tradeable_bias"],
      affects: "both",
    });
  }
  if (obs.market_structure === "bearish" && obs.htf_bias.tradeable_bias === "bullish") {
    items.push({
      id: "structure_vs_bias",
      description: "Bearish structure opposes bullish tradeable bias",
      severity: "blocking",
      evidence_paths: ["structure.mss_direction", "bias_stack.tradeable_bias"],
      affects: "both",
    });
  }

  if (obs.htf_bias.aligned === false) {
    items.push({
      id: "htf_misaligned",
      description: "Higher timeframe biases not aligned",
      severity: "warning",
      evidence_paths: ["bias_stack.aligned"],
      affects: "decision",
    });
  }

  if (obs.data_quality === "missing" || obs.data_quality === "stale") {
    items.push({
      id: "data_quality",
      description: `Data quality ${obs.data_quality} — cannot trust observations`,
      severity: "blocking",
      evidence_paths: ["data_quality"],
      affects: "decision",
    });
  }

  for (const field of ["market_structure", "displacement", "fvg.status"] as const) {
    const val = field === "fvg.status" ? obs.fvg.status : obs[field as keyof ReadonlyMarketObservation];
    if (val === "unknown") {
      items.push({
        id: `unknown_${field.replace(".", "_")}`,
        description: `${field} is unknown — cannot lean directional`,
        severity: "blocking",
        evidence_paths: [field === "fvg.status" ? "structure.fvg.status" : `structure.${field}`],
        affects: "decision",
      });
    }
  }

  if (interp.long_case.supported && interp.short_case.supported) {
    items.push({
      id: "both_cases_supported",
      description: "Both long and short cases partially supported — wait for clarity",
      severity: "blocking",
      evidence_paths: interp.observation_refs.slice(0, 4),
      affects: "decision",
    });
  }

  for (const c of interp.contradictions) {
    if (!items.some((i) => i.description === c)) {
      items.push({
        id: "interp_contradiction",
        description: c,
        severity: "warning",
        evidence_paths: interp.observation_refs.slice(0, 3),
        affects: "decision",
      });
    }
  }

  const has_blocking = items.some((i) => i.severity === "blocking");
  const long_blocked =
    has_blocking ||
    items.some((i) => i.affects === "long" || (i.affects === "both" && i.severity === "blocking"));
  const short_blocked =
    has_blocking ||
    items.some((i) => i.affects === "short" || (i.affects === "both" && i.severity === "blocking"));

  const summary = items.length
    ? `${items.filter((i) => i.severity === "blocking").length} blocking, ${items.filter((i) => i.severity === "warning").length} warning`
    : "No contradictions detected";

  return { items, has_blocking, long_blocked, short_blocked, summary };
}
