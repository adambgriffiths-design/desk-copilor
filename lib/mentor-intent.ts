/**
 * Spoken mentor-turn classifier — semantic routing for voice coaching.
 * Does not run market detectors. Ambiguous non-market stays GENERAL_CHAT.
 */

import { repairConversationalStt } from "@/lib/conversational-normalize";
import {
  assistantLooksLikeMarket,
  inferLastTurnCategory,
  lastTurnWasGeneralCategory,
  lastTurnWasMarketCategory,
  type TurnCategory,
} from "@/lib/turn-category";
import {
  classifyComparativeFollowUpKind,
  extractMentionedLevels,
  isComparativeDistancePhrase,
  isLevelSlotFollowUpPhrase,
} from "@/lib/level-comparative-followup";

export type MentorIntent =
  | "CURRENT_MARKET_READ"
  | "EXPLAIN_PREVIOUS_MARKET_READ"
  | "CHANGE_ANALYSIS"
  | "WATCH_NEXT"
  | "INVALIDATION"
  | "LIQUIDITY_EXPLANATION"
  | "EQH_EQL_EXPLANATION"
  | "STRUCTURE_EXPLANATION"
  | "BIAS_EXPLANATION"
  | "WAIT_EXPLANATION"
  | "SCENARIO_ANALYSIS"
  | "TEACHING"
  | "GENERAL_CHAT";

export type TeachingLength = "SHORT" | "NORMAL" | "DEEP";

export type MentorIntentContext = {
  lastMentorIntent?: MentorIntent;
  lastAssistant?: string;
  lastUser?: string;
  lastFactIds?: string[];
  lastTopic?: string;
  /** Category of the last completed assistant turn — overrides stale lastMentorIntent. */
  lastTurnCategory?: TurnCategory;
  /** Panel / last chart read — used when chat history lastAssistant is an ack or missing. */
  lastVerdict?: string;
};

export type SpokenCapOptions = {
  maxSentences: number;
  maxChars: number;
};

const MARKET_INTENTS: ReadonlySet<MentorIntent> = new Set([
  "CURRENT_MARKET_READ",
  "EXPLAIN_PREVIOUS_MARKET_READ",
  "CHANGE_ANALYSIS",
  "WATCH_NEXT",
  "INVALIDATION",
  "LIQUIDITY_EXPLANATION",
  "EQH_EQL_EXPLANATION",
  "STRUCTURE_EXPLANATION",
  "BIAS_EXPLANATION",
  "WAIT_EXPLANATION",
  "SCENARIO_ANALYSIS",
]);

const LEAD_IN =
  /^(?:hey(?:\s+karen)?|karen|ok(?:ay)?|alright|so|right|please|can you|could you|would you)\s*[,:]?\s+/i;

const NON_MARKET_DOMAIN =
  /\b(bitcoin|btc|ethereum|eth\b|crypto|netflix|movie|film|song|album|recipe|pizza|kfc|mcdonald|nugget|burger|holiday|vacation|weather|forecast|temperature|headline|election|score|nfl|nba|premier league|football match)\b/;

const ENTERTAINMENT_WATCH =
  /\b(netflix|movie|film|show|series|episode|youtube|twitch|game of thrones|sport|match|game tonight)\b/;

const SESSION_PLACE = /\b(london|asia|new york|ny|ny am|ny pm|premarket|pre-market)\b/;

