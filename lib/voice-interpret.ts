import OpenAI from "openai";
import {
  applyContextualSttFixes,
  needsContextualInterpret,
  formatRecentContext,
} from "@/lib/voice-context-fix";

const TRADING_INTERPRET_PROMPT = `You fix garbled speech-to-text for an MNQ futures trader using ICT concepts at the desk.

Input is a raw voice transcript — often wrong words, missing punctuation, homophones.

Output ONLY the corrected phrase the trader likely meant — one short sentence or question. No quotes, no explanation, no prefix.

Keep MNQ as MNQ. Fix obvious STT errors only (char→chart, reed→read, homophones).

Examples:
- "what do you see on the char" → what do you see on the chart
- "whereas previews stay low" → where is previous day low
- "where is previews day high" → where is previous day high

Keep their intent. Do not invent content they did not say.`;

const CASUAL_INTERPRET_PROMPT = `You fix speech-to-text errors using the recent conversation as context.

The user is chatting casually with Karen (desk co-pilot personality) — food, travel, music, life. STT often mishears homophones.

Use recent messages to pick words that fit the thread. Fix only obvious mishearings — do not change their meaning.

Examples:
- Travel thread about Italy, "Amalfi Ghost" → Amalfi Coast
- Travel thread, "Positano ghost" → Positano coast
- Food thread, "butter kitchen" → butter chicken
- "that's what I said, the Amalfi Ghost" (after coast/Italy talk) → that's what I said, the Amalfi Coast

Output ONLY the corrected sentence. No quotes, no explanation.`;

