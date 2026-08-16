/**
 * PIT-safe HTF bias stack stamp fields for featuresAtT / EvidenceAtT.
 *
 * Measurement plumbing only — does not change ALS / gates / trading behavior.
 * Source: observation.htf_bias (same stack used for HTF_BIAS_MISALIGNED).
 * Keeps tradeableBias as a separate back-compat field on the stamp surface.
 */
import type { ReadonlyMarketObservation } from "./desk-schema";

export const HTF_BIAS_REPRESENTATION_VERSION = "htf_bias_repr_v0" as const;

export type HtfBiasLean = string;

export type HtfBiasAligned = boolean | "unknown";

/** Nested mirror of obs.htf_bias (minus tradeable_bias — stamped separately). */
export type HtfBiasStackStamp = {
  daily: HtfBiasLean;
  m15: HtfBiasLean;
  m5: HtfBiasLean;
  aligned: HtfBiasAligned;
};

export type HtfBiasStampFeatures = {
  htfBiasDaily: HtfBiasLean | null;
  htfBiasM15: HtfBiasLean | null;
  htfBiasM5: HtfBiasLean | null;
  htfAligned: HtfBiasAligned | null;
  htfBias: HtfBiasStackStamp | null;
  htfBiasRepresentationVersion: typeof HTF_BIAS_REPRESENTATION_VERSION;
};

export type HtfBiasEvidenceFields = {
  htfBiasDaily?: string | null;
  htfBiasM15?: string | null;
  htfBiasM5?: string | null;
  htfAligned?: boolean | "unknown" | null;
};

function normalizeAligned(v: unknown): HtfBiasAligned | null {
  if (v === true || v === false || v === "unknown") return v;
  return null;
}

/** Full path: observation available (desk / DV replay parity). */
export function stampHtfBiasFeaturesFromObs(
  obs: ReadonlyMarketObservation
): HtfBiasStampFeatures {
  const h = obs.htf_bias;
  const daily = h?.daily ?? null;
  const m15 = h?.m15 ?? null;
  const m5 = h?.m5 ?? null;
  const aligned = normalizeAligned(h?.aligned);
  const stack: HtfBiasStackStamp | null =
    daily != null && m15 != null && m5 != null && aligned != null
      ? { daily, m15, m5, aligned }
      : null;
  return {
    htfBiasDaily: daily,
    htfBiasM15: m15,
    htfBiasM5: m5,
    htfAligned: aligned,
    htfBias: stack,
    htfBiasRepresentationVersion: HTF_BIAS_REPRESENTATION_VERSION,
  };
}

/** DV / stamp path when EvidenceAtT carries the stack fields. */
export function stampHtfBiasFeaturesFromEvidence(
  e: HtfBiasEvidenceFields
): HtfBiasStampFeatures {
  const daily = e.htfBiasDaily ?? null;
  const m15 = e.htfBiasM15 ?? null;
  const m5 = e.htfBiasM5 ?? null;
  const aligned = normalizeAligned(e.htfAligned);
  const stack: HtfBiasStackStamp | null =
    daily != null && m15 != null && m5 != null && aligned != null
      ? { daily, m15, m5, aligned }
      : null;
  return {
    htfBiasDaily: daily,
    htfBiasM15: m15,
    htfBiasM5: m5,
    htfAligned: aligned,
    htfBias: stack,
    htfBiasRepresentationVersion: HTF_BIAS_REPRESENTATION_VERSION,
  };
}
