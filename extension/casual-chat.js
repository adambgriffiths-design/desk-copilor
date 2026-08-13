/** Casual conversation — mirrored from lib/casual-chat-intent.ts + lib/web-search-intent.ts (v1.4.0) */
(function () {
  const CASUAL_LLM_FAILURE_REPLY =
    "I'm having trouble responding right now — try that again.";
  const CLARIFY_MORE_REPLY = "Ha — say more, I'm listening.";

  const TRADING_WORDS =
    /\b(mnq|nasdaq|futures|chart|bias|entry|target|pdh|pdl|fvg|fair value gap|level|price|trade|long|short|support|resistance|setup|verdict|read the chart|get the read|session|liquidity|displacement|mss|market structure|structure shift|order block|opening range|premium|discount|ndog|nwog|kill zone|choch|change of character|reh|rel|relative equal high|relative equal low|eqh|eql|equal high|equal low)\b/i;

  const CHART_READ_COMMANDS =
    /\b(get the read|full read|what do you see|mark levels|draw levels|show levels|strip levels|should i (buy|sell|trade|long|short)|give me a read|market read|quick read|what'?s the move)\b/i;

  const STEER_BACK_CUT =
    /\b(now,?\s*)?back on track\b|\b(let'?s|we should) (get back|return|turn|go back)\b|\bdo you want a read\b|\bwant a read on\b|\b(shall we|should we) (look at|check) the chart\b|\bexplore next on the chart\b|\bback to (the )?(chart|market|desk|nasdaq)\b/i;

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

  const WEATHER_GUESS_REPLY =
    /\b(don't keep up with the weather|can't keep up with the weather|don't really follow the weather|not up on the weather|up on the weather reports|don't have the weather|no weather reports|hope it'?s nice|always better with good weather|good weather\b|got any plans for the day|looking pretty nice|perfect for a stroll)\b|\b(probably (?:a bit )?(?:rain|sun|cloud|chilly|cold|warm|damp|wet|dry|overcast|grey|gray|miserable|nice))\b|\b(classic mix|might be|i bet it'?s|i imagine it|my guess is|likely (?:rain|sun|cloud|chilly|cold|warm))\b|\bah,?\s+got it!\b/i;

  const LIVE_WEATHER_REPLY =
    /\b\d+(?:\.\d+)?\s*°[cf]\b|\b\d+\s*(?:degrees|°)\b|\b(?:high|low|currently|now|around|about)\s*(?:at|of|near)?\s*\d+\b|\b(clear|overcast|cloudy|partly cloudy|mainly clear|rain|snow|drizzle|foggy|thunderstorm|showers|mixed conditions|feels like|humidity|wind|sunny|forecast)\b|'s at \d+(?:\.\d+)?°[cf]\b|\bfeels like \d+(?:\.\d+)?°[cf]\b/i;

  const SOCIAL_OPENER_PREFIX =
    /^(?:i'?m\s+(?:good|fine|great|well|ok|okay|doing\s+(?:good|well|fine|great)|alright)|doing\s+(?:good|well|fine|great)|(?:good|fine|great|well|ok|okay|alright)(?:\s+thanks|\s+thank\s+you)?)(?:[.!?]+|\s*,)\s*/i;

  const FOOD_WORDS =
    /\b(burger|pizza|taco|chicken|nuggets|wings|fries|food|hungry|eat|lunch|dinner|snack|mcdonald|kfc|wendy|takeout|takeaway)\b/i;

  function stripSocialOpener(text) {
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

  function normalizeDeskQuestion(text) {
    return stripSocialOpener(stripLeadingGreeting(String(text || "").trim()));
  }

  function isBiasDirectionQuestion(text) {
    return (
      /\b(bullish|bearish)\b/.test(text) &&
      /\b(it|market|chart|bias|mnq|nasdaq|futures|price|we|this)\b/.test(text)
    );
  }

  function isClearlyTrading(q) {
    const core = normalizeDeskQuestion(q).toLowerCase();
    const raw = String(q || "").trim().toLowerCase();
    if (!core && !raw) return false;
    if (typeof isChartStatusQuestion === "function" && (isChartStatusQuestion(core) || isChartStatusQuestion(raw))) {
      return true;
    }
    if (isBiasDirectionQuestion(core) || isBiasDirectionQuestion(raw)) return true;
    return TRADING_WORDS.test(core) || TRADING_WORDS.test(raw) || CHART_READ_COMMANDS.test(core) || CHART_READ_COMMANDS.test(raw);
  }

  function isNonTradingConversation(text) {
    const q = normalizeDeskQuestion(text);
    if (!q || q.length < 2) return false;
    if (typeof isChartReadCommand === "function" && isChartReadCommand(q)) return false;
    if (isClearlyTrading(q)) return false;
    return true;
  }

  function stripLeadingGreeting(text) {
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

  function isGreeting(text) {
    const t = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[.!?,]+$/, "");
    if (!t) return false;
    const remainder = stripLeadingGreeting(t).toLowerCase().replace(/[.!?,]+$/, "");
    if (remainder !== t && remainder.length >= 2) {
      return GREETING_TAIL.test(remainder);
    }
    return PURE_GREETING.test(t);
  }

  function isLikelyGreetingMisheard(text) {
    const q = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[.!?,]+$/, "");
    return /^(bye|by|buy)$/.test(q);
  }

  function isFarewell(text) {
    const q = String(text || "").trim().toLowerCase();
    if (/\b(goodbye|good bye|see you|see ya|catch you|take care|good night|gotta go|signing off|talk later|later)\b/.test(q)) {
      return true;
    }
    return /^bye[.!]?$/.test(q.trim());
  }

  function isGeneralConversation(text) {
    const q = stripLeadingGreeting(text).trim().toLowerCase();
    if (!q || q.length < 2) return false;
    if (typeof isChartReadCommand === "function" && isChartReadCommand(q)) return false;
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

  function isCasualMessage(text, _history) {
    return isNonTradingConversation(text);
  }

  function stripSteerBack(text) {
    const t = window.DeskCopilotPersona?.stripAssistantNamePrefix?.(text) ?? String(text || "").trim();
    if (!t) return "";
    const m = t.match(STEER_BACK_CUT);
    if (!m || m.index == null) return t;
    return t.slice(0, m.index).replace(/[\s,;—-]+$/, "").trim();
  }

  function isTradingRedirect(text) {
    if (isNameIntroReply(text)) return false;
    const t = String(text || "").toLowerCase();
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

  function isGenericReply(text) {
    if (isNameIntroReply(text)) return false;
    const t = String(text || "").toLowerCase();
    return AI_REFUSAL.test(t) || PIZZA_PIVOT.test(t);
  }

  function isGenericLocalReply(text) {
    return isGenericReply(text);
  }

  function isStaleCasualMismatch(_text, _question) {
    return false;
  }

  function nameIntroReply(q) {
    const m = String(q || "").match(/\b(?:my name'?s|my name is|call me)\s+([a-z][a-z'-]{1,30})\b/i);
    if (!m?.[1]) return null;
    const name = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    return `Nice to meet you, ${name}! What's up?`;
  }

  function isNameIntroReply(text) {
    return /^nice to meet you,\s+[a-z][a-z'-]{0,30}!/i.test(String(text || "").trim());
  }

  function isUserMemoryQuestion(text) {
    const q = normalizeWebSearchText(text);
    if (!q) return false;
    if (/\bwhat('s| is) my name\b/.test(q)) return true;
    if (/\bdo you (know|remember) my name\b/.test(q)) return true;
    if (/\bwhat did i (tell you|say) my name\b/.test(q)) return true;
    if (/\bwhat do you call me\b/.test(q)) return true;
    if (/\bwho am i\b/.test(q) && !/\b(trading|market|chart|nasdaq|futures)\b/.test(q)) return true;
    return false;
  }

  function userMemoryReply(question, memory) {
    if (!isUserMemoryQuestion(question)) return null;
    const name = memory?.userName ? String(memory.userName).trim() : "";
    const q = normalizeWebSearchText(question);
    if (
      /\bwhat('s| is) my name\b/.test(q) ||
      /\bdo you (know|remember) my name\b/.test(q) ||
      /\bwhat did i (tell you|say) my name\b/.test(q) ||
      /\bwhat do you call me\b/.test(q) ||
      /\bwho am i\b/.test(q)
    ) {
      if (name) return `You're ${name} — I've got you.`;
      return "You haven't told me yet — what should I call you?";
    }
    return null;
  }

  function karenPreferenceReply(q) {
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
    return null;
  }

  function localCasualReply(question, _history) {
    const q = stripLeadingGreeting(question).toLowerCase();
    const intro = nameIntroReply(question);
    if (intro) return intro;
    if (isUserMemoryQuestion(question)) {
      return "You haven't told me yet — what should I call you?";
    }
    if (isFarewell(q)) return "Later — shout if you need anything on the desk.";
    if (isLikelyGreetingMisheard(q)) {
      return "Hey — doing good, thanks. How's yours?";
    }
    if (isGreeting(question)) {
      if (/\bhow is your day|how's your day|how was your day\b/.test(q)) {
        return "Hey — day's going well, thanks for asking. How's yours?";
      }
      if (/\bhow are you|how's it going\b/.test(q)) {
        return "Doing good, thanks. How's yours?";
      }
      return "Hey — good to hear from you. What's up?";
    }
    if (/\bhow are you\b|\bhow's it going\b|\bhow is your day\b|\bhow's your day\b/.test(q)) {
      return "Doing good, thanks. How's yours?";
    }
    const karenPref = karenPreferenceReply(q);
    if (karenPref) return karenPref;
    if (isIdentityQuestion(q)) {
      if (/\b(tell me about yourself|introduce yourself|describe yourself|what are you)\b/.test(q)) {
        return "I'm your desk co-pilot. Warm, direct, a little witty: chart reads and levels when you need them, or just chat when you don't.";
      }
      return "Your desk co-pilot.";
    }
    if (isGeneralConversation(question)) {
      return CASUAL_LLM_FAILURE_REPLY;
    }
    return CLARIFY_MORE_REPLY;
  }

  function sanitizeCasualReply(text, question, _history) {
    const stripped = stripSteerBack(text);
    if (!stripped || stripped.length < 4) return localCasualReply(question);
    if (isIdentityQuestion(question) && isTradingRedirect(stripped)) {
      return localCasualReply(question);
    }
    if (isGenericReply(stripped)) return localCasualReply(question);
    return stripped;
  }

  function normalizeWebSearchText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/\s+/g, " ");
  }

  function isIdentityQuestion(q) {
    const text = normalizeWebSearchText(q);
    if (!text) return false;
    if (/\b(tell me about yourself|introduce yourself|describe yourself)\b/.test(text)) return true;
    if (/\b(who are you|what are you)\b/.test(text)) return true;
    if (/\bwhat('s| is) your (name|role|job|purpose)\b/.test(text)) return true;
    if (/\bwhat should i call you\b/.test(text)) return true;
    if (/\bwhat do i call you\b/.test(text)) return true;
    if (/\b(your name|call you)\b/.test(text) && /\b(what|tell me|who)\b/.test(text)) return true;
    if (/\bwho is karen\b/.test(text)) return true;
    if (/\bwhat('s| is) karen\b/.test(text) && !/\b(karen'?s? (weather|temperature|news|score))\b/.test(text)) {
      return true;
    }
    if (/\btell me about\b/.test(text)) {
      if (/\b(yourself|you|karen|your personality|your background|your story)\b/.test(text)) return true;
    }
    return false;
  }

  function isKarenPreferenceQuestion(q) {
    const text = normalizeWebSearchText(q);
    if (!text) return false;
    if (/\b(your favorite|your favourite)\b/.test(text)) return true;
    if (/\bwhat('s| is) your (favorite|favourite)\b/.test(text)) return true;
    if (/\bdo you (like|prefer|enjoy|love|hate)\b/.test(text)) return true;
    if (/\bwould you (like|prefer|rather)\b/.test(text)) return true;
    if (/\bwhat('s| is) your (opinion|take|view|thought)\b/.test(text)) return true;
    if (/\bwhat do you think (about|of)\b/.test(text)) return true;
    if (/\bwhat would you (order|get|pick|choose|eat|drink|watch|listen)\b/.test(text)) return true;
    return false;
  }

  function isPersonaQuestion(text) {
    return isIdentityQuestion(text) || isKarenPreferenceQuestion(text);
  }

  const LOOKUP_FOLLOWUP =
    /^(?:please\s+|can you\s+|could you\s+|go ahead and\s+)?(?:look (?:it|that|this) up|search (?:it|that|this)|find (?:it|that|this)? out|check (?:it|that|this)|google (?:it|that|this))(?:\s+online)?[.!]?$/i;

  function isLookupFollowUp(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (LOOKUP_FOLLOWUP.test(t)) return true;
    return /\b(look (?:it|that|this) up|search (?:it|that|this)(?: online)?|find out|check online|google (?:it|that|this))\b/i.test(
      t
    );
  }

  function resolveWebSearchQuestion(question, history) {
    const q = String(question || "").trim();
    if (!q) return q;
    if (!isLookupFollowUp(q)) return q;
    const users = (history || [])
      .filter((m) => m?.role === "user")
      .map((m) => String(m.content || "").trim())
      .filter(Boolean);
    for (let i = users.length - 2; i >= 0; i--) {
      const prior = users[i];
      if (prior.length >= 8 && !isLookupFollowUp(prior)) return prior;
    }
    return q;
  }

  function needsWebSearch(text) {
    const normalized = window.DeskCopilotWeather?.normalizeWeatherStt?.(text) || String(text || "");
    const q = normalizeWebSearchText(normalized);
    if (!q || q.length < 4) return false;
    if (isUserMemoryQuestion(q)) return false;
    if (isPersonaQuestion(q)) return false;
    if (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(q)) return false;
    if (typeof isChartReadCommand === "function" && isChartReadCommand(q)) return false;
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
      /\bhow(?:'s|s| is)\s+(?:the\s+)?(?:whether|wetter|weird|weather|temperature|temp)\b/.test(
        q
      )
    ) {
      return true;
    }
    if (/\bwhat(?:'s|s| is)\s+(?:it\s+)?like\s+(?:in|at|for)\s+[a-z]/.test(q)) return true;
    if (/\bhow(?:'s|s| is)\s+it\s+(?:in|at|for)\s+[a-z]/.test(q)) return true;
    if (
      /\b(?:price of|stock price|share price|trading at)\b/.test(q) &&
      /\b(aapl|apple|tsla|tesla|nvda|nvidia|msft|microsoft|goog|google|amzn|amazon|meta|btc|bitcoin|eth|ethereum|sol|doge)\b/.test(
        q
      )
    ) {
      return true;
    }
    if (/\bwhat(?:'s|s| is)\s+(?:the\s+)?(?:price|stock)\s+of\b/.test(q)) return true;
    if (/\b(latest|current|today|right now|live|this morning|this afternoon|tonight)\b/.test(q)) {
      if (
        /\b(news|headline|score|result|rate|stock|crypto|bitcoin|ethereum|election|who won|match|game)\b/.test(
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
    if (/\bwhat happened (in|at|with)\b/.test(q) && /\b(today|now|just|latest)\b/.test(q)) return true;
    if (/\b(is there|are there)\b/.test(q) && /\b(news|alert|warning|strike|closure)\b/.test(q)) {
      return true;
    }
    if (
      /\b(news about|news on|what's happening|latest on|update on|going on in|headlines)\b/.test(q)
    ) {
      return true;
    }
    if (isClearlyTrading(q)) {
      return /\b(news|headline|why did|what happened|earnings|fed|cpi|nfp)\b/.test(q);
    }
    return false;
  }

  function wantsLiveWebData(text, history) {
    const q = String(text || "").trim();
    if (!q) return false;
    if (isPersonaQuestion(q)) return false;
    if (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(q)) return false;
    if (isClearlyTrading(q) && !/\b(news|headline|why did|what happened|earnings|fed|cpi|nfp)\b/.test(q)) {
      return false;
    }
    const resolved = resolveWebSearchQuestion(q, history);
    if (isPersonaQuestion(resolved)) return false;
    if (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(resolved)) return false;
    return needsWebSearch(q) || needsWebSearch(resolved);
  }

  function isWeatherLocationPrompt(text) {
    return /\bwhich city\b/i.test(String(text || "")) && /\bweather\b/i.test(String(text || ""));
  }

  function isWeatherAmbiguousPrompt(text) {
    return /\bplaces called\b/i.test(String(text || "")) && /\bwhich city or region\b/i.test(String(text || ""));
  }

  function isWeatherGuessReply(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    return AI_REFUSAL.test(t) || WEATHER_GUESS_REPLY.test(t);
  }

  function isLiveWeatherReply(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (isWeatherLocationPrompt(t)) return true;
    if (isWeatherAmbiguousPrompt(t)) return true;
    if (isWeatherGuessReply(t)) return false;
    return LIVE_WEATHER_REPLY.test(t);
  }

  function isWeatherQuestion(text) {
    const q = String(text || "").trim().toLowerCase();
    const normalized = window.DeskCopilotWeather?.normalizeWeatherStt?.(q) || q;
    return (
      needsWebSearch(normalized) ||
      window.DeskCopilotWeather?.isWeatherIntent?.(normalized) === true ||
      /\b(weather|temperature|temp|forecast|whether|wetter)\b/.test(normalized) ||
      /\bwhat(?:'s|s| is)\s+(?:it\s+)?like\s+(?:in|at|for)\s+[a-z]/.test(normalized)
    );
  }

  window.DeskCopilotCasual = {
    CASUAL_LLM_FAILURE_REPLY,
    isCasualMessage,
    isNonTradingConversation,
    isClearlyTrading,
    isGeneralConversation,
    isPersonaQuestion,
    isIdentityQuestion,
    isKarenPreferenceQuestion,
    needsWebSearch,
    wantsLiveWebData,
    resolveWebSearchQuestion,
    isGreeting,
    stripLeadingGreeting,
    stripSocialOpener,
    normalizeDeskQuestion,
    isLikelyGreetingMisheard,
    isFarewell,
    isGenericLocalReply,
    isWeatherGuessReply,
    isLiveWeatherReply,
    isWeatherQuestion,
    isUserMemoryQuestion,
    userMemoryReply,
    localCasualReply: (q, history) => localCasualReply(q, history),
    nameIntroReply,
    isNameIntroReply,
    isTradingRedirect,
    isGenericReply,
    isStaleCasualMismatch,
    stripSteerBack,
    sanitizeCasualReply: (text, question, history) => sanitizeCasualReply(text, question, history),
  };
})();
