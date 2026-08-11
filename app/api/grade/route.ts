import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  appendFeedback,
  createFeedbackEntry,
  getFeedbackStats,
} from "@/lib/feedback-store";
import { GRADE_SYSTEM_PROMPT, type GradeResult } from "@/lib/grade-prompt";
import type { FeedbackEntry } from "@/lib/feedback-types";
import { shouldGradePrediction } from "@/lib/parse-confidence";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set" },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const image = formData.get("image") as File | null;
  const prediction = (formData.get("prediction") as string) || "";
  const chartTime = (formData.get("chartTime") as string) || "";
  const note = (formData.get("note") as string) || "";
  const marketContextRaw = (formData.get("marketContext") as string) || "";
  const autoSave = formData.get("autoSave") !== "false";

  if (!image || !prediction) {
    return NextResponse.json(
      { error: "image and prediction required" },
      { status: 400 }
    );
  }

  const gradeCheck = shouldGradePrediction(prediction);
  if (!gradeCheck.grade) {
    const stats = await getFeedbackStats();
    return NextResponse.json({
      skipped: true,
      confidence: gradeCheck.confidence,
      reason: gradeCheck.reason,
      stats,
    });
  }

  const bytes = await image.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = image.type || "image/png";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  let marketContext: unknown = undefined;
  if (marketContextRaw) {
    try {
      marketContext = JSON.parse(marketContextRaw);
    } catch {
      /* ignore */
    }
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: GRADE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "## Copilot prediction (from left half only)",
                prediction,
                chartTime && `\nChart cut time (EST): ${chartTime}`,
                note && `\nTrader note: ${note}`,
                "\n## Right half chart — describe outcome and grade prediction",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: "No grade returned" }, { status: 502 });
    }

    const grade = JSON.parse(raw) as GradeResult;
    if (!["correct", "partial", "wrong", "miss"].includes(grade.rating)) {
      grade.rating = "partial";
    }

    let stats = await getFeedbackStats();

    if (autoSave) {
      const entry = createFeedbackEntry({
        rating: grade.rating,
        predictMode: true,
        chartTime: chartTime || undefined,
        note: note || undefined,
        verdict: prediction,
        correction:
          grade.rating === "correct"
            ? undefined
            : grade.correction?.trim() ||
              `Outcome: ${grade.outcome}\n\nReason: ${grade.reasoning}`,
        failedConcepts: grade.failedConcepts as FeedbackEntry["failedConcepts"],
        failureReason:
          grade.rating === "miss"
            ? grade.failureReason || "Under-called — stood aside when move happened"
            : grade.failureReason || undefined,
        marketContext,
      });
      await appendFeedback(entry);
      stats = await getFeedbackStats();
    }

    return NextResponse.json({
      ...grade,
      saved: autoSave,
      stats,
      confidence: gradeCheck.confidence,
      gradeNote: gradeCheck.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
