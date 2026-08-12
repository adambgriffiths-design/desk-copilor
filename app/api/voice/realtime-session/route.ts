import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  VOICE_REALTIME_INSTRUCTIONS,
  VOICE_REALTIME_TOOLS,
} from "@/lib/voice-instructions";
import { realtimeVoiceForPreference } from "@/lib/voice-options";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const REALTIME_MODEL =
  (process.env.OPENAI_REALTIME_MODEL as
    | "gpt-4o-realtime-preview-2024-12-17"
    | "gpt-4o-realtime-preview"
    | undefined) || "gpt-4o-realtime-preview-2024-12-17";

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

    const body = await request.json().catch(() => ({}));
    const symbol =
      typeof body.symbol === "string" && body.symbol.trim()
        ? body.symbol.trim()
        : "MNQ1!";
    const voice = realtimeVoiceForPreference(
      typeof body.voice === "string" ? body.voice.trim() : undefined
    );

    const instructions = [
      VOICE_REALTIME_INSTRUCTIONS,
      `Chart symbol: ${symbol}`,
    ].join("\n\n");

    const openai = new OpenAI({ apiKey });
    const session = await openai.beta.realtime.sessions.create({
      model: REALTIME_MODEL,
      voice,
      instructions,
      tools: VOICE_REALTIME_TOOLS,
      turn_detection: { type: "server_vad" },
      input_audio_transcription: { model: "whisper-1" },
    });

    return NextResponse.json(
      {
        model: REALTIME_MODEL,
        client_secret: session.client_secret.value,
        expires_at: session.client_secret.expires_at,
        voice,
      },
      { headers: cors }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
