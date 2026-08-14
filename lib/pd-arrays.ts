import type { Bar, FvgZone, MarketContext } from "./types";
import { isGapFilled } from "./gap-zones";
import { getEstDateKey } from "./market-data";

export type PdLevel = {
  id: string;
  label: string;
  price: number;
};

export type HtfPdArrays = {
  /** Prior day close → current day open gap (NDOG). */
  ndog: {
    top: number;
    bottom: number;
    priorClose: number;
    dayOpen: number;
  } | null;
  previousDay: {
    high: number;
    low: number;
    close: number;
    open: number;
    equilibrium: number;
  };
  currentDay: {
    high: number;
    low: number;
    open: number;
    equilibrium: number;
  };
  unfilledDailyFvgs: FvgZone[];
  recentDailyFvgs: FvgZone[];
  levels: PdLevel[];
  note: string;
};

export type PremiumDiscountContext = {
  vsCurrentDayRange: "premium" | "discount" | "equilibrium";
  vsPreviousDayRange: "premium" | "discount" | "equilibrium";
  vsNwog: "premium" | "discount" | "inside" | "n/a";
  vsNdog: "premium" | "discount" | "inside" | "n/a";
  summary: string;
};

function eq(a: number, b: number): number {
  return (a + b) / 2;
}

function zoneVsPrice(
  price: number,
  low: number,
  high: number
): "premium" | "discount" | "equilibrium" {
  const mid = eq(low, high);
  const range = high - low || 1;
  if (price > mid + range * 0.1) return "premium";
  if (price < mid - range * 0.1) return "discount";
  return "equilibrium";
}

function gapZoneVsPrice(
  price: number,
  top: number,
  bottom: number
): "premium" | "discount" | "inside" {
  if (price > top) return "premium";
  if (price < bottom) return "discount";
  return "inside";
}

function detectDailyFvgs(daily: Bar[], lookback = 20): FvgZone[] {
  const fvgs: FvgZone[] = [];
  const start = Math.max(2, daily.length - lookback);

  for (let i = start; i < daily.length; i++) {
    const c1 = daily[i - 2];
    const c3 = daily[i];
    if (!c1 || !c3) continue;

    if (c1.high < c3.low) {
      fvgs.push({
        timeframe: "daily",
        type: "bullish",
        top: c3.low,
        bottom: c1.high,
        formedAt: getEstDateKey(c3.time),
        startTime: Math.floor(c3.time.getTime() / 1000),
      });
    }
    if (c1.low > c3.high) {
      fvgs.push({
        timeframe: "daily",
        type: "bearish",
        top: c1.low,
        bottom: c3.high,
        formedAt: getEstDateKey(c3.time),
        startTime: Math.floor(c3.time.getTime() / 1000),
      });
    }
  }

  return fvgs.slice(-3);
}

/** Brief-only: drop daily gaps that have been filled on subsequent daily bars. */
function filterUnfilledDailyFvgs(daily: Bar[], fvgs: FvgZone[]): FvgZone[] {
  const unfilled: FvgZone[] = [];
  for (const fvg of fvgs) {
    for (let i = 2; i < daily.length; i++) {
      const c1 = daily[i - 2];
      const c3 = daily[i];
      if (getEstDateKey(c3.time) !== fvg.formedAt) continue;
      if (fvg.type === "bullish" && c1.high < c3.low) {
        if (!isGapFilled(daily, i, c1.high, c3.low)) unfilled.push(fvg);
        break;
      }
      if (fvg.type === "bearish" && c1.low > c3.high) {
        if (!isGapFilled(daily, i, c3.high, c1.low)) unfilled.push(fvg);
        break;
      }
    }
  }
  return unfilled;
}

