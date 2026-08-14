import OpenAI from "openai";
import { fetchAllTimeframesCached } from "@/lib/market-data";
import { buildMarketContext, formatContextForLiveVerdict } from "@/lib/levels";
import { LIVE_VERDICT_SYSTEM } from "@/lib/playbook";
import { readAllFeedback, getTrainingExamples } from "@/lib/feedback-store";
import { formatTrainingExamplesForPrompt } from "@/lib/training-examples";
import { readLearnedRules, formatLearnedRulesForPrompt } from "@/lib/learned-rules-store";
import { appendSessionLog, type SessionLogEntry } from "@/lib/session-store";
import { parseVerdictSections, verdictUserTail } from "@/lib/verdict-format";
import { buildVoiceSpokenBrief } from "@/lib/voice-spoken-brief";
import { sanitizeSpokenBrief } from "@/lib/voice-spoken-sanitize";
import {
  classifyChartQuestion,
  isSnapshotIntent,
  type ChartQuestionIntent,
} from "@/lib/chart-question-intent";
import {
  buildNoCallVerdictResult,
  buildReasoningLogInput,
  buildReasoningLogOutput,
  CHART_NO_CALL_MESSAGE,
  hasStructuredChartData,
  isChartQualityUsable,
  parseChartSnapshotInput,
  scoreChartQuality,
  type ChartReasoningLog,
  type ChartSnapshotPayload,
} from "@/lib/chart-snapshot";
import { buildMarketState } from "@/lib/market-state-build";
import { runDecisionPipeline, buildDecisionReasoningLog } from "@/lib/desk-pipeline";
import type { DeskPipelineResult } from "@/lib/desk-schema";
import { resolveSnapshotFromQuestion } from "@/lib/market-snapshot";

export type VerdictResult = {
  id: string;
  verdict: string;
  spokenBrief?: string;
  marketContext: ReturnType<typeof buildMarketContext> | null;
  marketDataWarning: string | null;
  learnedRulesVersion: number;
  intent?: ChartQuestionIntent;
  scoped?: boolean;
  structured?: boolean;
  noCall?: boolean;
  chartDataSource?: "tv_export" | "yahoo_fallback" | "screenshot" | "none";
  quality?: ChartSnapshotPayload["quality"];
  qualityReasons?: string[];
  reasoningLog?: ChartReasoningLog | ReturnType<typeof buildDecisionReasoningLog>;
  pipeline?: boolean;
  decisionVerdict?: "trade" | "wait" | "no trade";
  deskPipeline?: DeskPipelineResult;
};

const VERDICT_MODEL = process.env.OPENAI_VERDICT_MODEL || "gpt-4o-mini";

async function loadMarketContext(chartTime?: string, chartLastPrice?: number | null, forceFresh = false) {
  let marketContext: ReturnType<typeof buildMarketContext> | null = null;
  let marketDataWarning = "";
  try {
    const data = await fetchAllTimeframesCached(forceFresh, chartLastPrice);
    marketContext = buildMarketContext(data, chartTime, chartLastPrice);
  } catch (err) {
    marketDataWarning =
      err instanceof Error
        ? `Market data unavailable: ${err.message}`
        : "Market data unavailable";
  }
  return { marketContext, marketDataWarning };
}

function finalizeVerdictResult(input: {
  raw: string;
  marketContext: ReturnType<typeof buildMarketContext> | null;
  question?: string;
  intent: ChartQuestionIntent;
  symbol?: string;
  chartTime?: string;
  learnedVersion: number;
  marketDataWarning: string;
  scoped?: boolean;
  structured?: boolean;
  chartDataSource?: VerdictResult["chartDataSource"];
  source?: SessionLogEntry["source"];
  quality?: ChartSnapshotPayload["quality"];
  qualityReasons?: string[];
  reasoningLog?: ChartReasoningLog;
  reasoningInput?: ChartReasoningLog["input"];
}): VerdictResult {
  const parsed = parseVerdictSections(input.raw);

  if (input.marketContext) {
    const canonical = buildVoiceSpokenBrief(
      input.marketContext,
      parsed.verdict,
      input.question
    );
    if (canonical) parsed.spokenBrief = canonical;
    else if (!parsed.spokenBrief.trim() && parsed.verdict.trim()) {
      parsed.spokenBrief = parsed.verdict.replace(/\n+/g, " ").slice(0, 900);
    }
    if (parsed.spokenBrief.trim()) {
      parsed.spokenBrief = sanitizeSpokenBrief(parsed.spokenBrief, {
        levelsQuestion: input.intent === "level",
      });
    }
  }

  const reasoningLog: ChartReasoningLog = input.reasoningLog || {
    ts: new Date().toISOString(),
    input: input.reasoningInput || {
      quality: input.quality || "good",
      reasons: input.qualityReasons || [],
      candleCount: 0,
      candleHash: "na",
      drawingCount: 0,
    },
    output: buildReasoningLogOutput(input.raw, parsed),
  };
  if (!reasoningLog.output) {
    reasoningLog.output = buildReasoningLogOutput(input.raw, parsed);
  }

  const id = crypto.randomUUID();
  const entry: SessionLogEntry = {
    id,
    createdAt: new Date().toISOString(),
    symbol: input.symbol,
    chartTime: input.chartTime,
    verdict: parsed.verdict,
    source: input.source || "live",
    marketContext: input.marketContext,
  };
  void appendSessionLog(entry).catch(() => {});

  return {
    id,
    verdict: parsed.verdict,
    spokenBrief: parsed.spokenBrief || undefined,
    marketContext: input.marketContext,
    marketDataWarning: input.marketDataWarning || null,
    learnedRulesVersion: input.learnedVersion,
    intent: input.intent,
    scoped: input.scoped,
    structured: input.structured,
    chartDataSource: input.chartDataSource,
    quality: input.quality,
    qualityReasons: input.qualityReasons,
    reasoningLog,
  };
}

