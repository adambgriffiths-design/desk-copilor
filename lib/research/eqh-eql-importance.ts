/**
 * Liquidity-first EQH/EQL reasoning — research/analysis only.
 *
 * Production detectors (lib/reh-rel.ts, lib/structure.ts) are unchanged.
 *
 * REH/EQL are evidence for a liquidity pool, not automatically liquidity
 * because two prices are close. Relative equality (tick-aware, vol-aware)
 * is one supporting component of "same visible area."
 *
 * Classification is a structural gate, not a weighted score. Distance,
 * touch count, age, and price difference cannot award HIGH on their own.
 *
 * Point-in-time: callers pass bars already truncated at T (asOfIndex).
 */
import type { Bar } from "../types";
import {
  barsInEstWindow,
  getEstDateKey,
  getEstMinutes,
  RTH_OPEN_MIN,
} from "../market-data";
import { resolveSessionContext, type SessionId } from "../sessions";

export type EqhEqlImportance = "LOW" | "MEDIUM" | "HIGH";
export type EqhEqlLifecycle = "ACTIVE" | "SWEPT" | "INVALIDATED";
export type EqhEqlTimeframeContext = "session" | "intraday" | "htf";
export type EqhEqlLiquidityType = "EQH" | "EQL";
export type VisualObviousness = "A" | "B" | "C" | "D";
export type LiquidityAreaType = "BUY_SIDE" | "SELL_SIDE";

export type FactorScore = {
  /** 1 = pass / supporting, 0 = fail. Not a quality formula. */
  score: number;
  note: string;
};

/** Structural tests + supporting relative-equality. No mystery weights. */
export type EqhEqlImportanceFactors = {
  confirmedSwing: FactorScore;
  meaningfulVsPa: FactorScore;
  genuineReturn: FactorScore;
  visualRecognition: FactorScore;
  clearPoolVsNoise: FactorScore;
  alreadySwept: FactorScore;
  relevantStructure: FactorScore;
  actionableAtT: FactorScore;
  relativeEquality: FactorScore;
  visualClass: FactorScore;
};

export const STRUCTURAL_TEST_ORDER: (keyof EqhEqlImportanceFactors)[] = [
  "confirmedSwing",
  "meaningfulVsPa",
  "genuineReturn",
  "visualRecognition",
  "clearPoolVsNoise",
  "alreadySwept",
  "relevantStructure",
  "actionableAtT",
  "relativeEquality",
  "visualClass",
];

export type ResearchStructureBreak = {
  direction: "bullish" | "bearish";
  level: number;
  barIndex: number;
  time: number;
};

export type EqhEqlSweepReaction = {
  displacement: boolean;
  displacementPts: number;
  reactionNote: string;
};

export type ImportanceContext = {
  bars: Bar[];
  asOfIndex: number;
  asOfTime: number;
  currentPrice: number;
  atr: number;
  tickSize: number;
  wing: number;
  currentSession: SessionId;
  dealingRange: { high: number; low: number; source: string } | null;
  lookbackHigh: number;
  lookbackLow: number;
  structureBreaks: ResearchStructureBreak[];
  /** Confirmed swing highs in the as-of window — mixed-side occupancy checks. */
  confirmedHighs?: PairSwing[];
  /** Confirmed swing lows in the as-of window — mixed-side occupancy checks. */
  confirmedLows?: PairSwing[];
};

export type ClassifiableEqhEqlPool = {
  kind: "eqh" | "eql";
  level: number;
  range: { low: number; high: number };
  swings: Array<{
    type?: "high" | "low";
    price: number;
    barIndex: number;
    barTime: number;
    confirmationTime: number;
    confirmationDelayBars: number;
    prominence: number;
    prominenceTicks: number;
  }>;
  tickDifference: number;
  toleranceTicks: number;
  status: string;
  formationTime: number;
  confirmationTime: number;
  atrAtFormation: number;
  touchedAt?: number;
  sweptAt?: number;
  sweepPrice?: number;
  closedThroughAt?: number;
  why?: string;
};

export type PairSwing = ClassifiableEqhEqlPool["swings"][number];

export type PairEvaluation = {
  accept: boolean;
  reject: boolean;
  visualClass: VisualObviousness;
  why: string;
  failedTests: string[];
  tests: Pick<
    EqhEqlImportanceFactors,
    | "confirmedSwing"
    | "meaningfulVsPa"
    | "genuineReturn"
    | "visualRecognition"
    | "clearPoolVsNoise"
    | "relativeEquality"
  >;
};

export type RejectedEqhEql = {
  kind: "eqh" | "eql";
  visualClass: VisualObviousness;
  prices: number[];
  swings: PairSwing[];
  why: string;
  failedTests: string[];
};

export type EqhEqlClassification = {
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
  why: string;
  whyDetection: string;
  sweepReaction: EqhEqlSweepReaction | null;
  visualClass: VisualObviousness;
  structuralContext: string;
  whyNotNearby: string;
  structuralPriority: number;
};

