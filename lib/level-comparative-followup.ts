/**
 * Comparative / anaphoric follow-ups on levels just stated in conversation.
 * Pure arithmetic vs a trustworthy current (or last/close) price — no full chart read.
 */
import {
  getCmeGlobexSessionStatus,
  type CmeGlobexSessionStatus,
} from "./cme-globex-session-status";
import {
  isAuthoritativeLiveAvailable,
  isBarClosePriceSource,
  isLiveTvPriceSource,
  isMnqChartPrice,
  isTickstreamLiveSource,
  LIVE_PRICE_MAX_AGE_MS,
  resolveAuthoritativePrice,
  type LivePriceSource,
} from "./chart-live-price";

/** Local mirror — avoid circular import with conversation-context-resolve. */
function isLevelChallengeFollowUp(text: string): boolean {
  const raw = String(text || "").trim();
  const q = raw
    .toLowerCase()
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ");
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

export type MentionedLevel = {
  id: string;
  /** Spoken label, e.g. "Previous day low" */
  label: string;
  /** Short tag for compact replies, e.g. "PDL" */
  shortLabel: string;
  price: number;
};

export type ComparativePriceBasis = "live" | "last_close";

export type ComparativePriceRef = {
  price: number;
  basis: ComparativePriceBasis;
  /** Leading clause when not LIVE, e.g. "Using Friday's close, " */
  preface: string;
};

export type ComparativeFollowUpKind =
  | "closer"
  | "distances"
  | "slot_low"
  | "slot_high"
  | "challenge"
  | null;

type HistoryMsg = { role: string; content: string };

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

function parsePriceToken(raw: string): number | null {
  const n = parseFloat(String(raw || "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundMnq(n);
}

const LEVEL_EXTRACTORS: Array<{
  id: string;
  label: string;
  shortLabel: string;
  re: RegExp;
}> = [
  {
    id: "pdh",
    label: "Previous day high",
    shortLabel: "PDH",
    re: /previous day high(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi,
  },
  {
    id: "pdl",
    label: "Previous day low",
    shortLabel: "PDL",
    re: /previous day low(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi,
  },
  {
    id: "pdc",
    label: "Previous day close",
    shortLabel: "PDC",
    re: /previous day close(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi,
  },
  {
    id: "pdh",
    label: "Previous day high",
    shortLabel: "PDH",
    re: /\bpdh\b(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi,
  },
  {
    id: "pdl",
    label: "Previous day low",
    shortLabel: "PDL",
    re: /\bpdl\b(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi,
  },
  {
    id: "session_high",
    label: "Session high",
    shortLabel: "session high",
    re: /(?:new york regular trading hours|session|rth|ny)\s+high(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi,
  },
  {
    id: "session_low",
    label: "Session low",
    shortLabel: "session low",
    re: /(?:new york regular trading hours|session|rth|ny)\s+low(?:\s+is|\s+at|:)?\s*([\d,]+\.?\d*)/gi,
  },
];

/** Pull named levels with prices from assistant (or user) prose. */
export function extractMentionedLevels(text: string): MentionedLevel[] {
  const t = String(text || "");
  if (!t.trim()) return [];
  const byId = new Map<string, MentionedLevel>();
  for (const spec of LEVEL_EXTRACTORS) {
    spec.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = spec.re.exec(t)) != null) {
      const price = parsePriceToken(m[1]);
      if (price == null || !isMnqChartPrice(price)) continue;
      byId.set(spec.id, {
        id: spec.id,
        label: spec.label,
        shortLabel: spec.shortLabel,
        price,
      });
    }
  }
  return [...byId.values()];
}

function recentTextFrom(
  recentText?: string,
  messages?: HistoryMsg[]
): string {
  if (recentText && recentText.trim()) return recentText;
  if (!messages?.length) return "";
  return messages
    .slice(-8)
    .map((m) => m.content)
    .join("\n");
}

/** Levels from the immediately preceding assistant turn(s), falling back to recent window. */
export function priorLevelsFromConversation(
  messages?: HistoryMsg[],
  recentText?: string
): MentionedLevel[] {
  if (messages?.length) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.content) {
      const fromLast = extractMentionedLevels(lastAssistant.content);
      if (fromLast.length) return fromLast;
    }
    const windowLevels = extractMentionedLevels(
      messages
        .slice(-6)
        .map((m) => m.content)
        .join("\n")
    );
    if (windowLevels.length) return windowLevels;
  }
  return extractMentionedLevels(recentTextFrom(recentText, messages));
}

export function priorHasMentionedLevels(
  messages?: HistoryMsg[],
  recentText?: string
): boolean {
  return priorLevelsFromConversation(messages, recentText).length >= 1;
}

/** Distance / nearer phrasing — structural family, not exact sentences. */
export function isComparativeDistancePhrase(text: string): boolean {
  const q = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\bone'?s\b/g, "one is");
  if (!q) return false;

  if (/\bwhich(?: one)?(?: is)? (?:closer|closest|nearest|nearer)\b/.test(q)) return true;

  // Explicit distance / relative phrasing
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
    // bare "near" / "near to" with a desk referent (not "nearly")
    (/\bnear(?:\s+to)?\b/.test(q) && !/\bnearly\b/.test(q));
  if (!hasProx) return false;

  // Proximity + desk/price/level/we/us/market/it referent (covers the natural family)
  if (
    /\b(price|level|levels|pdh|pdl|pdc|support|resistance|we|us|i|current|those|these|market|it)\b/.test(
      q
    )
  ) {
    return true;
  }

  // "closer to what?", "nearest to which?", "nearest level?", "what's nearby?"
  if (/\b(?:closer|closest|nearest|nearer) to (?:what|which)\b/.test(q)) return true;
  if (/^(?:the )?(?:closest|nearest|nearer)(?:\s+(?:level|one|support|resistance))?\??$/.test(q)) {
    return true;
  }
  if (/^what(?:'s| is|s)?\s+nearby\??$/.test(q)) return true;
  if (/^nearest to us\??$/.test(q)) return true;
  if (/^which is (?:closer|closest|nearest|nearer)\??$/.test(q)) return true;
  // "what's closest?", "what is nearer now?"
  if (
    /^what(?:'s| is|s) (?:the )?(?:closer|closest|nearest|nearer)(?:\s+(?:level|one))?(?:\s+now)?\??$/.test(
      q
    )
  ) {
    return true;
  }
  // Bare nearest/closest/nearer fragments
  if (/^(?:nearest|closest|nearer)\??$/.test(q)) return true;

  return false;
}

/** Bare "which" / "which one" — only owns when prior turns named levels. */
export function isBareWhichLevelAnaphora(text: string): boolean {
  const q = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
  return /^(?:which one|which)$/.test(q);
}

export function isLevelSlotFollowUpPhrase(text: string): boolean {
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

export function classifyComparativeFollowUpKind(text: string): ComparativeFollowUpKind {
  const q = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "");
  if (!q) return null;
  if (/\bwhat about the low\b/.test(q) || /\band the low\b/.test(q) || /^(?:the )?low\??$/.test(q)) {
    return "slot_low";
  }
  if (/\bwhat about the high\b/.test(q) || /\band the high\b/.test(q) || /^(?:the )?high\??$/.test(q)) {
    return "slot_high";
  }
  if (
    /\bwhat about (?:the )?pdl\b/.test(q) ||
    /\band (?:the )?pdl\b/.test(q) ||
    /^(?:the )?pdl\??$/.test(q)
  ) {
    return "slot_low";
  }
  if (
    /\bwhat about (?:the )?pdh\b/.test(q) ||
    /\band (?:the )?pdh\b/.test(q) ||
    /^(?:the )?pdh\??$/.test(q)
  ) {
    return "slot_high";
  }
  if (
    /\bhow far\b/.test(q) ||
    /\bhow many points\b/.test(q) ||
    /\brelative to\b/.test(q) ||
    /\bdistance to\b/.test(q) ||
    /\bsitting\b/.test(q)
  ) {
    return "distances";
  }
  if (isBareWhichLevelAnaphora(q) || isBareWhichLevelAnaphora(text)) return "closer";
  if (isComparativeDistancePhrase(q) || isComparativeDistancePhrase(text)) return "closer";
  // Challenge/skepticism about a prior closer/distance claim — re-check arithmetic.
  if (isLevelChallengeFollowUp(text)) return "challenge";
  return null;
}

/**
 * True when this turn is a level comparative / slot follow-up and prior turns
 * already named levels — must not fall through to GENERAL_CHAT / casual.
 */
export function isLevelComparativeFollowUp(
  text: string,
  messages?: HistoryMsg[],
  recentText?: string
): boolean {
  const kind = classifyComparativeFollowUpKind(text);
  if (!kind) return false;
  if (kind === "challenge") {
    // Only own challenges when prior turns actually named levels.
    return priorHasMentionedLevels(messages, recentText);
  }
  return priorHasMentionedLevels(messages, recentText);
}

function isWeekendEt(d: Date): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(d);
  return wd === "Sat" || wd === "Sun";
}

function closedPreface(session: CmeGlobexSessionStatus, now: Date): string {
  if (session.marketState === "MARKET_HOLIDAY") return "Using last/close, ";
  if (isWeekendEt(now)) return "Using Friday's close, ";
  return "Using last/close, ";
}

export type ResolveComparativePriceInput = {
  chartLastPrice?: number | null;
  chartLastPriceSource?: string | null;
  chartLastPriceTs?: number | null;
  /** Desk / Yahoo session last when extension tick absent. */
  deskLastClose?: number | null;
  now?: Date;
  /** Injected session status for tests. */
  session?: CmeGlobexSessionStatus;
};

/**
 * Freshest trustworthy price for level distance math.
 * Open + no live tick → null (honest unavailable).
 * Closed → last/close OK, never labeled LIVE.
 */
export function resolvePriceForLevelCompare(
  input: ResolveComparativePriceInput = {}
): ComparativePriceRef | null {
  const now = input.now ?? new Date();
  const session = input.session ?? getCmeGlobexSessionStatus(now);
  const source = (input.chartLastPriceSource || "none") as LivePriceSource;
  const ts = input.chartLastPriceTs ?? now.getTime();
  const chartPx =
    input.chartLastPrice != null && isMnqChartPrice(input.chartLastPrice)
      ? roundMnq(input.chartLastPrice)
      : null;
  const deskPx =
    input.deskLastClose != null && isMnqChartPrice(input.deskLastClose)
      ? roundMnq(input.deskLastClose)
      : null;

  const auth = resolveAuthoritativePrice({
    chartLastPrice: chartPx,
    chartLastPriceSource: source,
    chartLastPriceTs: ts,
    barClose: deskPx,
    requireTvLive: false,
  });

  if (session.expectFresh) {
    if (isAuthoritativeLiveAvailable(auth)) {
      return { price: auth!.value, basis: "live", preface: "" };
    }
    // Open session: do not treat Yahoo / aged bar close as LIVE.
    if (
      auth &&
      (isLiveTvPriceSource(auth.source) || isTickstreamLiveSource(auth.source)) &&
      auth.ageMs <= LIVE_PRICE_MAX_AGE_MS
    ) {
      return { price: auth.value, basis: "live", preface: "" };
    }
    return null;
  }

  // Closed / holiday / maintenance — last/close is legitimate, never call it LIVE.
  if (chartPx != null) {
    return {
      price: chartPx,
      basis: "last_close",
      preface: closedPreface(session, now),
    };
  }
  if (auth && (isBarClosePriceSource(auth.source) || auth.value > 0)) {
    return {
      price: auth.value,
      basis: "last_close",
      preface: closedPreface(session, now),
    };
  }
  if (deskPx != null) {
    return {
      price: deskPx,
      basis: "last_close",
      preface: closedPreface(session, now),
    };
  }
  return null;
}

function ptsAbs(a: number, b: number): number {
  return Math.round(Math.abs(a - b));
}

function pickSlot(
  levels: MentionedLevel[],
  slot: "low" | "high"
): MentionedLevel | undefined {
  if (slot === "low") {
    return (
      levels.find((l) => l.id === "pdl" || l.id === "session_low") ||
      levels.find((l) => /\blow\b/i.test(l.label)) ||
      [...levels].sort((a, b) => a.price - b.price)[0]
    );
  }
  return (
    levels.find((l) => l.id === "pdh" || l.id === "session_high") ||
    levels.find((l) => /\bhigh\b/i.test(l.label)) ||
    [...levels].sort((a, b) => b.price - a.price)[0]
  );
}

function formatCloserReply(
  levels: MentionedLevel[],
  priceRef: ComparativePriceRef
): string {
  if (levels.length < 2) {
    const only = levels[0];
    const d = ptsAbs(priceRef.price, only.price);
    return `${priceRef.preface}${only.shortLabel} is ${d} pts from current.`.replace(
      /^Using/,
      (s) => s
    );
  }
  const scored = levels.map((l) => ({
    level: l,
    dist: ptsAbs(priceRef.price, l.price),
  }));
  scored.sort((a, b) => a.dist - b.dist || a.level.price - b.level.price);
  const best = scored[0];
  const other = scored[1];
  if (best.dist === other.dist) {
    return `${priceRef.preface}${best.level.shortLabel} and ${other.level.shortLabel} are equidistant — ${best.dist} pts either way.`;
  }
  const nearerWord = priceRef.basis === "last_close" ? "the nearer level" : "closer";
  if (priceRef.preface) {
    return `${priceRef.preface}${best.level.shortLabel} is ${nearerWord} — ${best.dist} pts vs ${other.dist} to ${other.level.shortLabel}.`;
  }
  return `${best.level.shortLabel} is closer — ${best.dist} pts vs ${other.dist} to ${other.level.shortLabel}.`;
}

function formatDistancesReply(
  levels: MentionedLevel[],
  priceRef: ComparativePriceRef
): string {
  const bits = levels.map((l) => {
    const d = ptsAbs(priceRef.price, l.price);
    return `${l.shortLabel} is ${d} pts away`;
  });
  return `${priceRef.preface}${bits.join("; ")}.`;
}

export type AnswerComparativeOpts = {
  question: string;
  messages?: HistoryMsg[];
  recentText?: string;
  chartLastPrice?: number | null;
  chartLastPriceSource?: string | null;
  chartLastPriceTs?: number | null;
  deskLastClose?: number | null;
  now?: Date;
  session?: CmeGlobexSessionStatus;
};

const UNAVAILABLE_LIVE =
  "I don't have a trustworthy current price to compare those levels right now.";

function unavailableCompareReply(now: Date, session: CmeGlobexSessionStatus): string {
  // Closed: never frame as broken LIVE feed — no live tick is expected.
  if (!session.expectFresh) {
    if (isWeekendEt(now)) {
      return "Market's closed for the weekend — I don't have a trustworthy Friday close to measure those levels against.";
    }
    return "Market's closed — I don't have a trustworthy last/close to measure those levels against right now.";
  }
  return UNAVAILABLE_LIVE;
}

/**
 * Deterministic comparative / slot answer, or null when this is not that follow-up.
 */
export function answerComparativeLevelFollowUp(
  opts: AnswerComparativeOpts
): string | null {
  const kind = classifyComparativeFollowUpKind(opts.question);
  if (!kind) return null;
  const levels = priorLevelsFromConversation(opts.messages, opts.recentText);
  if (!levels.length) return null;

  if (kind === "slot_low" || kind === "slot_high") {
    const qLow = opts.question.toLowerCase();
    // Explicit PDH/PDL ask — do not invent from the other side.
    if (/\bpdl\b/.test(qLow) && kind === "slot_low") {
      const hit = levels.find((l) => l.id === "pdl");
      if (!hit) return "I don't have the PDL from what we just covered.";
      return `${hit.label} is ${hit.price.toFixed(2)}.`;
    }
    if (/\bpdh\b/.test(qLow) && kind === "slot_high") {
      const hit = levels.find((l) => l.id === "pdh");
      if (!hit) return "I don't have the PDH from what we just covered.";
      return `${hit.label} is ${hit.price.toFixed(2)}.`;
    }
    const hit = pickSlot(levels, kind === "slot_low" ? "low" : "high");
    if (!hit) {
      return `I don't have the ${kind === "slot_low" ? "low" : "high"} from what we just covered.`;
    }
    return `${hit.label} is ${hit.price.toFixed(2)}.`;
  }

  const now = opts.now ?? new Date();
  const session = opts.session ?? getCmeGlobexSessionStatus(now);
  const priceRef = resolvePriceForLevelCompare({
    chartLastPrice: opts.chartLastPrice,
    chartLastPriceSource: opts.chartLastPriceSource,
    chartLastPriceTs: opts.chartLastPriceTs,
    deskLastClose: opts.deskLastClose,
    now,
    session,
  });
  if (!priceRef) return unavailableCompareReply(now, session);

  if (kind === "distances") return formatDistancesReply(levels, priceRef);
  // closer + challenge: re-state locked nearer-level arithmetic
  return formatCloserReply(levels, priceRef);
}
