/**
 * PIT-safe typed contradiction stamp fields for featuresAtT.
 *
 * Measurement plumbing only — does not change ALS / gates / trading behavior.
 *
 * Prefer `stampContradictionItemsFromObsInterp` when full observation +
 * interpretation exist. DV records only carry EvidenceAtT + ReasoningStructureAtT,
 * so stamps use `stampContradictionItemsFromDvEvidence` (documented reconstruction).
 */
import {
  buildContradictionReport,
  type ContradictionItem,
} from "./contradiction-report";
import type {
  MarketInterpretation,
  ReadonlyMarketObservation,
} from "./desk-schema";

export const CONTRADICTION_REPRESENTATION_VERSION = "contradiction_repr_v1" as const;

export type StructureVsBiasPolarity =
  | "bullish_struct_bearish_bias"
  | "bearish_struct_bullish_bias";

export type ContradictionStampItem = {
  id: string;
  severity: "blocking" | "warning";
  affects: "long" | "short" | "both" | "decision";
  /** Present for structure_vs_bias; null otherwise. */
  polarity: StructureVsBiasPolarity | null;
  evidence_paths: string[];
  description: string;
};

/** All ids `buildContradictionReport` can emit (static inventory). */
export const CONTRADICTION_ENGINE_EMITABLE_IDS = [
  "structure_vs_bias",
  "htf_misaligned",
  "data_quality",
  "unknown_market_structure",
  "unknown_displacement",
  "unknown_fvg_status",
  "both_cases_supported",
  "interp_contradiction",
] as const;

export type ContradictionEngineEmitableId =
  (typeof CONTRADICTION_ENGINE_EMITABLE_IDS)[number];

export function polarityForStructureVsBias(
  marketStructure: string | null | undefined,
  tradeableBias: string | null | undefined
): StructureVsBiasPolarity | null {
  if (marketStructure === "bullish" && tradeableBias === "bearish") {
    return "bullish_struct_bearish_bias";
  }
  if (marketStructure === "bearish" && tradeableBias === "bullish") {
    return "bearish_struct_bullish_bias";
  }
  return null;
}

function withPolarity(
  item: ContradictionItem,
  marketStructure: string | null | undefined,
  tradeableBias: string | null | undefined
): ContradictionStampItem {
  return {
    id: item.id,
    severity: item.severity,
    affects: item.affects,
    polarity:
      item.id === "structure_vs_bias"
        ? polarityForStructureVsBias(marketStructure, tradeableBias)
        : null,
    evidence_paths: [...item.evidence_paths],
    description: item.description,
  };
}

/** Full path: obs + interp available (production desk-pipeline parity). */
export function stampContradictionItemsFromObsInterp(
  obs: ReadonlyMarketObservation,
  interp: MarketInterpretation
): ContradictionStampItem[] {
  const report = buildContradictionReport(obs, interp);
  return report.items.map((item) =>
    withPolarity(item, obs.market_structure, obs.htf_bias.tradeable_bias)
  );
}

/**
 * DV / stamp reconstruction inputs available at asOf on DecisionValidationRecordV0
 * (evidence + reasoningStructure). `htfAligned` and `dataQuality` are optional —
 * they are not on EvidenceAtT today.
 */
export type DvContradictionStampInputs = {
  marketStructure?: string | null;
  tradeableBias?: string | null;
  displacement?: string | null;
  fvgStatus?: string | null;
  /** Optional — not on EvidenceAtT; if omitted, inferred from contradiction strings. */
  htfAligned?: boolean | "unknown" | null;
  /** Optional — not on EvidenceAtT; only emits data_quality when missing|stale. */
  dataQuality?: string | null;
  longSupported?: boolean | null;
  shortSupported?: boolean | null;
  /** Free-text contradictions from reasoningStructure (interp strings). */
  contradictions?: string[] | null;
  observationRefs?: string[] | null;
};

const HTF_MISALIGNED_DESC = "Higher timeframe biases not aligned";

