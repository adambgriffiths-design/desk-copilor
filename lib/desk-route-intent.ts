/**
 * Single desk routing classifier — extension desk-route-intent.js mirrors this.
 * Priority matches extension/content.js handleUserMessage (first match wins).
 */

import {
  isChartReadCommand,
  needsFullChartRead,
  needsScopedChartAnswer,
  type ChartReadContext,
} from "@/lib/chart-read-intent";
import {
  classifyChartQuestion,
  isChartStatusQuestion,
  isSnapshotIntent,
  prefersRichTradingAnswer,
  resolveSnapshotIntent,
} from "@/lib/chart-question-intent";
import { isClearlyTrading, isNonTradingConversation } from "@/lib/casual-chat-intent";
import { isStandaloneGeneralTurn, isBareAnaphoraFollowUp } from "@/lib/conversational-intent";
import { repairConversationalStt } from "@/lib/conversational-normalize";
import { isUserMemoryQuestion } from "@/lib/desk-memory";
import { shouldDeferCasualRoute, resolveTurnQuestion } from "@/lib/pending-request";
import { shouldUseLiveWebSearch } from "@/lib/routing";
import { isPersonaQuestion } from "@/lib/web-search-intent";
import {
  classifyMentorIntent,
  isMentorMarketTurn,
  mentorContextFromMessages,
  mentorIntentSlug,
  type MentorIntent,
} from "@/lib/mentor-intent";
import { lastTurnWasGeneralCategory } from "@/lib/turn-category";

export type DeskRoute =
  | "levels"
  | "chart_read"
  | "price"
  | "snapshot"
  | "live_web"
  | "casual"
  | "trading";

export type DeskRouteInput = {
  text: string;
  routeText?: string;
  lastAssistant?: string;
  lastMentorIntent?: MentorIntent;
  messages?: { role: string; content: string }[];
};

export type DeskRouteResult = {
  route: DeskRoute;
  label: string;
  detail?: string;
};

const ROUTE_LABELS: Record<DeskRoute, string> = {
  levels: "Mark levels",
  chart_read: "Chart read",
  price: "Live price",
  snapshot: "Market snapshot",
  live_web: "Live web lookup",
  casual: "Casual chat",
  trading: "Trading Q&A",
};

export function deskRouteLabel(route: DeskRoute): string {
  return ROUTE_LABELS[route] || route;
}

function isPriceRoute(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return false;
  if (resolveSnapshotIntent(text) === "price") return true;
  return (
    /\b(what price|what level|where are we|current price|trading at|currently trading|what are we at|where is price|where's price|how much is|last price)\b/.test(
      q
    ) ||
    (/\bwhat level\b/.test(q) && /\b(we|trading|at|on)\b/.test(q)) ||
    (/\bright now\b/.test(q) && /\b(price|trading|level|at)\b/.test(q))
  );
}

function isLevelsCommand(text: string): boolean {
  return /\b(mark|draw|show) levels\b/i.test(String(text || ""));
}