function noCallResult(
  snap: ChartSnapshotPayload | null,
  intent: ChartQuestionIntent
): VerdictResult {
  const meta = snap?.qualityMeta || (snap ? scoreChartQuality(snap) : undefined);
  const reasoningInput = snap
    ? buildReasoningLogInput(snap)
    : {
        quality: "missing" as const,
        reasons: ["export_failed"],
        candleCount: 0,
        candleHash: "empty",
        drawingCount: 0,
      };
  const base = buildNoCallVerdictResult({
    quality: meta?.quality || "missing",
    reasons: meta?.reasons || ["export_failed"],
    reasoningLog: { ts: new Date().toISOString(), input: reasoningInput },
  });
  return {
    ...base,
    marketContext: null,
    marketDataWarning: null,
    learnedRulesVersion: 0,
    intent,
    chartDataSource:
      snap?.source === "research_bars" ? "none" : snap?.source || "none",
  };
}

/** JSON-only path — no screenshot or vision model. */
export async function generateSnapshotAnswer(input: {
  question: string;
  symbol?: string;
  chartTime?: string;
  chartLastPrice?: number | null;
}): Promise<VerdictResult> {
  const intent = classifyChartQuestion(input.question);
  const [learned, { marketContext, marketDataWarning }] = await Promise.all([
    readLearnedRules(),
    loadMarketContext(input.chartTime, input.chartLastPrice, true),
  ]);
  if (!marketContext) throw new Error(marketDataWarning || "Market data unavailable");

  const snapshot = resolveSnapshotFromQuestion(marketContext, input.question);
  const id = crypto.randomUUID();

  return {
    id,
    verdict: snapshot.panel,
    spokenBrief: snapshot.spoken,
    marketContext,
    marketDataWarning: marketDataWarning || null,
    learnedRulesVersion: learned.version,
    intent,
    scoped: true,
  };
}

function imageDetailForIntent(_intent: ChartQuestionIntent): "low" | "auto" {
  return "low";
}

/** Deterministic institutional pipeline — no LLM reasoning. */
export async function generatePipelineVerdict(input: {
  chartSnapshot: ChartSnapshotPayload;
  symbol?: string;
  chartTime?: string;
  question?: string;
  intent?: ChartQuestionIntent;
  chartLastPrice?: number | null;
}): Promise<VerdictResult> {
  const intent = input.intent ?? classifyChartQuestion(input.question || "");
  const meta = input.chartSnapshot.qualityMeta || scoreChartQuality(input.chartSnapshot);

  if (!isChartQualityUsable(meta)) {
    return noCallResult(input.chartSnapshot, intent);
  }

  const { marketContext, marketDataWarning } = await loadMarketContext(
    input.chartTime,
    input.chartLastPrice,
    true
  );
  if (!marketContext) {
    return noCallResult(input.chartSnapshot, intent);
  }

  const state = buildMarketState({
    ctx: marketContext,
    chartSnapshot: input.chartSnapshot,
    symbol: input.symbol,
  });

  const decision = runDecisionPipeline(marketContext, state);
  const reasoningLog = buildDecisionReasoningLog(decision.deskPipeline!, state);
  const id = crypto.randomUUID();

  void appendSessionLog({
    id,
    createdAt: new Date().toISOString(),
    symbol: input.symbol,
    chartTime: input.chartTime,
    verdict: decision.panelBrief,
    source: "live",
    marketContext,
  }).catch(() => {});

  return {
    id,
    verdict: decision.panelBrief,
    spokenBrief: decision.spokenBrief,
    marketContext,
    marketDataWarning: marketDataWarning || null,
    learnedRulesVersion: 0,
    intent,
    scoped: false,
    structured: true,
    pipeline: true,
    noCall: decision.verdict === "no trade",
    decisionVerdict: decision.verdict,
    chartDataSource: "tv_export",
    quality: meta.quality,
    qualityReasons: meta.reasons,
    reasoningLog,
    deskPipeline: decision.deskPipeline,
  };
}