const FHDR_END_MIN = 10 * 60 + 30;
const SESSION_LABEL: Record<string, string> = {
  asia: "Asia session",
  london: "London session",
  ny_pre: "New York pre-market",
  ny_am: "New York AM",
  ny_pm: "New York PM",
  overnight: "Overnight",
  multi_session: "Multiple sessions",
};

function unixSec(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function pass(note: string): FactorScore {
  return { score: 1, note };
}

function fail(note: string): FactorScore {
  return { score: 0, note };
}

export function mapEqhEqlLifecycle(status: string): EqhEqlLifecycle {
  if (status === "swept" || status === "closed_through") return "SWEPT";
  if (status === "invalidated") return "INVALIDATED";
  return "ACTIVE";
}

export function sessionIdAt(timeSec: number): SessionId {
  return resolveSessionContext(new Date(timeSec * 1000)).id;
}

export function sessionLabelFor(id: string): string {
  return SESSION_LABEL[id] ?? id;
}

export function rankTokenFromImportance(importance: EqhEqlImportance): number {
  if (importance === "HIGH") return 90;
  if (importance === "MEDIUM") return 60;
  return 30;
}

export function importanceRank(importance: EqhEqlImportance): number {
  if (importance === "HIGH") return 3;
  if (importance === "MEDIUM") return 2;
  return 1;
}

export function meaningfulProminenceFloor(atr: number, tickSize: number): number {
  return Math.max(6 * tickSize, 0.25 * atr);
}

/** Generous window for "this looks like an equal pair" — not an acceptance gate. */
export function candidateWindowPts(atr: number, tickSize: number): number {
  return Math.max(0.4 * atr, 12 * tickSize);
}

/**
 * Same visible shelf — supporting relative equality, not "the number is small."
 * Strong swings with a real pullback can share a vol-justified band.
 * Quiet tape keeps the band tight so 1.00 pt does not auto-qualify.
 */
export function sameVisibleShelf(input: {
  spread: number;
  atr: number;
  excursion: number;
  bothMeaningful: boolean;
}): { ok: boolean; note: string; maxShelf: number } {
  const volBand = input.bothMeaningful ? 0.15 * input.atr : 0.06 * input.atr;
  const shelfVsMove = 0.15 * Math.max(input.excursion, input.atr * 0.01);
  const maxShelf = Math.min(volBand, shelfVsMove);
  const ok = input.spread <= maxShelf + 1e-9;
  const note = ok
    ? `Same visible area: ${input.spread.toFixed(2)} pt shelf vs ${input.excursion.toFixed(2)} pt pullback (ATR ${input.atr.toFixed(2)}; band ${maxShelf.toFixed(2)}). Relative equality supports the area — it is not the reason it exists.`
    : `Not the same visible area: ${input.spread.toFixed(2)} pt apart vs a ${maxShelf.toFixed(2)} pt shelf (pullback ${input.excursion.toFixed(2)}, ATR ${input.atr.toFixed(2)}). A small print difference is not enough to call this EQH/EQL.`;
  return { ok, note, maxShelf };
}

export function detectResearchStructureBreaks(
  bars: Bar[],
  asOfIndex: number,
  wing = 2
): ResearchStructureBreak[] {
  const breaks: ResearchStructureBreak[] = [];
  if (asOfIndex < wing * 2 + 1 || !bars.length) return breaks;

  const swingHighs: { price: number; index: number }[] = [];
  const swingLows: { price: number; index: number }[] = [];
  const last = Math.min(asOfIndex, bars.length - 1);

  for (let i = wing; i + wing <= last; i++) {
    const bar = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= wing; j++) {
      if (bars[i - j]!.high >= bar.high || bars[i + j]!.high >= bar.high) isHigh = false;
      if (bars[i - j]!.low <= bar.low || bars[i + j]!.low <= bar.low) isLow = false;
    }
    if (isHigh) swingHighs.push({ price: bar.high, index: i });
    if (isLow) swingLows.push({ price: bar.low, index: i });
  }

  const brokenHigh = new Set<number>();
  const brokenLow = new Set<number>();

  for (let i = wing * 2; i <= last; i++) {
    const bar = bars[i]!;
    let priorHigh: { price: number; index: number } | undefined;
    for (let k = swingHighs.length - 1; k >= 0; k--) {
      const s = swingHighs[k]!;
      if (s.index < i - 1) {
        priorHigh = s;
        break;
      }
    }
    let priorLow: { price: number; index: number } | undefined;
    for (let k = swingLows.length - 1; k >= 0; k--) {
      const s = swingLows[k]!;
      if (s.index < i - 1) {
        priorLow = s;
        break;
      }
    }
    if (priorHigh && !brokenHigh.has(priorHigh.index) && bar.close > priorHigh.price) {
      brokenHigh.add(priorHigh.index);
      breaks.push({
        direction: "bullish",
        level: priorHigh.price,
        barIndex: i,
        time: unixSec(bar.time),
      });
    }
    if (priorLow && !brokenLow.has(priorLow.index) && bar.close < priorLow.price) {
      brokenLow.add(priorLow.index);
      breaks.push({
        direction: "bearish",
        level: priorLow.price,
        barIndex: i,
        time: unixSec(bar.time),
      });
    }
  }

  return breaks;
}

