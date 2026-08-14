/** MNQ vs NQ chart/quote routing. User favours MNQ; NQ only when the chart is clearly NQ. */

export type NasdaqRoot = "MNQ" | "NQ";

/**
 * Classify a TradingView / Yahoo / TickStream symbol blob.
 * Checks MNQ before NQ so "MNQ1!" is never treated as NQ.
 */
export function classifyNasdaqRoot(text: string | null | undefined): NasdaqRoot | null {
  const s = String(text || "").toUpperCase();
  if (!s) return null;
  if (/(?:^|[^A-Z])MNQ(?:1!|[FGHJKMNQUVXZ]\d{1,4}|[^A-Z]|$)/.test(s)) return "MNQ";
  if (/(?:^|[^A-Z])NQ(?:1!|[FGHJKMNQUVXZ]\d{1,4}|[^A-Z]|$)/.test(s)) return "NQ";
  return null;
}

/** Prefer MNQ when missing or ambiguous. Use NQ only when clearly NQ. */
export function resolveQuoteInstrument(raw?: string | null): NasdaqRoot {
  return classifyNasdaqRoot(raw) ?? "MNQ";
}

export function yahooSymbolForRoot(root: NasdaqRoot): "MNQ=F" | "NQ=F" {
  return root === "NQ" ? "NQ=F" : "MNQ=F";
}

export function tvContinuousSymbol(root: NasdaqRoot): "MNQ1!" | "NQ1!" {
  return root === "NQ" ? "NQ1!" : "MNQ1!";
}
