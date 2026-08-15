import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { fetchAllTimeframes } from "@/lib/market-data";
import { buildMarketContext, formatContextForPrompt } from "@/lib/levels";
import { SYSTEM_PROMPT } from "@/lib/playbook";
import { PREDICT_MODE_PROMPT } from "@/lib/predict-prompt";
import { readAllFeedback, getTrainingExamples } from "@/lib/feedback-store";
import { formatTrainingExamplesForPrompt } from "@/lib/training-examples";
import { readLearnedRules, formatLearnedRulesForPrompt } from "@/lib/learned-rules-store";
import { generateChartAnswer } from "@/lib/verdict-engine";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set. Copy .env.example to .env.local" },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const image = formData.get("image") as File | null;
  const chartTime = (formData.get("chartTime") as string) || "";
  const note = (formData.get("note") as string) || "";
  const predictMode = formData.get("predictMode") === "true";

  if (!image) {
    return NextResponse.json({ error: "Chart image required" }, { status: 400 });
  }

  const bytes = await image.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = image.type || "image/png";

  if (!predictMode) {
    try {
      const result = await generateChartAnswer({
        imageBase64: base64,
        mimeType,
        chartTime: chartTime || undefined,
        question: note || "what do you see on the chart",
      });
      return NextResponse.json({
        verdict: result.verdict,
        spokenBrief: result.spokenBrief,
        marketContext: result.marketContext,
        marketDataWarning: result.marketDataWarning,
        predictMode: false,
        deskPipeline: result.deskPipeline,
        decisionEnvelope: result.deskPipeline?.analysis_contract?.decision || null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  let marketContextText = "";
  let marketContext: ReturnType<typeof buildMarketContext> | null = null;
  let marketDataWarning = "";

  try {
    const data = await fetchAllTimeframes();
    marketContext = buildMarketContext(data, chartTime || undefined);
    marketContextText = formatContextForPrompt(marketContext);
  } catch (err) {
    marketDataWarning =
      err instanceof Error
        ? `Market data unavailable: ${err.message}. Proceeding with chart only.`
        : "Market data unavailable. Proceeding with chart only.";
  }

  const dataUrl = `data:${mimeType};base64,${base64}`;

  const allFeedback = await readAllFeedback();
  const trainingExamples = getTrainingExamples(allFeedback);
  const trainingText = formatTrainingExamplesForPrompt(trainingExamples);
  const learned = await readLearnedRules();
  const learnedText = formatLearnedRulesForPrompt(learned);

  const userMessage = [
    learnedText,
    trainingText,
    PREDICT_MODE_PROMPT,
    marketContextText,
    marketDataWarning,
    chartTime && `Chart time (EST): ${chartTime}`,
    note && `Trader note: ${note}`,
    "You are viewing the LEFT HALF of the chart only. Predict what happens on the hidden right half.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userMessage },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const verdict = response.choices[0]?.message?.content;
    if (!verdict) {
      return NextResponse.json({ error: "No response from model" }, { status: 502 });
    }

    return NextResponse.json({
      verdict,
      marketContext,
      marketDataWarning: marketDataWarning || null,
      predictMode,
      trainingExamplesLoaded: trainingExamples.length,
      learnedRulesVersion: learned.version,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
