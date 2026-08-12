/**
 * Per-concept confirmation policy — candle close vs intrabar execution.
 * See docs/DECISION_TRACKER_SPEC.md
 */

export type ConfirmationType =
  | "candle_close"
  | "intrabar_wick"
  | "intrabar_touch"
  | "hybrid";

export type TrackerConcept =
  | "mss"
  | "liquidity_sweep"
  | "displacement"
  | "fvg_formation"
  | "fvg_entry"
  | "htf_bias"
  | "invalidation"
  | "session";

export type ConfirmationPolicy = {
  concept: TrackerConcept;
  confirmation: ConfirmationType;
  /** Official market state updates only when true */
  affects_verdict: boolean;
  description: string;
};

/** Each rule defines its own confirmation — trader-realistic discretion. */
export const CONFIRMATION_POLICIES: Record<TrackerConcept, ConfirmationPolicy> = {
  mss: {
    concept: "mss",
    confirmation: "candle_close",
    affects_verdict: true,
    description: "Market structure shift — body close beyond swing high/low.",
  },
  liquidity_sweep: {
    concept: "liquidity_sweep",
    confirmation: "candle_close",
    affects_verdict: true,
    description: "Liquidity taken — confirm on candle close through level or rejection.",
  },
  displacement: {
    concept: "displacement",
    confirmation: "candle_close",
    affects_verdict: true,
    description: "Impulsive displacement leg — confirm when candle closes.",
  },
  fvg_formation: {
    concept: "fvg_formation",
    confirmation: "candle_close",
    affects_verdict: true,
    description: "Fair value gap — confirmed when third candle of imbalance closes.",
  },
  fvg_entry: {
    concept: "fvg_entry",
    confirmation: "intrabar_wick",
    affects_verdict: false,
    description:
      "FVG retrace entry — may trigger on wick into zone without changing official bias/MSS.",
  },
  htf_bias: {
    concept: "htf_bias",
    confirmation: "candle_close",
    affects_verdict: true,
    description: "Higher-timeframe bias context — slow, close-confirmed.",
  },
  invalidation: {
    concept: "invalidation",
    confirmation: "candle_close",
    affects_verdict: true,
    description: "Thesis invalidation — body close through MSS or FVG rule.",
  },
  session: {
    concept: "session",
    confirmation: "candle_close",
    affects_verdict: false,
    description: "Session bucket changes on bar close.",
  },
};

export function policyFor(concept: TrackerConcept): ConfirmationPolicy {
  return CONFIRMATION_POLICIES[concept];
}

export function requiresCandleClose(concept: TrackerConcept): boolean {
  const p = CONFIRMATION_POLICIES[concept];
  return p.confirmation === "candle_close" || p.confirmation === "hybrid";
}

export function allowsIntrabarExecution(concept: TrackerConcept): boolean {
  const p = CONFIRMATION_POLICIES[concept];
  return p.confirmation === "intrabar_wick" || p.confirmation === "intrabar_touch" || p.confirmation === "hybrid";
}
