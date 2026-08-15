import type { ConceptRelationship, DecisionTrace, MarketDecisionContext } from "./types";

/** Human-readable visual trace — required section headers, never unlabeled leans. */
export function formatVisualTrace(
  trace: DecisionTrace,
  context: MarketDecisionContext,
  relationships: ConceptRelationship[]
): string {
  const detected = trace.concepts.filter((c) => c.detected).map((c) => c.concept);
  const used = trace.concepts.filter((c) => c.used).map((c) => `${c.concept}(${c.role})`);
  const ignored = trace.concepts.filter((c) => !c.detected || c.usage === "IGNORED").map((c) => c.concept);
  const primary = trace.concepts.filter((c) => c.role === "PRIMARY").map((c) => c.concept);
  const secondary = trace.concepts.filter((c) => c.role === "SUPPORTING").map((c) => c.concept);

  return [
    `ARCHITECTURE: ${trace.architectureVersion}`,
    `SNAPSHOT: ${trace.snapshotId}  TIME: ${trace.timestamp}  DATASET: ${trace.datasetId}`,
    `EVIDENCE CLASS: ${trace.evidenceClass}`,
    "",
    "MARKET CONTEXT",
    `session=${context.session} tod=${context.timeOfDay} vol=${context.volProxy} pd=${context.premiumDiscount} trend/range=${context.trendOrRange}`,
    `nearest liquidity=${context.nearestLiquidityLabel ?? "none"} dist=${context.distanceFromLiquidity ?? "n/a"} sweep=${context.recentSweep} mss=${context.recentMss} fvg=${context.activeFvg} eqh=${context.activeEqh} eql=${context.activeEql}`,
    `PDH=${context.pdh ?? "n/a"} PDL=${context.pdl ?? "n/a"} session taken=${context.sessionLiquidityTaken.join(",") || "none"}`,
    "",
    "HTF",
    `${trace.htfContext.timeframe} — ${trace.htfContext.lean} (context only)`,
    "",
    "TACTICAL",
    `${trace.tactical.timeframe} — ${trace.tactical.lean}`,
    "",
    "LIQUIDITY",
    trace.concepts
      .filter((c) => /liquidity|session_liquidity|eqh|eql/.test(c.concept))
      .map((c) => `- ${c.concept} detected=${c.detected} used=${c.used} ${c.evidence}`)
      .join("\n") || "- none",
    "",
    "STRUCTURE",
    trace.concepts
      .filter((c) => c.concept === "mss" || c.concept === "displacement")
      .map((c) => `- ${c.concept} ${c.outcome} ${c.contribution}`)
      .join("\n"),
    "",
    "FVG",
    trace.concepts.find((c) => c.concept === "fvg")?.contribution ?? "unchecked",
    "",
    "EQH/EQL",
    `eqh detected=${detected.includes("eqh")}  eql detected=${detected.includes("eql")}`,
    "",
    "CONFLICTS",
    `disagree=${trace.conflicts.disagree} between=${trace.conflicts.between} allowed=${String(trace.conflicts.ltfAgainstHtfAllowed)} winner=${trace.conflicts.winner}`,
    trace.conflicts.resolution,
    "",
    "USED",
    used.join(", ") || "(none)",
    "",
    "IGNORED",
    ignored.join(", ") || "(none)",
    "",
    "PRIMARY",
    primary.join(", ") || "(none)",
    "",
    "SECONDARY",
    secondary.join(", ") || "(none)",
    "",
    "DECISION",
    `stance=${trace.stance} verdict=${trace.pipelineVerdict} overlay=${trace.overlayApplied ? trace.overlayReason : "none"}`,
    "",
    "TARGET",
    trace.target ?? "none named",
    "",
    "INVALIDATION",
    trace.invalidation ?? "none named",
    "",
    "CONFIDENCE",
    trace.confidence,
    "",
    "COMBOS",
    relationships.map((r) => `${r.relationship}: ${r.impact}`).join("\n") || "(none bounded)",
  ].join("\n");
}

export const VISUAL_TRACE_HEADERS = [
  "MARKET CONTEXT",
  "HTF",
  "TACTICAL",
  "LIQUIDITY",
  "STRUCTURE",
  "FVG",
  "EQH/EQL",
  "CONFLICTS",
  "USED",
  "IGNORED",
  "PRIMARY",
  "SECONDARY",
  "DECISION",
  "TARGET",
  "INVALIDATION",
  "CONFIDENCE",
] as const;

export function visualTraceHasRequiredHeaders(text: string): boolean {
  return VISUAL_TRACE_HEADERS.every((h) => text.includes(h));
}
