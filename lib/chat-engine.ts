import OpenAI from "openai";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat-prompt";
import { readLearnedRules, formatLearnedRulesForPrompt } from "@/lib/learned-rules-store";
import {
  classifyChartQuestion,
  isFirstPresentedFvgQuestion,
  isSnapshotIntent,
  prefersRichTradingAnswer,
  resolveSnapshotIntent,
} from "@/lib/chart-question-intent";
import {
  isCasualChat,
  casualChatFallback,
  sanitizeCasualReply,
  isInCasualThread,
  isGenericCasualReply,
  isTradingRedirect,
  stripSteerBack,
  isGeneralConversation,
  isStaleCasualMismatch,
  isClearlyTrading,
  CASUAL_LLM_FAILURE_REPLY,
} from "@/lib/casual-chat-intent";
import { isLiveWeatherReply, isWeatherGuessReply, tryWebSearchReply } from "@/lib/web-search-reply";
import {
  needsWebSearch,
  resolveWebSearchQuestion,
  isIdentityQuestion,
  isPersonaQuestion,
} from "@/lib/web-search-intent";
import {
  LIVE_DATA_FALLBACK,
  mustUseTradingStream,
  shouldUseLiveWebSearch,
} from "@/lib/routing";
import { resolveSearchQuestion, shouldDeferCasualRoute } from "@/lib/pending-request";
import { buildMarketSnapshotAnswer } from "@/lib/market-snapshot";
import { expandTradingAbbreviations } from "@/lib/plain-language";
import { parseChartPriceInput } from "@/lib/chart-live-price";
import {
  classifyQueryMode,
  extractConversationContext,
  needsMarketIntelligenceAnswer,
  tryIntelligenceReply,
} from "@/lib/conversational-query";
import {
  buildDeskMarketIntelligence,
  formatIntelligenceForPrompt,
  peekLiveDeskIntelligenceCache,
  tryReuseLiveDeskIntelligence,
  type DeskMarketIntelligence,
} from "@/lib/market-intelligence";
import {
  answerComparativeLevelFollowUp,
  isLevelComparativeFollowUp,
} from "@/lib/level-comparative-followup";
import { classifyAnalysisDepth, requiresDeepAnalysisPipeline, type AnalysisDepth } from "@/lib/analysis-depth";
import {
  evaluateAnalysisQualityGate,
  formatQualityGateForPrompt,
  type QualityGateResult,
} from "@/lib/analysis-quality-gate";
import { flushDecisionMemoryWrites } from "@/lib/decision-envelope-history";
import type { DecisionEnvelope } from "@/lib/decision-envelope";
import { validateDecisionEnvelope } from "@/lib/decision-envelope";
import {
  formatMentorTradeSpoken,
  formatQualityGateSpokenReply,
  formatStructuredInvalidationFollowUp,
  formatStructuredWaitFollowUp,
  formatWhyNotDirectionFollowUp,
  resolveUserPresentationMode,
} from "@/lib/decision-contract-output";
import { getLastPipelineResult, replaceLastPipelineResult } from "@/lib/desk-pipeline";
import {
  classifyMentorIntent,
  hasPriorMarketRead,
  isBareMentorFollowUp,
  isMentorFollowUpOnPriorRead,
  isPriorReadFollowUpPhrase,
  mentorContextFromMessages,
  parseWhyNotDirection,
  requestsFreshMarketState,
  shouldRefreshMarketState,
  type MentorIntent,
  type MentorIntentContext,
} from "@/lib/mentor-intent";
import {
  classifyMarketDataFailure,
  formatMarketDataWaitReply,
  MarketDataError,
} from "@/lib/market-data-errors";
import { bumpLiveLatency, noteLiveLatency } from "@/lib/live-latency-profile";
import { markLiveLatencyStage, patchLiveLatencyTraceMeta } from "@/lib/live-latency-trace";
import {
  buildHistoricalFixtureIntelligence,
  getHistoricalFixtureSession,
  labelHistoricalFixtureText,
  type HistoricalFixtureRequest,
} from "@/lib/research/replay/historical-ui";
import { isDecisionHistoryTimeQuery } from "@/lib/decision-history-query";
import { answerLiveDecisionHistoryQuery } from "@/lib/decision-time-travel";
import { CASUAL_CHAT_SYSTEM_PROMPT } from "@/lib/casual-chat-prompt";
import { formatMemoryForPrompt, normalizeMemory, userMemoryReply, isUserMemoryQuestion, type DeskMemory } from "@/lib/desk-memory";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatReply = {
  reply: string;
  marketDataWarning: string | null;
};

