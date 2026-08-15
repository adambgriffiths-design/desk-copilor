/**
 * ICT relative equal highs / lows as liquidity areas — research/analysis only.
 *
 * Production trading (observation-engine detectRehRel, decision/entry gates,
 * structure.ts detectRelativeEqualPools) is intentionally unchanged.
 *
 * Liquidity-first: REH/EQL are evidence for a pool, not automatically
 * liquidity because two prices are close. Relative equality is one
 * supporting component of "same visible area."
 *
 * Point-in-time: a swing at bar i is confirmed only after bar i+wing has
 * closed. Historical state at T never uses bars after T.
 *
 * Overlay / Levels keep unswept class-A areas. Distance-to-last is not
 * ICT invalidation; sweep and close-through are.
 */
import type { Bar } from "../types";
import { formatEst } from "../market-data";
import type { RelativeEqualPool } from "../structure";
import {
  applyLiquidityContrasts,
  buildImportanceContext,
  classifyEqhEqlPool,
  evaluateSwingPair,
  excursionBetween,
  formatFactorBreakdown,
  importanceRank,
  oppositeTypeInShelf,
  type EqhEqlClassification,
  type PairSwing,
  type EqhEqlImportance,
  type EqhEqlImportanceFactors,
  type EqhEqlLifecycle,
  type EqhEqlLiquidityType,
  type EqhEqlSweepReaction,
  type EqhEqlTimeframeContext,
  type LiquidityAreaType,
  type RejectedEqhEql,
  type VisualObviousness,
} from "./eqh-eql-importance";

export {
  classifyEqhEqlPool,
  buildImportanceContext,
  detectResearchStructureBreaks,
  evaluateSwingPair,
  formatFactorBreakdown,
  mapEqhEqlLifecycle,
  importanceRank,
  oppositeTypeInShelf,
  sameVisibleShelf,
  meaningfulProminenceFloor,
  candidateWindowPts,
  STRUCTURAL_TEST_ORDER,
} from "./eqh-eql-importance";

export type {
  EqhEqlClassification,
  EqhEqlImportance,
  EqhEqlImportanceFactors,
  EqhEqlLifecycle,
  EqhEqlLiquidityType,
  EqhEqlSweepReaction,
  EqhEqlTimeframeContext,
  LiquidityAreaType,
  RejectedEqhEql,
  VisualObviousness,
} from "./eqh-eql-importance";

export const NQ_TICK_SIZE = 0.25;
export const MNQ_TICK_SIZE = 0.25;

export type EqhEqlStatus =
  | "active"
  | "touched"
  | "swept"
  | "closed_through"
  | "invalidated";

export type EqhEqlKind = "eqh" | "eql";

/**
 * Layer — what kind of liquidity this is. Never mix these.
 * EXTERNAL = named session / PD (Asia High, PDH, …) — not produced here.
 * RELATIVE = meaningful EQH/EQL areas from this detector.
 * INTERNAL = minor clusters preserved for Karen, not major overlay lines.
 * NOISE = insignificant / no structure (rejected).
 */
export type LiquidityLayer = "EXTERNAL" | "RELATIVE" | "INTERNAL" | "NOISE";

/**
 * Display rank inside the RELATIVE layer.
 * PRIMARY / SECONDARY may be drawn. INTERNAL is hidden from the main chart.
 * REJECTED is not presented as liquidity (see `rejected[]`).
 * Do not force every class-A pair into PRIMARY.
 */
export type LiquidityRole = "PRIMARY" | "SECONDARY" | "INTERNAL" | "REJECTED";

export type EqhEqlSwing = {
  id: string;
  type: "high" | "low";
  price: number;
  barIndex: number;
  barTime: number;
  confirmationTime: number;
  confirmationDelayBars: number;
  prominence: number;
  prominenceTicks: number;
};

export type PendingSwing = {
  type: "high" | "low";
  price: number;
  barIndex: number;
  barTime: number;
  confirmAtBarIndex: number;
};

export type EqhEqlPool = {
  id: string;
  kind: EqhEqlKind;
  /** Resting liquidity price — max high (EQH) or min low (EQL). Frozen after sweep. */
  level: number;
  range: { low: number; high: number };
  tickSize: number;
  priceDifference: number;
  tickDifference: number;
  tolerance: number;
  toleranceTicks: number;
  swings: EqhEqlSwing[];
  formationTime: number;
  confirmationTime: number;
  createdAt: number;
  formedAtLabel: string;
  confirmationLabel: string;
  status: EqhEqlStatus;
  touchedAt?: number;
  sweptAt?: number;
  sweepPrice?: number;
  closedThroughAt?: number;
  invalidatedAt?: number;
  atrAtFormation: number;
  /** Human-readable importance explanation (HIGH/MEDIUM/LOW + why it matters). */
  why: string;
  /** Detector mechanics (ticks, ATR band, confirmation delay) — not the rank reason. */
  whyDetection: string;
  liquidityType: EqhEqlLiquidityType;
  importance: EqhEqlImportance;
  /** Rank token from the label (90/60/30) — not a weighted quality formula. */
  score: number;
  confidence: number;
  lifecycle: EqhEqlLifecycle;
  timeframeContext: EqhEqlTimeframeContext;
  sessionContext: string;
  sessionLabel: string;
  distanceFromPrice: number;
  distanceAbs: number;
  factors: EqhEqlImportanceFactors;
  sweepReaction: EqhEqlSweepReaction | null;
  sweepRange?: { low: number; high: number };
  visualClass: VisualObviousness;
  structuralContext: string;
  whyNotNearby: string;
  structuralPriority: number;
  liquidityArea: LiquidityArea;
  /** RELATIVE for this detector. EXTERNAL is session/PD elsewhere. */
  liquidityLayer: LiquidityLayer;
  /** Overlay rank. Only PRIMARY/SECONDARY are normally drawn. */
  liquidityRole: LiquidityRole;
  /** Evidence for PRIMARY — empty when not PRIMARY. */
  whyImportant: string;
};

export type EqhEqlConfig = {
  symbol?: string;
  tickSize?: number;
  wing?: number;
  lookback?: number;
  minTicks?: number;
  maxTicks?: number;
  atrPeriod?: number;
  atrFraction?: number;
  prominenceMinTicks?: number;
  prominenceAtrFrac?: number;
  valleyMinTicks?: number;
  /**
   * Minimum bars between two swing points of the same type.
   * Nearby 5-bar fractals on ordinary candle wicks are not distinct swings.
   */
  minSwingGapBars?: number;
  /** Optional abandon threshold vs last close. Default: off (Infinity). */
  invalidationAtrMult?: number;
  maxPoolsPerSide?: number;
  /** Deterministic tests — skip ATR from bars. */
  atrOverride?: number;
  /** Inclusive last bar index. Default: last bar. */
  asOfIndex?: number;
  currentPrice?: number;
  maxRejected?: number;
  /**
   * Collapse same-side class-A pools that a trader would mark as one
   * recognizable area (MNQU 4-REL cluster). Default on. Not an equality
   * tolerance change — pairing is unchanged. Tests may disable to snapshot
   * the over-detect.
   */
  recognizableAreaCollapse?: boolean;
};

