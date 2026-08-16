/**
 * evidence_dependency_repr_v0 — representation / audit helpers only.
 *
 * Annotates interpretation reasons (and optional entry_model) with PIT-safe
 * source / dependency fields. Does NOT change reason counts, support gates,
 * scoring, or trading behaviour.
 *
 * Proven edges only — from observation-engine + interpretation-engine data flow.
 * Suspected MSS↔displacement↔FVG same-impulse coupling is NOT auto-grouped
 * (displacement/FVG rows currently lack shared candle anchors on the reason path).
 */
import type {
  MarketInterpretation,
  ReadonlyMarketObservation,
} from "./desk-schema";

export const EVIDENCE_DEPENDENCY_REPRESENTATION_VERSION =
  "evidence_dependency_repr_v0" as const;

export type EvidenceFamily =
  | "htf_bias"
  | "mss_structure"
  | "displacement"
  | "fvg"
  | "liquidity_sweep"
  | "entry_model"
  | "unknown";

export type EvidenceSurface =
  | "interpretation_reason"
  | "entry_model";

export type EvidenceProvenanceKind =
  | "deterministic"
  | "code_path"
  | "unresolved";

export type EvidenceDependencyNode = {
  surfaceId: string;
  surface: EvidenceSurface;
  side: "long" | "short" | "neutral";
  label: string;
  evidenceFamily: EvidenceFamily;
  /** Deterministic PIT source id when known; null if unresolved. */
  evidenceSourceId: string | null;
  /** Proven upstream source ids this surface is derived from. */
  derivedFrom: string[];
  /** Shared group when multiple surfaces share one underlying fact (proven). */
  dependencyGroupId: string | null;
  provenance: EvidenceProvenanceKind;
};

