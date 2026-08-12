import OpenAI from "openai";
import { fetchAllTimeframes } from "@/lib/market-data";
import { buildMarketContext, formatContextForPrompt } from "@/lib/levels";
import { SYSTEM_PROMPT } from "@/lib/playbook";
import { readAllFeedback, getTrainingExamples } from "@/lib/feedback-store";
import { formatTrainingExamplesForPrompt } from "@/lib/training-examples";
import { readLearnedRules, formatLearnedRulesForPrompt } from "@/lib/learned-rules-store";
import { appendSessionLog, type SessionLogEntry } from "@/lib/session-store";

export type VerdictResult = {
  id: string;
  verdict: string;
  marketContext: ReturnType<typeof buildMarketContext> | null;
  marketDataWarning: string | null;
  learnedRulesVersion: number;
};

export async function generateLiveVerdict(input: {
  imageBase64: string;
  mimeType?: string;
  symbol?: string;
  chartTime?: string;
  question?: string;
}): Promise<VerdictResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  let marketContextText = "";
  let marketContext: ReturnType<typeof buildMarketContext> | null = null;
  let marketDataWarning = "";

  try {
    const data = await fetchAllTimeframes();
    marketContext = buildMarketContext(data, input.chartTime);
    marketContextText = formatContextForPrompt(marketContext);
  } catch (err) {
    marketDataWarning =
      err instanceof Error
        ? `Market data unavailable: ${err.message}`
        : "Market data unavailable";
  }

  const mime = input.mimeType || "image/png";
  const dataUrl = `data:${mime};base64,${input.imageBase64}`;

  const allFeedback = await readAllFeedback();
  const trainingText = formatTrainingExamplesForPrompt(getTrainingExamples(allFeedback));
  const learned = await readLearnedRules();
  const learnedText = formatLearnedRulesForPrompt(learned);

  const userMessage = [
    learnedText,
    trainingText,
    marketContextText,
    marketDataWarning && `Note: ${marketDataWarning}`,
    input.symbol && `Chart symbol: ${input.symbol}`,
    input.chartTime && `Chart time (EST): ${input.chartTime}`,
    input.question &&
      `Trader asked: "${input.question}" — answer that directly in line 1 of your desk brief.`,
    "LIVE SESSION — Analyze this Nasdaq futures one-minute chart. Use auto-fetched daily/fifteen-minute/five-minute JSON context. **Make a directional call (potential buy or potential sell) at medium confidence by default** — stand aside only if a hard no-trade rule applies. **Include Entry zone, Entry status (ACTIVE/WAIT/EXTENDED), Wait for, Target 1, Target 2, Exit plan** from Execution scaffold. **Do NOT recommend stops.** **Multiple FVGs: retrace to most recent gap only** — older lower bullish / higher bearish gaps may not fill. No deep retrace through opposite MSS. Respond with a dense labeled desk brief in full words (no abbreviations).",
  ]
    .filter(Boolean)
    .join("\n\n");

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1400,
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
  if (!verdict) throw new Error("No response from model");

  const id = crypto.randomUUID();
  const entry: SessionLogEntry = {
    id,
    createdAt: new Date().toISOString(),
    symbol: input.symbol,
    chartTime: input.chartTime,
    verdict,
    source: "live",
    marketContext,
  };
  await appendSessionLog(entry);

  return {
    id,
    verdict,
    marketContext,
    marketDataWarning: marketDataWarning || null,
    learnedRulesVersion: learned.version,
  };
}
