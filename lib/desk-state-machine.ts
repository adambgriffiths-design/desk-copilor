/**
 * Event-driven desk tracker state machine.
 * Moves on confirmed events — not on every tick.
 */
import type { TrackerConcept } from "./confirmation-policy";

export type DeskTrackerPhase =
  | "waiting"
  | "watching_liquidity"
  | "liquidity_swept_pending"
  | "liquidity_swept_confirmed"
  | "mss_pending"
  | "mss_confirmed"
  | "waiting_for_retrace"
  | "entry_watching"
  | "entry_active"
  | "invalidated"
  | "no_trade";

export type TrackerStatusColor = "green" | "amber" | "red";

export type StateTransition = {
  from: DeskTrackerPhase;
  to: DeskTrackerPhase;
  trigger: string;
  concept?: TrackerConcept;
};

const TRANSITIONS: StateTransition[] = [
  { from: "waiting", to: "watching_liquidity", trigger: "approaching_liquidity" },
  { from: "watching_liquidity", to: "liquidity_swept_pending", trigger: "wick_through_level", concept: "liquidity_sweep" },
  { from: "liquidity_swept_pending", to: "liquidity_swept_confirmed", trigger: "close_confirms_sweep", concept: "liquidity_sweep" },
  { from: "liquidity_swept_confirmed", to: "mss_pending", trigger: "displacement_after_sweep", concept: "displacement" },
  { from: "mss_pending", to: "mss_confirmed", trigger: "close_confirms_mss", concept: "mss" },
  { from: "mss_confirmed", to: "waiting_for_retrace", trigger: "fvg_identified", concept: "fvg_formation" },
  { from: "waiting_for_retrace", to: "entry_watching", trigger: "price_near_fvg", concept: "fvg_entry" },
  { from: "entry_watching", to: "entry_active", trigger: "wick_in_fvg_zone", concept: "fvg_entry" },
  { from: "entry_active", to: "invalidated", trigger: "close_through_invalidation", concept: "invalidation" },
  { from: "invalidated", to: "waiting", trigger: "reset" },
  { from: "waiting", to: "no_trade", trigger: "insufficient_data" },
  { from: "no_trade", to: "waiting", trigger: "data_restored" },
];

export function statusColorForPhase(phase: DeskTrackerPhase): TrackerStatusColor {
  if (phase === "invalidated" || phase === "entry_active") return "red";
  if (
    phase.endsWith("_pending") ||
    phase === "watching_liquidity" ||
    phase === "entry_watching" ||
    phase === "waiting_for_retrace"
  ) {
    return "amber";
  }
  if (phase === "no_trade") return "amber";
  return "green";
}

export function phaseLabel(phase: DeskTrackerPhase): string {
  const labels: Record<DeskTrackerPhase, string> = {
    waiting: "Waiting",
    watching_liquidity: "Watching liquidity",
    liquidity_swept_pending: "Sweep pending (unconfirmed)",
    liquidity_swept_confirmed: "Liquidity swept",
    mss_pending: "MSS pending (unconfirmed)",
    mss_confirmed: "MSS confirmed",
    waiting_for_retrace: "Waiting for retrace",
    entry_watching: "Watching FVG entry",
    entry_active: "Entry criteria met",
    invalidated: "Invalidated",
    no_trade: "No trade — insufficient data",
  };
  return labels[phase] ?? phase;
}

export function canTransition(from: DeskTrackerPhase, trigger: string): DeskTrackerPhase | null {
  const match = TRANSITIONS.find((t) => t.from === from && t.trigger === trigger);
  return match?.to ?? null;
}

export function nextPhase(current: DeskTrackerPhase, trigger: string): DeskTrackerPhase {
  return canTransition(current, trigger) ?? current;
}

/** Infer trigger from observation deltas (close-confirmed path). */
export function inferCloseTrigger(input: {
  phase: DeskTrackerPhase;
  sweepConfirmed?: boolean;
  mssConfirmed?: boolean;
  fvgPresent?: boolean;
  invalidated?: boolean;
  nearLiquidity?: boolean;
}): string | null {
  if (input.invalidated) return "close_through_invalidation";
  if (input.phase === "liquidity_swept_pending" && input.sweepConfirmed) return "close_confirms_sweep";
  if (input.phase === "mss_pending" && input.mssConfirmed) return "close_confirms_mss";
  if (input.phase === "liquidity_swept_confirmed" && input.mssConfirmed) return "close_confirms_mss";
  if (input.phase === "mss_confirmed" && input.fvgPresent) return "fvg_identified";
  if (input.phase === "waiting" && input.nearLiquidity) return "approaching_liquidity";
  return null;
}

export function inferIntrabarTrigger(input: {
  phase: DeskTrackerPhase;
  wickThroughLiquidity?: boolean;
  wickInFvg?: boolean;
}): string | null {
  if (input.phase === "watching_liquidity" && input.wickThroughLiquidity) return "wick_through_level";
  if (
    (input.phase === "waiting_for_retrace" || input.phase === "entry_watching") &&
    input.wickInFvg
  ) {
    return input.phase === "waiting_for_retrace" ? "price_near_fvg" : "wick_in_fvg_zone";
  }
  return null;
}
