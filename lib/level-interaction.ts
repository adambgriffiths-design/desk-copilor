/**
 * Named PD / session level interaction — data layer only.
 *
 * Intended PD sweep semantics (existing detectLiquiditySweeps, unchanged):
 *   buy-side CLOSED_BEYOND = 1m close > level AND high >= level
 *   sell-side CLOSED_BEYOND = 1m close < level AND low <= level
 * Wick-through without a body close is BREACHED, not taken.
 * EQH/EQL "SWEPT" (wick) is a different detector — do not collapse the two.
 */
import type { Bar } from "./types";
import { formatEst } from "./market-data";

export const NQ_TICK_SIZE = 0.25;

export type NamedLevelStatus =
  | "UNTOUCHED"
  | "TESTED"
  | "TOUCHED"
  | "BREACHED"
  | "SWEPT"
  | "CLOSED_BEYOND"
  | "INVALIDATED";

export type QualifyingTick = {
  timestamp: number;
  price: number;
  candleId: string;
  atLabel: string;
};

export type LevelInteraction = {
  levelId: string;
  side: "high" | "low";
  status: NamedLevelStatus;
  qualifyingTick?: QualifyingTick;
  why: string;
};

export type PdhProvenanceBlock = {
  karenStatement: string;
  pdh: number;
  pdhStatus: NamedLevelStatus;
  currentPrice: number;
  qualifyingTick: string;
  marketSnapshot: string;
  evidence: string;
  confidence: "high" | "unproven";
};

const EPS = 1e-9;

function candleId(bar: Bar): string {
  return `m1:${Math.floor(bar.time.getTime() / 1000)}`;
}

function rank(status: NamedLevelStatus): number {
  switch (status) {
    case "CLOSED_BEYOND":
      return 6;
    case "SWEPT":
      return 5;
    case "BREACHED":
      return 4;
    case "TOUCHED":
      return 3;
    case "TESTED":
      return 2;
    case "UNTOUCHED":
      return 1;
    default:
      return 0;
  }
}

/** Classify one external PD/session level from 1m OHLC. Lookback matches detectLiquiditySweeps (40). */
export function classifyLevelInteraction(
  m1: Bar[],
  level: { id: string; price: number },
  side: "high" | "low",
  lookback = 40
): LevelInteraction {
  const recent = m1.slice(-lookback);
  let status: NamedLevelStatus = "UNTOUCHED";
  let qualifyingTick: QualifyingTick | undefined;
  let why = `No 1m interaction with ${level.id} ${level.price.toFixed(2)} in last ${lookback} bars.`;

  for (const bar of recent) {
    const t = Math.floor(bar.time.getTime() / 1000);
    const atLabel = formatEst(bar.time);
    if (side === "high") {
      const closedBeyond = bar.close > level.price && bar.high >= level.price;
      const breached = bar.high > level.price + EPS;
      const touched = bar.high + EPS >= level.price && bar.high <= level.price + EPS;
      const tested = bar.high + EPS >= level.price - NQ_TICK_SIZE && bar.high < level.price - EPS;
      let next: NamedLevelStatus = "UNTOUCHED";
      if (closedBeyond) next = "CLOSED_BEYOND";
      else if (breached) next = "BREACHED";
      else if (touched) next = "TOUCHED";
      else if (tested) next = "TESTED";
      if (rank(next) > rank(status)) {
        status = next;
        qualifyingTick = {
          timestamp: t,
          price: closedBeyond ? bar.close : bar.high,
          candleId: candleId(bar),
          atLabel,
        };
        why =
          next === "CLOSED_BEYOND"
            ? `1m body close ${bar.close.toFixed(2)} > ${level.price.toFixed(2)} at ${atLabel} (${candleId(bar)}).`
            : next === "BREACHED"
              ? `1m high ${bar.high.toFixed(2)} traded through ${level.price.toFixed(2)} without close beyond at ${atLabel}.`
              : next === "TOUCHED"
                ? `1m high tagged ${level.price.toFixed(2)} at ${atLabel}.`
                : `1m high ${bar.high.toFixed(2)} stopped 1 tick below ${level.price.toFixed(2)} at ${atLabel}.`;
      }
    } else {
      const closedBeyond = bar.close < level.price && bar.low <= level.price;
      const breached = bar.low < level.price - EPS;
      const touched = bar.low - EPS <= level.price && bar.low >= level.price - EPS;
      const tested = bar.low - EPS <= level.price + NQ_TICK_SIZE && bar.low > level.price + EPS;
      let next: NamedLevelStatus = "UNTOUCHED";
      if (closedBeyond) next = "CLOSED_BEYOND";
      else if (breached) next = "BREACHED";
      else if (touched) next = "TOUCHED";
      else if (tested) next = "TESTED";
      if (rank(next) > rank(status)) {
        status = next;
        qualifyingTick = {
          timestamp: t,
          price: closedBeyond ? bar.close : bar.low,
          candleId: candleId(bar),
          atLabel,
        };
        why =
          next === "CLOSED_BEYOND"
            ? `1m body close ${bar.close.toFixed(2)} < ${level.price.toFixed(2)} at ${atLabel} (${candleId(bar)}).`
            : next === "BREACHED"
              ? `1m low ${bar.low.toFixed(2)} traded through ${level.price.toFixed(2)} without close beyond at ${atLabel}.`
              : next === "TOUCHED"
                ? `1m low tagged ${level.price.toFixed(2)} at ${atLabel}.`
                : `1m low ${bar.low.toFixed(2)} stopped 1 tick above ${level.price.toFixed(2)} at ${atLabel}.`;
      }
    }
  }

  return { levelId: level.id, side, status, qualifyingTick, why };
}