const GLOSSARY_TEACHING =
  /\b(what is|what are|what's|what does|define|how does)\b.+\b(mss|market structure shift|fvg|fair value gap|nwog|ndog|org|opening range|order block|liquidity|ict|premium|discount|kill zone|displacement|consequent encroachment|ce\b|fpfvg|first presented)\b/;

export function normalizeMentorText(text: string): string {
  return repairConversationalStt(String(text || ""))
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[?!.,]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(LEAD_IN, "")
    .trim();
}

export function isMentorMarketIntent(intent: MentorIntent | null | undefined): boolean {
  return !!intent && MARKET_INTENTS.has(intent);
}

export function isMentorMarketTurn(text: string, ctx?: MentorIntentContext): boolean {
  return isMentorMarketIntent(classifyMentorIntent(text, ctx));
}

export function teachingLengthFor(
  text: string,
  intent?: MentorIntent,
  analysisDepth?: string
): TeachingLength {
  const q = normalizeMentorText(text);
  const resolved = intent ?? classifyMentorIntent(text);
  if (analysisDepth === "FAST_FACT") return "SHORT";
  if (resolved === "GENERAL_CHAT") return "SHORT";
  if (resolved === "TEACHING") {
    if (/\b(like i(?:'m| am) learning|in detail|walk me through|break it down|teach me|socratic)\b/.test(q)) {
      return "DEEP";
    }
    return "SHORT";
  }
  if (
    resolved === "STRUCTURE_EXPLANATION" ||
    resolved === "EQH_EQL_EXPLANATION" ||
    resolved === "SCENARIO_ANALYSIS" ||
    /\b(walk me through|talk me through|break down|in detail|explain (?:that |this |it )?(?:like|fully|properly)|teach me)\b/.test(
      q
    )
  ) {
    return "DEEP";
  }
  if (isMentorMarketIntent(resolved)) return "NORMAL";
  return "SHORT";
}

export function spokenCapForLength(length: TeachingLength): SpokenCapOptions {
  switch (length) {
    case "DEEP":
      return { maxSentences: 8, maxChars: 1400 };
    case "NORMAL":
      return { maxSentences: 5, maxChars: 900 };
    default:
      return { maxSentences: 2, maxChars: 320 };
  }
}

export function spokenCapOptions(text: string, ctx?: MentorIntentContext): SpokenCapOptions {
  return spokenCapForLength(teachingLengthFor(text, classifyMentorIntent(text, ctx)));
}

/** Status of a previously mentioned fact — not “what would invalidate”. */
export function isInvalidationStatusQuestion(text: string): boolean {
  const q = normalizeMentorText(text);
  if (!q) return false;
  if (isInvalidationConditionQuestion(text)) return false;
  if (/\bwhy is that\b/.test(q)) return false;
  if (/\b(has (?:that|it|this)|have (?:they|those)|was that|did that)\b/.test(q) &&
    /\b(invalidat|still valid|still hold|still good|still there)\b/.test(q)) {
    return true;
  }
  if (/\b(been invalidated|invalidated yet|still valid|still hold|still good)\b/.test(q)) return true;
  if (/^(still|valid)$/.test(q)) return true;
  return false;
}

/** Named change / invalidation conditions. */
export function isInvalidationConditionQuestion(text: string): boolean {
  const q = normalizeMentorText(text);
  if (!q) return false;
  if (/\bwhat would (?:invalidate|change your mind|make you (?:change|flip|switch|reconsider)|have to happen|need to happen)\b/.test(q)) {
    return true;
  }
  if (/\bwhat would (?:invalidate|change) (?:that|this|it|the (?:bias|case|lean|idea|read))\b/.test(q)) {
    return true;
  }
  if (/\b(?:when|where) would you be wrong\b/.test(q)) return true;
  if (/\bwhat (?:breaks|kills|invalidates) (?:this|that|the (?:idea|case|bias|lean))\b/.test(q)) {
    return true;
  }
  if (/\binvalidation (?:level|condition|price|zone)\b/.test(q)) return true;
  if (/\bchange your mind\b/.test(q)) return true;
  return false;
}

export function isBareMentorFollowUp(text: string): boolean {
  const q = normalizeMentorText(text);
  if (
    /^(why|how come|explain that|what does that mean|why though|and that|but why|why is that|why is it)$/.test(
      q
    )
  ) {
    return true;
  }
  // Progressive expanders — same facts, more detail (caller gates on market prior).
  if (/^(tell me more|go on|expand|more detail|full(?:er)? (?:read|analysis))$/.test(q)) {
    return true;
  }
  // Rephrase requests — keep prior mentor intent, vary wording only.
  return (
    /^(another|another one|different one|a different one|one more|again)$/.test(q) ||
    /\b(say that differently|explain that differently|explain (it |that )?another way|put (it|that) another way|rephrase)\b/.test(
      q
    )
  );
}

/** Temporal / wait-status anaphora after a market wait turn. */
export function isWaitStatusAnaphora(text: string): boolean {
  const q = normalizeMentorText(text);
  if (!q) return false;
  return /^(and now|still waiting|any update|still flat|still out|and\??)$/.test(q);
}

function lastTurnWasMarket(ctx?: MentorIntentContext): boolean {
  if (!ctx) return false;
  if (lastTurnWasMarketCategory(ctx.lastTurnCategory)) return true;
  const a = String(ctx.lastAssistant || "");
  // Market-looking last assistant wins over a stale GENERAL category so
  // why-not-X after a SHORT/LONG envelope is not treated as a new snapshot.
  if (assistantLooksLikeMarket(a)) return true;
  if (lastTurnWasGeneralCategory(ctx.lastTurnCategory)) return false;
  return false;
}

function hasNonMarketDomain(q: string): boolean {
  if (NON_MARKET_DOMAIN.test(q)) return true;
  if (/\b(happening|going on)\s+(in|at|with)\s+/.test(q)) {
    if (/\b(market|chart|session|mnq|nasdaq|futures|price|setup|trade|this|here)\b/.test(q)) return false;
    if (SESSION_PLACE.test(q) && !/\b(paris|berlin|tokyo|rome|weather)\b/.test(q)) return false;
    return true;
  }
  return false;
}

function isIdentityOnly(q: string): boolean {
  if (/^(who are you|what are you|what is your name|what's your name|who is karen)$/.test(q)) {
    return true;
  }
  if (/^what are you(?: anyway| exactly| then)?$/.test(q)) return true;
  if (/\b(tell me about yourself|introduce yourself|describe yourself)\b/.test(q)) return true;
  // Social check-ins ("what are you up to / doing") — not market reads.
  if (/\bwhat are you\b/.test(q) && !/\b(seeing|looking|thinking|watching|reading|picking up)\b/.test(q)) {
    if (/\bwhat are you (a|an|doing|into|up to)\b/.test(q)) return true;
  }
  return false;
}

/**
 * Decision-history / time-travel product phrases (normalized).
 * Kept here (not imported from decision-history-query) to avoid a circular
 * import — patterns must stay aligned with parseDecisionHistoryQuery.
 * Precedence: these beat CURRENT_MARKET_READ and GENERAL_CHAT.
 */
export function isDecisionHistoryProductPhrase(q: string): boolean {
  if (!q) return false;
  if (
    /\bhave you (?:gone|been) (?:long|short)(?: today)?\b/.test(q) ||
    /\bdid you go (?:long|short)(?: today)?\b/.test(q) ||
    /\bany (?:long|short)s? today\b/.test(q)
  ) {
    return true;
  }
  if (
    /\bhave you taken a trade\b/.test(q) ||
    /\bdid you take a trade\b/.test(q) ||
    /\bdid you trade today\b/.test(q) ||
    /\bhave you traded today\b/.test(q) ||
    /\bany (?:trades?|calls?)(?: today)?\b/.test(q) ||
    /\btaken (?:a trade|anything) today\b/.test(q) ||
    /\btaken anything today\b/.test(q) ||
    /\btraded today\b/.test(q) ||
    /\btake any trades?(?: today)?\b/.test(q) ||
    /\bdid you take any trades?\b/.test(q)
  ) {
    return true;
  }
  if (
    /\blast\s+recorded\s+(?:state|stance|decision|call|read|view|status)\b/.test(q) ||
    /\blast\s+(?:actual|actionable|directional)\s+(?:trade\s+)?(?:decision|call)\b/.test(q) ||
    /\blast\s+actual\s+(?:trade|call)\b/.test(q) ||
    /\blast\s+(?:long|short)\s+or\s+(?:long|short)\b/.test(q) ||
    /\blast\s+trade\s+decision\b/.test(q) ||
    /\bwhat was your last trade\b/.test(q) ||
    /\byour last trade\b/.test(q) ||
    /^last trade\b/.test(q) ||
    /\bprevious trade\b/.test(q) ||
    /\bwhy did you take the last trade\b/.test(q) ||
    /\bwhen did you last decide to trade\b/.test(q) ||
    /\bwhen were you last (?:long|short)\b/.test(q) ||
    /\bwhen was your last (?:long|short)\b/.test(q) ||
    /\bwhat was your last (?:long|short)\b/.test(q) ||
    /\byour last (?:long|short)\b/.test(q) ||
    /^last (?:long|short)\b/.test(q) ||
    /\bwhat did you (?:decide|call)\s+last\b/.test(q) ||
    /\bwhen did you last (?:decide|call)\b/.test(q) ||
    /\bwhen was your last (?:decision|call)\b/.test(q) ||
    /\bwhat was your last (?:decision|call)\b/.test(q) ||
    /\b(?:your|the)\s+last\s+(?:decision|call)\b/.test(q) ||
    /\bprevious setup\b/.test(q) ||
    /\bwhat happened to (?:it|that|the (?:setup|idea|trade|call))\b/.test(q)
  ) {
    return true;
  }
  // Clock / relative time-travel (aligned with decision-history-query).
  if (
    /\b\d{1,2}(?::|\.)\d{2}\b/.test(q) &&
    (/\b(changed|different|since|between|decision|call|read|stance|view)\b/.test(q) ||
      /\bimmediately before\b/.test(q))
  ) {
    return true;
  }
  if (
    /\bwhat (?:was|were) (?:your|the) (?:decision|call|read|verdict|stance|bias)\b/.test(q) &&
    /\bago\b/.test(q)
  ) {
    return true;
  }
  return false;
}

function isCurrentMarketRead(q: string): boolean {
  if (isIdentityOnly(q)) return false;
  if (hasNonMarketDomain(q)) return false;
  // Decision-history product phrases must never become live market-read / QG.
  if (isDecisionHistoryProductPhrase(q)) return false;
  // Explicit screenshot / chart-acquisition commands stay off this intent.
  if (
    /^(?:get the read|full read|chart read|market read|quick read|read the chart|analy[sz]e(?: the)? chart)$/.test(
      q
    )
  ) {
    return false;
  }
  if (/\bwhat are you seeing\b/.test(q)) return true;
  if (/\bwhat do you see\b/.test(q) && !/\b(on (?:the )?menu|in the fridge|outside)\b/.test(q)) return true;
  if (/\bwhat are you thinking\b/.test(q) && !/\b(about (?:dinner|food|life|vacation))\b/.test(q)) {
    return true;
  }
  if (/\bshow me what you(?:'re| are) seeing\b/.test(q)) return true;
  if (/^what(?:'s| is) happening$/.test(q)) return true;
  if (/^what(?:'s| is) going on(?: here| with this| with the (?:chart|market))?$/.test(q)) return true;
  if (/\bwhat(?:'s| is) going on here\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) happening\b/.test(q) && !hasNonMarketDomain(q) && !/\bin the news\b/.test(q)) {
    if (/\b(here|now|chart|market|this|setup|session)\b/.test(q) || /^what(?:'s| is) happening$/.test(q)) {
      return true;
    }
  }
  if (/\bhow (?:does|do|is) (?:this|it|the chart|the market|that) look/.test(q)) return true;
  if (/\bhow (?:are|is) (?:we|this) looking\b/.test(q)) return true;
  if (/\bhow(?:'s| is| are) (?:we|this|it) looking\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) your (?:read|take)\b/.test(q) && !NON_MARKET_DOMAIN.test(q)) return true;
  if (/\bwhat(?:'s|s| is) your market read\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) the read\b/.test(q)) return true;
  // Conversational: "whats the market read" / "what's the market read"
  if (/\bwhat(?:'s|s| is) the market read\b/.test(q)) return true;
  if (/\bwhat do you think (?:of|about) (?:the )?(?:market|chart|setup|this)\b/.test(q)) return true;
  // Symbol-named reads: MNQ / NQ / Nasdaq (micro or full)
  if (
    /\bwhat do you think (?:of|about)\b/.test(q) &&
    /\b(mnq|nq|nasdaq|nasdaq futures|micro nasdaq)\b/.test(q)
  ) {
    return true;
  }
  if (/\bbullish or bearish\b/.test(q) || /\bbearish or bullish\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) your (?:current )?(?:stance|decision|call|view)\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) your stance\b/.test(q)) return true;
  if (/\bwhere do you stand\b/.test(q)) return true;
  if (/\bcurrent (?:stance|decision|call)\b/.test(q) && /\b(your|the|on|for|about)\b/.test(q)) {
    return true;
  }
  if (/\bwhat(?:'s| is) your bias\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) the bias\b/.test(q) && !/\bwhat is bias\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) the setup\b/.test(q)) return true;
  if (/\bread on the (?:chart|market)\b/.test(q)) return true;
  if (
    /^(?:give me (?:a |the )?read|give me (?:a |the )?(?:market |chart )?read)$/.test(
      q
    )
  ) {
    return true;
  }
  if (/\bgive me (?:a |the )?(?:new |fresh |updated )?(?:market |chart )?read\b/.test(q)) {
    return true;
  }
  if (/\b(?:new |fresh |updated )(?:market |chart )?read\b/.test(q)) return true;
  if (/\btalk me through the market\b/.test(q)) return true;
  if (/\btalk me through (?:this|it|the chart)\b/.test(q)) return true;
  // Desk call / garbled STT: "what will you do", "calculate what you'll do", "what's your call"
  if (/\bwhat(?:'s| is) your call\b/.test(q)) return true;
  if (/\bwhat (?:will|would|are) you (?:do|call|take|play)\b/.test(q)) return true;
  if (/\bwhat are you going to do\b/.test(q)) return true;
  if (
    /\bcalculate\b/.test(q) &&
    !/\b(tip|tax|percent|plus|minus|times|divided|square root|calorie)\b/.test(q) &&
    (/\b(you|your|we|i|call|read|bias|trade|do|will|would)\b/.test(q) || /^calculate\b/.test(q))
  ) {
    return true;
  }
  return false;
}

function isChangeAnalysis(q: string): boolean {
  if (/\bwhat(?:'s| has| is)? changed\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) different\b/.test(q)) return true;
  if (/\b(?:has|have) (?:anything|something|it) changed\b/.test(q)) return true;
  if (/\bsince (?:before|last time|the last|five minutes|a few minutes|just now)\b/.test(q) && /\b(chang|different|update)\b/.test(q)) {
    return true;
  }
  if (/\bwhy did (?:your|the) (?:view|read|bias|call|decision|stance) change\b/.test(q)) return true;
  if (/\bwhat changed just now\b/.test(q)) return true;
  // Clock-time history compares — e.g. "what changed since 08:31", "between 08:31 and 08:41"
  if (
    /\b\d{1,2}(?::|\.)\d{2}\b/.test(q) &&
    (/\b(changed|different|since|between)\b/.test(q) ||
      /\bwhat was your (?:decision|call|read)\b/.test(q))
  ) {
    return true;
  }
  return false;
}

/** Exported for decision-history / time-travel routing. */
export function isChangeAnalysisQuestion(text: string): boolean {
  return isChangeAnalysis(normalizeMentorText(text));
}

/**
 * "What was your decision 10 minutes ago?" / "what was the call an hour ago?"
 * Distinct from bare "why?" explain-last.
 */
export function isDecisionAtTimeQuestion(text: string): boolean {
  const q = normalizeMentorText(text);
  if (!q) return false;
  if (/\bwhat (?:was|were) (?:your|the) (?:decision|call|read|verdict|stance|bias)\b/.test(q) && /\bago\b/.test(q)) {
    return true;
  }
  if (/\b(?:decision|call|read|verdict) (?:\d+\s*(?:min(?:ute)?s?|hours?)|an hour|a minute) ago\b/.test(q)) {
    return true;
  }
  if (/\bwhat (?:did you|were you) (?:say|call|decide|think)\b/.test(q) && /\bago\b/.test(q)) {
    return true;
  }
  // Clock-time forms handled by decision-history-query; still route as explain-prior.
  if (
    /\bwhat was your (?:decision|call|read|stance|view)\b/.test(q) &&
    /\b\d{1,2}(?::|\.)\d{2}\b/.test(q)
  ) {
    return true;
  }
  return false;
}

/**
 * Parse lookback window in minutes from mentor questions.
 * Examples: "10 minutes ago", "5 min ago", "an hour ago", "since five minutes".
 */
export function parseDecisionLookbackMinutes(text: string): number | null {
  const q = normalizeMentorText(text);
  if (!q) return null;
  const numMin = q.match(/\b(\d+)\s*(?:min(?:ute)?s?)\b/);
  if (numMin) {
    const n = Number(numMin[1]);
    if (Number.isFinite(n) && n > 0) return Math.min(24 * 60, Math.floor(n));
  }
  const numHour = q.match(/\b(\d+)\s*hours?\b/);
  if (numHour) {
    const n = Number(numHour[1]);
    if (Number.isFinite(n) && n > 0) return Math.min(24 * 60, Math.floor(n) * 60);
  }
  if (/\ban hour ago\b/.test(q) || /\babout an hour\b/.test(q)) return 60;
  if (/\ba minute ago\b/.test(q)) return 1;
  if (/\bfive minutes\b/.test(q)) return 5;
  if (/\ba few minutes\b/.test(q)) return 5;
  if (/\bjust now\b/.test(q)) return 1;
  return null;
}

function isWatchNext(q: string): boolean {
  if (ENTERTAINMENT_WATCH.test(q)) return false;
  if (/\bwhat (?:should|do) i watch\b/.test(q)) return true;
  if (/\bwhat would you watch next\b/.test(q)) return true;
  if (/\bwhat (?:would you|should i|do we|to) watch (?:for|next|here|now)?\b/.test(q)) return true;
  if (/\bwhat are (?:you|we) watching (?:for|next|here)?\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) the (?:next )?(?:thing|level) to watch\b/.test(q)) return true;
  if (/^what should i watch$/.test(q)) return true;
  if (/^what would you watch$/.test(q)) return true;
  return false;
}

function isLiquidityExplanation(q: string): boolean {
  if (/\b(eqh|eql|equal high|equal low|relative equal)\b/.test(q)) return false;
  if (/\bwhy\b/.test(q) && /\bliquidity\b/.test(q)) return true;
  if (/\bwhy is (?:that|this|the) liquidity\b/.test(q)) return true;
  if (/\bwhy does (?:that|this) liquidity matter\b/.test(q)) return true;
  if (/\bwhich liquidity\b/.test(q)) return true;
  if (/\bwhat liquidity\b/.test(q) && /\b(matter|important|watch)\b/.test(q)) return true;
  if (/\bliquidity matters most\b/.test(q)) return true;
  return false;
}

function isEqhExplanation(q: string): boolean {
  if (/\b(eqh|eql|equal highs?|equal lows?|relative equal)\b/.test(q) && /\b(why|matter|important|significance|compare)\b/.test(q)) {
    return true;
  }
  if (/\bwhy is (?:this|that|the) equal (?:high|low)\b/.test(q)) return true;
  if (/\b(?:this|that|those|the) (?:high|lows?) (?:looks?|look) (?:equal|the same|similar)\b/.test(q)) {
    return true;
  }
  if (/\bbut (?:that|this|those) (?:high|lows?)\b/.test(q) && /\b(equal|same|similar)\b/.test(q)) {
    return true;
  }
  if (/\bmore important than (?:that|the other) (?:one|high|low)\b/.test(q)) return true;
  return false;
}

function isBiasExplanation(q: string): boolean {
  if (GLOSSARY_TEACHING.test(q) && /\bwhat is (?:a |an )?bias\b/.test(q)) return false;
  if (/\bwhat(?:'s| is) your bias\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) the bias\b/.test(q) && !/\bwhat is bias\b/.test(q)) return true;
  if (/\bwhich way are you leaning\b/.test(q)) return true;
  // "u bullish?" is normalized to "you bullish?" via conversational-normalize.
  if (/\b(?:are you|you) (?:bullish|bearish|long|short|flat)\b/.test(q) && !/\bwhy\b/.test(q)) {
    return true;
  }
  if (/^(?:bullish|bearish)\??$/.test(q)) return true;
  if (/\bwhat(?:'s| is) your (?:lean|directional (?:view|call))\b/.test(q)) return true;
  return false;
}

/** Explain the previous Karen read / lean — semantic, not one exact phrase. */
export function isExplainPreviousMarketRead(text: string, ctx?: MentorIntentContext): boolean {
  const q = normalizeMentorText(text);
  if (!q || hasNonMarketDomain(q) || isIdentityOnly(q)) return false;
  if (isInvalidationConditionQuestion(text) || isChangeAnalysis(q) || isLiquidityExplanation(q)) {
    return false;
  }
  if (/\bwhy are you leaning\b/.test(q) || /\bleaning that way\b/.test(q)) return true;
  if (
    /\bwhy (?:are you |are we |is (?:it|that|the (?:call|lean|read) )?)?(?:bullish|bearish|long|short)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (/\bwhy (?:did you|would you|do you) (?:go |call |take )?(?:long|short|bullish|bearish)\b/.test(q)) {
    return true;
  }
  if (/\bwhat makes you think that\b/.test(q)) return lastTurnWasMarket(ctx);
  if (/\bwhat(?:'s| is) supporting that\b/.test(q)) return lastTurnWasMarket(ctx);
  if (/\bwhat(?:'s| is) supporting (?:the )?(?:lean|bias|read|call)\b/.test(q)) return true;
  if (/\bwhy do you think that(?:'s| is) the better side\b/.test(q)) return true;
  if (/\bwhy do you think that\b/.test(q)) return lastTurnWasMarket(ctx);
  if (/\bwhy is that the better (?:side|lean|call|read)\b/.test(q)) return true;
  if (isBareMentorFollowUp(q) || /^why$/.test(q)) return lastTurnWasMarket(ctx);
  if (lastTurnWasMarket(ctx) && q.length <= 80) {
    if (/\b(why|explain|support|supporting)\b/.test(q) && /\b(that|this|it|the (?:read|lean|bias|call|side))\b/.test(q)) {
      return true;
    }
    if (/\bare you sure\b/.test(q)) return true;
    if (/\bstill (?:hold|holds|true|valid)\b/.test(q)) return true;
  }
  return false;
}

/** True when the last completed turn was a desk market read (not general knowledge). */
export function hasPriorMarketRead(ctx?: MentorIntentContext): boolean {
  return Boolean(String(ctx?.lastAssistant || "").trim()) && lastTurnWasMarket(ctx);
}

function priorReadAvailable(ctx?: MentorIntentContext): boolean {
  if (hasPriorMarketRead(ctx)) return true;
  const a = String(ctx?.lastAssistant || "");
  const v = String(ctx?.lastVerdict || "");
  return assistantLooksLikeMarket(a) || assistantLooksLikeMarket(v);
}

/**
 * Phrases that explain the last envelope — never a new Yahoo/OHLC snapshot.
 * Includes why-are-you-short/long, why-not-X, bare why, waiting, invalidation.
 */
export function isPriorReadFollowUpPhrase(text: string): boolean {
  const q = normalizeMentorText(text);
  if (!q) return false;
  if (parseWhyNotDirection(text)) return true;
  if (isBareMentorFollowUp(q) || /^why$/.test(q)) return true;
  if (isWaitStatusAnaphora(q)) return true;
  if (isInvalidationConditionQuestion(text)) return true;
  if (/\bwhat(?:'s| is| are| were) (?:you|we) waiting for\b/.test(q)) return true;
  // STT drop: "what you waiting for"
  if (/\bwhat (?:you|we) waiting for\b/.test(q)) return true;
  if (/\bwhy (?:are|were) you waiting\b/.test(q)) return true;
  if (/\bwhy did you stay (?:flat|out)\b/.test(q)) return true;
  if (/\bwhy (?:are you|did you) stay(?:ing)? flat\b/.test(q)) return true;
  if (
    /\bwhy (?:are you |are we |is (?:it|that|the (?:call|lean|read) )?)?(?:bullish|bearish|long|short)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (isExplainPreviousMarketRead(text)) return true;
  return false;
}

/**
 * Mentor follow-up on a prior market read — reuse conversation context, not live OHLC refresh.
 */
export function isMentorFollowUpOnPriorRead(
  question: string,
  ctx?: MentorIntentContext
): boolean {
  if (!priorReadAvailable(ctx)) return false;
  if (requestsFreshMarketState(question, ctx)) return false;
  if (isPriorReadFollowUpPhrase(question)) return true;
  const intent = classifyMentorIntent(question, ctx);
  return !shouldRefreshMarketState(intent, ctx);
}

/**
 * Fresh market intel is required for a new read / what-changed / liquidity-now.
 * Explaining the last spoken read must not wait on a new snapshot.
 */
export function shouldRefreshMarketState(
  intent: MentorIntent,
  ctx?: MentorIntentContext
): boolean {
  // NEW READ / what-changed — explicit current-state request. Refresh is allowed.
  if (intent === "CHANGE_ANALYSIS" || intent === "CURRENT_MARKET_READ") return true;
  if (intent === "EXPLAIN_PREVIOUS_MARKET_READ") return false;
  const hasPriorRead = Boolean(String(ctx?.lastAssistant || "").trim());
  if (hasPriorRead && hasPriorMarketRead(ctx)) {
    if (
      intent === "WAIT_EXPLANATION" ||
      intent === "BIAS_EXPLANATION" ||
      intent === "INVALIDATION" ||
      intent === "EQH_EQL_EXPLANATION" ||
      intent === "LIQUIDITY_EXPLANATION"
    ) {
      return false;
    }
  }
  return true;
}

/** True when the trader is asking for a fresh snapshot, not an explanation of the last envelope. */
export function requestsFreshMarketState(text: string, ctx?: MentorIntentContext): boolean {
  const q = normalizeMentorText(text);
  if (!q) return false;
  if (isPriorReadFollowUpPhrase(text)) return false;
  if (isChangeAnalysis(q)) return true;
  const intent = classifyMentorIntent(text, ctx);
  return intent === "CHANGE_ANALYSIS" || intent === "CURRENT_MARKET_READ";
}

function isWaitExplanation(q: string): boolean {
  if (/\bwhat(?:'s| is| are| were) (?:you|we) waiting for\b/.test(q)) return true;
  if (/\bwhat (?:are|were) you waiting for\b/.test(q)) return true;
  if (/\bwhat (?:you|we) waiting for\b/.test(q)) return true;
  if (/\bwhy (?:are|were) you waiting\b/.test(q)) return true;
  if (/\bwhy (?:wait|are we waiting|no trade|stand aside|stay (?:flat|out))\b/.test(q)) return true;
  if (/\bwhy (?:aren't|are not|isn'?t) you\b/.test(q) && /\b(directional|calling|long|short)\b/.test(q)) {
    return true;
  }
  if (/\bwhat(?:'s| is) keeping you (?:flat|out|waiting)\b/.test(q)) return true;
  if (/\bwhy did you stay (?:flat|out)\b/.test(q)) return true;
  if (/\bwhy (?:are you|did you) stay(?:ing)? flat\b/.test(q)) return true;
  if (isWaitStatusAnaphora(q)) return true;
  return false;
}

/** "Why not short?" / "Why not long?" / "why no long" — structured side rejection follow-up. */
export function parseWhyNotDirection(text: string): "long" | "short" | null {
  const q = normalizeMentorText(text);
  if (/\bwhy not (?:a |the |go |going )?short\b/.test(q)) return "short";
  if (/\bwhy not (?:a |the |go |going )?long\b/.test(q)) return "long";
  if (/\bwhy no (?:a |the |go |going )?short\b/.test(q)) return "short";
  if (/\bwhy no (?:a |the |go |going )?long\b/.test(q)) return "long";
  if (/\bwhy (?:isn'?t|is not|aren'?t) (?:it |that |this )?(?:a )?short\b/.test(q)) return "short";
  if (/\bwhy (?:isn'?t|is not|aren'?t) (?:it |that |this )?(?:a )?long\b/.test(q)) return "long";
  return null;
}

function isStructureWalkthrough(q: string): boolean {
  if (/\bwalk me through\b/.test(q)) return true;
  if (/\bexplain (?:the |this |current )?(?:chart|structure|setup|market)\b/.test(q)) return true;
  if (/\bbreak down (?:the |this |current )?(?:market )?structure\b/.test(q)) return true;
  if (/\bbreak down (?:the |this )?(?:chart|setup)\b/.test(q)) return true;
  return false;
}

function isScenario(q: string): boolean {
  if (/\b(bull vs bear|both sides|either side|compare (?:the )?cases)\b/.test(q)) return true;
  if (/\bwhat if (?:it |price )?(?:breaks|sweeps|holds|fails)\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) the (?:bull|bear) (?:case|scenario)\b/.test(q)) return true;
  return false;
}

function isTeaching(q: string): boolean {
  if (/\bwhat is (?:a |an )?(?:mss|fvg|nwog|ndog|org|ict)\b/.test(q)) return true;
  if (GLOSSARY_TEACHING.test(q) && !/\b(your bias|current|right now|on (?:the )?chart|where is)\b/.test(q)) {
    return true;
  }
  if (/\bexplain that like i(?:'m| am) learning ict\b/.test(q)) return true;
  return false;
}

function resolveFollowUp(q: string, ctx?: MentorIntentContext): MentorIntent | null {
  if (!lastTurnWasMarket(ctx)) return null;
  if (isEqhExplanation(q)) return "EQH_EQL_EXPLANATION";
  if (isInvalidationConditionQuestion(q) || /\bwhat would invalidate that\b/.test(q)) {
    return "INVALIDATION";
  }
  if (isLiquidityExplanation(q)) return "LIQUIDITY_EXPLANATION";
  if (isChangeAnalysis(q)) return "CHANGE_ANALYSIS";
  if (parseWhyNotDirection(q)) return "EXPLAIN_PREVIOUS_MARKET_READ";
  // Wait-status anaphora / still waiting → WAIT_EXPLANATION when prior looked like wait.
  if (
    isWaitExplanation(q) ||
    (isWaitStatusAnaphora(q) &&
      (ctx?.lastMentorIntent === "WAIT_EXPLANATION" ||
        /\bwait|stand aside|stay flat|no[_ ]?trade\b/i.test(ctx?.lastAssistant || "")))
  ) {
    return "WAIT_EXPLANATION";
  }
  if (isExplainPreviousMarketRead(q, ctx) || isBareMentorFollowUp(q) || /^why$/.test(q)) {
    const last = ctx?.lastMentorIntent;
    if (last === "WAIT_EXPLANATION" || /\bwait|stand aside|stay flat\b/i.test(ctx?.lastAssistant || "")) {
      if (
        isBareMentorFollowUp(q) ||
        /^why$/.test(q) ||
        isWaitStatusAnaphora(q) ||
        /\bwhy (?:are|were) you waiting\b/.test(q)
      ) {
        return "WAIT_EXPLANATION";
      }
    }
    if (last === "EQH_EQL_EXPLANATION" && /\b(eqh|eql|equal)\b/.test(q)) return "EQH_EQL_EXPLANATION";
    if (last === "CHANGE_ANALYSIS" && isChangeAnalysis(q)) return "CHANGE_ANALYSIS";
    if (last === "LIQUIDITY_EXPLANATION" && isLiquidityExplanation(q)) return "LIQUIDITY_EXPLANATION";
    // Progressive: tell me more / full analysis after market → deepen prior read.
    if (/\b(full analysis|walk me through|in detail)\b/.test(q)) return "STRUCTURE_EXPLANATION";
    return "EXPLAIN_PREVIOUS_MARKET_READ";
  }
  return null;
}

/** Classify a spoken/chat turn into a mentor intent. */
export function classifyMentorIntent(text: string, ctx?: MentorIntentContext): MentorIntent {
  const q = normalizeMentorText(text);
  if (!q) return "GENERAL_CHAT";

  const follow = resolveFollowUp(q, ctx);
  if (follow) return follow;

  if (isIdentityOnly(q)) return "GENERAL_CHAT";
  // Live "what's the market doing" ticks stay on the snapshot path, not coaching.
  if (/\b(chart|market|mnq|nasdaq)\b/.test(q) && /\b(doing|moving)\b/.test(q) && !/\bwhy\b/.test(q)) {
    return "GENERAL_CHAT";
  }
  if (isTeaching(q) && !isCurrentMarketRead(q) && !isBiasExplanation(q) && !isWaitExplanation(q)) {
    return "TEACHING";
  }

  if (isInvalidationConditionQuestion(q)) return "INVALIDATION";
  if (isEqhExplanation(q)) return "EQH_EQL_EXPLANATION";
  if (isLiquidityExplanation(q)) return "LIQUIDITY_EXPLANATION";
  if (isChangeAnalysis(q)) return "CHANGE_ANALYSIS";
  if (parseWhyNotDirection(q)) return "EXPLAIN_PREVIOUS_MARKET_READ";
  if (isWaitExplanation(q)) return "WAIT_EXPLANATION";
  if (isWatchNext(q)) return "WATCH_NEXT";
  if (isExplainPreviousMarketRead(q, ctx)) return "EXPLAIN_PREVIOUS_MARKET_READ";

  // PRECEDENCE: decision-history / time-travel BEFORE live CURRENT_MARKET_READ.
  // Prevents "Have you taken a trade today?" → CMR → quality-gate WAIT dump.
  // Stream also short-circuits via isDecisionHistoryTimeQuery (no MarketState rebuild).
  if (isDecisionHistoryProductPhrase(q)) return "CHANGE_ANALYSIS";

  // Live stance / bias / symbol reads — not DecisionEnvelope history.
  if (isCurrentMarketRead(q)) return "CURRENT_MARKET_READ";
  if (isBiasExplanation(q)) return "BIAS_EXPLANATION";
  if (isStructureWalkthrough(q)) return "STRUCTURE_EXPLANATION";
  if (isScenario(q)) return "SCENARIO_ANALYSIS";

  // Comparative level anaphora after Karen named levels — not GENERAL_CHAT.
  const priorLevels = extractMentionedLevels(String(ctx?.lastAssistant || ""));
  if (
    priorLevels.length > 0 &&
    (classifyComparativeFollowUpKind(q) ||
      isComparativeDistancePhrase(q) ||
      isLevelSlotFollowUpPhrase(q))
  ) {
    return "CURRENT_MARKET_READ";
  }

  return "GENERAL_CHAT";
}

export function mentorIntentSlug(intent: MentorIntent): string {
  return intent.toLowerCase();
}

export function mentorContextFromMessages(
  messages: Array<{ role: string; content: string }> | undefined,
  lastMentorIntent?: MentorIntent
): MentorIntentContext {
  const list = messages || [];
  const lastAssistant = [...list].reverse().find((m) => m.role === "assistant")?.content;
  const users = list.filter((m) => m.role === "user");
  const priorUser = users.length >= 2 ? users[users.length - 2]?.content : undefined;
  const ids: string[] = [];
  const idMatch = String(lastAssistant || "").match(/\[([a-z0-9_.]+)\]/gi);
  if (idMatch) {
    for (const m of idMatch) ids.push(m.replace(/[\[\]]/g, ""));
  }
  return {
    lastMentorIntent,
    lastAssistant,
    lastUser: priorUser,
    lastFactIds: ids.length ? ids : undefined,
    lastTurnCategory: inferLastTurnCategory(list),
  };
}

export function voiceChannelInstructionsFor(length: TeachingLength): string {
  if (length === "SHORT") {
    return `VOICE CHANNEL (what she speaks — not the Analyse panel):
- 1–2 short sentences. One idea. Desk language. First sentence is the whole point.
- Do not read labeled panel dumps, META lines, or every previous-day / relative-equal level.
- Liquidity: cite at most one HIGH equal-high/low (or unswept MEDIUM if no HIGH) and its why. Never treat random similar wicks as a pool. Stay flat if nothing meaningful.
- Do not invent longs or shorts. WAIT / stay flat is allowed.
- Do not repeat the working ack.`;
  }
  if (length === "DEEP") {
    return `VOICE CHANNEL (teaching / walkthrough — what she speaks):
- 5–8 speakable sentences. Structured, not a research dump. Start like a mentor in their ear ("Right now I'm seeing…").
- Cover the current chart idea: structure, the one liquidity pool that matters if any, invalidation, and what you are waiting for.
- Do not truncate the why. Do not invent prices or pools. If data is stale or missing, say so.
- Never say "based on the market intelligence data object".`;
  }
  return `VOICE CHANNEL (market explanation — what she speaks):
- 3–5 speakable sentences. Grounded in current market state. First sentence is the point ("Right now I'm seeing…").
- Include the relevant structure or liquidity and the invalidation / wait condition when they asked.
- Do not crush this into two sentences. Do not dump labeled panel fields or META lines.
- Do not invent longs, shorts, or equal-high pools. WAIT / stay flat is allowed.`;
}
