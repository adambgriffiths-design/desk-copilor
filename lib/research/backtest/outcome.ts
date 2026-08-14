import type { ReplayDirection } from "../replay/types";
import type { Bar } from "../../types";
import type { BacktestOutcome } from "./types";

export type BacktestOutcomeResult = {
  outcome: BacktestOutcome;
  mfe: number;
  mae: number;
  targetHit: boolean;
  stopHit: boolean;
  whichFirst: "target" | "stop" | "neither" | "ambiguous";
  ambiguity: boolean;
  barsHeld: number;
  timeHeldMs: number;
  resultR: number;
};

/**
 * Outcome evaluator — runs ONLY on bars strictly after entry is locked.
 * If target+stop hit same candle without intrabar order → AMBIGUOUS (no invented order).
 */
export function evaluateSetupOutcome(input: {
  direction: ReplayDirection;
  entry: number;
  stop: number;
  target: number;
  entryBarIndex: number;
  forwardBars: Bar[];
}): BacktestOutcomeResult {
  const { direction, entry, stop, target, entryBarIndex, forwardBars } = input;

  if (direction === "WAIT") {
    return emptyOutcome(forwardBars, entryBarIndex);
  }

  const risk = Math.abs(entry - stop);
  if (risk <= 0) {
    return { ...emptyOutcome(forwardBars, entryBarIndex), outcome: "NEUTRAL", resultR: 0 };
  }

  let mfe = 0;
  let mae = 0;
  let targetHit = false;
  let stopHit = false;
  let whichFirst: BacktestOutcomeResult["whichFirst"] = "neither";
  let ambiguity = false;
  let barsHeld = 0;
  let timeHeldMs = 0;
  let outcome: BacktestOutcome = "OPEN";

  for (let i = 0; i < forwardBars.length; i++) {
    const bar = forwardBars[i]!;
    barsHeld = i + 1;
    timeHeldMs = bar.time.getTime() - forwardBars[0]!.time.getTime();

    const fav =
      direction === "LONG"
        ? Math.max(bar.high - entry, bar.close - entry)
        : Math.max(entry - bar.low, entry - bar.close);
    const adv =
      direction === "LONG"
        ? Math.max(entry - bar.low, entry - bar.close)
        : Math.max(bar.high - entry, bar.close - entry);
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);

    const hitTarget =
      direction === "LONG" ? bar.high >= target : bar.low <= target;
    const hitStop = direction === "LONG" ? bar.low <= stop : bar.high >= stop;

    if (whichFirst === "neither") {
      if (hitTarget && hitStop) {
        whichFirst = "ambiguous";
        targetHit = true;
        stopHit = true;
        ambiguity = true;
        outcome = "AMBIGUOUS";
        break;
      }
      if (hitTarget) {
        whichFirst = "target";
        targetHit = true;
        outcome = "WIN";
        break;
      }
      if (hitStop) {
        whichFirst = "stop";
        stopHit = true;
        outcome = "LOSS";
        break;
      }
    }
  }

  if (outcome === "OPEN" && forwardBars.length === 0) {
    outcome = "NEUTRAL";
  } else if (outcome === "OPEN") {
    outcome = "NEUTRAL";
  }

  const reward =
    direction === "LONG" ? target - entry : entry - target;
  let resultR = 0;
  if (outcome === "WIN") resultR = reward / risk;
  else if (outcome === "LOSS") resultR = -1;
  else if (outcome === "AMBIGUOUS") resultR = 0;

  return {
    outcome,
    mfe: round2(mfe),
    mae: round2(mae),
    targetHit,
    stopHit,
    whichFirst,
    ambiguity,
    barsHeld,
    timeHeldMs,
    resultR: round2(resultR),
  };
}

function emptyOutcome(forwardBars: Bar[], _entryBarIndex: number): BacktestOutcomeResult {
  return {
    outcome: "NEUTRAL",
    mfe: 0,
    mae: 0,
    targetHit: false,
    stopHit: false,
    whichFirst: "neither",
    ambiguity: false,
    barsHeld: forwardBars.length,
    timeHeldMs: forwardBars.length
      ? forwardBars.at(-1)!.time.getTime() - forwardBars[0]!.time.getTime()
      : 0,
    resultR: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bars strictly after entry bar index within full m1 series. */
export function forwardBarsFromIndex(allM1: Bar[], afterIndex: number, maxBars?: number): Bar[] {
  const fwd = allM1.slice(afterIndex + 1);
  return maxBars != null ? fwd.slice(0, maxBars) : fwd;
}
