import { NextRequest, NextResponse } from "next/server";
import { parseChartPriceInput } from "@/lib/chart-live-price";
import { parseChartSnapshotInput } from "@/lib/chart-snapshot";
import {
  runDeskTracker,
  getDecisionTimeline,
  getLatestTimelineEntry,
} from "@/lib/desk-tracker-engine";
import { getTimelineEntry } from "@/lib/decision-timeline";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const entry = getTimelineEntry(id);
    if (!entry) {
      return NextResponse.json({ error: "not found" }, { status: 404, headers: cors });
    }
    return NextResponse.json({ entry, timeline: getDecisionTimeline() }, { headers: cors });
  }
  return NextResponse.json(
    { timeline: getDecisionTimeline(), latest: getLatestTimelineEntry() ?? null },
    { headers: cors }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const chartSnapshot = parseChartSnapshotInput(body.chartSnapshot ?? body.snapshot);
    const chartLastPrice = parseChartPriceInput(body.chartLastPrice);
    const lastBarTime =
      typeof body.lastBarTime === "number" ? body.lastBarTime : Number(body.lastBarTime) || null;

    const state = await runDeskTracker({
      chartSnapshot,
      chartLastPrice,
      candleClosed: body.candleClosed === true,
      lastBarTime,
      freeze: body.freeze === true,
    });

    return NextResponse.json(
      {
        ...state,
        timeline: getDecisionTimeline(),
      },
      { headers: cors }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