/**
 * PDC / reference close — bidirectional body-close semantics without sweep-pool inclusion.
 * Requires the bar range to tag the level; bars entirely on one side are UNTOUCHED.
 */
export function classifyReferenceCloseInteraction(
  m1: Bar[],
  level: { id: string; price: number },
  lookback = 40
): LevelInteraction {
  const recent = m1.slice(-lookback);
  let status: NamedLevelStatus = "UNTOUCHED";
  let qualifyingTick: QualifyingTick | undefined;
  let why = `No 1m interaction with ${level.id} ${level.price.toFixed(2)} in last ${lookback} bars.`;
  const p = level.price;

  for (const bar of recent) {
    const tagsLevel = bar.low <= p + EPS && bar.high >= p - EPS;
    if (!tagsLevel) continue;

    const t = Math.floor(bar.time.getTime() / 1000);
    const atLabel = formatEst(bar.time);
    let next: NamedLevelStatus = "UNTOUCHED";

    if (bar.close > p + EPS) {
      next = "CLOSED_BEYOND";
    } else if (bar.close < p - EPS) {
      next = bar.high > p + EPS ? "BREACHED" : bar.low < p - EPS ? "CLOSED_BEYOND" : "TOUCHED";
    } else if (bar.high > p + EPS || bar.low < p - EPS) {
      next = "BREACHED";
    } else {
      next = "TOUCHED";
    }

    if (rank(next) > rank(status)) {
      status = next;
      qualifyingTick = {
        timestamp: t,
        price: next === "CLOSED_BEYOND" ? bar.close : next === "BREACHED" ? (bar.close > p ? bar.low : bar.high) : bar.close,
        candleId: candleId(bar),
        atLabel,
      };
      why =
        next === "CLOSED_BEYOND"
          ? bar.close > p
            ? `1m body close ${bar.close.toFixed(2)} > ${p.toFixed(2)} at ${atLabel} (${candleId(bar)}).`
            : `1m body close ${bar.close.toFixed(2)} < ${p.toFixed(2)} at ${atLabel} (${candleId(bar)}).`
          : next === "BREACHED"
            ? `1m wick through ${p.toFixed(2)} without body close beyond at ${atLabel}.`
            : next === "TOUCHED"
              ? `1m bar tagged ${p.toFixed(2)} at ${atLabel}.`
              : why;
    }
  }

  return { levelId: level.id, side: "high", status, qualifyingTick, why };
}

/** @deprecated Use classifyReferenceCloseInteraction for PDC; kept for PDH/PDL one-sided tests. */
export function classifyBidirectionalLevelInteraction(
  m1: Bar[],
  level: { id: string; price: number },
  lookback = 40
): LevelInteraction {
  if (level.id === "pdc") return classifyReferenceCloseInteraction(m1, level, lookback);
  const high = classifyLevelInteraction(m1, level, "high", lookback);
  const low = classifyLevelInteraction(m1, level, "low", lookback);
  return rank(high.status) >= rank(low.status) ? high : low;
}

/** Existing intended "taken" = body close beyond. Not wick, not touch, not unproven source. */
export function isQualifyingTaken(status: NamedLevelStatus): boolean {
  return status === "CLOSED_BEYOND";
}

export function formatPdhProvenanceBlock(input: {
  pdh: number;
  status: NamedLevelStatus;
  currentPrice: number;
  qualifyingTick?: QualifyingTick;
  snapshotId?: string;
  snapshotAt?: string;
  evidence?: string;
  canProveTaken: boolean;
}): string {
  const statement = input.canProveTaken ? "PDH was taken" : "PDH was not confirmed taken";
  const tick =
    input.qualifyingTick != null
      ? `${new Date(input.qualifyingTick.timestamp * 1000).toISOString()} + ${input.qualifyingTick.price.toFixed(2)}`
      : "none";
  const snap =
    input.snapshotId && input.snapshotAt
      ? `${input.snapshotId} / ${input.snapshotAt}`
      : "unavailable";
  const evidence = input.evidence || input.qualifyingTick?.candleId || "none";
  const confidence = input.canProveTaken ? "high" : "unproven";
  return [
    "Karen statement:",
    statement,
    "",
    "PDH:",
    input.pdh.toFixed(2),
    "",
    "PDH status:",
    input.status,
    "",
    "Current price:",
    input.currentPrice.toFixed(2),
    "",
    "Qualifying tick:",
    tick,
    "",
    "Market snapshot:",
    snap,
    "",
    "Evidence:",
    evidence,
    "",
    "Confidence:",
    confidence,
  ].join("\n");
}

export function canProvePdhTaken(input: {
  status: NamedLevelStatus;
  pdhSource?: string;
  qualifyingTick?: QualifyingTick;
  dataQuality?: string;
}): boolean {
  if (input.dataQuality === "missing" || input.dataQuality === "stale") return false;
  if (input.pdhSource && input.pdhSource !== "cme_session_1m") return false;
  if (!isQualifyingTaken(input.status)) return false;
  if (!input.qualifyingTick?.timestamp || !Number.isFinite(input.qualifyingTick.price)) return false;
  if (!input.qualifyingTick.candleId) return false;
  return true;
}
