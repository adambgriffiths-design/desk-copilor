/**
 * Multi-turn conversation state — pending clarifications and follow-ups.
 */
import type { ConversationContext } from "@/lib/conversational-query";
import {
  classifyQueryMode,
  extractConversationContext,
} from "@/lib/conversational-query";
import { needsScopedChartAnswer } from "@/lib/chart-read-intent";
import { isNonTradingConversation } from "@/lib/casual-chat-intent";
import { detectTeachingConcept } from "@/lib/ict-teaching";
import {
  extractLocationFromQuestion,
  extractWeatherSwapLocation,
  isAmbiguousWeatherLocation,
  isWeatherAmbiguousPrompt,
  isWeatherDataQuestion,
  isWeatherLocationPrompt,
  isWeatherLocationSwapFollowUp,
  resolveWeatherLocation,
} from "@/lib/weather-location";
import { needsWebSearch, resolveWebSearchQuestion } from "@/lib/web-search-intent";

function isFollowUpWhyQuestion(question: string): boolean {
  const q = question.trim().toLowerCase();
  if (/^(why|how come|explain that|what does that mean|why though)\??$/.test(q)) return true;
  return /\bwhy\b/.test(q) && q.length < 40 && !/\b(why not short|why long|why short|why buy|why sell)\b/.test(q);
}

function isFollowUpInvalidationQuestion(question: string): boolean {
  const q = question.trim().toLowerCase();
  return (
    /\b(has that|has it|was that|is that|did that|still valid|been invalidated|invalidate|invalidated yet|still hold|still good)\b/.test(
      q
    ) ||
    (/^(still|valid)\??$/.test(q) && q.length < 20)
  );
}

export type TurnKind = "NEW_REQUEST" | "FOLLOW_UP" | "CLARIFICATION" | "CONFIRMATION";

export type PendingIntent =
  | "CURRENT_EXTERNAL"
  | "CHART_FACT"
  | "MARKET_INTEL"
  | "VERDICT_EXPLAIN"
  | "TEACHING";

export type PendingRequest = {
  intent: PendingIntent;
  originalRequest: string;
  missingParam?: string;
  entities: Record<string, string>;
  requestId: string;
};

export type HistoryMsg = { role: string; content: string };

const CLARIFICATION_PREFIX =
  /^(?:i\s+mean|no[, ]+|actually[, ]+|sorry[, ]+|not that[, ]+|the one in)\s+/i;

const CONFIRMATION =
  /^(?:yes|yeah|yep|yup|sure|ok|okay|go ahead|please|please do|do it|absolutely|for sure|correct|right)[.!]?$/i;

const CHART_SHOW_FOLLOWUP =
  /\b(show|mark|draw|point|highlight|where).*\b(on the chart|on chart|chart)\b/i;

const VERDICT_MARKERS =
  /\b(verdict|wait|no trade|long|short|stand aside|bias|entry zone|invalidation)\b/i;

function lastAssistant(messages?: HistoryMsg[]): string {
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i].content || "";
  }
  return "";
}

function lastUser(messages?: HistoryMsg[]): string {
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content || "";
  }
  return "";
}

function priorUser(messages?: HistoryMsg[], skipLast = 1): string {
  if (!messages?.length) return "";
  let skipped = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    if (skipped < skipLast) {
      skipped++;
      continue;
    }
    return messages[i].content || "";
  }
  return "";
}

export function isWeatherClarificationPrompt(text: string): boolean {
  return isWeatherLocationPrompt(text) || isWeatherAmbiguousPrompt(text);
}

