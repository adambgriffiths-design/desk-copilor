import type { Bar, MarketContext } from "./types";
import { estTimeOnDateKey, fvgFormationTime, getEstDateKey } from "./market-data";

const FVG_PRICE_TOL = 1.5;

function matchFvgTriple(
  daily: Bar[],
  fvg: { type: "bullish" | "bearish"; top: number; bottom: number; formedAt?: string }
): { c2: Bar; c3: Bar } | null {
  let best: { c2: Bar; c3: Bar; score: number } | null = null;

  for (let i = 2; i < daily.length; i++) {
    const c1 = daily[i - 2];
    const c2 = daily[i - 1];
    const c3 = daily[i];
    const c3Key = getEstDateKey(c3.time);
    const dateMatch = !fvg.formedAt || c3Key === fvg.formedAt;

    if (fvg.type === "bullish" && c1.high < c3.low) {
      const priceMatch =
        Math.abs(c1.high - fvg.bottom) <= FVG_PRICE_TOL &&
        Math.abs(c3.low - fvg.top) <= FVG_PRICE_TOL;
      const score = (priceMatch ? 2 : 0) + (dateMatch ? 4 : 0);
      if (score > 0 && (!best || score > best.score)) {
        best = { c2, c3, score };
      }
    }
    if (fvg.type === "bearish" && c1.low > c3.high) {
      const priceMatch =
        Math.abs(c1.low - fvg.top) <= FVG_PRICE_TOL &&
        Math.abs(c3.high - fvg.bottom) <= FVG_PRICE_TOL;
      const score = (priceMatch ? 2 : 0) + (dateMatch ? 4 : 0);
      if (score > 0 && (!best || score > best.score)) {
        best = { c2, c3, score };
      }
    }
  }

  return best ? { c2: best.c2, c3: best.c3 } : null;
}

/** Daily FVG draws from c2 @ 6:00 PM ET (CME open on displacement day), not c3 midnight. */
function resolveFvgStartTime(
  fvg: { type: "bullish" | "bearish"; top: number; bottom: number; formedAt?: string },
  m1: Bar[],
  dailyBars: Bar[]
): number {
  const triple = matchFvgTriple(dailyBars, fvg);
  if (triple) return fvgFormationTime(triple.c2, m1);

  if (fvg.formedAt) {
    for (let i = 2; i < dailyBars.length; i++) {
      const c3 = dailyBars[i];
      if (getEstDateKey(c3.time) !== fvg.formedAt) continue;
      return fvgFormationTime(dailyBars[i - 1], m1);
    }
  }

  return estTimeOnDateKey(fvg.formedAt ?? getEstDateKey(new Date()), 18, 0);
}

export type DrawingLevel = {
  id: string;
  label: string;
  price: number;
  color: string;
  dash: string;
  group: "org" | "gap" | "session" | "daily" | "structure";
  /** Unix seconds — line begins here (extends right). */
  startTime?: number;
};

export type DrawingZone = {
  id: string;
  label: string;
  top: number;
  bottom: number;
  type: "bullish" | "bearish";
  color: string;
  fill: string;
  borderColor?: string;
  formedAt?: string;
  startTime?: number;
  /** Overlay + native chart label */
  showLabel?: boolean;
  kind?: "fvg";
  ce?: number;
};

/** No yellow — cyan org, fuchsia CE, red gaps, slate sessions, violet daily. */
export const LEVEL_COLORS = {
  org: "#22d3ee",
  orgCe: "#e879f9",
  orgMuted: "#64748b",
  gap: "#ef4444",
  session: "#94a3b8",
  daily: "#cbd5e1",
  dailyEq: "#a78bfa",
  structure: "#fb7185",
} as const;

