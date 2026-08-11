import { NextRequest, NextResponse } from "next/server";
import { generateChatReply, type ChatMessage } from "@/lib/chat-engine";
import { wantsChartRead } from "@/lib/chart-read-intent";
import { interpretVoiceInput } from "@/lib/voice-interpret";

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
  voiceInput: boolean
): Promise<{ messages: ChatMessage[]; understoodAs?: string; raw?: string }> {
  if (!voiceInput) return { messages };

  const idx = lastUserIndex(messages);
  if (idx < 0) return { messages };

  const raw = messages[idx].content;
  const { text, changed } = await interpretVoiceInput(raw);
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

    const { messages: working, understoodAs, raw } = await withVoiceInterpretation(
      messages,
      body.voiceInput === true
    );

    const lastUser = [...working].reverse().find((m) => m.role === "user")?.content ?? "";
    const lastAssistant =
      [...working].reverse().find((m) => m.role === "assistant")?.content ?? "";
    if (wantsChartRead(lastUser, { lastAssistant })) {
      return NextResponse.json(
        { needsChartRead: true, reply: "", question: lastUser, understoodAs, raw },
        { headers: cors }
      );
    }

    const result = await generateChatReply({
      messages: working,
      symbol: body.symbol,
      lastVerdict: body.lastVerdict,
      forceMarket: body.forceMarket === true,
      voiceInput: body.voiceInput === true,
      voiceRaw: raw,
    });

    return NextResponse.json({ ...result, understoodAs, raw }, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
