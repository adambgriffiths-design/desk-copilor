import type { MarketContext } from "./types";
import { getExecutionScaffold } from "./execution-plan";

function parseMetaCall(verdict: string): string | null {
  const meta = verdict.match(/^META:.*call=([^|]+)/im);
  return meta?.[1]?.trim() || null;
}

function isGenericChartQuestion(question?: string): boolean {
  if (!question?.trim()) return true;
  const q = question.trim().toLowerCase();
  return (
    q === "what do you see on the chart" ||
    q === "chart read" ||
    q === "read the chart" ||
    q === "get the read" ||
    q === "what's on the chart"
  );
}

function leadSentence(question: string | undefined, scaffold: NonNullable<ReturnType<typeof getExecutionScaffold>>, call: string): string {
  const q = (question || "").toLowerCase();
  const last = scaffold.lastPrice.toFixed(2);
  const entry = `${scaffold.entryLo.toFixed(2)} to ${scaffold.entryHi.toFixed(2)}`;
  const target = `${scaffold.target1Price.toFixed(2)} at ${scaffold.target1Label}`;

  if (/\b(entry|enter|where.*(buy|sell|long|short))\b/.test(q)) {
    return `Entry zone ${entry}, status ${scaffold.entryStatus}. Last price ${last}.`;
  }
  if (/\b(target|take profit|where.*(go|run))\b/.test(q)) {
    return `Target one ${target}. Last price ${last}.`;
  }
  if (/\b(buy|sell|call|direction|bias|long|short)\b/.test(q)) {
    return `Call ${call}, tradeable bias ${scaffold.bias}. Last price ${last}.`;
  }
  if (/\b(level|pdh|pdl|high|low|support|resistance)\b/.test(q)) {
    return `Target one ${target}. Entry zone ${entry}. Last price ${last}.`;
  }
  if (!isGenericChartQuestion(question)) {
    return `On that: call ${call}, bias ${scaffold.bias}. Last price ${last}.`;
  }
  return `Nasdaq futures last ${last}. Call ${call}, bias ${scaffold.bias}.`;
}

/** Voice TTS script — prices from live JSON only, tuned to the trader's question. */
export function buildVoiceSpokenBrief(
  ctx: MarketContext,
  verdict: string,
  question?: string
): string | null {
  const scaffold = getExecutionScaffold(ctx);
  const call = parseMetaCall(verdict) || scaffold?.call || "stand aside";
  const price = ctx.daily.lastClose;
  const bias = ctx.biasStack.tradeableBias;

  if (!scaffold) {
    const pdh = ctx.htfPdArrays.previousDay.high;
    const pdl = ctx.htfPdArrays.previousDay.low;
    return `Nasdaq futures last ${price.toFixed(2)}. Tradeable bias ${bias}. Call ${call}. Previous day high ${pdh.toFixed(2)}, previous day low ${pdl.toFixed(2)}.`;
  }

  const entry = `${scaffold.entryLo.toFixed(2)} to ${scaffold.entryHi.toFixed(2)}`;
  const target = `${scaffold.target1Price.toFixed(2)} at ${scaffold.target1Label}`;

  const parts = [
    leadSentence(question, scaffold, call),
    `Entry ${entry}, ${scaffold.entryStatus}.`,
    `Target one ${target}.`,
  ];

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function formatRealtimeToolOutput(spokenBrief: string): string {
  return [
    "ENGLISH ONLY. Read the following script verbatim — same words and numbers, no paraphrasing, no extra sentences:",
    spokenBrief,
  ].join("\n\n");
}
