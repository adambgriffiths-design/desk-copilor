/**
 * Material-change gate for continuous decision-memory appends.
 *
 * Evaluate may run on freshness miss; append only when the DecisionEnvelope
 * decision/thesis/invalidation materially differs from the last recorded entry.
 * Confidence-only and time-only advances are NOT material.
 *
 * Does not change trading / ICT / envelope schema.
 */
import type { DecisionEnvelope } from "./decision-envelope";
import type { DecisionEnvelopeHistoryEntry } from "./decision-envelope-history";
import { normalizeRecordedStatus } from "./decision-envelope-history";

export type MaterialChangeReason =
  | "first_entry"
  | "stance"
  | "verdict"
  | "thesis.what"
  | "thesis.whyNow"
  | "invalidation";

export type MaterialChangeResult = {
  material: boolean;
  reasons: MaterialChangeReason[];
};

function normText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * True when the candidate DecisionEnvelope is a material change vs the last
 * recorded history entry (Model B — continuous memory append rule).
 */
export function isMaterialDecisionChange(
  previous: DecisionEnvelopeHistoryEntry | null | undefined,
  candidate: {
    envelope: DecisionEnvelope;
    verdict?: string | null;
  }
): MaterialChangeResult {
  if (!previous) {
    return { material: true, reasons: ["first_entry"] };
  }

  const reasons: MaterialChangeReason[] = [];
  const prevEnv = previous.envelope;
  const nextEnv = candidate.envelope;

  if (prevEnv.stance !== nextEnv.stance) {
    reasons.push("stance");
  }

  const prevStatus = normalizeRecordedStatus(previous.verdict, previous.stance);
  const nextStatus = normalizeRecordedStatus(
    candidate.verdict ?? nextEnv.stance,
    nextEnv.stance
  );
  if (prevStatus !== nextStatus) {
    reasons.push("verdict");
  }

  if (normText(prevEnv.thesis?.what) !== normText(nextEnv.thesis?.what)) {
    reasons.push("thesis.what");
  }
  if (normText(prevEnv.thesis?.whyNow) !== normText(nextEnv.thesis?.whyNow)) {
    reasons.push("thesis.whyNow");
  }

  const prevInv = normText(prevEnv.invalidation?.condition);
  const nextInv = normText(nextEnv.invalidation?.condition);
  if (prevInv !== nextInv) {
    reasons.push("invalidation");
  }

  return { material: reasons.length > 0, reasons };
}