/** Same gate as extension shouldRouteCasual — checked before chart read in handleUserMessage. */
export function wouldRouteCasual(
  text: string,
  routeText?: string,
  messages?: DeskRouteInput["messages"]
): boolean {
  const mentorCtx = mentorContextFromMessages(messages);
  if (isBareAnaphoraFollowUp(text) && lastTurnWasGeneralCategory(mentorCtx.lastTurnCategory)) {
    if (isChartReadCommand(text)) return false;
    return isNonTradingConversation(text);
  }
  if (routeText && isBareAnaphoraFollowUp(routeText) && lastTurnWasGeneralCategory(mentorCtx.lastTurnCategory)) {
    if (isChartReadCommand(text)) return false;
    return isNonTradingConversation(text);
  }
  if (isStandaloneGeneralTurn(text) || (routeText && isStandaloneGeneralTurn(routeText))) {
    // Standalone general must still lose to chart/price/trading gates (same checks as below).
    if (isChartReadCommand(text)) return false;
    if (isChartStatusQuestion(text) || (routeText && isChartStatusQuestion(routeText))) return false;
    if (needsScopedChartAnswer(text) || (routeText && needsScopedChartAnswer(routeText))) return false;
    if (isMentorMarketTurn(text, mentorCtx) || (routeText && isMentorMarketTurn(routeText, mentorCtx))) {
      return false;
    }
    if (isClearlyTrading(text) || (routeText && isClearlyTrading(routeText))) return false;
    if (isPriceRoute(text) || (routeText && isPriceRoute(routeText))) return false;
    if (prefersRichTradingAnswer(text) || (routeText && prefersRichTradingAnswer(routeText))) {
      return false;
    }
    return isNonTradingConversation(text);
  }
  if (shouldDeferCasualRoute(text, messages)) return false;
  const route = routeText || text;
  if (shouldDeferCasualRoute(route, messages)) return false;
  if (isChartReadCommand(text)) return false;
  if (isChartStatusQuestion(text) || isChartStatusQuestion(route)) return false;
  if (needsScopedChartAnswer(text) || needsScopedChartAnswer(route)) return false;
  if (isMentorMarketTurn(text, mentorCtx) || isMentorMarketTurn(route, mentorCtx)) return false;
  if (isClearlyTrading(text) || isClearlyTrading(route)) return false;
  if (isPriceRoute(text) || isPriceRoute(route)) return false;
  if (prefersRichTradingAnswer(text) || prefersRichTradingAnswer(route)) return false;
  return isNonTradingConversation(text);
}

/** Classify where a user turn should land — mirrors handleUserMessage priority. */
export function classifyDeskRoute(input: DeskRouteInput): DeskRouteResult {
  const core = repairConversationalStt(String(input.text || "").trim());
  const routed = repairConversationalStt(String(input.routeText || core).trim());
  const q = routed || core;
  const resolved = resolveTurnQuestion(q, input.messages);
  const routeQ = resolved !== q ? resolved : q;
  if (!q) {
    return { route: "casual", label: deskRouteLabel("casual"), detail: "empty" };
  }

  if (isLevelsCommand(routeQ) || isLevelsCommand(core)) {
    return { route: "levels", label: deskRouteLabel("levels") };
  }

  const mentorCtx = mentorContextFromMessages(input.messages, input.lastMentorIntent);
  if (!mentorCtx.lastAssistant && input.lastAssistant) mentorCtx.lastAssistant = input.lastAssistant;
  if (isMentorMarketTurn(routeQ, mentorCtx) || isMentorMarketTurn(core, mentorCtx)) {
    const intent = classifyMentorIntent(routeQ, mentorCtx);
    return {
      route: "trading",
      label: deskRouteLabel("trading"),
      detail: mentorIntentSlug(intent),
    };
  }

  if (wouldRouteCasual(core, routed, input.messages)) {
    if (shouldUseLiveWebSearch(routeQ, input.messages)) {
      return { route: "live_web", label: deskRouteLabel("live_web"), detail: "search" };
    }
    let detail = "stream";
    if (isUserMemoryQuestion(routeQ)) detail = "memory";
    else if (isPersonaQuestion(routeQ)) detail = "persona";
    return { route: "casual", label: deskRouteLabel("casual"), detail };
  }

  const ctx: ChartReadContext = { lastAssistant: input.lastAssistant || mentorCtx.lastAssistant };
  if (isChartReadCommand(routeQ) || needsFullChartRead(routeQ, ctx)) {
    return { route: "chart_read", label: deskRouteLabel("chart_read"), detail: "structured" };
  }

  if (
    !prefersRichTradingAnswer(routeQ) &&
    (needsScopedChartAnswer(routeQ) || isChartStatusQuestion(routeQ))
  ) {
    const intent = resolveSnapshotIntent(routeQ);
    return {
      route: "snapshot",
      label: deskRouteLabel("snapshot"),
      detail: intent,
    };
  }

  if (shouldUseLiveWebSearch(routeQ, input.messages)) {
    return { route: "live_web", label: deskRouteLabel("live_web"), detail: "search" };
  }

  const intent = classifyChartQuestion(routeQ);
  return {
    route: "trading",
    label: deskRouteLabel("trading"),
    detail: intent !== "general" ? intent : undefined,
  };
}

export function formatDeskRouteDebug(result: DeskRouteResult): string {
  const base = result.route;
  return result.detail ? `${base} · ${result.detail}` : base;
}
