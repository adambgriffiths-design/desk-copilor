export type ConfidenceLevel = "low" | "medium" | "high" | "unknown";

export function parseConfidence(verdict: string): ConfidenceLevel {
  const metaMatch = verdict.match(/META:[^\n]*confidence=(low|medium|high)/i);
  if (metaMatch) {
    return metaMatch[1].toLowerCase() as ConfidenceLevel;
  }

  const text = verdict.toLowerCase();

  const sectionMatch = verdict.match(
    /###\s*confidence\s*\n[\s\S]*?(low|medium|high)/i
  );
  if (sectionMatch) {
    return sectionMatch[1].toLowerCase() as ConfidenceLevel;
  }

  if (/\bconfidence:\s*low\b/i.test(verdict)) return "low";
  if (/\bconfidence:\s*high\b/i.test(verdict)) return "high";
  if (/\bconfidence:\s*medium\b/i.test(verdict)) return "medium";

  if (
    /stand aside|avoid|no setup|no trade/i.test(text) &&
    /\blow confidence\b/i.test(text)
  ) {
    return "low";
  }

  if (/\bhigh confidence\b/i.test(text)) return "high";
  if (/\bmedium confidence\b/i.test(text)) return "medium";
  if (/\blow confidence\b/i.test(text)) return "low";

  return "unknown";
}

export function shouldGradePrediction(verdict: string): {
  grade: boolean;
  confidence: ConfidenceLevel;
  reason?: string;
} {
  const confidence = parseConfidence(verdict);

  if (confidence === "low") {
    return {
      grade: false,
      confidence,
      reason:
        "Not graded — copilot had low confidence. Only high/medium predictions are scored.",
    };
  }

  if (confidence === "unknown") {
    return {
      grade: true,
      confidence,
      reason:
        "Confidence not detected — grading anyway. Use ### Confidence (low/medium/high) for fair scoring.",
    };
  }

  return { grade: true, confidence };
}
