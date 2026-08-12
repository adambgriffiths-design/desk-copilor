import { NextRequest } from "next/server";
import { streamChatReply, type ChatMessage } from "@/lib/chat-engine";
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

    const { messages: working, understoodAs, raw } = await withVoiceInterpretation(
      messages,
      body.voiceInput === true
    );

    const lastUser = [...working].reverse().find((m) => m.role === "user")?.content ?? "";
    const lastAssistant =
      [...working].reverse().find((m) => m.role === "assistant")?.content ?? "";

    if (wantsChartRead(lastUser, { lastAssistant })) {
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

    const stream = await streamChatReply({
      messages: working,
      symbol: body.symbol,
      lastVerdict: body.lastVerdict,
      forceMarket: body.forceMarket === true,
      voiceInput: body.voiceInput === true,
      voiceRaw: raw,
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
            encoder.encode(`data: ${JSON.stringify({ type: "done", reply: full.trim() })}\n\n`)
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
