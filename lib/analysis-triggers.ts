/**
 * Karen analysis trigger policy — ticks update state; analysis is event/user gated.
 */
import type { StructureEvent, StructureEventKind } from "./structure-state";

const ANALYSIS_KINDS = new Set<StructureEventKind>([
  "swing_confirmed",
  "mss",
  "bos",
  "fvg_formed",
  "fvg_filled",
  "fvg_inverted",
  "liquidity_formed",
  "liquidity_swept",
  "liquidity_invalidated",
  "session_change",
  "bias_change",
  "level_interaction",
  "user_request",
]);

export type AnalysisTrigger = "tick" | "bar_close" | "user" | "reconnect";

export function shouldRunKarenAnalysis(
  trigger: AnalysisTrigger,
  events: StructureEvent[]
): boolean {
  if (trigger === "user" || trigger === "reconnect") return true;
  return events.some((e) => ANALYSIS_KINDS.has(e.kind));
}

export function majorLevelInteraction(
  prevPrice: number,
  nextPrice: number,
  trackedPrices: number[],
  epsilon = 0.25
): boolean {
  if (!Number.isFinite(prevPrice) || !Number.isFinite(nextPrice)) return false;
  const lo = Math.min(prevPrice, nextPrice) - epsilon;
  const hi = Math.max(prevPrice, nextPrice) + epsilon;
  for (const p of trackedPrices) {
    const wasAway = Math.abs(prevPrice - p) > epsilon;
    const nowNear = p >= lo && p <= hi;
    if (wasAway && nowNear) return true;
  }
  return false;
}