export type EvidenceDependencyAnnotation = {
  representationVersion: typeof EVIDENCE_DEPENDENCY_REPRESENTATION_VERSION;
  nodes: EvidenceDependencyNode[];
  /** Reason strings unchanged — count preserved for audit. */
  longReasonCount: number;
  shortReasonCount: number;
  /** Distinct non-null evidenceSourceId values among reason nodes. */
  distinctSourceCount: number;
  /** Distinct non-null dependencyGroupId values. */
  dependencyGroupCount: number;
  provenanceStats: {
    deterministic: number;
    code_path: number;
    unresolved: number;
  };
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function surfaceIdFor(surface: EvidenceSurface, side: string, label: string): string {
  return `${surface}:${side}:${slug(label)}`;
}

/** True when market_structure was filled from HTF bias (no MSS evidence key). */
export function isStructureAliasedFromBias(obs: ReadonlyMarketObservation): boolean {
  const ms = obs.market_structure;
  if (ms !== "bullish" && ms !== "bearish") return false;
  return !obs.evidence["structure.mss_direction"];
}

export function biasSourceId(obs: ReadonlyMarketObservation): string | null {
  const b = obs.htf_bias.tradeable_bias;
  if (b === "unknown" || !b) return null;
  return `src:bias:tradeable:${b}`;
}

export function mssSourceId(obs: ReadonlyMarketObservation): string | null {
  const dir = obs.evidence["structure.mss_direction"];
  if (!dir) return null;
  const level = obs.evidence["structure.mss_level"] ?? "na";
  // Level + direction are frozen PIT observation fields (atTime lives on ctx, not obs).
  return `src:mss:${dir}:level:${level}`;
}

export function fvgSourceId(obs: ReadonlyMarketObservation): string | null {
  if (obs.fvg.status !== "present") return null;
  const dir = obs.fvg.direction ?? "unknown";
  const top = obs.fvg.top != null ? obs.fvg.top.toFixed(2) : "na";
  const bottom = obs.fvg.bottom != null ? obs.fvg.bottom.toFixed(2) : "na";
  return `src:fvg:${dir}:${bottom}:${top}`;
}

export function displacementSourceId(obs: ReadonlyMarketObservation): string | null {
  if (obs.displacement !== "present") return null;
  // Observation path stores status + points only — no candleTime/candleId.
  // Mark as unresolved event identity; family still displacement.
  if (obs.displacement_points == null) return null;
  return `src:disp:present:pts:${obs.displacement_points.toFixed(2)}`;
}

export function liquiditySweepSourceId(
  obs: ReadonlyMarketObservation,
  label: string
): string | null {
  const level = obs.liquidity.levels.find((l) => l.label === label && l.taken === true);
  if (!level) {
    // Fallback: match from reason prefix "{label} taken"
    const byPrefix = obs.liquidity.levels.find(
      (l) => l.taken === true && label.startsWith(l.label)
    );
    if (!byPrefix) return null;
    return liquiditySweepSourceIdFromLevel(byPrefix);
  }
  return liquiditySweepSourceIdFromLevel(level);
}

function liquiditySweepSourceIdFromLevel(
  level: ReadonlyMarketObservation["liquidity"]["levels"][number]
): string {
  const lab = slug(level.label);
  if (level.candleId) return `src:liq:${lab}:candle:${level.candleId}`;
  if (level.qualifyingTickAt != null) {
    return `src:liq:${lab}:tick:${level.qualifyingTickAt}`;
  }
  return `src:liq:${lab}:price:${level.price.toFixed(2)}`;
}

function classifyReason(label: string): {
  family: EvidenceFamily;
  kind: "bias" | "structure" | "ssl_disp" | "fvg" | "sweep" | "other";
} {
  if (/^HTF bias\b/i.test(label)) return { family: "htf_bias", kind: "bias" };
  if (/^Observed market structure is\b/i.test(label)) {
    return { family: "mss_structure", kind: "structure" };
  }
  if (label === "Displacement present after sell-side sweep") {
    return { family: "displacement", kind: "ssl_disp" };
  }
  if (/^(Bullish|Bearish) FVG present in observation$/i.test(label)) {
    return { family: "fvg", kind: "fvg" };
  }
  if (/\btaken\b/i.test(label) && /\b(sell-side|buy-side) liquidity\b/i.test(label)) {
    return { family: "liquidity_sweep", kind: "sweep" };
  }
  return { family: "unknown", kind: "other" };
}

function sweepLabelFromReason(label: string): string | null {
  const m = label.match(/^(.+?) taken\b/);
  return m ? m[1]!.trim() : null;
}

/**
 * Annotate interpretation reasons + entry_model with dependency fields.
 * Pure: does not mutate obs/interp; does not change reason arrays.
 */
export function annotateInterpretationEvidenceDependencies(
  obs: ReadonlyMarketObservation,
  interp: MarketInterpretation
): EvidenceDependencyAnnotation {
  const nodes: EvidenceDependencyNode[] = [];
  const aliased = isStructureAliasedFromBias(obs);
  const biasId = biasSourceId(obs);
  const mssId = mssSourceId(obs);
  const fvgId = fvgSourceId(obs);
  const dispId = displacementSourceId(obs);

  const biasAliasGroup =
    aliased && biasId ? `dep:bias_alias:${biasId}` : null;

  // Collect SSL sweep source ids for displacement-after grouping.
  const sslSweepIds: string[] = [];
  for (const level of obs.liquidity.levels) {
    if (level.taken !== true) continue;
    if (level.side === "sell_side" || /\b(pdl|rel)\b/i.test(level.label) || /\blows?\b/i.test(level.label)) {
      sslSweepIds.push(liquiditySweepSourceIdFromLevel(level));
    }
  }
  const sslDispGroup =
    sslSweepIds.length > 0
      ? `dep:ssl_disp_confirm:${sslSweepIds.slice().sort().join("+")}`
      : null;

  const mssStructureGroup = mssId ? `dep:mss_structure:${mssId}` : null;

  const pushReason = (side: "long" | "short", label: string) => {
    const { family, kind } = classifyReason(label);
    let evidenceSourceId: string | null = null;
    let derivedFrom: string[] = [];
    let dependencyGroupId: string | null = null;
    let provenance: EvidenceProvenanceKind = "unresolved";

    if (kind === "bias") {
      evidenceSourceId = biasId;
      provenance = biasId ? "deterministic" : "unresolved";
      if (biasAliasGroup) dependencyGroupId = biasAliasGroup;
    } else if (kind === "structure") {
      if (aliased && biasId) {
        // Proven: mapStructure copied tradeable bias; no MSS evidence key.
        evidenceSourceId = biasId;
        derivedFrom = [biasId];
        dependencyGroupId = biasAliasGroup;
        provenance = "code_path";
      } else if (mssId) {
        evidenceSourceId = mssId;
        derivedFrom = [mssId];
        dependencyGroupId = mssStructureGroup;
        provenance = "deterministic";
      } else {
        provenance = "unresolved";
      }
    } else if (kind === "ssl_disp") {
      // Proven gate in interpretation-engine: only pushed when sslRaid && !bslRaid.
      evidenceSourceId = dispId;
      derivedFrom = [...sslSweepIds, ...(dispId ? [dispId] : [])];
      dependencyGroupId = sslDispGroup;
      provenance = sslSweepIds.length ? "code_path" : "unresolved";
    } else if (kind === "fvg") {
      evidenceSourceId = fvgId;
      provenance = fvgId ? "deterministic" : "unresolved";
      // No proven cross-link to displacement without shared candle — leave ungrouped.
    } else if (kind === "sweep") {
      const lab = sweepLabelFromReason(label);
      evidenceSourceId = lab ? liquiditySweepSourceId(obs, lab) : null;
      provenance = evidenceSourceId ? "deterministic" : "unresolved";
      if (sslDispGroup && evidenceSourceId && sslSweepIds.includes(evidenceSourceId)) {
        dependencyGroupId = sslDispGroup;
      }
    } else {
      provenance = "unresolved";
    }

    nodes.push({
      surfaceId: surfaceIdFor("interpretation_reason", side, label),
      surface: "interpretation_reason",
      side,
      label,
      evidenceFamily: family,
      evidenceSourceId,
      derivedFrom,
      dependencyGroupId,
      provenance,
    });
  };

  for (const r of interp.long_case.reasons) pushReason("long", r);
  for (const r of interp.short_case.reasons) pushReason("short", r);

  if (interp.entry_model) {
    const derivedFrom: string[] = [];
    if (biasId && /bias|continuation|structure/i.test(interp.entry_model) && aliased) {
      derivedFrom.push(biasId);
    }
    if (mssId) derivedFrom.push(mssId);
    if (dispId && /displacement/i.test(interp.entry_model)) derivedFrom.push(dispId);
    if (fvgId && /fvg/i.test(interp.entry_model)) derivedFrom.push(fvgId);
    for (const id of sslSweepIds) {
      if (/sweep/i.test(interp.entry_model)) derivedFrom.push(id);
    }
    const uniqueDerived = [...new Set(derivedFrom)];
    nodes.push({
      surfaceId: surfaceIdFor("entry_model", "neutral", interp.entry_model),
      surface: "entry_model",
      side: "neutral",
      label: interp.entry_model,
      evidenceFamily: "entry_model",
      evidenceSourceId: uniqueDerived.length === 1 ? uniqueDerived[0]! : null,
      derivedFrom: uniqueDerived,
      dependencyGroupId:
        uniqueDerived.length >= 2
          ? `dep:entry_bundle:${uniqueDerived.slice().sort().join("+")}`
          : uniqueDerived.length === 1
            ? `dep:entry_bundle:${uniqueDerived[0]}`
            : null,
      provenance: uniqueDerived.length ? "code_path" : "unresolved",
    });
  }

  const reasonNodes = nodes.filter((n) => n.surface === "interpretation_reason");
  const provenanceStats = { deterministic: 0, code_path: 0, unresolved: 0 };
  for (const n of reasonNodes) provenanceStats[n.provenance]++;

  const sources = new Set(
    reasonNodes.map((n) => n.evidenceSourceId).filter((x): x is string => Boolean(x))
  );
  const groups = new Set(
    reasonNodes.map((n) => n.dependencyGroupId).filter((x): x is string => Boolean(x))
  );

  return {
    representationVersion: EVIDENCE_DEPENDENCY_REPRESENTATION_VERSION,
    nodes,
    longReasonCount: interp.long_case.reasons.length,
    shortReasonCount: interp.short_case.reasons.length,
    distinctSourceCount: sources.size,
    dependencyGroupCount: groups.size,
    provenanceStats,
  };
}

/** Reasons that share a non-null dependencyGroupId with at least one sibling. */
export function groupedReasonLabels(ann: EvidenceDependencyAnnotation): string[][] {
  const byGroup = new Map<string, string[]>();
  for (const n of ann.nodes) {
    if (n.surface !== "interpretation_reason" || !n.dependencyGroupId) continue;
    const list = byGroup.get(n.dependencyGroupId) ?? [];
    list.push(n.label);
    byGroup.set(n.dependencyGroupId, list);
  }
  return [...byGroup.values()].filter((g) => g.length >= 2);
}
