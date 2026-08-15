/**
 * LEVEL DRAW CATALOG (extension chart-draw.js + /api/levels)
 *
 * Lines (`DrawingLevel.group`):
 * - org: org_top, org_bottom, org_ce — opening range gap boundaries + midpoint (cyan / fuchsia)
 * - gap: nwog_top, nwog_bottom — new week opening gap (red)
 * - session: asia/london/ny_pre/ny_rth/ny_pm high & low (slate)
 * - daily: pdh, pdl, pdc, pdeq, cdeq, ndog_top, ndog_bot — HTF PD arrays + NDOG (violet/slate)
 *
 * Zones (`DrawingZone.kind`):
 * - fvg + id d_fvg_* — recent daily fair value gaps (rose/pink fill)
 * - fvg + id fpfvg_ny_opening — first presented 1m FVG after NY open (teal/orange)
 * - fhdr + id fhdr_band — first hour dealing range 9:30–10:30 ET (amber box)
 *
 * Toggle keys (extension level-toggles.js): showOrg, showPd, showGap, showSession,
 * showDailyFvg, showFpfvg, showFhdr, showRehRel
 */
import type { Bar, FirstPresentedFvgResult, MarketContext } from "./types";
import {
  barTimeSec,
  barsInEstWindow,
  estTimeOnDateKey,
  findExtremeBarInWindow,
  findFormationBarAtPrice,
  findBarClosestTo,
  fvgFormationTime,
  getEstDateKey,
  getEstMinutes,
  priorEstDateKey,
  resolvePdLevelAnchorTimes,
  sessionHighLow,
  RTH_CLOSE_MIN,
  RTH_OPEN_MIN,
} from "./market-data";
import type { RelativeEqualPool } from "./structure";
import { rehRelTolerance } from "./structure";
import { formatChartLevelLabel, formatChartOverlayLabel } from "./plain-language";

const FHDR_END_MIN = 10 * 60 + 30;

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

export type LabelAlign = "top" | "middle" | "bottom";
export type LabelHorzAlign = "left" | "center" | "right";

/** Min distance from live price — REH must sit above, REL below (MNQ points). */
export const REH_REL_PRICE_EPS = 0.25;

/** Price gap (MNQ points) below which level labels are staggered above/below the line. */
export const LABEL_CLUSTER_PRICE_MIN = 4;
export const LABEL_CLUSTER_PRICE_DEFAULT = 8;
export const LABEL_CLUSTER_PRICE_MAX = 14;
export const LABEL_CLUSTER_PRICE_RATIO = 0.0035;

/** Extra pad between label bounding boxes (overlay + chart PNG). */
export const LABEL_MIN_GAP_PX = 4;
export const LABEL_OFFSET_TOP_PX = 4;
export const LABEL_OFFSET_BOTTOM_PX = 16;
/** Vertical distance between same-side stagger lanes (must clear the pill). */
export const LABEL_LANE_STEP_PX = 20;
/** Horizontal nudge per stagger lane (overlay). */
export const LABEL_LANE_X_STEP_PX = 28;

/** Estimated label height for bbox overlap checks (dark pill + padding). */
export const LABEL_EST_HEIGHT_PX = 16;

/** Max stagger lanes searched per label (above/below stacks). */
export const LABEL_MAX_LANES = 24;

