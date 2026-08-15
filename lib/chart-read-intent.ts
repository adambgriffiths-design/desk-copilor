/** Detect when the trader wants a live screenshot chart read. */
import {
  classifyChartQuestion,
  isChartStatusQuestion,
  isSnapshotIntent,
  prefersRichTradingAnswer,
} from "./chart-question-intent";
import { needsMarketIntelligenceAnswer } from "./conversational-query";
import { isMentorMarketTurn } from "./mentor-intent";

export type ChartReadContext = {
  lastAssistant?: string;
  lastMentorIntent?: string;
};

function offeredChartRead(assistant: string): boolean {
  const a = assistant.toLowerCase();
  return (
    /\b(want me to|should i|can i|pull|grab|get you|give you|take a|do a)\b/.test(a) &&
    /\b(read|chart|look|verdict|screenshot|see)\b/.test(a)
  );
}

export function wantsChartRead(text: string, context?: ChartReadContext): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (isMentorMarketTurn(text, { lastAssistant: context?.lastAssistant })) return false;

  if (
    /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|please|please do|do it|absolutely|for sure)[.!]?$/i.test(
      t
    )
  ) {
    if (context?.lastAssistant && offeredChartRead(context.lastAssistant)) return true;
  }

  if (/\b(get the read|full read|full setup)\b/.test(t)) return true;
  if (/\b(get|give|need|want)\s+(me\s+)?(the\s+|a\s+)?(verdict|chart read|read|update|look)\b/.test(t)) {
    return true;
  }
  if (/\b(look at|check|read|scan)\s+(the\s+)?(chart|this|it)\b/.test(t)) return true;
  if (isChartStatusQuestion(t)) return false;
  if (/\bwhat('s| is) on the chart\b/.test(t)) return true;
  if (/\bwhat('s| is) the chart[?.!]?$/.test(t)) return true;
  if (/\bwhat('s| is) this\b/.test(t)) return true;
  if (/\b(your|the)\s+(verdict)\b/.test(t) && /\b(get|give|need)\b/.test(t)) return true;
  if (/\b(quick|live) (read|look)\b/.test(t)) return true;
  if (/\bis this (a )?(good )?(setup|trade|long|short)\b/.test(t)) return true;
  if (
    /\b(should i|would you)\b/.test(t) &&
    /\b(trade|buy|sell|long|short|take it|this setup)\b/.test(t)
  ) {
    return true;
  }
  if (/\banaly[sz]e\b/.test(t) && /\b(chart|setup|this|mnq|market)\b/.test(t)) return true;
  if (/\brefresh (the )?read\b/.test(t)) return true;
  if (/\b(pull|grab|load|show)\s+(the\s+)?chart\b/.test(t)) return true;

  return false;
}

/** Screenshot + vision read — explicit ask only, not every vague line. */
export function needsFullChartRead(text: string, context?: ChartReadContext): boolean {
  if (
    isMentorMarketTurn(text, { lastAssistant: context?.lastAssistant }) &&
    !isChartReadCommand(text)
  ) {
    return false;
  }
  if (isChartReadCommand(text)) return true;
  if (isChartStatusQuestion(text)) return false;
  if (wantsChartRead(text, context)) return true;
  const intent = classifyChartQuestion(text);
  if (isSnapshotIntent(intent)) return false;
  return intent === "full_read";
}

/** JSON snapshot answer — price, levels, bias, live chart status, or market intelligence. */
export function needsScopedChartAnswer(text: string): boolean {
  if (prefersRichTradingAnswer(text)) return false;
  if (needsMarketIntelligenceAnswer(text)) return true;
  return isSnapshotIntent(classifyChartQuestion(text));
}

const CHART_READ_EXACT =
  /^(read|the read|get read|a read|get a read|get the read|full read|chart read|read the chart|get me a read|give me a read|market read|quick read)$/i;

export function isChartReadCommand(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (CHART_READ_EXACT.test(t)) return true;
  // Conversational "give me a read on the chart" / "give me market read" is TEXT stream.
  // Exact "give me a read" / "market read" still match CHART_READ_EXACT above.
  // Do not substring-match "market read" — that steals "give me market read" into screenshot.
  if (/\b(get the read|full read|quick read|read the chart)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function normalizeChartReadCommand(text: string): string {
  const t = String(text || "").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (/^(read|the read|get read|a read|get a read|get me a read|give me a read|market read|quick read)$/i.test(lower)) {
    return "get the read";
  }
  if (/^full read$/i.test(lower)) return "full read";
  if (/^chart read$/i.test(lower)) return "what do you see on the chart";
  return t;
}
