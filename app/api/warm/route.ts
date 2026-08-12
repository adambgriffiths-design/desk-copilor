import { NextResponse } from "next/server";
import { warmMarketDataCache } from "@/lib/market-data";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

/** Pre-fetch Yahoo market data while the extension captures the chart. */
export async function GET() {
  try {
    await warmMarketDataCache();
    return NextResponse.json({ ok: true }, { headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Warm failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: cors });
  }
}

export async function POST() {
  return GET();
}