function push(
  out: DrawingLevel[],
  seen: Set<string>,
  level: DrawingLevel
): void {
  const key = `${level.id}:${level.price.toFixed(2)}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(level);
}

/** Level prices from one-minute execution data (ORG, sessions) + daily arrays for HTF. */
export function buildDrawingLevels(ctx: MarketContext): DrawingLevel[] {
  const levels: DrawingLevel[] = [];
  const seen = new Set<string>();
  const dayStart = ctx.daily.currentDayStartTime;

  if (ctx.org) {
    const orgStart = ctx.org.formedAtTime ?? dayStart;
    for (const [id, price, label, dash, color] of [
      ["org_top", ctx.org.top, "Opening range gap top", "4 3", LEVEL_COLORS.org],
      ["org_bottom", ctx.org.bottom, "Opening range gap bottom", "4 3", LEVEL_COLORS.org],
      ["org_ce", ctx.org.ce, "ORG midpoint (50%)", "6 4", LEVEL_COLORS.orgCe],
    ] as const) {
      push(levels, seen, {
        id,
        label,
        price,
        color,
        dash,
        group: "org",
        startTime: orgStart,
      });
    }
  }

  if (ctx.nwog) {
    const nwogStart = ctx.nwog.startTime ?? dayStart;
    push(levels, seen, {
      id: "nwog_top",
      label: "New week opening gap top",
      price: ctx.nwog.top,
      color: LEVEL_COLORS.gap,
      dash: "4 3",
      group: "gap",
      startTime: nwogStart,
    });
    push(levels, seen, {
      id: "nwog_bottom",
      label: "New week opening gap bottom",
      price: ctx.nwog.bottom,
      color: LEVEL_COLORS.gap,
      dash: "4 3",
      group: "gap",
      startTime: nwogStart,
    });
  }

  const sessionLines: Array<[string, number, string, number | undefined]> = [
    ["asia_high", ctx.sessions.asiaHigh, "Asia session high", ctx.sessions.asiaHighTime],
    ["asia_low", ctx.sessions.asiaLow, "Asia session low", ctx.sessions.asiaLowTime],
    ["london_high", ctx.sessions.londonHigh, "London session high", ctx.sessions.londonHighTime],
    ["london_low", ctx.sessions.londonLow, "London session low", ctx.sessions.londonLowTime],
    ["ny_pre_high", ctx.sessions.nyPreHigh, "New York pre-market high", ctx.sessions.nyPreHighTime],
    ["ny_pre_low", ctx.sessions.nyPreLow, "New York pre-market low", ctx.sessions.nyPreLowTime],
  ];
  for (const [id, price, label, startTime] of sessionLines) {
    push(levels, seen, {
      id,
      label,
      price,
      color: LEVEL_COLORS.session,
      dash: "2 3",
      group: "session",
      startTime: startTime ?? dayStart,
    });
  }

  const pdDrawIds = new Set([
    "pdh",
    "pdl",
    "pdc",
    "pdeq",
    "cdeq",
    "ndog_top",
    "ndog_bot",
  ]);
  for (const pd of ctx.htfPdArrays.levels) {
    if (!pdDrawIds.has(pd.id)) continue;
    push(levels, seen, {
      id: pd.id,
      label: pd.label,
      price: pd.price,
      color: LEVEL_COLORS.daily,
      dash: pd.id === "pdc" || pd.id.startsWith("ndog") ? "4 2" : "2 3",
      group: "daily",
      startTime: dayStart,
    });
  }

  return levels.sort((a, b) => b.price - a.price);
}

/** Shaded daily fair value gap zones (classic wick gap, up to 3 recent). */
export function buildDrawingZones(
  ctx: MarketContext,
  m1: Bar[] = [],
  dailyBars: Bar[] = []
): DrawingZone[] {
  return ctx.htfPdArrays.recentDailyFvgs.map((fvg, i) => {
    const startTime = resolveFvgStartTime(fvg, m1, dailyBars);
    const ce = (fvg.top + fvg.bottom) / 2;
    const borderColor = fvg.type === "bullish" ? "#fb7185" : "#f472b6";

    return {
      id: `d_fvg_${fvg.type}_${i}`,
      label: `Daily ${fvg.type} FVG · ${fvg.formedAt}`,
      top: fvg.top,
      bottom: fvg.bottom,
      type: fvg.type,
      color: LEVEL_COLORS.structure,
      borderColor,
      fill:
        fvg.type === "bullish"
          ? "rgba(251, 113, 133, 0.2)"
          : "rgba(244, 114, 182, 0.2)",
      formedAt: fvg.formedAt,
      startTime,
      showLabel: true,
      kind: "fvg",
      ce,
    };
  });
}

export function formatLevelsForClipboard(
  levels: DrawingLevel[],
  zones: DrawingZone[] = []
): string {
  const lines = levels.map((l) => `${l.label}: ${l.price.toFixed(2)}`);
  for (const z of zones) {
    lines.push(
      `${z.label}: ${Math.min(z.top, z.bottom).toFixed(2)} – ${Math.max(z.top, z.bottom).toFixed(2)}`
    );
  }
  return lines.join("\n");
}

export function formatLevelsForPineInputs(levels: DrawingLevel[]): string {
  return JSON.stringify(
    levels.map((l) => ({ label: l.label, price: Number(l.price.toFixed(2)) })),
    null,
    2
  );
}