export type DrawingLevel = {
  id: string;
  label: string;
  price: number;
  color: string;
  dash: string;
  group: "org" | "gap" | "session" | "daily" | "structure";
  /** Unix seconds — line begins here (extends right). */
  startTime?: number;
  /** Native TV vertLabelsAlign — relative to this ray, never the pane gutter. */
  labelAlign?: LabelAlign;
  /** Native TV horzLabelsAlign — slides the title along this ray. */
  labelHorzAlign?: LabelHorzAlign;
  /** Stagger index within a price cluster (0 = on the formation). */
  labelLane?: number;
  /** Seconds to nudge the ray start so clustered titles separate along the same price. */
  labelTimeShiftSec?: number;
  /** Native TV title for this drawing only — never a slash-joined cluster name. */
  displayLabel?: string;
  showLabel?: boolean;
  /** Research overlay (EQH/EQL importance). Older chart-draw ignores unknown fields. */
  importance?: "LOW" | "MEDIUM" | "HIGH";
  why?: string;
  visualClass?: "A" | "B" | "C" | "D";
  liquidityArea?: {
    type: "BUY_SIDE" | "SELL_SIDE";
    priceLow: number;
    priceHigh: number;
    representativeLevel: number;
  };
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
  /** Unix seconds — zone ends here (optional bounded rectangles). */
  endTime?: number;
  /** Overlay + native chart label */
  showLabel?: boolean;
  /** Native TV vertLabelsAlign — relative to this drawing, never the pane gutter. */
  labelAlign?: LabelAlign;
  /** Native TV horzLabelsAlign — slides the title along this drawing. */
  labelHorzAlign?: LabelHorzAlign;
  /** Stagger index within a price cluster (0 = on the formation). */
  labelLane?: number;
  /** Seconds to nudge the start so clustered titles separate along the same price. */
  labelTimeShiftSec?: number;
  /** Native TV title for this drawing only — never a slash-joined cluster name. */
  displayLabel?: string;
  kind?: "fvg" | "fhdr";
  ce?: number;
  locked?: boolean;
};

export type FhdrRange = {
  high: number;
  low: number;
  startTime: number;
  endTime: number;
  locked: boolean;
};

export type FirstPresentedFvgDraw = {
  top: number;
  bottom: number;
  ce: number;
  type: "bullish" | "bearish";
  formedAtEst: string;
  filled: boolean;
  startTime?: number;
};

/** Distinct hues — cyan session, fuchsia REL, violet PD, teal ORG, red gaps. */
export const LEVEL_COLORS = {
  org: "#22d3ee",
  orgCe: "#e879f9",
  orgMuted: "#64748b",
  gap: "#ef4444",
  session: "#38bdf8",
  daily: "#a78bfa",
  dailyEq: "#a78bfa",
  structure: "#fb7185",
  fhdr: "#f59e0b",
  fpfvg: "#2dd4bf",
  fpfvgBear: "#fb923c",
  /** REH / REL — resting liquidity (relative equal highs/lows). */
  liquidity: "#e879f9",
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

function priorSessionDateKey(m1: Bar[], fetchedAt: string): string {
  const today = getEstDateKey(new Date(fetchedAt));
  const fromBars = priorEstDateKey(m1, today);
  if (fromBars) return fromBars;
  const prior = new Date(new Date(fetchedAt).getTime() - 24 * 60 * 60 * 1000);
  return getEstDateKey(prior);
}

function sessionBarWindows(m1: Bar[], fetchedAt: string) {
  const today = getEstDateKey(new Date(fetchedAt));
  const yesterday = priorSessionDateKey(m1, fetchedAt);
  return {
    asia: [
      ...barsInEstWindow(m1, 18 * 60, 24 * 60, yesterday),
      ...barsInEstWindow(m1, 0, 60, today),
    ],
    london: barsInEstWindow(m1, 2 * 60, 5 * 60, today),
    nyPre: barsInEstWindow(m1, 7 * 60, 9 * 60 + 30, today),
    nyRth: barsInEstWindow(m1, 9 * 60 + 30, 16 * 60, today),
    nyPm: barsInEstWindow(m1, 13 * 60 + 30, 16 * 60, today),
  };
}

function anchorFromSessionWindow(
  windowBars: Bar[],
  price: number,
  kind: "high" | "low",
  timeHint?: number
): number | undefined {
  const extremeBar = findExtremeBarInWindow(windowBars, kind, price);
  if (extremeBar) return barTimeSec(extremeBar);
  const formed = findFormationBarAtPrice(windowBars, price, kind);
  if (formed != null) return formed;
  return timeHint;
}

/** Last 1m close, ctx daily lastClose, or explicit chart price override. */
export function resolveDrawingCurrentPrice(
  ctx: MarketContext,
  m1: Bar[] = [],
  override?: number | null
): number | null {
  if (override != null && Number.isFinite(override) && override > 0) return override;
  const fromM1 = m1.at(-1)?.close;
  if (fromM1 != null && Number.isFinite(fromM1) && fromM1 > 0) return fromM1;
  const fromCtx = ctx.daily?.lastClose;
  if (fromCtx != null && Number.isFinite(fromCtx) && fromCtx > 0) return fromCtx;
  return null;
}

/** Overlay DTO — production RelativeEqualPool plus optional research fields. Trading detectors stay unchanged. */
export type DrawingRelativeEqualPool = RelativeEqualPool & {
  importance?: "LOW" | "MEDIUM" | "HIGH";
  why?: string;
  visualClass?: "A" | "B" | "C" | "D";
  liquidityArea?: {
    type: "BUY_SIDE" | "SELL_SIDE";
    priceLow: number;
    priceHigh: number;
    representativeLevel: number;
    contributingSwingCount?: number;
    status?: string;
  };
};

/** REH above price, REL below — when price unknown, return all pools (fallback). */
export function filterRelativeEqualPoolsByPrice<T extends RelativeEqualPool>(
  pools: T[],
  currentPrice: number | null | undefined,
  eps = REH_REL_PRICE_EPS
): T[] {
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return pools;
  }
  return pools.filter((p) => {
    if (p.type === "reh") return p.price >= currentPrice + eps;
    if (p.type === "rel") return p.price <= currentPrice - eps;
    return true;
  });
}

