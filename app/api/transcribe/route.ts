import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const WHISPER_PROMPT =
  "MNQ Nasdaq mini futures ICT trading desk. Chart read, FVG, ORG, CE, MSS, liquidity, bias, premium, discount, what do you see.";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
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
    const ext = mime.includes("wav") ? "wav" : mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
    const buffer = Buffer.from(audioBase64, "base64");

    if (buffer.length < 500) {
      return NextResponse.json(
        { error: "Recording too short — speak longer, then pause" },
        { status: 400, headers: cors }
      );
    }

    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(buffer, `voice.${ext}`, { type: mime }),
      model: "whisper-1",
      language: "en",
      prompt: WHISPER_PROMPT,
    });

    const text = transcription.text?.trim() || "";
    if (!text) {
      return NextResponse.json({ error: "No speech detected" }, { status: 400, headers: cors });
    }

    return NextResponse.json({ text }, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
