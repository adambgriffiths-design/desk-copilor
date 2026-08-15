import { NextRequest } from "next/server";
import {
  streamChatReply,
  streamCasualChatReply,
  finalizeCasualStreamReply,
  tryCasualChatReplyInstant,
  tryDeterministicMentorFollowUp,
  trySnapshotChatReply,
  tryCurrentMarketReadFastPath,
  isInstantReadLlmSkipEnabled,
  attachPriorReadContext,
  type ChatMessage,
  type ChatPromptInput,
} from "@/lib/chat-engine";
import { needsFullChartRead } from "@/lib/chart-read-intent";
import { classifyChartQuestion, isSnapshotIntent, prefersRichTradingAnswer } from "@/lib/chart-question-intent";
import { interpretVoiceInput, needsVoiceInterpret } from "@/lib/voice-interpret";
import { parseChartPriceInput } from "@/lib/chart-live-price";
import {
  isNonTradingConversation,
  isClearlyTrading,
  isGeneralConversation,
  CASUAL_LLM_FAILURE_REPLY,
  isDeadEndFiller,
} from "@/lib/casual-chat-intent";
import { isStandaloneGeneralTurn } from "@/lib/conversational-intent";
import { classifyDeskRoute, formatDeskRouteDebug } from "@/lib/desk-route-intent";
import { repairConversationalStt } from "@/lib/conversational-normalize";
import { normalizeMemory } from "@/lib/desk-memory";
import { mustUseTradingStream } from "@/lib/routing";
import { normalizeWeatherStt } from "@/lib/weather-stt";
import { stripAssistantNamePrefix } from "@/lib/desk-persona";
import { expandTradingAbbreviations } from "@/lib/plain-language";
import { classifyMentorIntent, mentorContextFromMessages, shouldRefreshMarketState, isMentorFollowUpOnPriorRead } from "@/lib/mentor-intent";
import { enforceVisibleDecisionContract } from "@/lib/decision-contract-output";
import {
  classifyMarketDataFailure,
  formatMarketDataWaitReply,
} from "@/lib/market-data-errors";
import {
  markLiveLatency,
  noteLiveLatency,
  noteLlmUsage,
  snapshotLiveLatency,
} from "@/lib/live-latency-profile";
import {
  beginLiveLatencyTrace,
  emitLiveLatencyTraceIfEnabled,
  liveLatencyTimingsPayload,
  markLiveLatencyStage,
  patchLiveLatencyTraceMeta,
} from "@/lib/live-latency-trace";
import {
  SSE_NO_BUFFER_HEADERS,
  encodeSseEvent,
  flushTradingLlmDeltas,
} from "@/lib/sse-trading-flush";
import {
  answerHistoricalFixtureTurn,
  getHistoricalFixtureSession,
  HISTORICAL_FIXTURE_BANNER,
  labelHistoricalFixtureText,
  parseHistoricalFixtureRequest,
} from "@/lib/research/replay/historical-ui";
import { isDecisionHistoryTimeQuery } from "@/lib/decision-history-query";
import { answerLiveDecisionHistoryQuery } from "@/lib/decision-time-travel";
import { hydrateDecisionMemoryFromStore } from "@/lib/decision-envelope-history";

