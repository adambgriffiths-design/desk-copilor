import { NextRequest, NextResponse } from "next/server";
import { getTodayStats, rateSessionVerdict } from "@/lib/session-store";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET() {
  const stats = await getTodayStats();
  return NextResponse.json(stats, { headers: cors });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, rating } = body as { id: string; rating: "up" | "down" };

  if (!id || !["up", "down"].includes(rating)) {
    return NextResponse.json(
      { error: "id and rating required" },
      { status: 400, headers: cors }
    );
  }

  const ok = await rateSessionVerdict(id, rating);
  if (!ok) {
    return NextResponse.json({ error: "verdict not found" }, { status: 404, headers: cors });
  }

  const stats = await getTodayStats();
  return NextResponse.json({ ok: true, stats }, { headers: cors });
}
