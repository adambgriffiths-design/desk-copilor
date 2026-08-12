import { isChartReadCommand } from "@/lib/chart-read-intent";
import { isChartStatusQuestion } from "@/lib/chart-question-intent";
import { blocksCasualFallback } from "@/lib/pending-request";
import { isIdentityQuestion, isPersonaQuestion, needsWebSearch } from "@/lib/web-search-intent";
import { userMemoryReply } from "@/lib/desk-memory";
import { stripAssistantNamePrefix } from "@/lib/desk-persona";

const TRADING_WORDS =
  /\b(mnq|nasdaq|futures|chart|bias|entry|target|pdh|pdl|fvg|fair value gap|level|price|trade|long|short|support|resistance|setup|verdict|read the chart|get the read|session|liquidity|displacement|mss|market structure|structure shift|order block|opening range|premium|discount|ndog|nwog|kill zone|choch|change of character)\b/i;

const CHART_READ_COMMANDS =
  /\b(get the read|full read|what do you see|mark levels|draw levels|show levels|strip levels|should i (buy|sell|trade|long|short)|give me a read|market read|quick read|what'?s the move)\b/i;

const SOCIAL_OPENER_PREFIX =
  /^(?:i'?m\s+(?:good|fine|great|well|ok|okay|doing\s+(?:good|well|fine|great)|alright)|doing\s+(?:good|well|fine|great)|(?:good|fine|great|well|ok|okay|alright)(?:\s+thanks|\s+thank\s+you)?)(?:[.!?]+|\s*,)\s*/i;

export function stripSocialOpener(text: string): string {
  let t = String(text || "").trim();
  if (!t) return t;
  let prev = "";
  while (t !== prev) {
    prev = t;
    t = t.replace(SOCIAL_OPENER_PREFIX, "").trim();
    t = t.replace(/^(?:and|but|so|also)\s+/i, "").trim();
  }
  return t || prev;
}

/** Strip greetings and small-talk lead-ins before routing. */
export function normalizeDeskQuestion(text: string): string {
  return stripSocialOpener(stripLeadingGreeting(String(text || "").trim()));
}

function isBiasDirectionQuestion(text: string): boolean {
  return (
    /\b(bullish|bearish)\b/.test(text) &&
    /\b(it|market|chart|bias|mnq|nasdaq|futures|price|we|this)\b/.test(text)
  );
}

export function isClearlyTrading(text: string): boolean {
  const core = normalizeDeskQuestion(text).toLowerCase();
  const raw = text.trim().toLowerCase();
  if (!core && !raw) return false;
  if (isChartStatusQuestion(core) || isChartStatusQuestion(raw)) return true;
  if (isBiasDirectionQuestion(core) || isBiasDirectionQuestion(raw)) return true;
  return TRADING_WORDS.test(core) || TRADING_WORDS.test(raw) || CHART_READ_COMMANDS.test(core) || CHART_READ_COMMANDS.test(raw);
}

/** v1.4.0+ casual gate — anything not clearly trading routes to casual LLM. */
export function isNonTradingConversation(text: string): boolean {
  const q = normalizeDeskQuestion(text);
  if (!q || q.length < 2) return false;
  if (isChartReadCommand(q)) return false;
  if (isClearlyTrading(q)) return false;
  return true;
}

const FOOD_WORDS =
  /\b(mcdonald'?s?|kfc|wendy'?s?|burger king|taco bell|chipotle|subway|pizza hut|domino'?s?|starbucks|dunkin|chick-fil-a|chick fil a|popeyes|five guys|in-n-out|shake shack|arby'?s?|sonic|whataburger|panda express|nando'?s?|chinese|thai|indian|sushi|takeout|takeaway|delivery|burger|pizza|coffee|taco|food|hungry|eat|fries|chicken|wings|nuggets|lunch|dinner|breakfast|snack|gelato|limoncello)\b/i;

const TRAVEL_WORDS =
  /\b(travel|trip|vacation|holiday|visit|coast|beach|italy|italian|amalfi|positano|capri|rome|florence|best thing to do|things to do)\b/i;

const COLOR_NAMES =
  /\b(red|blue|green|navy|yellow|purple|pink|orange|black|white|crimson|teal|gold|silver|maroon|beige|grey|gray|violet|indigo)\b/i;

const FOOD_ORDER_Q =
  /\bwhat('s| is) your\b.*\b(order|takeout|takeaway|go-to|go to)\b|\b(order|get|getting)\b.*\b(chinese|food|takeout|takeaway|delivery|usual)\b|\b(chinese|thai|indian|sushi)\b.*\border\b/i;

const STEER_BACK_CUT =
  /\b(now,?\s*)?back on track\b|\b(let'?s|we should) (get back|return|turn|go back)\b|\bdo you want a read\b|\bwant a read on\b|\b(shall we|should we) (look at|check) the chart\b|\bexplore next on the chart\b|\bback to (the )?(chart|market|desk|nasdaq)\b/i;

const GENERIC_REPLIES =
  /\b(fair question|easy either way|i'm easy|either way works|good question|can't help you there|cannot help you there|i'm not able to help with that)\b/i;

const AI_REFUSAL =
  /\b(as an ai|i'm an ai|i am an ai|language model)\b|\bi'm here to help\b.*\b(trading|market|chart|read)\b|\bif you have any trading questions\b|\bneed a market read\b/i;

const PIZZA_PIVOT =
  /\b(speaking of pizza|let'?s talk pizza|how about pizza|pizza instead)\b/i;

const LEADING_GREETING_PREFIX =
  /^(?:hi|hello|hey|sup|good morning|good evening|good afternoon|what's up|whats up)(?:[,.!?]|\s)+/i;

const LEADING_GREETING_BARE =
  /^(?:hi|hello|hey|sup)\s+(?=(?:what|who|where|when|why|how|tell|do|can|could|is|are|weather|what's|whats|my name))/i;

const GREETING_TAIL =
  /^(?:how are you|how's it going|how is your day(?: going)?|how's your day(?: going)?|how was your day|what's up|whats up)(?:[.!?,?\s]*)$/i;

const PURE_GREETING =
  /^(?:hi|hello|hey|sup|how are you|how's it going|how is your day|how's your day|how was your day|what's up|whats up|good morning|good evening|good afternoon)(?:[.!?,?\s]*)$/i;

export function stripLeadingGreeting(text: string): string {
  let t = String(text || "").trim();
  if (!t) return t;
  let prev = "";
  while (t !== prev) {
    prev = t;
    if (LEADING_GREETING_PREFIX.test(t)) {
      t = t.replace(LEADING_GREETING_PREFIX, "").trim();
      continue;
    }
    if (LEADING_GREETING_BARE.test(t)) {
      t = t.replace(/^(?:hi|hello|hey|sup)\s+/i, "").trim();
    }
  }
  return t;
}

export function isGreeting(q: string): boolean {
  const t = q.trim().toLowerCase().replace(/[.!?,]+$/, "");
  if (!t) return false;
  const remainder = stripLeadingGreeting(t).toLowerCase().replace(/[.!?,]+$/, "");
  if (remainder !== t && remainder.length >= 2) {
    return GREETING_TAIL.test(remainder);
  }
  return PURE_GREETING.test(t);
}

function isLikelyGreetingMisheard(q: string): boolean {
  const t = q.trim().toLowerCase().replace(/[.!?,]+$/, "");
  return /^(bye|by|buy)$/.test(t);
}

export function isFarewell(q: string): boolean {
  if (/\b(goodbye|good bye|see you|see ya|catch you|take care|good night|gotta go|signing off|talk later)\b/.test(q)) {
    return true;
  }
  return /^bye[.!]?$/.test(q.trim());
}

function looksCasualPhrase(q: string): boolean {
  return (
    /\b(do you like|you like|favorite|favourite|would you order|what would you get|what about|what do you think|what'?s your thoughts|thoughts on|which one|better)\b/.test(
      q
    ) ||
    FOOD_ORDER_Q.test(q) ||
    /\bwhat('s| is) your\b/.test(q) ||
    /\b(colou?r)\b/.test(q) ||
    FOOD_WORDS.test(q) ||
    /\b(be like|act like|talk like|speak like|imagine you'?re)\b/.test(q) ||
    /\b(how are you|how's it going|how is your day|how's your day|what's up|whats up|good morning|good evening|good afternoon|hello|hey|hi|thanks|thank you|sup)\b/.test(
      q
    ) ||
    /\b(joke|funny|movie|music|sport|nba|football|weekend|vacation|holiday|band|song|artist|game|team|travel|trip|coast|beach|italy|amalfi)\b/.test(
      q
    ) ||
    /\b(you ever|have you ever|did you|would you|what would you)\b/.test(q) ||
    (/\b(like|love|hate|prefer|enjoy)\b/.test(q) &&
      !/\b(look|chart|trade|setup|read|level|price|bias)\b/.test(q))
  );
}

function recentCasualContext(recentText: string): boolean {
  return FOOD_WORDS.test(recentText) || TRAVEL_WORDS.test(recentText) || looksCasualPhrase(recentText);
}

function recentTopic(recentText: string): string {
  if (/\bmcdonald|kfc|burger|pizza|taco|chinese|food|eat|hungry|fries|chicken\b/.test(recentText)) {
    return "food";
  }
  if (/\bmusic|song|band|artist|hip-hop|rap\b/.test(recentText)) return "music";
  if (/\bjoke|funny\b/.test(recentText)) return "joke";
  if (/\bhello|hey|how are you|how's your day\b/.test(recentText)) return "greeting";
  if (/\bsport|nba|football|game|team\b/.test(recentText)) return "sport";
  if (/\bcolou?r\b/.test(recentText)) return "color";
  return "general";
}

function isCasualFollowUp(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(what about|and what|how about|how come|tell me more|go on|you think|same|why|really|true|agree|which one)\b/.test(
      t
    ) ||
    /\b(you|that|it)\s*(right|correct|agree|think so)\b/.test(t) ||
    /\b(nice|good|solid|true|facts|fair|same|me too|agreed|lol|haha|yeah|yep|sure)\b/.test(t) ||
    /\bwhat do you think\b/.test(t)
  );
}

export function isGeneralConversation(text: string): boolean {
  const q = stripLeadingGreeting(text).trim().toLowerCase();
  if (!q || q.length < 2) return false;
  if (isChartReadCommand(q)) return false;
  if (isClearlyTrading(q)) return false;
  if (isPersonaQuestion(q)) return true;
  if (needsWebSearch(q)) return true;
  if (/\?\s*$/.test(q)) return true;
  if (
    /^(what|who|where|when|why|how|tell me|explain|describe|define|can you|could you|do you know|is there|are there)\b/i.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(recommend|suggestion|best|top \d|favorite|favourite)\b/i.test(q)) return true;
  return false;
}

export function isCasualChat(text: string, recentMessages?: string): boolean {
  const q = stripLeadingGreeting(text).trim().toLowerCase();
  if (!q || q.length < 2) return false;
  if (isGreeting(text) || isLikelyGreetingMisheard(q) || isFarewell(q)) return true;
  if (/\b(?:my name'?s|my name is|call me)\s+[a-z]/i.test(q)) return true;
  if (needsWebSearch(q)) return true;
  if (isChartReadCommand(q)) return false;
  if (isClearlyTrading(q)) return false;
  if (looksCasualPhrase(q)) return true;
  if (/\bwhat about\b/.test(q) && recentMessages && recentCasualContext(recentMessages)) {
    return true;
  }
  if (/\b(and|or|vs|versus|better)\b/.test(q) && FOOD_WORDS.test(q)) return true;
  if (recentMessages && recentCasualContext(recentMessages)) {
    if (CHART_READ_COMMANDS.test(q)) return false;
    if (isChartReadCommand(q)) return false;
    if (isClearlyTrading(q)) return false;
    if (
      /\b(what about|and what|how about|you think|same|why|really|true|agree|which one)\b/.test(q) ||
      FOOD_WORDS.test(q) ||
      isCasualFollowUp(q)
    ) {
      return true;
    }
  }
  if (isGeneralConversation(text)) return true;
  return false;
}

export function isInCasualThread(
  messages: { role: string; content: string }[]
): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return false;
  const recentText = messages
    .slice(-6)
    .map((m) => m.content)
    .join(" ");
  return isCasualChat(lastUser.content, recentText);
}

const STALE_FOLLOWUP =
  /\bteam hot food over sad desk snacks\b|\bsomething with a beat — keeps me awake\b|\bstill team navy\b/i;

export function isGenericCasualReply(text: string): boolean {
  if (isNameIntroReply(text)) return false;
  const t = text.trim().toLowerCase();
  return GENERIC_REPLIES.test(t) || AI_REFUSAL.test(t) || PIZZA_PIVOT.test(t);
}

export function isStaleCasualMismatch(text: string, question: string): boolean {
  const t = text.trim().toLowerCase();
  const q = stripLeadingGreeting(question).trim().toLowerCase();
  if (!STALE_FOLLOWUP.test(t)) return false;
  // Only replace canned follow-ups when the question clearly isn't casual anymore.
  if (needsWebSearch(q) || /\b(weather|temperature|forecast|news|score)\b/.test(q)) return true;
  if (isClearlyTrading(q)) return true;
  return false;
}

export function stripSteerBack(text: string): string {
  const t = stripAssistantNamePrefix(text);
  if (!t) return "";
  const m = t.match(STEER_BACK_CUT);
  if (!m || m.index == null) return t;
  return t.slice(0, m.index).replace(/[\s,;—-]+$/, "").trim();
}

export function isNameIntroReply(text: string): boolean {
  return /^nice to meet you,\s+[a-z][a-z'-]{0,30}!/i.test(String(text || "").trim());
}

export function nameIntroReply(question: string): string | null {
  const m = question.trim().match(/\b(?:my name'?s|my name is|call me)\s+([a-z][a-z'-]{1,30})\b/i);
  if (!m?.[1]) return null;
  const name = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return `Nice to meet you, ${name}! What's up?`;
}

export function isTradingRedirect(text: string): boolean {
  if (isNameIntroReply(text)) return false;
  const t = text.toLowerCase();
  return (
    STEER_BACK_CUT.test(t) ||
    PIZZA_PIVOT.test(t) ||
    /\b(focused on assisting|focused on charts|here to help with|micro e-mini nasdaq|ask anything about.*nasdaq)\b/.test(
      t
    ) ||
    /\b(let'?s turn to|turn to the nasdaq|on the nasdaq futures chart)\b/.test(t) ||
    /\b(if you have any questions about.*(market|chart|trade|futures))\b/.test(t) ||
    /\b(if you have any trading questions)\b/.test(t) ||
    AI_REFUSAL.test(t) ||
    /\b(just ask|feel free to ask).*(chart|market|trade|futures|nasdaq)\b/.test(t)
  );
}

function identityReply(): string {
  return "Your desk co-pilot.";
}

function personaReply(): string {
  return "I'm your desk co-pilot. Warm, direct, a little witty: chart reads and levels when you need them, or just chat when you don't.";
}

function personaReplyFor(q: string): string {
  if (/\b(tell me about yourself|introduce yourself|describe yourself|what are you)\b/.test(q)) {
    return personaReply();
  }
  return identityReply();
}

/** Karen opinion/preference — not identity; must never return the short identity stub. */
function karenPreferenceReply(q: string): string | null {
  const orMatch = q.match(/\b(?:do you|would you)\s+prefer\s+(.+?)\s+or\s+(.+?)[?.!]*$/i);
  if (orMatch) {
    const a = orMatch[1].trim();
    const b = orMatch[2].trim();
    if (FOOD_WORDS.test(q) || FOOD_WORDS.test(a) || FOOD_WORDS.test(b)) {
      if (/\bnugget/i.test(a) && /\bburger/i.test(b)) {
        return "Nuggets — easy desk food, less mess. Burger when I'm actually hungry.";
      }
      if (/\bburger/i.test(a) && /\bnugget/i.test(b)) {
        return "Burger — proper meal. Nuggets when I want something quick at the desk.";
      }
      const pick = a.length <= b.length ? a : b;
      const other = pick === a ? b : a;
      const label = pick.charAt(0).toUpperCase() + pick.slice(1);
      return `${label} — that's my pick, but ${other} is solid too.`;
    }
  }
  if (/\bdo you (like|prefer|enjoy|love)\b/.test(q) && FOOD_WORDS.test(q)) {
    return "Yeah — I'm always down for that. What's your go-to?";
  }
  if (/\bwhat('s| is) your (favorite|favourite)\b/.test(q) && FOOD_WORDS.test(q)) {
    return foodOrderReply(q) || "Burger and fries on a lazy day — what's yours?";
  }
  return null;
}

function topicFromQuestion(q: string): string | null {
  if (FOOD_WORDS.test(q) || FOOD_ORDER_Q.test(q)) return "food";
  if (/\bmusic|song|band|artist|hip-hop|rap\b/.test(q)) return "music";
  if (/\bjoke|funny\b/.test(q)) return "joke";
  if (/\bhello|hey|how are you|how's your day|what's up\b/.test(q)) return "greeting";
  return null;
}

function userPreferenceReply(q: string): string | null {
  const m = q.match(/\b(i|i'm|im)\s+(like|love|prefer|enjoy)\s+(.+?)[?.!]*$/i);
  if (!m) return null;
  const thing = m[3].replace(/\s+/g, " ").trim();
  if (!thing || thing.length > 40) return null;
  if (COLOR_NAMES.test(thing) || COLOR_NAMES.test(q)) {
    const color = (thing.match(COLOR_NAMES) || q.match(COLOR_NAMES))?.[0] || thing;
    const label = color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
    if (/^navy$/i.test(label)) return "Navy — great minds think alike.";
    return `${label}'s a solid pick — bold choice. I'm team navy but I get it.`;
  }
  return `Yeah — ${thing} is solid. I get the appeal.`;
}

function foodOrderReply(q: string): string | null {
  if (/\bchinese\b/.test(q)) {
    return "Sweet and sour chicken, egg fried rice, and spring rolls — my usual Chinese order.";
  }
  if (/\b(indian|curry)\b/.test(q)) {
    return "Chicken tikka masala, garlic naan, and pilau rice — that's the move.";
  }
  if (/\b(thai|sushi|japanese)\b/.test(q)) {
    return "Pad thai or a salmon roll set — depends how hungry I am.";
  }
  if (FOOD_ORDER_Q.test(q) || (/\border\b/.test(q) && FOOD_WORDS.test(q))) {
    return "Burger and fries on a lazy day, Chinese when I want variety — what's yours?";
  }
  return null;
}

function followUpReply(q: string, recentText: string): string {
  if (isIdentityQuestion(q)) return personaReplyFor(q);
  const prefReply = karenPreferenceReply(q);
  if (prefReply) return prefReply;
  const pref = userPreferenceReply(q);
  if (pref) return pref;
  const qTopic = topicFromQuestion(q);
  const topic = qTopic || (isCasualFollowUp(q) ? recentTopic(recentText) : "general");
  const foodAnswer = foodOrderReply(q);
  if (foodAnswer) return foodAnswer;
  if (/\bwhich one\b/.test(q)) {
    if (topic === "color") return "Navy blue — that's my pick. Clean and easy on the eyes at the desk.";
    if (topic === "food") return "Depends on the mood — burger if I'm hungry, wings if it's late.";
    if (topic === "music") return "Hip-hop when it's quiet, something heavier if I need a push.";
    return "Which one's yours? I'm curious where you land.";
  }
  if (/\b(you|that|it)\s*(right|correct|agree|think so)\b/.test(q) || /\bwhat do you think\b/.test(q)) {
    if (topic === "food") return "Yeah — I'm standing on it. Fast food hits different on a long session.";
    if (topic === "music") return "For sure — good background when the tape goes quiet.";
    return "Yeah, I'm with you on that.";
  }
  if (/\b(nice|good|solid|true|facts|fair|same|me too|agreed)\b/.test(q)) {
    if (topic === "food") return "Right? Nothing wrong with a desk lunch that hits.";
    if (topic === "music") return "Exactly — gotta have something on in the background.";
    return "Same energy.";
  }
  if (topic === "food") {
    if (FOOD_WORDS.test(q) || isCasualFollowUp(q)) {
      return "I'm still team hot food over sad desk snacks. What's your go-to?";
    }
    return "Ha — say more, I'm listening.";
  }
  if (topic === "music") {
    if (/\b(music|song|band|artist|beat)\b/.test(q) || isCasualFollowUp(q)) {
      return "Something with a beat — keeps me awake when the session drags.";
    }
    return "Ha — say more, I'm listening.";
  }
  if (topic === "greeting" && !qTopic) return "All good here — what's on your mind?";
  if (topic === "color") {
    if (isCasualFollowUp(q) && !userPreferenceReply(q)) {
      return "Still team navy — what's yours?";
    }
    return "Ha — say more, I'm listening.";
  }
  return "Ha — say more, I'm listening.";
}

export function sanitizeCasualReply(text: string, question: string, recentText?: string): string {
  const recent = recentText || "";
  const stripped = stripSteerBack(text);
  if (!stripped || stripped.length < 4) return casualChatFallback(question, recent);
  if (isTradingRedirect(stripped) || isGenericCasualReply(stripped)) {
    return casualChatFallback(question, recent);
  }
  if (isStaleCasualMismatch(stripped, question)) {
    return casualChatFallback(question, recent);
  }
  return stripped;
}

export function casualChatFallback(
  question: string,
  recentText?: string,
  messages?: { role: string; content: string }[]
): string {
  const q = stripLeadingGreeting(question).toLowerCase();
  const recent = recentText || "";

  if (messages?.length && blocksCasualFallback(question, messages)) {
    return "";
  }

  const intro = nameIntroReply(question);
  if (intro) return intro;

  const memReply = userMemoryReply(question);
  if (memReply) return memReply;

  if (/\bwhat('s| is) your (favorite|favourite)\s+food\b/.test(q)) {
    return "Burger and fries on a lazy day, Chinese when I want variety — what's yours?";
  }

  if (isIdentityQuestion(q)) return personaReplyFor(q);

  const karenPref = karenPreferenceReply(q);
  if (karenPref) return karenPref;

  const pref = userPreferenceReply(q);
  if (pref) return pref;

  const foodAnswer = foodOrderReply(q);
  if (foodAnswer) return foodAnswer;

  if (/\bkfc\b/.test(q)) {
    return "KFC — original recipe, extra crispy, mash and gravy. Hard to beat when you want chicken.";
  }
  if (/\bmcdonald/.test(q)) {
    return "Yeah — double quarter pounder, large fries, and a Coke. Every time.";
  }
  if (/\b(be like|act like).*(mcdonald|mcdonald'?s)\b/.test(q)) {
    return "Welcome to McDonald's — can I get you a Big Mac, two apple pies, and a large Sprite?";
  }
  if (/\b(wendy|burger king|taco bell|chipotle|popeyes|five guys|pizza|domino|starbucks)\b/.test(q)) {
    return "Solid pick — I'd grab whatever's fresh and not sitting under the heat lamp too long.";
  }
  if (/\bwhat about\b/.test(q) && FOOD_WORDS.test(q)) {
    return "Yeah — I'd give that a shot. Depends what you're in the mood for.";
  }
  if (/\bmusic\b|\bsong\b|\bartist\b/.test(q)) {
    return "Mostly hip-hop, some R&B when it's late — keeps the desk from feeling dead.";
  }
  if (/\b(do you like|you like)\b.*\bmusic\b/.test(q)) {
    return "Yeah — mostly hip-hop and something upbeat when it's quiet. What do you listen to?";
  }
  if (isLikelyGreetingMisheard(q)) {
    return "Hey — doing good, thanks. How's yours?";
  }
  if (isGreeting(question)) {
    if (/\bhow is your day|how's your day|how was your day\b/.test(q)) {
      return "Hey — day's going well, thanks for asking. How's yours?";
    }
    return "Hey — good to hear from you. What's up?";
  }
  if (/\bhello\b|\bhey\b|\bhi\b/.test(q)) {
    if (/\bhow is your day|how's your day\b/.test(q)) {
      return "Hey — day's going well, thanks for asking. How's yours?";
    }
    return "Hey — good to hear from you. What's up?";
  }
  if (/\bhow are you\b|\bhow is your day\b|\bhow's your day\b|\bhow's it going\b/.test(q)) {
    return "Doing good, thanks. How's yours?";
  }
  if (isFarewell(q)) {
    return "Later — shout if you need anything on the desk.";
  }
  if (/\bwhat's up\b|\bgood morning\b/.test(q)) {
    return "Not much — just vibing. What's good with you?";
  }
  if (/\bjoke\b|\bfunny\b/.test(q)) {
    return "Why did the trader bring a ladder to the desk? The market kept hitting new highs.";
  }
  if (/\b(coffee|tea|energy drink)\b/.test(q)) {
    return "Coffee — black when it's serious, iced when the day's long.";
  }
  if (/\b(hungry|lunch|dinner|food)\b/.test(q)) {
    return "Always down for something hot — burger, wings, whatever's closest.";
  }
  if (
    /\b(thoughts?|think|opinion).*\b(colou?r)\b|\b(favorite|favourite)\s+(colou?r)\b|\b(colou?r)\b.*\b(favorite|favourite|like|prefer)\b/.test(
      q
    )
  ) {
    return "Navy blue — easy on the eyes for long desk sessions. What's yours?";
  }
  if (/\bwhich one\b/.test(q) && recent) {
    return followUpReply(q, recent);
  }
  if (/\b(do you like|you like|favorite|favourite|prefer)\b/.test(q)) {
    const subject = q
      .replace(/.*(do you like|you like|favorite|favourite|prefer)\s*/i, "")
      .replace(/[?.!]+$/, "")
      .trim();
    if (subject && subject.length > 3 && subject.length < 30 && !/\b(colou?r|music|food)\b/.test(subject)) {
      return `Yeah — ${subject} is solid. I'd pick that over most things.`;
    }
  }
  if (recent && recentCasualContext(recent) && isCasualFollowUp(q) && !isPersonaQuestion(q) && !needsWebSearch(q)) {
    return followUpReply(q, recent);
  }
  return "Ha — say more, I'm listening.";
}