/**
 * One visible shelf cannot be buy-side and sell-side. Keep the stronger pool
 * (more swings, else farther from live price, else REL). Does not change
 * lib/reh-rel.ts detectors.
 */
export function collapseOppositeRelativeEqualOnSameShelf<T extends RelativeEqualPool>(
  pools: T[],
  currentPrice?: number | null,
  shelfPts = LABEL_CLUSTER_PRICE_MIN
): T[] {
  const pad = Number.isFinite(shelfPts) && shelfPts > 0 ? shelfPts : LABEL_CLUSTER_PRICE_MIN;
  const drop = new Set<number>();
  for (let i = 0; i < pools.length; i++) {
    if (drop.has(i) || pools[i]!.type !== "reh") continue;
    for (let j = 0; j < pools.length; j++) {
      if (i === j || drop.has(j) || pools[j]!.type !== "rel") continue;
      if (Math.abs(pools[i]!.price - pools[j]!.price) > pad + 1e-9) continue;
      const a = pools[i]!;
      const b = pools[j]!;
      const aBars = a.barCount || 0;
      const bBars = b.barCount || 0;
      let keepReh = aBars > bBars;
      if (aBars === bBars && currentPrice != null && Number.isFinite(currentPrice)) {
        keepReh = Math.abs(a.price - currentPrice) >= Math.abs(b.price - currentPrice);
      } else if (aBars === bBars) {
        keepReh = false;
      }
      drop.add(keepReh ? j : i);
    }
  }
  return pools.filter((_, idx) => !drop.has(idx));
}