export type LiquidityArea = {
  id: string;
  type: LiquidityAreaType;
  priceLow: number;
  priceHigh: number;
  representativeLevel: number;
  contributingSwings: EqhEqlSwing[];
  formationTime: number;
  confirmationTime: number;
  status: EqhEqlStatus;
  structuralContext: string;
  visualClass: VisualObviousness;
  confidence: EqhEqlImportance;
  whyMeaningful: string;
  whyNotNearby: string;
  liquidityLayer: LiquidityLayer;
  liquidityRole: LiquidityRole;
  whyImportant: string;
  sweptAt?: number;
  sweepPrice?: number;
  sweepRange?: { low: number; high: number };
};

export type EqhEqlLiquidity = {
  status: "known" | "unknown";
  tickSize: number;
  tolerance: number;
  toleranceTicks: number;
  atr: number;
  wing: number;
  confirmationDelayBars: number;
  pendingSwings: PendingSwing[];
  minSwingGapBars: number;
  pools: EqhEqlPool[];
  eqh: EqhEqlPool[];
  eql: EqhEqlPool[];
  areas: LiquidityArea[];
  /** Hidden from the main chart; preserved for Karen. */
  internal: EqhEqlPool[];
  /** PRIMARY + SECONDARY only — what the overlay may draw. */
  displayed: EqhEqlPool[];
  /** Confirmed swings at T (structure kept even when not displayed). */
  rawSwings: { highs: EqhEqlSwing[]; lows: EqhEqlSwing[] };
  rejected: RejectedEqhEql[];
};

const DEFAULT_WING = 2;
const DEFAULT_LOOKBACK = 180;
const DEFAULT_ATR_PERIOD = 14;
const DEFAULT_ATR_FRACTION = 0.12;
const DEFAULT_MIN_TICKS = 2;
const DEFAULT_MAX_TICKS = 8;
const DEFAULT_PROM_MIN_TICKS = 6;
const DEFAULT_PROM_ATR_FRAC = 0.2;
/** Distinct swing points — not two fractals 3–4 minutes apart on the same dip. */
const DEFAULT_MIN_SWING_GAP = 8;
/** Off by default: distance-to-last is not ICT invalidation (sweep / close-through is). */
const DEFAULT_INVALIDATION_ATR = Number.POSITIVE_INFINITY;
const DEFAULT_MAX_PER_SIDE = 8;

export function eqhEqlInstrumentTickSize(symbol?: string): number {
  const s = String(symbol || "").toUpperCase();
  if (/(^|[^A-Z])(MNQ|NQ)([^A-Z]|$)/.test(s)) return NQ_TICK_SIZE;
  if (/(^|[^A-Z])(MES|ES)([^A-Z]|$)/.test(s)) return 0.25;
  return NQ_TICK_SIZE;
}

export function roundToTick(price: number, tickSize: number): number {
  if (!Number.isFinite(price) || tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}

export function ticksBetween(a: number, b: number, tickSize: number): number {
  return Math.round(Math.abs(a - b) / tickSize);
}

/**
 * Relative-equality band: clamp(ATR × fraction) onto [minTicks, maxTicks] × tick,
 * then snap up to a whole tick. Quiet tape stays tight; volatile tape widens
 * only up to 8 ticks (2.00 on NQ/MNQ) — not the old 4-point / 16-tick cap.
 */
export function eqhEqlTolerance(input: {
  atr: number;
  tickSize: number;
  minTicks?: number;
  maxTicks?: number;
  atrFraction?: number;
}): number {
  const tick = input.tickSize;
  const minTicks = input.minTicks ?? DEFAULT_MIN_TICKS;
  const maxTicks = input.maxTicks ?? DEFAULT_MAX_TICKS;
  const frac = input.atrFraction ?? DEFAULT_ATR_FRACTION;
  const raw = Math.max(0, input.atr) * frac;
  const lo = minTicks * tick;
  const hi = maxTicks * tick;
  const clamped = Math.min(hi, Math.max(lo, raw));
  return Math.ceil(clamped / tick - 1e-9) * tick;
}

function unixSec(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function trueRange(bars: Bar[], i: number): number {
  const b = bars[i]!;
  const range = b.high - b.low;
  if (i === 0) return range;
  const prev = bars[i - 1]!.close;
  return Math.max(range, Math.abs(b.high - prev), Math.abs(b.low - prev));
}

export function atrAt(bars: Bar[], endIndex: number, period = DEFAULT_ATR_PERIOD): number {
  if (endIndex < 0 || !bars.length) return 0;
  const end = Math.min(endIndex, bars.length - 1);
  const start = Math.max(0, end - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    sum += trueRange(bars, i);
    n++;
  }
  return n > 0 ? sum / n : 0;
}

function prominenceOf(
  bars: Bar[],
  i: number,
  wing: number,
  type: "high" | "low"
): number {
  const bar = bars[i]!;
  let opposite = type === "high" ? bar.high : bar.low;
  for (let j = i - wing; j <= i + wing; j++) {
    if (j === i || j < 0 || j >= bars.length) continue;
    if (type === "high") opposite = Math.min(opposite, bars[j]!.low);
    else opposite = Math.max(opposite, bars[j]!.high);
  }
  return type === "high" ? bar.high - opposite : opposite - bar.low;
}

type InternalSwing = EqhEqlSwing & { confirmationIndex: number };

function findConfirmedSwings(
  bars: Bar[],
  asOfIndex: number,
  wing: number,
  tickSize: number,
  minProminence: number
): { confirmed: InternalSwing[]; pending: PendingSwing[] } {
  const confirmed: InternalSwing[] = [];
  const pending: PendingSwing[] = [];
  if (asOfIndex < wing) return { confirmed, pending };

  for (let i = wing; i <= asOfIndex; i++) {
    const bar = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= wing; j++) {
      const left = bars[i - j];
      if (!left || left.high >= bar.high) isHigh = false;
      if (!left || left.low <= bar.low) isLow = false;
    }
    const rightComplete = i + wing <= asOfIndex;
    if (!rightComplete) {
      for (let j = 1; j <= asOfIndex - i; j++) {
        const right = bars[i + j];
        if (!right) continue;
        if (right.high >= bar.high) isHigh = false;
        if (right.low <= bar.low) isLow = false;
      }
      if (isHigh) {
        pending.push({
          type: "high",
          price: roundToTick(bar.high, tickSize),
          barIndex: i,
          barTime: unixSec(bar.time),
          confirmAtBarIndex: i + wing,
        });
      }
      if (isLow) {
        pending.push({
          type: "low",
          price: roundToTick(bar.low, tickSize),
          barIndex: i,
          barTime: unixSec(bar.time),
          confirmAtBarIndex: i + wing,
        });
      }
      continue;
    }

    for (let j = 1; j <= wing; j++) {
      const right = bars[i + j]!;
      if (right.high >= bar.high) isHigh = false;
      if (right.low <= bar.low) isLow = false;
    }

    const confirmBar = bars[i + wing]!;
    const confirmationTime = unixSec(confirmBar.time);
    const confirmationDelayBars = wing;

    if (isHigh) {
      const prom = prominenceOf(bars, i, wing, "high");
      if (prom + 1e-9 >= minProminence) {
        const price = roundToTick(bar.high, tickSize);
        confirmed.push({
          id: `sh_${i}_${price.toFixed(2)}`,
          type: "high",
          price,
          barIndex: i,
          barTime: unixSec(bar.time),
          confirmationTime,
          confirmationDelayBars,
          confirmationIndex: i + wing,
          prominence: roundToTick(prom, tickSize),
          prominenceTicks: ticksBetween(prom, 0, tickSize) || Math.round(prom / tickSize),
        });
      }
    }
    if (isLow) {
      const prom = prominenceOf(bars, i, wing, "low");
      if (prom + 1e-9 >= minProminence) {
        const price = roundToTick(bar.low, tickSize);
        confirmed.push({
          id: `sl_${i}_${price.toFixed(2)}`,
          type: "low",
          price,
          barIndex: i,
          barTime: unixSec(bar.time),
          confirmationTime,
          confirmationDelayBars,
          confirmationIndex: i + wing,
          prominence: roundToTick(prom, tickSize),
          prominenceTicks: ticksBetween(prom, 0, tickSize) || Math.round(prom / tickSize),
        });
      }
    }
  }

  return { confirmed, pending };
}

/**
 * Collapse fractal candidates that are the same turning point.
 * Keep the most extreme wick — that wick is the swing; neighbors are ordinary bars.
 */
export function mergeNearbySwings<T extends { barIndex: number; price: number; type: "high" | "low" }>(
  swings: T[],
  minGap: number
): T[] {
  if (swings.length < 2) return swings;
  const sorted = [...swings].sort((a, b) => a.barIndex - b.barIndex || a.price - b.price);
  const kept: T[] = [];
  for (const s of sorted) {
    const prev = kept.at(-1);
    if (!prev || prev.type !== s.type || s.barIndex - prev.barIndex >= minGap) {
      kept.push(s);
      continue;
    }
    const prevMoreExtreme =
      s.type === "high" ? prev.price + 1e-9 >= s.price : prev.price - 1e-9 <= s.price;
    if (!prevMoreExtreme) kept[kept.length - 1] = s;
  }
  return kept;
}

function toRejected(
  kind: EqhEqlKind,
  a: InternalSwing,
  b: InternalSwing,
  ev: ReturnType<typeof evaluateSwingPair>
): RejectedEqhEql {
  return {
    kind,
    visualClass: ev.visualClass,
    prices: [a.price, b.price],
    swings: [a, b].map(({ confirmationIndex: _c, ...rest }) => rest),
    why: ev.why,
    failedTests: ev.failedTests,
  };
}

/**
 * Cluster swings that pass the structural gate into one area.
 * Similar-looking pairs that fail the gate are rejected with why.
 * Tick tolerance is not the pairing switch.
 */
function clusterLiquiditySwings(
  kind: EqhEqlKind,
  swings: InternalSwing[],
  bars: Bar[],
  atr: number,
  tickSize: number,
  minGap: number,
  maxRejected: number,
  opposite: InternalSwing[] = [],
  mixedSidePad = tickSize
): { groups: InternalSwing[][]; rejected: RejectedEqhEql[] } {
  const expectType = kind === "eqh" ? "high" : "low";
  swings = swings.filter((s) => s.type === expectType);
  if (swings.length < 2) return { groups: [], rejected: [] };
  const parent = swings.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number): void {
    parent[find(a)] = find(b);
  }

  const rejected: RejectedEqhEql[] = [];
  const seenReject = new Set<string>();
  for (let i = 0; i < swings.length; i++) {
    for (let j = i + 1; j < swings.length; j++) {
      const ev = evaluateSwingPair({
        kind,
        left: swings[i]!,
        right: swings[j]!,
        bars,
        atr,
        tickSize,
        minGap,
        allSame: swings,
        opposite,
        mixedSidePad,
      });
      if (ev.accept) {
        union(i, j);
        continue;
      }
      if (ev.reject && rejected.length < maxRejected * 4) {
        const key = `${swings[i]!.barIndex}:${swings[j]!.barIndex}`;
        if (!seenReject.has(key)) {
          seenReject.add(key);
          rejected.push(toRejected(kind, swings[i]!, swings[j]!, ev));
        }
      }
    }
  }

  const groups = new Map<number, InternalSwing[]>();
  for (let i = 0; i < swings.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(swings[i]!);
  }
  return {
    groups: [...groups.values()].filter((g) => g.length >= 2),
    rejected,
  };
}

