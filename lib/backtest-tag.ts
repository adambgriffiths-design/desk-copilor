import OpenAI from "openai";
import { ICT_CONCEPTS, type IctConcept } from "./feedback-types";
import type { VerdictDirection } from "./backtest";

export type BacktestTagInput = {
  verdict: string;
  direction: VerdictDirection;
  outcome: string;
  netMove: number;
  chartTime?: string;
};

export type BacktestTagResult = {
  failedConcepts: IctConcept[];
  failureReason: string;
  correction: string;
};

const TAG_SYSTEM = `You tag ICT concept misreads for a MNQ desk copilot backtest failure.

Given the copilot verdict, parsed direction, and what price actually did next, identify which ICT concepts were misread.

Valid concepts only: ${ICT_CONCEPTS.join(", ")}

Respond ONLY with JSON:
{
  "failedConcepts": ["AMD", "consolidation"],
  "failureReason": "one line — core ICT mistake",
  "correction": "ideal brief verdict at that moment"
}

Rules:
- stand_aside + big move after → tag consolidation, AMD, MSS, or bias tags as appropriate
- wrong buy/sell direction → tag bias_daily, bias_15m, bias_5m, MSS, liquidity
- missed FVG/ORG/CE read → tag FVG, ORG, CE
- pick 1-4 concepts max, never use "unknown"`;

export async function tagBacktestFailure(
  openai: OpenAI,
  input: BacktestTagInput
): Promise<BacktestTagResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: TAG_SYSTEM },
      {
        role: "user",
        content: [
          input.chartTime && `Time: ${input.chartTime} EST`,
          `Parsed direction: ${input.direction}`,
          `Net move (30 x 1m): ${input.netMove >= 0 ? "+" : ""}${input.netMove.toFixed(1)} pts`,
          `Outcome: ${input.outcome}`,
          `\n## Copilot verdict\n${input.verdict}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    return fallbackTags(input);
  }

  try {
    const parsed = JSON.parse(raw) as BacktestTagResult;
    const valid = (parsed.failedConcepts ?? []).filter((c): c is IctConcept =>
      (ICT_CONCEPTS as readonly string[]).includes(c)
    );
    return {
      failedConcepts: valid.length ? valid : fallbackTags(input).failedConcepts,
      failureReason: parsed.failureReason?.trim() || fallbackTags(input).failureReason,
      correction: parsed.correction?.trim() || fallbackTags(input).correction,
    };
  } catch {
    return fallbackTags(input);
  }
}

function fallbackTags(input: BacktestTagInput): BacktestTagResult {
  const concepts: IctConcept[] = [];

  if (input.direction === "stand_aside" && Math.abs(input.netMove) >= 20) {
    concepts.push("consolidation", "AMD");
  } else if (input.direction === "buy" && input.netMove <= -15) {
    concepts.push("bias_15m", "MSS");
  } else if (input.direction === "sell" && input.netMove <= -15) {
    concepts.push("bias_15m", "MSS");
  } else if (input.direction === "buy" && input.netMove >= 20) {
    concepts.push("FVG", "liquidity");
  } else {
    concepts.push("bias_5m");
  }

  return {
    failedConcepts: concepts.slice(0, 3),
    failureReason: input.outcome,
    correction: `Reassess at cut: ${input.outcome}`,
  };
}
