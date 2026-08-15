import { LIVE_VERDICT_OUTPUT_WRAPPER } from "@/lib/playbook";
import type { ChartQuestionIntent } from "@/lib/chart-question-intent";
import { expandTradingAbbreviations } from "@/lib/plain-language";

const META_LINE = /^META:.*$/gim;

function expandUserText(text: string): string {
  const metaMatch = text.match(/^META:.*$/im);
  const meta = metaMatch?.[0] || "";
  const body = text.replace(META_LINE, "").trim();
  const expanded = expandTradingAbbreviations(body);
  return meta ? `${expanded}\n${meta}` : expanded;
}

export function parseVerdictSections(raw: string): {
  verdict: string;
  spokenBrief: string;
} {
  const text = raw.trim();
  const panelMatch = text.match(/===PANEL===\s*([\s\S]*?)(?:===SPOKEN===|$)/i);
  const spokenMatch = text.match(/===SPOKEN===\s*([\s\S]*?)(?:\nMETA:|$)/i);
  const metaMatch = text.match(/^META:.*$/im);

  let verdict = (panelMatch?.[1] || text).replace(META_LINE, "").trim();
  let spokenBrief = (spokenMatch?.[1] || "").replace(META_LINE, "").trim();

  if (metaMatch) {
    verdict = verdict ? `${verdict}\n${metaMatch[0].trim()}` : metaMatch[0].trim();
  }

  if (!spokenBrief && verdict) {
    const lines = verdict
      .split("\n")
      .filter((l) => l.trim() && !/^META:/i.test(l.trim()));
    const callLine = lines.find((l) => /^Call:/i.test(l.trim()));
    const targetLine = lines.find((l) => /^Target 1:/i.test(l.trim()));
    const biasLine = lines.find((l) => /^Bias:/i.test(l.trim()));
    spokenBrief = [biasLine, callLine, targetLine]
      .filter((l): l is string => Boolean(l))
      .map((l) => l.replace(/^[A-Za-z ]+:\s*/, "").trim())
      .join(". ")
      .replace(/\.\./g, ".");
    if (spokenBrief && !spokenBrief.endsWith(".")) spokenBrief += ".";
  }

  if (!verdict.trim() && spokenBrief) {
    verdict = spokenBrief;
  }

  verdict = expandUserText(verdict);
  spokenBrief = expandTradingAbbreviations(spokenBrief);

  return { verdict, spokenBrief };
}

export function liveVerdictUserTail(voiceInput?: boolean): string {
  const base =
    "LIVE SESSION — Screenshot is chart evidence only. Do NOT invent an independent trading decision from the image. Copy STANCE, EXECUTION, TARGET, INVALIDATION from the DECISION ENVELOPE / pipeline contract. Separate MENTOR VIEW (what the market is doing) from TRADE DECISION (what you would actually trade). Stance: long | short | flat | wait | monitor. WAIT must name WAIT FOR: exact condition. Never unlabeled bullish/bearish/LONG/SHORT. **All MNQ prices from JSON (lastClose, PD arrays, Execution scaffold) — typically 25000–32000. Never cite volume-axis numbers (~15000).** **Do NOT recommend stops.**";

  if (voiceInput) {
    return `${base}\n\n${LIVE_VERDICT_OUTPUT_WRAPPER}\n\nVOICE SPOKEN: MENTOR VIEW then TRADE DECISION. Stay flat / WAIT is allowed. Do not invent a long or short.`;
  }

  return `${base} Respond with the labeled decision contract in full words (no abbreviations).`;
}

/** Structured OHLC path — text-only, step reasoning + confidence. */
export function structuredVerdictUserTail(voiceInput?: boolean, question?: string): string {
  const q = question ? `Trader asked: "${question}" — ` : "";
  const base = `${q}STRUCTURED CHART READ — Use the candle array as primary evidence (MENTOR VIEW). Copy TRADE DECISION from the DECISION ENVELOPE / pipeline — do not invent an independent Call. **All prices from JSON/candles only — typically 25000–32000.** **Do NOT recommend stops.** Separate MENTOR VIEW from TRADE DECISION.`;

  if (voiceInput) {
    return `${base}\n\n${LIVE_VERDICT_OUTPUT_WRAPPER}`;
  }
  return `${base} Respond with a dense labeled desk brief in full words (no abbreviations).`;
}

/** Narrow chart question — no full verdict unless intent is full_read. */
export function scopedVerdictUserTail(
  intent: ChartQuestionIntent,
  question?: string
): string {
  const q = question ? `Trader asked: "${question}" — ` : "";

  if (intent === "structure") {
    return `${q}Answer ONLY about structure (market structure shift, fair value gap, displacement, liquidity sweep) in 2–4 sentences. Use JSON structureFacts and chart image. **Do NOT include Call, Entry zone, or Target unless explicitly asked.** Use JSON prices only. **Full words only — no abbreviations.**`;
  }

  if (intent === "first_presented_fvg") {
    return `${q}Answer ONLY about the **first presented one-minute fair value gap** after session open — use JSON structureFacts.firstPresentedFvg (nyOpening / postFhdr / activeSession). **Never cite daily FVG for "first presented" questions.** 1–3 sentences with prices. **Full words only — no abbreviations.**`;
  }

  return `${q}Answer ONLY what was asked in 1–3 sentences. Use JSON lastClose and Execution scaffold. **Do NOT include Call, Entry zone, or Target unless explicitly asked.** **Full words only — no abbreviations.**`;
}

export function verdictUserTail(
  intent: ChartQuestionIntent,
  voiceInput?: boolean,
  question?: string
): string {
  if (intent === "full_read") {
    return liveVerdictUserTail(voiceInput);
  }
  if (voiceInput) {
    return `${scopedVerdictUserTail(intent, question)}\n\nRespond with ===PANEL=== (2–4 lines max, answer only, full words) and ===SPOKEN=== (1–2 sentences, answer only, no abbreviations). No META in spoken block.`;
  }
  return scopedVerdictUserTail(intent, question);
}
