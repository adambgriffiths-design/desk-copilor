import { NextRequest, NextResponse } from "next/server";
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
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400, headers: cors });
    }
    const recentContext =
      typeof body.recentContext === "string" ? body.recentContext.trim() : undefined;
    const messages = Array.isArray(body.messages) ? body.messages : undefined;
    const result = await interpretVoiceInput(text, { recentContext, messages });
    return NextResponse.json(result, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Interpret failed";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
