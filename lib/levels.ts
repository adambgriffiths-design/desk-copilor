import type { Bar, FvgZone, MarketContext } from "./types";
import { computeBiasStack } from "./bias-analysis";
import { detectUnfilledIntradayFvgs } from "./gap-zones";
import { computeHtfPdArrays, computePremiumDiscount, formatPdArrayBrief, formatPdArrayBriefCompact, pdArrayDirectionHint } from "./pd-arrays";
import { formatExecutionPlan } from "./execution-plan";
import { resolveSessionContext, sessionPhaseSummary } from "./sessions";
import {
  formatSessionIctHints,
} from "./ict-knowledge";
import { buildStructureFacts } from "./structure";
import {
  aggregateSessionBar,
  barsInCmeSession,
  barsInEstWindow,
  buildFvgDailyBars,
  cmeSessionDateKeyFromDate,
  computeNwog as computeNwogLevels,
  findBarClosestTo,
  findExtremeBarInWindow,
  formatEst,
  getEstDateKey,
  priorCmeSessionKey,
  priorEstDateKey,
  RTH_CLOSE_MIN,
  RTH_OPEN_MIN,
  sessionCloseBar,
  sessionHighLow,
  type PdhSource,
} from "./market-data";
import { resolveLiveLastPrice } from "./chart-live-price";

function eq(a: number, b: number): number {
  return (a + b) / 2;
}

export function biasFromPrice(price: number, low: number, high: number): "bullish" | "bearish" | "neutral" {
  const mid = eq(low, high);
  const range = high - low;
  if (range <= 0) return "neutral";
  if (price > mid + range * 0.1) return "bullish";
  if (price < mid - range * 0.1) return "bearish";
  return "neutral";
}

function detectUnfilledFvgs(bars: Bar[], timeframe: FvgZone["timeframe"], lookback = 40): FvgZone[] {
  return detectUnfilledIntradayFvgs(bars, timeframe, lookback, 5);
}

/** 5m/15m HL + unfilled FVG window — shared by full context build and HTF append-only patch. */
export function buildIntradayTimeframeState(
  bars: Bar[],
  timeframe: "5m" | "15m",
  lastPrice: number
): MarketContext["timeframe5m"] {
  const recent = timeframe === "15m" ? bars.slice(-32) : bars.slice(-48);
  const hl = sessionHighLow(recent) ?? { high: lastPrice, low: lastPrice };
  return {
    high: hl.high,
    low: hl.low,
    equilibrium: eq(hl.low, hl.high),
    biasHint: biasFromPrice(lastPrice, hl.low, hl.high),
    unfilledFvgs: detectUnfilledFvgs(bars, timeframe),
  };
}

function priorTradingDayKey(m1: Bar[], todayKey: string): string | null {
  return priorEstDateKey(m1, todayKey);
}

/** ORG = prior session 4:15 PM close → today 9:30 AM open. (ICT wording: "15 min after 4" / 4:14 — same anchor.) */
function computeOrg(m1: Bar[], todayKey: string): MarketContext["org"] | null {
  const priorKey = priorTradingDayKey(m1, todayKey);
  if (!priorKey) return null;

  const close415Bar = findBarClosestTo(m1, RTH_CLOSE_MIN, priorKey);
  const open930Bar = findBarClosestTo(m1, RTH_OPEN_MIN, todayKey);
  if (!close415Bar || !open930Bar) return null;

  const close415 = close415Bar.close;
  const open930 = open930Bar.open;
  const top = Math.max(close415, open930);
  const bottom = Math.min(close415, open930);

  return {
    top,
    bottom,
    ce: eq(top, bottom),
    level25: bottom + (top - bottom) * 0.25,
    level75: bottom + (top - bottom) * 0.75,
    close415,
    open930,
    formedAtTime: Math.floor(open930Bar.time.getTime() / 1000),
  };
}

