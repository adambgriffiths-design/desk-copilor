import type { ChartQuestionIntent } from "./chart-question-intent";
import { classifyChartQuestion, isSnapshotIntent } from "./chart-question-intent";
import type { MarketContext } from "./types";
import { getExecutionScaffold } from "./execution-plan";
import { expandTradingAbbreviations } from "./plain-language";
import { buildMarketSnapshotAnswer } from "./market-snapshot";

function formatLevelLabel(label: string): string {
  return expandTradingAbbreviations(label.replace(/\([^)]*\)/g, "").trim());
}

function parseMetaCall(verdict: string): string | null {
  const meta = verdict.match(/^META:.*call=([^|]+)/im);
  return meta?.[1]?.trim() || null;
}

function spokenFromScaffold(
  ctx: MarketContext,
  call: string,
  bias: string,
  scaffold: NonNullable<ReturnType<typeof getExecutionScaffold>>
): string {
  const price = ctx.daily.lastClose.toFixed(2);
  const target = `${scaffold.target1Price.toFixed(2)} at ${formatLevelLabel(scaffold.target1Label)}`;
  const biasNote = expandTradingAbbreviations(
    ctx.biasStack.summary?.split(";")[0]?.trim() || ""
  );
  const entryPhrase =
    scaffold.entryStatus === "WAIT"
      ? `WAIT FOR: ${scaffold.waitFor || scaffold.entryZone}`
      : `entry zone ${scaffold.entryZone} is active now`;

  const parts: string[] = [];
  parts.push(`Nasdaq futures trading at ${price}`);
  parts.push(
    biasNote
      ? `MENTOR VIEW: higher-timeframe bias is ${bias} (daily context — not the trade) — ${biasNote}`
      : `MENTOR VIEW: higher-timeframe bias is ${bias} (daily context — not the trade)`
  );
  parts.push(`TRADE DECISION: scaffold ${call}, ${entryPhrase}`);
  parts.push(`Target one ${target}`);

  return expandTradingAbbreviations(`${parts.join(". ")}.`);
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

/** Scoped spoken line — only fields matching intent. */
export function buildScopedSpokenBrief(
  ctx: MarketContext,
  intent: ChartQuestionIntent,
  verdict: string,
  question?: string
): string {
  if (isSnapshotIntent(intent)) {
    return buildMarketSnapshotAnswer(ctx, intent, question || "").spoken;
  }

  const scaffold = getExecutionScaffold(ctx);
  const call = parseMetaCall(verdict) || scaffold?.call || "stand aside";
  const bias = ctx.biasStack.tradeableBias;

  if (intent === "structure") {
    const mss = ctx.structureFacts.mss;
    if (mss) {
      return expandTradingAbbreviations(`Structure: ${mss.description}.`);
    }
    const fp = ctx.structureFacts.firstPresentedFvg?.nyOpening;
    if (fp) {
      const lo = Math.min(fp.fvg.top, fp.fvg.bottom);
      const hi = Math.max(fp.fvg.top, fp.fvg.bottom);
      return `First presented one-minute ${fp.fvg.type} fair value gap ${lo.toFixed(2)} to ${hi.toFixed(2)}.`;
    }
    const fvgs = ctx.structureFacts.m1UnfilledFvgs;
    if (fvgs.length) {
      const f = fvgs[fvgs.length - 1];
      return `Most recent one-minute ${f.type} fair value gap ${f.bottom.toFixed(2)} to ${f.top.toFixed(2)}.`;
    }
    return `No recent market structure shift in lookback. MENTOR VIEW: higher-timeframe bias is ${bias} (context — not the trade).`;
  }

  if (intent === "first_presented_fvg") {
    return buildMarketSnapshotAnswer(ctx, intent, question || "").spoken;
  }

  if (intent === "full_read" && scaffold) {
    return spokenFromScaffold(ctx, call, bias, scaffold);
  }

  return buildMarketSnapshotAnswer(ctx, "price", question || "").spoken;
}

/** Full voice TTS script for full_read; scoped for other intents. */
export function buildVoiceSpokenBrief(
  ctx: MarketContext,
  verdict: string,
  question?: string
): string | null {
  const intent = classifyChartQuestion(question || "");
  if (intent !== "full_read") {
    return buildScopedSpokenBrief(ctx, intent, verdict, question);
  }

  const scaffold = getExecutionScaffold(ctx);
  const call = parseMetaCall(verdict) || scaffold?.call || "stand aside";
  const bias = ctx.biasStack.tradeableBias;

  if (!scaffold) {
    const biasNote = expandTradingAbbreviations(
      ctx.biasStack.summary?.split(";")[0]?.trim() || ""
    );
    if (biasNote) {
      return expandTradingAbbreviations(
        `MENTOR VIEW: higher-timeframe bias is ${bias} (daily context — not the trade) — ${biasNote}. TRADE DECISION: ${call === "stand aside" ? "FLAT or WAIT" : "confirm against structured stance"}.`
      );
    }
    return `MENTOR VIEW: higher-timeframe bias is ${bias} (daily context — not the trade). TRADE DECISION: ${call === "stand aside" ? "FLAT or WAIT" : "confirm against structured stance"}.`;
  }

  if (isGenericChartQuestion(question)) {
    return spokenFromScaffold(ctx, call, bias, scaffold);
  }

  return buildScopedSpokenBrief(ctx, "full_read", verdict, question);
}

export function formatRealtimeToolOutput(spokenBrief: string): string {
  return [
    "ENGLISH ONLY. Read the following script verbatim — same words and numbers, no paraphrasing, no extra sentences:",
    spokenBrief,
  ].join("\n\n");
}
