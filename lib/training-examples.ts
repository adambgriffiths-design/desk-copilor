import type { FeedbackEntry } from "./feedback-types";

export function formatTrainingExamplesForPrompt(examples: FeedbackEntry[]): string {
  if (examples.length === 0) return "";

  const blocks = examples.map((ex, i) => {
    const context = [
      ex.chartTime && `Time: ${ex.chartTime} EST`,
      ex.predictMode && "Mode: predict (left half only)",
      ex.note && `Note: ${ex.note}`,
    ]
      .filter(Boolean)
      .join(" | ");

    return `### Trainer correction ${i + 1}
${context ? `Context: ${context}\n` : ""}Copilot said (WRONG/PARTIAL):
${ex.verdict.trim()}

Trainer correction — say it more like this next time:
${ex.correction?.trim()}`;
  });

  return `## TRAINER FEEDBACK (learn from these — prioritize this ICT style)

The trader graded past verdicts. When similar setups appear, apply these corrections:

${blocks.join("\n\n")}`;
}