export function computeHtfPdArrays(input: {
  price: number;
  prev: Bar | undefined;
  currDayOpen: number;
  currHigh: number;
  currLow: number;
  dailyBars: Bar[];
  nwog: MarketContext["nwog"];
}): HtfPdArrays {
  const prev = input.prev;
  const prevHigh = prev?.high ?? input.price;
  const prevLow = prev?.low ?? input.price;
  const prevClose = prev?.close ?? input.price;
  const prevOpen = prev?.open ?? prevClose;

  const dayOpen = input.currDayOpen || input.price;
  const ndogTop = Math.max(prevClose, dayOpen);
  const ndogBottom = Math.min(prevClose, dayOpen);
  const ndog =
    Math.abs(ndogTop - ndogBottom) >= 0.25
      ? { top: ndogTop, bottom: ndogBottom, priorClose: prevClose, dayOpen }
      : null;

  const recentDailyFvgs = detectDailyFvgs(input.dailyBars);
  const unfilledDailyFvgs = filterUnfilledDailyFvgs(input.dailyBars, recentDailyFvgs);

  const levels: PdLevel[] = [
    { id: "pdh", label: "Previous Day High", price: prevHigh },
    { id: "pdl", label: "Previous Day Low", price: prevLow },
    { id: "pdc", label: "Previous Day Close", price: prevClose },
    { id: "pdo", label: "Previous Day Open", price: prevOpen },
    { id: "cdo", label: "Current Day Open", price: dayOpen },
    { id: "cdeq", label: "Current Day Equilibrium", price: eq(input.currLow, input.currHigh) },
    { id: "pdeq", label: "Previous Day Equilibrium", price: eq(prevLow, prevHigh) },
  ];

  if (ndog) {
    levels.push(
      { id: "ndog_top", label: "New Day Opening Gap Top", price: ndog.top },
      { id: "ndog_bot", label: "New Day Opening Gap Bottom", price: ndog.bottom }
    );
  }

  if (input.nwog) {
    levels.push(
      { id: "nwog_top", label: "New Week Opening Gap Top", price: input.nwog.top },
      { id: "nwog_bot", label: "New Week Opening Gap Bottom", price: input.nwog.bottom }
    );
  }

  for (const fvg of recentDailyFvgs) {
    levels.push({
      id: `d_fvg_${fvg.type}`,
      label: `Daily ${fvg.type} Fair Value Gap`,
      price: eq(fvg.top, fvg.bottom),
    });
  }

  return {
    ndog,
    previousDay: {
      high: prevHigh,
      low: prevLow,
      close: prevClose,
      open: prevOpen,
      equilibrium: eq(prevLow, prevHigh),
    },
    currentDay: {
      high: input.currHigh,
      low: input.currLow,
      open: dayOpen,
      equilibrium: eq(input.currLow, input.currHigh),
    },
    unfilledDailyFvgs,
    recentDailyFvgs,
    levels,
    note:
      "HTF PD arrays are code-computed — use JSON prices directly. They will NOT appear on the 1m chart image.",
  };
}

export function computePremiumDiscount(input: {
  price: number;
  currHigh: number;
  currLow: number;
  prevHigh: number;
  prevLow: number;
  nwog: MarketContext["nwog"];
  ndog: HtfPdArrays["ndog"];
}): PremiumDiscountContext {
  const vsCurrentDayRange = zoneVsPrice(input.price, input.currLow, input.currHigh);
  const vsPreviousDayRange = zoneVsPrice(input.price, input.prevLow, input.prevHigh);
  const vsNwog = input.nwog
    ? gapZoneVsPrice(input.price, input.nwog.top, input.nwog.bottom)
    : "n/a";
  const vsNdog = input.ndog
    ? gapZoneVsPrice(input.price, input.ndog.top, input.ndog.bottom)
    : "n/a";

  const parts = [
    `vs today range: ${vsCurrentDayRange}`,
    `vs prev day range: ${vsPreviousDayRange}`,
    vsNwog !== "n/a" ? `vs NWOG: ${vsNwog}` : null,
    vsNdog !== "n/a" ? `vs NDOG: ${vsNdog}` : null,
  ].filter(Boolean);

  return {
    vsCurrentDayRange,
    vsPreviousDayRange,
    vsNwog,
    vsNdog,
    summary: parts.join("; "),
  };
}

export type NearestPdLevels = {
  support: PdLevel | null;
  resistance: PdLevel | null;
};

/** Nearest HTF PD level below and above current price. */
export function nearestPdLevels(price: number, levels: PdLevel[]): NearestPdLevels {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  let support: PdLevel | null = null;
  let resistance: PdLevel | null = null;
  for (const level of sorted) {
    if (level.price <= price + 0.01) support = level;
    if (level.price > price + 0.01 && !resistance) resistance = level;
  }
  return { support, resistance };
}

