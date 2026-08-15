import OpenAI from "openai";
import { fetchAllTimeframesCached } from "@/lib/market-data";
import { buildMarketContext, formatContextForLiveVerdict } from "@/lib/levels";
import { CHART_EVIDENCE_SYSTEM } from "@/lib/playbook";
import { readLearnedRules } from "@/lib/learned-rules-store";
import { appendSessionLog } from "@/lib/session-store";
import {
  classifyChartQuestion,
  isSnapshotIntent,
  type ChartQuestionIntent,
} from "@/lib/chart-question-intent";
import {
  buildNoCallVerdictResult,
  buildReasoningLogInput,
  CHART_NO_CALL_MESSAGE,
  hasStructuredChartData,
  hydrateChartSnapshotFromBars,
  isChartQualityUsable,
  parseChartSnapshotInput,
  scoreChartQuality,
  type ChartReasoningLog,
  type ChartSnapshotPayload,
} from "@/lib/chart-snapshot";
import { buildMarketState } from "@/lib/market-state-build";
import { runDecisionPipeline, buildDecisionReasoningLog } from "@/lib/desk-pipeline";
import { flushDecisionMemoryWrites } from "@/lib/decision-envelope-history";
import { withManualAnalysePriority } from "@/lib/continuous-decision-recorder";
import type { DeskPipelineResult } from "@/lib/desk-schema";
import { resolveSnapshotFromQuestion } from "@/lib/market-snapshot";
import {
  enforceVisibleDecisionContract,
  formatMentorTradeSpoken,
  formatUnifiedDecisionOutput,
  resolveUserPresentationMode,
} from "@/lib/decision-contract-output";

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
    loadMarketContext(input.chartTime, input.chartLastPrice, false),
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

async function resolveStructuredSnapshot(
  snap: ChartSnapshotPayload | null,
  chartLastPrice?: number | null
): Promise<ChartSnapshotPayload | null> {
  if (hasStructuredChartData(snap)) return snap;
  try {
    const data = await fetchAllTimeframesCached(true, chartLastPrice);
    return hydrateChartSnapshotFromBars(snap, data.m1, { lastPrice: chartLastPrice });
  } catch {
    return snap;
  }
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
  // Manual Analyse holds priority so continuous recorder ticks yield.
  return withManualAnalysePriority(async () => {
    const intent = input.intent ?? classifyChartQuestion(input.question || "");
    const meta = input.chartSnapshot.qualityMeta || scoreChartQuality(input.chartSnapshot);

    if (!isChartQualityUsable(meta)) {
      return noCallResult(input.chartSnapshot, intent);
    }

    const { marketContext, marketDataWarning } = await loadMarketContext(
      input.chartTime,
      input.chartLastPrice,
      false
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
    await flushDecisionMemoryWrites();
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
      chartDataSource: input.chartSnapshot.source === "yahoo_fallback" ? "yahoo_fallback" : "tv_export",
      quality: meta.quality,
      qualityReasons: meta.reasons,
      reasoningLog,
      deskPipeline: decision.deskPipeline,
    };
  });
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

async function extractChartEvidenceFromScreenshot(input: {
  imageBase64: string;
  mimeType?: string;
  intent: ChartQuestionIntent;
  marketContextText?: string;
  question?: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";
  const mime = input.mimeType || "image/png";
  const dataUrl = `data:${mime};base64,${input.imageBase64}`;
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: VERDICT_MODEL,
    max_tokens: 280,
    messages: [
      { role: "system", content: CHART_EVIDENCE_SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Extract chart observations only. Do not output a Call, Bias-as-trade, Stance, or potential buy/sell.",
              input.marketContextText,
              input.question && `Trader asked: ${input.question}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: imageDetailForIntent(input.intent) },
          },
        ],
      },
    ],
  });
  return response.choices[0]?.message?.content?.trim() || "";
}

/**
 * Screenshot path — chart evidence only. Trading decision is the pipeline envelope.
 * Does not change generatePipelineVerdict semantics.
 */
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
  const intent = input.intent ?? classifyChartQuestion(input.question || "");
  const { marketContext, marketDataWarning } = await loadMarketContext(
    input.chartTime,
    input.chartLastPrice,
    false
  );
  if (!marketContext) {
    return noCallResult(null, intent);
  }

  const state = buildMarketState({
    ctx: marketContext,
    chartSnapshot: null,
    symbol: input.symbol,
    chartLastPrice: input.chartLastPrice,
  });
  const decision = runDecisionPipeline(marketContext, state);
  await flushDecisionMemoryWrites();
  const pipe = decision.deskPipeline!;
  const env = pipe.analysis_contract?.decision;
  const reasoningLog = buildDecisionReasoningLog(pipe, state);

  let chartEvidence = "";
  try {
    chartEvidence = await extractChartEvidenceFromScreenshot({
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
      intent,
      marketContextText: formatContextForLiveVerdict(marketContext),
      question: input.question,
    });
  } catch {
    chartEvidence = "";
  }

  const panelRaw = env
    ? formatUnifiedDecisionOutput(env, { chartEvidence, source: "screenshot" })
    : pipe.panel_brief;
  const spokenRaw = env
    ? formatMentorTradeSpoken(env, {
        chartEvidence,
        source: "screenshot",
        mode: resolveUserPresentationMode(),
      })
    : pipe.spoken_brief;
  const enforced = enforceVisibleDecisionContract(panelRaw, env, {
    chartEvidence,
    source: "screenshot",
  });
  const spokenEnforced = enforceVisibleDecisionContract(spokenRaw, env, {
    chartEvidence,
    source: "screenshot",
  });

  const id = crypto.randomUUID();
  void appendSessionLog({
    id,
    createdAt: new Date().toISOString(),
    symbol: input.symbol,
    chartTime: input.chartTime,
    verdict: enforced.text,
    source: "live",
    marketContext,
  }).catch(() => {});

  return {
    id,
    verdict: enforced.text,
    spokenBrief: spokenEnforced.text,
    marketContext,
    marketDataWarning: marketDataWarning || null,
    learnedRulesVersion: 0,
    intent,
    scoped: intent !== "full_read",
    structured: true,
    pipeline: true,
    noCall: decision.verdict === "no trade",
    decisionVerdict: decision.verdict,
    chartDataSource: "screenshot",
    quality: "degraded",
    qualityReasons: ["screenshot_evidence_only", "decision_from_pipeline"],
    reasoningLog,
    deskPipeline: pipe,
  };
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
  let chartSnapshot = parseChartSnapshotInput(input.chartSnapshot);
  if (!hasStructuredChartData(chartSnapshot)) {
    chartSnapshot = await resolveStructuredSnapshot(chartSnapshot, input.chartLastPrice);
  }
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
    if (input.imageBase64) {
      return generateLiveVerdict({
        ...input,
        imageBase64: input.imageBase64,
        question,
        intent,
      });
    }
    return noCallResult(chartSnapshot, intent);
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
