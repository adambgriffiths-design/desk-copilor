/**
 * Conversational intent isolation — routing layer only.
 * Previous market turns stay available but must not override a clear new request.
 */

import {
  classifyMentorIntent,
  isBareMentorFollowUp,
  isInvalidationConditionQuestion,
  isInvalidationStatusQuestion,
  isMentorMarketIntent,
  type MentorIntent,
  type MentorIntentContext,
} from "@/lib/mentor-intent";
import { isChartReadCommand } from "@/lib/chart-read-intent";
import {
  classifyExtensionMessagingFailure,
  isExtensionMessagingFailure,
} from "@/lib/connection-state";
import { normalizeConversationalText, repairConversationalStt } from "@/lib/conversational-normalize";
import {
  assistantLooksLikeMarket,
  lastTurnWasGeneralCategory,
  lastTurnWasMarketCategory,
} from "@/lib/turn-category";

export type ConversationalIntent =
  | "MARKET_ANALYSIS"
  | "MARKET_FOLLOWUP"
  | "GENERAL_KNOWLEDGE"
  | "GENERAL_CHAT"
  | "VOICE_DESK_CONTROL"
  | "SYSTEM_CONNECTION"
  | "AMBIGUOUS";

export type ConversationalIntentInput = {
  text: string;
  ctx?: MentorIntentContext;
};

