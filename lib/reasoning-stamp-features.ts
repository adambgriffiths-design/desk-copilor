/**
 * PIT-safe structured reasoning stamp fields for featuresAtT / EvidenceAtT.
 *
 * Measurement plumbing only — does not change ALS / gates / trading behavior.
 * Source: DecisionEnvelope.reasoningChain[] (+ conflictResolution.between).
 * Keeps citedConcepts / reason-count fields as separate back-compat surfaces.
 *
 * Version: reasoning_repr_v0 — compact playbook rows; no invented fields.
 */
import type {
  ChainOutcome,
  ConceptRole,
  ConflictBetween,
  DecisionEnvelope,
  ReasoningChainItem,
} from "./decision-envelope";

export const REASONING_REPRESENTATION_VERSION = "reasoning_repr_v0" as const;

/** Compact chain row — only fields already present on ReasoningChainItem. */
export type ReasoningChainCompactRow = {
  concept: string;
  checked: boolean;
  outcome: ChainOutcome;
  detected: boolean;
  usedInDecision: boolean;
  role: ConceptRole;
  /** Copied from evidence.source when present — enables duplicate-source reporting. */
  evidenceSource: string;
};

export type ReasoningStampFeatures = {
  reasoningChainCompact: ReasoningChainCompactRow[];
  /** conflictResolution.between when available; null if absent. */
  conflictBetween: ConflictBetween | null;
  reasoningRepresentationVersion: typeof REASONING_REPRESENTATION_VERSION;
};

export type ReasoningEvidenceFields = {
  reasoningChainCompact?: ReasoningChainCompactRow[] | null;
  conflictBetween?: ConflictBetween | null;
};

function toCompactRow(item: ReasoningChainItem): ReasoningChainCompactRow {
  return {
    concept: String(item.concept),
    checked: Boolean(item.checked),
    outcome: item.outcome,
    detected: Boolean(item.detected),
    usedInDecision: Boolean(item.usedInDecision),
    role: item.role,
    evidenceSource: String(item.evidence?.source ?? ""),
  };
}

/**
 * Full path: DecisionEnvelope available (desk / DV replay parity).
 * Copies chain rows as-is — does not invent missing playbook slots.
 */
export function stampReasoningFeaturesFromEnvelope(
  env: Pick<DecisionEnvelope, "reasoningChain" | "conflictResolution">
): ReasoningStampFeatures {
  const rows = (env.reasoningChain ?? []).map(toCompactRow);
  const between = env.conflictResolution?.between ?? null;
  return {
    reasoningChainCompact: rows,
    conflictBetween: between,
    reasoningRepresentationVersion: REASONING_REPRESENTATION_VERSION,
  };
}

/** DV / stamp path when EvidenceAtT already carries compact rows. */
export function stampReasoningFeaturesFromEvidence(
  e: ReasoningEvidenceFields
): ReasoningStampFeatures {
  const rows = [...(e.reasoningChainCompact ?? [])];
  return {
    reasoningChainCompact: rows,
    conflictBetween: e.conflictBetween ?? null,
    reasoningRepresentationVersion: REASONING_REPRESENTATION_VERSION,
  };
}

/** Outcome-blind quantification helpers (no GOOD/BAD / proxyR). */
export type ReasoningReprQuantification = {
  stampCount: number;
  totalRows: number;
  primaryCount: number;
  supportingCount: number;
  noneCount: number;
  /** usedInDecision && role !== PRIMARY — invisible from citedConcepts alone. */
  usedButNotCitedCount: number;
  stampsWithUsedButNotCited: number;
  /** Stamps where ≥2 compact rows share the same non-empty evidenceSource. */
  stampsWithSharedEvidenceSource: number;
  sharedEvidenceSourceRowPairs: number;
};

export function quantifyReasoningReprV0(
  stamps: Array<{
    reasoningChainCompact?: ReasoningChainCompactRow[] | null;
    citedConcepts?: string[] | null;
  }>
): ReasoningReprQuantification {
  let totalRows = 0;
  let primaryCount = 0;
  let supportingCount = 0;
  let noneCount = 0;
  let usedButNotCitedCount = 0;
  let stampsWithUsedButNotCited = 0;
  let stampsWithSharedEvidenceSource = 0;
  let sharedEvidenceSourceRowPairs = 0;

  for (const s of stamps) {
    const rows = s.reasoningChainCompact ?? [];
    const cited = new Set(s.citedConcepts ?? []);
    totalRows += rows.length;
    let stampHidden = 0;
    for (const r of rows) {
      if (r.role === "PRIMARY") primaryCount += 1;
      else if (r.role === "SUPPORTING") supportingCount += 1;
      else noneCount += 1;
      // citedConcepts ≈ PRIMARY only; SUPPORTING used rows were previously invisible.
      if (r.usedInDecision && !cited.has(r.concept)) {
        usedButNotCitedCount += 1;
        stampHidden += 1;
      }
    }
    if (stampHidden > 0) stampsWithUsedButNotCited += 1;

    const bySource = new Map<string, number>();
    for (const r of rows) {
      const src = (r.evidenceSource ?? "").trim();
      if (!src) continue;
      bySource.set(src, (bySource.get(src) ?? 0) + 1);
    }
    let pairs = 0;
    for (const n of bySource.values()) {
      if (n >= 2) pairs += (n * (n - 1)) / 2;
    }
    if (pairs > 0) {
      stampsWithSharedEvidenceSource += 1;
      sharedEvidenceSourceRowPairs += pairs;
    }
  }

  return {
    stampCount: stamps.length,
    totalRows,
    primaryCount,
    supportingCount,
    noneCount,
    usedButNotCitedCount,
    stampsWithUsedButNotCited,
    stampsWithSharedEvidenceSource,
    sharedEvidenceSourceRowPairs,
  };
}
