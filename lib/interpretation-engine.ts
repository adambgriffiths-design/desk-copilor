import type { ReadonlyMarketObservation, MarketInterpretation } from "./desk-schema";
import { formatObservationNarrative } from "./observation-engine";
import {
  classifyLevelSide,
  describeSweptLevel,
  shouldBlockLongFromSessionLiquidity,
  isLondonAsiaHighRaid,
} from "./session-liquidity";

function ref(obs: ReadonlyMarketObservation, key: string): string | null {
  return obs.evidence[key] ?? null;
}

function isKnown<T extends string>(v: T | "unknown"): v is T {
  return v !== "unknown";
}

/** Layer 2 — meaning only. Receives frozen observation; must not invent facts. */
export function buildMarketInterpretation(obs: ReadonlyMarketObservation): MarketInterpretation {
  const observation_refs: string[] = [];
  const contradictions: string[] = [];
  const longReasons: string[] = [];
  const shortReasons: string[] = [];

  const cite = (key: string, label: string) => {
    const val = ref(obs, key);
    if (val) {
      observation_refs.push(key);
      return `${label} (${key}=${val})`;
    }
    return null;
  };

  if (isKnown(obs.htf_bias.tradeable_bias) && obs.htf_bias.tradeable_bias === "bullish") {
    const c = cite("bias_stack.tradeable_bias", "HTF bias bullish");
    if (c) longReasons.push(c);
  }
  if (isKnown(obs.htf_bias.tradeable_bias) && obs.htf_bias.tradeable_bias === "bearish") {
    const c = cite("bias_stack.tradeable_bias", "HTF bias bearish");
    if (c) shortReasons.push(c);
  }
  if (obs.market_structure === "bullish" && !shouldBlockLongFromSessionLiquidity(obs)) {
    observation_refs.push("structure.mss_direction");
    longReasons.push("Observed market structure is bullish");
  } else if (obs.market_structure === "bullish" && shouldBlockLongFromSessionLiquidity(obs)) {
    observation_refs.push("structure.mss_direction");
    contradictions.push(
      "Close through a session/PD high is the buy-side raid, not bullish continuation"
    );
  }
  if (obs.market_structure === "bearish") {
    observation_refs.push("structure.mss_direction");
    shortReasons.push("Observed market structure is bearish");
  }
  if (obs.market_structure === "unknown") {
    contradictions.push("Market structure unknown — cannot lean directional");
  }

  const swept = obs.liquidity.levels.filter((l) => l.taken === true);
  let bslRaid = false;
  let sslRaid = false;
  if (swept.length) {
    for (const s of swept) {
      observation_refs.push(`liquidity.${s.label.toLowerCase().replace(/\s+/g, "_")}`);
      const side = classifyLevelSide(s.label, s.side);
      const note = describeSweptLevel(s.label, side);
      if (side === "buy_side") {
        bslRaid = true;
        // Caution only — BSL raid is not short confluence by itself (do not auto-force SHORT).
        contradictions.push(note);
      } else if (side === "sell_side") {
        sslRaid = true;
        longReasons.push(note);
      }
    }
  }

  if (obs.displacement === "present") {
    observation_refs.push("structure.displacement");
    if (obs.displacement_points != null) observation_refs.push("structure.displacement_points");
    // Displacement through a high is often the raid itself — not directional confluence.
    if (sslRaid && !bslRaid) longReasons.push("Displacement present after sell-side sweep");
  }
  if (obs.displacement === "unknown") {
    contradictions.push("Displacement unknown — cannot confirm impulsive move");
  }

  if (obs.fvg.status === "present" && obs.fvg.direction === "bullish") {
    observation_refs.push("structure.fvg.status");
    if (obs.fvg.bottom != null) observation_refs.push("structure.fvg.bottom");
    longReasons.push("Bullish FVG present in observation");
  }
  if (obs.fvg.status === "present" && obs.fvg.direction === "bearish") {
    observation_refs.push("structure.fvg.status");
    if (obs.fvg.top != null) observation_refs.push("structure.fvg.top");
    shortReasons.push("Bearish FVG present in observation");
  }
  if (obs.fvg.status === "unknown") {
    contradictions.push("FVG status unknown — cannot scaffold entry from gap");
  }

  if (obs.market_structure === "bullish" && obs.htf_bias.tradeable_bias === "bearish") {
    contradictions.push("Bullish structure opposes bearish tradeable bias");
  }
  if (obs.market_structure === "bearish" && obs.htf_bias.tradeable_bias === "bullish") {
    contradictions.push("Bearish structure opposes bullish tradeable bias");
  }
  if (obs.htf_bias.aligned === false) {
    contradictions.push("Higher timeframe biases not aligned");
  }
  if (obs.data_quality !== "good" && obs.data_quality !== "degraded") {
    contradictions.push(`Data quality ${obs.data_quality} — observation incomplete`);
  }

  let entry_model: string | null = null;
  const blockLongFromRaid = shouldBlockLongFromSessionLiquidity(obs);
  if (
    obs.session === "ny" &&
    sslRaid &&
    !blockLongFromRaid &&
    obs.displacement === "present" &&
    obs.fvg.status === "present"
  ) {
    entry_model = "NY open sweep + displacement + FVG retrace (Adam reversal model)";
    observation_refs.push("active_session.id", "structure.displacement", "structure.fvg.status");
  } else if (
    obs.fvg.status === "present" &&
    obs.displacement === "present" &&
    !blockLongFromRaid
  ) {
    entry_model = "Displacement + FVG retrace entry";
  } else if (
    obs.market_structure !== "unclear" &&
    obs.market_structure !== "unknown" &&
    !(blockLongFromRaid && obs.market_structure === "bullish")
  ) {
    entry_model = `${obs.market_structure} structure continuation`;
  }

  if (shouldBlockLongFromSessionLiquidity(obs)) {
    contradictions.push(
      isLondonAsiaHighRaid(obs)
        ? "Asia high taken in London is buy-side liquidity swept — not a reason to recommend bullishness"
        : "Buy-side liquidity (high) taken is not a bullish continuation by itself"
    );
  }

  let longSupported =
    longReasons.length >= 2 &&
    obs.market_structure !== "unknown" &&
    obs.fvg.status !== "unknown" &&
    contradictions.filter((c) => c.includes("opposes bullish")).length === 0 &&
    !shouldBlockLongFromSessionLiquidity(obs);

  const shortSupported =
    shortReasons.length >= 2 &&
    obs.market_structure !== "unknown" &&
    obs.fvg.status !== "unknown" &&
    contradictions.filter((c) => c.includes("opposes bearish")).length === 0;

  let reasoning: string;
  const obsNarrative = formatObservationNarrative(obs);

  if (entry_model) {
    reasoning = `This resembles ${entry_model} because ${obsNarrative.trim()} `;
  } else {
    reasoning = `From observed facts: ${obsNarrative.trim()} `;
  }

  if (shortSupported && !longSupported) {
    reasoning += `I would consider SHORT because ${shortReasons.slice(0, 3).join("; ")}. I rejected LONG because ${contradictions.length ? contradictions.join("; ") : "insufficient bullish confluence"}.`;
  } else if (longSupported && !shortSupported) {
    reasoning += `I would consider LONG because ${longReasons.slice(0, 3).join("; ")}. I rejected SHORT because ${contradictions.length ? contradictions.join("; ") : "insufficient bearish confluence"}.`;
  } else if (longSupported && shortSupported) {
    reasoning += `Both sides have partial support. Contradictions: ${contradictions.join("; ") || "mixed structure"}.`;
  } else {
    reasoning += `No clear lean — ${contradictions.join("; ") || "insufficient ICT confluence from observed facts only"}.`;
  }

  return {
    entry_model,
    invalidation: null,
    target: null,
    risk_reward: null,
    contradictions,
    long_case: { supported: longSupported, reasons: longReasons },
    short_case: { supported: shortSupported, reasons: shortReasons },
    reasoning,
    observation_refs: [...new Set(observation_refs)],
  };
}