function dealingRangeAt(
  bars: Bar[],
  asOfIndex: number
): { high: number; low: number; source: string } | null {
  const asOf = bars[asOfIndex];
  if (!asOf) return null;
  const scoped = bars.slice(0, asOfIndex + 1);
  const dateKey = getEstDateKey(asOf.time);
  const minutes = getEstMinutes(asOf.time);
  if (minutes >= RTH_OPEN_MIN && minutes < 16 * 60) {
    const fhdr = barsInEstWindow(scoped, RTH_OPEN_MIN, FHDR_END_MIN, dateKey);
    if (fhdr.length >= 4) {
      return {
        high: Math.max(...fhdr.map((b) => b.high)),
        low: Math.min(...fhdr.map((b) => b.low)),
        source: "first-hour dealing range",
      };
    }
  }
  const session = resolveSessionContext(asOf.time);
  const window =
    session.id === "asia"
      ? barsInEstWindow(scoped, 18 * 60, 24 * 60, dateKey).concat(
          barsInEstWindow(scoped, 0, 60, dateKey)
        )
      : session.id === "london"
        ? barsInEstWindow(scoped, 2 * 60, 5 * 60, dateKey)
        : session.id === "ny_pre"
          ? barsInEstWindow(scoped, 7 * 60, 9 * 60 + 30, dateKey)
          : session.id === "ny_pm"
            ? barsInEstWindow(scoped, 13 * 60 + 30, 16 * 60, dateKey)
            : scoped.slice(-60);
  if (window.length < 4) {
    const fb = scoped.slice(-40);
    if (!fb.length) return null;
    return {
      high: Math.max(...fb.map((b) => b.high)),
      low: Math.min(...fb.map((b) => b.low)),
      source: "recent range",
    };
  }
  return {
    high: Math.max(...window.map((b) => b.high)),
    low: Math.min(...window.map((b) => b.low)),
    source: `${session.label} range`,
  };
}

export function buildImportanceContext(input: {
  bars: Bar[];
  asOfIndex: number;
  atr: number;
  tickSize: number;
  wing?: number;
  currentPrice?: number;
  confirmedHighs?: PairSwing[];
  confirmedLows?: PairSwing[];
}): ImportanceContext {
  const asOfIndex = Math.min(input.asOfIndex, input.bars.length - 1);
  const last = input.bars[asOfIndex]!;
  const currentPrice =
    input.currentPrice != null && Number.isFinite(input.currentPrice)
      ? input.currentPrice
      : last.close;
  const scoped = input.bars.slice(0, asOfIndex + 1);
  return {
    bars: input.bars,
    asOfIndex,
    asOfTime: unixSec(last.time),
    currentPrice,
    atr: Math.max(input.atr, input.tickSize),
    tickSize: input.tickSize,
    wing: input.wing ?? 2,
    currentSession: resolveSessionContext(last.time).id,
    dealingRange: dealingRangeAt(input.bars, asOfIndex),
    lookbackHigh: Math.max(...scoped.map((b) => b.high)),
    lookbackLow: Math.min(...scoped.map((b) => b.low)),
    structureBreaks: detectResearchStructureBreaks(input.bars, asOfIndex, input.wing ?? 2),
    confirmedHighs: input.confirmedHighs,
    confirmedLows: input.confirmedLows,
  };
}

export function excursionBetween(
  kind: "eqh" | "eql",
  leftIndex: number,
  rightIndex: number,
  cap: number,
  floor: number,
  bars: Bar[]
): number {
  if (rightIndex - leftIndex < 2) return 0;
  if (kind === "eqh") {
    let m = Infinity;
    for (let i = leftIndex + 1; i < rightIndex; i++) {
      if (bars[i]) m = Math.min(m, bars[i]!.low);
    }
    return Number.isFinite(m) ? floor - m : 0;
  }
  let m = -Infinity;
  for (let i = leftIndex + 1; i < rightIndex; i++) {
    if (bars[i]) m = Math.max(m, bars[i]!.high);
  }
  return Number.isFinite(m) ? m - cap : 0;
}

function displacementAwayFromPool(pool: ClassifiableEqhEqlPool, ctx: ImportanceContext): number {
  const confirmIdx = Math.max(
    ...pool.swings.map((s) => s.barIndex + (s.confirmationDelayBars || ctx.wing))
  );
  let extreme = pool.kind === "eqh" ? Infinity : -Infinity;
  for (let i = confirmIdx + 1; i <= ctx.asOfIndex; i++) {
    const bar = ctx.bars[i];
    if (!bar) continue;
    if (pool.kind === "eqh") extreme = Math.min(extreme, bar.low);
    else extreme = Math.max(extreme, bar.high);
  }
  if (!Number.isFinite(extreme)) return 0;
  return pool.kind === "eqh" ? pool.level - extreme : extreme - pool.level;
}

