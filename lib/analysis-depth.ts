/**
 * Separate voice responsiveness from analysis depth.
 * FAST_FACT → market state lookup; DEEP_ANALYSIS → full pipeline; GENERAL → no chart work.
 */
import { isChartReadCommand, needsFullChartRead, needsScopedChartAnswer } from "./chart-read-intent";
import {
  classifyChartQuestion,
  prefersRichTradingAnswer,
} from "./chart-question-intent";
import { isClearlyTrading, isNonTradingConversation } from "./casual-chat-intent";
import { detectTeachingConcept } from "./ict-teaching";
import { needsMarketIntelligenceAnswer } from "./conversational-query";
import { isPersonaQuestion } from "./web-search-intent";

export type AnalysisDepth = "GENERAL_QUESTION" | "FAST_FACT" | "DEEP_ANALYSIS";

export type AnalysisDepthInput = {
  text: string;
  routeText?: string;
  lastAssistant?: string;
};

/** Classify how much market analysis a turn requires — independent of voice latency. */
export function classifyAnalysisDepth(input: AnalysisDepthInput): AnalysisDepth {
  const core = String(input.text || "").trim();
  const routed = String(input.routeText || core).trim();
  const q = routed || core;
  if (!q) return "GENERAL_QUESTION";

  const ctx = { lastAssistant: input.lastAssistant };

  if (detectTeachingConcept(q)) return "GENERAL_QUESTION";
  if (isPersonaQuestion(q)) return "GENERAL_QUESTION";
  if (isNonTradingConversation(q) && !isClearlyTrading(q) && !prefersRichTradingAnswer(q)) {
    return "GENERAL_QUESTION";
  }

  if (isChartReadCommand(q) || needsFullChartRead(q, ctx)) return "DEEP_ANALYSIS";
  if (prefersRichTradingAnswer(q)) return "DEEP_ANALYSIS";
  if (classifyChartQuestion(q) === "full_read") return "DEEP_ANALYSIS";
  if (/\b(market verdict|full verdict|ict verdict|current verdict|give me.*verdict)\b/i.test(q)) {
    return "DEEP_ANALYSIS";
  }

  if (needsMarketIntelligenceAnswer(q)) return "FAST_FACT";
  if (needsScopedChartAnswer(q)) return "FAST_FACT";

  if (isClearlyTrading(q)) return "DEEP_ANALYSIS";

  return "GENERAL_QUESTION";
}

export function analysisDepthLabel(depth: AnalysisDepth): string {
  switch (depth) {
    case "FAST_FACT":
      return "fast fact";
    case "DEEP_ANALYSIS":
      return "deep analysis";
    default:
      return "general";
  }
}

/** Voice working-ack key for immediate spoken acknowledgement (does not deliver a verdict). */
export function voiceAckKeyForDepth(depth: AnalysisDepth): string | null {
  switch (depth) {
    case "DEEP_ANALYSIS":
      return "deep_analysis";
    case "FAST_FACT":
      return null;
    default:
      return null;
  }
}

/** True when a shallow snapshot/LLM one-liner would violate quality requirements. */
export function requiresDeepAnalysisPipeline(depth: AnalysisDepth): boolean {
  return depth === "DEEP_ANALYSIS";
}
