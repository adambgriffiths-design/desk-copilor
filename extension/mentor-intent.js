/** Mentor-turn classifier — mirrors lib/mentor-intent.ts */
(function () {
const MARKET_INTENTS = new Set([
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

function repairInformalContractions(text) {
  return String(text || "")
    .replace(/\bwhats\b/gi, "what's")
    .replace(/\bwhos\b/gi, "who's")
    .replace(/\bwheres\b/gi, "where's")
    .replace(/\bwhens\b/gi, "when's")
    .replace(/\bhows\b/gi, "how's");
}

function normalizeMentorText(text) {
  return repairInformalContractions(String(text || ""))
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[?!.,]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(LEAD_IN, "")
    .trim();
}

function isMentorMarketIntent(intent) {
  return !!intent && MARKET_INTENTS.has(intent);
}

function isMentorMarketTurn(text, ctx) {
  return isMentorMarketIntent(classifyMentorIntent(text, ctx));
}

function teachingLengthFor(
  text,
  intent,
  analysisDepth
) {
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

function spokenCapForLength(length) {
  switch (length) {
    case "DEEP":
      return { maxSentences: 8, maxChars: 1400 };
    case "NORMAL":
      return { maxSentences: 5, maxChars: 900 };
    default:
      return { maxSentences: 2, maxChars: 320 };
  }
}

function spokenCapOptions(text, ctx) {
  return spokenCapForLength(teachingLengthFor(text, classifyMentorIntent(text, ctx)));
}

/** Status of a previously mentioned fact — not “what would invalidate”. */
function isInvalidationStatusQuestion(text) {
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
function isInvalidationConditionQuestion(text) {
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

function isBareMentorFollowUp(text) {
  const q = normalizeMentorText(text);
  return /^(why|how come|explain that|what does that mean|why though|and that|but why|why is that|why is it)$/.test(
    q
  );
}

function assistantLooksLikeMarket(text) {
  const a = String(text || "");
  if (!a.trim()) return false;
  if (/\[(structure|gaps|liquidity|session|bias|market_state)\./i.test(a)) return true;
  if (/\[[a-z0-9_.]+\]/i.test(a) && /\b(verdict|wait|no trade|long|short|stand aside|bias|entry zone|invalidation)\b/i.test(a)) {
    return true;
  }
  if (
    /\b(right now i(?:'m| am) seeing|i(?:'m| am) waiting because|what would change my mind|here(?:'s| is) what i(?:'d| would) watch)\b/i.test(
      a
    )
  ) {
    return true;
  }
  if (/\b(verdict|wait|no trade|long|short|stand aside|bias|entry zone|invalidation)\b/i.test(a) && /\b(VERDICT|Bias|Entry|Wait|Long|Short)\b/i.test(a)) {
    return true;
  }
  if (/\b(MSS|NWOG|NDOG|FVG|market structure shift)\b/i.test(a) && /\b\d{4,5}(?:\.\d+)?\b/.test(a)) {
    return true;
  }
  if (
    /\b(wait(?:ing)?|stay flat|stand aside|no trade|sweep|bias|mss|verdict|nasdaq|structure|invalidat|fair value|equal high|liquidity|right now i(?:'m| am) seeing)\b/i.test(
      a
    )
  ) {
    return true;
  }
  return false;
}

function inferLastTurnCategory(messages) {
  const list = messages || [];
  if (!list.length) return "UNKNOWN";
  let assistant = "";
  let priorUser = "";
  for (let i = list.length - 1; i >= 0; i--) {
    const msg = list[i];
    if (msg.role === "assistant" && !assistant) assistant = msg.content || "";
    else if (msg.role === "user" && assistant && !priorUser) {
      priorUser = msg.content || "";
      break;
    }
  }
  if (!assistant) return "UNKNOWN";
  if (assistantLooksLikeMarket(assistant)) return "MARKET";
  if (priorUser) {
    const qu = normalizeMentorText(priorUser);
    if (/\b(tell me a joke|say a joke|make me laugh)\b/.test(qu)) return "GENERAL_CHAT";
    if (/^(hi|hello|hey|how are you|thanks|thank you)\b/.test(qu)) return "GENERAL_CHAT";
    if (/^(what(?:'?s)?|who(?:'?s)?|where(?:'?s)?|when(?:'?s)?|why|how(?:'?s)?|which|tell me|explain|describe|define|can you|could you|do you know|is there|are there)\b/.test(qu)) {
      return "GENERAL_KNOWLEDGE";
    }
    if (/\d+\s*[x×*+/÷-]\s*\d+/.test(qu)) return "GENERAL_KNOWLEDGE";
  }
  return "GENERAL_KNOWLEDGE";
}

function lastTurnWasGeneralCategory(category) {
  return category === "GENERAL_KNOWLEDGE" || category === "GENERAL_CHAT";
}

function lastTurnWasMarket(ctx) {
  if (!ctx) return false;
  if (lastTurnWasGeneralCategory(ctx.lastTurnCategory)) return false;
  if (ctx.lastTurnCategory === "MARKET") return true;
  const a = String(ctx.lastAssistant || "");
  if (!assistantLooksLikeMarket(a)) return false;
  if (isMentorMarketIntent(ctx.lastMentorIntent)) return true;
  if (ctx.lastFactIds?.length) return true;
  if (ctx.lastTopic) return true;
  return true;
}

function hasNonMarketDomain(q) {
  if (NON_MARKET_DOMAIN.test(q)) return true;
  if (/\b(happening|going on)\s+(in|at|with)\s+/.test(q)) {
    if (/\b(market|chart|session|mnq|nasdaq|futures|price|setup|trade|this|here)\b/.test(q)) return false;
    if (SESSION_PLACE.test(q) && !/\b(paris|berlin|tokyo|rome|weather)\b/.test(q)) return false;
    return true;
  }
  return false;
}

function isIdentityOnly(q) {
  if (/^(who are you|what are you|what is your name|what's your name|who is karen)$/.test(q)) {
    return true;
  }
  if (/^what are you(?: anyway| exactly| then)?$/.test(q)) return true;
  if (/\b(tell me about yourself|introduce yourself|describe yourself)\b/.test(q)) return true;
  if (/\bwhat are you\b/.test(q) && !/\b(seeing|looking|thinking|watching|reading|picking up)\b/.test(q)) {
    // Social check-ins ("what are you up to / doing") — not market reads.
    if (/\bwhat are you (a|an|doing|into|up to)\b/.test(q)) return true;
  }
  return false;
}

function isCurrentMarketRead(q) {
  if (isIdentityOnly(q)) return false;
  if (hasNonMarketDomain(q)) return false;
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
  if (/\bwhat(?:'s| is) the read\b/.test(q)) return true;
  if (/\bread on the (?:chart|market)\b/.test(q)) return true;
  if (
    /^(?:get the read|give me (?:a |the )?read|give me (?:a |the )?(?:market |chart )?read|market read)$/.test(
      q
    )
  ) {
    return true;
  }
  if (/\bgive me (?:a |the )?(?:market |chart )?read\b/.test(q)) {
    return true;
  }
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

function isChangeAnalysis(q) {
  if (/\bwhat(?:'s| has| is)? changed\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) different\b/.test(q)) return true;
  if (/\bsince (?:before|last time|the last|five minutes|a few minutes|just now)\b/.test(q) && /\b(chang|different|update)\b/.test(q)) {
    return true;
  }
  if (/\bwhy did (?:your|the) (?:view|read|bias|call) change\b/.test(q)) return true;
  if (/\bwhat changed just now\b/.test(q)) return true;
  return false;
}

function isWatchNext(q) {
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

function isLiquidityExplanation(q) {
  if (/\b(eqh|eql|equal high|equal low|relative equal)\b/.test(q)) return false;
  if (/\bwhy\b/.test(q) && /\bliquidity\b/.test(q)) return true;
  if (/\bwhy is (?:that|this|the) liquidity\b/.test(q)) return true;
  if (/\bwhy does (?:that|this) liquidity matter\b/.test(q)) return true;
  if (/\bwhich liquidity\b/.test(q)) return true;
  if (/\bwhat liquidity\b/.test(q) && /\b(matter|important|watch)\b/.test(q)) return true;
  if (/\bliquidity matters most\b/.test(q)) return true;
  return false;
}

function isEqhExplanation(q) {
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

function isBiasExplanation(q) {
  if (GLOSSARY_TEACHING.test(q) && /\bwhat is (?:a |an )?bias\b/.test(q)) return false;
  if (/\bwhat(?:'s| is) your bias\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) the bias\b/.test(q) && !/\bwhat is bias\b/.test(q)) return true;
  if (/\bwhich way are you leaning\b/.test(q)) return true;
  if (/\b(?:are you|you) (?:bullish|bearish|long|short)\b/.test(q) && !/\bwhy\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) your (?:lean|directional (?:view|call))\b/.test(q)) return true;
  return false;
}

function isExplainPreviousMarketRead(text, ctx) {
  const q = normalizeMentorText(text);
  if (!q || hasNonMarketDomain(q) || isIdentityOnly(q)) return false;
  if (isInvalidationConditionQuestion(text) || isChangeAnalysis(q) || isLiquidityExplanation(q)) {
    return false;
  }
  if (/\bwhy are you leaning\b/.test(q) || /\bleaning that way\b/.test(q)) return true;
  if (/\bwhy (?:bullish|bearish|long|short)\b/.test(q)) return true;
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

function shouldRefreshMarketState(intent, ctx) {
  if (intent === "EXPLAIN_PREVIOUS_MARKET_READ") return false;
  const hasPriorRead = Boolean(String((ctx && ctx.lastAssistant) || "").trim());
  if (hasPriorRead && lastTurnWasMarket(ctx)) {
    if (
      intent === "WAIT_EXPLANATION" ||
      intent === "BIAS_EXPLANATION" ||
      intent === "INVALIDATION" ||
      intent === "EQH_EQL_EXPLANATION" ||
      intent === "LIQUIDITY_EXPLANATION" ||
      intent === "CHANGE_ANALYSIS"
    ) {
      return false;
    }
  }
  return true;
}

function isWaitExplanation(q) {
  if (/\bwhy are you waiting\b/.test(q)) return true;
  if (/\bwhy (?:wait|are we waiting|no trade|stand aside|stay (?:flat|out))\b/.test(q)) return true;
  if (/\bwhy (?:aren't|are not|isn'?t) you\b/.test(q) && /\b(directional|calling|long|short)\b/.test(q)) {
    return true;
  }
  if (/\bwhat(?:'s| is) keeping you (?:flat|out|waiting)\b/.test(q)) return true;
  return false;
}

function isStructureWalkthrough(q) {
  if (/\bwalk me through\b/.test(q)) return true;
  if (/\bexplain (?:the |this |current )?(?:chart|structure|setup|market)\b/.test(q)) return true;
  if (/\bbreak down (?:the |this |current )?(?:market )?structure\b/.test(q)) return true;
  if (/\bbreak down (?:the |this )?(?:chart|setup)\b/.test(q)) return true;
  return false;
}

function isScenario(q) {
  if (/\b(bull vs bear|both sides|either side|compare (?:the )?cases)\b/.test(q)) return true;
  if (/\bwhat if (?:it |price )?(?:breaks|sweeps|holds|fails)\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) the (?:bull|bear) (?:case|scenario)\b/.test(q)) return true;
  return false;
}

function isTeaching(q) {
  if (/\bwhat is (?:a |an )?(?:mss|fvg|nwog|ndog|org|ict)\b/.test(q)) return true;
  if (GLOSSARY_TEACHING.test(q) && !/\b(your bias|current|right now|on (?:the )?chart|where is)\b/.test(q)) {
    return true;
  }
  if (/\bexplain that like i(?:'m| am) learning ict\b/.test(q)) return true;
  return false;
}

function resolveFollowUp(q, ctx) {
  if (!lastTurnWasMarket(ctx)) return null;
  if (isEqhExplanation(q)) return "EQH_EQL_EXPLANATION";
  if (isInvalidationConditionQuestion(q) || /\bwhat would invalidate that\b/.test(q)) {
    return "INVALIDATION";
  }
  if (isLiquidityExplanation(q)) return "LIQUIDITY_EXPLANATION";
  if (isChangeAnalysis(q)) return "CHANGE_ANALYSIS";
  if (isExplainPreviousMarketRead(q, ctx) || isBareMentorFollowUp(q) || /^why$/.test(q)) {
    const last = ctx?.lastMentorIntent;
    if (last === "WAIT_EXPLANATION" || /\bwait|stand aside|stay flat\b/i.test(ctx?.lastAssistant || "")) {
      if (isBareMentorFollowUp(q) || /^why$/.test(q) || /\bwhy are you waiting\b/.test(q)) {
        return "WAIT_EXPLANATION";
      }
    }
    if (last === "EQH_EQL_EXPLANATION" && /\b(eqh|eql|equal)\b/.test(q)) return "EQH_EQL_EXPLANATION";
    if (last === "CHANGE_ANALYSIS" && isChangeAnalysis(q)) return "CHANGE_ANALYSIS";
    if (last === "LIQUIDITY_EXPLANATION" && isLiquidityExplanation(q)) return "LIQUIDITY_EXPLANATION";
    return "EXPLAIN_PREVIOUS_MARKET_READ";
  }
  return null;
}

/** Classify a spoken/chat turn into a mentor intent. */
function classifyMentorIntent(text, ctx) {
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
  if (isWaitExplanation(q)) return "WAIT_EXPLANATION";
  if (isWatchNext(q)) return "WATCH_NEXT";
  if (isExplainPreviousMarketRead(q, ctx)) return "EXPLAIN_PREVIOUS_MARKET_READ";
  if (isBiasExplanation(q)) return "BIAS_EXPLANATION";
  if (isStructureWalkthrough(q)) return "STRUCTURE_EXPLANATION";
  if (isScenario(q)) return "SCENARIO_ANALYSIS";
  if (isCurrentMarketRead(q)) return "CURRENT_MARKET_READ";

  return "GENERAL_CHAT";
}

function mentorIntentSlug(intent) {
  return intent.toLowerCase();
}

function voiceChannelInstructionsFor(length) {
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

  window.DeskCopilotMentor = {
    normalizeMentorText,
    isMentorMarketIntent,
    isMentorMarketTurn,
    teachingLengthFor,
    spokenCapForLength,
    spokenCapOptions,
    isInvalidationStatusQuestion,
    isInvalidationConditionQuestion,
    isBareMentorFollowUp,
    assistantLooksLikeMarket,
    inferLastTurnCategory,
    classifyMentorIntent,
    mentorIntentSlug,
    isExplainPreviousMarketRead,
    shouldRefreshMarketState,
    mentorContextFromMessages: function (messages, lastMentorIntent) {
      const list = messages || [];
      const lastAssistant = [...list].reverse().find((m) => m.role === "assistant")?.content;
      const users = list.filter((m) => m.role === "user");
      const priorUser = users.length >= 2 ? users[users.length - 2]?.content : undefined;
      return {
        lastMentorIntent,
        lastAssistant,
        lastUser: priorUser,
        lastTurnCategory: inferLastTurnCategory(list),
      };
    },
  };
})();