function primingNote(kind: EqhEqlKind, swings: EqhEqlSwing[]): string {
  const ordered = [...swings].sort((a, b) => a.barTime - b.barTime);
  if (ordered.length < 2) return "";
  const left = ordered[0]!;
  const right = ordered[ordered.length - 1]!;
  if (kind === "eqh" && left.price > right.price + 1e-9) {
    return " Left high slightly above right (ICT priming).";
  }
  if (kind === "eql" && left.price < right.price - 1e-9) {
    return " Left low slightly below right (ICT failure swing).";
  }
  if (Math.abs(left.price - right.price) < 1e-9) {
    return " Exact equals after tick snap.";
  }
  return "";
}

type EqhEqlPoolDraft = Omit<
  EqhEqlPool,
  | "why"
  | "whyDetection"
  | "liquidityType"
  | "importance"
  | "score"
  | "confidence"
  | "lifecycle"
  | "timeframeContext"
  | "sessionContext"
  | "sessionLabel"
  | "distanceFromPrice"
  | "distanceAbs"
  | "factors"
  | "sweepReaction"
  | "visualClass"
  | "structuralContext"
  | "whyNotNearby"
  | "structuralPriority"
  | "liquidityArea"
  | "liquidityLayer"
  | "liquidityRole"
  | "whyImportant"
>;

function buildWhyDetection(pool: EqhEqlPoolDraft): string {
  const prices = pool.swings.map((s) => s.price.toFixed(2)).join(", ");
  const side = pool.kind === "eqh" ? "Buy-side liquidity above" : "Sell-side liquidity below";
  const delay = pool.swings[0]?.confirmationDelayBars ?? DEFAULT_WING;
  return (
    `${pool.swings.length} confirmed swing ${pool.kind === "eqh" ? "highs" : "lows"} ` +
    `at ${prices} forming one ${side.split(" ")[0]!.toLowerCase()} area ` +
    `${pool.range.low.toFixed(2)}–${pool.range.high.toFixed(2)}. ` +
    `Relative equality is supporting (${pool.tickDifference} tick / ${pool.priceDifference.toFixed(2)} pt shelf vs ATR ${pool.atrAtFormation.toFixed(2)}); ` +
    `not accepted because the prints were close. ` +
    `Each swing confirmed ${delay} bar(s) after the pivot.` +
    primingNote(pool.kind, pool.swings) +
    ` Representative level ${pool.level.toFixed(2)}.`
  );
}

function applyLifecycle(
  kind: EqhEqlKind,
  level: number,
  range: { low: number; high: number },
  bars: Bar[],
  fromIndex: number,
  asOfIndex: number,
  atr: number,
  invalidationAtrMult: number,
  tickSize: number
): Pick<
  EqhEqlPool,
  | "status"
  | "touchedAt"
  | "sweptAt"
  | "sweepPrice"
  | "sweepRange"
  | "closedThroughAt"
  | "invalidatedAt"