function barIndexAtTime(bars: Bar[], timeSec: number, from: number, to: number): number {
  for (let i = from; i <= to; i++) {
    const bar = bars[i];
    if (!bar) continue;
    if (unixSec(bar.time) === timeSec) return i;
  }
  return -1;
}

export function measureSweepReaction(
  pool: ClassifiableEqhEqlPool,
  ctx: ImportanceContext
): EqhEqlSweepReaction | null {
  if (pool.sweptAt == null) return null;
  const start = barIndexAtTime(ctx.bars, pool.sweptAt, 0, ctx.asOfIndex);
  if (start < 0) {
    return {
      displacement: false,
      displacementPts: 0,
      reactionNote: "Sweep recorded; reaction bars not in this window.",
    };
  }
  const end = Math.min(ctx.asOfIndex, start + 12);
  let extreme = pool.kind === "eqh" ? Infinity : -Infinity;
  let closedBack = false;
  for (let i = start; i <= end; i++) {
    const bar = ctx.bars[i]!;
    if (pool.kind === "eqh") {
      extreme = Math.min(extreme, bar.low);
      if (bar.close < pool.level - 1e-9) closedBack = true;
    } else {
      extreme = Math.max(extreme, bar.high);
      if (bar.close > pool.level + 1e-9) closedBack = true;
    }
  }
  const displacementPts =
    pool.kind === "eqh" ? pool.level - extreme : extreme - pool.level;
  const displacement = displacementPts >= 0.4 * ctx.atr || closedBack;
  return {
    displacement,
    displacementPts: Math.max(0, displacementPts),
    reactionNote: displacement
      ? closedBack
        ? `Sweep then closed back through ${pool.level.toFixed(2)} (${displacementPts.toFixed(2)} pts) — reaction, not a blank run.`
        : `Sweep produced ${displacementPts.toFixed(2)} pts of displacement after the take.`
      : "Sweep printed but no meaningful displacement or close-back yet (as of T).",
  };
}

function interveningBreaksShelf(
  kind: "eqh" | "eql",
  left: PairSwing,
  right: PairSwing,
  allSame: PairSwing[],
  tickSize: number
): boolean {
  const cap = Math.max(left.price, right.price);
  const floor = Math.min(left.price, right.price);
  for (const s of allSame) {
    if (s.barIndex <= left.barIndex || s.barIndex >= right.barIndex) continue;
    if (kind === "eqh" && s.price > cap + tickSize + 1e-9) return true;
    if (kind === "eql" && s.price < floor - tickSize - 1e-9) return true;
  }
  return false;
}

function expectedSwingType(kind: "eqh" | "eql"): "high" | "low" {
  return kind === "eqh" ? "high" : "low";
}

/** Opposite-side prints in the same tick/shelf band — range/chop, not EQH or EQL. */
export function oppositeTypeInShelf(input: {
  kind: "eqh" | "eql";
  left: PairSwing;
  right: PairSwing;
  opposite: PairSwing[];
  pad: number;
}): boolean {
  if (!input.opposite.length) return false;
  const lo = Math.min(input.left.price, input.right.price) - input.pad;
  const hi = Math.max(input.left.price, input.right.price) + input.pad;
  const want = input.kind === "eqh" ? "low" : "high";
  return input.opposite.some((s) => {
    if (s.type != null && s.type !== want) return false;
    return s.price + 1e-9 >= lo && s.price - 1e-9 <= hi;
  });
}

/**
 * Structural tests 1–5 for a candidate pair. Relative equality is supporting.
 * Accept only visual class A. Similar prices that fail are rejected with why.
 */
