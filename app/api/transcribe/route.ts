import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import {
  isTranscriptionHallucination,
  TRANSCRIBE_PROMPT,
} from "@/lib/transcription-guard";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const MIN_AUDIO_BYTES = 800;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

async function transcribeBuffer(
  openai: OpenAI,
  buffer: Buffer,
  mime: string,
  ext: string
): Promise<string> {
  const file = await toFile(buffer, `voice.${ext}`, { type: mime });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    language: "en",
    ...(TRANSCRIBE_PROMPT ? { prompt: TRANSCRIBE_PROMPT } : {}),
  });
  const text =
    "text" in transcription && typeof transcription.text === "string"
      ? transcription.text.trim()
      : "";
  if (text && isTranscriptionHallucination(text)) {
    throw new Error("No speech detected");
  }
  return text;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const audioBase64 = body.audioBase64 as string;
    if (!audioBase64) {
      return NextResponse.json(
        { error: "audioBase64 required" },
        { status: 400, headers: cors }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not set" },
        { status: 500, headers: cors }
      );
    }

    const rawMime = (body.mimeType as string) || "audio/webm";
    const mime = rawMime.split(";")[0].trim() || "audio/webm";
    const ext = mime.includes("wav")
      ? "wav"
      : mime.includes("mp4")
        ? "mp4"
        : mime.includes("ogg")
          ? "ogg"
          : "webm";
    const buffer = Buffer.from(audioBase64, "base64");

    if (buffer.length < MIN_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Recording too short — speak longer, then pause" },
        { status: 400, headers: cors }
      );
    }

    const openai = new OpenAI({ apiKey });
    const text = await transcribeBuffer(openai, buffer, mime, ext);

    if (!text) {
      return NextResponse.json({ error: "No speech detected" }, { status: 400, headers: cors });
    }

    return NextResponse.json({ text }, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    const status =
      message.includes("No speech detected") || message.includes("too short") ? 400 : 500;
    return NextResponse.json({ error: message }, { status, headers: cors });
  }
}
