/**
 * PIT-safe structure objects for the incremental market engine.
 * Status/timestamps only — detectors stay in structure.ts / research EQH-EQL.
 */
import type { FvgZone, MarketContext } from "./types";
import type { EqhEqlLiquidity, LiquidityArea } from "./research/eqh-eql-liquidity";

export type StructureObjectStatus =
  | "developing"
  | "confirmed"
  | "active"
  | "touched"
  | "swept"
  | "invalidated"
  | "filled";

export type StructureEventKind =
  | "swing_confirmed"
  | "mss"
  | "bos"
  | "fvg_formed"
  | "fvg_filled"
  | "fvg_inverted"
  | "liquidity_formed"
  | "liquidity_swept"
  | "liquidity_invalidated"
  | "session_change"
  | "bias_change"
  | "level_interaction"
  | "bar_close"
  | "user_request";

export type StructureEvent = {
  kind: StructureEventKind;
  at: number;
  label: string;
  price?: number;
  id?: string;
};

export type TimedStructureObject = {
  id: string;
  status: StructureObjectStatus;
  createdAt: number;
  confirmedAt?: number;
  lastUpdateAt: number;
  sourceCandleTimes: number[];
};

export type SwingState = TimedStructureObject & {
  type: "high" | "low";
  price: number;
  barIndex: number;
  confirmationDelayBars: number;
};

export type MssState = TimedStructureObject & {
  direction: "bullish" | "bearish";
  level: number;
  description: string;
};

export type FvgState = TimedStructureObject & {
  direction: "bullish" | "bearish";
  top: number;
  bottom: number;
  timeframe?: string;
  inverted?: boolean;
};

export type LiquidityPoolState = TimedStructureObject & {
  side: "BUY_SIDE" | "SELL_SIDE";
  kind: "eqh" | "eql" | "reh" | "rel";
  priceLow: number;
  priceHigh: number;
  representativeLevel: number;
  sweptAt?: number;
};

export type SessionRangeState = {
  id: string;
  label: string;
  high: number;
  low: number;
  lastUpdateAt: number;
};

export type DealingRangeState = {
  high: number;
  low: number;
  equilibrium: number;
  lastUpdateAt: number;
  source: "session" | "fhdr" | "unknown";
};

export type PremiumDiscountState = {
  vsCurrentDayRange: string;
  vsPreviousDayRange: string;
  lastUpdateAt: number;
};

export type StructureStateBundle = {
  asOf: number;
  lastUpdateAt: number;
  confirmedSwings: SwingState[];
  developingSwings: SwingState[];
  mss: MssState | null;
  bos: MssState | null;
  fvgs: FvgState[];
  liquidity: LiquidityPoolState[];
  session: SessionRangeState;
  dealingRange: DealingRangeState;
  premiumDiscount: PremiumDiscountState;
  trackedPrices: number[];
};

function unixSec(d: Date | number | string): number {
  if (typeof d === "number") return d > 1e12 ? Math.floor(d / 1000) : d;
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  return Math.floor(t / 1000);
}

function fvgKey(z: FvgZone): string {
  return `fvg_${z.type}_${z.top.toFixed(2)}_${z.bottom.toFixed(2)}_${z.startTime ?? 0}`;
}

function areaSide(a: LiquidityArea): "BUY_SIDE" | "SELL_SIDE" {
  return a.type === "SELL_SIDE" ? "SELL_SIDE" : "BUY_SIDE";
}