> {
  let status: EqhEqlStatus = "active";
  let touchedAt: number | undefined;
  let sweptAt: number | undefined;
  let sweepPrice: number | undefined;
  let sweepRange: { low: number; high: number } | undefined;
  let closedThroughAt: number | undefined;
  let invalidatedAt: number | undefined;
  const start = Math.min(fromIndex + 1, asOfIndex + 1);

  for (let i = start; i <= asOfIndex; i++) {
    const bar = bars[i]!;
    const t = unixSec(bar.time);
    if (kind === "eqh") {
      const taggedZone = bar.high + 1e-9 >= range.low;
      const through = bar.high > level + 1e-9;
      const closeThrough = bar.close > level + 1e-9;
      if (taggedZone && !through && (status === "active" || status === "touched")) {
        status = "touched";
        if (touchedAt == null) touchedAt = t;
      }
      if (through && status !== "closed_through") {
        status = "swept";
        if (sweptAt == null) {
          sweptAt = t;
          sweepPrice = roundToTick(bar.high, tickSize);
          sweepRange = {
            low: roundToTick(bar.low, tickSize),
            high: roundToTick(bar.high, tickSize),
          };
        }
      }
      if (closeThrough) {
        status = "closed_through";
        if (closedThroughAt == null) closedThroughAt = t;
      }
    } else {
      const taggedZone = bar.low - 1e-9 <= range.high;
      const through = bar.low < level - 1e-9;
      const closeThrough = bar.close < level - 1e-9;
      if (taggedZone && !through && (status === "active" || status === "touched")) {
        status = "touched";
        if (touchedAt == null) touchedAt = t;
      }
      if (through && status !== "closed_through") {
        status = "swept";
        if (sweptAt == null) {
          sweptAt = t;
          sweepPrice = roundToTick(bar.low, tickSize);
          sweepRange = {
            low: roundToTick(bar.low, tickSize),
            high: roundToTick(bar.high, tickSize),
          };
        }
      }
      if (closeThrough) {
        status = "closed_through";
        if (closedThroughAt == null) closedThroughAt = t;
      }
    }
  }

  if (
    (status === "active" || status === "touched") &&
    Number.isFinite(invalidationAtrMult) &&
    invalidationAtrMult > 0
  ) {
    const last = bars[asOfIndex]!;
    const dist = kind === "eqh" ? level - last.close : last.close - level;
    if (dist > invalidationAtrMult * Math.max(atr, tickSize)) {
      status = "invalidated";
      invalidatedAt = unixSec(last.time);
    }
  }

  return { status, touchedAt, sweptAt, sweepPrice, sweepRange, closedThroughAt, invalidatedAt };
}

function toPoolDraft(
  kind: EqhEqlKind,
  group: InternalSwing[],
  bars: Bar[],
  asOfIndex: number,
  atr: number,
  tolerance: number,
  tickSize: number,
  invalidationAtrMult: number
): EqhEqlPoolDraft | null {
  const expectType = kind === "eqh" ? "high" : "low";
  const typed = group.filter((s) => s.type === expectType);
  if (typed.length < 2) return null;
  const swings = [...typed].sort((a, b) => a.barTime - b.barTime);
  const prices = swings.map((s) => s.price);
  const range = { low: Math.min(...prices), high: Math.max(...prices) };
  const level = kind === "eqh" ? range.high : range.low;
  const formationSwing = swings[1] ?? swings[0]!;
  const formationTime = formationSwing.confirmationTime;
  const confirmationTime = Math.max(...swings.map((s) => s.confirmationTime));
  const confirmIdx = Math.max(...swings.map((s) => s.confirmationIndex));
  const life = applyLifecycle(
    kind,
    level,
    range,
    bars,
    confirmIdx,
    asOfIndex,
    atr,
    invalidationAtrMult,
    tickSize
  );
  const priceDifference = roundToTick(range.high - range.low, tickSize);
  const formedAt = new Date(formationTime * 1000);
  const confirmedAt = new Date(confirmationTime * 1000);
  const publicSwings: EqhEqlSwing[] = swings.map(
    ({ confirmationIndex: _c, ...rest }) => rest
  );
  return {
    id: `${kind}_${level.toFixed(2).replace(".", "_")}_${swings[0]!.barTime}`,
    kind,
    level,
    range,
    tickSize,
    priceDifference,
    tickDifference: ticksBetween(range.high, range.low, tickSize),
    tolerance,
    toleranceTicks: Math.round(tolerance / tickSize),
    swings: publicSwings,
    formationTime,
    confirmationTime,
    createdAt: formationTime,
    formedAtLabel: formatEst(formedAt),
    confirmationLabel: formatEst(confirmedAt),
    atrAtFormation: roundToTick(atr, tickSize) || atr,
    ...life,
  };
}

function toLiquidityArea(p: EqhEqlPool): LiquidityArea {
  return {
    id: p.id,
    type: p.kind === "eqh" ? "BUY_SIDE" : "SELL_SIDE",
    priceLow: p.range.low,
    priceHigh: p.range.high,
    representativeLevel: p.level,
    contributingSwings: p.swings,
    formationTime: p.formationTime,
    confirmationTime: p.confirmationTime,
    status: p.status,
    structuralContext: p.structuralContext,
    visualClass: p.visualClass,
    confidence: p.importance,
    whyMeaningful: p.why,
    whyNotNearby: p.whyNotNearby,
    liquidityLayer: p.liquidityLayer,
    liquidityRole: p.liquidityRole,
    whyImportant: p.whyImportant,
    sweptAt: p.sweptAt,
    sweepPrice: p.sweepPrice,
    sweepRange: p.sweepRange,
  };
}

function classifyDraft(draft: EqhEqlPoolDraft, ctx: ReturnType<typeof buildImportanceContext>): EqhEqlPool {
  const classified: EqhEqlClassification = classifyEqhEqlPool(draft, ctx, buildWhyDetection(draft));
  const pool: EqhEqlPool = {
    ...draft,
    ...classified,
    liquidityLayer: "RELATIVE",
    liquidityRole: "SECONDARY",
    whyImportant: "",
    liquidityArea: undefined as unknown as LiquidityArea,
  };
  pool.liquidityArea = toLiquidityArea(pool);
  return pool;
}

function rangesOverlap(
  a: { low: number; high: number },
  b: { low: number; high: number },
  pad: number
): boolean {
  return !(a.high + pad < b.low - 1e-9 || b.high + pad < a.low - 1e-9);
}

function poolStrength(p: EqhEqlPool): number {
  const prom = p.swings.reduce((s, x) => s + x.prominence, 0);
  return p.swings.length * 1e6 + prom * 1e3 + (p.structuralPriority ?? 0) * 10;
}

function isTypePure(p: { kind: EqhEqlKind; swings: Array<{ type?: "high" | "low" }> }): boolean {
  const expect = p.kind === "eqh" ? "high" : "low";
  return p.swings.length >= 2 && p.swings.every((s) => s.type == null || s.type === expect);
}

/** Nearby same-type clusters are one shelf — not three magenta lines through chop. */
function mergeOverlappingGroups(groups: InternalSwing[][], pad: number): InternalSwing[][] {
  if (groups.length < 2) return groups;
  const parent = groups.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number): void {
    parent[find(a)] = find(b);
  }
  const ranges = groups.map((g) => ({
    low: Math.min(...g.map((s) => s.price)),
    high: Math.max(...g.map((s) => s.price)),
  }));
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (rangesOverlap(ranges[i]!, ranges[j]!, pad)) union(i, j);
    }
  }
  const merged = new Map<number, InternalSwing[]>();
  for (let i = 0; i < groups.length; i++) {
    const root = find(i);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root)!.push(...groups[i]!);
  }
  return [...merged.values()].map((g) => {
    const byId = new Map(g.map((s) => [s.id, s]));
    return [...byId.values()].sort((a, b) => a.barIndex - b.barIndex);
  });
}