/** Level prices from one-minute execution data (ORG, sessions) + daily arrays for HTF. */
export function buildDrawingLevels(
  ctx: MarketContext,
  m1: Bar[] = [],
  opts?: {
    currentPrice?: number | null;
    /** Analysis overlay override — production structureFacts stay untouched. */
    relativeEqualPools?: DrawingRelativeEqualPool[];
  }
): DrawingLevel[] {
  const levels: DrawingLevel[] = [];
  const seen = new Set<string>();
  const pdAnchors = resolvePdLevelAnchorTimes(m1, {
    fetchedAt: ctx.fetchedAt,
    orgFormedAt: ctx.org?.formedAtTime,
    hasNdog: ctx.htfPdArrays.ndog != null,
  });

  if (ctx.org) {
    const todayKey = getEstDateKey(new Date(ctx.fetchedAt));
    const priorKey = priorEstDateKey(m1, todayKey);
    const close415Bar = priorKey ? findBarClosestTo(m1, RTH_CLOSE_MIN, priorKey) : null;
    const close415Time = close415Bar ? barTimeSec(close415Bar) : undefined;
    const open930Time = ctx.org.formedAtTime;
    const topFromClose = Math.abs(ctx.org.top - ctx.org.close415) < 0.01;
    const bottomFromClose = Math.abs(ctx.org.bottom - ctx.org.close415) < 0.01;

    push(levels, seen, {
      id: "org_top",
      label: "Opening Range Gap Top",
      price: ctx.org.top,
      color: LEVEL_COLORS.org,
      dash: "4 3",
      group: "org",
      startTime: topFromClose ? close415Time : open930Time,
    });
    push(levels, seen, {
      id: "org_bottom",
      label: "Opening Range Gap Bottom",
      price: ctx.org.bottom,
      color: LEVEL_COLORS.org,
      dash: "4 3",
      group: "org",
      startTime: bottomFromClose ? close415Time : open930Time,
    });
    push(levels, seen, {
      id: "org_ce",
      label: "Opening Range Gap Midpoint (50%)",
      price: ctx.org.ce,
      color: LEVEL_COLORS.orgCe,
      dash: "6 4",
      group: "org",
      startTime: open930Time,
    });
  }

  if (ctx.nwog) {
    const nwogStart = ctx.nwog.startTime;
    push(levels, seen, {
      id: "nwog_top",
      label: "New Week Opening Gap Top",
      price: ctx.nwog.top,
      color: LEVEL_COLORS.gap,
      dash: "4 3",
      group: "gap",
      startTime: nwogStart,
    });
    push(levels, seen, {
      id: "nwog_bottom",
      label: "New Week Opening Gap Bottom",
      price: ctx.nwog.bottom,
      color: LEVEL_COLORS.gap,
      dash: "4 3",
      group: "gap",
      startTime: nwogStart,
    });
  }

  const sessionWindows = sessionBarWindows(m1, ctx.fetchedAt);

  const sessionLines: Array<[string, string, Bar[], number | undefined, "high" | "low"]> = [
    ["asia_high", "Asia Session High", sessionWindows.asia, ctx.sessions.asiaHighTime, "high"],
    ["asia_low", "Asia Session Low", sessionWindows.asia, ctx.sessions.asiaLowTime, "low"],
    ["london_high", "London Session High", sessionWindows.london, ctx.sessions.londonHighTime, "high"],
    ["london_low", "London Session Low", sessionWindows.london, ctx.sessions.londonLowTime, "low"],
    ["ny_pre_high", "New York Pre-Market High", sessionWindows.nyPre, ctx.sessions.nyPreHighTime, "high"],
    ["ny_pre_low", "New York Pre-Market Low", sessionWindows.nyPre, ctx.sessions.nyPreLowTime, "low"],
    ["ny_rth_high", "New York Regular Trading Hours High", sessionWindows.nyRth, ctx.sessions.nyRthHighTime, "high"],
    ["ny_rth_low", "New York Regular Trading Hours Low", sessionWindows.nyRth, ctx.sessions.nyRthLowTime, "low"],
    ["ny_pm_high", "New York Afternoon Session High", sessionWindows.nyPm, ctx.sessions.nyPmHighTime, "high"],
    ["ny_pm_low", "New York Afternoon Session Low", sessionWindows.nyPm, ctx.sessions.nyPmLowTime, "low"],
  ];
  for (const [id, label, windowBars, timeHint, kind] of sessionLines) {
    // Unformed sessions (empty window) must not inherit the day's high/low or a 0-price gutter.
    if (!windowBars.length) continue;
    const fromWindow = sessionHighLow(windowBars);
    const price = kind === "low" ? fromWindow?.low : fromWindow?.high;
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    const startTime = anchorFromSessionWindow(windowBars, price, kind, timeHint);
    push(levels, seen, {
      id,
      label,
      price,
      color: LEVEL_COLORS.session,
      dash: "2 3",
      group: "session",
      startTime,
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
      startTime: pdAnchors[pd.id],
    });
  }

  const currentPrice = resolveDrawingCurrentPrice(ctx, m1, opts?.currentPrice);
  const overlayPools: DrawingRelativeEqualPool[] =
    opts?.relativeEqualPools ?? ctx.structureFacts.relativeEqualPools ?? [];
  const rehRelPools = collapseOppositeRelativeEqualOnSameShelf(
    filterRelativeEqualPoolsByPrice(overlayPools, currentPrice),
    currentPrice
  );
  const rehRelCounts = { reh: 0, rel: 0 };
  for (const pool of rehRelPools) {
    const idx = rehRelCounts[pool.type]++;
    push(levels, seen, {
      id: `${pool.type}_${idx}`,
      label: pool.type === "reh" ? "Relative Equal Highs" : "Relative Equal Lows",
      price: pool.price,
      color: LEVEL_COLORS.liquidity,
      dash: "6 4",
      group: "structure",
      startTime: pool.startTime,
      importance: pool.importance,
      why: pool.why,
      visualClass: pool.visualClass,
      liquidityArea: pool.liquidityArea
        ? {
            type: pool.liquidityArea.type,
            priceLow: pool.liquidityArea.priceLow,
            priceHigh: pool.liquidityArea.priceHigh,
            representativeLevel: pool.liquidityArea.representativeLevel,
          }
        : undefined,
    });
  }

  return levels.sort((a, b) => b.price - a.price);
}

