import OpenAI from "openai";
import { fetchAllTimeframesForBacktest, sliceBarsAt } from "@/lib/market-data";
import {
  buildMarketContextAt,
  formatContextForBacktestPrompt,
  formatM1Snapshot,
} from "@/lib/levels";
import { renderM1ChartPng } from "@/lib/chart-render";
import { SYSTEM_PROMPT } from "@/lib/playbook";
import {
  readAllFeedback,
  appendFeedback,
  createFeedbackEntry,
  getTrainingExamples,
  dedupeBacktestFeedback,
  getGradedBacktestTimes,
  clearBacktestFeedback,
} from "@/lib/feedback-store";
import { formatTrainingExamplesForPrompt } from "@/lib/training-examples";
import { readLearnedRules, formatLearnedRulesForPrompt } from "@/lib/learned-rules-store";
import {
  discoverNyAmMoments,
  getForwardWindow,
  parseVerdictDirection,
  type BacktestMoment,
} from "@/lib/backtest";
import { parseConfidence } from "@/lib/parse-confidence";
import { gradeBacktestWithLlm } from "@/lib/backtest-grader";

export type BacktestRunOptions = {
  model?: string;
  maxMoments?: number;
  dryRun?: boolean;
  skipExisting?: boolean;
  dedupeFirst?: boolean;
  /** @deprecated NY AM window is derived from session end, not bar count */
  forwardBars?: number;
  onProgress?: (msg: string) => void;
};

export type BacktestRunResult = {
  sessions: number;
  moments: number;
  ran: number;
  skippedExisting: number;
  graded: number;
  skipped: number;
  misses: number;
  correct: number;
  partial: number;
  wrong: number;
  dryRun: boolean;
  dedupeRemoved?: number;
};

