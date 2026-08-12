import OpenAI from "openai";
import { fetchAllTimeframes } from "@/lib/market-data";
import { buildMarketContext, formatContextForPrompt } from "@/lib/levels";
import { SYSTEM_PROMPT } from "@/lib/playbook";
import { readAllFeedback, getTrainingExamples } from "@/lib/feedback-store";
import { formatTrainingExamplesForPrompt } from "@/lib/training-examples";
import { readLearnedRules, formatLearnedRulesForPrompt } from "@/lib/learned-rules-store";
import { appendSessionLog, type SessionLogEntry } from "@/lib/session-store";
import { liveVerdictUserTail, parseVerdictSections } from "@/lib/verdict-format";
import { buildVoiceSpokenBrief } from "@/lib/voice-spoken-brief";

export type VerdictResult = {
  id: string;
  verdict: string;
  spokenBrief?: string;
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
  voiceInput?: boolean;
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
    liveVerdictUserTail(input.voiceInput),
  ]
    .filter(Boolean)
    .join("\n\n");

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: input.voiceInput ? 900 : 1400,
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

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("No response from model");

  const parsed = input.voiceInput
    ? parseVerdictSections(raw)
    : { verdict: raw.trim(), spokenBrief: "" };

  if (input.voiceInput && marketContext) {
    const canonical = buildVoiceSpokenBrief(
      marketContext,
      parsed.verdict,
      input.question
    );
    if (canonical) parsed.spokenBrief = canonical;
  }

  const id = crypto.randomUUID();
  const entry: SessionLogEntry = {
    id,
    createdAt: new Date().toISOString(),
    symbol: input.symbol,
    chartTime: input.chartTime,
    verdict: parsed.verdict,
    source: "live",
    marketContext,
  };
  await appendSessionLog(entry);

  return {
    id,
    verdict: parsed.verdict,
    spokenBrief: parsed.spokenBrief || undefined,
    marketContext,
    marketDataWarning: marketDataWarning || null,
    learnedRulesVersion: learned.version,
  };
}
