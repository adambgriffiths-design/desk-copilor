import OpenAI from "openai";
import { fetchAllTimeframes } from "@/lib/market-data";
import { buildMarketContext, formatContextForPrompt } from "@/lib/levels";
import { CHAT_SYSTEM_PROMPT } from "@/lib/chat-prompt";
import { readLearnedRules, formatLearnedRulesForPrompt } from "@/lib/learned-rules-store";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatReply = {
  reply: string;
  marketDataWarning: string | null;
};

function estNow(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function wantsMarketContext(text: string): boolean {
  return /\b(mnq|nasdaq|chart|price|level|bias|fvg|org|ce|nwog|liquidity|setup|trade|market|session|macro|premium|discount|structure|mss|ob|opening|kill zone)\b/i.test(
    text
  );
}

export async function generateChatReply(input: {
  messages: ChatMessage[];
  symbol?: string;
  lastVerdict?: string;
  forceMarket?: boolean;
  voiceInput?: boolean;
  voiceRaw?: string;
}): Promise<ChatReply> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const recentUser = input.messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content)
    .join(" ");

  let marketBlock = "";
  let marketDataWarning: string | null = null;

  if (input.forceMarket || wantsMarketContext(recentUser)) {
    try {
      const data = await fetchAllTimeframes();
      const ctx = buildMarketContext(data, estNow());
      marketBlock = formatContextForPrompt(ctx);
    } catch (err) {
      marketDataWarning =
        err instanceof Error ? err.message : "Market data unavailable";
    }
  }

  const learned = await readLearnedRules();
  const learnedText = formatLearnedRulesForPrompt(learned);

  const systemParts = [
    CHAT_SYSTEM_PROMPT,
    learnedText && `Learned desk rules:\n${learnedText}`,
    input.symbol && `Chart symbol: ${input.symbol}`,
    `Current time (EST): ${estNow()}`,
    marketBlock && `Live market JSON:\n${marketBlock}`,
    marketDataWarning && `Note: ${marketDataWarning}`,
    input.lastVerdict &&
      `Their last chart read (may be stale — reference only if relevant):\n${input.lastVerdict.slice(0, 1200)}`,
    input.voiceInput &&
      `Voice mode: trader spoke aloud — STT may garble words. Infer intent; respond with dense facts in full words, no abbreviations.`,
    input.voiceRaw &&
      input.voiceInput &&
      `Raw STT heard: "${input.voiceRaw}"`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const history = input.messages.slice(-16);

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 550,
    messages: [{ role: "system", content: systemParts }, ...history],
  });

  const reply = response.choices[0]?.message?.content?.trim();
  if (!reply) throw new Error("No response from model");

  return { reply, marketDataWarning };
}
