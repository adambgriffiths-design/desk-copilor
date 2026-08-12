import { NextRequest, NextResponse } from "next/server";
import {
  VOICE_REALTIME_INSTRUCTIONS,
} from "@/lib/voice-instructions";
import { realtimeVoiceForPreference } from "@/lib/voice-options";
import { formatVoiceDeskContext } from "@/lib/voice-desk-context";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";

const WHISPER_STT_PROMPT =
  "MNQ Nasdaq futures ICT trading previous day high previous day low fair value gap chart read entry target bias verdict";

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
      formatVoiceDeskContext(),
      "Respond in English only.",
    ].join("\n\n");

    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions,
          tools: [],
          tool_choice: "none",
          output_modalities: ["audio"],
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              noise_reduction: { type: "near_field" },
              transcription: { model: "whisper-1", language: "en", prompt: WHISPER_STT_PROMPT },
              turn_detection: {
                type: "server_vad",
                create_response: false,
                interrupt_response: true,
                silence_duration_ms: 1000,
                threshold: 0.4,
                prefix_padding_ms: 400,
              },
            },
            output: {
              format: { type: "audio/pcm", rate: 24000 },
              voice,
            },
          },
        },
      }),
    });

    const data = (await res.json()) as {
      value?: string;
      expires_at?: number;
      session?: { model?: string };
      error?: { message?: string };
    };

    if (!res.ok) {
      const msg = data.error?.message || `Realtime session HTTP ${res.status}`;
      return NextResponse.json({ error: msg }, { status: res.status, headers: cors });
    }

    if (!data.value) {
      return NextResponse.json(
        { error: "No realtime client secret returned" },
        { status: 500, headers: cors }
      );
    }

    return NextResponse.json(
      {
        model: data.session?.model || REALTIME_MODEL,
        client_secret: data.value,
        expires_at: data.expires_at,
        voice,
      },
      { headers: cors }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