/**
 * One visible shelf cannot be buy-side and sell-side. Keep the stronger same-type
 * pool (the two swing lows in the screenshot, not a nearby high in the tick band).
 */
function resolveMixedSideOverlaps(pools: EqhEqlPool[], pad: number, rejected: RejectedEqhEql[], maxRejected: number): EqhEqlPool[] {
  const drop = new Set<string>();
  for (const a of pools) {
    if (a.kind !== "eqh" || drop.has(a.id)) continue;
    for (const b of pools) {
      if (b.kind !== "eql" || drop.has(b.id)) continue;
      if (!rangesOverlap(a.range, b.range, pad) && Math.abs(a.level - b.level) > pad + 1e-9) continue;
      const keepEqh = poolStrength(a) > poolStrength(b);
      const loser = keepEqh ? b : a;
      drop.add(loser.id);
      if (rejected.length < maxRejected) {
        rejected.push({
          kind: loser.kind,
          visualClass: loser.visualClass,
          prices: loser.swings.map((s) => s.price),
          swings: loser.swings,
          why:
            "Same visible shelf as opposite-side swings — not dual REH/REL. " +
            `Kept ${keepEqh ? "buy-side highs" : "sell-side lows"} at ${(keepEqh ? a : b).level.toFixed(2)}.`,
          failedTests: ["oneSidedShelf"],
        });
      }
    }
  }
  return pools.filter((p) => !drop.has(p.id));
}

/** Stacked same-side lines in one band collapse to the strongest pool. */
function collapseStackedSameSide(pools: EqhEqlPool[], pad: number): EqhEqlPool[] {
  const out: EqhEqlPool[] = [];
  for (const kind of ["eqh", "eql"] as const) {
    const side = pools.filter((p) => p.kind === kind).sort((a, b) => poolStrength(b) - poolStrength(a));
    const kept: EqhEqlPool[] = [];
    for (const p of side) {
      const overlap = kept.some(
        (k) => rangesOverlap(k.range, p.range, pad) || Math.abs(k.level - p.level) <= pad + 1e-9
      );
      if (!overlap) kept.push(p);
    }
    out.push(...kept);
  }
  return out;
}

function rangeGap(a: { low: number; high: number }, b: { low: number; high: number }): number {
  if (rangesOverlap(a, b, 0)) return 0;
  return a.high < b.low ? b.low - a.high : a.low - b.high;
}

/**
 * Vertical pad for "one recognizable liquidity area" — independent of the
 * equality shelf. A trader marks one zone through consolidation chop, not
 * every equal-looking pair that survived the structural gate.
 */
export function visualAreaPad(atr: number, tickSize: number, localRange: number): number {
  const tick = Math.max(tickSize, 1e-9);
  const local = Math.max(localRange, tick);
  const vol = Math.max(atr, tick);
  return Math.max(8 * tick, Math.min(0.28 * local, Math.max(0.55 * vol, 0.18 * local)));
}

function containingRangePts(
  kind: EqhEqlKind,
  pools: EqhEqlPool[],
  bars: Bar[],
  opposite: PairSwing[]
): { high: number; low: number; span: number } {
  const swings = pools.flatMap((p) => p.swings);
  const first = Math.min(...swings.map((s) => s.barIndex));
  const last = Math.max(...swings.map((s) => s.barIndex));
  const start = Math.max(0, first - 40);
  const end = Math.min(bars.length - 1, last);
  let high = -Infinity;
  let low = Infinity;
  for (let i = start; i <= end; i++) {
    high = Math.max(high, bars[i]!.high);
    low = Math.min(low, bars[i]!.low);
  }
  const prior = opposite.filter((s) => s.barIndex < first);
  if (kind === "eql" && prior.length) {
    high = Math.max(high, ...prior.map((s) => s.price));
  }
  if (kind === "eqh" && prior.length) {
    low = Math.min(low, ...prior.map((s) => s.price));
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return { high: 0, low: 0, span: 0 };
  }
  return { high, low, span: Math.max(0, high - low) };
}

function interveningLeave(kind: EqhEqlKind, a: EqhEqlPool, b: EqhEqlPool, bars: Bar[]): number {
  const left = Math.min(
    ...a.swings.map((s) => s.barIndex),
    ...b.swings.map((s) => s.barIndex)
  );
  const right = Math.max(
    ...a.swings.map((s) => s.barIndex),
    ...b.swings.map((s) => s.barIndex)
  );
  const cap = Math.max(a.range.high, b.range.high);
  const floor = Math.min(a.range.low, b.range.low);
  return excursionBetween(kind, left, right, cap, floor, bars);
}

export function sameRecognizableArea(input: {
  kind: EqhEqlKind;
  a: EqhEqlPool;
  b: EqhEqlPool;
  bars: Bar[];
  atr: number;
  tickSize: number;
  opposite: PairSwing[];
}): boolean {
  const { kind, a, b, bars, atr, tickSize, opposite } = input;
  const gap = rangeGap(a.range, b.range);
  const local = containingRangePts(kind, [a, b], bars, opposite);
  const pad = visualAreaPad(atr, tickSize, local.span);
  if (gap > pad + 1e-9) return false;
  const leave = interveningLeave(kind, a, b, bars);
  if (leave >= 0.5 * local.span && leave >= Math.max(1.5 * atr, pad)) return false;
  return true;
}

function asInternalSwing(s: EqhEqlSwing): InternalSwing {
  return {
    ...s,
    confirmationIndex: s.barIndex + (s.confirmationDelayBars || DEFAULT_WING),
  };
}

function appendAbsorbedWhy(pool: EqhEqlPool, absorbed: EqhEqlPool[]): EqhEqlPool {
  if (!absorbed.length) return pool;
  const noun = pool.kind === "eql" ? "lows" : "highs";
  const prices = absorbed
    .flatMap((p) => p.swings.map((s) => s.price.toFixed(2)))
    .join(", ");
  const note =
    ` Internal ${noun} at ${prices} belong to this same recognizable ` +
    `${pool.kind === "eql" ? "sell-side" : "buy-side"} area — not separate overlay lines.`;
  return { ...pool, why: `${pool.why}${note}` };
}

/**
 * Would a trader notice this horizontal if the REL/REH label were removed?
 * If not, it is not PRIMARY. Distance to last is not evidence.
 */
export function passesVisualNoticeTest(p: Pick<
  EqhEqlPool,
  "visualClass" | "swings" | "structuralPriority" | "lifecycle"
>): boolean {
  if (p.visualClass !== "A") return false;
  if (p.swings.length >= 3) return true;
  if (p.structuralPriority >= 2) return true;
  return false;
}

export function isDisplayedLiquidityRole(role: LiquidityRole | undefined): boolean {
  return role === "PRIMARY" || role === "SECONDARY";
}

