import { PLAIN_LANGUAGE_RULE } from "@/lib/plain-language";

export const PREDICT_MODE_PROMPT = `
## PREDICT MODE (active)
You are only shown the LEFT HALF of the chart. The right half is hidden — it is the future outcome.

${PLAIN_LANGUAGE_RULE}

Your job:
- Read **one-minute structure** on the visible left half (market structure shift, fair value gap, order block, displacement).
- Read **higher-timeframe premium-discount / bias** from auto-fetched JSON — these are NOT on the chart image.
- Predict what price is LIKELY to do next on the hidden right half.
- Give a **dense labeled ICT desk brief** at the last visible candle (cut point) — informative, not chatty.
- State direction clearly with "potential buy" or "potential sell" at medium confidence by default; stand aside only for hard no-trade rules. Include expected path, targets, and invalidation in full words.
- End with META line: confidence + call + tradeableBias.

You cannot see the future — predict based on ICT confluence only.
`;