export function evaluateSwingPair(input: {
  kind: "eqh" | "eql";
  left: PairSwing;
  right: PairSwing;
  bars: Bar[];
  atr: number;
  tickSize: number;
  minGap: number;
  allSame: PairSwing[];
  opposite?: PairSwing[];
  /** Occupancy pad for opposite-side prints. Default: 1 tick — not a looser equality gate. */
  mixedSidePad?: number;
}): PairEvaluation {
  const { kind, bars, atr, tickSize, minGap, allSame } = input;
  const left = input.left.barIndex <= input.right.barIndex ? input.left : input.right;
  const right = input.left.barIndex <= input.right.barIndex ? input.right : input.left;
  const spread = Math.abs(left.price - right.price);
  const floorPts = meaningfulProminenceFloor(atr, tickSize);
  const window = candidateWindowPts(atr, tickSize);
  const inWindow = spread <= window + 1e-9;
  const failedTests: string[] = [];
  const expectType = expectedSwingType(kind);
  const typeOk =
    (left.type == null || left.type === expectType) &&
    (right.type == null || right.type === expectType);
  if (!typeOk) failedTests.push("swingType");

  const confirmed =
    (left.confirmationDelayBars ?? 0) >= 1 && (right.confirmationDelayBars ?? 0) >= 1;
  const confirmedSwing = confirmed
    ? pass("Both swings confirmed after the right-wing bar closed.")
    : fail("A contributing swing is not confirmed at T.");
  if (!confirmed) failedTests.push("confirmedSwing");

  const bothMeaningful =
    left.prominence + 1e-9 >= floorPts && right.prominence + 1e-9 >= floorPts;
  const meaningfulVsPa = bothMeaningful
    ? pass(
        `Both swings are meaningful vs surrounding PA (prominence ${left.prominence.toFixed(2)} / ${right.prominence.toFixed(2)} vs floor ${floorPts.toFixed(2)}).`
      )
    : fail(
        `Not meaningful vs surrounding PA (prominence ${left.prominence.toFixed(2)} / ${right.prominence.toFixed(2)} vs floor ${floorPts.toFixed(2)}). Close prints do not create liquidity.`
      );
  if (!bothMeaningful) failedTests.push("meaningfulVsPa");

  const gap = right.barIndex - left.barIndex;
  const separated = gap >= minGap;
  const visualRecognition = separated
    ? pass(`Visible separation in time/structure (${gap} bars between swings).`)
    : fail(`Not visually separate — ${gap} bars apart (need ${minGap}). Nearby wicks are not a pool.`);
  if (!separated) failedTests.push("visualRecognition");

  const cap = Math.max(left.price, right.price);
  const floor = Math.min(left.price, right.price);
  const excursion = excursionBetween(kind, left.barIndex, right.barIndex, cap, floor, bars);
  const returnFloor = Math.max(8 * tickSize, 0.25 * atr, 2 * spread);
  const genuine = excursion + 1e-9 >= returnFloor;
  const genuineReturn = genuine
    ? pass(
        `Second swing genuinely returned to the area after a ${excursion.toFixed(2)} pt move away.`
      )
    : fail(
        `No genuine return — pullback ${excursion.toFixed(2)} pt is not a real leave-and-return (need ${returnFloor.toFixed(2)}).`
      );
  if (!genuine) failedTests.push("genuineReturn");

  const shelf = sameVisibleShelf({
    spread,
    atr,
    excursion: Math.max(excursion, 0),
    bothMeaningful,
  });
  const relativeEquality = shelf.ok
    ? pass(shelf.note)
    : fail(shelf.note);
  if (!shelf.ok) failedTests.push("relativeEquality");

  const intervening = interveningBreaksShelf(kind, left, right, allSame, tickSize);
  let visualClass: VisualObviousness = "C";
  let clearPoolVsNoise: FactorScore;
  if (!typeOk) {
    visualClass = "D";
    clearPoolVsNoise = fail(
      "Buy-side liquidity comes from swing highs and sell-side from swing lows — this pair mixes sides."
    );
    failedTests.push("clearPoolVsNoise");
  } else if (!bothMeaningful) {
    visualClass = "B";
    clearPoolVsNoise = fail("Minor internal fluctuations — not an obvious liquidity pool.");
    failedTests.push("clearPoolVsNoise");
  } else if (!genuine || !separated) {
    visualClass = "C";
    clearPoolVsNoise = fail("Isolated / not a repeated level a trader would mark.");
    failedTests.push("clearPoolVsNoise");
  } else if (intervening || !shelf.ok) {
    visualClass = "D";
    clearPoolVsNoise = fail(
      intervening
        ? "Overlapping structure between the swings — not one clean horizontal pool."
        : "Prices are similar but not one recognizable horizontal area."
    );
    failedTests.push("clearPoolVsNoise");
  } else {
    visualClass = "A";
    clearPoolVsNoise = pass("Clear pool: obvious repeated swings at one recognizable horizontal.");
  }

  const accept =
    visualClass === "A" &&
    typeOk &&
    confirmed &&
    bothMeaningful &&
    genuine &&
    separated &&
    shelf.ok &&
    !intervening;

  const noun = kind === "eqh" ? "highs" : "lows";
  const why = accept
    ? `Class A: two meaningful swing ${noun} at ${left.price.toFixed(2)} / ${right.price.toFixed(2)} returned to the same visible shelf after a ${excursion.toFixed(2)} pt pullback.`
    : `Rejected as ${kind.toUpperCase()}: ${failedTests.join(", ") || "not a liquidity area"}. ${clearPoolVsNoise.note}`;

  return {
    accept,
    reject: inWindow && !accept,
    visualClass,
    why,
    failedTests,
    tests: {
      confirmedSwing,
      meaningfulVsPa,
      genuineReturn,
      visualRecognition,
      clearPoolVsNoise,
      relativeEquality,
    },
  };
}