/** First hour dealing range — 1m high/low from 9:30–10:30 ET (distinct from 30m opening range). */
export function computeFhdr(m1: Bar[], fetchedAt: string): FhdrRange | null {
  const today = getEstDateKey(new Date(fetchedAt));
  const fhdrBars = barsInEstWindow(m1, RTH_OPEN_MIN, FHDR_END_MIN, today);
  if (!fhdrBars.length) return null;

  const high = Math.max(...fhdrBars.map((b) => b.high));
  const low = Math.min(...fhdrBars.map((b) => b.low));
  const startTime = estTimeOnDateKey(today, 9, 30);
  const endTime = estTimeOnDateKey(today, 10, 30);
  const locked = getEstMinutes(new Date(fetchedAt)) >= FHDR_END_MIN;

  return { high, low, startTime, endTime, locked };
}

export function buildFhdrZone(fhdr: FhdrRange): DrawingZone {
  return {
    id: "fhdr_band",
    label: "First Hour Dealing Range (9:30–10:30)",
    top: fhdr.high,
    bottom: fhdr.low,
    type: "bullish",
    color: LEVEL_COLORS.fhdr,
    borderColor: LEVEL_COLORS.fhdr,
    fill: "rgba(245, 158, 11, 0.16)",
    startTime: fhdr.startTime,
    endTime: fhdr.endTime,
    showLabel: true,
    kind: "fhdr",
    locked: fhdr.locked,
  };
}

export function formatFirstPresentedFvgDraw(
  fp: FirstPresentedFvgResult | null | undefined
): FirstPresentedFvgDraw | null {
  if (!fp) return null;
  const { fvg } = fp;
  return {
    top: fvg.top,
    bottom: fvg.bottom,
    ce: (fvg.top + fvg.bottom) / 2,
    type: fvg.type,
    formedAtEst: fvg.formedAt,
    filled: fp.filled,
    startTime: fvg.startTime,
  };
}

export function buildFirstPresentedFvgZone(
  fp: FirstPresentedFvgResult | null | undefined
): DrawingZone | null {
  if (!fp) return null;
  const { fvg } = fp;
  const ce = (fvg.top + fvg.bottom) / 2;
  const borderColor = fvg.type === "bullish" ? LEVEL_COLORS.fpfvg : LEVEL_COLORS.fpfvgBear;

  return {
    id: "fpfvg_ny_opening",
    label: "First Presented One-Minute Fair Value Gap",
    top: fvg.top,
    bottom: fvg.bottom,
    type: fvg.type,
    color: borderColor,
    borderColor,
    fill:
      fvg.type === "bullish"
        ? "rgba(45, 212, 191, 0.24)"
        : "rgba(251, 146, 60, 0.24)",
    formedAt: fvg.formedAt,
    startTime: fvg.startTime,
    showLabel: true,
    kind: "fvg",
    ce,
  };
}

