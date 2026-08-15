import { isClearlyTrading } from "@/lib/casual-chat-intent";
import { classifyChartQuestion, isChartStatusQuestion, isSnapshotIntent } from "@/lib/chart-question-intent";
import { isUserMemoryQuestion } from "@/lib/desk-memory";
import { normalizeWeatherStt } from "@/lib/weather-stt";

type HistoryMsg = { role: string; content: string };

const LOOKUP_FOLLOWUP =
  /^(?:please\s+|can you\s+|could you\s+|go ahead and\s+)?(?:look (?:it|that|this) up|search (?:it|that|this)|find (?:it|that|this)? out|check (?:it|that|this)|google (?:it|that|this))(?:\s+online)?[.!]?$/i;

/** Expand “look it up” follow-ups using the prior user question in chat history. */
export function resolveWebSearchQuestion(
  question: string,
  messages?: HistoryMsg[]
): string {
  const q = question.trim();
  if (!q) return q;
  if (!isLookupFollowUp(q)) return q;

  const users = (messages || [])
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);

  for (let i = users.length - 2; i >= 0; i--) {
    const prior = users[i];
    if (prior.length >= 8 && !isLookupFollowUp(prior)) return prior;
  }
  return q;
}

function isLookupFollowUp(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (LOOKUP_FOLLOWUP.test(t)) return true;
  return /\b(look (?:it|that|this) up|search (?:it|that|this)(?: online)?|find out|check online|google (?:it|that|this))\b/i.test(
    t
  );
}

function normalizeWebSearchText(text: string): string {
  return normalizeWeatherStt(text)
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/\s+/g, " ");
}

