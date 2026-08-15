/** Casual conversation — mirrored from lib/casual-chat-intent.ts + lib/web-search-intent.ts (v1.4.0) */
(function () {
  const CASUAL_LLM_FAILURE_REPLY =
    "I'm having trouble responding right now — try that again.";
  const CLARIFY_MORE_REPLY = "Ha — say more, I'm listening.";

  const CONVERSATION_INITIATION =
    /\b(?:(?:make|start|have)\s+(?:a\s+)?conversation(?:\s+with\s+me)?|talk\s+to\s+me|keep\s+me\s+company|let'?s\s+chat|say\s+something(?:\s+interesting)?|ask\s+me\s+something|i'?m\s+bored|tell\s+me\s+something\s+interesting)\b/i;

  const CONVERSATION_INITIATORS = [
    "Alright — random one: if you could become ridiculously good at one skill overnight, what would you pick?",
    "Okay, I'm in — what's the most fun thing you've done lately that wasn't on a screen?",
    "Deal. Quick one: coffee or tea when the day's dragging — and why?",
    "Sure. If you had a free afternoon with zero obligations, what would you actually do?",
    "I'm game. What's a small thing that always puts you in a better mood?",
    "Alright — what's a take you've got that most people disagree with?",
  ];
  let conversationInitiationCursor = 0;

  function isConversationInitiation(text) {
    const q = stripLeadingGreeting(String(text || ""))
      .trim()
      .toLowerCase();
    if (!q || q.length < 2) return false;
    if (isClearlyTrading(q)) return false;
    return CONVERSATION_INITIATION.test(q);
  }

  function conversationInitiationReply() {
    const reply = CONVERSATION_INITIATORS[conversationInitiationCursor % CONVERSATION_INITIATORS.length];
    conversationInitiationCursor += 1;
    return reply;
  }

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

  /** Verified readings only — SEO titles with bare "forecast/rain/wind" keywords are NOT live. */
  const LIVE_WEATHER_READING =
    /\b\d+(?:\.\d+)?\s*°\s*[cf]\b|\b\d+(?:\.\d+)?\s*degrees?\b|\bfeels?\s*like\s*\d+(?:\.\d+)?\b|\b(?:humidity|rh)\s*(?:is\s*|of\s*|at\s*|:\s*)?\d{1,3}\s*%|\b\d{1,3}\s*%\s*(?:humidity|chance\s+of\s+rain|precip)\b|\b(?:wind|winds?)\s*(?:at|of|around|up\s+to)?\s*\d+(?:\.\d+)?\s*(?:mph|km\/h|kph|m\/s|knots?)\b|\b\d+(?:\.\d+)?\s*(?:mph|km\/h|kph)\s*(?:winds?|gusts?)?\b|\b(?:uv|uvi)\s*(?:index\s*)?(?:of\s*|is\s*|:\s*)?\d+(?:\.\d+)?\b|\bvisibility\s*(?:is\s*|of\s*|:\s*)?\d+(?:\.\d+)?\s*(?:miles?|km|mi)\b/i;

  const WEATHER_SEO_TITLE_DUMP =
    /\b\d+\s*-?\s*day\s+(?:weather\s+)?forecast\b|\bweather\s+forecast\s+including\b|\bincluding\s+(?:weather\s+)?warnings?\b|\bwarnings?,\s*temperature,\s*rain\b/i;

  const SOCIAL_OPENER_PREFIX =
    /^(?:i'?m\s+(?:good|fine|great|well|ok|okay|doing\s+(?:good|well|fine|great)|alright)|doing\s+(?:good|well|fine|great)|(?:good|fine|great|well|ok|okay|alright)(?:\s+thanks|\s+thank\s+you)?)(?:[.!?]+|\s*,)\s*/i;

  const FOOD_WORDS =
    /\b(burger|pizza|taco|pasta|ramen|noodles|spaghetti|carbonara|lasagna|chicken|nuggets|wings|fries|food|hungry|eat|lunch|dinner|snack|mcdonald|kfc|wendy|takeout|takeaway|chinese|thai|indian|sushi|coffee|tea)\b/i;

  /** Mirror lib/casual-diversity.ts — in-extension instant jokes, no network. */
  const JOKE_POOL = [
    { id: "ladder", text: "Why did the trader bring a ladder to the desk? The market kept hitting new highs." },
    { id: "scarecrow", text: "Why did the scarecrow win an award? He was outstanding in his field." },
    { id: "bulls", text: "I told the bulls a joke about gravity — they didn't fall for it." },
    { id: "bears", text: "Why don't bears use elevators? They prefer taking the stairs down." },
    { id: "coffee", text: "My coffee asked for a raise. I said liquidity's tight — try again next session." },
    { id: "chart", text: "A chart walks into a bar. The bartender says, 'We don't serve your type — too many wicks.'" },
    { id: "stop", text: "Why did the stop-loss break up with the entry? Too much emotional attachment." },
    { id: "fvg", text: "What's a fair value gap's favorite genre? Incomplete stories." },
    { id: "pdh", text: "PDH and PDL walked into therapy. The therapist said, 'You two need more space.'" },
    { id: "latency", text: "I asked my feed for a joke. It said 'buffering' — classic timing joke." },
    { id: "monk", text: "A monk, a pirate, and a day trader walk into a bar. Only the trader leaves with a P&L." },
    { id: "wifi", text: "Why was the Wi-Fi mad at the tick stream? Too many reconnects, not enough commitment." },
    { id: "alarm", text: "My alarm is set for the London open. It has commitment issues with Asia." },
    { id: "mirror", text: "I looked in the mirror and said 'be patient.' The mirror said 'that's not financial advice.'" },
    { id: "pencil", text: "Why did the pencil refuse to mark the chart? It was already drawn to conclusions." },
  ];
  const jokeRecentIds = [];

  function normalizeJokeFp(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/["'\u201c\u201d]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
  }

  function isJokeRequest(text) {
    return /\bjoke\b|\bfunny\b|\bmake me laugh\b/.test(String(text || "").toLowerCase());
  }

  function isJokeRephraseFollowUp(text) {
    const q = String(text || "").trim().toLowerCase();
    if (!q) return false;
    return (
      /^(another|another one|different one|a different one|one more|again)\b/.test(q) ||
      /\b(different joke|tell me another|another joke|say that differently)\b/.test(q)
    );
  }

  function priorJokeInHistory(history) {
    const msgs = Array.isArray(history) ? history : [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m?.role !== "user") continue;
      if (isJokeRequest(m.content)) return true;
    }
    return false;
  }

  function isJokeFollowUp(text, history) {
    return isJokeRephraseFollowUp(text) && priorJokeInHistory(history);
  }

  function jokeFingerprintsFromHistory(history) {
    return (Array.isArray(history) ? history : [])
      .filter((m) => m?.role === "assistant")
      .map((m) => normalizeJokeFp(m.content))
      .filter(Boolean);
  }

  function pickJokeReply(history) {
    const fps = jokeFingerprintsFromHistory(history);
    const usedIds = new Set(jokeRecentIds);
    const fresh = JOKE_POOL.filter(
      (p) => !usedIds.has(p.id) && !fps.includes(normalizeJokeFp(p.text))
    );
    let candidates = fresh.length > 0 ? fresh : JOKE_POOL;
    const lastFp = fps.length ? fps[fps.length - 1] : null;
    if (candidates.length > 1 && lastFp) {
      const withoutLast = candidates.filter((c) => normalizeJokeFp(c.text) !== lastFp);
      if (withoutLast.length) candidates = withoutLast;
    }
    const salt = jokeRecentIds.length + fps.length;
    const picked = candidates[salt % candidates.length] || candidates[0];
    if (picked?.id) {
      jokeRecentIds.push(picked.id);
      while (jokeRecentIds.length > 20) jokeRecentIds.shift();
    }
    return picked?.text || JOKE_POOL[0].text;
  }

  /** Past-tense wait anaphora — keep as market (feature 6 client). */
  const WAIT_ANAPHORA = /\bwhat (?:are|were) you waiting for\b/i;

  function isChallengeOrSkepticismFollowUp(text) {
    const raw = String(text || "").trim();
    const q = raw
      .toLowerCase()
      .replace(/[?!.,]+$/g, "");
    if (!q) return false;
    if (/^(really|seriously)$/.test(q)) return true;
    if (/^(are you sure|you sure|how so|how come)$/.test(q)) return true;
    if (/^true$/.test(q) && /\?\s*$/.test(raw)) return true;
    if (
      /\b(?:is that (?:actually |really )?true|is that right|is that so|are you (?:sure|serious)|(?:do )?you (?:actually |really )?think that|do you (?:really )?mean that|really is that true|why do you say that|you sure about that)\b/.test(
        q
      )
    ) {
      return true;
    }
    if (/^really\b/.test(q) && /\b(true|sure|serious|mean that|think that)\b/.test(q)) return true;
    if (/^seriously\b/.test(q) && q.length <= 48) return true;
    return false;
  }

  function isAnaphoricOrEllipticalFollowUp(text) {
    const q = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[?!.,]+$/g, "");
    if (!q || q.length < 2) return false;
    if (isChallengeOrSkepticismFollowUp(text)) return true;
    if (/^(why|when|another|another one|one more|again|go on|really|true|same)\??$/.test(q)) return true;
    if (
      /\b(tell me more(?: about (?:it|that|this|them))?|what about (?:it|that|this|them)|what happened to (?:it|that)|how far(?: away)?(?: are we| is (?:it|that))? from (?:it|that)|has (?:it|that) been (?:swept|taken|hit)|recommend me (?:one|another)|which ones?(?: do you like)?|why did you take (?:it|that)|what do you like about (?:it|that|this|them)|what(?:'s| is) interesting about (?:it|that|this|them))\b/.test(
        q
      )
    ) {
      return true;
    }
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length <= 14 && /\b(it|that|this|them|those|one|another)\b/.test(q)) {
      if (
        /\b(about|from|to|for|on|with|of)\s+(?:it|that|this|them|those)\b/.test(q) ||
        (/\b(?:it|that|this|them|those)\b/.test(q) &&
          /\b(like|love|prefer|interesting|happen|swept|far|why|when|more|recommend|which|take)\b/.test(q)) ||
        /\b(another(?: one)?|one more|recommend me one|which ones?)\b/.test(q)
      ) {
        return true;
      }
    }
    return false;
  }

  function extractReferentFromPrior(priorUser) {
    const raw = String(priorUser || "").trim();
    if (!raw) return null;
    const q = raw.toLowerCase().replace(/[?!.,]+$/g, "");
    let m = q.match(/\bdo you (?:like|love|prefer|enjoy)\s+(.+)$/i);
    if (m?.[1]) return m[1].replace(/^(a|an|the)\s+/i, "").trim().slice(0, 60);
    m = q.match(/\btell me about\s+(.+)$/i);
    if (m?.[1]) return m[1].replace(/^(a|an|the)\s+/i, "").trim().slice(0, 60);
    m = q.match(/\b(?:let'?s talk about|talk about)\s+(.+)$/i);
    if (m?.[1]) return m[1].replace(/^(a|an|the)\s+/i, "").trim().slice(0, 60);
    m = q.match(/\bi(?:'m| am)?\s+(?:like|love|prefer|enjoy)\s+(.+)$/i);
    if (m?.[1]) return m[1].replace(/^(a|an|the)\s+/i, "").trim().slice(0, 60);
    m = q.match(/\bwhat(?:'s| is)\s+(?:a |an |the )?([a-z0-9][\w\s-]{1,40})$/i);
    if (m?.[1] && !/\b(your|my|this|that)\b/.test(m[1])) {
      return m[1].trim().slice(0, 60);
    }
    if (/\btell me something interesting\b/.test(q)) return "that";
    return null;
  }

  function priorUserFromHistory(history) {
    const msgs = Array.isArray(history) ? history : [];
    let i = msgs.length - 1;
    if (msgs[i]?.role === "user") i -= 1;
    for (; i >= 0; i--) {
      if (msgs[i]?.role === "user") return String(msgs[i].content || "").trim();
    }
    return "";
  }

  function priorAssistantFromHistory(history) {
    const msgs = Array.isArray(history) ? history : [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === "assistant") return String(msgs[i].content || "").trim();
    }
    return "";
  }

  function answerGeneralChatFollowUpLocal(question, history) {
    if (!isAnaphoricOrEllipticalFollowUp(question)) return null;
    const prior = priorUserFromHistory(history);
    const priorA = priorAssistantFromHistory(history);
    const ref = extractReferentFromPrior(prior);
    const q = String(question || "").trim().toLowerCase();
    const label = ref ? ref.charAt(0).toUpperCase() + ref.slice(1) : null;

    if (isChallengeOrSkepticismFollowUp(question)) {
      if (!priorA) return "I don't have a prior claim lined up — what are you checking?";
      if (/\bdesk co-pilot\b/i.test(priorA) || /\bchart reads?\b/i.test(priorA)) {
        return "Yeah. Trading is the main job; the casual side just means I can talk normally with you around it.";
      }
      const first = priorA.split(/[.!?]/)[0]?.trim() || priorA.slice(0, 140);
      if (FOOD_WORDS.test(priorA) || (ref && FOOD_WORDS.test(ref)) || /\b(solid|prefer|like|love|pick)\b/i.test(priorA)) {
        const bit = first.replace(/^(yeah — |yep — |sure — )/i, "").trim();
        return bit
          ? `Yeah — I stand by that. ${bit}${/[.!?]$/.test(bit) ? "" : "."}`
          : "Yeah — I stand by that. Want the why?";
      }
      if (first && first.length <= 160) {
        return `Yeah — that's what I meant. ${first}${/[.!?]$/.test(first) ? "" : "."}`;
      }
      return "Yeah — I stand by that. Which part feels off?";
    }

    if (/\bwhat do you like about (?:it|that|this|them)\b/.test(q) || /\babout (?:it|that|this|them)\b/.test(q)) {
      if (ref && FOOD_WORDS.test(ref)) {
        return `What I like about ${ref}: big flavor range and it still works as easy takeout. What's your go-to?`;
      }
      if (ref && /\b(japan|tokyo|italy|london|paris|travel|city)\b/i.test(ref)) {
        return `What stands out about ${ref} for me is the culture stack: food first, then the pace of the city.`;
      }
      if (label) {
        return `What I like about ${ref} is how specific it is — not generic filler. What hooked you?`;
      }
    }
    if (/\brecommend me (?:one|another)\b/.test(q) && ref && /\b(sci-?fi|film|movie)\b/i.test(ref)) {
      return "Try Arrival — smart sci-fi that actually respects your attention.";
    }
    if (/\bwhich ones?\b/.test(q) && ref && /\bcars?\b/i.test(ref)) {
      return "Daily-driver lane: something reliable and quiet — Civic/Corolla energy over flex badges.";
    }
    if (/\btell me more\b/.test(q)) {
      if (label && label !== "That") {
        return `More on ${ref}: the interesting part is usually the why behind the surface take — happy to unpack that.`;
      }
      return "Alright — the interesting bit is usually the tradeoff people skip. Want the short version or a sharper take?";
    }
    if (ref && FOOD_WORDS.test(ref)) {
      return `On ${ref}: flavor range and convenience — that's the appeal. What's your order?`;
    }
    if (ref) return `On ${ref} — happy to keep going. What do you want to know next?`;
    return null;
  }

  function preferenceLikeReply(topicHint) {
    if (topicHint && FOOD_WORDS.test(topicHint)) {
      return "Yeah — that ranks high for me. Variety beats another bland desk lunch. What's your go-to?";
    }
    return "Yeah — I'm into that. What do you like most about it?";
  }

  function extractMentionedLevels(text) {
    const t = String(text || "");
    if (!t.trim()) return [];
    const specs = [
      { id: "pdh", re: /previous day high(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi },
      { id: "pdl", re: /previous day low(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi },
      { id: "pdh", re: /\bpdh\b(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi },
      { id: "pdl", re: /\bpdl\b(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi },
    ];
    const byId = {};
    for (const spec of specs) {
      spec.re.lastIndex = 0;
      let m;
      while ((m = spec.re.exec(t)) != null) {
        const n = parseFloat(String(m[1] || "").replace(/,/g, ""));
        if (Number.isFinite(n) && n >= 20000 && n <= 45000) byId[spec.id] = n;
      }
    }
    return Object.keys(byId);
  }

  function priorHasMentionedLevels(messages, recentText) {
    if (Array.isArray(messages) && messages.length) {
      const lastA = [...messages].reverse().find((m) => m.role === "assistant");
      if (lastA?.content && extractMentionedLevels(lastA.content).length) return true;
      const joined = messages
        .slice(-6)
        .map((m) => m.content)
        .join("\n");
      if (extractMentionedLevels(joined).length) return true;
    }
    return extractMentionedLevels(String(recentText || "")).length > 0;
  }

  function isComparativeDistancePhrase(text) {
    const q = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ")
      .replace(/\bone'?s\b/g, "one is");
    if (!q) return false;
    // Bare which-anaphora needs prior levels (isLevelComparativeFollowUp) — not auto-trading.
    if (/\bwhich(?: one)?(?: is)? (?:closer|closest|nearest|nearer)\b/.test(q)) return true;
    if (/\bhow far(?: away)?\b/.test(q)) return true;
    if (/\bhow many points\b/.test(q)) return true;
    if (/\brelative to\b/.test(q)) return true;
    if (/\bdistance to\b/.test(q)) return true;
    if (/\baround\b/.test(q) && /\b(price|level|current)\b/.test(q)) return true;
    if (/\bsitting\b/.test(q) && /\b(price|level|we|us)\b/.test(q)) return true;
    if (/\bwhich (?:would|will|does) (?:price|it) hit first\b/.test(q)) return true;
    if (/\bwhich (?:level|one) (?:would|will) (?:price |it )?hit first\b/.test(q)) return true;
    const hasProx =
      /\b(closer|closest|nearest|nearer|nearby)\b/.test(q) ||
      /\bhow near\b/.test(q) ||
      (/\bnear(?:\s+to)?\b/.test(q) && !/\bnearly\b/.test(q));
    if (!hasProx) return false;
    if (
      /\b(price|level|levels|pdh|pdl|pdc|support|resistance|we|us|i|current|those|these|market|it)\b/.test(
        q
      )
    ) {
      return true;
    }
    if (/\b(?:closer|closest|nearest|nearer) to (?:what|which)\b/.test(q)) return true;
    if (/^(?:the )?(?:closest|nearest|nearer)(?:\s+(?:level|one|support|resistance))?\??$/.test(q)) {
      return true;
    }
    if (/^what(?:'s| is|s)?\s+nearby\??$/.test(q)) return true;
    if (/^nearest to us\??$/.test(q)) return true;
    if (/^which is (?:closer|closest|nearest|nearer)\??$/.test(q)) return true;
    if (
      /^what(?:'s| is|s) (?:the )?(?:closer|closest|nearest|nearer)(?:\s+(?:level|one))?(?:\s+now)?\??$/.test(
        q
      )
    ) {
      return true;
    }
    if (/^(?:nearest|closest|nearer)\??$/.test(q)) return true;
    return false;
  }

  function isBareWhichLevelAnaphora(text) {
    const q = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ");
    return /^(?:which one|which)$/.test(q);
  }

  function isLevelSlotFollowUpPhrase(text) {
    const q = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[.!?]+$/g, "");
    if (!q) return false;
    if (/\bwhat about the (?:low|high)\b/.test(q)) return true;
    if (/\band the (?:low|high)\b/.test(q)) return true;
    if (/^(?:the )?(?:low|high)\??$/.test(q)) return true;
    if (/\bwhat about (?:the )?(?:pdh|pdl|pdc)\b/.test(q)) return true;
    if (/\band (?:the )?(?:pdh|pdl|pdc)\b/.test(q)) return true;
    if (/^(?:the )?(?:pdh|pdl|pdc)\??$/.test(q)) return true;
    return false;
  }

  function isLevelComparativeFollowUp(text, messages, recentText) {
    if (
      !isComparativeDistancePhrase(text) &&
      !isLevelSlotFollowUpPhrase(text) &&
      !isBareWhichLevelAnaphora(text) &&
      !isChallengeOrSkepticismFollowUp(text)
    ) {
      return false;
    }
    return priorHasMentionedLevels(messages, recentText);
  }

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

  function isDeclarativeShare(text) {
    const t = String(text || "").trim();
    if (!t || /\?\s*$/.test(t)) return false;
    const q = t.toLowerCase();
    // Analytical asks stay trading even if first-person.
    if (
      /^(what|who|where|when|why|how|which|do|does|did|can|could|would|should|is|are|will|have|has|tell|explain)\b/i.test(
        q
      )
    ) {
      return false;
    }
    if (
      /\b(i'?m|im|i am|i'll|i will|gonna|going to)\s+(be\s+)?(trad(?:e|ing)|scalp)/i.test(q) ||
      (/\btrad(?:e|ing)\b/.test(q) && /\b(monday|tuesday|wednesday|thursday|friday)\b/.test(q))
    ) {
      return true;
    }
    if (/\bhoping\b/.test(q) && /\b(nasdaq|mnq|nq|clean)\b/.test(q)) return true;
    if (/\bdon'?t want to trade\b|\bbad trade\b|\bmarkets?\s+(are\s+)?(annoying|frustrating)\b/.test(q)) {
      return true;
    }
    if (/^(i'?m|im|i am)\s+(tired|bored|exhausted|hungry)\b/i.test(q)) return true;
    if (/\bpasta\b/.test(q) && /\b(dinner|lunch|tonight)\b/.test(q)) return true;
    return false;
  }

  function hasMarketConceptAsk(text) {
    const q = String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[.!?]+$/g, "");
    if (!q) return false;
    // LEVEL_PROXIMITY family — same owner as server (no casual domain escape).
    if (isComparativeDistancePhrase(q) || isComparativeDistancePhrase(text)) return true;
    if (
      /\b(?:pdh|pdl|pdc|previous\s+day(?:'?s)?\s+(?:high|low|close)|previous\s+daily\s+(?:high|low|close)|prior\s+day(?:'?s)?\s+(?:high|low|close)|prior\s+daily\s+(?:high|low|close)|yesterday(?:'?s)?\s+(?:high|low|close)|yesterdays\s+(?:high|low|close)|the\s+(?:high|low)\s+from\s+yesterday|high\s+from\s+yesterday|low\s+from\s+yesterday|previous\s+session\s+(?:high|low))\b/i.test(
        q
      )
    ) {
      return true;
    }
    if (
      (/\bprevious\s+day\b/.test(q) || /\bprevious\s+daily\b/.test(q) || /\bprior\s+day\b/.test(q) || /\byesterday\b/.test(q)) &&
      /\b(high|low|close)\b/.test(q)
    ) {
      return true;
    }
    return false;
  }

  function isClearlyTrading(q, recentText) {
    const core = normalizeDeskQuestion(q).toLowerCase();
    const raw = String(q || "").trim().toLowerCase();
    if (!core && !raw) return false;
    if (hasMarketConceptAsk(q) || hasMarketConceptAsk(core) || hasMarketConceptAsk(raw)) {
      return true;
    }
    // Plan/feeling shares with trading vocab stay conversational — not auto analysis.
    if (isDeclarativeShare(q) || isDeclarativeShare(core)) return false;
    if (typeof isChartStatusQuestion === "function" && (isChartStatusQuestion(core) || isChartStatusQuestion(raw))) {
      return true;
    }
    if (isBiasDirectionQuestion(core) || isBiasDirectionQuestion(raw)) return true;
    if (WAIT_ANAPHORA.test(core) || WAIT_ANAPHORA.test(raw)) return true;
    if (isComparativeDistancePhrase(core) || isComparativeDistancePhrase(raw)) {
      return true;
    }
    if (
      recentText &&
      (isLevelComparativeFollowUp(core, undefined, recentText) ||
        isLevelComparativeFollowUp(raw, undefined, recentText))
    ) {
      return true;
    }
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
    if (isConversationInitiation(text)) return true;
    if (isPersonaQuestion(q)) return true;
    if (needsWebSearch(q)) return true;
    if (/\?\s*$/.test(q)) return true;
    // Informal STT: "whats" / "whats the capital" (no apostrophe) must match like "what's".
    if (
      /^(what(?:'?s)?|who(?:'?s)?|where(?:'?s)?|when(?:'?s)?|why|how(?:'?s)?|tell me|explain|describe|define|can you|could you|do you know|is there|are there)\b/i.test(
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
    // Any "do you like X" — never fail closed just because X isn't in FOOD_WORDS (pasta etc.).
    if (/\bdo you (like|prefer|enjoy|love)\b/.test(q)) {
      if (FOOD_WORDS.test(q)) return preferenceLikeReply(q);
      const subject = q
        .replace(/.*(do you (?:like|prefer|enjoy|love))\s*/i, "")
        .replace(/[?.!]+$/, "")
        .trim();
      if (subject && subject.length > 1 && subject.length < 40 && !/^(it|that|this|them)\b/i.test(subject)) {
        return `Yeah — ${subject} is solid. I'd pick that over most things.`;
      }
      return preferenceLikeReply(q);
    }
    return null;
  }

  function localCasualReply(question, history) {
    const q = stripLeadingGreeting(question).toLowerCase();
    const intro = nameIntroReply(question);
    if (intro) return intro;
    if (isConversationInitiation(question)) {
      return conversationInitiationReply();
    }
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

    // Jokes / "another" after a joke — local pool + history diversity (no network).
    if (isJokeRequest(q) || isJokeFollowUp(question, history)) {
      return pickJokeReply(history);
    }

    // Pronoun / elliptical follow-ups — resolve against history BEFORE failure reply.
    const follow = answerGeneralChatFollowUpLocal(question, history);
    if (follow) return follow;

    const karenPref = karenPreferenceReply(q);
    if (karenPref) return karenPref;

    // Declarative shares — acknowledge; never "Not a casual question" / failure bubble.
    const statement = statementShareReply(q, history);
    if (statement) return statement;

    if (isIdentityQuestion(q)) {
      if (/\b(tell me about yourself|introduce yourself|describe yourself|what are you)\b/.test(q)) {
        return "I'm your desk co-pilot. Warm, direct, a little witty: chart reads and levels when you need them, or just chat when you don't.";
      }
      return "Your desk co-pilot.";
    }
    if (isGeneralConversation(question)) {
      // Anaphoric general chat with history should not hard-fail when stream is down.
      if (isAnaphoricOrEllipticalFollowUp(question) && Array.isArray(history) && history.length) {
        const soft = answerGeneralChatFollowUpLocal(question, history);
        if (soft) return soft;
      }
      // Classifier/local miss → signal fallthrough (empty), NOT a user-visible failure bubble.
      return "";
    }
    // Declarative / fragment miss → fallthrough to GENERAL_CHAT stream, not Ha filler.
    return "";
  }

  /** User shares plan/feeling/opinion — conversational ack (no MarketState). */
  function statementShareReply(q, history) {
    const t = String(q || "").trim().toLowerCase().replace(/[!.?]+$/g, "");
    if (!t) return null;
    if (/\?\s*$/.test(String(q || "").trim())) return null;
    if (
      /\b(i'?m|im|i am|i'll|i will|gonna|going to)\s+(be\s+)?(trad(?:e|ing)|scalp)/i.test(t) ||
      (/\btrad(?:e|ing)\b/.test(t) && /\b(monday|tuesday|wednesday|thursday|friday)\b/.test(t))
    ) {
      const dayM = t.match(/\b(monday|tuesday|wednesday|thursday|friday)\b/i);
      const day = dayM ? dayM[1].charAt(0).toUpperCase() + dayM[1].slice(1).toLowerCase() : "that day";
      return `${day} — noted. Which session are you planning: New York, London, or Asia?`;
    }
    if (/\bhoping\b/.test(t) && /\b(nasdaq|mnq|nq|clean|session)\b/.test(t)) {
      return "Hoping for a clean Nasdaq session — fair. Want to talk what you'd watch for, or keep it light?";
    }
    if (/^(i'?m|im|i am)\s+(tired|exhausted|bored|hungry)$/i.test(t) || /^(tired|bored)$/i.test(t)) {
      if (/tired|exhausted/.test(t)) return "Tired — respect it. Light chat or park the desk for a bit?";
      if (/bored/.test(t)) return "Bored desk energy — coffee, a walk, or want me to ask you something random?";
      return "Got it — what's the move then?";
    }
    if (/\bpasta\b/.test(t) && /\b(dinner|lunch|tonight|for)\b/.test(t)) {
      return "Pasta for dinner — solid. Red sauce, cream, or whatever's in the fridge?";
    }
    if (/^(prefer|i prefer|i'd prefer)\b/.test(t) || /\bprefer\s+(chinese|thai|indian|sushi|pasta)\b/.test(t)) {
      if (/chinese/.test(t)) return "Chinese — good call. What's your usual order?";
      if (/thai/.test(t)) return "Thai — nice. Pad thai or something spicier?";
      return "Preference noted. What do you like most about it?";
    }
    if (/\bmarkets?\s+(are\s+)?(annoying|frustrating|messy|chop)\b/.test(t)) {
      return "Markets being annoying is real — step back or just vent it out?";
    }
    // Short session / day answers after a trading-plan ask.
    const recent = Array.isArray(history)
      ? history
          .slice(-6)
          .map((m) => String(m.content || ""))
          .join(" ")
      : "";
    if (
      /trad|session|monday|tuesday/i.test(recent) &&
      /^(monday|tuesday|wednesday|thursday|friday|new york|only new york|london|asia)$/i.test(t)
    ) {
      if (/new york|ny/.test(t)) {
        return "New York only — clean plan. Watching a level, or freestyling the open?";
      }
      return `Got it — ${t}. Which session are you leaning on?`;
    }
    return null;
  }

  function sanitizeCasualReply(text, question, history) {
    const stripped = stripSteerBack(text);
    if (!stripped || stripped.length < 4) return localCasualReply(question, history);
    if (isIdentityQuestion(question) && isTradingRedirect(stripped)) {
      return localCasualReply(question, history);
    }
    if (isGenericReply(stripped)) return localCasualReply(question, history);
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
    if (/\bwhat are you (seeing|looking|thinking|watching|reading|picking up)\b/.test(text)) return false;
    if (/\bwhat are you\b/.test(text) && /\b(on the chart|in the market|right now)\b/.test(text)) return false;
    if (/\b(tell me about yourself|introduce yourself|describe yourself)\b/.test(text)) return true;
    if (/^(who are you|what are you)[.?!]*$/.test(text)) return true;
    if (/\bwho are you\b/.test(text)) return true;
    if (/\bwhat are you\b/.test(text) && !/\b(seeing|looking|thinking|watching|reading)\b/.test(text)) return true;
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
    // Anaphoric preference follow-ups need history — not standalone instant persona.
    if (
      /\babout (?:it|that|this|them)\b/.test(text) ||
      /\bwhat do you like about (?:it|that|this|them)\b/.test(text) ||
      /\bwhat(?:'s| is) interesting about (?:it|that|this|them)\b/.test(text)
    ) {
      return false;
    }
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
    if (WEATHER_SEO_TITLE_DUMP.test(t)) return false;
    if (/\b(couldn't find verified|couldn't pull a verified|couldn't confirm weather)\b/i.test(t)) {
      return true;
    }
    return LIVE_WEATHER_READING.test(t);
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
    isLevelComparativeFollowUp,
    isComparativeDistancePhrase,
    isLevelSlotFollowUpPhrase,
    isAnaphoricOrEllipticalFollowUp,
    isChallengeOrSkepticismFollowUp,
    isGeneralConversation,
    isConversationInitiation,
    conversationInitiationReply,
    isPersonaQuestion,
    isIdentityQuestion,
    isKarenPreferenceQuestion,
    isJokeRequest,
    isJokeFollowUp,
    pickJokeReply: (history) => pickJokeReply(history),
    JOKE_POOL,
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