/** @deprecated Use generatePipelineVerdict — kept as alias. */
export async function generateStructuredVerdict(input: {
  chartSnapshot: ChartSnapshotPayload;
  symbol?: string;
  chartTime?: string;
  question?: string;
  voiceInput?: boolean;
  intent?: ChartQuestionIntent;
  chartLastPrice?: number | null;
}): Promise<VerdictResult> {
  return generatePipelineVerdict(input);
}

export async function generateLiveVerdict(input: {
  imageBase64: string;
  mimeType?: string;
  symbol?: string;
  chartTime?: string;
  question?: string;
  voiceInput?: boolean;
  intent?: ChartQuestionIntent;
  chartLastPrice?: number | null;
}): Promise<VerdictResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const intent = input.intent ?? classifyChartQuestion(input.question || "");

  const skipExtras = intent === "full_read";
  const emptyLearned = {
    version: 0,
    updatedAt: "",
    conceptErrorCounts: {},
    rules: [],
    promptAddendum: "",
  };
  const [learned, { marketContext, marketDataWarning }, allFeedback] = await Promise.all([
    skipExtras ? Promise.resolve(emptyLearned) : readLearnedRules(),
    loadMarketContext(input.chartTime, input.chartLastPrice, true),
    skipExtras ? Promise.resolve([]) : readAllFeedback(),
  ]);

  let marketContextText = "";
  if (marketContext) {
    marketContextText = formatContextForLiveVerdict(marketContext);
  }

  const mime = input.mimeType || "image/png";
  const dataUrl = `data:${mime};base64,${input.imageBase64}`;

  const trainingText = skipExtras
    ? ""
    : formatTrainingExamplesForPrompt(getTrainingExamples(allFeedback, 2));
  const learnedText = skipExtras ? "" : formatLearnedRulesForPrompt(learned);

  const userMessage = [
    learnedText,
    trainingText,
    marketContextText,
    marketDataWarning && `Note: ${marketDataWarning}`,
    input.symbol && `Chart symbol: ${input.symbol}`,
    input.chartTime && `Chart time (EST): ${input.chartTime}`,
    verdictUserTail(intent, input.voiceInput, input.question),
  ]
    .filter(Boolean)
    .join("\n\n");

  const maxTokens =
    intent === "full_read"
      ? input.voiceInput
        ? 480
        : 560
      : input.voiceInput
        ? 280
        : 400;

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: VERDICT_MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: LIVE_VERDICT_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: userMessage },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: imageDetailForIntent(intent) },
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("No response from model");

  return finalizeVerdictResult({
    raw,
    marketContext,
    question: input.question,
    intent,
    symbol: input.symbol,
    chartTime: input.chartTime,
    learnedVersion: learned.version,
    marketDataWarning,
    scoped: intent !== "full_read",
    structured: false,
    chartDataSource: "screenshot",
  });
}

/** Route snapshot vs structured vs vision by question intent. */
export async function generateChartAnswer(input: {
  imageBase64?: string;
  mimeType?: string;
  symbol?: string;
  chartTime?: string;
  question?: string;
  voiceInput?: boolean;
  chartLastPrice?: number | null;
  chartSnapshot?: unknown;
  debug?: boolean;
}): Promise<VerdictResult> {
  const question = input.question || "what do you see on the chart";
  const intent = classifyChartQuestion(question);
  const chartSnapshot = parseChartSnapshotInput(input.chartSnapshot);
  const isFullRead = intent === "full_read" || !isSnapshotIntent(intent);

  if (isSnapshotIntent(intent)) {
    return generateSnapshotAnswer({
      question,
      symbol: input.symbol,
      chartTime: input.chartTime,
      chartLastPrice: input.chartLastPrice,
    });
  }

  if (isFullRead) {
    if (!hasStructuredChartData(chartSnapshot)) {
      return noCallResult(chartSnapshot, intent);
    }
    return generatePipelineVerdict({
      chartSnapshot: chartSnapshot!,
      symbol: input.symbol,
      chartTime: input.chartTime,
      question,
      intent,
      chartLastPrice: input.chartLastPrice,
    });
  }

  if (hasStructuredChartData(chartSnapshot)) {
    return generatePipelineVerdict({
      chartSnapshot: chartSnapshot!,
      symbol: input.symbol,
      chartTime: input.chartTime,
      question,
      intent,
      chartLastPrice: input.chartLastPrice,
    });
  }

  if (!input.imageBase64) {
    return noCallResult(chartSnapshot, intent);
  }

  return generateLiveVerdict({
    ...input,
    imageBase64: input.imageBase64,
    question,
    intent,
  });
}

export {
  isSnapshotIntent,
  classifyChartQuestion,
  parseChartSnapshotInput,
  hasStructuredChartData,
  CHART_NO_CALL_MESSAGE,
};
