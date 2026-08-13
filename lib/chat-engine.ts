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
import { buildDeskMarketIntelligence, formatIntelligenceForPrompt } from "@/lib/market-intelligence";
import { classifyAnalysisDepth, requiresDeepAnalysisPipeline } from "@/lib/analysis-depth";
import {
  evaluateAnalysisQualityGate,
  formatQualityGateForPrompt,
  type QualityGateResult,
} from "@/lib/analysis-quality-gate";
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

export type ChatPromptInput = {
  messages: ChatMessage[];
  symbol?: string;
  lastVerdict?: string;
  forceMarket?: boolean;
  voiceInput?: boolean;
  voiceRaw?: string;
  chartLastPrice?: number | null;
  memory?: DeskMemory | null;
};

export async function buildChatSystemPrompt(
  input: ChatPromptInput
): Promise<{ system: string; marketDataWarning: string | null }> {
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
      const intel = await buildDeskMarketIntelligence({
        chartLastPrice: input.chartLastPrice,
        forceFresh: true,
      });
      marketBlock = formatIntelligenceForPrompt(intel);
      if (richTrading || requiresDeepAnalysisPipeline(analysisDepth)) {
        const gate = evaluateAnalysisQualityGate(intel, analysisDepth);
        qualityGateResult = gate;
        qualityGateBlock = formatQualityGateForPrompt(gate);
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
  messages?: ChatMessage[]
): Promise<string | null> {
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
    const intel = await buildDeskMarketIntelligence({ chartLastPrice, forceFresh });
    const intelMode = classifyQueryMode(question, conversationContext);
    if (intelMode !== "legacy_snapshot" || useIntel) {
      const answer = tryIntelligenceReply(intel, question, conversationContext);
      if (answer) return answer.spoken;
    }
    if (!isSnapshotIntent(intent)) return null;
    const spoken = buildMarketSnapshotAnswer(intel.ctx, intent, question).spoken;
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
  if (/^Ha — say more/i.test(fallback) && isGeneralConversation(question)) return null;
  if (/^Ha — say more/i.test(fallback)) return null;
  return fallback;
}

export async function streamCasualChatReply(
  question: string,
  messages?: ChatMessage[],
  memory?: DeskMemory | null
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const recentText = (messages || [])
    .slice(-10)
    .map((m) => m.content)
    .join(" ");
  if (
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
    await buildChatSystemPrompt(input);
  const history = input.messages.slice(-16);

  const richVoice =
    input.voiceInput && prefersRichTradingAnswer(lastUser);
  const richPath =
    richTrading ||
    requiresDeepAnalysisPipeline(analysisDepth) ||
    mustUseTradingStream(lastUser);
  if (richPath && qualityGate && !qualityGate.canDeliverVerdict) {
    const reply =
      qualityGate.waitReason ??
      `WAIT — ${qualityGate.missing.slice(0, 4).join("; ")}`;
    return { reply: expandTradingAbbreviations(reply), marketDataWarning };
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

  const { system, qualityGate, richTrading, analysisDepth } = await buildChatSystemPrompt(input);
  const history = input.messages.slice(-16);
  const lastUser =
    [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const richVoice =
    input.voiceInput && prefersRichTradingAnswer(lastUser);
  const richPath =
    richTrading ||
    requiresDeepAnalysisPipeline(analysisDepth) ||
    mustUseTradingStream(lastUser);
  if (richPath && qualityGate && !qualityGate.canDeliverVerdict) {
    const reply =
      qualityGate.waitReason ??
      `WAIT — ${qualityGate.missing.slice(0, 4).join("; ")}`;
    throw new Error(`QUALITY_GATE:${reply}`);
  }

  const openai = new OpenAI({ apiKey });
  return openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: richVoice ? 420 : input.voiceInput ? 220 : 550,
    stream: true,
    messages: [{ role: "system", content: system }, ...history],
  });
}