export function whyThisIsPrimary(p: EqhEqlPool): string {
  const noun = p.kind === "eql" ? "lows" : "highs";
  const side = p.kind === "eql" ? "sell-side" : "buy-side";
  const evidence: string[] = [];
  if (p.swings.length >= 3) {
    evidence.push(
      `${p.swings.length} confirmed swing ${noun} form one obvious ${side} horizontal a trader would mark without a label`
    );
  } else {
    evidence.push(
      `two confirmed meaningful swing ${noun} at ${p.range.low.toFixed(2)}–${p.range.high.toFixed(2)}`
    );
  }
  const struct = p.structuralContext.replace(/\s+/g, " ").trim();
  if (struct) evidence.push(struct);
  if (p.lifecycle === "ACTIVE") evidence.push("Still unswept at T — not chosen with a future sweep.");
  else if (p.lifecycle === "SWEPT") evidence.push("Already swept — kept as history, not current rest.");
  return evidence.join(". ");
}

function toInternalRecord(loser: EqhEqlPool, parentLevel: number): EqhEqlPool {
  const noun = loser.kind === "eql" ? "lows" : "highs";
  const side = loser.kind === "eql" ? "sell-side" : "buy-side";
  const prices = loser.swings.map((s) => s.price.toFixed(2)).join("/");
  const next: EqhEqlPool = {
    ...loser,
    liquidityLayer: "INTERNAL",
    liquidityRole: "INTERNAL",
    whyImportant: "",
    why:
      `INTERNAL: swing ${noun} at ${prices} sit inside the same recognizable ${side} area as ` +
      `${parentLevel.toFixed(2)} (consolidation internals that did not break the structural extreme). ` +
      `Preserved for Karen — not a separate overlay line. Named session/PD levels are EXTERNAL and stay on their own path.`,
  };
  next.liquidityArea = toLiquidityArea(next);
  return next;
}

function assignLiquidityRoles(pools: EqhEqlPool[]): EqhEqlPool[] {
  const out: EqhEqlPool[] = [];
  for (const kind of ["eqh", "eql"] as const) {
    const side = pools.filter((p) => p.kind === kind);
    if (!side.length) continue;
    const noticeable = side.filter(passesVisualNoticeTest);
    let primaryId: string | null = null;
    if (noticeable.length) {
      const ranked = [...noticeable].sort(
        (a, b) =>
          b.structuralPriority - a.structuralPriority ||
          poolStrength(b) - poolStrength(a) ||
          (kind === "eql" ? a.level - b.level : b.level - a.level)
      );
      primaryId = ranked[0]!.id;
    }
    for (const p of side) {
      const role: LiquidityRole = p.id === primaryId ? "PRIMARY" : "SECONDARY";
      const next: EqhEqlPool = {
        ...p,
        liquidityLayer: "RELATIVE",
        liquidityRole: role,
        whyImportant: role === "PRIMARY" ? whyThisIsPrimary({ ...p, liquidityRole: "PRIMARY" }) : "",
      };
      next.liquidityArea = toLiquidityArea(next);
      out.push(next);
    }
  }
  return out;
}

/**
 * Same-side class-A pairs that sit in one consolidation become one area.
 * Equality pairing is unchanged. Named session/PD levels are not pools here.
 */