/** Safe trading homophones only — bubble text; no casual/context rewrites. */
export const CANONICAL_RULE_FIXES: [RegExp, string][] = [
  [/\bem en q\b/gi, "MNQ"],
  [/\bm and q\b/gi, "MNQ"],
  [/\bwhats\b/gi, "what's"],
  [/\bwhos\b/gi, "who's"],
  [/\bwheres\b/gi, "where's"],
  [/\bhows\b/gi, "how's"],
  [/\bf v g\b/gi, "fair value gap"],
  [/\bo r g\b/gi, "opening range gap"],
  [/\bwhat do you see on the char\b/gi, "what do you see on the chart"],
  [/\blook at the char\b/gi, "look at the chart"],
  [/\bcheck the char\b/gi, "check the chart"],
  [/\bon the char\b/gi, "on the chart"],
  [/\bwhat(?:'s|s| is) the char doing\b/gi, "what is the chart doing"],
  [/\bhow(?:'s|s| is) the char doing\b/gi, "how is the chart doing"],
  [/\bwhat(?:'s|s| is) the mark it doing\b/gi, "what is the market doing"],
  [/\bhow(?:'s|s| is) the mark it doing\b/gi, "how is the market doing"],
  [/\bchart reed\b/gi, "chart read"],
  [/\byour reed\b/gi, "your read"],
  [/\bgive me a reed\b/gi, "give me a read"],
  [/\bwhereas previews stay low\b/gi, "where is previous day low"],
  [/\bwhere is previews day low\b/gi, "where is previous day low"],
  [/\bwhere is previews day high\b/gi, "where is previous day high"],
  [/\bpreviews day low\b/gi, "previous day low"],
  [/\bpreviews day high\b/gi, "previous day high"],
  [/\bpreview day low\b/gi, "previous day low"],
  [/\bpreview day high\b/gi, "previous day high"],
  [/\bp d l\b/gi, "PDL"],
    [/\bp d h\b/gi, "PDH"],
    [/\bnas deck\b/gi, "nasdaq"],
    [/\bnas duck\b/gi, "nasdaq"],
    [/\bdealing ranch\b/gi, "dealing range"],
    [/\bpremium this count\b/gi, "premium discount"],
    [/\bem mini\b/gi, "e-mini"],
    [/\bmicro many\b/gi, "micro mini"],
    [/\bliquidity sweet\b/gi, "liquidity sweep"],
    [/\bfair value photo\b/gi, "fair value gap"],
  [/\bfirst percentage (?:of )?fair value gap\b/gi, "first presented fair value gap"],
  [/\bfirst percent (?:of )?fair value gap\b/gi, "first presented fair value gap"],
  [/\bfirst percentage fvg\b/gi, "first presented fvg"],
  [/\bfirst percent fvg\b/gi, "first presented fvg"],
  [/\bwhere is the first percentage fair value gap\b/gi, "where is the first presented fair value gap"],
  [/\bwhere(?:'s| is) the first percentage fair value gap\b/gi, "where is the first presented fair value gap"],
  [/\blast daily bullish photo\b/gi, "where is the last daily bullish fvg"],
  [/\bdaily bullish photo\b/gi, "daily bullish fvg"],
    [/\bdaily bearish photo\b/gi, "daily bearish fvg"],
    [/\bwhat(?:'s|s| is)\s+(?:the\s+)?whether\b/gi, "what's the weather"],
    [/\bhow(?:'s|s| is)\s+(?:the\s+)?whether\b/gi, "how's the weather"],
    [/\bwhat(?:'s|s| is)\s+(?:the\s+)?wetter\b/gi, "what's the weather"],
    [/\bhow(?:'s|s| is)\s+(?:the\s+)?wetter\b/gi, "how's the weather"],
    [/\bwetter\s+(?:in|at|for)\b/gi, "weather in"],
    [/\bwhat(?:'s|s| is)\s+(?:the\s+)?weird\s+(?:in|at|for)\b/gi, "what's the weather in"],
    [/\bhow(?:'s|s| is)\s+(?:the\s+)?weird\s+(?:in|at|for)\b/gi, "how's the weather in"],
    [/\b(?:i'?m|im|what)\s+here\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\s+(?:in|at|for)\b/gi, "what's the weather in"],
    [/\b(?:i'?m|im|what)\s+here\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/gi, "what's the weather"],
    [/\bhere\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\s+(?:in|at|for)\b/gi, "weather in"],
    [/\bhere\s+at\s+(?:the\s+)?(?:weather|whether|wetter)\b/gi, "weather"],
    [/\balamalfi coast\b/gi, "Amalfi Coast"],
    [/\balamalfi\b/gi, "Amalfi"],
  ];

export const ROUTING_ONLY_RULE_FIXES: [RegExp, string][] = [
  [/\beli macdonald\b/gi, "do you like mcdonalds"],
  [/\bat our mcdonald'?s?\b/gi, "do you like mcdonalds"],
  [/\bdo you like mcdonald'?s?\b/gi, "do you like mcdonalds"],
];

/** @deprecated use CANONICAL_RULE_FIXES + ROUTING_ONLY_RULE_FIXES */
export const RULE_FIXES: [RegExp, string][] = [
  ...CANONICAL_RULE_FIXES,
  ...ROUTING_ONLY_RULE_FIXES,
];

export function applyCanonicalVoiceRules(raw: string): string {
  let t = raw.trim();
  for (const [pattern, replacement] of CANONICAL_RULE_FIXES) {
    t = t.replace(pattern, replacement);
  }
  return t.replace(/\s+/g, " ").trim();
}

export function applyVoiceRules(raw: string): string {
  let t = applyCanonicalVoiceRules(raw);
  for (const [pattern, replacement] of ROUTING_ONLY_RULE_FIXES) {
    t = t.replace(pattern, replacement);
  }
  return t.replace(/\s+/g, " ").trim();
}

function looksGarbled(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length < 3) return true;
  if (/\b(uh+|um+|eh+|ah+|er+)\b/.test(t)) return true;
  if (/(.)\1{4,}/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    const tiny = words.filter((w) => w.length <= 2 && !/^(i|a|ok|no|go|so|at|on|it|is|am)$/i.test(w));
    if (tiny.length / words.length > 0.35) return true;
  }
  return false;
}

/** Only run LLM cleanup for likely STT errors — not every utterance. */
export function needsVoiceInterpret(text: string, recentContext = ""): boolean {
  const ruled = applyVoiceRules(text);
  if (needsContextualInterpret(ruled, recentContext)) return true;
  if (looksGarbled(ruled)) return true;
  if (/\b(whereas|previews stay|preview day|previews day)\b/i.test(ruled)) return true;
  if (/\b(char|reed)\b/i.test(ruled) && !/\bchart\b/i.test(ruled)) return true;
  return false;
}

function pickInterpretPrompt(recentContext: string): string {
  const ctx = recentContext.toLowerCase();
  const trading =
    /\b(mnq|nasdaq|chart|bias|fvg|pdh|pdl|entry|target|futures|verdict|read the chart)\b/i.test(ctx);
  if (trading) return TRADING_INTERPRET_PROMPT;
  return CASUAL_INTERPRET_PROMPT;
}

export async function interpretVoiceInput(
  raw: string,
  opts?: { recentContext?: string; messages?: Array<{ role: string; content: string }> }
): Promise<{
  text: string;
  changed: boolean;
  raw: string;
}> {
  const trimmed = raw.trim();
  if (!trimmed) return { text: trimmed, changed: false, raw: trimmed };

  const recentContext =
    opts?.recentContext ||
    (opts?.messages ? formatRecentContext(opts.messages) : "");

  let ruled = applyVoiceRules(trimmed);
  ruled = applyContextualSttFixes(ruled, recentContext);

  if (!needsVoiceInterpret(trimmed, recentContext) && ruled.toLowerCase() === trimmed.toLowerCase()) {
    return { text: ruled, changed: ruled.toLowerCase() !== trimmed.toLowerCase(), raw: trimmed };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { text: ruled, changed: ruled !== trimmed, raw: trimmed };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const userBlock = recentContext
      ? `Recent conversation:\n${recentContext}\n\nRaw STT:\n${trimmed}`
      : trimmed;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 120,
      temperature: 0.15,
      messages: [
        { role: "system", content: pickInterpretPrompt(recentContext) },
        { role: "user", content: userBlock },
      ],
    });
    const llm = response.choices[0]?.message?.content?.trim();
    let text = llm ? applyVoiceRules(llm) : ruled;
    text = applyContextualSttFixes(text, recentContext);
    return {
      text: text || ruled,
      changed: text.toLowerCase() !== trimmed.toLowerCase(),
      raw: trimmed,
    };
  } catch {
    return { text: ruled, changed: ruled !== trimmed, raw: trimmed };
  }
}