function sessionHighLowWithTimes(bars: Bar[]) {
  if (!bars.length) return null;
  let high = bars[0].high;
  let low = bars[0].low;
  let highTime = Math.floor(bars[0].time.getTime() / 1000);
  let lowTime = highTime;
  for (const bar of bars) {
    const t = Math.floor(bar.time.getTime() / 1000);
    if (bar.high > high) {
      high = bar.high;
      highTime = t;
    }
    if (bar.low < low) {
      low = bar.low;
      lowTime = t;
    }
  }
  return { high, low, highTime, lowTime };
}

function recentSessionBars(m1: Bar[], today: string, yesterday: string) {
  const asia = [
    ...barsInEstWindow(m1, 18 * 60, 24 * 60, yesterday),
    ...barsInEstWindow(m1, 0, 60, today),
  ];
  const london = barsInEstWindow(m1, 2 * 60, 5 * 60, today);
  const nyPre = barsInEstWindow(m1, 7 * 60, 9 * 60 + 30, today);
  const nyRth = barsInEstWindow(m1, 9 * 60 + 30, 16 * 60, today);
  const nyPm = barsInEstWindow(m1, 13 * 60 + 30, 16 * 60, today);

  return { asia, london, nyPre, nyRth, nyPm };
}

export function liquidityLevelsFromContext(input: {
  pdLevels: Array<{ id: string; label: string; price: number }>;
  sessions: MarketContext["sessions"];
  org: MarketContext["org"];
}): Array<{ id: string; label: string; price: number }> {
  const seen = new Set<string>();
  const levels: Array<{ id: string; label: string; price: number }> = [];
  for (const level of input.pdLevels) {
    const key = `${level.id}:${level.price.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    levels.push(level);
  }
  for (const level of [
    { id: "asia_high", label: "Asia high", price: input.sessions.asiaHigh },
    { id: "asia_low", label: "Asia low", price: input.sessions.asiaLow },
    { id: "london_high", label: "London high", price: input.sessions.londonHigh },
    { id: "london_low", label: "London low", price: input.sessions.londonLow },
    { id: "ny_pre_high", label: "NY pre high", price: input.sessions.nyPreHigh },
    { id: "ny_pre_low", label: "NY pre low", price: input.sessions.nyPreLow },
    { id: "ny_rth_high", label: "NY RTH high", price: input.sessions.nyRthHigh },
    { id: "ny_rth_low", label: "NY RTH low", price: input.sessions.nyRthLow },
  ]) {
    const key = `${level.id}:${level.price.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    levels.push(level);
  }
  if (input.org) {
    for (const level of [
      { id: "org_top", label: "ORG top", price: input.org.top },
      { id: "org_bottom", label: "ORG bottom", price: input.org.bottom },
      { id: "org_ce", label: "ORG CE", price: input.org.ce },
    ]) {
      const key = `${level.id}:${level.price.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      levels.push(level);
    }
  }
  return levels;
}

function sliceDailyForAsOf(
  daily: Bar[],
  m1: Bar[],
  asOf: Date
): {
  daily: Bar[];
  prev: Bar | undefined;
  currPartial: { high: number; low: number; close: number } | null;
  pdhSource: PdhSource;
  currentSessionKey: string;
  previousSessionKey: string | null;
  /** Source candle for PDC when from Globex 1m; undefined on Yahoo fallback. */
  pdcSourceBar: Bar | undefined;
  /** Extreme bars for PDH/PDL provenance (Globex 1m only). */
  pdhSourceBar: Bar | undefined;
  pdlSourceBar: Bar | undefined;
  yahooDailyClose: number | undefined;
} {
  const asOfKey = getEstDateKey(asOf);
  const completed = daily.filter((b) => getEstDateKey(b.time) < asOfKey);
  const currentSessionKey = cmeSessionDateKeyFromDate(asOf);
  const prevSessionKey = priorCmeSessionKey(m1, currentSessionKey);
  const prevSessionBars = prevSessionKey ? barsInCmeSession(m1, prevSessionKey) : [];
  const prevFromM1 = aggregateSessionBar(prevSessionBars);
  const pdcSourceBar = sessionCloseBar(prevSessionBars);
  const pdhSourceBar = findExtremeBarInWindow(prevSessionBars, "high") ?? undefined;
  const pdlSourceBar = findExtremeBarInWindow(prevSessionBars, "low") ?? undefined;
  const prevFromDaily = completed.at(-1);
  // Prefer Globex 1m session OHLC (close = last 1m of prior session). Never mix
  // Yahoo settlement close with Globex H/L — Yahoo close often ≠ last trade.
  const prev = prevFromM1 ?? prevFromDaily;
  const pdhSource: PdhSource = prevFromM1 ? "cme_session_1m" : "yahoo_daily_fallback";
  const currBars = barsInCmeSession(m1, currentSessionKey);
  const hl = sessionHighLow(currBars);
  const currPartial = hl
    ? { high: hl.high, low: hl.low, close: currBars.at(-1)?.close ?? hl.high }
    : null;
  return {
    daily: completed,
    prev,
    currPartial,
    pdhSource,
    currentSessionKey,
    previousSessionKey: prevSessionKey,
    pdcSourceBar: prevFromM1 ? pdcSourceBar : undefined,
    pdhSourceBar: prevFromM1 ? pdhSourceBar : undefined,
    pdlSourceBar: prevFromM1 ? pdlSourceBar : undefined,
    yahooDailyClose: prevFromDaily?.close,
  };
}

export function buildMarketContextAt(
  data: { daily: Bar[]; m15: Bar[]; m5: Bar[]; m1: Bar[]; symbol: string },
  asOf: Date,
  chartTimeEst?: string,
  chartLastPrice?: number | null
): MarketContext {
  const m1 = sliceBarsAt(data.m1, asOf);
  const m5 = sliceBarsAt(data.m5, asOf);
  const m15 = sliceBarsAt(data.m15, asOf);

  const today = getEstDateKey(asOf);
  const yesterdayDate = new Date(asOf);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getEstDateKey(yesterdayDate);

  const {
    prev,
    currPartial,
    pdhSource,
    currentSessionKey,
    previousSessionKey,
    pdcSourceBar,
    pdhSourceBar,
    yahooDailyClose,
  } = sliceDailyForAsOf(data.daily, m1, asOf);
  const barClose = m1.at(-1)?.close ?? currPartial?.close ?? prev?.close;
  const lastPrice = resolveLiveLastPrice(barClose, chartLastPrice);

  const timeframe15m = buildIntradayTimeframeState(m15, "15m", lastPrice);
  const timeframe5m = buildIntradayTimeframeState(m5, "5m", lastPrice);

  const m1TodayHl =
    sessionHighLow(barsInCmeSession(m1, currentSessionKey)) ??
    ({ high: lastPrice, low: lastPrice } as const);

  const sessions = recentSessionBars(m1, today, yesterday);
  const asiaHl = sessionHighLowWithTimes(sessions.asia) ?? {
    ...m1TodayHl,
    highTime: Math.floor(asOf.getTime() / 1000),
    lowTime: Math.floor(asOf.getTime() / 1000),
  };
  const londonHl = sessionHighLowWithTimes(sessions.london) ?? {
    ...m1TodayHl,
    highTime: Math.floor(asOf.getTime() / 1000),
    lowTime: Math.floor(asOf.getTime() / 1000),
  };
  const nyPreHl = sessionHighLowWithTimes(sessions.nyPre) ?? {
    ...m1TodayHl,
    highTime: Math.floor(asOf.getTime() / 1000),
    lowTime: Math.floor(asOf.getTime() / 1000),
  };
  const nyRthHl = sessionHighLowWithTimes(sessions.nyRth) ?? {
    ...m1TodayHl,
    highTime: Math.floor(asOf.getTime() / 1000),
    lowTime: Math.floor(asOf.getTime() / 1000),
  };
  const nyPmHl = sessionHighLowWithTimes(sessions.nyPm) ?? {
    ...m1TodayHl,
    highTime: Math.floor(asOf.getTime() / 1000),
    lowTime: Math.floor(asOf.getTime() / 1000),
  };

  const sessionBars = barsInCmeSession(m1, currentSessionKey);
  const currentDayStartTime = sessionBars[0]
    ? Math.floor(sessionBars[0].time.getTime() / 1000)
    : Math.floor(asOf.getTime() / 1000);
  const pdhFormedAt = pdhSourceBar
    ? Math.floor(pdhSourceBar.time.getTime() / 1000)
    : prev
      ? Math.floor(prev.time.getTime() / 1000)
      : undefined;
  const pdcFormedAt = pdcSourceBar
    ? Math.floor(pdcSourceBar.time.getTime() / 1000)
    : pdhSource === "yahoo_daily_fallback" && prev
      ? Math.floor(prev.time.getTime() / 1000)
      : undefined;
  const previousDayClose = prev?.close;

  const prevHigh = prev?.high ?? lastPrice;
  const prevLow = prev?.low ?? lastPrice;
  const currHigh = currPartial?.high ?? prevHigh;
  const currLow = currPartial?.low ?? prevLow;

  const m15Bias = timeframe15m.biasHint;
  const m5Bias = timeframe5m.biasHint;

  const dayOpen = sessionBars[0]?.open ?? lastPrice;
  const fvgDailyBars = buildFvgDailyBars(data.daily, m1, asOf);
  const nwogRaw = computeNwogLevels(m1, data.daily.filter((b) => getEstDateKey(b.time) <= today), asOf);
  const nwog = nwogRaw
    ? {
        top: nwogRaw.top,
        bottom: nwogRaw.bottom,
        weekOpen: nwogRaw.weekOpen,
        priorWeekClose: nwogRaw.priorWeekClose,
        startTime: nwogRaw.startTime,
      }
    : null;
  const htfPdArrays = computeHtfPdArrays({
    price: lastPrice,
    prev,
    currDayOpen: dayOpen,
    currHigh,
    currLow,
    dailyBars: fvgDailyBars,
    nwog,
  });
  const dailyBias = pdArrayDirectionHint(lastPrice, htfPdArrays).bias;
  const biasStack = computeBiasStack(dailyBias, m15Bias, m5Bias);
  const premiumDiscount = computePremiumDiscount({
    price: lastPrice,
    currHigh,
    currLow,
    prevHigh,
    prevLow,
    nwog,
    ndog: htfPdArrays.ndog,
  });

  const org = computeOrg(m1, today);
  const sessionCtx = resolveSessionContext(asOf);
  const sessionLevels = {
    asiaHigh: asiaHl.high,
    asiaLow: asiaHl.low,
    asiaHighTime: asiaHl.highTime,
    asiaLowTime: asiaHl.lowTime,
    londonHigh: londonHl.high,
    londonLow: londonHl.low,
    londonHighTime: londonHl.highTime,
    londonLowTime: londonHl.lowTime,
    nyPreHigh: nyPreHl.high,
    nyPreLow: nyPreHl.low,
    nyPreHighTime: nyPreHl.highTime,
    nyPreLowTime: nyPreHl.lowTime,
    nyRthHigh: nyRthHl.high,
    nyRthLow: nyRthHl.low,
    nyRthHighTime: nyRthHl.highTime,
    nyRthLowTime: nyRthHl.lowTime,
    nyPmHigh: nyPmHl.high,
    nyPmLow: nyPmHl.low,
    nyPmHighTime: nyPmHl.highTime,
    nyPmLowTime: nyPmHl.lowTime,
  };
  const liqLevels = liquidityLevelsFromContext({
    pdLevels: htfPdArrays.levels,
    sessions: sessionLevels,
    org,
  });
  const structureFacts = buildStructureFacts(m1, liqLevels, asOf, sessionCtx.id);

  return {
    symbol: data.symbol,
    fetchedAt: asOf.toISOString(),
    chartTimeEst: chartTimeEst ?? formatEst(asOf),
    daily: {
      previousDayHigh: prevHigh,
      previousDayLow: prevLow,
      currentDayHigh: currHigh,
      currentDayLow: currLow,
      equilibrium: eq(currLow, currHigh),
      biasHint: dailyBias,
      lastClose: lastPrice,
      m1BarClose: barClose,
      currentDayStartTime,
      previousDaySessionKey: previousSessionKey ?? undefined,
      currentDaySessionKey: currentSessionKey,
      pdhSource,
      pdhFormedAt,
      pdcFormedAt,
      previousDayClose,
      yahooDailyClose,
    },
    nwog,
    org,
    activeSession: {
      id: sessionCtx.id,
      label: sessionCtx.label,
      killZone: sessionCtx.killZone,
      amdPhase: sessionCtx.amdPhase,
      macroWindow: sessionCtx.macroWindow,
      summary: sessionPhaseSummary(sessionCtx),
    },
    sessions: sessionLevels,
    timeframe15m,
    timeframe5m,
    amdPhaseHint: sessionCtx.amdPhase,
    structureFacts,
    htfPdArrays,
    premiumDiscount,
    biasStack,
  };
}

export function formatM1Snapshot(m1: Bar[], count = 30): string {
  const recent = m1.slice(-count);
  if (recent.length === 0) return "No 1m bars available.";
  return recent
    .map(
      (b) =>
        `${formatEst(b.time)} O:${b.open.toFixed(2)} H:${b.high.toFixed(2)} L:${b.low.toFixed(2)} C:${b.close.toFixed(2)}`
    )
    .join("\n");
}

function sliceBarsAt(bars: Bar[], asOf: Date): Bar[] {
  const t = asOf.getTime();
  return bars.filter((b) => b.time.getTime() <= t);
}

export function buildMarketContext(
  data: { daily: Bar[]; m15: Bar[]; m5: Bar[]; m1: Bar[]; symbol: string },
  chartTimeEst?: string,
  chartLastPrice?: number | null
): MarketContext {
  const now = new Date();
  return buildMarketContextAt(data, now, chartTimeEst, chartLastPrice);
}

export function formatContextForPrompt(ctx: MarketContext): string {
  const pdBrief = formatPdArrayBrief(ctx);
  const execPlan = formatExecutionPlan(ctx);
  const biasAlert = ctx.biasStack.biasConflict
    ? `\n⚠️ **Partial bias conflict** (${ctx.biasStack.conflictPairs.join(", ")}) — tradeableBias: **${ctx.biasStack.tradeableBias}**. Still call in this direction at medium confidence unless chop at opening range gap fifty percent.\n`
    : `\n**Tradeable bias:** ${ctx.biasStack.tradeableBias} (${ctx.biasStack.alignedCount}/3 aligned). ${ctx.biasStack.summary}\n`;

  const sessionHints = formatSessionIctHints(ctx.activeSession.id, new Date(ctx.fetchedAt));

  return `## LIVE MARKET CONTEXT (auto-fetched — use these levels, do not invent HTF prices)

**Last MNQ price (1m): ${ctx.daily.lastClose.toFixed(2)}** — all cited levels must be near this range from JSON, not volume scales on the chart image.

The trader only uploaded a 1m chart. **Lead HTF analysis with daily PD arrays below** — then session/ORG for execution on 1m.

${pdBrief}
${biasAlert}
${sessionHints ? `\n${sessionHints}\n` : ""}${execPlan}

\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

Use biasStack.tradeableBias for tradeable bias. Chart image = one-minute execution structure only. In all trader-facing text, spell out terms — no abbreviations.`;
}

function formatStructureCompact(ctx: MarketContext): string {
  const lines: string[] = [];
  const mss = ctx.structureFacts.mss;
  if (mss) lines.push(`MSS: ${mss.description} at ${mss.level.toFixed(2)}`);
  const fp = ctx.structureFacts.firstPresentedFvg?.nyOpening;
  if (fp) {
    const lo = Math.min(fp.fvg.top, fp.fvg.bottom);
    const hi = Math.max(fp.fvg.top, fp.fvg.bottom);
    lines.push(
      `First presented 1m ${fp.fvg.type} FVG ${lo.toFixed(2)}–${hi.toFixed(2)} (${fp.windowLabel}, ${fp.filled ? "filled" : "unfilled"})`
    );
  }
  const fvgs = ctx.structureFacts.m1UnfilledFvgs.slice(-3);
  for (const f of fvgs) {
    lines.push(
      `${f.type} 1m FVG ${Math.min(f.top, f.bottom).toFixed(2)}–${Math.max(f.top, f.bottom).toFixed(2)}`
    );
  }
  for (const pool of ctx.structureFacts.relativeEqualPools?.slice(0, 4) ?? []) {
    lines.push(
      `${pool.type === "reh" ? "REH" : "REL"} ${pool.price.toFixed(2)} (${pool.barCount} swings)`
    );
  }
  for (const sweep of ctx.structureFacts.liquiditySweeps?.slice(0, 4) ?? []) {
    if (sweep.levelId === "pdh" || sweep.levelId === "pdl" || sweep.levelId === "pdc") {
      const ix = ctx.structureFacts.levelInteractions?.find((i) => i.levelId === sweep.levelId);
      if (ix?.status !== "CLOSED_BEYOND") continue;
    }
    const raid =
      sweep.side === "buy_side"
        ? "buy-side liquidity taken (raid on highs — not bullish by itself)"
        : sweep.side === "sell_side"
          ? "sell-side liquidity taken (raid on lows — not bearish by itself)"
          : "liquidity taken";
    lines.push(`${sweep.label}: ${raid} at ${sweep.price.toFixed(2)} (${sweep.at})`);
  }
  if (!lines.length) lines.push("No recent MSS in lookback; check chart for displacement/FVG.");
  return lines.join("\n");
}

/** Smaller prompt for live verdict — no full JSON dump (faster API). */
export function formatContextForLiveVerdict(ctx: MarketContext): string {
  const pdBrief = formatPdArrayBriefCompact(ctx);
  const execPlan = formatExecutionPlan(ctx);
  const biasLine = ctx.biasStack.biasConflict
    ? `Tradeable bias: ${ctx.biasStack.tradeableBias} (partial conflict: ${ctx.biasStack.conflictPairs.join(", ")})`
    : `Tradeable bias: ${ctx.biasStack.tradeableBias} (${ctx.biasStack.alignedCount}/3 aligned) — ${ctx.biasStack.summary}`;

  const sessionHints = formatSessionIctHints(ctx.activeSession.id, new Date(ctx.fetchedAt));

  return `## LIVE MARKET CONTEXT (JSON — use these prices exactly)

Last MNQ (1m): ${ctx.daily.lastClose.toFixed(2)}
Session: ${ctx.activeSession.label} — ${ctx.activeSession.summary}
${biasLine}

${pdBrief}

${execPlan}
${sessionHints ? `\n${sessionHints}\n` : ""}Structure (from 1m JSON — confirm on chart):
${formatStructureCompact(ctx)}

Premium/discount: ${ctx.premiumDiscount?.summary || "n/a"}`;
}

export function formatContextForBacktestPrompt(ctx: MarketContext, m1Snapshot: string): string {
  const pdBrief = formatPdArrayBrief(ctx);
  const execPlan = formatExecutionPlan(ctx);
  const biasAlert = ctx.biasStack.biasConflict
    ? `⚠️ BIAS CONFLICT (${ctx.biasStack.conflictPairs.join(", ")}) — tradeableBias: conflicted\n`
    : `Tradeable bias: ${ctx.biasStack.tradeableBias} (${ctx.biasStack.alignedCount}/3 aligned)\n`;

  return `## HISTORICAL MARKET CONTEXT (point-in-time replay — use these levels only)

${pdBrief}
${biasAlert}
${execPlan}
\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

## Recent 1m bars (OHLC, EST)
${m1Snapshot}

Use JSON for higher-timeframe premium/discount + biasStack. Chart/backtest PNG = one-minute execution only. In trader-facing text, spell out all terms — no abbreviations.`;
}
