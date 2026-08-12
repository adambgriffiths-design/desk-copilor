import type { ChartQuestionIntent } from "./chart-question-intent";
import {
  classifyChartQuestion,
  isFirstPresentedFvgQuestion,
  resolveSnapshotIntent,
} from "./chart-question-intent";
import { getExecutionScaffold } from "./execution-plan";
import { nearestPdLevels } from "./pd-arrays";
import { expandTradingAbbreviations } from "./plain-language";
import { pipelineBiasSummary } from "./decision-pipeline";
import { buildMarketState } from "./market-state-build";
import type { FirstPresentedFvgResult, FvgZone, MarketContext } from "./types";

export type MarketSnapshotResult = {
  intent: ChartQuestionIntent;
  spoken: string;
  panel: string;
};

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

function priceLine(ctx: MarketContext): string {
  return roundMnq(ctx.daily.lastClose).toFixed(2);
}

function asksForNearestLevels(question: string): boolean {
  const q = question.toLowerCase();
  return /\b(support|resistance|nearest level|levels around|nearby level)\b/.test(q);
}

function answerPrice(ctx: MarketContext, question: string): string {
  const last = priceLine(ctx);
  if (!asksForNearestLevels(question)) {
    return `We're trading at ${last} on Nasdaq futures.`;
  }
  const { support, resistance } = nearestPdLevels(
    ctx.daily.lastClose,
    ctx.htfPdArrays.levels
  );
  const parts = [`We're trading at ${last} on Nasdaq futures.`];
  if (support) parts.push(`Nearest support below is ${formatLevelLabel(support.label)} at ${support.price.toFixed(2)}.`);
  if (resistance)
    parts.push(`Nearest resistance above is ${formatLevelLabel(resistance.label)} at ${resistance.price.toFixed(2)}.`);
  return parts.join(" ");
}

function answerLevel(ctx: MarketContext, question: string): string {
  const q = question.toLowerCase();
  const pd = ctx.htfPdArrays.previousDay;
  const { support, resistance } = nearestPdLevels(
    ctx.daily.lastClose,
    ctx.htfPdArrays.levels
  );

  if (/\bpdh\b|previous day high|\bpreview\w*\b.*\bhigh\b/.test(q)) {
    return `Previous day high is ${pd.high.toFixed(2)}.`;
  }
  if (/\bpdl\b|previous day low|\bpreview\w*\b.*\b(low|stay low)\b/.test(q)) {
    return `Previous day low is ${pd.low.toFixed(2)}.`;
  }
  if (/\bsupport\b/.test(q) && support) {
    return `Nearest support is ${formatLevelLabel(support.label)} at ${support.price.toFixed(2)}.`;
  }
  if (/\bresistance\b/.test(q) && resistance) {
    return `Nearest resistance is ${formatLevelLabel(resistance.label)} at ${resistance.price.toFixed(2)}.`;
  }
  if (/\bsession high\b/.test(q)) {
    return `New York regular trading hours high is ${ctx.sessions.nyRthHigh.toFixed(2)}.`;
  }
  if (/\bsession low\b/.test(q)) {
    return `New York regular trading hours low is ${ctx.sessions.nyRthLow.toFixed(2)}.`;
  }

  if (/\bhigh\b/.test(q)) return `Previous day high is ${pd.high.toFixed(2)}.`;
  if (/\blow\b/.test(q)) return `Previous day low is ${pd.low.toFixed(2)}.`;

  const bits: string[] = [];
  if (support) bits.push(`Support ${formatLevelLabel(support.label)} ${support.price.toFixed(2)}.`);
  if (resistance) bits.push(`Resistance ${formatLevelLabel(resistance.label)} ${resistance.price.toFixed(2)}.`);
  if (!bits.length) {
    bits.push(`Previous day high ${pd.high.toFixed(2)}, previous day low ${pd.low.toFixed(2)}.`);
  }
  return bits.join(" ");
}

function formatLevelLabel(label: string): string {
  return expandTradingAbbreviations(label.replace(/\([^)]*\)/g, "").trim());
}

function answerBias(ctx: MarketContext): string {
  const state = buildMarketState({ ctx, chartSnapshot: null });
  return pipelineBiasSummary(ctx, state);
}