/** Snapshot structure objects from canonical context + research liquidity. */
export function snapshotStructureState(
  ctx: MarketContext,
  eqh: EqhEqlLiquidity | null,
  asOf: Date
): StructureStateBundle {
  const at = unixSec(asOf);
  const mss = ctx.structureFacts.mss;
  const mssState: MssState | null = mss
    ? {
        id: `mss_${mss.direction}_${mss.level.toFixed(2)}_${mss.atTime}`,
        status: "confirmed",
        createdAt: mss.atTime,
        confirmedAt: mss.atTime,
        lastUpdateAt: at,
        sourceCandleTimes: [mss.atTime],
        direction: mss.direction,
        level: mss.level,
        description: mss.description,
      }
    : null;

  const fvgs: FvgState[] = [
    ...ctx.structureFacts.m1UnfilledFvgs.map((z) => ({
      id: fvgKey(z),
      status: (z.inverted ? "invalidated" : "active") as StructureObjectStatus,
      createdAt: z.startTime ?? at,
      confirmedAt: z.startTime,
      lastUpdateAt: at,
      sourceCandleTimes: z.startTime != null ? [z.startTime] : [],
      direction: z.type,
      top: z.top,
      bottom: z.bottom,
      timeframe: z.timeframe,
      inverted: z.inverted,
    })),
    ...ctx.structureFacts.m1InvertedFvgs.map((z) => ({
      id: fvgKey(z) + "_inv",
      status: "invalidated" as StructureObjectStatus,
      createdAt: z.startTime ?? at,
      confirmedAt: z.startTime,
      lastUpdateAt: at,
      sourceCandleTimes: z.startTime != null ? [z.startTime] : [],
      direction: z.type,
      top: z.top,
      bottom: z.bottom,
      timeframe: z.timeframe,
      inverted: true,
    })),
  ];

  const liquidity: LiquidityPoolState[] = [];
  if (eqh?.areas.length) {
    for (const a of eqh.areas) {
      const status: StructureObjectStatus =
        a.status === "swept" || a.status === "closed_through"
          ? "swept"
          : a.status === "invalidated"
            ? "invalidated"
            : a.status === "touched"
              ? "touched"
              : "active";
      liquidity.push({
        id: a.id,
        status,
        createdAt: a.formationTime,
        confirmedAt: a.confirmationTime,
        lastUpdateAt: at,
        sourceCandleTimes: a.contributingSwings.map((s) => s.barTime),
        side: areaSide(a),
        kind: a.type === "BUY_SIDE" ? "eqh" : "eql",
        priceLow: a.priceLow,
        priceHigh: a.priceHigh,
        representativeLevel: a.representativeLevel,
        sweptAt: a.sweptAt,
      });
    }
  } else {
    for (const p of ctx.structureFacts.relativeEqualPools) {
      liquidity.push({
        id: `${p.type}_${p.price.toFixed(2)}_${p.startTime}`,
        status: "active",
        createdAt: p.startTime,
        confirmedAt: p.endTime ?? p.startTime,
        lastUpdateAt: at,
        sourceCandleTimes: [p.startTime, p.endTime ?? p.startTime],
        side: p.type === "reh" ? "BUY_SIDE" : "SELL_SIDE",
        kind: p.type,
        priceLow: p.price,
        priceHigh: p.price,
        representativeLevel: p.price,
      });
    }
  }

  const developingSwings: SwingState[] = (eqh?.pendingSwings ?? []).map((p) => ({
    id: `dev_${p.type}_${p.barIndex}_${p.price.toFixed(2)}`,
    status: "developing",
    createdAt: p.barTime,
    lastUpdateAt: at,
    sourceCandleTimes: [p.barTime],
    type: p.type,
    price: p.price,
    barIndex: p.barIndex,
    confirmationDelayBars: Math.max(0, p.confirmAtBarIndex - p.barIndex),
  }));

  const confirmedSwings: SwingState[] = [];
  for (const a of eqh?.pools ?? []) {
    for (const s of a.swings) {
      confirmedSwings.push({
        id: s.id,
        status: "confirmed",
        createdAt: s.barTime,
        confirmedAt: s.confirmationTime,
        lastUpdateAt: at,
        sourceCandleTimes: [s.barTime, s.confirmationTime],
        type: s.type,
        price: s.price,
        barIndex: s.barIndex,
        confirmationDelayBars: s.confirmationDelayBars,
      });
    }
  }

  const sessHigh =
    ctx.activeSession.id === "ny_am" || ctx.activeSession.id === "ny_pm" || ctx.activeSession.id === "ny_pre"
      ? ctx.sessions.nyRthHigh
      : ctx.activeSession.id === "london"
        ? ctx.sessions.londonHigh
        : ctx.sessions.asiaHigh;
  const sessLow =
    ctx.activeSession.id === "ny_am" || ctx.activeSession.id === "ny_pm" || ctx.activeSession.id === "ny_pre"
      ? ctx.sessions.nyRthLow
      : ctx.activeSession.id === "london"
        ? ctx.sessions.londonLow
        : ctx.sessions.asiaLow;

  const tracked = new Set<number>();
  const addPx = (n: number | undefined) => {
    if (n != null && Number.isFinite(n)) tracked.add(Math.round(n * 4) / 4);
  };
  addPx(mss?.level);
  for (const z of ctx.structureFacts.m1UnfilledFvgs) {
    addPx(z.top);
    addPx(z.bottom);
  }
  for (const p of ctx.structureFacts.relativeEqualPools) addPx(p.price);
  for (const a of liquidity) {
    addPx(a.priceLow);
    addPx(a.priceHigh);
    addPx(a.representativeLevel);
  }
  for (const lv of ctx.htfPdArrays.levels) addPx(lv.price);
  addPx(ctx.sessions.asiaHigh);
  addPx(ctx.sessions.asiaLow);
  addPx(ctx.sessions.londonHigh);
  addPx(ctx.sessions.londonLow);
  addPx(ctx.sessions.nyPreHigh);
  addPx(ctx.sessions.nyPreLow);
  addPx(ctx.sessions.nyRthHigh);
  addPx(ctx.sessions.nyRthLow);
  if (ctx.org) {
    addPx(ctx.org.top);
    addPx(ctx.org.bottom);
    addPx(ctx.org.ce);
  }

  return {
    asOf: at,
    lastUpdateAt: at,
    confirmedSwings,
    developingSwings,
    mss: mssState,
    bos: null,
    fvgs,
    liquidity,
    session: {
      id: ctx.activeSession.id,
      label: ctx.activeSession.label,
      high: sessHigh,
      low: sessLow,
      lastUpdateAt: at,
    },
    dealingRange: {
      high: ctx.daily.currentDayHigh,
      low: ctx.daily.currentDayLow,
      equilibrium: ctx.daily.equilibrium,
      lastUpdateAt: at,
      source: "session",
    },
    premiumDiscount: {
      vsCurrentDayRange: ctx.premiumDiscount.vsCurrentDayRange,
      vsPreviousDayRange: ctx.premiumDiscount.vsPreviousDayRange,
      lastUpdateAt: at,
    },
    trackedPrices: [...tracked],
  };
}