function collapseRecognizableAreas(
  pools: EqhEqlPool[],
  bars: Bar[],
  asOfIndex: number,
  atr: number,
  tickSize: number,
  tolerance: number,
  invalidationAtrMult: number,
  highs: PairSwing[],
  lows: PairSwing[],
  ctx: ReturnType<typeof buildImportanceContext>,
  internal: EqhEqlPool[]
): EqhEqlPool[] {
  const out: EqhEqlPool[] = [];
  for (const kind of ["eqh", "eql"] as const) {
    const side = pools.filter((p) => p.kind === kind);
    if (side.length < 2) {
      out.push(...assignLiquidityRoles(side));
      continue;
    }
    const opposite = kind === "eql" ? highs : lows;
    const parent = side.map((_, i) => i);
    function find(i: number): number {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    function union(a: number, b: number): void {
      parent[find(a)] = find(b);
    }
    for (let i = 0; i < side.length; i++) {
      for (let j = i + 1; j < side.length; j++) {
        if (
          sameRecognizableArea({
            kind,
            a: side[i]!,
            b: side[j]!,
            bars,
            atr,
            tickSize,
            opposite,
          })
        ) {
          union(i, j);
        }
      }
    }
    const groups = new Map<number, EqhEqlPool[]>();
    for (let i = 0; i < side.length; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(side[i]!);
    }
    for (const group of groups.values()) {
      if (group.length === 1) {
        out.push(group[0]!);
        continue;
      }
      const extreme = [...group].sort((a, b) =>
        kind === "eql" ? a.level - b.level : b.level - a.level
      )[0]!;
      const absorbed = group.filter((p) => p.id !== extreme.id);
      const swings = [...new Map(
        group.flatMap((p) => p.swings).map((s) => [s.id, asInternalSwing(s)])
      ).values()].sort((a, b) => a.barIndex - b.barIndex);
      const draft = toPoolDraft(
        kind,
        swings,
        bars,
        asOfIndex,
        atr,
        tolerance,
        tickSize,
        invalidationAtrMult
      );
      if (!draft) {
        out.push(extreme);
        continue;
      }
      let merged = classifyDraft(draft, ctx);
      merged = appendAbsorbedWhy(merged, absorbed);
      merged.liquidityLayer = "RELATIVE";
      merged.liquidityRole = "SECONDARY";
      merged.liquidityArea = toLiquidityArea(merged);
      out.push(merged);
      for (const loser of absorbed) {
        internal.push(toInternalRecord(loser, merged.level));
      }
    }
  }
  return assignLiquidityRoles(out);
}

/**
 * Rank by class-A structural liquidity — never by distance to last.
 * Swept areas stay in the list (lower than ACTIVE) instead of being deleted.
 */
function rankPools(
  pools: EqhEqlPool[],
  _currentPrice: number | undefined,
  maxPerSide: number
): EqhEqlPool[] {
  const key = (p: EqhEqlPool): number => {
    const life = p.lifecycle === "ACTIVE" ? 0 : p.lifecycle === "SWEPT" ? 1 : 2;
    const vis = p.visualClass === "A" ? 3 : p.visualClass === "D" ? 1 : 0;
    return (
      life * 1e12 -
      vis * 1e10 -
      importanceRank(p.importance) * 1e9 -
      p.structuralPriority * 1e6 -
      p.swings.length * 1e2 +
      p.formationTime * 1e-6
    );
  };
  const eqh = pools.filter((p) => p.kind === "eqh").sort((a, b) => key(a) - key(b));
  const eql = pools.filter((p) => p.kind === "eql").sort((a, b) => key(a) - key(b));
  return [...eqh.slice(0, maxPerSide), ...eql.slice(0, maxPerSide)];
}

function pickRejected(eqh: RejectedEqhEql[], eql: RejectedEqhEql[], max: number): RejectedEqhEql[] {
  const bySpread = (xs: RejectedEqhEql[]) =>
    [...xs].sort((a, b) => {
      const sa = Math.abs((a.prices[0] ?? 0) - (a.prices[1] ?? 0));
      const sb = Math.abs((b.prices[0] ?? 0) - (b.prices[1] ?? 0));
      return sa - sb;
    });
  const buy = bySpread(eqh);
  const sell = bySpread(eql);
  const out: RejectedEqhEql[] = [];
  while (out.length < max && (buy.length || sell.length)) {
    if (buy.length) out.push(buy.shift()!);
    if (out.length >= max) break;
    if (sell.length) out.push(sell.shift()!);
  }
  return out;
}

const EMPTY: EqhEqlLiquidity = {
  status: "unknown",
  tickSize: NQ_TICK_SIZE,
  tolerance: 0,
  toleranceTicks: 0,
  atr: 0,
  wing: DEFAULT_WING,
  confirmationDelayBars: DEFAULT_WING,
  pendingSwings: [],
  minSwingGapBars: DEFAULT_MIN_SWING_GAP,
  pools: [],
  eqh: [],
  eql: [],
  areas: [],
  internal: [],
  displayed: [],
  rawSwings: { highs: [], lows: [] },
  rejected: [],
};

/** Detect EQH/EQL liquidity pools using only bars[0..asOfIndex]. */
export function detectEqhEqlLiquidity(bars: Bar[], config: EqhEqlConfig = {}): EqhEqlLiquidity {
  const wing = config.wing ?? DEFAULT_WING;
  const lookback = config.lookback ?? DEFAULT_LOOKBACK;
  const tickSize = config.tickSize ?? eqhEqlInstrumentTickSize(config.symbol);
  const asOfIndex = Math.min(config.asOfIndex ?? bars.length - 1, bars.length - 1);
  if (asOfIndex < wing * 2 || bars.length < wing * 2 + 1) {
    return { ...EMPTY, tickSize, wing, confirmationDelayBars: wing };
  }

  const start = Math.max(0, asOfIndex - lookback + 1);
  const scoped = bars.slice(start, asOfIndex + 1);
  const localAsOf = scoped.length - 1;
  const atr =
    config.atrOverride ??
    Math.max(tickSize, atrAt(scoped, localAsOf, config.atrPeriod ?? DEFAULT_ATR_PERIOD));
  const tolerance = eqhEqlTolerance({
    atr,
    tickSize,
    minTicks: config.minTicks,
    maxTicks: config.maxTicks,
    atrFraction: config.atrFraction,
  });
  const minProminence = Math.max(
    (config.prominenceMinTicks ?? DEFAULT_PROM_MIN_TICKS) * tickSize,
    atr * (config.prominenceAtrFrac ?? DEFAULT_PROM_ATR_FRAC)
  );
  const minGap = Math.max(
    config.minSwingGapBars ?? DEFAULT_MIN_SWING_GAP,
    wing * 2 + 1
  );
  const maxRejected = config.maxRejected ?? 40;

  const { confirmed, pending } = findConfirmedSwings(
    scoped,
    localAsOf,
    wing,
    tickSize,
    minProminence
  );
  const highs = mergeNearbySwings(
    confirmed.filter((s) => s.type === "high"),
    minGap
  );
  const lows = mergeNearbySwings(
    confirmed.filter((s) => s.type === "low"),
    minGap
  );
  const invalidationAtrMult = config.invalidationAtrMult ?? DEFAULT_INVALIDATION_ATR;

  const eqhCluster = clusterLiquiditySwings(
    "eqh",
    highs,
    scoped,
    atr,
    tickSize,
    minGap,
    maxRejected,
    lows,
    tolerance
  );
  const eqlCluster = clusterLiquiditySwings(
    "eql",
    lows,
    scoped,
    atr,
    tickSize,
    minGap,
    maxRejected,
    highs,
    tolerance
  );
  const rejected: RejectedEqhEql[] = pickRejected(
    eqhCluster.rejected,
    eqlCluster.rejected,
    maxRejected
  );

  const drafts = [
    ...mergeOverlappingGroups(eqhCluster.groups, tolerance).map((g) =>
      toPoolDraft("eqh", g, scoped, localAsOf, atr, tolerance, tickSize, invalidationAtrMult)
    ),
    ...mergeOverlappingGroups(eqlCluster.groups, tolerance).map((g) =>
      toPoolDraft("eql", g, scoped, localAsOf, atr, tolerance, tickSize, invalidationAtrMult)
    ),
  ].filter((d): d is EqhEqlPoolDraft => d != null);
  const lastClose = scoped[localAsOf]?.close;
  const ctx = buildImportanceContext({
    bars: scoped,
    asOfIndex: localAsOf,
    atr,
    tickSize,
    wing,
    currentPrice: config.currentPrice ?? lastClose,
    confirmedHighs: highs,
    confirmedLows: lows,
  });
  const classified = drafts.map((d) => classifyDraft(d, ctx));
  const accepted: EqhEqlPool[] = [];
  for (const p of classified) {
    if (!isTypePure(p)) {
      if (rejected.length < maxRejected) {
        rejected.push({
          kind: p.kind,
          visualClass: p.visualClass,
          prices: p.swings.map((s) => s.price),
          swings: p.swings,
          why: "Pool mixed swing highs and lows — buy-side is highs only, sell-side is lows only.",
          failedTests: ["swingType"],
        });
      }
      continue;
    }
    if (p.visualClass === "A") {
      accepted.push(p);
    } else if (rejected.length < maxRejected) {
      rejected.push({
        kind: p.kind,
        visualClass: p.visualClass,
        prices: p.swings.map((s) => s.price),
        swings: p.swings,
        why: p.why,
        failedTests: formatFactorBreakdown(p.factors)
          .filter((line) => line.includes("FAIL"))
          .map((line) => line.split(":")[0]!),
      });
    }
  }
  const sided = resolveMixedSideOverlaps(accepted, tolerance, rejected, maxRejected);
  const stacked = collapseStackedSameSide(sided, tolerance);
  const internal: EqhEqlPool[] = [];
  const collapsed =
    config.recognizableAreaCollapse === false
      ? assignLiquidityRoles(stacked)
      : collapseRecognizableAreas(
          stacked,
          scoped,
          localAsOf,
          atr,
          tickSize,
          tolerance,
          invalidationAtrMult,
          highs,
          lows,
          ctx,
          internal
        );
  const contrasted = applyLiquidityContrasts(collapsed, rejected, atr).map((p) => {
    const next = { ...p, liquidityArea: toLiquidityArea(p) };
    return next;
  });

  const maxPerSide = config.maxPoolsPerSide ?? DEFAULT_MAX_PER_SIDE;
  const pools = rankPools(contrasted, config.currentPrice, maxPerSide);
  const eqh = pools.filter((p) => p.kind === "eqh");
  const eql = pools.filter((p) => p.kind === "eql");
  const displayed = pools.filter((p) => isDisplayedLiquidityRole(p.liquidityRole));
  const areas = displayed.map(toLiquidityArea);
  const publicHighs: EqhEqlSwing[] = highs.map(({ confirmationIndex: _c, ...rest }) => rest);
  const publicLows: EqhEqlSwing[] = lows.map(({ confirmationIndex: _c, ...rest }) => rest);

  return {
    status: "known",
    tickSize,
    tolerance,
    toleranceTicks: Math.round(tolerance / tickSize),
    atr,
    wing,
    confirmationDelayBars: wing,
    pendingSwings: pending,
    minSwingGapBars: minGap,
    pools,
    eqh,
    eql,
    areas,
    internal,
    displayed,
    rawSwings: { highs: publicHighs, lows: publicLows },
    rejected,
  };
}

/** Overlay mapping — extra fields are additive; older chart-draw ignores them. */
export type ResearchOverlayEqualPool = RelativeEqualPool & {
  importance?: EqhEqlImportance;
  why?: string;
  score?: number;
  confidence?: number;
  lifecycle?: EqhEqlLifecycle;
  visualClass?: VisualObviousness;
  liquidityLayer?: LiquidityLayer;
  liquidityRole?: LiquidityRole;
  whyImportant?: string;
  liquidityArea?: {
    type: LiquidityAreaType;
    priceLow: number;
    priceHigh: number;
    representativeLevel: number;
    contributingSwingCount: number;
    status: string;
  };
};

export function isConfirmedSwingPool(
  p: EqhEqlPool,
  minGap = DEFAULT_MIN_SWING_GAP
): boolean {
  if (p.swings.length < 2) return false;
  if (p.swings.some((s) => (s.confirmationDelayBars ?? 0) < 1)) return false;
  const ordered = [...p.swings].sort((a, b) => a.barIndex - b.barIndex);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.barIndex - ordered[i - 1]!.barIndex < minGap) return false;
  }
  return true;
}