function answerStatus(ctx: MarketContext): string {
  const last = priceLine(ctx);
  const bias = ctx.biasStack.tradeableBias;
  const biasNote = expandTradingAbbreviations(
    ctx.biasStack.summary?.split(";")[0]?.trim() || ""
  );
  const scaffold = getExecutionScaffold(ctx);
  const call = scaffold?.call || "stand aside";
  const pd = ctx.htfPdArrays.previousDay;
  const { support, resistance } = nearestPdLevels(
    ctx.daily.lastClose,
    ctx.htfPdArrays.levels
  );

  const parts = [`Nasdaq futures trading at ${last}`];
  if (biasNote) {
    parts.push(`Tradeable bias is ${bias} — ${biasNote}`);
  } else {
    parts.push(`Tradeable bias is ${bias}`);
  }

  const mss = ctx.structureFacts.mss;
  if (mss) {
    parts.push(expandTradingAbbreviations(mss.description));
  } else {
    const fvgs = ctx.structureFacts.m1UnfilledFvgs;
    if (fvgs.length) {
      const f = fvgs[fvgs.length - 1];
      parts.push(
        `Price working near an unfilled one-minute ${f.type} fair value gap from ${f.bottom.toFixed(2)} to ${f.top.toFixed(2)}`
      );
    }
  }

  parts.push(`Call is ${call}`);

  const levelBits = [
    `previous day high at ${pd.high.toFixed(2)}`,
    `previous day low at ${pd.low.toFixed(2)}`,
  ];
  if (support) {
    levelBits.push(
      `nearest support ${formatLevelLabel(support.label)} at ${support.price.toFixed(2)}`
    );
  }
  if (resistance) {
    levelBits.push(
      `nearest resistance ${formatLevelLabel(resistance.label)} at ${resistance.price.toFixed(2)}`
    );
  }
  parts.push(`Key levels: ${levelBits.join(", ")}`);

  return `${parts.join(". ")}.`;
}

function entryStatusNote(
  scaffold: NonNullable<ReturnType<typeof getExecutionScaffold>>
): string {
  if (scaffold.entryStatus !== "WAIT") return scaffold.entryStatus;
  return "WAIT — not at entry yet";
}

function answerEntry(ctx: MarketContext): string {
  const scaffold = getExecutionScaffold(ctx);
  if (!scaffold) {
    return `No directional entry scaffold — tradeable bias is ${ctx.biasStack.tradeableBias}.`;
  }
  const zone = `${scaffold.entryLo.toFixed(2)} to ${scaffold.entryHi.toFixed(2)}`;
  const status = entryStatusNote(scaffold);
  return `Entry zone ${zone}, ${status}.`;
}

function answerTarget(ctx: MarketContext): string {
  const scaffold = getExecutionScaffold(ctx);
  if (!scaffold) {
    return `No target scaffold — tradeable bias is ${ctx.biasStack.tradeableBias}.`;
  }
  return `Target one ${scaffold.target1Price.toFixed(2)} at ${scaffold.target1Label}.`;
}

function answerEntryAndTarget(ctx: MarketContext): string {
  const scaffold = getExecutionScaffold(ctx);
  if (!scaffold) {
    return `No entry or target scaffold — tradeable bias is ${ctx.biasStack.tradeableBias}.`;
  }
  const zone = `${scaffold.entryLo.toFixed(2)} to ${scaffold.entryHi.toFixed(2)}`;
  const status = entryStatusNote(scaffold);
  return `Entry zone ${zone}, ${status}. Target one ${scaffold.target1Price.toFixed(2)} at ${scaffold.target1Label}.`;
}

function asksForEntryAndTarget(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /\b(entry|enter|get in|entry zone)\b/.test(q) &&
    /\b(target|take profit|target one|target 1)\b/.test(q)
  );
}

function fvgRange(f: FvgZone): { lo: number; hi: number } {
  return {
    lo: roundMnq(Math.min(f.top, f.bottom)),
    hi: roundMnq(Math.max(f.top, f.bottom)),
  };
}

function fvgSide(q: string): "bullish" | "bearish" | null {
  if (/\bbearish\b/.test(q)) return "bearish";
  if (/\bbullish\b/.test(q)) return "bullish";
  return null;
}

function isDailyFvgQuestion(q: string): boolean {
  return (
    /\b(daily|d_fvg|htf|higher timeframe)\b/.test(q) ||
    (/\bdaily\b/.test(q) && /\bphoto\b/.test(q))
  );
}