function polishReply(text: string): string {
  return expandTradingAbbreviations(stripAssistantNamePrefix(text.trim()));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

async function withVoiceInterpretation(
  messages: ChatMessage[],
  voiceInput: boolean,
  voiceSttClean?: boolean
): Promise<{ messages: ChatMessage[]; understoodAs?: string; raw?: string }> {
  if (!voiceInput || voiceSttClean) return { messages };

  const idx = lastUserIndex(messages);
  if (idx < 0) return { messages };

  const raw = messages[idx].content;
  const recentContext = messages
    .slice(Math.max(0, idx - 6), idx)
    .map((m) => m.content)
    .join(" ");
  if (!needsVoiceInterpret(raw, recentContext)) {
    return { messages };
  }

  const { text, changed } = await interpretVoiceInput(raw, { recentContext });
  if (!changed) return { messages };

  const updated = messages.map((m, i) =>
    i === idx ? { ...m, content: text } : m
  );
  return { messages: updated, understoodAs: text, raw };
}

function sseHeaders() {
  return {
    ...cors,
    ...SSE_NO_BUFFER_HEADERS,
  };
}

function sseDone(
  payload: Record<string, unknown>,
  understoodAs?: string,
  raw?: string,
  route?: string
) {
  const out = { ...payload };
  if (typeof out.reply === "string") out.reply = polishReply(out.reply);
  const body = JSON.stringify({
    type: "done",
    understoodAs,
    raw,
    ...(route ? { route } : {}),
    ...out,
  });
  return new Response(`data: ${body}\n\n`, {
    headers: sseHeaders(),
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages = body.messages as ChatMessage[];
    if (!messages?.length) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const lastUserRaw =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    let tradingStream = mustUseTradingStream(lastUserRaw);

    const { messages: working, understoodAs, raw } = tradingStream
      ? await withVoiceInterpretation(messages, body.voiceInput === true, body.voiceSttClean === true)
      : body.casualOnly === true ||
          (!isClearlyTrading(lastUserRaw) && isNonTradingConversation(lastUserRaw))
        ? { messages }
        : await withVoiceInterpretation(messages, body.voiceInput === true, body.voiceSttClean === true);

    const lastUser = repairConversationalStt(
      normalizeWeatherStt(
        [...working].reverse().find((m) => m.role === "user")?.content ?? ""
      )
    );
    const lastAssistant =
      [...working].reverse().find((m) => m.role === "assistant")?.content ?? "";
    const mentorCtx = mentorContextFromMessages(working);
    if (!mentorCtx.lastAssistant) mentorCtx.lastAssistant = lastAssistant;
    attachPriorReadContext(mentorCtx, typeof body.lastVerdict === "string" ? body.lastVerdict : undefined);
    tradingStream = tradingStream || mustUseTradingStream(lastUser, mentorCtx);

    const isCasual =
      !tradingStream &&
      (body.casualOnly === true ||
        isGeneralConversation(lastUser) ||
        isStandaloneGeneralTurn(lastUser) ||
        (!isClearlyTrading(lastUserRaw) && isNonTradingConversation(lastUserRaw)));
    const mentorIntent = classifyMentorIntent(lastUser, mentorCtx);
    const conversationTurn =
      Number(body.conversationTurn) || working.filter((m) => m.role === "user").length;
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const marketSnapshotId =
      typeof body.marketSnapshotId === "string" ? body.marketSnapshotId : null;
    const historicalFixture = parseHistoricalFixtureRequest(
      body.historicalFixture ?? body.historicalMode
    );
    const isHistorical = Boolean(historicalFixture);

    const routeDebug = formatDeskRouteDebug(
      classifyDeskRoute({
        text: lastUser,
        routeText: lastUser,
        lastAssistant,
        messages: working,
      })
    );

    const reqId =
      typeof body.requestId === "string" && body.requestId.trim()
        ? body.requestId.trim()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const requestType = tradingStream
      ? `trading:${mentorIntent}`
      : isCasual
        ? "casual"
        : `desk:${mentorIntent}`;
    beginLiveLatencyTrace(reqId, {
      requestType,
      dataMode: isHistorical ? "HISTORICAL_FIXTURE" : "LIVE",
      fixtureId: historicalFixture?.fixtureId ?? null,
      yahooFetched: isHistorical ? false : null,
      tickstreamUsed: isHistorical ? false : null,
    });
    markLiveLatencyStage("intent_classified");
    patchLiveLatencyTraceMeta({
      requestType,
      dataMode: isHistorical ? "HISTORICAL_FIXTURE" : "LIVE",
      fixtureId: historicalFixture?.fixtureId ?? null,
    });
    noteLiveLatency(
      `route=${routeDebug} tradingStream=${tradingStream} casual=${isCasual} intent=${mentorIntent}${
        isHistorical ? " dataMode=HISTORICAL_FIXTURE" : ""
      }`
    );
    const diag = (responseSource: string, extra: Record<string, unknown> = {}) => ({
      conversationTurn,
      conversationId,
      intent: mentorIntent,
      responseSource,
      marketSnapshotId,
      requestId: reqId,
      ...(isHistorical
        ? {
            dataMode: "HISTORICAL_FIXTURE" as const,
            historicalLabel: HISTORICAL_FIXTURE_BANNER,
            historicalFixture: {
              fixtureId: historicalFixture!.fixtureId,
              barIndex: historicalFixture!.barIndex,
              ...(getHistoricalFixtureSession()
                ? {
                    asOf: getHistoricalFixtureSession()!.asOf,
                    symbol: getHistoricalFixtureSession()!.symbol,
                  }
                : {}),
            },
          }
        : { dataMode: "LIVE" as const }),
      ...extra,
    });
    const maybeLabel = (text: string) =>
      isHistorical && !isCasual ? labelHistoricalFixtureText(text) : text;
    console.log(`[req=${reqId}] chat/stream`, {
      route: routeDebug,
      lastUser: lastUser.slice(0, 80),
      casual: isCasual,
      tradingStream,
      turn: conversationTurn,
      intent: mentorIntent,
      dataMode: isHistorical ? "HISTORICAL_FIXTURE" : "LIVE",
    });

    const workingRecent = working
      .slice(-6)
      .map((m) => m.content)
      .join(" ");

    // Deterministic historical path: same DecisionEnvelope for read + follow-ups; never live.
    if (isHistorical && historicalFixture && !isCasual) {
      const answered = answerHistoricalFixtureTurn(lastUser, working, historicalFixture, {
        lastVerdict: typeof body.lastVerdict === "string" ? body.lastVerdict : undefined,
      });
      markLiveLatencyStage("sse_first_visible_token");
      markLiveLatencyStage("final_response");
      noteLiveLatency(`responseSource=${answered.responseSource}`);
      const latency = liveLatencyTimingsPayload();
      emitLiveLatencyTraceIfEnabled();
      return sseDone(
        {
          reply: answered.reply,
          ...diag(answered.responseSource, {
            historicalFixture: {
              fixtureId: answered.session.fixtureId,
              barIndex: answered.session.barIndex,
              asOf: answered.session.asOf,
              symbol: answered.session.symbol,
              label: answered.session.label,
              decisionKey: answered.decisionKey,
              stance: answered.envelope.stance,
              verdict: answered.session.pipeline.decision.verdict,
              thesis: answered.envelope.thesis,
              conflictLog: answered.envelope.conflictLog,
              invalidation: answered.envelope.invalidation,
              layers: {
                facts: answered.envelope.layers.facts?.slice?.(0, 400) ?? answered.envelope.layers.facts,
                interpretation:
                  answered.envelope.layers.interpretation?.slice?.(0, 400) ??
                  answered.envelope.layers.interpretation,
              },
            },
            timings: {
              ...latency,
              profile: latency.profile ?? snapshotLiveLatency(),
            },
          }),
        },
        understoodAs,
        raw,
        routeDebug
      );
    }

    // LIVE DecisionEnvelope history ring — clock-time / what-changed (never mixes HISTORICAL).
    if (!isHistorical && !isCasual && isDecisionHistoryTimeQuery(lastUser)) {
      // Redis is SoT in production; rehydrate L1 before lookup (cold isolate safe).
      await hydrateDecisionMemoryFromStore({ lane: "LIVE" });
      const traveled = answerLiveDecisionHistoryQuery(lastUser);
      if (traveled) {
        markLiveLatencyStage("sse_first_visible_token");
        markLiveLatencyStage("final_response");
        noteLiveLatency(`responseSource=${traveled.responseSource}`);
        const latency = liveLatencyTimingsPayload();
        emitLiveLatencyTraceIfEnabled();
        return sseDone(
          {
            reply: traveled.reply,
            ...diag(traveled.responseSource, {
              timings: {
                ...latency,
                profile: latency.profile ?? snapshotLiveLatency(),
              },
            }),
          },
          understoodAs,
          raw,
          routeDebug
        );
      }
    }

    if (
      !isHistorical &&
      !isCasual &&
      !tradingStream &&
      !isGeneralConversation(lastUser) &&
      !isStandaloneGeneralTurn(lastUser) &&
      needsFullChartRead(lastUser, { lastAssistant }) &&
      !isNonTradingConversation(lastUser)
    ) {
      console.log(`[req=${reqId}] chat/stream bounce needsChartRead`, lastUser.slice(0, 80));
      return new Response(
        JSON.stringify({
          needsChartRead: true,
          question: lastUser,
          understoodAs,
          raw,
        }),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Historical mode must never mix TradingView live price into the fixture path.
    const chartLastPrice = isHistorical ? null : parseChartPriceInput(body.chartLastPrice);
    const memory = normalizeMemory(body.memory);
    const intent = classifyChartQuestion(lastUser);

    if (isMentorFollowUpOnPriorRead(lastUser, mentorCtx) || tradingStream) {
      const structuredFollowUp = await tryDeterministicMentorFollowUp(
        lastUser,
        working,
        chartLastPrice,
        typeof body.lastVerdict === "string" ? body.lastVerdict : undefined,
        historicalFixture
      );
      if (structuredFollowUp) {
        markLiveLatencyStage("sse_first_visible_token");
        markLiveLatencyStage("final_response");
        noteLiveLatency("responseSource=mentor_structured");
        const latency = liveLatencyTimingsPayload();
        emitLiveLatencyTraceIfEnabled();
        return sseDone(
          {
            reply: maybeLabel(structuredFollowUp),
            ...diag("mentor_structured", {
              timings: { ...latency, profile: latency.profile ?? snapshotLiveLatency() },
            }),
          },
          understoodAs,
          raw,
          routeDebug
        );
      }
    }

    const snapshotReply =
      !isHistorical &&
      !tradingStream &&
      !prefersRichTradingAnswer(lastUser) &&
      (await trySnapshotChatReply(lastUser, chartLastPrice, workingRecent));
    if (snapshotReply && (!body.casualOnly || isSnapshotIntent(intent))) {
      return sseDone({ reply: snapshotReply, ...diag("snapshot") }, understoodAs, raw, routeDebug);
    }

    if (!tradingStream) {
      const instantCasual = await tryCasualChatReplyInstant(lastUser, working, memory, {
        searchQuery: typeof body.searchQuery === "string" ? body.searchQuery.trim() || undefined : undefined,
      });
      if (
        instantCasual &&
        instantCasual !== CASUAL_LLM_FAILURE_REPLY &&
        !isDeadEndFiller(instantCasual)
      ) {
        return sseDone({ reply: instantCasual, ...diag("casual_instant") }, understoodAs, raw, routeDebug);
      }
    }

    if (isCasual || body.casualOnly === true) {
      const stream = await streamCasualChatReply(lastUser, working, memory);
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          if (understoodAs) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "understood", text: understoodAs, raw })}\n\n`
              )
            );
          }

          let full = "";
          try {
            for await (const chunk of stream) {
              if (chunk.usage) noteLlmUsage(chunk.usage);
              const delta = chunk.choices[0]?.delta?.content || "";
              if (!delta) continue;
              full += delta;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`)
              );
            }
            const cleaned = polishReply(finalizeCasualStreamReply(full, lastUser, workingRecent));
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "done", reply: cleaned, understoodAs, raw, route: routeDebug, ...diag("casual_stream") })}\n\n`
              )
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : "Stream failed";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`)
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: sseHeaders(),
      });
    }

    const tPrompt = Date.now();
    let stream;
    let decisionEnvelope;
    let chatInput: ChatPromptInput = {
      messages: working,
      symbol: body.symbol,
      lastVerdict: body.lastVerdict,
      forceMarket:
        body.forceMarket === true ||
        tradingStream ||
        prefersRichTradingAnswer(lastUser) ||
        (isSnapshotIntent(intent) && !isNonTradingConversation(lastUser)),
      voiceInput: body.voiceInput === true,
      voiceRaw: raw,
      chartLastPrice,
      memory,
      historicalFixture,
    };

    // CURRENT_MARKET_READ same-request fast path: formatMentorTradeSpoken, no streamChatReply/OpenAI.
    if (
      tradingStream &&
      !isHistorical &&
      isInstantReadLlmSkipEnabled() &&
      mentorIntent === "CURRENT_MARKET_READ"
    ) {
      const fast = await tryCurrentMarketReadFastPath(chatInput, { tradingStream: true });
      if (fast.kind === "instant") {
        markLiveLatencyStage("sse_first_visible_token");
        markLiveLatencyStage("final_response");
        noteLiveLatency("responseSource=envelope_instant");
        noteLiveLatency("openai_calls=0");
        const latency = liveLatencyTimingsPayload();
        emitLiveLatencyTraceIfEnabled();
        return sseDone(
          {
            reply: maybeLabel(fast.reply),
            decisionEnvelope: fast.decisionEnvelope,
            ...diag("envelope_instant", {
              timings: {
                promptBuildMs: fast.promptBuildMs,
                formatMs: fast.formatMs,
                completeMs: Date.now() - tPrompt,
                openaiCalls: 0,
                marketStateRefresh: shouldRefreshMarketState(mentorIntent, mentorCtx),
                ...latency,
                profile: latency.profile ?? snapshotLiveLatency(),
              },
            }),
          },
          understoodAs,
          raw,
          routeDebug
        );
      }
      if (fast.kind === "quality_gate") {
        markLiveLatencyStage("sse_first_visible_token");
        markLiveLatencyStage("final_response");
        noteLiveLatency("responseSource=quality_gate");
        const latency = liveLatencyTimingsPayload();
        emitLiveLatencyTraceIfEnabled();
        return sseDone(
          {
            reply: maybeLabel(fast.reply),
            ...diag("quality_gate", {
              timings: {
                promptBuildMs: fast.promptBuildMs,
                completeMs: Date.now() - tPrompt,
                openaiCalls: 0,
                marketStateRefresh: shouldRefreshMarketState(mentorIntent, mentorCtx),
                ...latency,
                profile: latency.profile ?? snapshotLiveLatency(),
              },
            }),
          },
          understoodAs,
          raw,
          routeDebug
        );
      }
      if (fast.kind === "fallback_llm") {
        chatInput = { ...chatInput, prebuiltPrompt: fast.prebuilt };
      }
    }

    try {
      const streamed = await streamChatReply(chatInput);
      stream = streamed.stream;
      decisionEnvelope = streamed.decisionEnvelope;
      // Belt-and-suspenders: secondary skip inside streamChatReply (direct callers).
      if (streamed.instantReply) {
        const promptBuildMs = Date.now() - tPrompt;
        markLiveLatencyStage("sse_first_visible_token");
        markLiveLatencyStage("final_response");
        noteLiveLatency(`responseSource=${streamed.responseSource || "envelope_instant"}`);
        noteLiveLatency("openai_calls=0");
        const latency = liveLatencyTimingsPayload();
        emitLiveLatencyTraceIfEnabled();
        return sseDone(
          {
            reply: maybeLabel(streamed.instantReply),
            ...(decisionEnvelope ? { decisionEnvelope } : {}),
            ...diag(streamed.responseSource || "envelope_instant", {
              timings: {
                promptBuildMs,
                completeMs: promptBuildMs,
                openaiCalls: 0,
                marketStateRefresh: shouldRefreshMarketState(mentorIntent, mentorCtx),
                ...latency,
                profile: latency.profile ?? snapshotLiveLatency(),
              },
            }),
          },
          understoodAs,
          raw,
          routeDebug
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("QUALITY_GATE:")) {
        markLiveLatencyStage("sse_first_visible_token");
        markLiveLatencyStage("final_response");
        noteLiveLatency("responseSource=quality_gate");
        const latency = liveLatencyTimingsPayload();
        emitLiveLatencyTraceIfEnabled();
        return sseDone(
          {
            reply: maybeLabel(message.slice("QUALITY_GATE:".length)),
            ...diag("quality_gate", {
              timings: {
                promptBuildMs: Date.now() - tPrompt,
                marketStateRefresh: shouldRefreshMarketState(mentorIntent, mentorCtx),
                ...latency,
                profile: latency.profile ?? snapshotLiveLatency(),
              },
            }),
          },
          understoodAs,
          raw,
          routeDebug
        );
      }
      const kind = classifyMarketDataFailure(err);
      if (
        kind === "MARKET_DATA_TIMEOUT" ||
        kind === "MARKET_DATA_UNAVAILABLE" ||
        kind === "REQUEST_ABORTED"
      ) {
        markLiveLatencyStage("sse_first_visible_token");
        markLiveLatencyStage("final_response");
        noteLiveLatency(`responseSource=market_data_${kind.toLowerCase()}`);
        const latency = liveLatencyTimingsPayload();
        emitLiveLatencyTraceIfEnabled();
        return sseDone(
          {
            reply: formatMarketDataWaitReply(kind),
            ...diag("market_data_wait", {
              failureKind: kind,
              timings: {
                promptBuildMs: Date.now() - tPrompt,
                ...latency,
                profile: latency.profile ?? snapshotLiveLatency(),
              },
            }),
          },
          understoodAs,
          raw,
          routeDebug
        );
      }
      throw err;
    }

    const promptBuildMs = Date.now() - tPrompt;
    if (!stream) throw new Error("No LLM stream");
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        if (understoodAs) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "understood", text: understoodAs, raw })}\n\n`
            )
          );
        }

        let firstTokenMs: number | null = null;
        try {
          // Open the SSE body immediately so Next/proxies do not hold headers until first data.
          controller.enqueue(encoder.encode(": stream-open\n\n"));
          const full = await flushTradingLlmDeltas(stream, (delta) => {
            if (firstTokenMs == null) {
              firstTokenMs = Date.now() - tPrompt;
              markLiveLatencyStage("llm_first_token");
              markLiveLatencyStage("sse_first_visible_token");
            }
            controller.enqueue(encodeSseEvent(encoder, { type: "delta", text: delta }));
          });
          markLiveLatency("t10_llm_complete");
          const polished = polishReply(full);
          // General knowledge must never be replaced with MENTOR/TRADE UNAVAILABLE scaffolding.
          const enforced =
            isGeneralConversation(lastUser) || isStandaloneGeneralTurn(lastUser)
              ? { text: polished, replaced: false, errors: [] as string[] }
              : enforceVisibleDecisionContract(polished, decisionEnvelope);
          const reply = maybeLabel(enforced.text);
          markLiveLatencyStage("final_response");
          const latency = liveLatencyTimingsPayload();
          emitLiveLatencyTraceIfEnabled();
          controller.enqueue(
            encodeSseEvent(encoder, {
              type: "done",
              reply,
              understoodAs,
              raw,
              route: routeDebug,
              replyReplaced: enforced.replaced,
              ...(enforced.replaced ? { validationErrors: enforced.errors } : {}),
              ...(decisionEnvelope ? { decisionEnvelope } : {}),
              ...diag("trading_stream", {
                timings: {
                  promptBuildMs,
                  firstTokenMs,
                  completeMs: Date.now() - tPrompt,
                  marketStateRefresh: shouldRefreshMarketState(mentorIntent, mentorCtx),
                  ...latency,
                  profile: latency.profile ?? snapshotLiveLatency(),
                },
              }),
            })
          );
        } catch (err) {
          const kind = classifyMarketDataFailure(err);
          const message =
            kind === "MARKET_DATA_TIMEOUT" ||
            kind === "MARKET_DATA_UNAVAILABLE" ||
            kind === "REQUEST_ABORTED" ||
            kind === "USER_CANCELLED"
              ? formatMarketDataWaitReply(kind)
              : err instanceof Error
                ? err.message
                : "Stream failed";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: sseHeaders(),
    });
  } catch (err) {
    const kind = classifyMarketDataFailure(err);
    if (
      kind === "MARKET_DATA_TIMEOUT" ||
      kind === "MARKET_DATA_UNAVAILABLE" ||
      kind === "REQUEST_ABORTED" ||
      kind === "USER_CANCELLED"
    ) {
      return new Response(
        JSON.stringify({
          error: formatMarketDataWaitReply(kind),
          failureKind: kind,
        }),
        {
          status: kind === "MARKET_DATA_TIMEOUT" ? 504 : 503,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
