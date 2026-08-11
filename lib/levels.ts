import type { Bar, FvgZone, MarketContext } from "./types";
import { computeBiasStack } from "./bias-analysis";
import { detectUnfilledIntradayFvgs } from "./gap-zones";
import { computeHtfPdArrays, computePremiumDiscount, formatPdArrayBrief, pdArrayDirectionHint } from "./pd-arrays";
import { resolveSessionContext, sessionPhaseSummary } from "./sessions";
import { buildStructureFacts } from "./structure";
import {
  barsInEstWindow,
  buildFvgDailyBars,
  computeNwog as computeNwogLevels,
  findBarClosestTo,
  formatEst,
  getEstDateKey,
  sessionHighLow,
} from "./market-data";

function eq(a: number, b: number): number {
  return (a + b) / 2;
}

function biasFromPrice(price: number, low: number, high: number): "bullish" | "bearish" | "neutral" {
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

const RTH_CLOSE_MIN = 16 * 60 + 15; // 4:15 PM ET
const RTH_OPEN_MIN = 9 * 60 + 30; // 9:30 AM ET (cash open)

function priorTradingDayKey(m1: Bar[], todayKey: string): string | null {
  const keys = [...new Set(m1.map((b) => getEstDateKey(b.time)))].sort();
  const idx = keys.indexOf(todayKey);
  return idx > 0 ? keys[idx - 1]! : null;
}

/** ORG = prior session 4:15 PM close → today 9:30 AM open. */
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
    if (bar.high >= high) {
      high = bar.high;
      highTime = t;
    }
    if (bar.low <= low) {
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

function liquidityLevelsFromContext(input: {
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
): { daily: Bar[]; prev: Bar | undefined; currPartial: { high: number; low: number; close: number } | null } {
  const asOfKey = getEstDateKey(asOf);
  const completed = daily.filter((b) => getEstDateKey(b.time) < asOfKey);
  const dayM1 = m1.filter((b) => getEstDateKey(b.time) === asOfKey);
  const hl = sessionHighLow(dayM1);
  const prev = completed.at(-1);
  const currPartial = hl
    ? { high: hl.high, low: hl.low, close: dayM1.at(-1)?.close ?? hl.high }
    : null;
  return { daily: completed, prev, currPartial };
}

export function buildMarketContextAt(
  data: { daily: Bar[]; m15: Bar[]; m5: Bar[]; m1: Bar[]; symbol: string },
  asOf: Date,
  chartTimeEst?: string
): MarketContext {
  const m1 = sliceBarsAt(data.m1, asOf);
  const m5 = sliceBarsAt(data.m5, asOf);
  const m15 = sliceBarsAt(data.m15, asOf);

  const today = getEstDateKey(asOf);
  const yesterdayDate = new Date(asOf);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getEstDateKey(yesterdayDate);

  const { prev, currPartial } = sliceDailyForAsOf(data.daily, m1, asOf);
  const lastPrice = m1.at(-1)?.close ?? currPartial?.close ?? prev?.close ?? 0;

  const m15Recent = m15.slice(-32);
  const m5Recent = m5.slice(-48);
  const m15Hl = sessionHighLow(m15Recent) ?? { high: lastPrice, low: lastPrice };
  const m5Hl = sessionHighLow(m5Recent) ?? { high: lastPrice, low: lastPrice };

  const m1TodayHl =
    sessionHighLow(m1.filter((b) => getEstDateKey(b.time) === today)) ??
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

  const todayM1 = m1.filter((b) => getEstDateKey(b.time) === today);
  const currentDayStartTime = todayM1[0]
    ? Math.floor(todayM1[0].time.getTime() / 1000)
    : Math.floor(asOf.getTime() / 1000);

  const prevHigh = prev?.high ?? lastPrice;
  const prevLow = prev?.low ?? lastPrice;
  const currHigh = currPartial?.high ?? prevHigh;
  const currLow = currPartial?.low ?? prevLow;

  const m15Bias = biasFromPrice(lastPrice, m15Hl.low, m15Hl.high);
  const m5Bias = biasFromPrice(lastPrice, m5Hl.low, m5Hl.high);

  const dayOpen = m1.find((b) => getEstDateKey(b.time) === today)?.open ?? lastPrice;
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
  const structureFacts = buildStructureFacts(
    m1,
    liquidityLevelsFromContext({
      pdLevels: htfPdArrays.levels,
      sessions: sessionLevels,
      org,
    })
  );

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
      currentDayStartTime,
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
    timeframe15m: {
      high: m15Hl.high,
      low: m15Hl.low,
      equilibrium: eq(m15Hl.low, m15Hl.high),
      biasHint: m15Bias,
      unfilledFvgs: detectUnfilledFvgs(m15, "15m"),
    },
    timeframe5m: {
      high: m5Hl.high,
      low: m5Hl.low,
      equilibrium: eq(m5Hl.low, m5Hl.high),
      biasHint: m5Bias,
      unfilledFvgs: detectUnfilledFvgs(m5, "5m"),
    },
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
  chartTimeEst?: string
): MarketContext {
  const now = new Date();
  return buildMarketContextAt(data, now, chartTimeEst);
}

export function formatContextForPrompt(ctx: MarketContext): string {
  const pdBrief = formatPdArrayBrief(ctx);
  const biasAlert = ctx.biasStack.biasConflict
    ? `\n⚠️ **Partial bias conflict** (${ctx.biasStack.conflictPairs.join(", ")}) — tradeableBias: **${ctx.biasStack.tradeableBias}**. Still call in this direction at medium confidence unless chop at opening range gap fifty percent.\n`
    : `\n**Tradeable bias:** ${ctx.biasStack.tradeableBias} (${ctx.biasStack.alignedCount}/3 aligned). ${ctx.biasStack.summary}\n`;

  return `## LIVE MARKET CONTEXT (auto-fetched — use these levels, do not invent HTF prices)

The trader only uploaded a 1m chart. **Lead HTF analysis with daily PD arrays below** — then session/ORG for execution on 1m.

${pdBrief}
${biasAlert}
\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

Use biasStack.tradeableBias for tradeable bias. Chart image = one-minute execution structure only. In all trader-facing text, spell out terms — no abbreviations.`;
}

export function formatContextForBacktestPrompt(ctx: MarketContext, m1Snapshot: string): string {
  const pdBrief = formatPdArrayBrief(ctx);
  const biasAlert = ctx.biasStack.biasConflict
    ? `⚠️ BIAS CONFLICT (${ctx.biasStack.conflictPairs.join(", ")}) — tradeableBias: conflicted\n`
    : `Tradeable bias: ${ctx.biasStack.tradeableBias} (${ctx.biasStack.alignedCount}/3 aligned)\n`;

  return `## HISTORICAL MARKET CONTEXT (point-in-time replay — use these levels only)

${pdBrief}
${biasAlert}
\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

## Recent 1m bars (OHLC, EST)
${m1Snapshot}

Use JSON for higher-timeframe premium/discount + biasStack. Chart/backtest PNG = one-minute execution only. In trader-facing text, spell out all terms — no abbreviations.`;
}
