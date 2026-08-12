import type {
  ReadonlyMarketObservation,
  MarketInterpretation,
  TradingDecision,
  TradingVerdict,
} from "./desk-schema";
import type { MarketContext } from "./types";
import { getExecutionScaffold } from "./execution-plan";

function entryZoneFromObservation(obs: ReadonlyMarketObservation): string | null {
  if (obs.fvg.status === "present" && obs.fvg.top != null && obs.fvg.bottom != null) {
    const lo = Math.min(obs.fvg.top, obs.fvg.bottom);
    const hi = Math.max(obs.fvg.top, obs.fvg.bottom);
    return `${lo.toFixed(2)}–${hi.toFixed(2)}`;
  }
  return null;
}

function invalidationFromObservation(
  obs: ReadonlyMarketObservation,
  verdict: TradingVerdict
): number | null {
  const swept = obs.liquidity.levels.filter((l) => l.taken === true);
  if (verdict === "LONG" && swept.length) {
    const lowest = swept.reduce((m, l) => Math.min(m, l.price), Infinity);
    return lowest - 5;
  }
  if (verdict === "SHORT" && swept.length) {
    const highest = swept.reduce((m, l) => Math.max(m, l.price), -Infinity);
    return highest + 5;
  }
  const mssLevel = obs.evidence["structure.mss_level"];
  if (mssLevel) {
    const level = parseFloat(mssLevel);
    if (verdict === "LONG") return level - 5;
    if (verdict === "SHORT") return level + 5;
  }
  return null;
}

/** Layer 3 — explicit verdict from interpretation + observation constraints. No weighted scores. */
export function buildTradingDecision(
  obs: ReadonlyMarketObservation,
  interp: MarketInterpretation,
  ctx: MarketContext
): TradingDecision {
  const execution = getExecutionScaffold(ctx);
  const entry_zone = entryZoneFromObservation(obs) ?? execution?.entryZone ?? null;

  if (obs.data_quality === "missing" || obs.data_quality === "stale") {
    return {
      verdict: "NO_TRADE",
      verdict_reason: "Chart data missing or stale — no call until observation engine has usable MarketState.",
      invalidation: null,
      entry_zone: null,
      target: null,
      observation_ref: obs,
      interpretation_ref: interp,
    };
  }

  if (obs.market_structure === "unknown" || obs.fvg.status === "unknown" || obs.displacement === "unknown") {
    return {
      verdict: "NO_TRADE",
      verdict_reason: "Required observation fields unknown — cannot apply framework without facts.",
      invalidation: null,
      entry_zone: null,
      target: null,
      observation_ref: obs,
      interpretation_ref: interp,
    };
  }

  let verdict: TradingVerdict = "NO_TRADE";
  let verdict_reason = interp.reasoning;

  const entryWait = execution?.entryStatus === "WAIT" || execution?.entryStatus === "EXTENDED";

  if (interp.long_case.supported && !interp.short_case.supported) {
    verdict = entryWait ? "WAIT" : "LONG";
    verdict_reason = entryWait
      ? `LONG bias — wait for retrace into ${entry_zone || "entry zone"}. ${interp.reasoning}`
      : `LONG — ${interp.entry_model || "bullish confluence"}. Invalidation below sweep/MSS. ${interp.reasoning}`;
  } else if (interp.short_case.supported && !interp.long_case.supported) {
    verdict = entryWait ? "WAIT" : "SHORT";
    verdict_reason = entryWait
      ? `SHORT bias — wait for retrace into ${entry_zone || "entry zone"}. ${interp.reasoning}`
      : `SHORT — ${interp.entry_model || "bearish confluence"}. Invalidation above sweep/MSS. ${interp.reasoning}`;
  } else if (interp.long_case.supported && interp.short_case.supported) {
    verdict = "WAIT";
    verdict_reason = `Conflicting cases — wait for clarity. ${interp.contradictions.join("; ")}`;
  } else {
    verdict = "NO_TRADE";
    verdict_reason = `No trade — ${interp.contradictions.join("; ") || "insufficient confluence from observed facts"}`;
  }

  const invalidation = invalidationFromObservation(obs, verdict);
  const target = execution?.target1Price ?? null;

  if (verdict === "LONG" || verdict === "SHORT" || verdict === "WAIT") {
    if (entry_zone && invalidation != null) {
      verdict_reason = `${verdict} — provided price retraces into ${entry_zone}. Invalidation: ${invalidation.toFixed(2)}.`;
    }
  }

  return {
    verdict,
    verdict_reason,
    invalidation,
    entry_zone,
    target,
    observation_ref: obs,
    interpretation_ref: interp,
  };
}
