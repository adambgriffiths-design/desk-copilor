import { NextRequest } from "next/server";
import {
  streamChatReply,
  streamCasualChatReply,
  finalizeCasualStreamReply,
  tryCasualChatReplyInstant,
  trySnapshotChatReply,
  type ChatMessage,
} from "@/lib/chat-engine";
import { needsFullChartRead } from "@/lib/chart-read-intent";
import { classifyChartQuestion, isSnapshotIntent, prefersRichTradingAnswer } from "@/lib/chart-question-intent";
import { interpretVoiceInput, needsVoiceInterpret } from "@/lib/voice-interpret";
import { parseChartPriceInput } from "@/lib/chart-live-price";
import { isNonTradingConversation, isClearlyTrading } from "@/lib/casual-chat-intent";
import { classifyDeskRoute, formatDeskRouteDebug } from "@/lib/desk-route-intent";
import { normalizeMemory } from "@/lib/desk-memory";
import { mustUseTradingStream } from "@/lib/routing";
import { normalizeWeatherStt } from "@/lib/weather-stt";
import { stripAssistantNamePrefix } from "@/lib/desk-persona";
import { expandTradingAbbreviations } from "@/lib/plain-language";

function polishReply(text: string): string {
  return expandTradingAbbreviations(stripAssistantNamePrefix(text.trim()));
}

export const runtime = "nodejs";

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
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
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

    const lastUser = normalizeWeatherStt(
      [...working].reverse().find((m) => m.role === "user")?.content ?? ""
    );
    tradingStream = tradingStream || mustUseTradingStream(lastUser);

    const isCasual =
      !tradingStream &&
      (body.casualOnly === true ||
        (!isClearlyTrading(lastUserRaw) && isNonTradingConversation(lastUserRaw)));
    const lastAssistant =
      [...working].reverse().find((m) => m.role === "assistant")?.content ?? "";

    const routeDebug = formatDeskRouteDebug(
      classifyDeskRoute({
        text: lastUser,
        routeText: lastUser,
        lastAssistant,
        messages: working,
      })
    );

    const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    console.log(`[req=${reqId}] chat/stream`, {
      route: routeDebug,
      lastUser: lastUser.slice(0, 80),
      casual: isCasual,
      tradingStream,
    });

    const workingRecent = working
      .slice(-6)
      .map((m) => m.content)
      .join(" ");

    if (
      !isCasual &&
      needsFullChartRead(lastUser, { lastAssistant }) &&
      !isNonTradingConversation(lastUser)
    ) {
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

    const chartLastPrice = parseChartPriceInput(body.chartLastPrice);
    const memory = normalizeMemory(body.memory);
    const intent = classifyChartQuestion(lastUser);

    const snapshotReply =
      !tradingStream &&
      !prefersRichTradingAnswer(lastUser) &&
      (await trySnapshotChatReply(lastUser, chartLastPrice, workingRecent));
    if (snapshotReply && (!body.casualOnly || isSnapshotIntent(intent))) {
      return sseDone({ reply: snapshotReply }, understoodAs, raw, routeDebug);
    }

    if (!tradingStream) {
      const instantCasual = await tryCasualChatReplyInstant(lastUser, working, memory, {
        searchQuery: typeof body.searchQuery === "string" ? body.searchQuery.trim() || undefined : undefined,
      });
      if (instantCasual) {
        return sseDone({ reply: instantCasual }, understoodAs, raw, routeDebug);
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
                `data: ${JSON.stringify({ type: "done", reply: cleaned, understoodAs, raw, route: routeDebug })}\n\n`
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
        headers: {
          ...cors,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const stream = await streamChatReply({
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
    });

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
            const delta = chunk.choices[0]?.delta?.content || "";
            if (!delta) continue;
            full += delta;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`)
            );
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", reply: polishReply(full), understoodAs, raw, route: routeDebug })}\n\n`
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
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
