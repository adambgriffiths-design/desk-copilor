import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { ttsVoiceForPreference } from "@/lib/voice-options";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not set" },
        { status: 500, headers: cors }
      );
    }

    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400, headers: cors });
    }

    const voice = ttsVoiceForPreference(
      typeof body.voice === "string" ? body.voice.trim() : undefined
    );

    const openai = new OpenAI({ apiKey });
    const speed =
      typeof body.speed === "number" && body.speed >= 0.5 && body.speed <= 1.2
        ? body.speed
        : 0.92;
    const instructions =
      typeof body.instructions === "string" ? body.instructions.trim().slice(0, 500) : "";
    const useEmotive = instructions.length > 0;
    const speech = await openai.audio.speech.create({
      model: useEmotive ? "gpt-4o-mini-tts" : "tts-1",
      voice,
      input: text.slice(0, 4096),
      response_format: "mp3",
      ...(useEmotive ? { instructions } : { speed }),
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        ...cors,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
