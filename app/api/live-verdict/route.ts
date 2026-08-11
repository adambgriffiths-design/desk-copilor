import { NextRequest, NextResponse } from "next/server";
import { generateLiveVerdict } from "@/lib/verdict-engine";
import { interpretVoiceInput } from "@/lib/voice-interpret";

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
    const body = await request.json();
    const imageBase64 = body.imageBase64 as string;
    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 required" },
        { status: 400, headers: cors }
      );
    }

    let question = body.question as string | undefined;
    let understoodAs: string | undefined;
    if (body.voiceInput && question) {
      const interpreted = await interpretVoiceInput(question);
      question = interpreted.text;
      if (interpreted.changed) understoodAs = interpreted.text;
    }

    const result = await generateLiveVerdict({
      imageBase64,
      mimeType: body.mimeType || "image/png",
      symbol: body.symbol,
      chartTime: body.chartTime || estNow(),
      question,
    });

    return NextResponse.json(
      understoodAs ? { ...result, understoodAs } : result,
      { headers: cors }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}

function estNow(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
