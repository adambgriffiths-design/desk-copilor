import type { Bar } from "./types";
import type { MarketContext } from "./types";
import {
  getEstDateKey,
  getEstMinutes,
  findBarClosestTo,
  formatEst,
} from "./market-data";
import type { FeedbackRating } from "./feedback-types";
import { parseConfidence } from "./parse-confidence";

export type VerdictDirection = "buy" | "sell" | "stand_aside" | "unknown";

/** NY AM training checkpoints (minutes from midnight EST). */
export const NY_AM_MOMENTS = [
  9 * 60 + 35,
  9 * 60 + 45,
  9 * 60 + 55,
  10 * 60 + 5,
  10 * 60 + 20,
  10 * 60 + 40,
];

const NY_AM_END = 11 * 60;

export type BacktestMoment = {
  dateKey: string;
  asOf: Date;
  chartTimeEst: string;
  bar: Bar;
};

export type GradeEventType =
  | "thesis_confirmed"
  | "invalidation"
  | "opposing_belief"
  | "session_end"
  | "no_resolution";

export type GradeEvent = {
  type: GradeEventType;
  barIndex: number;
  detail: string;
};

export type ForwardWindow = {
  bars: Bar[];
  endReason: string;
};

export function parseVerdictDirection(verdict: string): VerdictDirection {
  const metaCall = verdict.match(
    /META:[^\n]*call=(potential buy|potential sell|stand aside)/i
  );
  if (metaCall) {
    const c = metaCall[1].toLowerCase();
    if (c === "potential buy") return "buy";
    if (c === "potential sell") return "sell";
    return "stand_aside";
  }

  const text = verdict.toLowerCase();

  if (
    /stand aside|no trade|no setup|avoid|wait|chop|consolidation/i.test(text) &&
    !/potential buy|potential sell|potential long|potential short/i.test(text)
  ) {
    return "stand_aside";
  }

  const buyScore =
    (/\bpotential buy\b/i.test(verdict) ? 2 : 0) +
    (/\bpotential long\b/i.test(verdict) ? 2 : 0) +
    (/\bbullish\b/i.test(text) && !/\bbearish\b/i.test(text) ? 1 : 0);

  const sellScore =
    (/\bpotential sell\b/i.test(verdict) ? 2 : 0) +
    (/\bpotential short\b/i.test(verdict) ? 2 : 0) +
    (/\bbearish\b/i.test(text) && !/\bbullish\b/i.test(text) ? 1 : 0);

  if (buyScore > sellScore && buyScore >= 2) return "buy";
  if (sellScore > buyScore && sellScore >= 2) return "sell";
  if (buyScore > 0 && sellScore > 0) return "unknown";
  if (buyScore > 0) return "buy";
  if (sellScore > 0) return "sell";

  return "unknown";
}

export function discoverNyAmMoments(m1: Bar[]): BacktestMoment[] {
  const byDate = new Map<string, Bar[]>();
  for (const bar of m1) {
    const key = getEstDateKey(bar.time);
    const mins = getEstMinutes(bar.time);
    if (mins < 9 * 60 + 30 || mins >= NY_AM_END) continue;
    const list = byDate.get(key) ?? [];
    list.push(bar);
    byDate.set(key, list);
  }

  const moments: BacktestMoment[] = [];
  for (const [dateKey, dayBars] of byDate) {
    for (const targetMin of NY_AM_MOMENTS) {
      const bar = findBarClosestTo(dayBars, targetMin, dateKey);
      if (!bar) continue;
      moments.push({
        dateKey,
        asOf: bar.time,
        chartTimeEst: formatEst(bar.time),
        bar,
      });
    }
  }

  return moments.sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
}

/** Forward bars until NY AM session end — not a fixed bar count. */
export function getForwardWindow(m1: Bar[], from: Bar, dateKey: string): ForwardWindow {
  const idx = m1.findIndex((b) => b.time.getTime() === from.time.getTime());
  if (idx < 0) return { bars: [], endReason: "entry not found" };

  const bars: Bar[] = [];
  for (let i = idx + 1; i < m1.length; i++) {
    const bar = m1[i];
    if (getEstDateKey(bar.time) !== dateKey) break;
    if (getEstMinutes(bar.time) >= NY_AM_END) break;
    bars.push(bar);
  }

  return {
    bars,
    endReason: bars.length ? "ny_am_session_end" : "no_forward_bars",
  };
}

function swingLevels(priorBars: Bar[]): { high: number; low: number } {
  // Exclude last 2 bars before entry — avoids micro-swing that confirms on bar 1 noise
  const core = priorBars.length > 4 ? priorBars.slice(0, -2) : priorBars;
  const lookback = core.slice(-18);
  if (lookback.length === 0) return { high: 0, low: 0 };
  return {
    high: Math.max(...lookback.map((b) => b.high)),
    low: Math.min(...lookback.map((b) => b.low)),
  };
}

