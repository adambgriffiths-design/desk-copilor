import { NextRequest, NextResponse } from "next/server";
import { generateChatReply, tryCasualChatReply, type ChatMessage } from "@/lib/chat-engine";
import { needsFullChartRead } from "@/lib/chart-read-intent";
import { classifyChartQuestion, isSnapshotIntent, prefersRichTradingAnswer } from "@/lib/chart-question-intent";
import { interpretVoiceInput, needsVoiceInterpret } from "@/lib/voice-interpret";
import { isNonTradingConversation, isClearlyTrading } from "@/lib/casual-chat-intent";
import { parseChartPriceInput } from "@/lib/chart-live-price";
import { normalizeMemory } from "@/lib/desk-memory";
import { mustUseTradingStream, shouldUseLiveWebSearch } from "@/lib/routing";
import { needsWebSearch, resolveWebSearchQuestion } from "@/lib/web-search-intent";
import { normalizeWeatherStt } from "@/lib/weather-stt";

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages = body.messages as ChatMessage[];
    if (!messages?.length) {
      return NextResponse.json(
        { error: "messages required" },
        { status: 400, headers: cors }
      );
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
    const workingRecent = working
      .slice(-6)
      .map((m) => m.content)
      .join(" ");
    if (
      !isCasual &&
      needsFullChartRead(lastUser, { lastAssistant }) &&
      !isNonTradingConversation(lastUser)
    ) {
      return NextResponse.json(
        { needsChartRead: true, reply: "", question: lastUser, understoodAs, raw },
        { headers: cors }
      );
    }

    const chartLastPrice = parseChartPriceInput(body.chartLastPrice);
    const memory = normalizeMemory(body.memory);

    if (isCasual) {
      const wantsLiveData =
        body.wantsLiveWebData === true || shouldUseLiveWebSearch(lastUser, working);
      const searchQuery =
        typeof body.searchQuery === "string" ? body.searchQuery.trim() : "";
      const reply = await tryCasualChatReply(lastUser, working, {
        memory,
        searchQuery: searchQuery || undefined,
      });
      return NextResponse.json({ reply: reply || "", marketDataWarning: null, understoodAs, raw }, { headers: cors });
    }

    const intent = classifyChartQuestion(lastUser);
    const result = await generateChatReply({
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

    return NextResponse.json({ ...result, understoodAs, raw }, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