function estNow(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function wantsMarketContext(text: string): boolean {
  return /\b(mnq|nasdaq|chart|price|level|bias|fvg|org|ce|nwog|liquidity|setup|trade|market|session|macro|premium|discount|structure|mss|ob|opening|kill zone)\b/i.test(
    text
  );
}

export type BuiltChatPrompt = {
  system: string;
  marketDataWarning: string | null;
  qualityGate?: QualityGateResult;
  richTrading: boolean;
  analysisDepth: ReturnType<typeof classifyAnalysisDepth>;
};

export type ChatPromptInput = {
  messages: ChatMessage[];
  symbol?: string;
  lastVerdict?: string;
  forceMarket?: boolean;
  voiceInput?: boolean;
  voiceRaw?: string;
  chartLastPrice?: number | null;
  chartLastPriceSource?: string | null;
  chartLastPriceTs?: number | null;
  chartSnapshot?: import("./chart-snapshot").ChartSnapshotPayload | null;
  chartExportFailed?: boolean;
  memory?: DeskMemory | null;
  /**
   * Same-request reuse only: when the stream route already ran buildChatSystemPrompt
   * for the CURRENT_MARKET_READ fast path and fell through to LLM.
   */
  prebuiltPrompt?: BuiltChatPrompt;
};

export function attachPriorReadContext(
  ctx: MentorIntentContext,
  lastVerdict?: string | null
): MentorIntentContext {
  const verdict = String(lastVerdict || "").trim();
  if (verdict) ctx.lastVerdict = verdict;
  return ctx;
}

/**
 * Same-request CURRENT_MARKET_READ deterministic fast path.
 * Default ON — skip OpenAI when this request already has a valid quality-gate envelope.
 * Disable with KAREN_INSTANT_READ_LLM_SKIP=0|false|no|off.
 * Never reads lastPipeline / LIVE ring / Redis / HISTORICAL / Analyse RAM.
 */
export function isInstantReadLlmSkipEnabled(): boolean {
  const v = process.env.KAREN_INSTANT_READ_LLM_SKIP?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  return true;
}

export type InstantReadSkipResult = {
  reply: string;
  decisionEnvelope: DecisionEnvelope;
  responseSource: "envelope_instant";
};

/**
 * Present THIS request's quality-gate DecisionEnvelope without OpenAI.
 * Envelope must already exist from evaluateAnalysisQualityGate on the same request.
 */
export function tryInstantReadFromQualityGate(opts: {
  question: string;
  mentorCtx?: MentorIntentContext;
  qualityGate?: QualityGateResult | null;
  /** When set, never take the LIVE envelope instant path (historical uses fixture formatters). */
  historicalFixture?: unknown | null;
  /** Must be true — mirrors tradingStream on /api/chat/stream. */
  tradingStream?: boolean;
}): InstantReadSkipResult | null {
  if (!isInstantReadLlmSkipEnabled()) return null;
  if (opts.tradingStream !== true) return null;
  // LIVE instant path only — historical uses fixture session / existing historical formatters.
  if (opts.historicalFixture) return null;
  const intent = classifyMentorIntent(opts.question, opts.mentorCtx);
  if (intent !== "CURRENT_MARKET_READ") return null;
  const gate = opts.qualityGate;
  if (!gate || gate.canDeliverVerdict !== true) return null;
  const env = gate.decisionEnvelope;
  if (!env) return null;
  const verr = validateDecisionEnvelope(env);
  if (verr.length > 0) return null;
  if (!env.stance || !env.primaryHorizon?.timeframe || !env.primaryHorizon?.lean) return null;
  if (!env.read?.htfContext?.horizon || !env.read?.currentStructure?.horizon) return null;
  if (!String(env.invalidation?.condition || "").trim()) return null;
  let reply: string;
  try {
    reply = formatMentorTradeSpoken(env, { mode: resolveUserPresentationMode() });
  } catch {
    return null;
  }
  if (!reply.trim()) return null;
  const mode = resolveUserPresentationMode();
  if (mode === "structured") {
    if (!/TRADE DECISION:/i.test(reply) || !/MENTOR VIEW:/i.test(reply)) return null;
  } else if (
    !/\bI(?:'m| am)\s+(WAITING|LONG|SHORT|NO_TRADE)\b/i.test(reply) &&
    !/\bso I(?:'m| am)\s+(WAITING|LONG|SHORT|NO_TRADE)\b/i.test(reply) &&
    !/\bUntil then I(?:'m| am)\s+(WAITING|LONG|SHORT|NO_TRADE)\b/i.test(reply)
  ) {
    return null;
  }
  return {
    reply: expandTradingAbbreviations(reply),
    decisionEnvelope: env,
    responseSource: "envelope_instant",
  };
}

export type CurrentMarketReadFastPathResult =
  | {
      kind: "instant";
      reply: string;
      decisionEnvelope: DecisionEnvelope;
      responseSource: "envelope_instant";
      formatMs: number;
      promptBuildMs: number;
      openaiCalls: 0;
    }
  | {
      kind: "quality_gate";
      reply: string;
      promptBuildMs: number;
      openaiCalls: 0;
    }
  | {
      kind: "fallback_llm";
      prebuilt: BuiltChatPrompt;
      promptBuildMs: number;
    }
  | { kind: "skip" };

/**
 * Route-level CURRENT_MARKET_READ fast path: one buildChatSystemPrompt, then
 * formatMentorTradeSpoken — never calls OpenAI. On soft miss, returns prebuilt
 * for streamChatReply so the pipeline is not evaluated twice.
 */
export async function tryCurrentMarketReadFastPath(
  input: ChatPromptInput,
  opts: { tradingStream: boolean }
): Promise<CurrentMarketReadFastPathResult> {
  if (!isInstantReadLlmSkipEnabled()) return { kind: "skip" };
  if (!opts.tradingStream) return { kind: "skip" };

  const lastUser =
    [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  // History intents never rebuild MarketState / quality-gate for a live read.
  if (isDecisionHistoryTimeQuery(lastUser)) return { kind: "skip" };
  const mentorCtx = mentorContextFromMessages(input.messages);
  attachPriorReadContext(mentorCtx, input.lastVerdict);
  if (classifyMentorIntent(lastUser, mentorCtx) !== "CURRENT_MARKET_READ") {
    return { kind: "skip" };
  }

  const t0 = Date.now();
  const prebuilt = await buildChatSystemPrompt(input);
  const promptBuildMs = Date.now() - t0;
  const { qualityGate, richTrading, analysisDepth } = prebuilt;
  const richPath =
    richTrading ||
    requiresDeepAnalysisPipeline(analysisDepth) ||
    mustUseTradingStream(lastUser);

  if (
    richPath &&
    qualityGate &&
    !qualityGate.canDeliverVerdict &&
    !isGeneralConversation(lastUser) &&
    !isCasualChat(lastUser)
  ) {
    const reply = formatQualityGateSpokenReply(qualityGate, {
      mode: resolveUserPresentationMode(),
    });
    return {
      kind: "quality_gate",
      reply: expandTradingAbbreviations(reply),
      promptBuildMs,
      openaiCalls: 0,
    };
  }

  const tFormat = Date.now();
  const instant = tryInstantReadFromQualityGate({
    question: lastUser,
    mentorCtx,
    qualityGate,
    tradingStream: true,
  });
  if (instant) {
    return {
      kind: "instant",
      reply: instant.reply,
      decisionEnvelope: instant.decisionEnvelope,
      responseSource: instant.responseSource,
      formatMs: Date.now() - tFormat,
      promptBuildMs,
      openaiCalls: 0,
    };
  }

  return { kind: "fallback_llm", prebuilt, promptBuildMs };
}

const PREVIOUS_DECISION_BANNER =
  "PREVIOUS DECISION — explaining the last spoken call, not a new snapshot.";
const PREVIOUS_DECISION_BANNER_PLAIN =
  "About my previous read (not a new snapshot):";

function labelPreviousDecision(spoken: string): string {
  const t = String(spoken || "").trim();
  if (!t) return t;
  if (/^PREVIOUS DECISION/i.test(t) || /^About my previous read/i.test(t)) return t;
  const banner =
    resolveUserPresentationMode() === "plain"
      ? PREVIOUS_DECISION_BANNER_PLAIN
      : PREVIOUS_DECISION_BANNER;
  return `${banner}\n${t}`;
}

export type StructuredWaitFollowUpResult = {
  reply: string;
  responseSource: "wait_structured";
  openaiCalls: 0;
};

/**
 * F6 surgical wire: WAIT_EXPLANATION → recorded last pipeline decision →
 * formatStructuredWaitFollowUp. Sync only — no market refresh, no forbidden
 * latency / market-error / replay-UI modules.
 */
export function tryStructuredWaitFollowUpFromLastPipeline(
  question: string,
  mentorCtx?: MentorIntentContext
): StructuredWaitFollowUpResult | null {
  const intent = classifyMentorIntent(question, mentorCtx);
  if (intent !== "WAIT_EXPLANATION") return null;
  const pipe = getLastPipelineResult();
  const env = pipe?.analysis_contract?.decision;
  if (!pipe || !env) return null;
  const ctx = {
    long_case: pipe.interpretation.long_case,
    short_case: pipe.interpretation.short_case,
    entry_model: pipe.interpretation.entry_model,
    rejected_alternative: pipe.analysis_contract?.rejected_alternative,
  };
  let spoken: string;
  try {
    spoken = formatStructuredWaitFollowUp(env, ctx, {
      mode: resolveUserPresentationMode(),
    });
  } catch {
    return null;
  }
  if (!String(spoken || "").trim()) return null;
  return {
    reply: expandTradingAbbreviations(labelPreviousDecision(spoken)),
    responseSource: "wait_structured",
    openaiCalls: 0,
  };
}

export type StructuredWhyNotFollowUpResult = {
  reply: string;
  responseSource: "why_not_structured";
  openaiCalls: 0;
};

/**
 * Why-not long/short → last pipeline envelope → formatWhyNotDirectionFollowUp.
 * Deterministic; skips OpenAI when an envelope is available.
 */
export function tryStructuredWhyNotFollowUpFromLastPipeline(
  question: string,
  mentorCtx?: MentorIntentContext
): StructuredWhyNotFollowUpResult | null {
  const direction = parseWhyNotDirection(question);
  if (!direction) return null;
  const pipe = getLastPipelineResult();
  const env = pipe?.analysis_contract?.decision;
  if (!pipe || !env) return null;
  const ctx = {
    long_case: pipe.interpretation.long_case,
    short_case: pipe.interpretation.short_case,
    entry_model: pipe.interpretation.entry_model,
    rejected_alternative: pipe.analysis_contract?.rejected_alternative,
  };
  let spoken: string;
  try {
    spoken = formatWhyNotDirectionFollowUp(env, direction, ctx, {
      mode: resolveUserPresentationMode(),
    });
  } catch {
    return null;
  }
  if (!String(spoken || "").trim()) return null;
  return {
    reply: expandTradingAbbreviations(labelPreviousDecision(spoken)),
    responseSource: "why_not_structured",
    openaiCalls: 0,
  };
}

/** Follow-ups that explain a prior envelope must not QUALITY_GATE on missing OHLC. */
export function shouldSkipQualityGate(
  question: string,
  ctx?: MentorIntentContext
): boolean {
  if (requestsFreshMarketState(question, ctx)) return false;
  if (isMentorFollowUpOnPriorRead(question, ctx)) return true;
  if (isPriorReadFollowUpPhrase(question)) return true;
  const intent = classifyMentorIntent(question, ctx);
  return !shouldRefreshMarketState(intent, ctx);
}

const STRUCTURED_FOLLOWUP_INTENTS: ReadonlySet<MentorIntent> = new Set([
  "WAIT_EXPLANATION",
  "INVALIDATION",
]);

export function needsStructuredWaitFollowUp(
  question: string,
  ctx?: ReturnType<typeof mentorContextFromMessages>
): boolean {
  if (parseWhyNotDirection(question) != null) return true;
  if (isPriorReadFollowUpPhrase(question)) return true;
  const intent = classifyMentorIntent(question, ctx);
  if (STRUCTURED_FOLLOWUP_INTENTS.has(intent)) return true;
  if (ctx && hasPriorMarketRead(ctx)) {
    if (
      intent === "EXPLAIN_PREVIOUS_MARKET_READ" ||
      intent === "WAIT_EXPLANATION" ||
      intent === "BIAS_EXPLANATION"
    ) {
      return true;
    }
    if (isBareMentorFollowUp(question)) return true;
  }
  return false;
}

function noteFollowUpReuse(): void {
  bumpLiveLatency("mentor_followup_reuse");
  noteLiveLatency("followup_rebuilds_intel=no");
  noteLiveLatency("market_refresh=skip_prior_read");
  noteLiveLatency("live_context=hit");
  patchLiveLatencyTraceMeta({ cache: "HIT", missReason: null, new1mBarInvalidation: false });
  markLiveLatencyStage("market_context_complete");
}

function answerStructuredFollowUpFromLastPipeline(
  question: string,
  mentorCtx?: MentorIntentContext,
  historical?: boolean
): string | null {
  const hist = historical ? getHistoricalFixtureSession() : null;
  const pipe = hist?.pipeline ?? getLastPipelineResult();
  const env = pipe?.analysis_contract?.decision;
  if (!pipe || !env) return null;
  const ctx = {
    long_case: pipe.interpretation.long_case,
    short_case: pipe.interpretation.short_case,
    entry_model: pipe.interpretation.entry_model,
    rejected_alternative: pipe.analysis_contract?.rejected_alternative,
  };
  const mode = resolveUserPresentationMode();
  const label = (spoken: string) => {
    const base = labelPreviousDecision(spoken);
    return historical ? labelHistoricalFixtureText(base) : base;
  };
  const whyNot = parseWhyNotDirection(question);
  if (whyNot) return label(formatWhyNotDirectionFollowUp(env, whyNot, ctx, { mode }));
  const intent = classifyMentorIntent(question, mentorCtx);
  if (intent === "WAIT_EXPLANATION") return label(formatStructuredWaitFollowUp(env, ctx, { mode }));
  if (intent === "INVALIDATION") return label(formatStructuredInvalidationFollowUp(env, { mode }));
  if (
    intent === "EXPLAIN_PREVIOUS_MARKET_READ" ||
    intent === "BIAS_EXPLANATION" ||
    isPriorReadFollowUpPhrase(question)
  ) {
    return label(formatMentorTradeSpoken(env, { mode }));
  }
  return null;
}

async function buildIntelForMentorFollowUp(
  question: string,
  mentorCtx: ReturnType<typeof mentorContextFromMessages> | undefined,
  chartLastPrice?: number | null
): Promise<DeskMarketIntelligence> {
  const intent = classifyMentorIntent(question, mentorCtx);
  const refresh = shouldRefreshMarketState(intent, mentorCtx);
  if (!refresh) {
    const reused = tryReuseLiveDeskIntelligence() || peekLiveDeskIntelligenceCache()?.intel || null;
    if (reused) return reused;
    throw new Error("followup_no_cached_envelope");
  }
  const forceFresh = chartLastPrice != null;
  try {
    return await buildDeskMarketIntelligence({ chartLastPrice, forceFresh });
  } catch (err) {
    const kind = classifyMarketDataFailure(err);
    // Do not double-wait on timeout / unavailable — retry would poison UX.
    if (
      kind === "MARKET_DATA_TIMEOUT" ||
      kind === "MARKET_DATA_UNAVAILABLE" ||
      kind === "REQUEST_ABORTED" ||
      kind === "USER_CANCELLED"
    ) {
      throw err instanceof MarketDataError
        ? err
        : new MarketDataError(kind, formatMarketDataWaitReply(kind), { cause: err });
    }
    return buildDeskMarketIntelligence({ forceFresh: false });
  }
}

function loadHistoricalIntelForChat(
  req: HistoricalFixtureRequest,
  analysisDepth: AnalysisDepth
): { intel: DeskMarketIntelligence; qualityGate?: QualityGateResult } {
  const session = buildHistoricalFixtureIntelligence(req);
  const prev = getLastPipelineResult();
  try {
    const gate = evaluateAnalysisQualityGate(session.intel, analysisDepth);
    bumpLiveLatency("decision_envelope_builds");
    markLiveLatencyStage("decision_envelope_complete");
    return { intel: session.intel, qualityGate: gate };
  } finally {
    replaceLastPipelineResult(prev);
  }
}

/** Deterministic envelope-backed mentor follow-up — bypasses LLM paraphrase. */
export async function tryDeterministicMentorFollowUp(
  question: string,
  messages?: ChatMessage[],
  chartLastPrice?: number | null,
  lastVerdict?: string | null,
  historicalFixture?: HistoricalFixtureRequest | null
): Promise<string | null> {
  const conversationContext = messages?.length ? extractConversationContext(messages) : undefined;
  const mentorCtx = messages?.length ? mentorContextFromMessages(messages) : undefined;
  if (mentorCtx) attachPriorReadContext(mentorCtx, lastVerdict);
  if (mentorCtx && conversationContext && !conversationContext.lastAssistant && mentorCtx.lastAssistant) {
    conversationContext.lastAssistant = mentorCtx.lastAssistant;
  }
  if (!needsStructuredWaitFollowUp(question, mentorCtx)) return null;
  const historical = Boolean(historicalFixture);
  try {
    const intent = classifyMentorIntent(question, mentorCtx);
    const refresh =
      !isMentorFollowUpOnPriorRead(question, mentorCtx) &&
      shouldRefreshMarketState(intent, mentorCtx);
    if (historical) {
      const session =
        getHistoricalFixtureSession() ??
        buildHistoricalFixtureIntelligence(historicalFixture || {});
      noteFollowUpReuse();
      if (!refresh) {
        const answer = tryIntelligenceReply(session.intel, question, conversationContext);
        if (answer?.spoken) {
          return labelHistoricalFixtureText(labelPreviousDecision(answer.spoken));
        }
        return answerStructuredFollowUpFromLastPipeline(question, mentorCtx, true);
      }
      const loaded = loadHistoricalIntelForChat(historicalFixture || {}, "DEEP_ANALYSIS");
      const answer = tryIntelligenceReply(loaded.intel, question, conversationContext);
      if (answer?.spoken) return labelHistoricalFixtureText(answer.spoken);
      return answerStructuredFollowUpFromLastPipeline(question, mentorCtx, true);
    }
    if (!refresh) {
      const reused = tryReuseLiveDeskIntelligence() || peekLiveDeskIntelligenceCache()?.intel || null;
      if (reused) {
        noteFollowUpReuse();
        const answer = tryIntelligenceReply(reused, question, conversationContext);
        if (answer?.spoken) return labelPreviousDecision(answer.spoken);
      }
      const fromPipe = answerStructuredFollowUpFromLastPipeline(question, mentorCtx, false);
      if (fromPipe) {
        noteFollowUpReuse();
        return fromPipe;
      }
      return null;
    }
    const intel = await buildIntelForMentorFollowUp(question, mentorCtx, chartLastPrice);
    bumpLiveLatency("mentor_followup_intel");
    noteLiveLatency("followup_rebuilds_intel=yes");
    const answer = tryIntelligenceReply(intel, question, conversationContext);
    return answer?.spoken ?? null;
  } catch (err) {
    const kind = classifyMarketDataFailure(err);
    if (
      kind === "MARKET_DATA_TIMEOUT" ||
      kind === "MARKET_DATA_UNAVAILABLE" ||
      kind === "REQUEST_ABORTED"
    ) {
      return formatMarketDataWaitReply(kind);
    }
    if (!shouldRefreshMarketState(classifyMentorIntent(question, mentorCtx), mentorCtx)) {
      return answerStructuredFollowUpFromLastPipeline(question, mentorCtx, historical);
    }
    return null;
  }
}

export async function buildChatSystemPrompt(
  input: ChatPromptInput
): Promise<BuiltChatPrompt> {
  const recentUser = input.messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content)
    .join(" ");
  const lastUser =
    [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  let marketBlock = "";
  let marketDataWarning: string | null = null;
  let qualityGateBlock = "";
  let qualityGateResult: QualityGateResult | undefined;

  const analysisDepth = classifyAnalysisDepth({ text: lastUser });
  const richTrading =
    !isCasualChat(lastUser) &&
    (prefersRichTradingAnswer(lastUser) || requiresDeepAnalysisPipeline(analysisDepth));

  if (
    input.forceMarket ||
    wantsMarketContext(recentUser) ||
    wantsMarketContext(lastUser) ||
    richTrading
  ) {
    try {
      // Reuse ~45s Yahoo cache unless a live chart tick forces refresh.
      // Quality gate still runs on the reused MarketState — freshness not weakened.
      const intel = await Promise.race([
        buildDeskMarketIntelligence({
          chartLastPrice: input.chartLastPrice,
          chartLastPriceSource: input.chartLastPriceSource,
          chartLastPriceTs: input.chartLastPriceTs,
          chartSnapshot: input.chartSnapshot,
          chartExportFailed: input.chartExportFailed,
          forceFresh: input.chartLastPrice != null,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Market data timed out")), 25000);
        }),
      ]);
      marketBlock = formatIntelligenceForPrompt(intel);
      if (richTrading || requiresDeepAnalysisPipeline(analysisDepth)) {
        const gate = evaluateAnalysisQualityGate(intel, analysisDepth);
        qualityGateResult = gate;
        qualityGateBlock = formatQualityGateForPrompt(gate);
        // Persist LIVE DecisionEnvelope to shared store when Redis is configured.
        await flushDecisionMemoryWrites();
      }
    } catch (err) {
      marketDataWarning =
        err instanceof Error ? err.message : "Market data unavailable";
    }
  }

  const learned = await readLearnedRules();
  const learnedText = formatLearnedRulesForPrompt(learned);
  const memoryBlock = formatMemoryForPrompt(normalizeMemory(input.memory));
  const includeLastVerdict =
    Boolean(input.lastVerdict) &&
    (!isSnapshotIntent(classifyChartQuestion(lastUser)) || richTrading);

  const system = [
    CHAT_SYSTEM_PROMPT,
    memoryBlock,
    learnedText && `Learned desk rules:\n${learnedText}`,
    input.symbol && `Chart symbol: ${input.symbol}`,
    `Current time (EST): ${estNow()}`,
    marketBlock && `Live market context:\n${marketBlock}`,
    qualityGateBlock,
    marketDataWarning && `Note: ${marketDataWarning}`,
    includeLastVerdict &&
      `Their last chart read (may be stale — reference only if relevant):\n${input.lastVerdict!.slice(0, 1200)}`,
    richTrading &&
      `Analytical trading question (DEEP): evidence-based read in 3–8 sentences. Separate lean from entry call. Cite observation facts by id. State invalidation and what you are waiting for if entry is not active. Never a one-liner or transcript-only guess.`,
    input.voiceInput &&
      analysisDepth === "FAST_FACT" &&
      `Voice FAST_FACT: answer in 1–3 sentences from market state only. Cite only prices/levels present in the intelligence block.`,
    input.voiceInput &&
      richTrading &&
      `Voice DEEP_ANALYSIS: you may have already acknowledged — now deliver the full read. Do NOT repeat the ack; do NOT shorten to sound fast.`,
    input.voiceRaw &&
      input.voiceInput &&
      `Raw STT heard: "${input.voiceRaw}"`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, marketDataWarning, qualityGate: qualityGateResult, richTrading, analysisDepth };
}

/** JSON-only reply for narrow chart questions — skips GPT. */
export async function trySnapshotChatReply(
  question: string,
  chartLastPrice?: number | null,
  recentText?: string,
  messages?: ChatMessage[],
  priceMeta?: { source?: string | null; timestamp?: number | null }
): Promise<string | null> {
  // Comparative level arithmetic first — no full chart read; works even if
  // isCasualChat would otherwise swallow anaphora ("which is closer?").
  if (isLevelComparativeFollowUp(question, messages, recentText)) {
    let deskLastClose: number | null = null;
    try {
      const intel = await buildDeskMarketIntelligence({
        chartLastPrice,
        chartLastPriceSource: priceMeta?.source,
        chartLastPriceTs: priceMeta?.timestamp,
        forceFresh: chartLastPrice != null,
      });
      deskLastClose = intel.ctx.daily?.lastClose ?? intel.state.lastPrice ?? null;
    } catch {
      deskLastClose = null;
    }
    const spoken = answerComparativeLevelFollowUp({
      question,
      messages,
      recentText,
      chartLastPrice,
      chartLastPriceSource: priceMeta?.source,
      chartLastPriceTs: priceMeta?.timestamp,
      deskLastClose,
    });
    if (spoken) return expandTradingAbbreviations(spoken);
  }

  if (isCasualChat(question, recentText)) return null;
  if (shouldDeferCasualRoute(question, messages)) return null;
  if (prefersRichTradingAnswer(question)) return null;
  if (requiresDeepAnalysisPipeline(classifyAnalysisDepth({ text: question }))) return null;
  const intent = resolveSnapshotIntent(question);
  const conversationContext = messages?.length
    ? extractConversationContext(messages)
    : undefined;
  const useIntel =
    needsMarketIntelligenceAnswer(question) ||
    (conversationContext?.lastFactIds?.length && /\b(that|it|still|invalidat)/i.test(question));
  if (!isSnapshotIntent(intent) && !useIntel) return null;
  try {
    const forceFresh = intent === "price" || chartLastPrice != null;
    const intel = await buildDeskMarketIntelligence({
      chartLastPrice,
      chartLastPriceSource: priceMeta?.source,
      chartLastPriceTs: priceMeta?.timestamp,
      forceFresh,
    });
    const intelMode = classifyQueryMode(question, conversationContext);
    if (intelMode !== "legacy_snapshot" || useIntel) {
      const answer = tryIntelligenceReply(intel, question, conversationContext);
      if (answer) return answer.spoken;
    }
    if (!isSnapshotIntent(intent)) return null;
    const spoken = buildMarketSnapshotAnswer(intel.ctx, intent, question, {
      dataQuality: intel.observation.data_quality,
    }).spoken;
    if (
      isFirstPresentedFvgQuestion(question) &&
      intent === "first_presented_fvg" &&
      /\bdaily\b/i.test(spoken) &&
      !/\bone-minute\b/i.test(spoken)
    ) {
      console.error("[trySnapshotChatReply] FPFVG answer leaked daily FVG", { question, intent });
      return null;
    }
    return expandTradingAbbreviations(spoken);
  } catch {
    return null;
  }
}

function isWeatherQuestion(text: string): boolean {
  const q = text.trim().toLowerCase();
  return (
    needsWebSearch(q) ||
    /\b(weather|temperature|temp|forecast|whether)\b/.test(q) ||
    /\bwhat(?:'s|s| is)\s+(?:it\s+)?like\s+(?:in|at|for)\s+[a-z]/.test(q)
  );
}

function acceptLiveDataReply(reply: string | null, question: string): string | null {
  if (!reply) return null;
  if (!isWeatherQuestion(question)) return reply;
  if (isLiveWeatherReply(reply)) return reply;
  if (isWeatherGuessReply(reply)) return null;
  return null;
}

/** Instant casual reply — web search + rules, no LLM. */
export async function tryCasualChatReplyInstant(
  question: string,
  messages?: ChatMessage[],
  memory?: DeskMemory | null,
  opts?: { searchQuery?: string }
): Promise<string | null> {
  if (mustUseTradingStream(question)) return null;

  if (isUserMemoryQuestion(question)) {
    const memReply = userMemoryReply(question, memory);
    if (memReply) return memReply;
  }

  const webReply = await tryWebSearchReply(
    resolveSearchQuestion(question, messages),
    messages,
    { memory, messages, searchQuery: opts?.searchQuery }
  );
  const accepted = acceptLiveDataReply(webReply, question);
  if (accepted) return accepted;
  if (
    !isPersonaQuestion(question) &&
    (needsWebSearch(question) || needsWebSearch(resolveWebSearchQuestion(question, messages)))
  ) {
    const intent = classifyChartQuestion(question);
    if (isClearlyTrading(question) || isSnapshotIntent(intent) || prefersRichTradingAnswer(question)) {
      return null;
    }
    return LIVE_DATA_FALLBACK;
  }

  const recentText = (messages || [])
    .slice(-6)
    .map((m) => m.content)
    .join(" ");

  const fallback = casualChatFallback(question, recentText, messages);
  if (!fallback) return null;
  if (
    isGeneralConversation(question) &&
    (fallback === CASUAL_LLM_FAILURE_REPLY || /^Ha — say more/i.test(fallback))
  ) {
    return null;
  }
  if (/^Ha — say more/i.test(fallback)) return null;
  return fallback;
}

export async function streamCasualChatReply(
  question: string,
  messages?: ChatMessage[],
  memory?: DeskMemory | null,
  opts?: { force?: boolean }
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const recentText = (messages || [])
    .slice(-10)
    .map((m) => m.content)
    .join(" ");
  if (
    !opts?.force &&
    !isCasualChat(question, recentText) &&
    !isInCasualThread(messages || []) &&
    !isGeneralConversation(question)
  ) {
    throw new Error("Not a casual question");
  }

  const openai = new OpenAI({ apiKey });
  const history = (messages || [])
    .slice(-12)
    .filter((m) => m.role === "user" || m.role === "assistant");
  const memoryBlock = formatMemoryForPrompt(normalizeMemory(memory));
  const system = [CASUAL_CHAT_SYSTEM_PROMPT, memoryBlock].filter(Boolean).join("\n\n");

  return openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 160,
    temperature: 0.85,
    stream: true,
    messages: [{ role: "system", content: system }, ...history],
  });
}

/** Prefer LLM personality; only fall back when reply is clearly broken. */
export function finalizeCasualStreamReply(
  raw: string,
  question: string,
  recentText?: string
): string {
  const text = raw.trim();
  if (!text) return casualChatFallback(question, recentText);
  const stripped = stripSteerBack(text);
  if (!stripped || stripped.length < 4) return casualChatFallback(question, recentText);
  if (isTradingRedirect(stripped) || isGenericCasualReply(stripped)) {
    return sanitizeCasualReply(text, question, recentText);
  }
  if (isStaleCasualMismatch(stripped, question)) {
    return casualChatFallback(question, recentText);
  }
  return stripped;
}

export async function tryCasualChatReply(
  question: string,
  messages?: ChatMessage[],
  opts?: { forceLlm?: boolean; memory?: DeskMemory | null; searchQuery?: string }
): Promise<string | null> {
  const instant = await tryCasualChatReplyInstant(question, messages, opts?.memory, {
    searchQuery: opts?.searchQuery,
  });
  const wantsLiveData = shouldUseLiveWebSearch(question, messages);
  if (instant && (!opts?.forceLlm || wantsLiveData)) {
    if (isIdentityQuestion(question)) return instant;
    return acceptLiveDataReply(instant, question) || (wantsLiveData ? LIVE_DATA_FALLBACK : instant);
  }
  if (wantsLiveData && !isPersonaQuestion(question)) return instant || LIVE_DATA_FALLBACK;

  const recentText = (messages || [])
    .slice(-6)
    .map((m) => m.content)
    .join(" ");
  if (
    !opts?.forceLlm &&
    !isCasualChat(question, recentText) &&
    !isInCasualThread(messages || []) &&
    !isGeneralConversation(question)
  ) {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const stream = await streamCasualChatReply(question, messages, opts?.memory);
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) full += delta;
      }
      const text = full.trim();
      const stripped = text ? stripSteerBack(text) : null;
      const cleaned =
        stripped && !isTradingRedirect(stripped) && !isGenericCasualReply(stripped)
          ? stripped
          : text
            ? finalizeCasualStreamReply(text, question, recentText)
            : null;
      if (cleaned && !(wantsLiveData && isWeatherGuessReply(cleaned))) {
        if (wantsLiveData) {
          return acceptLiveDataReply(cleaned, question) || LIVE_DATA_FALLBACK;
        }
        return cleaned;
      }
    } catch {
      /* offline fallback below */
    }
  }
  return casualChatFallback(question, recentText);
}

export async function generateChatReply(
  input: ChatPromptInput
): Promise<ChatReply> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const lastUser = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  if (isDecisionHistoryTimeQuery(lastUser)) {
    const traveled = answerLiveDecisionHistoryQuery(lastUser);
    if (traveled?.reply) {
      return { reply: traveled.reply, marketDataWarning: null };
    }
  }

  if (!mustUseTradingStream(lastUser)) {
    const casualReply = await tryCasualChatReply(lastUser, input.messages, {
      memory: input.memory,
    });
    if (casualReply) {
      return { reply: expandTradingAbbreviations(casualReply), marketDataWarning: null };
    }
  }

  const recentText = input.messages
    .slice(-6)
    .map((m) => m.content)
    .join(" ");

  const snapshotReply = await trySnapshotChatReply(
    lastUser,
    input.chartLastPrice,
    recentText,
    input.messages
  );
  if (snapshotReply) {
    return { reply: snapshotReply, marketDataWarning: null };
  }

  const { system, marketDataWarning, qualityGate, richTrading, analysisDepth } =
    input.prebuiltPrompt ?? (await buildChatSystemPrompt(input));
  const history = input.messages.slice(-16);

  const mentorCtx = mentorContextFromMessages(input.messages);
  attachPriorReadContext(mentorCtx, input.lastVerdict);
  const richVoice =
    input.voiceInput && prefersRichTradingAnswer(lastUser);
  const richPath =
    richTrading ||
    requiresDeepAnalysisPipeline(analysisDepth) ||
    mustUseTradingStream(lastUser);
  if (richPath && qualityGate && !qualityGate.canDeliverVerdict) {
    const reply = formatQualityGateSpokenReply(qualityGate, {
      mode: resolveUserPresentationMode(),
    });
    return { reply: expandTradingAbbreviations(reply), marketDataWarning };
  }

  const instant = tryInstantReadFromQualityGate({
    question: lastUser,
    mentorCtx,
    qualityGate,
    tradingStream: mustUseTradingStream(lastUser),
  });
  if (instant) {
    return { reply: instant.reply, marketDataWarning };
  }

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: richVoice ? 420 : input.voiceInput ? 220 : 550,
    messages: [{ role: "system", content: system }, ...history],
  });

  const reply = response.choices[0]?.message?.content?.trim();
  if (!reply) throw new Error("No response from model");

  return { reply: expandTradingAbbreviations(reply), marketDataWarning };
}