const INTERROGATIVE_OPENER =
  /^(what(?:'?s)?|who(?:'?s)?|where(?:'?s)?|when(?:'?s)?|why|how(?:'?s)?|which|tell me|explain|describe|define|can you|could you|do you know|is there|are there)\b/i;

const BARE_ANAPHORA =
  /^(why|how come|explain that|what does that mean|why though|and that|but why|why is that|why is it|and that\??|what about (?:that|this|it))$/i;

const MARKET_ANAPHORA =
  /^(why (?:are you|aren't you|are we|is that|bullish|bearish|long|short|wait(?:ing)?|not (?:short|long|wait(?:ing)?))|why (?:the )?(?:lean|bias|wait|call|read)|what (?:changed|would invalidate|(?:are|were) you waiting for)|what would invalidate (?:that|this|it)|where would you (?:enter|get in|short|long)|why not (?:short|long))\b/i;

const MATH_REQUEST =
  /\d+\s*[x×*+/÷-]\s*\d+|\b\d+\s*(?:times|plus|minus|divided by|multiplied by)\s*\d+\b|\bwhat(?:'?s| is)\s+\d/i;

const PERSONA_OR_SMALLTALK =
  /^(hi|hello|hey|sup|how are you|how's it going|how's your day|good morning|good evening|thanks|thank you|bye)(?:\b|$)/i;

const JOKE_REQUEST = /\b(tell me a joke|say a joke|tell a joke|make me laugh)\b|\btell me a joke\b/i;

const PREFERENCE_CHAT =
  /\b(do you (?:like|prefer|enjoy)|your (?:favorite|favourite)|would you (?:rather|prefer))\b/i;

const VOICE_DESK_CONTROL =
  /\b(stop talking|stop listening|stop voice|mute(?: yourself)?|hang up|end voice|be quiet)\b/i;

const SYSTEM_CONNECTION_TURN =
  /^(reconnect(?: the (?:backend|desk))?|are you (?:there|connected|online)|connection (?:ok|status)|can you hear me)\??$/i;

const UNINTELLIGIBLE =
  /^(huh|hm+|umm+|uh+|err+|eh|what|asdf+|qwer+|zxcv+|random xyz|n+gh|zzz+)$/i;

/** ICT / chart structure terms — location/presence asks are market facts, not GENERAL_KNOWLEDGE. */
const CHART_STRUCTURE_FACT_TERMS =
  /\b(mss|nwog|ndog|org|fvg|ifvg|fpfvg|fhdr|eqh|eql|reh|rel|bos|choch|cisd|ote|bpr|smt|pdh|pdl|pdc|bsl|ssl|ce|ash|liquidity(?: pools?| void)?|buy[- ]?side liquidity|sell[- ]?side liquidity|order blocks?|obs?|breaker(?: blocks?)?|fair value gap|inverse (?:fair value )?gap|volume imbalance|optimal trade entry|market structure(?: shift)?|structure shift|dealing range|first hour dealing range|judas(?: swing)?|relative equal (?:high|low)s?|equal (?:high|low)s?|open(?:ing)?(?: range)? gap|new week opening gap|new day opening gap|london open(?:ing)?(?: gap)?|consequent encroachment|change in state of delivery|pd arrays?|amd(?: phase)?|kill zone|equilibrium|weekly open|asian? range|asia range|midnight open|true day open|imbalance|gap fill|opening range|silver bullet|power of three|premium|discount|unfilled gap|turtle soup|previous week (?:high|low)|weekly (?:high|low)|monthly open|range (?:high|low)|mid(?:[- ]?point| range)|daily (?:high|low)|current day (?:high|low)|(?:new york|ny) open|asian? open|session open|macro(?: window)?|inversion|inefficiency|mitigation blocks?|rejection blocks?|prop blocks?|vacuum blocks?|delivery efficiency|efficiency|fair value|dol|next draw|inducement|internal range|external range|consolidation|accumulation|stop runs?|swing (?:high|low)|old (?:high|low)|mean threshold|fibonacci|fib(?:onacci)?|62(?:\s*percent|%)|79(?:\s*percent|%)|50(?:\s*percent|%) level|ipda|institutional order flow|smart money reversal|market maker model|value area (?:high|low)|vah|val|poc|point of control|session (?:high|low)|asia (?:high|low)|london (?:high|low)|(?:new york|ny) (?:high|low)|previous day (?:high|low|close|equilibrium)|displacement)\b/i;

const CHART_FACT_LOCATION_OR_PRESENCE =
  /\b(where(?:'?s| is| are)|nearest|latest|last|near(?:est)?|is there|are there|do we have|locate|find)\b/i;

export { repairConversationalStt };

function wordCount(q: string): number {
  return q.split(/\s+/).filter(Boolean).length;
}

function contextLooksLikeMarket(ctx?: MentorIntentContext): boolean {
  if (!ctx) return false;
  if (lastTurnWasGeneralCategory(ctx.lastTurnCategory)) return false;
  if (lastTurnWasMarketCategory(ctx.lastTurnCategory)) return true;
  if (isMentorMarketIntent(ctx.lastMentorIntent) && assistantLooksLikeMarket(ctx.lastAssistant || "")) {
    return true;
  }
  if (ctx.lastFactIds?.length && assistantLooksLikeMarket(ctx.lastAssistant || "")) return true;
  if (ctx.lastTopic && assistantLooksLikeMarket(ctx.lastAssistant || "")) return true;
  return assistantLooksLikeMarket(ctx.lastAssistant || "");
}

function contextLooksLikeGeneral(ctx?: MentorIntentContext): boolean {
  if (!ctx) return false;
  if (lastTurnWasGeneralCategory(ctx.lastTurnCategory)) return true;
  if (lastTurnWasMarketCategory(ctx.lastTurnCategory)) return false;
  return !assistantLooksLikeMarket(ctx.lastAssistant || "");
}

/** Short anaphoric follow-up — market vs general depends on prior turn category. */
export function isBareAnaphoraFollowUp(text: string): boolean {
  const q = normalizeConversationalText(text);
  if (!q) return false;
  if (isBareMentorFollowUp(q) || isBareMentorFollowUp(text)) return true;
  if (BARE_ANAPHORA.test(q)) return true;
  if (/^why is it\b/.test(q)) return true;
  return false;
}

/** Genuine linguistic dependence on the prior turn — market only with market context. */
export function isLinguisticMarketFollowUp(text: string, ctx?: MentorIntentContext): boolean {
  const q = normalizeConversationalText(text);
  if (!q) return false;
  if (isInvalidationConditionQuestion(text) || isInvalidationConditionQuestion(q)) return true;
  if (isInvalidationStatusQuestion(text) || isInvalidationStatusQuestion(q)) return true;
  if (MARKET_ANAPHORA.test(q)) return true;
  if (/^what changed\b/.test(q) || /^what(?:'?s| is) different\b/.test(q)) return true;
  if (isBareAnaphoraFollowUp(text)) return contextLooksLikeMarket(ctx);
  return false;
}

/** Complete standalone request with its own topic — must not inherit prior market context. */
export function isStandaloneGeneralTurn(text: string): boolean {
  const repaired = repairConversationalStt(text);
  const q = normalizeConversationalText(repaired);
  if (!q || isUnintelligibleInput(q)) return false;
  if (isLinguisticMarketFollowUp(repaired)) return false;
  if (isInvalidationStatusQuestion(repaired) || isInvalidationStatusQuestion(q)) return false;
  if (isChartReadCommand(repaired) || isChartReadCommand(q)) return false;
  if (/^(what about|how about|and what about)\b/.test(q)) return false;
  // "Where's the last MSS?" / "Is there a REH near price?" are chart fact lookups — not sky-blue general.
  if (CHART_STRUCTURE_FACT_TERMS.test(q) && CHART_FACT_LOCATION_OR_PRESENCE.test(q)) {
    return false;
  }
  const isolatedMentor = classifyMentorIntent(repaired);
  if (isMentorMarketIntent(isolatedMentor) || isolatedMentor === "TEACHING") return false;
  if (MATH_REQUEST.test(q) || MATH_REQUEST.test(repaired)) return true;
  if (JOKE_REQUEST.test(q)) return true;
  if (INTERROGATIVE_OPENER.test(q) && wordCount(q) >= 3) return true;
  return false;
}

export function isUnintelligibleInput(text: string): boolean {
  const raw = String(text || "").trim();
  if (!raw) return true;
  const q = normalizeConversationalText(raw);
  if (!q) return true;
  if (UNINTELLIGIBLE.test(q)) return true;
  if (q.length <= 12 && !/[aeiouy]/i.test(q)) return true;
  if (/^[^a-z0-9]+$/i.test(q)) return true;
  return false;
}

function isVoiceDeskControlTurn(text: string): boolean {
  return VOICE_DESK_CONTROL.test(normalizeConversationalText(text));
}

function isSystemConnectionTurn(text: string): boolean {
  const q = normalizeConversationalText(text);
  if (SYSTEM_CONNECTION_TURN.test(q)) return true;
  return false;
}

function isGeneralChatTurn(q: string): boolean {
  if (JOKE_REQUEST.test(q) || PERSONA_OR_SMALLTALK.test(q) || PREFERENCE_CHAT.test(q)) return true;
  if (/\b(hello|hey|how are you|good morning)\b/.test(q) && wordCount(q) <= 6) return true;
  if (
    /\b(?:(?:make|start|have)\s+(?:a\s+)?conversation(?:\s+with\s+me)?|talk\s+to\s+me|keep\s+me\s+company|let'?s\s+chat|say\s+something(?:\s+interesting)?|ask\s+me\s+something|i'?m\s+bored|tell\s+me\s+something\s+interesting)\b/i.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

function mentorToMarketIntent(intent: MentorIntent, text: string): ConversationalIntent {
  if (intent === "EXPLAIN_PREVIOUS_MARKET_READ" || intent === "INVALIDATION" || intent === "WAIT_EXPLANATION") {
    if (isLinguisticMarketFollowUp(text) || intent === "EXPLAIN_PREVIOUS_MARKET_READ") {
      return "MARKET_FOLLOWUP";
    }
  }
  if (
    intent === "CHANGE_ANALYSIS" ||
    intent === "WATCH_NEXT" ||
    intent === "BIAS_EXPLANATION" ||
    intent === "LIQUIDITY_EXPLANATION"
  ) {
    if (isLinguisticMarketFollowUp(text)) return "MARKET_FOLLOWUP";
  }
  return "MARKET_ANALYSIS";
}

/** Classify a user turn for routing. Context may inform follow-ups; it must not override a standalone request. */
export function classifyConversationalIntent(
  text: string,
  ctx?: MentorIntentContext
): ConversationalIntent {
  const repaired = repairConversationalStt(text);
  const q = normalizeConversationalText(repaired);
  if (!q) return "AMBIGUOUS";

  if (isSystemConnectionTurn(repaired)) return "SYSTEM_CONNECTION";
  if (isVoiceDeskControlTurn(repaired)) return "VOICE_DESK_CONTROL";
  if (isUnintelligibleInput(repaired)) return "AMBIGUOUS";

  // Unambiguous new topic wins over sticky prior market context.
  if (isStandaloneGeneralTurn(repaired)) {
    if (isGeneralChatTurn(q)) return "GENERAL_CHAT";
    return "GENERAL_KNOWLEDGE";
  }

  if (isBareAnaphoraFollowUp(repaired)) {
    if (contextLooksLikeMarket(ctx)) return "MARKET_FOLLOWUP";
    if (contextLooksLikeGeneral(ctx)) return "GENERAL_KNOWLEDGE";
    return "GENERAL_KNOWLEDGE";
  }

  const mentor = classifyMentorIntent(repaired, ctx);
  if (isMentorMarketIntent(mentor) || mentor === "TEACHING") {
    return mentorToMarketIntent(mentor, repaired);
  }

  if (isLinguisticMarketFollowUp(repaired, ctx)) {
    return contextLooksLikeMarket(ctx) ? "MARKET_FOLLOWUP" : "GENERAL_KNOWLEDGE";
  }

  if (isChartReadCommand(repaired)) return "MARKET_ANALYSIS";
  if (isGeneralChatTurn(q)) return "GENERAL_CHAT";
  if (INTERROGATIVE_OPENER.test(q)) return "GENERAL_KNOWLEDGE";
  return "GENERAL_CHAT";
}

export function isGeneralKnowledgeIntent(intent: ConversationalIntent): boolean {
  return intent === "GENERAL_KNOWLEDGE";
}

export function isMarketRoutingIntent(intent: ConversationalIntent): boolean {
  return intent === "MARKET_ANALYSIS" || intent === "MARKET_FOLLOWUP";
}

/** Connection / extension-messaging failures are not intent misses. */
export function connectionFailureKind(err: unknown): "invalidated" | "receiving_end" | null {
  return classifyExtensionMessagingFailure(err);
}

export function isConnectionFailureNotIntentMiss(err: unknown): boolean {
  return isExtensionMessagingFailure(err);
}