function timeframeAndSession(
  pool: ClassifiableEqhEqlPool,
  ctx: ImportanceContext
): {
  timeframeContext: EqhEqlTimeframeContext;
  sessionContext: string;
  sessionLabel: string;
  note: string;
} {
  const sessions = [...new Set(pool.swings.map((s) => sessionIdAt(s.barTime)))];
  const spanSec =
    Math.max(...pool.swings.map((s) => s.barTime)) -
    Math.min(...pool.swings.map((s) => s.barTime));
  const multi = sessions.length > 1;
  const htf = multi || spanSec >= 6 * 3600;
  const sameDay =
    getEstDateKey(new Date(pool.formationTime * 1000)) ===
    getEstDateKey(new Date(ctx.asOfTime * 1000));
  const sameAsNow = sessions.includes(ctx.currentSession) && sameDay;
  const sessionContext = multi ? "multi_session" : (sessions[0] ?? "overnight");
  const timeframeContext: EqhEqlTimeframeContext =
    htf || !sameDay ? "htf" : sameAsNow ? "session" : "intraday";
  const label = sessionLabelFor(sessionContext);
  const note =
    timeframeContext === "htf"
      ? "Higher-timeframe / multi-session liquidity — listed separately from current-session noise."
      : timeframeContext === "session"
        ? `Current-session liquidity (${label}).`
        : `Intraday liquidity from ${label}, not the active session (${sessionLabelFor(ctx.currentSession)}).`;
  return { timeframeContext, sessionContext, sessionLabel: label, note };
}

function structuralRelevance(
  pool: ClassifiableEqhEqlPool,
  ctx: ImportanceContext
): { factor: FactorScore; note: string; priority: number } {
  const atr = ctx.atr;
  const notes: string[] = [];
  let priority = 0;

  const extreme =
    pool.kind === "eqh"
      ? Math.abs(pool.level - ctx.lookbackHigh)
      : Math.abs(pool.level - ctx.lookbackLow);
  if (extreme <= Math.max(4 * ctx.tickSize, 0.15 * atr)) {
    priority = Math.max(priority, 3);
    notes.push(
      pool.kind === "eqh"
        ? "sits at the lookback swing high (structural buy-side)"
        : "sits at the lookback swing low (structural sell-side)"
    );
  }

  const nearBreak = ctx.structureBreaks.filter(
    (b) => Math.abs(b.level - pool.level) <= Math.max(0.35 * atr, 4 * ctx.tickSize)
  );
  const recent = nearBreak.filter((b) => ctx.asOfTime - b.time <= 6 * 3600);
  if (recent.length) {
    priority = Math.max(priority, 2);
    const last = recent.at(-1)!;
    notes.push(`near a ${last.direction} market structure shift at ${last.level.toFixed(2)}`);
  } else if (nearBreak.length) {
    priority = Math.max(priority, 2);
    notes.push("associated with an earlier structure break at this price");
  }

  const run = displacementAwayFromPool(pool, ctx);
  if (run >= 0.5 * atr) {
    priority = Math.max(priority, 2);
    notes.push(`held and released a ${run.toFixed(1)} pt move — protected a significant swing`);
  }

  if (ctx.dealingRange) {
    const { high, low, source } = ctx.dealingRange;
    const pad = 0.15 * atr;
    const atEdge = Math.abs(pool.level - high) <= pad || Math.abs(pool.level - low) <= pad;
    const inside = pool.level <= high + pad && pool.level >= low - pad;
    if (atEdge) {
      priority = Math.max(priority, 2);
      notes.push(`at the edge of the ${source}`);
    } else if (inside) {
      priority = Math.max(priority, 1);
      notes.push(`inside the ${source}`);
    }
  }

  const passGate = priority >= 2;
  const note = notes.length
    ? notes.join("; ") + "."
    : "No meaningful structural relevance (not a range extreme, BOS/MSS, or held displacement).";
  return {
    factor: passGate ? pass(note) : fail(note),
    note,
    priority,
  };
}

function evaluatePoolPairs(
  pool: ClassifiableEqhEqlPool,
  ctx: ImportanceContext
): PairEvaluation {
  const ordered = [...pool.swings].sort((a, b) => a.barIndex - b.barIndex);
  const left = ordered[0]!;
  const right = ordered.at(-1)!;
  const base = {
    kind: pool.kind,
    bars: ctx.bars,
    atr: ctx.atr,
    tickSize: ctx.tickSize,
    allSame: pool.swings,
  } as const;
  let accepted: PairEvaluation | null = null;
  for (let i = 0; i < ordered.length - 1; i++) {
    const ev = evaluateSwingPair({
      ...base,
      left: ordered[i]!,
      right: ordered[i + 1]!,
      minGap: 1,
    });
    if (ev.accept) accepted = ev;
  }
  if (accepted) return accepted;
  return evaluateSwingPair({
    ...base,
    left,
    right,
    minGap: 8,
  });
}

function primingClause(pool: ClassifiableEqhEqlPool): string {
  const ordered = [...pool.swings].sort((a, b) => a.barTime - b.barTime);
  if (ordered.length < 2) return "";
  const left = ordered[0]!;
  const right = ordered[ordered.length - 1]!;
  if (pool.kind === "eqh" && left.price > right.price + 1e-9) {
    return " Left high slightly above right (ICT priming).";
  }
  if (pool.kind === "eql" && left.price < right.price - 1e-9) {
    return " Left low slightly below right (ICT failure swing).";
  }
  return "";
}