export async function streamChatReply(input: ChatPromptInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const lastUserEarly =
    [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  // Defense: history must never fall through to quality-gate / OpenAI MarketState rebuild.
  if (isDecisionHistoryTimeQuery(lastUserEarly)) {
    const traveled = answerLiveDecisionHistoryQuery(lastUserEarly);
    if (traveled?.reply) {
      return {
        stream: null,
        instantReply: traveled.reply,
        responseSource: traveled.responseSource,
        openaiCalls: 0 as const,
      };
    }
  }

  const { system, qualityGate, richTrading, analysisDepth } =
    input.prebuiltPrompt ?? (await buildChatSystemPrompt(input));
  const history = input.messages.slice(-16);
  const lastUser =
    [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const mentorCtx = mentorContextFromMessages(input.messages);
  attachPriorReadContext(mentorCtx, input.lastVerdict);
  const richVoice =
    input.voiceInput && prefersRichTradingAnswer(lastUser);
  const richPath =
    richTrading ||
    requiresDeepAnalysisPipeline(analysisDepth) ||
    mustUseTradingStream(lastUser);
  if (richPath && qualityGate && !qualityGate.canDeliverVerdict) {
    const reply = formatQualityGateSpokenReply(qualityGate, {
      mode: resolveUserPresentationMode(),
    });
    // Return spoken WAIT as a normal reply — do not HTTP 500 / needsChartRead-bounce the extension.
    return { stream: null, instantReply: reply };
  }

  // Secondary safety net (non-stream / direct callers). Stream route prefers
  // tryCurrentMarketReadFastPath so streamChatReply is not entered on success.
  const instant = tryInstantReadFromQualityGate({
    question: lastUser,
    mentorCtx,
    qualityGate,
    tradingStream: mustUseTradingStream(lastUser),
  });
  if (instant) {
    return {
      stream: null,
      decisionEnvelope: instant.decisionEnvelope,
      instantReply: instant.reply,
      responseSource: instant.responseSource,
      openaiCalls: 0 as const,
    };
  }

  const openai = new OpenAI({ apiKey });
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: richVoice ? 420 : input.voiceInput ? 220 : 550,
    stream: true,
    messages: [{ role: "system", content: system }, ...history],
  });
  return { stream, openaiCalls: 1 as const };
}