function favorableMove(direction: VerdictDirection, entryPrice: number, close: number): number {
  if (direction === "buy") return close - entryPrice;
  if (direction === "sell") return entryPrice - close;
  return 0;
}

function detectDisplacement(bars: Bar[], startIdx: number): GradeEvent | null {
  for (let i = startIdx; i < bars.length - 2; i++) {
    const b1 = bars[i];
    const b2 = bars[i + 1];
    const b3 = bars[i + 2];
    const bull =
      b1.close >= b1.open && b2.close >= b2.open && b3.close >= b3.open && b3.close > b1.open;
    const bear =
      b1.close < b1.open && b2.close < b2.open && b3.close < b3.open && b3.close < b1.open;
    if (bull) {
      return {
        type: "opposing_belief",
        barIndex: i + 2,
        detail: `Bullish displacement (3 candles, higher close) — directional move while standing aside`,
      };
    }
    if (bear) {
      return {
        type: "opposing_belief",
        barIndex: i + 2,
        detail: `Bearish displacement (3 candles, lower close) — directional move while standing aside`,
      };
    }
  }
  return null;
}

function directionCorrect(
  direction: VerdictDirection,
  entryPrice: number,
  close: number
): boolean | null {
  if (direction === "buy") {
    if (close > entryPrice) return true;
    if (close < entryPrice) return false;
    return null;
  }
  if (direction === "sell") {
    if (close < entryPrice) return true;
    if (close > entryPrice) return false;
    return null;
  }
  return null;
}

export function scanForGradeEvent(input: {
  forwardBars: Bar[];
  priorBars: Bar[];
  entryPrice: number;
  direction: VerdictDirection;
  ctx: MarketContext;
  verdict: string;
}): GradeEvent {
  const { forwardBars, priorBars, entryPrice, direction, ctx, verdict } = input;
  const swing = swingLevels(priorBars);
  const ce = ctx.org?.ce;
  const text = verdict.toLowerCase();

  if (forwardBars.length === 0) {
    return { type: "no_resolution", barIndex: -1, detail: "No forward bars in session" };
  }

  for (let i = 0; i < forwardBars.length; i++) {
    const bar = forwardBars[i];
    const close = bar.close;

    if (direction === "buy") {
      if (swing.low > 0 && close < swing.low) {
        return {
          type: "invalidation",
          barIndex: i,
          detail: `Bearish MSS — body close ${close.toFixed(1)} below swing low ${swing.low.toFixed(1)}`,
        };
      }
      if (ce && close < ce && /bullish|potential buy|potential long|ce|org/i.test(text)) {
        return {
          type: "opposing_belief",
          barIndex: i,
          detail: `Opposing read — bullish call but body closed below CE ${ce.toFixed(1)}`,
        };
      }
      if (swing.high > 0 && close > swing.high && close > entryPrice) {
        return {
          type: "thesis_confirmed",
          barIndex: i,
          detail: `Bullish MSS — body close ${close.toFixed(1)} above swing ${swing.high.toFixed(1)}, direction up vs entry`,
        };
      }
      if (ce && close >= ce && /ce|org|50%/i.test(text)) {
        return {
          type: "thesis_confirmed",
          barIndex: i,
          detail: `CE reached — body close ${close.toFixed(1)} at/through CE ${ce.toFixed(1)}`,
        };
      }
    } else if (direction === "sell") {
      if (swing.high > 0 && close > swing.high) {
        return {
          type: "invalidation",
          barIndex: i,
          detail: `Bullish MSS — body close ${close.toFixed(1)} above swing high ${swing.high.toFixed(1)}`,
        };
      }
      if (ce && close > ce && /bearish|potential sell|potential short|ce|org/i.test(text)) {
        return {
          type: "opposing_belief",
          barIndex: i,
          detail: `Opposing read — bearish call but body closed above CE ${ce.toFixed(1)}`,
        };
      }
      if (swing.low > 0 && close < swing.low && close < entryPrice) {
        return {
          type: "thesis_confirmed",
          barIndex: i,
          detail: `Bearish MSS — body close ${close.toFixed(1)} below swing ${swing.low.toFixed(1)}, direction down vs entry`,
        };
      }
    } else if (direction === "stand_aside" || direction === "unknown") {
      const disp = detectDisplacement(forwardBars, i);
      if (disp) return disp;
    }
  }

  return {
    type: "session_end",
    barIndex: forwardBars.length - 1,
    detail: `No invalidation/opposing signal before NY AM end (${forwardBars.length} bars)`,
  };
}

