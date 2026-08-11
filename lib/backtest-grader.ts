import OpenAI from "openai";
import type { Bar } from "./types";
import type { MarketContext } from "./types";
import { formatEst } from "./market-data";
import {
  BACKTEST_GRADE_SYSTEM_PROMPT,
  type BacktestGradeResult,
} from "./backtest-grade-prompt";
import {
  readLearnedGrader,
  formatLearnedGraderForPrompt,
} from "./learned-grader-store";
import { ICT_CONCEPTS, type FeedbackRating } from "./feedback-types";
import type { IctConcept } from "./feedback-types";
import type { VerdictDirection } from "./backtest";

export type LlmGradeOutput = {
  rating: FeedbackRating | "skipped";
  outcome: string;
  reasoning: string;
  correction?: string;
  failedConcepts?: IctConcept[];
  failureReason?: string;
  netMove: number;
  windowBars: number;
  reason?: string;
};

export function formatForwardSession(
  forwardBars: Bar[],
  entryPrice: number,
  chartTime: string
): string {
  if (forwardBars.length === 0) {
    return "No forward bars until NY AM end.";
  }

  const hi = Math.max(...forwardBars.map((b) => b.high));
  const lo = Math.min(...forwardBars.map((b) => b.low));
  const last = forwardBars.at(-1)!;
  const sessionDir =
    last.close > entryPrice ? "up" : last.close < entryPrice ? "down" : "flat";

  const sample = forwardBars
    .filter((_, i) => i % 5 === 0 || i === forwardBars.length - 1)
    .map(
      (b) =>
        `${formatEst(b.time)} O:${b.open.toFixed(1)} H:${b.high.toFixed(1)} L:${b.low.toFixed(1)} C:${b.close.toFixed(1)}`
    )
    .join("\n");

  return `Cut: ${chartTime} EST @ ${entryPrice.toFixed(1)}
Forward window: ${forwardBars.length} x 1m bars until 11:00 ET
Session H/L after cut: ${hi.toFixed(1)} / ${lo.toFixed(1)}
Session close vs cut: ${last.close.toFixed(1)} (${sessionDir} overall)

Sampled forward 1m OHLC:
${sample}`;
}

function parseFailedConcepts(raw?: string[]): IctConcept[] {
  if (!raw?.length) return [];
  return raw.filter((c): c is IctConcept =>
    (ICT_CONCEPTS as readonly string[]).includes(c)
  );
}

export async function gradeBacktestWithLlm(
  openai: OpenAI,
  input: {
    verdict: string;
    chartTime: string;
    entryPrice: number;
    forwardBars: Bar[];
    marketContext: MarketContext;
    direction: VerdictDirection;
  }
): Promise<LlmGradeOutput> {
  const { forwardBars, entryPrice, direction } = input;

  if (forwardBars.length === 0) {
    return {
      rating: "skipped",
      outcome: "No forward bars until session end.",
      reasoning: "",
      netMove: 0,
      windowBars: 0,
      reason: "no_forward_bars",
    };
  }

  const lastClose = forwardBars.at(-1)!.close;
  const netMove =
    direction === "buy"
      ? lastClose - entryPrice
      : direction === "sell"
        ? entryPrice - lastClose
        : lastClose - entryPrice;

  const learnedGrader = await readLearnedGrader();
  const graderGuidance = formatLearnedGraderForPrompt(learnedGrader);
  const forwardText = formatForwardSession(
    forwardBars,
    entryPrice,
    input.chartTime
  );

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: BACKTEST_GRADE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          graderGuidance,
          "## Market context at cut\n```json\n" +
            JSON.stringify(input.marketContext, null, 2) +
            "\n```",
          "## Copilot verdict at cut\n" + input.verdict,
          "## What happened after\n" + forwardText,
          `Parsed direction hint: ${input.direction}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("No grade from LLM grader");
  }

  const grade = JSON.parse(raw) as BacktestGradeResult;
  const rating = grade.rating ?? "partial";

  if (rating === "miss") {
    return {
      rating: "miss",
      outcome: grade.outcome,
      reasoning: grade.reasoning,
      correction:
        grade.correction?.trim() ||
        `Should have called direction when structure confirmed. ${grade.outcome}`,
      failedConcepts: parseFailedConcepts(grade.failedConcepts),
      failureReason:
        grade.failureReason ||
        grade.reasoning ||
        "Under-called — stood aside when ICT confluence supported a directional brief",
      netMove,
      windowBars: forwardBars.length,
    };
  }

  if (!["correct", "partial", "wrong"].includes(rating)) {
    return {
      rating: "partial",
      outcome: grade.outcome,
      reasoning: grade.reasoning,
      correction: grade.correction,
      failedConcepts: parseFailedConcepts(grade.failedConcepts),
      failureReason: grade.failureReason,
      netMove,
      windowBars: forwardBars.length,
    };
  }

  return {
    rating,
    outcome: grade.outcome,
    reasoning: grade.reasoning,
    correction:
      rating === "correct" ? undefined : grade.correction?.trim() || grade.outcome,
    failedConcepts:
      rating === "correct" ? undefined : parseFailedConcepts(grade.failedConcepts),
    failureReason:
      rating === "wrong" || rating === "partial"
        ? grade.failureReason || grade.reasoning
        : undefined,
    netMove,
    windowBars: forwardBars.length,
  };
}
