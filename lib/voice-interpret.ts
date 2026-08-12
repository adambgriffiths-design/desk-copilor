import OpenAI from "openai";

const VOICE_INTERPRET_PROMPT = `You fix garbled speech-to-text for an MNQ futures trader using ICT concepts at the desk.

Input is a raw voice transcript — often wrong words, missing punctuation, homophones.

Output ONLY the corrected phrase the trader likely meant — one short sentence or question. No quotes, no explanation, no prefix.

Keep MNQ as MNQ. Fix obvious STT errors only (char→chart, reed→read, homophones).

Examples:
- "what do you see on the char" → what do you see on the chart
- "give me your reed on this" → give me your read on this
- "should i take this long or weight" → should I take this long or wait
- "how's the bias on em en q" → how's the bias on MNQ

Keep their intent. Do not invent content they did not say.`;

const RULE_FIXES: [RegExp, string][] = [
  [/\bem en q\b/gi, "MNQ"],
  [/\bm and q\b/gi, "MNQ"],
  [/\bf v g\b/gi, "fair value gap"],
  [/\bo r g\b/gi, "opening range gap"],
  [/\bwhat do you see on the char\b/gi, "what do you see on the chart"],
  [/\blook at the char\b/gi, "look at the chart"],
  [/\bcheck the char\b/gi, "check the chart"],
  [/\bon the char\b/gi, "on the chart"],
  [/\bchart reed\b/gi, "chart read"],
  [/\byour reed\b/gi, "your read"],
  [/\bgive me a reed\b/gi, "give me a read"],
];

export function applyVoiceRules(raw: string): string {
  let t = raw.trim();
  for (const [pattern, replacement] of RULE_FIXES) {
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

export async function interpretVoiceInput(raw: string): Promise<{
  text: string;
  changed: boolean;
  raw: string;
}> {
  const trimmed = raw.trim();
  if (!trimmed) return { text: trimmed, changed: false, raw: trimmed };

  const ruled = applyVoiceRules(trimmed);
  if (!looksGarbled(ruled)) {
    return { text: ruled, changed: ruled.toLowerCase() !== trimmed.toLowerCase(), raw: trimmed };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { text: ruled, changed: ruled !== trimmed, raw: trimmed };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 80,
      temperature: 0.2,
      messages: [
        { role: "system", content: VOICE_INTERPRET_PROMPT },
        { role: "user", content: trimmed },
      ],
    });
    const llm = response.choices[0]?.message?.content?.trim();
    const text = llm ? applyVoiceRules(llm) : ruled;
    return {
      text: text || ruled,
      changed: text.toLowerCase() !== trimmed.toLowerCase(),
      raw: trimmed,
    };
  } catch {
    return { text: ruled, changed: ruled !== trimmed, raw: trimmed };
  }
}
