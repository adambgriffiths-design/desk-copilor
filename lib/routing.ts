/**
 * Desk Copilot routing matrix (v1.4.51)
 *
 * Priority (first match wins — extension content.js + API routes mirror this):
 *
 * | Input kind                         | Handler                          | Live web? |
 * |------------------------------------|----------------------------------|-----------|
 * | Chart read command                 | screenshot read                    | never     |
 * | Chart / market status snapshot     | JSON market snapshot               | never     |
 * | Live data (weather, prices, news) | Tavily web search                  | when needed |
 * | Everything else (casual)           | LLM casual stream + memory         | never     |
 * | Trading Q&A                        | GPT + live market context          | never     |
 *
 * LIVE_DATA_FALLBACK is shown only when shouldUseLiveWebSearch() is true AND
 * tryWebSearchReply returned null (search failed or empty).
 */

import { isChartReadCommand } from "@/lib/chart-read-intent";
import { isChartStatusQuestion, prefersRichTradingAnswer } from "@/lib/chart-question-intent";
import { isClearlyTrading, isNonTradingConversation } from "@/lib/casual-chat-intent";
import { pendingNeedsLiveWebSearch, resolveSearchQuestion } from "@/lib/pending-request";
import {
  isPersonaQuestion,
  isIdentityQuestion,
  isKarenPreferenceQuestion,
  needsWebSearch,
  resolveWebSearchQuestion,
  wantsLiveWebData as rawWantsLiveWebData,
} from "@/lib/web-search-intent";

export const LIVE_DATA_FALLBACK =
  "Couldn't pull live data just now — give it another try in a moment.";

export type HistoryMsg = { role: string; content: string };

/** Rich GPT trading stream — analytical asks only; simple chart-status ticks stay on JSON snapshot. */
export function mustUseTradingStream(text: string): boolean {
  const q = text.trim();
  if (!q) return false;
  if (prefersRichTradingAnswer(q)) return true;
  if (isChartStatusQuestion(q)) return false;
  return isClearlyTrading(q);
}

/** Karen identity / preferences — casual LLM stream, never Tavily. */
export function isPersonaOrOpinionQuestion(text: string): boolean {
  return isPersonaQuestion(text);
}

export { isPersonaQuestion, isIdentityQuestion, isKarenPreferenceQuestion, needsWebSearch, resolveWebSearchQuestion, isNonTradingConversation };

export {
  classifyDeskRoute,
  wouldRouteCasual,
  formatDeskRouteDebug,
  deskRouteLabel,
  type DeskRoute,
  type DeskRouteInput,
  type DeskRouteResult,
} from "@/lib/desk-route-intent";

export {
  classifyAnalysisDepth,
  analysisDepthLabel,
  voiceAckKeyForDepth,
  requiresDeepAnalysisPipeline,
  type AnalysisDepth,
  type AnalysisDepthInput,
} from "@/lib/analysis-depth";

/** True when live web search is required — persona and chart snapshots excluded first. */
export function shouldUseLiveWebSearch(text: string, messages?: HistoryMsg[]): boolean {
  const q = text.trim();
  if (!q) return false;
  if (pendingNeedsLiveWebSearch(q, messages)) return true;
  if (isPersonaOrOpinionQuestion(q)) return false;
  if (isChartReadCommand(q)) return false;
  if (isChartStatusQuestion(q)) return false;
  if (isClearlyTrading(q) && !needsWebSearch(q)) return false;

  const resolved = resolveSearchQuestion(q, messages);
  if (resolved !== q) {
    if (isPersonaOrOpinionQuestion(resolved)) return false;
    if (isChartStatusQuestion(resolved)) return false;
    if (needsWebSearch(resolved)) return true;
  }

  return rawWantsLiveWebData(q, messages);
}

/** @deprecated Prefer shouldUseLiveWebSearch — kept for callers migrating gradually. */
export function wantsLiveWebData(text: string, messages?: HistoryMsg[]): boolean {
  return shouldUseLiveWebSearch(text, messages);
}

/** Fallback copy only when live search was expected and failed. */
export function liveDataFallbackIfNeeded(
  question: string,
  messages: HistoryMsg[] | undefined,
  searchReply: string | null | undefined
): string | null {
  if (!shouldUseLiveWebSearch(question, messages)) return null;
  if (searchReply?.trim()) return null;
  return LIVE_DATA_FALLBACK;
}