function composeWhy(
  importance: EqhEqlImportance,
  pool: ClassifiableEqhEqlPool,
  visualClass: VisualObviousness,
  lifecycle: EqhEqlLifecycle,
  structuralNote: string,
  relativeNote: string,
  priming: string
): string {
  const side = pool.kind === "eqh" ? "Buy-side" : "Sell-side";
  const n = pool.swings.length;
  const noun = pool.kind === "eqh" ? "highs" : "lows";
  const area = `${pool.range.low.toFixed(2)}–${pool.range.high.toFixed(2)}`;
  const vis =
    visualClass === "A"
      ? `A trader would mark this horizontal (${n} confirmed meaningful swing ${noun})`
      : visualClass === "B"
        ? "Minor internal fluctuations, not obvious resting liquidity"
        : visualClass === "C"
          ? "Isolated swing, not a repeated pool"
          : "Overlapping structural levels, not a clean repeated pool";
  const life =
    lifecycle === "ACTIVE"
      ? "Still unswept"
      : lifecycle === "SWEPT"
        ? "Already swept — preserved as history, not current resting liquidity"
        : "No longer relevant to the current dealing range";
  const struct =
    structuralNote.length > 0
      ? structuralNote.charAt(0).toUpperCase() + structuralNote.slice(1)
      : structuralNote;
  return (
    `${importance}: ${side} liquidity area ${area}. ${vis}. ${life}. ` +
    `${struct} ${relativeNote}${priming}`
  ).replace(/\s+/g, " ").trim();
}

function decideImportance(input: {
  visualClass: VisualObviousness;
  lifecycle: EqhEqlLifecycle;
  tests: EqhEqlImportanceFactors;
  structuralPriority: number;
}): EqhEqlImportance {
  const { visualClass, lifecycle, tests, structuralPriority } = input;
  if (visualClass !== "A") return "LOW";
  if (!tests.confirmedSwing.score || !tests.meaningfulVsPa.score || !tests.genuineReturn.score) {
    return "LOW";
  }
  if (!tests.visualRecognition.score || !tests.clearPoolVsNoise.score) return "LOW";
  if (lifecycle === "INVALIDATED") return structuralPriority >= 2 ? "MEDIUM" : "LOW";
  if (lifecycle === "SWEPT") return "MEDIUM";
  if (structuralPriority >= 2 && tests.actionableAtT.score) return "HIGH";
  if (tests.actionableAtT.score) return "MEDIUM";
  return "LOW";
}

export function classifyEqhEqlPool(
  pool: ClassifiableEqhEqlPool,
  ctx: ImportanceContext,
  whyDetection = ""
): EqhEqlClassification {
  const lifecycle = mapEqhEqlLifecycle(pool.status);
  const tf = timeframeAndSession(pool, ctx);
  const pair = evaluatePoolPairs(pool, ctx);
  const floor = meaningfulProminenceFloor(ctx.atr, ctx.tickSize);
  const weak = pool.swings.filter((s) => s.prominence + 1e-9 < floor).length;
  const visualClass: VisualObviousness =
    pair.accept && weak < pool.swings.length - 1 ? "A" : pair.visualClass;
  const struct = structuralRelevance(pool, ctx);
  const alreadySwept =
    lifecycle === "SWEPT"
      ? fail("Already swept — keep the area and swings; it is not current resting liquidity.")
      : pass("Still unswept at T.");
  const actionableAtT =
    lifecycle === "ACTIVE"
      ? pass("Still actionable/relevant at T as resting liquidity.")
      : fail(
          lifecycle === "SWEPT"
            ? "Swept — historical liquidity, not an active rest."
            : "Not actionable at T."
        );

  const factors: EqhEqlImportanceFactors = {
    confirmedSwing: pair.tests.confirmedSwing,
    meaningfulVsPa: pair.tests.meaningfulVsPa,
    genuineReturn: pair.tests.genuineReturn,
    visualRecognition: pair.tests.visualRecognition,
    clearPoolVsNoise:
      visualClass === "A"
        ? pass("Clear pool vs random noise — visual class A.")
        : pair.tests.clearPoolVsNoise,
    alreadySwept,
    relevantStructure: struct.factor,
    actionableAtT,
    relativeEquality: pair.tests.relativeEquality,
    visualClass: {
      score: visualClass === "A" ? 1 : 0,
      note:
        visualClass === "A"
          ? "Visual class A — obvious repeated highs/lows a trader would mark."
          : visualClass === "B"
            ? "Visual class B — minor internal fluctuations."
            : visualClass === "C"
              ? "Visual class C — isolated swing."
              : "Visual class D — overlapping structural levels.",
    },
  };

  const importance = decideImportance({
    visualClass,
    lifecycle,
    tests: factors,
    structuralPriority: struct.priority,
  });
  const priming = primingClause(pool);
  const sweepReaction = measureSweepReaction(pool, ctx);
  const signed =
    pool.kind === "eqh" ? pool.level - ctx.currentPrice : ctx.currentPrice - pool.level;
  const confidence = importance === "HIGH" ? 0.85 : importance === "MEDIUM" ? 0.6 : 0.35;

  return {
    liquidityType: pool.kind === "eqh" ? "EQH" : "EQL",
    importance,
    score: rankTokenFromImportance(importance),
    confidence,
    lifecycle,
    timeframeContext: tf.timeframeContext,
    sessionContext: tf.sessionContext,
    sessionLabel: tf.sessionLabel,
    distanceFromPrice: Math.round(signed / ctx.tickSize) * ctx.tickSize,
    distanceAbs: Math.abs(Math.round(signed / ctx.tickSize) * ctx.tickSize),
    factors,
    why: composeWhy(
      importance,
      pool,
      visualClass,
      lifecycle,
      struct.note,
      pair.tests.relativeEquality.note,
      priming
    ),
    whyDetection,
    sweepReaction,
    visualClass,
    structuralContext: `${struct.note} ${tf.note}`.trim(),
    whyNotNearby: "",
    structuralPriority: struct.priority,
  };
}

