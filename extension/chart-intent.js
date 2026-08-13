/** Chart-read intent — mirrored in lib/chart-read-intent.ts for server tests. */
function offeredChartRead(assistant) {
  const a = assistant.toLowerCase();
  return (
    /\b(want me to|should i|can i|pull|grab|get you|give you|take a|do a)\b/.test(a) &&
    /\b(read|chart|look|verdict|screenshot|see)\b/.test(a)
  );
}

function wantsChartRead(text, context) {
  const t = text.trim().toLowerCase();
  if (!t) return false;

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
  if (/\bwhat do you see\b/.test(t)) return true;
  if (/\bwhat (are you|you) seeing\b/.test(t)) return true;
  if (isChartStatusQuestion(t)) return false;
  if (/\bwhat('s| is) on the chart\b/.test(t)) return true;
  if (/\bwhat('s| is) the chart[?.!]?$/.test(t)) return true;
  if (/\bwhat('s| is) this\b/.test(t)) return true;
  if (
    /\bwhat('s| is) (happening|going on)\b/.test(t) &&
    /\b(market|mnq|nasdaq|setup|trade|futures)\b/.test(t)
  ) {
    return true;
  }
  if (/\b(your|the)\s+(read|verdict|take)\b/.test(t)) return true;
  if (/\bhow (does|do) (this|the chart|it) look\b/.test(t)) return true;
  if (/\b(tell me|talk me through|walk me through) (about )?(the )?(chart|setup|this)\b/.test(t)) {
    return true;
  }
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

const SNAPSHOT_INTENTS = new Set(["price", "level", "bias", "entry", "target", "structure", "first_presented_fvg", "status"]);

function stripLeadingGreeting(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  const prefix =
    /^(?:hi|hello|hey|sup|good morning|good evening|good afternoon|what's up|whats up)(?:[,.!?]|\s)+/i;
  const bare =
    /^(?:hi|hello|hey|sup)\s+(?=(?:what|who|where|when|why|how|tell|do|can|could|is|are|weather|what's|whats|my name))/i;
  let prev = "";
  while (t !== prev) {
    prev = t;
    if (prefix.test(t)) {
      t = t.replace(prefix, "").trim();
      continue;
    }
    if (bare.test(t)) {
      t = t.replace(/^(?:hi|hello|hey|sup)\s+/i, "").trim();
    }
  }
  return t;
}

function hasFirstPresentedFvgSttCue(q) {
  return /\bpresented\b/.test(q) || /\bpercentage\b/.test(q) || /\bpercent\b/.test(q);
}

function isFirstPresentedFvgQuestion(question) {
  const q = stripLeadingGreeting(question).trim().toLowerCase();
  if (!q) return false;
  if (/\bfpfvg\b/.test(q)) return true;
  if (/\b(1st|first)\b/.test(q) && hasFirstPresentedFvgSttCue(q) && /\b(fvg|fair value gap|gap)\b/.test(q)) {
    return true;
  }
  if (/\bfirst\s+(presented|percentage|percent)(?:\s+of)?\s+(fair value gap|fvg)\b/.test(q)) {
    return true;
  }
  if (/\b1st\s+presented\b/.test(q) && /\b(fvg|fair value gap|gap)\b/.test(q)) return true;
  if (/\bfirst\s+presented\s+fvg\b/.test(q)) return true;
  if (/\bopening range\b/.test(q) && /\b(fvg|fair value gap|gap)\b/.test(q)) return true;
  return false;
}

function isChartStatusQuestion(question) {
  const q = String(question || "")
    .trim()
    .toLowerCase();
  if (!q) return false;
  if (/\bwhat('s| is| are) (the )?(chart|market)\b.*\b(doing|moving|showing|look)\b/.test(q)) {
    return true;
  }
  if (/\bhow('s| is| are) (the )?(chart|market)\b.*\b(doing|moving|looking|look)\b/.test(q)) {
    return true;
  }
  if (
    /\bwhat('s| is) (happening|going on)\b/.test(q) &&
    /\b(on the chart|on chart|the chart|on the market|in the market|the market|right now)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b((chart|market) doing|doing right now)\b/.test(q) &&
    /\b(chart|market|right now|now)\b/.test(q)
  ) {
    return true;
  }
  if (/\bwhere('s| is) (price|the market) (now|right now)\b/.test(q)) {
    return true;
  }
  if (
    /\bwhat('s| is| are)\b/.test(q) &&
    /\b(mnq|nasdaq|nq|futures|market)\b/.test(q) &&
    /\b(doing|moving|showing)\b/.test(q)
  ) {
    return true;
  }
  return false;
}

function classifyChartQuestion(question) {
  const q = (window.DeskCopilotCasual?.stripSocialOpener?.(stripLeadingGreeting(question)) || stripLeadingGreeting(question))
    .trim()
    .toLowerCase();
  if (!q) return "general";

  if (
    /\b(get the read|full read|full setup|chart read|get me a read|give me a read|get a read)\b/.test(q)
  ) {
    return "full_read";
  }
  if (/\b(what's the setup|what is the setup|what do you see on the chart)\b/.test(q)) {
    return "full_read";
  }
  if (/\bwhat do you see\b/.test(q)) return "full_read";
  if (/\b(look at|check|read|scan|analyze)\s+(the\s+)?(chart|setup|this)\b/.test(q)) {
    return "full_read";
  }
  if (/\b(should i|would you)\b/.test(q) && /\b(trade|buy|sell|long|short|take it|this setup)\b/.test(q)) {
    return "full_read";
  }
  if (/\b(your|the)\s+(read|verdict|take)\b/.test(q)) return "full_read";

  if (isChartStatusQuestion(q)) return "status";

  if (
    /\b(what level|where are we|what price|current price|trading at|price at|what are we at|where is price|where's price|what level are we|how much is|last price|currently trading)\b/.test(
      q
    )
  ) {
    return "price";
  }
  if (/\bwhat level\b/.test(q) && /\b(we|trading|at|on)\b/.test(q)) return "price";
  if (/\bright now\b/.test(q) && /\b(price|trading|level|at)\b/.test(q)) return "price";

  if (/\b(entry|enter|where.*(buy|sell|long|short)|get in|entry zone)\b/.test(q)) return "entry";
  if (/\b(target|take profit|where.*(go|run)|target one|target 1)\b/.test(q)) return "target";
  if (isFirstPresentedFvgQuestion(q)) return "first_presented_fvg";
  if (
    /\b(fvg|fair value gap|mss|market structure|displacement|sweep|liquidity|order block|structure shift)\b/.test(
      q
    )
  ) {
    return "structure";
  }
  if (/\bphoto\b/.test(q) && /\b(daily|bullish|bearish|gap|fvg|fair value)\b/.test(q)) {
    return "structure";
  }
  if (/\bdaily\b/.test(q) && /\b(bullish|bearish|gap|fvg)\b/.test(q)) {
    return "structure";
  }
  if (/\b(bias|direction|long or short|buy or sell|tradeable bias)\b/.test(q)) return "bias";
  if (/\b(bullish|bearish)\b/.test(q) && !/\b(fvg|gap|photo|fair value)\b/.test(q)) return "bias";
  if (
    /\b(pdh|pdl|previous day high|previous day low|nearest (support|resistance)|session high|session low)\b/.test(
      q
    )
  ) {
    return "level";
  }
  if (/\b(support|resistance|key level)\b/.test(q)) return "level";

  return "general";
}

function needsFullChartRead(text, context) {
  if (isChartReadCommand(text)) return true;
  if (isChartStatusQuestion(text)) return false;
  if (wantsChartRead(text, context)) return true;
  const intent = classifyChartQuestion(text);
  if (SNAPSHOT_INTENTS.has(intent)) return false;
  return intent === "full_read";
}

function isSnapshotIntent(intent) {
  return SNAPSHOT_INTENTS.has(intent);
}

/** Analytical trading questions — full LLM, not one-line snapshot. */
function prefersRichTradingAnswer(question) {
  const q = (window.DeskCopilotCasual?.stripSocialOpener?.(stripLeadingGreeting(question)) || stripLeadingGreeting(question))
    .trim()
    .toLowerCase();
  if (!q) return false;
  if (window.DeskCopilotCasual?.isPersonaQuestion?.(q)) return false;
  if (/\btell me about\b/.test(q) && /\b(market|chart|structure|trade|setup|bias|session|mnq|nasdaq|futures|price|level|fvg|liquidity)\b/.test(q)) {
    return true;
  }
  if (
    /\b(what('s| is)|how does|how do|describe)\b/.test(q) &&
    /\b(market structure|dealing range|premium|discount|order block|liquidity|displacement|fair value gap|kill zone|opening range|session bias|macro)\b/.test(q)
  ) {
    return true;
  }
  if (/\b(why|explain|walk me through|talk me through|break down|help me understand)\b/.test(q)) {
    return true;
  }
  if (/\b(should i|would you|do you think|what do you think|is it worth|make sense to)\b/.test(q)) {
    return true;
  }
  if (/\b(wait for|hold off|stay out|take this|fade this|play this|lean|bias)\b/.test(q)) {
    return true;
  }
  if (/\b(setup|idea|plan|approach|strategy|scenario|context|confluence)\b/.test(q)) {
    return true;
  }
  if (/\b(compared to|versus|vs\.?|relative to|in context of)\b/.test(q)) {
    return true;
  }
  if (/\b(what would you|how would you|where would you|what's your)\b/.test(q)) {
    return true;
  }
  if (
    isChartStatusQuestion(q) &&
    /\b(why|should|think|setup|trade|long|short|buy|sell|wait)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b(what('s| is) happening|what('s| is) going on)\b/.test(q) &&
    /\b(market|trade|setup|session|open|mnq|nasdaq)\b/.test(q)
  ) {
    return true;
  }
  return false;
}

function needsScopedChartAnswer(text) {
  if (prefersRichTradingAnswer(text)) return false;
  return SNAPSHOT_INTENTS.has(resolveSnapshotIntent(text));
}

function resolveSnapshotIntent(question) {
  if (isFirstPresentedFvgQuestion(question)) return "first_presented_fvg";
  return classifyChartQuestion(question);
}

function isStaleFpfvgSnapshot(question, snap) {
  if (!isFirstPresentedFvgQuestion(question)) return false;
  if (snap?.intent === "first_presented_fvg" || snap?.fpfvg === true) return false;
  const spoken = String(snap?.spoken || snap?.spokenBrief || snap?.panel || "");
  if (/\bdaily\b/i.test(spoken) && !/\bone-minute\b/i.test(spoken)) return true;
  if (snap?.intent === "structure") return true;
  return false;
}

const CHART_READ_EXACT =
  /^(read|the read|get read|a read|get a read|get the read|full read|chart read|read the chart|what do you see|get me a read|give me a read|market read|quick read)$/i;

function isChartReadCommand(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (CHART_READ_EXACT.test(t)) return true;
  if (/\b(get the read|full read|what do you see|give me a read|market read|quick read)\b/i.test(t)) {
    return true;
  }
  return false;
}

function normalizeChartReadCommand(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (/^(read|the read|get read|a read|get a read|get me a read|give me a read|market read|quick read)$/i.test(lower)) {
    return "get the read";
  }
  if (/^full read$/i.test(lower)) return "full read";
  if (/^what do you see$/i.test(lower)) return "what do you see on the chart";
  if (/^chart read$/i.test(lower)) return "what do you see on the chart";
  return t;
}