export function diffStructureEvents(
  prev: StructureStateBundle | null,
  next: StructureStateBundle
): StructureEvent[] {
  if (!prev) {
    return [{ kind: "bar_close", at: next.lastUpdateAt, label: "initial load" }];
  }
  const events: StructureEvent[] = [];
  const at = next.lastUpdateAt;

  if (prev.session.id !== next.session.id) {
    events.push({ kind: "session_change", at, label: `${prev.session.id}→${next.session.id}` });
  }

  const prevMss = prev.mss ? `${prev.mss.direction}:${prev.mss.level.toFixed(2)}:${prev.mss.createdAt}` : "";
  const nextMss = next.mss ? `${next.mss.direction}:${next.mss.level.toFixed(2)}:${next.mss.createdAt}` : "";
  if (prevMss !== nextMss && next.mss) {
    events.push({
      kind: "mss",
      at,
      label: next.mss.description,
      price: next.mss.level,
      id: next.mss.id,
    });
  }

  const prevFvg = new Set(prev.fvgs.map((f) => f.id));
  for (const f of next.fvgs) {
    if (!prevFvg.has(f.id) && f.status === "active") {
      events.push({ kind: "fvg_formed", at, label: `${f.direction} FVG`, price: (f.top + f.bottom) / 2, id: f.id });
    }
    const before = prev.fvgs.find((x) => x.id === f.id);
    if (before && before.status === "active" && f.status === "invalidated") {
      events.push({ kind: "fvg_inverted", at, label: `${f.direction} IFVG`, id: f.id });
    }
  }
  for (const f of prev.fvgs) {
    if (f.status === "active" && !next.fvgs.some((x) => x.id === f.id)) {
      events.push({ kind: "fvg_filled", at, label: `${f.direction} FVG filled`, id: f.id });
    }
  }

  const prevLiq = new Map(prev.liquidity.map((l) => [l.id, l]));
  for (const l of next.liquidity) {
    const before = prevLiq.get(l.id);
    if (!before) {
      events.push({
        kind: "liquidity_formed",
        at,
        label: `${l.side} ${l.kind}`,
        price: l.representativeLevel,
        id: l.id,
      });
    } else if (before.status !== "swept" && l.status === "swept") {
      events.push({
        kind: "liquidity_swept",
        at,
        label: `${l.side} swept`,
        price: l.representativeLevel,
        id: l.id,
      });
    } else if (before.status !== "invalidated" && l.status === "invalidated") {
      events.push({
        kind: "liquidity_invalidated",
        at,
        label: `${l.side} invalidated`,
        price: l.representativeLevel,
        id: l.id,
      });
    }
  }

  const prevSwing = new Set(prev.confirmedSwings.map((s) => s.id));
  for (const s of next.confirmedSwings) {
    if (!prevSwing.has(s.id)) {
      events.push({
        kind: "swing_confirmed",
        at,
        label: `swing ${s.type} ${s.price.toFixed(2)}`,
        price: s.price,
        id: s.id,
      });
    }
  }

  return events;
}

export function lastBarAffectsTrackedPrices(
  prevBar: { high: number; low: number; close: number },
  nextBar: { high: number; low: number; close: number },
  tracked: number[]
): boolean {
  if (nextBar.high > prevBar.high + 1e-9 || nextBar.low < prevBar.low - 1e-9) {
    const wickLo = Math.min(prevBar.low, nextBar.low);
    const wickHi = Math.max(prevBar.high, nextBar.high);
    for (const p of tracked) {
      if (p + 1e-9 >= wickLo && p - 1e-9 <= wickHi) return true;
    }
  }
  if (Math.abs(nextBar.close - prevBar.close) < 1e-9) return false;
  const lo = Math.min(prevBar.close, nextBar.close);
  const hi = Math.max(prevBar.close, nextBar.close);
  for (const p of tracked) {
    if (p > lo + 1e-9 && p <= hi + 1e-9) return true;
    if (p >= lo - 1e-9 && p < hi - 1e-9) return true;
  }
  return false;
}