export function formatFactorBreakdown(factors: EqhEqlImportanceFactors): string[] {
  return STRUCTURAL_TEST_ORDER.map((k) => {
    const f = factors[k];
    const gate = k === "relativeEquality" || k === "visualClass" ? "supporting" : "gate";
    const mark = f.score ? "PASS" : "FAIL";
    return `${k}: ${mark} (${gate}) — ${f.note}`;
  });
}

export function contrastNearbyWhy(input: {
  kind: "eqh" | "eql";
  level: number;
  why: string;
  rejected: RejectedEqhEql[];
  otherAccepted: Array<{ kind: "eqh" | "eql"; level: number; why: string }>;
  atr: number;
}): string {
  const band = Math.max(input.atr * 0.5, 8);
  const nearbyRej = input.rejected.filter(
    (r) => r.kind === input.kind && r.prices.some((p) => Math.abs(p - input.level) <= band + 1e-9)
  );
  const nearestRej = nearbyRej.sort((a, b) => {
    const da = Math.min(...a.prices.map((p) => Math.abs(p - input.level)));
    const db = Math.min(...b.prices.map((p) => Math.abs(p - input.level)));
    return da - db;
  })[0];
  if (nearestRej) {
    const px = nearestRej.prices.map((p) => p.toFixed(2)).join("/");
    return `This area is meaningful because it is a class-A shelf. Nearby ${px} is not: ${nearestRej.why}`;
  }
  const nearbyAcc = input.otherAccepted.filter(
    (o) => o.kind === input.kind && Math.abs(o.level - input.level) > 1e-9 && Math.abs(o.level - input.level) <= band
  )[0];
  if (nearbyAcc) {
    return `This area is a separate shelf from ${nearbyAcc.level.toFixed(2)} — not the same pool. ${nearbyAcc.why}`;
  }
  return "No nearby similar high/low was rejected in this window; confidence stays conservative if contrast is thin.";
}

/**
 * If two class-A areas sit near each other, only the more structural one may stay HIGH.
 * If HIGH cannot explain itself versus a nearby equal, drop to MEDIUM.
 */
export function applyLiquidityContrasts<
  T extends {
    kind: "eqh" | "eql";
    level: number;
    why: string;
    importance: EqhEqlImportance;
    visualClass: VisualObviousness;
    structuralPriority: number;
    whyNotNearby: string;
    confidence: number;
    score: number;
  },
>(pools: T[], rejected: RejectedEqhEql[], atr: number): T[] {
  return pools.map((p, i) => {
    const whyNotNearby = contrastNearbyWhy({
      kind: p.kind,
      level: p.level,
      why: p.why,
      rejected,
      otherAccepted: pools.filter((_, j) => j !== i),
      atr,
    });
    let importance = p.importance;
    if (importance === "HIGH") {
      const band = Math.max(atr * 0.25, 4);
      const rival = pools.find(
        (o, j) =>
          j !== i &&
          o.kind === p.kind &&
          o.visualClass === "A" &&
          Math.abs(o.level - p.level) <= band &&
          o.structuralPriority > p.structuralPriority
      );
      if (rival) {
        importance = "MEDIUM";
      }
      const canExplain = /nearby/i.test(whyNotNearby) && !/contrast is thin/i.test(whyNotNearby);
      const hasRivalRejected = /is not:/i.test(whyNotNearby);
      if (!canExplain && !hasRivalRejected && rival) {
        importance = "MEDIUM";
      }
    }
    return {
      ...p,
      whyNotNearby,
      importance,
      score: rankTokenFromImportance(importance),
      confidence: importance === "HIGH" ? 0.85 : importance === "MEDIUM" ? 0.6 : 0.35,
      why: p.why.replace(/^(HIGH|MEDIUM|LOW):/, `${importance}:`),
    };
  });
}