function cityFromAmbiguousPrompt(text: string): string | null {
  const m = text.match(/\bplaces called\s+([A-Za-z][A-Za-z\s'-]{0,32})\b/i);
  return m?.[1]?.trim() || null;
}

function isRegionOnlyClarification(text: string): boolean {
  const t = text.trim().replace(CLARIFICATION_PREFIX, "").replace(/[.!?,]+$/, "").trim();
  if (!t || t.length > 48) return false;
  if (/\b(weather|chart|trade|news|bitcoin|stock)\b/i.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s,'-]{0,40}$/.test(t);
}

function isWeatherClarificationTurn(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isWeatherLocationSwapFollowUp(t)) return false;
  if (CLARIFICATION_PREFIX.test(t) && isRegionOnlyClarification(t)) return true;
  if (isRegionOnlyClarification(t)) return true;
  const loc = resolveWeatherLocation(t, { messages: [] });
  if (loc?.location && !isWeatherDataQuestion(t)) return true;
  return false;
}

function weatherCityFromHistory(messages?: HistoryMsg[]): string | null {
  if (!messages?.length) return null;
  const assistant = lastAssistant(messages);
  const fromPrompt = cityFromAmbiguousPrompt(assistant);
  if (fromPrompt) return fromPrompt;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    if (!isWeatherDataQuestion(msg.content)) continue;
    const loc = extractLocationFromQuestion(msg.content);
    if (!loc) continue;
    const bare = loc.replace(/^the\s+/i, "").trim();
    if (isAmbiguousWeatherLocation(bare)) return bare;
    const pair = bare.split(/\s+in\s+|\s*,\s*/i);
    return pair[0]?.trim() || bare;
  }
  return null;
}

/** Infer pending state from recent assistant + user turns. */
export function inferPendingRequest(
  messages?: HistoryMsg[],
  ctx?: ConversationContext
): PendingRequest | null {
  if (!messages?.length) return null;
  const assistant = lastAssistant(messages);
  if (!assistant) return null;
  const conversationCtx = ctx ?? extractConversationContext(messages);
  const priorQuestion = lastUser(messages);

  if (isWeatherClarificationPrompt(assistant)) {
    const original = priorQuestion;
    const city = cityFromAmbiguousPrompt(assistant) || weatherCityFromHistory(messages);
    if (!original && !city) return null;
    return {
      intent: "CURRENT_EXTERNAL",
      originalRequest: original || `weather in ${city}`,
      missingParam: "location",
      entities: city ? { city, task: "WEATHER" } : { task: "WEATHER" },
      requestId: "weather-clarify",
    };
  }

  if (isWeatherDataQuestion(priorQuestion) && !isWeatherClarificationPrompt(assistant)) {
    const location = extractLocationFromQuestion(priorQuestion) || "";
    return {
      intent: "CURRENT_EXTERNAL",
      originalRequest: priorQuestion,
      entities: { task: "WEATHER", location },
      requestId: "weather-continuable",
    };
  }

  if (VERDICT_MARKERS.test(assistant) && /\b(VERDICT|Bias|Entry|Wait|Long|Short)\b/i.test(assistant)) {
    return {
      intent: "VERDICT_EXPLAIN",
      originalRequest: priorQuestion,
      entities: {},
      requestId: "verdict-followup",
    };
  }

  if (
    detectTeachingConcept(priorQuestion) &&
    !/\[(structure|gaps|liquidity|session|bias|market_state)\./i.test(assistant) &&
    !/\b\d{4,5}(?:\.\d+)?\b/.test(assistant)
  ) {
    const topic = detectTeachingConcept(priorQuestion) || detectTeachingConcept(assistant);
    return {
      intent: "TEACHING",
      originalRequest: priorQuestion,
      entities: topic ? { concept: topic } : {},
      requestId: "teaching-followup",
    };
  }

  if (
    /\[(structure|gaps|liquidity|session|bias|market_state)\./i.test(assistant) ||
    (/\b(MSS|NWOG|NDOG|FVG|market structure shift)\b/i.test(assistant) &&
      /\b\d{4,5}(?:\.\d+)?\b/.test(assistant))
  ) {
    const topic = /\bnwog\b/i.test(assistant)
      ? "gaps.nwog"
      : /\bndog\b/i.test(assistant)
        ? "gaps.ndog"
        : /\bmss\b/i.test(assistant)
          ? "structure.mss"
          : /\bfvg\b/i.test(assistant)
            ? "structure.fvg"
            : conversationCtx?.lastTopic || "";
    return {
      intent: "MARKET_INTEL",
      originalRequest: priorQuestion,
      entities: topic ? { lastTopic: topic } : {},
      requestId: "market-intel",
    };
  }

  if (conversationCtx?.lastFactIds?.length || conversationCtx?.lastTopic) {
    return {
      intent: "MARKET_INTEL",
      originalRequest: priorQuestion,
      entities: {
        lastTopic: conversationCtx.lastTopic || conversationCtx.lastFactIds?.[0] || "",
      },
      requestId: "market-intel",
    };
  }

  return null;
}

export function classifyTurn(
  text: string,
  messages?: HistoryMsg[],
  ctx?: ConversationContext
): TurnKind {
  const q = text.trim();
  if (!q) return "NEW_REQUEST";
  const conversationCtx = ctx ?? (messages?.length ? extractConversationContext(messages) : undefined);
  const pending = inferPendingRequest(messages, conversationCtx);

  if (CONFIRMATION.test(q)) return pending ? "CONFIRMATION" : "NEW_REQUEST";

  if (
    pending?.intent === "CURRENT_EXTERNAL" &&
    pending.missingParam === "location" &&
    isWeatherClarificationTurn(q)
  ) {
    return "CLARIFICATION";
  }

  if (pending?.intent === "CURRENT_EXTERNAL" && pending.entities.task === "WEATHER") {
    if (isWeatherLocationSwapFollowUp(q)) return "FOLLOW_UP";
  }

  if (pending?.intent === "MARKET_INTEL" || pending?.intent === "VERDICT_EXPLAIN") {
    if (isFollowUpInvalidationQuestion(q) || isFollowUpWhyQuestion(q)) return "FOLLOW_UP";
    if (/\bwhat about\b/i.test(q) && pending.entities.lastTopic) return "FOLLOW_UP";
  }

  if (pending?.intent === "TEACHING" && CHART_SHOW_FOLLOWUP.test(q)) {
    return "FOLLOW_UP";
  }

  if (needsWebSearch(q) || isWeatherDataQuestion(q) || needsScopedChartAnswer(q)) {
    return "NEW_REQUEST";
  }

  if (pending && isNonTradingConversation(q) && q.length < 64) {
    if (
      pending.intent === "CURRENT_EXTERNAL" &&
      pending.missingParam === "location" &&
      isWeatherClarificationTurn(q)
    ) {
      return "CLARIFICATION";
    }
    if (pending.intent !== "CURRENT_EXTERNAL") return "FOLLOW_UP";
  }

  return "NEW_REQUEST";
}

/** Merge a weather clarification ("Germany", "I mean Germany") with a pending city. */
export function mergeWeatherClarification(city: string, clarification: string): string {
  const region = clarification.trim().replace(CLARIFICATION_PREFIX, "").trim();
  if (!city) return region;
  if (!region) return city;
  if (/\bin\b/i.test(region) || /,/.test(region)) return region;
  return `${city} ${region}`;
}

/** Reconstruct a routable question when the user is clarifying or following up. */
export function resolveTurnQuestion(
  text: string,
  messages?: HistoryMsg[],
  ctx?: ConversationContext
): string {
  const q = text.trim();
  const pending = inferPendingRequest(messages, ctx);
  const kind = classifyTurn(q, messages, ctx);
  if (!pending || kind === "NEW_REQUEST") return q;

  if (pending.intent === "CURRENT_EXTERNAL" && kind === "CLARIFICATION") {
    const city = pending.entities.city || weatherCityFromHistory(messages) || "";
    const region = q.replace(CLARIFICATION_PREFIX, "").replace(/[.!?,]+$/, "").trim();
    const merged = mergeWeatherClarification(city, region);
    return `What's the weather in ${merged}?`;
  }

  if (pending.intent === "CURRENT_EXTERNAL" && kind === "FOLLOW_UP") {
    const loc = extractWeatherSwapLocation(q);
    if (loc) return `What's the weather in ${loc}?`;
  }

  if (pending.intent === "MARKET_INTEL" && kind === "FOLLOW_UP") {
    if (/\bwhat about\b/i.test(q) && pending.entities.lastTopic?.includes("nwog") && /\bndog\b/i.test(q)) {
      return "where is the last NDOG?";
    }
    return q;
  }

  if (pending.intent === "TEACHING" && kind === "FOLLOW_UP" && CHART_SHOW_FOLLOWUP.test(q)) {
    const concept = pending.entities.concept || "mss";
    if (concept === "mss") return "where is the last MSS?";
    if (concept === "fvg") return "where is the last FVG?";
    if (concept === "nwog") return "where is the last NWOG?";
    return "where is the last MSS?";
  }

  return q;
}

/** True when this turn must not fall through to casual fallback. */
export function blocksCasualFallback(
  text: string,
  messages?: HistoryMsg[],
  ctx?: ConversationContext
): boolean {
  const conversationCtx = ctx ?? (messages?.length ? extractConversationContext(messages) : undefined);
  const kind = classifyTurn(text, messages, conversationCtx);
  if (kind === "CLARIFICATION" || kind === "FOLLOW_UP") return true;
  return false;
}

/** Route follow-up turns away from casual chat when pending context exists. */
export function shouldDeferCasualRoute(
  text: string,
  messages?: HistoryMsg[],
  ctx?: ConversationContext
): boolean {
  const conversationCtx = ctx ?? (messages?.length ? extractConversationContext(messages) : undefined);
  const pending = inferPendingRequest(messages, conversationCtx);
  if (!pending) return false;
  const kind = classifyTurn(text, messages, conversationCtx);
  if (kind === "CLARIFICATION" && pending.intent === "CURRENT_EXTERNAL") return true;
  if (kind === "FOLLOW_UP") {
    if (pending.intent === "CURRENT_EXTERNAL") return true;
    if (pending.intent === "MARKET_INTEL" || pending.intent === "VERDICT_EXPLAIN") return true;
    if (pending.intent === "TEACHING" && CHART_SHOW_FOLLOWUP.test(text)) return true;
  }
  if (isFollowUpWhyQuestion(text) && pending.intent === "VERDICT_EXPLAIN") return true;
  return false;
}

/** True when live web search should run even without weather keywords in the current turn. */
export function pendingNeedsLiveWebSearch(
  text: string,
  messages?: HistoryMsg[],
  ctx?: ConversationContext
): boolean {
  const pending = inferPendingRequest(messages, ctx);
  if (!pending || pending.intent !== "CURRENT_EXTERNAL") return false;
  const kind = classifyTurn(text, messages, ctx);
  return kind === "CLARIFICATION" || kind === "FOLLOW_UP";
}

/** Expand lookup follow-ups and pending weather clarifications. */
export function resolveSearchQuestion(
  question: string,
  messages?: HistoryMsg[],
  ctx?: ConversationContext
): string {
  const expanded = resolveWebSearchQuestion(question, messages);
  if (expanded !== question.trim()) return expanded;
  const resolved = resolveTurnQuestion(question, messages, ctx);
  if (resolved !== question.trim()) return resolved;
  return expanded;
}

/** Classify market-intel follow-ups with preserved context. */
export function classifyMarketFollowUp(
  question: string,
  ctx?: ConversationContext
): ReturnType<typeof classifyQueryMode> | null {
  if (!ctx?.lastFactIds?.length && !ctx?.lastTopic) return null;
  const mode = classifyQueryMode(question, ctx);
  if (mode === "invalidation_followup" || mode === "why_followup") return mode;
  if (/\bwhat about\b/i.test(question) && ctx.lastTopic) return "fact_lookup";
  return null;
}