export type AutoGradeResult = {
  rating: FeedbackRating | "skipped";
  outcome: string;
  direction: VerdictDirection;
  netMove: number;
  event?: GradeEvent;
  windowBars: number;
  reason?: string;
};

export function gradeFromThesisEvents(
  verdict: string,
  direction: VerdictDirection,
  entryPrice: number,
  forwardBars: Bar[],
  priorBars: Bar[],
  ctx: MarketContext,
  opts?: { ignoreConfidence?: boolean }
): AutoGradeResult {
  const ignoreConfidence = opts?.ignoreConfidence !== false;

  if (!ignoreConfidence) {
    const confidence = parseConfidence(verdict);
    if (confidence === "low") {
      return {
        rating: "skipped",
        outcome: "Low confidence — not graded.",
        direction,
        netMove: 0,
        windowBars: 0,
        reason: "low_confidence",
      };
    }
  }

  if (forwardBars.length === 0) {
    return {
      rating: "skipped",
      outcome: "No forward bars until session end.",
      direction,
      netMove: 0,
      windowBars: 0,
      reason: "no_forward_bars",
    };
  }

  const event = scanForGradeEvent({
    forwardBars,
    priorBars,
    entryPrice,
    direction,
    ctx,
    verdict,
  });

  const endIdx = event.barIndex >= 0 ? event.barIndex : forwardBars.length - 1;
  const windowBars = forwardBars.slice(0, endIdx + 1);
  const lastClose = windowBars.at(-1)!.close;
  const netMove =
    direction === "buy"
      ? lastClose - entryPrice
      : direction === "sell"
        ? entryPrice - lastClose
        : (() => {
            const hi = Math.max(...windowBars.map((b) => b.high));
            const lo = Math.min(...windowBars.map((b) => b.low));
            const up = hi - entryPrice;
            const down = entryPrice - lo;
            return Math.max(up, down) * (up >= down ? 1 : -1);
          })();

  const outcome = `[${event.type} @ bar ${event.barIndex + 1}/${forwardBars.length}] ${event.detail} — net ${netMove >= 0 ? "+" : ""}${netMove.toFixed(1)} pts at event`;

  if (direction === "stand_aside" || direction === "unknown") {
    if (event.type === "opposing_belief") {
      return {
        rating: "skipped",
        outcome: `${outcome} — move after stand aside (miss, not a failure).`,
        direction,
        netMove,
        event,
        windowBars: windowBars.length,
        reason: "miss",
      };
    }
    if (event.type === "session_end" || event.type === "no_resolution") {
      const sessionClose = forwardBars.at(-1)!.close;
      const up = sessionClose > entryPrice;
      const down = sessionClose < entryPrice;
      return {
        rating: "correct",
        outcome: `${outcome} — no displacement; session close ${up ? "above" : down ? "below" : "at"} entry (chop)`,
        direction,
        netMove,
        event,
        windowBars: forwardBars.length,
      };
    }
  }

  if (event.type === "thesis_confirmed") {
    return { rating: "correct", outcome, direction, netMove, event, windowBars: windowBars.length };
  }
  if (event.type === "invalidation" || event.type === "opposing_belief") {
    return { rating: "wrong", outcome, direction, netMove, event, windowBars: windowBars.length };
  }

  // Session end — direction only, no fixed point thresholds
  const sessionClose = forwardBars.at(-1)!.close;
  const dirOk = directionCorrect(direction, entryPrice, sessionClose);
  if (dirOk === true) {
    return { rating: "correct", outcome, direction, netMove, event, windowBars: forwardBars.length };
  }
  if (dirOk === false) {
    return { rating: "wrong", outcome, direction, netMove, event, windowBars: forwardBars.length };
  }
  return { rating: "partial", outcome, direction, netMove, event, windowBars: forwardBars.length };
}

/** @deprecated use getForwardWindow */
export function getForwardBars(m1: Bar[], from: Bar, count: number): Bar[] {
  const idx = m1.findIndex((b) => b.time.getTime() === from.time.getTime());
  if (idx < 0) return [];
  return m1.slice(idx + 1, idx + 1 + count);
}

/** @deprecated use gradeFromThesisEvents */
export function gradeFromForwardBars(
  verdict: string,
  direction: VerdictDirection,
  entryPrice: number,
  forwardBars: Bar[],
  opts?: { ignoreConfidence?: boolean; targetPts?: number; partialPts?: number; stopPts?: number }
): AutoGradeResult {
  return gradeFromThesisEvents(verdict, direction, entryPrice, forwardBars, [], {} as MarketContext, opts);
}