async function generateChartVerdict(
  openai: OpenAI,
  input: {
    marketContextText: string;
    imageBase64: string;
    chartTimeEst: string;
    dateKey: string;
    learnedText: string;
    trainingText: string;
    model: string;
  }
): Promise<string> {
  const userMessage = [
    input.learnedText,
    input.trainingText,
    input.marketContextText,
    `BACKTEST REPLAY — MNQ NY AM session ${input.dateKey} at ${input.chartTimeEst} EST.`,
    "Analyze the attached 1m chart (ORG/CE/NWOG lines drawn). Cross-reference with JSON context. Respond with a dense labeled desk brief; end with META line (confidence + call).",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: input.model,
    max_tokens: 900,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userMessage },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${input.imageBase64}`,
              detail: "low",
            },
          },
        ],
      },
    ],
  });

  const verdict = response.choices[0]?.message?.content;
  if (!verdict) throw new Error("No response from model");
  return verdict;
}

export async function runBacktestTraining(
  options: BacktestRunOptions = {}
): Promise<BacktestRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey && !options.dryRun) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const model = options.model ?? "gpt-4o-mini";
  const skipExisting = options.skipExisting !== false;
  const log = options.onProgress ?? (() => {});

  let dedupeRemoved = 0;
  if (options.dedupeFirst !== false && skipExisting) {
    const dedupe = await dedupeBacktestFeedback();
    dedupeRemoved = dedupe.removed;
    if (dedupe.removed > 0) {
      log(`Deduped feedback: removed ${dedupe.removed} duplicate backtest rows.`);
    }
  }

  if (!skipExisting) {
    const cleared = await clearBacktestFeedback();
    if (cleared > 0) {
      log(`Force rerun: cleared ${cleared} prior backtest rows.`);
    }
  }

  log("Fetching historical bars (7d 1m, 60d 5m/15m)...");
  const data = await fetchAllTimeframesForBacktest();
  const allMoments = discoverNyAmMoments(data.m1);

  const existingFeedback = await readAllFeedback();
  const gradedTimes = getGradedBacktestTimes(existingFeedback);

  let moments = allMoments;
  let skippedExisting = 0;
  if (skipExisting) {
    moments = allMoments.filter((m) => {
      const key = `${m.dateKey} ${m.chartTimeEst}`;
      if (gradedTimes.has(key)) {
        skippedExisting++;
        return false;
      }
      return true;
    });
    if (skippedExisting > 0) {
      log(`Skipping ${skippedExisting} moments already in feedback (use skipExisting:false to rerun).`);
    }
  }

  const limited = options.maxMoments ? moments.slice(0, options.maxMoments) : moments;
  const sessionDates = new Set(limited.map((m) => m.dateKey));

  log(`Found ${allMoments.length} NY AM moments; running ${limited.length} (${sessionDates.size} sessions).`);

  if (options.dryRun) {
    return {
      sessions: sessionDates.size,
      moments: allMoments.length,
      ran: limited.length,
      skippedExisting,
      graded: 0,
      skipped: 0,
      misses: 0,
      correct: 0,
      partial: 0,
      wrong: 0,
      dryRun: true,
      dedupeRemoved,
    };
  }

  const openai = new OpenAI({ apiKey });
  const trainingText = formatTrainingExamplesForPrompt(
    getTrainingExamples(await readAllFeedback())
  );
  const learned = await readLearnedRules();
  const learnedText = formatLearnedRulesForPrompt(learned);

  let graded = 0;
  let skipped = 0;
  let misses = 0;
  let correct = 0;
  let partial = 0;
  let wrong = 0;

  for (let i = 0; i < limited.length; i++) {
    const moment = limited[i] as BacktestMoment;
    log(`[${i + 1}/${limited.length}] ${moment.dateKey} ${moment.chartTimeEst} EST...`);

    const m1At = sliceBarsAt(data.m1, moment.asOf);
    const ctx = buildMarketContextAt(data, moment.asOf, moment.chartTimeEst);
    const m1Snapshot = formatM1Snapshot(m1At, 20);
    const marketContextText = formatContextForBacktestPrompt(ctx, m1Snapshot);

    const chart = await renderM1ChartPng({
      bars: m1At,
      ctx,
      chartTimeEst: moment.chartTimeEst,
      barCount: 60,
    });

    const verdict = await generateChartVerdict(openai, {
      marketContextText,
      imageBase64: chart.base64,
      chartTimeEst: moment.chartTimeEst,
      dateKey: moment.dateKey,
      learnedText,
      trainingText,
      model,
    });

    const confidence = parseConfidence(verdict);
    const direction = parseVerdictDirection(verdict);
    const { bars: forward } = getForwardWindow(data.m1, moment.bar, moment.dateKey);
    const auto = await gradeBacktestWithLlm(openai, {
      verdict,
      chartTime: `${moment.dateKey} ${moment.chartTimeEst}`,
      entryPrice: moment.bar.close,
      forwardBars: forward,
      marketContext: ctx,
      direction,
    });

    if (auto.rating === "skipped") {
      skipped++;
      log(`  → skipped (${auto.reason ?? "n/a"})`);
      continue;
    }

    if (auto.rating === "miss") {
      misses++;
      const entry = createFeedbackEntry({
        rating: "miss",
        predictMode: false,
        chartTime: `${moment.dateKey} ${moment.chartTimeEst}`,
        note: `backtest:llm-grader|confidence:${confidence}|miss`,
        verdict,
        correction: auto.correction,
        failedConcepts: auto.failedConcepts,
        failureReason: auto.failureReason,
        marketContext: ctx,
      });
      await appendFeedback(entry);
      log(`  → miss (saved for learning — ${direction}, net ${auto.netMove >= 0 ? "+" : ""}${auto.netMove.toFixed(1)} pts)`);
      continue;
    }

    const rating = auto.rating as "correct" | "partial" | "wrong";
    graded++;
    if (rating === "correct") correct++;
    if (rating === "partial") partial++;
    if (rating === "wrong") wrong++;

    let failedConcepts = auto.failedConcepts;
    let failureReason = auto.failureReason;
    let correction = auto.correction;

    if (rating !== "correct" && failedConcepts?.length) {
      log(`  tags: ${failedConcepts.join(", ")}`);
    }

    const entry = createFeedbackEntry({
      rating,
      predictMode: false,
      chartTime: `${moment.dateKey} ${moment.chartTimeEst}`,
      note: `backtest:llm-grader|confidence:${confidence}`,
      verdict,
      correction,
      failedConcepts,
      failureReason,
      marketContext: ctx,
    });

    await appendFeedback(entry);
    log(`  → ${rating} (${direction}, conf:${confidence}, llm-grader, ${auto.windowBars} bars, net ${auto.netMove >= 0 ? "+" : ""}${auto.netMove.toFixed(1)} pts)`);
  }

  return {
    sessions: sessionDates.size,
    moments: allMoments.length,
    ran: limited.length,
    skippedExisting,
    graded,
    skipped,
    misses,
    correct,
    partial,
    wrong,
    dryRun: false,
    dedupeRemoved,
  };
}