function formatFvgAnswer(fvg: FvgZone, unfilled: FvgZone[]): string {
  const { lo, hi } = fvgRange(fvg);
  const ce = roundMnq((lo + hi) / 2);
  const tf = fvg.timeframe === "daily" ? "daily" : "one-minute";
  const filled = !unfilled.some(
    (u) => u.type === fvg.type && u.formedAt === fvg.formedAt && u.timeframe === fvg.timeframe
  );
  const status = filled ? "filled" : "unfilled";
  return `Last ${tf} ${fvg.type} fair value gap ${lo.toFixed(2)} to ${hi.toFixed(2)}, consequent encroachment ${ce.toFixed(2)}, formed ${fvg.formedAt ?? "recent session"} (${status}).`;
}

function formatFirstPresentedFvgAnswer(result: FirstPresentedFvgResult): string {
  const { lo, hi } = fvgRange(result.fvg);
  const ce = roundMnq((lo + hi) / 2);
  const variantLabel =
    result.variant === "ny_opening"
      ? "NY opening range"
      : result.variant === "post_fhdr"
        ? "post first hour dealing range break"
        : result.sessionLabel;
  const status = result.filled ? "filled" : "unfilled";
  return `First presented one-minute ${result.fvg.type} fair value gap ${lo.toFixed(2)} to ${hi.toFixed(2)}, consequent encroachment ${ce.toFixed(2)}, formed ${result.fvg.formedAt} during ${result.sessionLabel} ${result.windowLabel} (${variantLabel}, ${status}).`;
}

function pickFirstPresentedFvg(
  ctx: MarketContext,
  question: string
): FirstPresentedFvgResult | null {
  const fp = ctx.structureFacts.firstPresentedFvg;
  if (!fp) return null;
  const q = question.toLowerCase();
  if (/\b(post.?fhdr|first hour dealing|fhdr|after 10:30)\b/.test(q)) {
    return fp.postFhdr;
  }
  if (/\b(london|asia|ny pm|new york pm)\b/.test(q)) {
    if (/\blondon\b/.test(q)) {
      return detectSessionLabel(fp, "London") ?? fp.activeSession;
    }
    if (/\basia\b/.test(q)) {
      return detectSessionLabel(fp, "Asia") ?? fp.activeSession;
    }
    if (/\b(ny pm|new york pm)\b/.test(q)) {
      return detectSessionLabel(fp, "New York PM") ?? fp.activeSession;
    }
  }
  if (/\b(ny am|new york am|opening range|9:30|9\.30)\b/.test(q)) {
    return fp.nyOpening ?? fp.activeSession;
  }
  return fp.nyOpening ?? fp.activeSession ?? fp.postFhdr;
}

function detectSessionLabel(
  fp: NonNullable<MarketContext["structureFacts"]["firstPresentedFvg"]>,
  label: string
): FirstPresentedFvgResult | null {
  if (fp.activeSession?.sessionLabel === label) return fp.activeSession;
  if (fp.nyOpening?.sessionLabel === label) return fp.nyOpening;
  return null;
}

function answerFirstPresentedFvg(ctx: MarketContext, question: string): string {
  const result = pickFirstPresentedFvg(ctx, question);
  if (result) return formatFirstPresentedFvgAnswer(result);
  const q = question.toLowerCase();
  if (/\b(london|asia|ny pm|new york pm)\b/.test(q)) {
    const session = /\blondon\b/.test(q)
      ? "London"
      : /\basia\b/.test(q)
        ? "Asia"
        : "New York PM";
    return `No first presented one-minute fair value gap yet in today's ${session} opening window.`;
  }
  if (/\b(post.?fhdr|first hour dealing|fhdr|after 10:30)\b/.test(q)) {
    return "No first presented one-minute fair value gap yet after today's first hour dealing range break.";
  }
  return "No first presented one-minute fair value gap yet in today's New York opening range (9:30–10:00).";
}