/** Shaded daily FVG zones + FHDR band + first presented 1m FVG. */
export function buildDrawingZones(
  ctx: MarketContext,
  m1: Bar[] = [],
  dailyBars: Bar[] = []
): DrawingZone[] {
  const dailyZones: DrawingZone[] = ctx.htfPdArrays.recentDailyFvgs.map((fvg, i) => {
    const startTime = resolveFvgStartTime(fvg, m1, dailyBars);
    const ce = (fvg.top + fvg.bottom) / 2;
    const borderColor = fvg.type === "bullish" ? "#fb7185" : "#f472b6";

    return {
      id: `d_fvg_${fvg.type}_${i}`,
      label: `Daily ${fvg.type} Fair Value Gap · ${fvg.formedAt}`,
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
      kind: "fvg" as const,
      ce,
    } satisfies DrawingZone;
  });

  const extra: DrawingZone[] = [];
  const fhdr = computeFhdr(m1, ctx.fetchedAt);
  if (fhdr) extra.push(buildFhdrZone(fhdr));
  const fpZone = buildFirstPresentedFvgZone(ctx.structureFacts.firstPresentedFvg?.nyOpening);
  if (fpZone) extra.push(fpZone);

  return [...extra, ...dailyZones];
}

export function labelClusterThreshold(
  priceMin: number,
  priceMax: number,
  clusterPoints?: number
): number {
  if (clusterPoints != null && Number.isFinite(clusterPoints)) return clusterPoints;
  const span = Math.max(0, priceMax - priceMin);
  const adaptive = span * LABEL_CLUSTER_PRICE_RATIO;
  return Math.max(
    LABEL_CLUSTER_PRICE_MIN,
    Math.min(LABEL_CLUSTER_PRICE_MAX, adaptive || LABEL_CLUSTER_PRICE_DEFAULT)
  );
}

type LabelTagged =
  | { kind: "level"; ref: DrawingLevel; price: number }
  | { kind: "zone"; ref: DrawingZone; price: number };

const LABEL_ID_PRIORITY: Record<string, number> = {
  pdh: 100,
  pdl: 100,
  pdc: 96,
  pdeq: 92,
  cdeq: 92,
  ndog_top: 88,
  ndog_bot: 88,
  org_top: 90,
  org_bottom: 90,
  org_ce: 82,
  nwog_top: 86,
  nwog_bottom: 86,
};

export function labelPriorityForDraw(item: LabelTagged): number {
  if (item.kind === "level") {
    const id = item.ref.id;
    if (LABEL_ID_PRIORITY[id] != null) return LABEL_ID_PRIORITY[id];
    if (item.ref.group === "daily") return 90;
    if (item.ref.group === "org") return 88;
    if (item.ref.group === "gap") return 84;
    if (item.ref.group === "structure") return 76;
    if (item.ref.group === "session") return 52;
    return 40;
  }
  if (item.ref.kind === "fhdr") return 68;
  if (item.ref.id?.includes("fpfvg")) return 74;
  if (item.ref.kind === "fvg") return 58;
  return 48;
}

export function labelLaneToAlign(lane: number): LabelAlign {
  const n = Math.max(0, Math.floor(Number(lane) || 0));
  return (["top", "middle", "bottom"] as const)[n % 3];
}

/** Native TV horzLabelsAlign — slide nearby independent titles along the same ray. */
export function labelLaneToHorzAlign(lane: number): LabelHorzAlign {
  const n = Math.max(0, Math.floor(Number(lane) || 0));
  return (["left", "center", "right"] as const)[n % 3];
}

