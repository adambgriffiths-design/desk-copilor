import { NextRequest, NextResponse } from "next/server";
import {
  appendFeedback,
  createFeedbackEntry,
  getFeedbackStats,
} from "@/lib/feedback-store";
import type { FeedbackRating } from "@/lib/feedback-types";

export const runtime = "nodejs";

export async function GET() {
  const stats = await getFeedbackStats();
  return NextResponse.json(stats);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const rating = body.rating as FeedbackRating;
  const verdict = body.verdict as string;

  if (!rating || !verdict) {
    return NextResponse.json({ error: "rating and verdict required" }, { status: 400 });
  }

  if (!["correct", "partial", "wrong"].includes(rating)) {
    return NextResponse.json({ error: "invalid rating" }, { status: 400 });
  }

  if ((rating === "wrong" || rating === "partial") && !body.correction?.trim()) {
    return NextResponse.json(
      { error: "correction required for partial/wrong ratings" },
      { status: 400 }
    );
  }

  const entry = createFeedbackEntry({
    rating,
    predictMode: Boolean(body.predictMode),
    chartTime: body.chartTime || undefined,
    note: body.note || undefined,
    verdict,
    correction: body.correction?.trim() || undefined,
    marketContext: body.marketContext || undefined,
  });

  await appendFeedback(entry);
  const stats = await getFeedbackStats();

  return NextResponse.json({ ok: true, entry, stats });
}