function answerStructure(ctx: MarketContext, question: string): string {
  const q = question.toLowerCase();
  const side = fvgSide(q);

  if (isFirstPresentedFvgQuestion(q)) {
    return answerFirstPresentedFvg(ctx, question);
  }

  if (/\bmss\b|market structure shift|structure shift\b/.test(q)) {
    const mss = ctx.structureFacts.mss;
    if (mss) return mss.description.endsWith(".") ? mss.description : `${mss.description}.`;
    return "No recent one-minute market structure shift in lookback.";
  }

  const wantsDaily = isDailyFvgQuestion(q);
  if (wantsDaily || /\bfvg\b|fair value gap\b/.test(q) || (/\bphoto\b/.test(q) && /\b(bullish|bearish|daily|gap)\b/.test(q))) {
    if (wantsDaily) {
      let fvgs = ctx.htfPdArrays.recentDailyFvgs;
      if (side) fvgs = fvgs.filter((f) => f.type === side);
      const fvg = fvgs.at(-1);
      if (fvg) {
        return formatFvgAnswer(fvg, ctx.htfPdArrays.unfilledDailyFvgs);
      }
      return side
        ? `No recent ${side} fair value gap on the daily chart in lookback.`
        : "No recent daily fair value gap in lookback.";
    }

    let m1 = ctx.structureFacts.m1UnfilledFvgs;
    if (side) m1 = m1.filter((f) => f.type === side);
    const m1f = m1.at(-1);
    if (m1f) return formatFvgAnswer(m1f, m1);

    let daily = ctx.htfPdArrays.recentDailyFvgs;
    if (side) daily = daily.filter((f) => f.type === side);
    const dailyFvg = daily.at(-1);
    if (dailyFvg) {
      return formatFvgAnswer(dailyFvg, ctx.htfPdArrays.unfilledDailyFvgs);
    }

    return side
      ? `No recent ${side} fair value gap on the one-minute chart in lookback.`
      : "No recent fair value gap in lookback.";
  }

  if (/\bdisplacement\b/.test(q)) {
    const mss = ctx.structureFacts.mss;
    if (mss) return mss.description.endsWith(".") ? mss.description : `${mss.description}.`;
    return "No recent displacement or market structure shift flagged in JSON lookback.";
  }

  if (/\bstructure\b/.test(q)) {
    const mss = ctx.structureFacts.mss;
    if (mss) return mss.description.endsWith(".") ? mss.description : `${mss.description}.`;
    const m1 = ctx.structureFacts.m1UnfilledFvgs.at(-1);
    if (m1) return formatFvgAnswer(m1, ctx.structureFacts.m1UnfilledFvgs);
    return "No recent structure shift or unfilled one-minute fair value gap in lookback.";
  }

  const m1 = ctx.structureFacts.m1UnfilledFvgs.at(-1);
  if (m1 && /\b(fvg|gap|fair value)\b/.test(q)) {
    return formatFvgAnswer(m1, ctx.structureFacts.m1UnfilledFvgs);
  }
  return "No recent structure detail matched that question — ask about market structure shift, fair value gap, or displacement specifically.";
}

/** JSON-only answer — no vision model. Numbers only for what was asked. */
export function buildMarketSnapshotAnswer(
  ctx: MarketContext,
  intent: ChartQuestionIntent,
  question?: string
): MarketSnapshotResult {
  const q = question || "";
  let spoken: string;

  if (asksForEntryAndTarget(q)) {
    spoken = answerEntryAndTarget(ctx);
    const normalized = expandTradingAbbreviations(spoken.replace(/\s+/g, " ").trim());
    return {
      intent,
      spoken: normalized,
      panel: normalized,
    };
  }

  switch (intent) {
    case "price":
      spoken = answerPrice(ctx, q);
      break;
    case "level":
      spoken = answerLevel(ctx, q);
      break;
    case "bias":
      spoken = answerBias(ctx);
      break;
    case "entry":
      spoken = answerEntry(ctx);
      break;
    case "target":
      spoken = answerTarget(ctx);
      break;
    case "structure":
      spoken = answerStructure(ctx, q);
      break;
    case "first_presented_fvg":
      spoken = answerFirstPresentedFvg(ctx, q);
      break;
    case "status":
      spoken = answerStatus(ctx);
      break;
    default:
      spoken = answerPrice(ctx, q);
      break;
  }

  return {
    intent,
    spoken: expandTradingAbbreviations(spoken.replace(/\s+/g, " ").trim()),
    panel: expandTradingAbbreviations(spoken.replace(/\s+/g, " ").trim()),
  };
}

export function resolveSnapshotFromQuestion(
  ctx: MarketContext,
  question: string
): MarketSnapshotResult {
  const intent = resolveSnapshotIntent(question);
  return buildMarketSnapshotAnswer(ctx, intent, question);
}