export function toRelativeEqualPools(pools: EqhEqlPool[]): ResearchOverlayEqualPool[] {
  const candidates = pools.filter(
    (p) =>
      (p.status === "active" || p.status === "touched" || p.status === "invalidated") &&
      isConfirmedSwingPool(p) &&
      p.visualClass === "A" &&
      isTypePure(p) &&
      isDisplayedLiquidityRole(p.liquidityRole)
  );
  const padOf = (p: EqhEqlPool) => Math.max(p.tolerance, p.tickSize);
  const sided = candidates.filter((p) => {
    const oppKind = p.kind === "eqh" ? "eql" : "eqh";
    const rival = candidates.find(
      (o) =>
        o.kind === oppKind &&
        (rangesOverlap(p.range, o.range, padOf(p)) || Math.abs(p.level - o.level) <= padOf(p) + 1e-9)
    );
    if (!rival) return true;
    const sp = poolStrength(p);
    const sr = poolStrength(rival);
    if (sp !== sr) return sp > sr;
    return p.id < rival.id;
  });
  const collapsed = collapseStackedSameSide(sided, sided[0] ? padOf(sided[0]) : 0.25);
  return collapsed.map((p) => ({
    price: p.level,
    type: p.kind === "eqh" ? ("reh" as const) : ("rel" as const),
    startTime: p.swings[0]?.barTime ?? p.formationTime,
    endTime: p.confirmationTime,
    barCount: p.swings.length,
    importance: p.importance,
    why: p.why,
    score: p.score,
    confidence: p.confidence,
    lifecycle: p.lifecycle,
    visualClass: p.visualClass,
    liquidityLayer: p.liquidityLayer,
    liquidityRole: p.liquidityRole,
    whyImportant: p.whyImportant,
    liquidityArea: {
      type: p.liquidityArea.type,
      priceLow: p.liquidityArea.priceLow,
      priceHigh: p.liquidityArea.priceHigh,
      representativeLevel: p.liquidityArea.representativeLevel,
      contributingSwingCount: p.swings.length,
      status: p.status,
    },
  }));
}

export type EqhEqlTrackRow = {
  kind: EqhEqlKind;
  label: string;
  price: number;
  status: EqhEqlStatus;
  swingCount: number;
  swingPrices: number[];
  formationTime: number;
  confirmationTime: number;
  formedAtLabel: string;
  confirmationLabel: string;
  tickDifference: number;
  toleranceTicks: number;
  why: string;
  whyDetection: string;
  liquidityType: EqhEqlLiquidityType;
  importance: EqhEqlImportance;
  score: number;
  confidence: number;
  lifecycle: EqhEqlLifecycle;
  timeframeContext: EqhEqlTimeframeContext;
  sessionContext: string;
  sessionLabel: string;
  distanceFromPrice: number;
  distanceAbs: number;
  factorNotes: string[];
  visualClass?: VisualObviousness;
  liquidityLayer?: LiquidityLayer;
  liquidityRole?: LiquidityRole;
  whyImportant?: string;
  whyNotNearby?: string;
  liquidityArea?: LiquidityArea;
  contributingSwings: Array<{ price: number; barTime: number; prominence: number }>;
  sweptAt?: number;
  sweptAtLabel?: string;
  sweepPrice?: number;
  sweepReaction?: EqhEqlSweepReaction | null;
};

export function formatEqhEqlClipboard(rows: EqhEqlTrackRow[]): string {
  if (!rows.length) return "";
  return rows
    .map((r) => {
      const swings = r.swingPrices.map((p) => p.toFixed(2)).join(", ");
      const sweep =
        r.sweptAt != null
          ? `; swept ${r.sweepPrice != null ? r.sweepPrice.toFixed(2) : ""}`.trim()
          : "";
      return (
        `${r.label}: ${r.price.toFixed(2)} (${r.importance ?? "?"} ${r.lifecycle ?? r.status}, ` +
        `${r.swingCount} swings ${swings}, ${r.tickDifference} ticks${sweep})\n  ${r.why}`
      );
    })
    .join("\n");
}

/** Compact rows for the panel Levels list — one cluster per pool. */
export function toEqhEqlTrackRows(
  liquidity: EqhEqlLiquidity,
  opts?: { maxRows?: number; currentPrice?: number }
): EqhEqlTrackRow[] {
  const maxRows = opts?.maxRows ?? 12;
  const price = opts?.currentPrice;
  const ranked = rankPools(
    liquidity.displayed.length ? liquidity.displayed : liquidity.pools,
    price,
    Math.ceil(maxRows / 2)
  );
  return ranked.slice(0, maxRows).map((p) => ({
    kind: p.kind,
    label: p.kind === "eqh" ? "Relative Equal Highs" : "Relative Equal Lows",
    price: p.level,
    status: p.status,
    swingCount: p.swings.length,
    swingPrices: p.swings.map((s) => s.price),
    formationTime: p.formationTime,
    confirmationTime: p.confirmationTime,
    formedAtLabel: p.formedAtLabel,
    confirmationLabel: p.confirmationLabel,
    tickDifference: p.tickDifference,
    toleranceTicks: p.toleranceTicks,
    why: p.why,
    whyDetection: p.whyDetection,
    liquidityType: p.liquidityType,
    importance: p.importance,
    score: p.score,
    confidence: p.confidence,
    lifecycle: p.lifecycle,
    timeframeContext: p.timeframeContext,
    sessionContext: p.sessionContext,
    sessionLabel: p.sessionLabel,
    distanceFromPrice: p.distanceFromPrice,
    distanceAbs: p.distanceAbs,
    factorNotes: formatFactorBreakdown(p.factors),
    visualClass: p.visualClass,
    liquidityLayer: p.liquidityLayer,
    liquidityRole: p.liquidityRole,
    whyImportant: p.whyImportant,
    whyNotNearby: p.whyNotNearby,
    liquidityArea: p.liquidityArea,
    contributingSwings: p.swings.map((s) => ({
      price: s.price,
      barTime: s.barTime,
      prominence: s.prominence,
    })),
    sweptAt: p.sweptAt,
    sweptAtLabel: p.sweptAt != null ? formatEst(new Date(p.sweptAt * 1000)) : undefined,
    sweepPrice: p.sweepPrice,
    sweepReaction: p.sweepReaction,
  }));
}