/**
 * Deterministic reconstruction from DV evidence fields at asOf.
 *
 * Exact rules (mirror `buildContradictionReport` predicates; no invented unknowns):
 * 1. structure_vs_bias iff marketStructure×tradeableBias opposition; polarity from same pair
 * 2. htf_misaligned iff htfAligned===false OR contradictions includes HTF string
 * 3. data_quality iff dataQuality is "missing"|"stale" (field absent on DV → never)
 * 4. unknown_* iff corresponding field value is literally "unknown"
 * 5. both_cases_supported iff longSupported && shortSupported
 * 6. remaining contradiction strings not already covered by description → interp_contradiction
 *
 * Legacy contradictions[] / contradictionCount are unchanged by callers.
 */
export function stampContradictionItemsFromDvEvidence(
  input: DvContradictionStampInputs
): ContradictionStampItem[] {
  const items: ContradictionStampItem[] = [];
  const ms = input.marketStructure ?? null;
  const tb = input.tradeableBias ?? null;
  const contradictions = [...(input.contradictions ?? [])];
  const refs = input.observationRefs ?? [];

  const pol = polarityForStructureVsBias(ms, tb);
  if (pol === "bullish_struct_bearish_bias") {
    items.push({
      id: "structure_vs_bias",
      description: "Bullish structure opposes bearish tradeable bias",
      severity: "blocking",
      evidence_paths: ["structure.mss_direction", "bias_stack.tradeable_bias"],
      affects: "both",
      polarity: pol,
    });
  } else if (pol === "bearish_struct_bullish_bias") {
    items.push({
      id: "structure_vs_bias",
      description: "Bearish structure opposes bullish tradeable bias",
      severity: "blocking",
      evidence_paths: ["structure.mss_direction", "bias_stack.tradeable_bias"],
      affects: "both",
      polarity: pol,
    });
  }

  const alignedExplicit = input.htfAligned;
  const htfMisaligned =
    alignedExplicit === false ||
    (alignedExplicit !== true && contradictions.includes(HTF_MISALIGNED_DESC));
  if (htfMisaligned) {
    items.push({
      id: "htf_misaligned",
      description: HTF_MISALIGNED_DESC,
      severity: "warning",
      evidence_paths: ["bias_stack.aligned"],
      affects: "decision",
      polarity: null,
    });
  }

  const dq = input.dataQuality;
  if (dq === "missing" || dq === "stale") {
    items.push({
      id: "data_quality",
      description: `Data quality ${dq} — cannot trust observations`,
      severity: "blocking",
      evidence_paths: ["data_quality"],
      affects: "decision",
      polarity: null,
    });
  }

  if (ms === "unknown") {
    items.push({
      id: "unknown_market_structure",
      description: "market_structure is unknown — cannot lean directional",
      severity: "blocking",
      evidence_paths: ["structure.market_structure"],
      affects: "decision",
      polarity: null,
    });
  }
  if (input.displacement === "unknown") {
    items.push({
      id: "unknown_displacement",
      description: "displacement is unknown — cannot lean directional",
      severity: "blocking",
      evidence_paths: ["structure.displacement"],
      affects: "decision",
      polarity: null,
    });
  }
  if (input.fvgStatus === "unknown") {
    items.push({
      id: "unknown_fvg_status",
      description: "fvg.status is unknown — cannot lean directional",
      severity: "blocking",
      evidence_paths: ["structure.fvg.status"],
      affects: "decision",
      polarity: null,
    });
  }

  if (input.longSupported && input.shortSupported) {
    items.push({
      id: "both_cases_supported",
      description: "Both long and short cases partially supported — wait for clarity",
      severity: "blocking",
      evidence_paths: refs.slice(0, 4),
      affects: "decision",
      polarity: null,
    });
  }

  for (const c of contradictions) {
    if (!items.some((i) => i.description === c)) {
      items.push({
        id: "interp_contradiction",
        description: c,
        severity: "warning",
        evidence_paths: refs.slice(0, 3),
        affects: "decision",
        polarity: null,
      });
    }
  }

  return items;
}

/** Attach typed stamp fields onto a featuresAtT-shaped object (additive). */
export function attachContradictionStampFields<T extends Record<string, unknown>>(
  features: T,
  input: DvContradictionStampInputs
): T & {
  contradictionItems: ContradictionStampItem[];
  contradictionRepresentationVersion: typeof CONTRADICTION_REPRESENTATION_VERSION;
} {
  return {
    ...features,
    contradictionItems: stampContradictionItemsFromDvEvidence(input),
    contradictionRepresentationVersion: CONTRADICTION_REPRESENTATION_VERSION,
  };
}
