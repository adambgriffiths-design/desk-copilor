export type BiasHint = "bullish" | "bearish" | "neutral";

export type BiasStack = {
  daily: BiasHint;
  m15: BiasHint;
  m5: BiasHint;
  /** True when daily vs 15m or 15m vs 5m disagree (excluding neutral pairs). */
  biasConflict: boolean;
  /** How many of D/15m/5m agree on the same non-neutral direction. */
  alignedCount: number;
  /** Dominant direction when alignedCount >= 2, else neutral. */
  dominantBias: BiasHint;
  /**
   * Direction for medium/high calls — daily/PD-led when partial conflict; conflicted only when no daily edge.
   */
  tradeableBias: BiasHint | "conflicted";
  summary: string;
  conflictPairs: string[];
};

function conflicts(a: BiasHint, b: BiasHint): boolean {
  if (a === "neutral" || b === "neutral") return false;
  return a !== b;
}

export function computeBiasStack(
  daily: BiasHint,
  m15: BiasHint,
  m5: BiasHint
): BiasStack {
  const conflictPairs: string[] = [];
  if (conflicts(daily, m15)) conflictPairs.push("daily vs 15m");
  if (conflicts(m15, m5)) conflictPairs.push("15m vs 5m");
  if (conflicts(daily, m5)) conflictPairs.push("daily vs 5m");

  const biasConflict = conflictPairs.length > 0;

  const counts: Record<BiasHint, number> = { bullish: 0, bearish: 0, neutral: 0 };
  for (const b of [daily, m15, m5]) counts[b]++;

  let dominantBias: BiasHint = "neutral";
  if (counts.bullish >= 2) dominantBias = "bullish";
  else if (counts.bearish >= 2) dominantBias = "bearish";

  const alignedCount = Math.max(counts.bullish, counts.bearish);

  let tradeableBias: BiasStack["tradeableBias"] = dominantBias;
  if (biasConflict) {
    if (alignedCount >= 2) {
      tradeableBias = dominantBias;
    } else if (daily !== "neutral") {
      tradeableBias = daily;
    } else {
      tradeableBias = "conflicted";
    }
  }

  let summary: string;
  if (biasConflict && tradeableBias === "conflicted") {
    summary =
      "Mixed higher-timeframe biases with no daily edge — lean directional from the premium and discount array brief at medium confidence, or low confidence with tight invalidation. Avoid stand aside unless chop at opening range gap fifty percent.";
  } else if (biasConflict) {
    summary = `Partial bias conflict (${conflictPairs.join(", ")}) — call in ${tradeableBias} direction (daily and premium-discount led) at medium confidence with clear invalidation.`;
  } else if (alignedCount >= 2) {
    summary = `${dominantBias} alignment on ${alignedCount} of three timeframes — call potential ${dominantBias === "bullish" ? "buy" : "sell"} at medium or higher confidence when the premium-discount target aligns; high if one-minute market structure shift or displacement confirms.`;
  } else {
    summary = `Daily bias ${daily} leads — call potential ${daily === "bullish" ? "buy" : daily === "bearish" ? "sell" : "buy or sell from the premium-discount brief"} at medium confidence toward the nearest premium-discount target unless a hard no-trade rule applies.`;
  }

  return {
    daily,
    m15,
    m5,
    biasConflict,
    alignedCount,
    dominantBias,
    tradeableBias,
    summary,
    conflictPairs,
  };
}
