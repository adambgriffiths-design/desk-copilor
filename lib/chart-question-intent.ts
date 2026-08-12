import { stripLeadingGreeting, stripSocialOpener } from "./casual-chat-intent";

export type ChartQuestionIntent =
  | "price"
  | "level"
  | "bias"
  | "entry"
  | "target"
  | "structure"
  | "first_presented_fvg"
  | "status"
  | "full_read"
  | "general";

export const SNAPSHOT_INTENTS: ChartQuestionIntent[] = [
  "price",
  "level",
  "bias",
  "entry",
  "target",
  "structure",
  "first_presented_fvg",
  "status",
];

/** STT often mishears "presented" as "percentage" / "percent". */
function hasFirstPresentedFvgSttCue(q: string): boolean {
  return (
    /\bpresented\b/.test(q) ||
    /\bpercentage\b/.test(q) ||
    /\bpercent\b/.test(q)
  );
}

/** First presented FVG — 1m chart after session open, not daily FVG. */
export function isFirstPresentedFvgQuestion(question: string): boolean {
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

/** Live chart-state follow-ups — scoped JSON snapshot, not a screenshot read. */
export function isChartStatusQuestion(question: string): boolean {
  const q = question.trim().toLowerCase();
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

export function isSnapshotIntent(intent: ChartQuestionIntent): boolean {
  return SNAPSHOT_INTENTS.includes(intent);
}

const ANALYTICAL_STRUCTURE =
  /\b(market structure|dealing range|premium|discount|order block|liquidity|displacement|fair value gap|kill zone|opening range|session bias|macro)\b/;

/** Analytical trading questions need full LLM + market context — not one-line snapshot. */
export function prefersRichTradingAnswer(question: string): boolean {
  const q = stripSocialOpener(stripLeadingGreeting(question)).trim().toLowerCase();
  if (!q) return false;
  if (/\btell me about\b/.test(q) && /\b(market|chart|structure|trade|setup|bias|session|mnq|nasdaq|futures|price|level|fvg|liquidity)\b/.test(q)) {
    return true;
  }
  if (
    /\b(what('s| is)|how does|how do|describe)\b/.test(q) &&
    ANALYTICAL_STRUCTURE.test(q)
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

/** Snapshot routing — FPFVG wins over generic structure/daily FVG classifiers. */
export function resolveSnapshotIntent(question: string): ChartQuestionIntent {
  if (isFirstPresentedFvgQuestion(question)) return "first_presented_fvg";
  return classifyChartQuestion(question);
}

/** Classify a chart/trading question for scoped vs full-read routing. */
export function classifyChartQuestion(question: string): ChartQuestionIntent {
  const q = stripSocialOpener(stripLeadingGreeting(question)).trim().toLowerCase();
  if (!q) return "general";

  if (
    /\b(get the read|full read|full setup|chart read|get me a read|give me a read|get a read)\b/.test(
      q
    )
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
  if (
    /\b(should i|would you)\b/.test(q) &&
    /\b(trade|buy|sell|long|short|take it|this setup)\b/.test(q)
  ) {
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
  if (/\bwhat level are we trading\b/.test(q)) return "price";
  if (/\bwhat level\b/.test(q) && /\b(we|trading|at|on)\b/.test(q)) return "price";
  if (/\bright now\b/.test(q) && /\b(price|trading|level|at)\b/.test(q)) return "price";
  if (/\bhow (high|low) (is|are) (we|price|it)\b/.test(q)) return "price";

  if (/\b(entry|enter|where.*(buy|sell|long|short)|get in|entry zone)\b/.test(q)) {
    return "entry";
  }
  if (/\b(target|take profit|where.*(go|run)|target one|target 1)\b/.test(q)) {
    return "target";
  }
  if (isFirstPresentedFvgQuestion(q)) {
    return "first_presented_fvg";
  }
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
  if (/\b(bias|direction|long or short|buy or sell|tradeable bias)\b/.test(q)) {
    return "bias";
  }
  if (/\b(bullish|bearish)\b/.test(q) && !/\b(fvg|gap|photo|fair value)\b/.test(q)) {
    return "bias";
  }
  if (
    /\b(pdh|pdl|previous day high|previous day low|nearest (support|resistance)|session high|session low)\b/.test(
      q
    )
  ) {
    return "level";
  }
  // Common STT mishears: "previews stay low" → previous day low
  if (/\b(previews|preview|precious)\b/.test(q) && /\b(high|hi)\b/.test(q)) {
    return "level";
  }
  if (/\b(previews|preview|precious)\b/.test(q) && /\b(low|lo|stay low)\b/.test(q)) {
    return "level";
  }
  if (/\bwhere\b/.test(q) && /\b(pdh|pdl)\b/.test(q)) return "level";
  if (/\bwhere\b/.test(q) && /\bprevious day\b/.test(q)) return "level";
  if (/\b(support|resistance|key level)\b/.test(q)) return "level";

  return "general";
}