/** Daily directional frame from PD array position (not session/ORG). */
export function pdArrayDirectionHint(
  price: number,
  pd: HtfPdArrays
): { bias: "bullish" | "bearish" | "neutral"; summary: string } {
  const { previousDay: prev } = pd;
  if (price > prev.high) {
    return {
      bias: "bullish",
      summary: `Price ${price.toFixed(2)} above previous day high ${prev.high.toFixed(2)} — draw higher toward untapped liquidity above.`,
    };
  }
  if (price < prev.low) {
    return {
      bias: "bearish",
      summary: `Price ${price.toFixed(2)} below previous day low ${prev.low.toFixed(2)} — draw lower toward liquidity below.`,
    };
  }
  if (price >= prev.close) {
    return {
      bias: "bullish",
      summary: `Price ${price.toFixed(2)} above previous day close ${prev.close.toFixed(2)} inside prior range — bias higher toward previous day high ${prev.high.toFixed(2)}.`,
    };
  }
  return {
    bias: "bearish",
    summary: `Price ${price.toFixed(2)} below previous day close ${prev.close.toFixed(2)} inside prior range — bias lower toward previous day low ${prev.low.toFixed(2)}.`,
  };
}

/** Compact PD block for live verdict — fewer levels = faster model + fewer price dumps. */
export function formatPdArrayBriefCompact(ctx: MarketContext): string {
  const price = ctx.daily.lastClose;
  const pd = ctx.htfPdArrays;
  const { support, resistance } = nearestPdLevels(price, pd.levels);
  const direction = pdArrayDirectionHint(price, pd);
  const topLevels = [...pd.levels]
    .sort((a, b) => Math.abs(b.price - price) - Math.abs(a.price - price))
    .slice(0, 4)
    .sort((a, b) => b.price - a.price)
    .map((l) => `${l.label}: ${l.price.toFixed(2)}`)
    .join(" · ");

  return [
    "### PD arrays (compact — cite nearest support/resistance only in brief)",
    `Last price: ${price.toFixed(2)}`,
    `Bias: ${direction.bias} — ${direction.summary}`,
    support ? `Nearest support: ${support.label} @ ${support.price.toFixed(2)}` : "",
    resistance ? `Nearest resistance: ${resistance.label} @ ${resistance.price.toFixed(2)}` : "",
    topLevels ? `Nearby levels: ${topLevels}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Structured PD-array block for LLM prompts — lead analysis with these levels. */
export function formatPdArrayBrief(ctx: MarketContext): string {
  const price = ctx.daily.lastClose;
  const pd = ctx.htfPdArrays;
  const { support, resistance } = nearestPdLevels(price, pd.levels);
  const direction = pdArrayDirectionHint(price, pd);

  const levelLines = [...pd.levels]
    .sort((a, b) => b.price - a.price)
    .map((l) => `  ${l.label}: ${l.price.toFixed(2)}`)
    .join("\n");

  const unfilled = pd.unfilledDailyFvgs
    .map(
      (f) =>
        `  Daily ${f.type} fair value gap ${f.bottom.toFixed(2)}–${f.top.toFixed(2)} (formed ${f.formedAt})`
    )
    .join("\n");

  return [
    "### Daily PD arrays — PRIMARY directional levels (from HTF data, not the 1m chart)",
    `Last price: ${price.toFixed(2)}`,
    `PD-array bias: ${direction.bias} — ${direction.summary}`,
    `Premium/discount: ${ctx.premiumDiscount.summary}`,
    support
      ? `Nearest support (draw-toward from above): ${support.label} @ ${support.price.toFixed(2)}`
      : "Nearest support: none below in PD set",
    resistance
      ? `Nearest resistance (draw-toward from below): ${resistance.label} @ ${resistance.price.toFixed(2)}`
      : "Nearest resistance: none above in PD set",
    "",
    "All HTF PD levels (high → low):",
    levelLines,
    unfilled ? `\nUnfilled daily fair value gaps:\n${unfilled}` : "",
    "",
    "Frame higher/lower using these PD levels first (PDH, PDL, PDC, NDOG, NWOG, daily FVGs), then session/ORG for execution.",
    "**Copilot must lean directional:** call potential buy/sell toward nearest resistance/support unless hard no-trade rule applies.",
  ]
    .filter(Boolean)
    .join("\n");
}