/** Karen identity — instant persona reply, not web search. */
export function isIdentityQuestion(text: string): boolean {
  const q = normalizeWebSearchText(text);
  if (!q) return false;
  if (/\bwhat are you (seeing|looking|thinking|watching|reading|picking up)\b/.test(q)) return false;
  if (/\bwhat are you\b/.test(q) && /\b(on the chart|in the market|right now)\b/.test(q)) return false;

  if (/\b(tell me about yourself|introduce yourself|describe yourself)\b/.test(q)) return true;
  if (/^(who are you|what are you)[.?!]*$/.test(q)) return true;
  if (/\bwho are you\b/.test(q)) return true;
  if (/\bwhat are you\b/.test(q) && !/\b(seeing|looking|thinking|watching|reading)\b/.test(q)) return true;
  if (/\bwhat('s| is) your (name|role|job|purpose)\b/.test(q)) return true;
  if (/\bwhat should i call you\b/.test(q)) return true;
  if (/\bwhat do i call you\b/.test(q)) return true;
  if (/\b(your name|call you)\b/.test(q) && /\b(what|tell me|who)\b/.test(q)) return true;
  if (/\bwho is karen\b/.test(q)) return true;
  if (/\bwhat('s| is) karen\b/.test(q) && !/\b(karen'?s? (weather|temperature|news|score))\b/.test(q)) {
    return true;
  }

  if (/\btell me about\b/.test(q)) {
    if (/\b(yourself|you|karen|your personality|your background|your story)\b/.test(q)) return true;
  }

  return false;
}

/** Karen's preferences/opinions — casual LLM stream, not web search. */
export function isKarenPreferenceQuestion(text: string): boolean {
  const q = normalizeWebSearchText(text);
  if (!q) return false;

  if (/\bwhat('s| is) the (favorite|favourite|most popular|best)\b/.test(q)) return false;
  if (
    /\b(favorite|favourite)\b/.test(q) &&
    /\b(in|of|from)\s+[a-z]{3,}/.test(q) &&
    !/\byour\b/.test(q)
  ) {
    return false;
  }

  if (/\b(your favorite|your favourite)\b/.test(q)) return true;
  if (/\bwhat('s| is) your (favorite|favourite)\b/.test(q)) return true;
  if (/\bdo you (like|prefer|enjoy|love|hate)\b/.test(q)) return true;
  if (/\bwould you (like|prefer|rather)\b/.test(q)) return true;
  if (/\bwhat('s| is) your (opinion|take|view|thought)\b/.test(q)) {
    if (/\b(chart|market|setup|trade|bias|structure|this|here|mnq|nasdaq|read)\b/.test(q)) return false;
    if (/your (take|read|view)\s*$/.test(q)) return false;
    return true;
  }
  if (/\bwhat do you think (about|of)\b/.test(q)) return true;
  if (/\bwhat would you (order|get|pick|choose|eat|drink|listen)\b/.test(q)) return true;
  if (/\bwhat would you watch\b/.test(q)) {
    if (/\b(next|for|here|now|chart|market|level|liquidity|invalidat)\b/.test(q)) return false;
    if (/^what would you watch\??$/.test(q)) return false;
    return true;
  }

  return false;
}

/** Assistant identity / persona — casual chat, not live web lookup. */
export function isPersonaQuestion(text: string): boolean {
  return isIdentityQuestion(text) || isKarenPreferenceQuestion(text);
}

/** True when question or resolved follow-up needs live web data. */
export function wantsLiveWebData(text: string, messages?: HistoryMsg[]): boolean {
  const q = text.trim();
  if (!q) return false;
  if (isPersonaQuestion(q)) return false;
  if (isChartStatusQuestion(q)) return false;
  const resolved = resolveWebSearchQuestion(q, messages);
  if (isPersonaQuestion(resolved)) return false;
  if (isChartStatusQuestion(resolved)) return false;
  return needsWebSearch(q) || needsWebSearch(resolved);
}

/** Questions that need live web data — not desk JSON or GPT memory. */
export function needsWebSearch(text: string): boolean {
  const q = normalizeWebSearchText(text);
  if (!q || q.length < 4) return false;
  if (isUserMemoryQuestion(q)) return false;
  if (isPersonaQuestion(q)) return false;
  if (isChartStatusQuestion(q)) return false;
  if (isChartReadCommand(q)) return false;

  if (isLookupFollowUp(q)) return true;

  if (
    /\b(search the web|search online|google it|look it up|look that up|look this up|look online|find online|find out|check online)\b/.test(
      q
    )
  ) {
    return true;
  }

  if (
    /\b(weather|temperature|temp|forecast|rain|snow|humidity|wind|celsius|fahrenheit)\b/.test(q)
  ) {
    return true;
  }

  if (/\b(whether|wetter)\b/.test(q) && /\b(?:in|at|for)\s+[a-z]/.test(q)) return true;
  if (/\bweird\s+(?:in|at|for)\s+[a-z]/.test(q)) return true;

  if (/\b(how hot|how cold|how warm)\b/.test(q)) return true;

  if (
    /\bwhat(?:'s|s| is)\s+(?:the\s+)?(?:whether|wetter|weird|weather|temperature|temp|forecast)\b/.test(
      q
    )
  ) {
    return true;
  }

  if (
    /\bhow(?:'s|s| is)\s+(?:the\s+)?(?:whether|wetter|weird|weather|temperature|temp)\b/.test(q)
  ) {
    return true;
  }

  if (/\bwhat(?:'s|s| is)\s+(?:it\s+)?like\s+(?:in|at|for)\s+[a-z]/.test(q)) return true;
  if (/\bhow(?:'s|s| is)\s+it\s+(?:in|at|for)\s+[a-z]/.test(q)) return true;

  if (/\b(latest|current|today|right now|live|this morning|this afternoon|tonight)\b/.test(q)) {
    if (
      /\b(news|headline|score|result|price|rate|stock|crypto|bitcoin|ethereum|election|who won|match|game)\b/.test(
        q
      )
    ) {
      return true;
    }
  }

  if (/\bwho (won|is winning|leading)\b/.test(q)) return true;
  if (/\bwhen (is|was|does|did)\s+(the\s+)?(fight|game|match|final|launch|release)\b/.test(q)) {
    return true;
  }

  if (/\b(exchange rate|usd to|gbp to|eur to)\b/.test(q)) return true;

  if (/\bwhat happened (in|at|with)\b/.test(q)) return true;

  if (/\b(is there|are there)\b/.test(q) && /\b(news|alert|warning|strike|closure)\b/.test(q)) {
    return true;
  }

  if (isClearlyTrading(q)) {
    return /\b(news|headline|why did|what happened|earnings|fed|cpi|nfp)\b/.test(q);
  }

  if (
    /\b(what is|what's|who is|who's|where is|where's|when was|when is|when did|how many|how much|how old|how tall|how long|how far|tell me about)\b/.test(
      q
    )
  ) {
    if (isClearlyTrading(q)) return false;
    if (isSnapshotIntent(classifyChartQuestion(q))) return false;
    if (
      /\b(weather|temperature|forecast|news|score|stock|crypto|bitcoin|headline|election|match|game|price of)\b/.test(
        q
      )
    ) {
      return true;
    }
    if (/\b(today|right now|latest|current|live|this morning|tonight)\b/.test(q)) {
      return true;
    }
    return false;
  }

  if (/\b(capital of|population of|meaning of|definition of|founder of|invented|discovered)\b/.test(q)) {
    return false;
  }

  if (
    /\b(near me|nearby|restaurant|hotel|pub|bar|cafe|coffee shop|opening hours|phone number|address of|directions to|best .+ in)\b/.test(
      q
    )
  ) {
    return true;
  }

  if (
    /\b(news about|news on|what happened|latest on|update on|going on in|headlines)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (/\bwhat(?:'s| is) happening\b/.test(q) && /\b(news|headline|election|weather)\b/.test(q)) {
    return true;
  }

  return false;
}

function isChartReadCommand(q: string): boolean {
  return /\b(get the read|full read|what do you see on the chart|read the chart)\b/i.test(q);
}

/** Turn a chat question into a tighter search query. */
export function buildSearchQuery(question: string): string {
  let q = normalizeWeatherStt(question).trim().replace(/\?+$/, "").trim();
  q = q.replace(/^(hey karen|karen|please|can you|could you|tell me)\b[,.]?\s*/i, "");
  return q || normalizeWeatherStt(question).trim();
}
