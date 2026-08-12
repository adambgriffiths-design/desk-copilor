import type { ReadonlyMarketObservation, MarketInterpretation } from "./desk-schema";

/** Allowed numeric tokens from observation — interpretation must not cite others. */
export function extractAllowedPrices(obs: ReadonlyMarketObservation): Set<string> {
  const allowed = new Set<string>();

  const addNum = (n: number) => {
    allowed.add(n.toFixed(0));
    allowed.add(n.toFixed(1));
    allowed.add(n.toFixed(2));
    allowed.add(String(Math.round(n)));
  };

  for (const val of Object.values(obs.evidence)) {
    const matches = val.match(/\d{4,6}(?:\.\d{1,2})?/g);
    if (matches) matches.forEach((m) => allowed.add(m));
  }

  for (const level of obs.liquidity.levels) {
    if (Number.isFinite(level.price)) addNum(level.price);
  }
  if (obs.fvg.top != null) addNum(obs.fvg.top);
  if (obs.fvg.bottom != null) addNum(obs.fvg.bottom);
  if (obs.displacement_points != null) addNum(obs.displacement_points);

  return allowed;
}

/** Extract 4–6 digit price-like numbers from text (MNQ range). */
function extractPricesFromText(text: string): string[] {
  return text.match(/\b\d{4,6}(?:\.\d{1,2})?\b/g) ?? [];
}

export type ContaminationResult = {
  passed: boolean;
  violations: string[];
};

/**
 * Validate interpretation does not invent prices/levels not in observation.
 * HARD RULE enforcement — run before Layer 3 and before voice output.
 */
export function validateInterpretationContamination(
  obs: ReadonlyMarketObservation,
  interp: MarketInterpretation
): ContaminationResult {
  const violations: string[] = [];
  const allowed = extractAllowedPrices(obs);

  const texts = [
    interp.reasoning,
    interp.entry_model || "",
    ...interp.contradictions,
    ...interp.long_case.reasons,
    ...interp.short_case.reasons,
  ];

  for (const text of texts) {
    for (const price of extractPricesFromText(text)) {
      const variants = [price, parseFloat(price).toFixed(0), parseFloat(price).toFixed(2)];
      const ok = variants.some((v) => allowed.has(v));
      if (!ok && parseFloat(price) > 1000) {
        violations.push(`Invented or unobserved price ${price} in interpretation`);
      }
    }
  }

  if (obs.market_structure === "unknown" && /bullish structure|bearish structure|market structure shift/i.test(interp.reasoning)) {
    violations.push("Interpretation claims structure when observation.market_structure is unknown");
  }
  if (obs.fvg.status === "unknown" && /FVG exists|fair value gap between/i.test(interp.reasoning)) {
    violations.push("Interpretation claims FVG when observation.fvg.status is unknown");
  }
  if (obs.displacement === "unknown" && /displaced by|displacement present/i.test(interp.reasoning)) {
    violations.push("Interpretation claims displacement when observation.displacement is unknown");
  }

  if (interp.invalidation != null) {
    const inv = interp.invalidation.toFixed(2);
    if (!allowed.has(inv) && !allowed.has(interp.invalidation.toFixed(0))) {
      violations.push(`Invalidation price ${inv} not in observation evidence`);
    }
  }
  if (interp.target != null) {
    const tgt = interp.target.toFixed(2);
    if (!allowed.has(tgt) && !allowed.has(interp.target.toFixed(0))) {
      violations.push(`Target price ${tgt} not in observation evidence`);
    }
  }

  return { passed: violations.length === 0, violations };
}

/** Fail fast — throws in dev/test, returns result in production paths. */
export function assertInterpretationClean(
  obs: ReadonlyMarketObservation,
  interp: MarketInterpretation
): void {
  const result = validateInterpretationContamination(obs, interp);
  if (!result.passed) {
    throw new Error(`Interpretation contamination: ${result.violations.join("; ")}`);
  }
}