/** Seconds to nudge the ray start so clustered native titles separate along the same price. */
export function labelLaneToTimeShiftSec(lane: number, visibleSpanSec = 3600): number {
  const n = Math.max(0, Math.floor(Number(lane) || 0));
  if (n === 0) return 0;
  const span = Number.isFinite(visibleSpanSec) && visibleSpanSec > 0 ? visibleSpanSec : 3600;
  const step = Math.max(90, Math.floor(span / 16));
  return n * step;
}

/** Distinct native-TV layout slot — never a merged name. */
export function nativeLabelLayoutKey(ref: {
  labelAlign?: LabelAlign;
  labelHorzAlign?: LabelHorzAlign;
  labelTimeShiftSec?: number;
}): string {
  return `${ref.labelAlign || "top"}|${ref.labelHorzAlign || "left"}|${Math.max(0, Number(ref.labelTimeShiftSec) || 0)}`;
}

/** True when a title stuffed two level names onto one drawing (`A / B`). */
export function isSlashJoinedChartLabel(text: string): boolean {
  return /\s\/\s/.test(String(text || ""));
}

/** Same visible name in a price cluster (REH/REL duplicates, EQH/EQL aliases). */
export function canonicalChartLabelKey(label: string, id?: string): string {
  return formatChartLevelLabel(label, id).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Pixel Y for a label given line Y, align, and lane (for PNG / overlay). */
export function labelYOffsetPx(
  lineY: number,
  align: LabelAlign = "top",
  lane = 0
): number {
  const stack = Math.floor(Math.max(0, lane) / 3);
  const step = stack * LABEL_LANE_STEP_PX;
  if (align === "bottom") return lineY + LABEL_OFFSET_BOTTOM_PX + step;
  if (align === "middle") return lineY - LABEL_EST_HEIGHT_PX / 2;
  return lineY - LABEL_OFFSET_TOP_PX - step;
}

/** Horizontal nudge per lane so clustered labels don't stack on the same X. */
export function labelOffsetXPx(lane = 0): number {
  return 4 + Math.max(0, lane) * LABEL_LANE_X_STEP_PX;
}

function applyLabelLane(
  ref: DrawingLevel | DrawingZone,
  lane: number,
  visibleSpanSec?: number
): void {
  ref.labelLane = lane;
  ref.labelAlign = labelLaneToAlign(lane);
  ref.labelHorzAlign = labelLaneToHorzAlign(lane);
  ref.labelTimeShiftSec = labelLaneToTimeShiftSec(lane, visibleSpanSec);
}

function overlayNameFor(ref: DrawingLevel | DrawingZone): string {
  return formatChartOverlayLabel(ref.label, ref.id);
}

/** Visible native title for this drawing only — never a slash-joined cluster name. */
function nativeTitleFor(ref: DrawingLevel | DrawingZone): string {
  const extra = String(ref.displayLabel || "").trim();
  if (extra && !isSlashJoinedChartLabel(extra)) return extra;
  const short = overlayNameFor(ref).trim();
  if (short) return short;
  return String(ref.label || "").trim();
}

/** Map price to chart Y (high price = smaller Y). */
export function priceToLineY(
  price: number,
  priceMin: number,
  priceMax: number,
  plotHeightPx = 480,
  yOffsetPx = 0
): number {
  const range = priceMax - priceMin || 1;
  return yOffsetPx + plotHeightPx * (1 - (price - priceMin) / range);
}

export function labelBBox(
  lineY: number,
  align: LabelAlign = "top",
  lane = 0,
  heightPx = LABEL_EST_HEIGHT_PX
): { top: number; bottom: number } {
  const top = labelYOffsetPx(lineY, align, lane);
  return { top, bottom: top + heightPx };
}

function labelBboxesOverlap(
  a: { top: number; bottom: number },
  b: { top: number; bottom: number },
  minGap = LABEL_MIN_GAP_PX
): boolean {
  return a.bottom + minGap > b.top && b.bottom + minGap > a.top;
}

/** First lane (alternating above/below stacks) whose bbox does not overlap placed labels. */
export function findLabelLane(
  lineY: number,
  placed: Array<{ top: number; bottom: number }>,
  maxLanes = LABEL_MAX_LANES,
  startLane = 0
): number {
  for (let offset = 0; offset < maxLanes; offset++) {
    const lane = startLane + offset;
    if (lane >= maxLanes) break;
    const bbox = labelBBox(lineY, labelLaneToAlign(lane), lane);
    if (!placed.some((p) => labelBboxesOverlap(p, bbox))) return lane;
  }
  return maxLanes - 1;
}

/** Each drawing keeps its own native TV title. Collision layout re-runs on every refresh. */
export function assignStaggeredLabelAlign(
  levels: DrawingLevel[],
  zones: DrawingZone[] = [],
  opts?: {
    priceMin?: number;
    priceMax?: number;
    clusterPoints?: number;
    plotHeightPx?: number;
    yOffsetPx?: number;
    visibleSpanSec?: number;
  }
): void {
  for (const level of levels) {
    level.displayLabel = undefined;
    const title = nativeTitleFor(level);
    level.displayLabel = title || undefined;
    level.showLabel = Boolean(title);
    level.labelLane = undefined;
    level.labelAlign = undefined;
    level.labelHorzAlign = undefined;
    level.labelTimeShiftSec = undefined;
  }
  for (const zone of zones) {
    zone.displayLabel = undefined;
    const title = nativeTitleFor(zone);
    zone.displayLabel = title || undefined;
    zone.showLabel = Boolean(title);
    zone.labelLane = undefined;
    zone.labelAlign = undefined;
    zone.labelHorzAlign = undefined;
    zone.labelTimeShiftSec = undefined;
  }

  const items: LabelTagged[] = [];
  for (const level of levels) {
    if (!level.label || level.showLabel === false) continue;
    if (!Number.isFinite(level.price) || level.price <= 0) continue;
    items.push({ kind: "level", ref: level, price: level.price });
  }
  for (const zone of zones) {
    if (!zone.label || zone.showLabel === false) continue;
    items.push({ kind: "zone", ref: zone, price: Math.max(zone.top, zone.bottom) });
  }
  if (items.length === 0) return;

  items.sort((a, b) => b.price - a.price || labelPriorityForDraw(b) - labelPriorityForDraw(a));
  const prices = items.map((i) => i.price);
  const pMin = opts?.priceMin ?? Math.min(...prices);
  const pMax = opts?.priceMax ?? Math.max(...prices);
  const threshold = labelClusterThreshold(pMin, pMax, opts?.clusterPoints);
  const spanSec = opts?.visibleSpanSec;

  const clusters: LabelTagged[][] = [];
  for (const item of items) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last[last.length - 1]!.price - item.price) <= threshold) {
      last.push(item);
    } else {
      clusters.push([item]);
    }
  }

  for (const cluster of clusters) {
    cluster.sort((a, b) => labelPriorityForDraw(b) - labelPriorityForDraw(a) || b.price - a.price);
    cluster.forEach((item, i) => applyLabelLane(item.ref, i, spanSec));
  }
}

/** Alias — call after every native create/update, not only first paint. */
export const assignCollisionLayout = assignStaggeredLabelAlign;

export function formatLevelsForClipboard(
  levels: DrawingLevel[],
  zones: DrawingZone[] = []
): string {
  const lines = levels.map(
    (l) => `${formatChartLevelLabel(l.label, l.id)}: ${l.price.toFixed(2)}`
  );
  for (const z of zones) {
    lines.push(
      `${formatChartLevelLabel(z.label, z.id)}: ${Math.min(z.top, z.bottom).toFixed(2)} – ${Math.max(z.top, z.bottom).toFixed(2)}`
    );
  }
  return lines.join("\n");
}

export function formatLevelsForPineInputs(levels: DrawingLevel[]): string {
  return JSON.stringify(
    levels.map((l) => ({
      label: formatChartLevelLabel(l.label, l.id),
      price: Number(l.price.toFixed(2)),
    })),
    null,
    2
  );
}
