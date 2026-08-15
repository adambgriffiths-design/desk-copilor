import type { Bar, FirstPresentedFvgResult, FvgZone } from "./types";
import type { SessionId } from "./sessions";
import {
  barsInEstWindow,
  formatEst,
  getEstDateKey,
  getEstMinutes,
} from "./market-data";

const MIN_GAP_POINTS = 3;

const NY_OPEN = 9 * 60 + 30;
const NY_OPENING_END = 10 * 60;
const FHDR_END = 10 * 60 + 30;

type SessionOpenSpec = {
  id: SessionId;
  label: string;
  openMinutes: number;
  windowMinutes: number;
  /** Middle candle must not be the session-open bar (NY AM rule). */
  middleNotOpenBar?: boolean;
};

const SESSION_OPENS: SessionOpenSpec[] = [
  { id: "asia", label: "Asia", openMinutes: 20 * 60, windowMinutes: 30 },
  { id: "london", label: "London", openMinutes: 3 * 60, windowMinutes: 30 },
  {
    id: "ny_am",
    label: "New York AM",
    openMinutes: NY_OPEN,
    windowMinutes: 30,
    middleNotOpenBar: true,
  },
  { id: "ny_pm", label: "New York PM", openMinutes: 13 * 60 + 30, windowMinutes: 30 },
];

export function isGapFilled(
  bars: Bar[],
  fromIndex: number,
  bottom: number,
  top: number
): boolean {
  const lo = Math.min(bottom, top);
  const hi = Math.max(bottom, top);
  if (hi - lo < 0.01) return true;
  for (let j = fromIndex + 1; j < bars.length; j++) {
    if (bars[j].low <= hi && bars[j].high >= lo) {
      if (bars[j].low <= lo && bars[j].high >= hi) return true;
      const overlap = Math.min(bars[j].high, hi) - Math.max(bars[j].low, lo);
      if (overlap >= (hi - lo) * 0.5) return true;
    }
  }
  return false;
}

function fvgAtIndex(bars: Bar[], i: number): Omit<FvgZone, "timeframe"> | null {
  if (i < 2 || i >= bars.length) return null;
  const c1 = bars[i - 2];
  const c3 = bars[i];

  if (c1.high < c3.low && c3.low - c1.high >= MIN_GAP_POINTS) {
    return {
      type: "bullish",
      top: c3.low,
      bottom: c1.high,
      formedAt: formatEst(c3.time),
      startTime: Math.floor(c3.time.getTime() / 1000),
    };
  }

  if (c1.low > c3.high && c1.low - c3.high >= MIN_GAP_POINTS) {
    return {
      type: "bearish",
      top: c1.low,
      bottom: c3.high,
      formedAt: formatEst(c3.time),
      startTime: Math.floor(c3.time.getTime() / 1000),
    };
  }

  return null;
}

function toFirstPresentedResult(
  bars: Bar[],
  index: number,
  raw: Omit<FvgZone, "timeframe">,
  variant: FirstPresentedFvgResult["variant"],
  sessionLabel: string,
  windowLabel: string
): FirstPresentedFvgResult {
  const lo = Math.min(raw.top, raw.bottom);
  const hi = Math.max(raw.top, raw.bottom);
  return {
    fvg: { ...raw, timeframe: "1m" },
    variant,
    sessionLabel,
    windowLabel,
    filled: isGapFilled(bars, index, lo, hi),
  };
}

function middleBarQualifies(
  middleBar: Bar,
  openMinutes: number,
  middleNotOpenBar?: boolean
): boolean {
  if (!middleNotOpenBar) return true;
  return getEstMinutes(middleBar.time) > openMinutes;
}

function firstFvgInWindow(
  bars: Bar[],
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
  variant: FirstPresentedFvgResult["variant"],
  sessionLabel: string,
  windowLabel: string,
  openMinutes?: number,
  middleNotOpenBar?: boolean
): FirstPresentedFvgResult | null {
  const dayBars = bars.filter((b) => getEstDateKey(b.time) === dateKey);
  if (dayBars.length < 3) return null;

  for (let i = 2; i < dayBars.length; i++) {
    const c2 = dayBars[i - 1];
    const c3 = dayBars[i];
    const c3Min = getEstMinutes(c3.time);
    if (c3Min < startMinutes || c3Min >= endMinutes) continue;
    if (openMinutes != null && !middleBarQualifies(c2, openMinutes, middleNotOpenBar)) {
      continue;
    }

    const raw = fvgAtIndex(dayBars, i);
    if (!raw) continue;

    const globalIndex = bars.indexOf(c3);
    if (globalIndex < 2) continue;
    return toFirstPresentedResult(bars, globalIndex, raw, variant, sessionLabel, windowLabel);
  }

  return null;
}

/** NY AM opening range: first 1m FVG after 9:30 within 9:30–10:00; middle candle not 9:30. */
export function detectNyOpeningFirstPresentedFvg(
  m1: Bar[],
  dateKey: string
): FirstPresentedFvgResult | null {
  return firstFvgInWindow(
    m1,
    dateKey,
    NY_OPEN,
    NY_OPENING_END,
    "ny_opening",
    "New York AM",
    "9:30–10:00 opening range",
    NY_OPEN,
    true
  );
}

function sessionOpenForId(sessionId: SessionId): SessionOpenSpec | undefined {
  return SESSION_OPENS.find((s) => s.id === sessionId);
}

/** Per-session: first qualifying 1m FVG in ~30 min after session open. */
export function detectSessionFirstPresentedFvg(
  m1: Bar[],
  dateKey: string,
  sessionId: SessionId
): FirstPresentedFvgResult | null {
  const spec = sessionOpenForId(sessionId);
  if (!spec) return null;

  if (sessionId === "ny_am") {
    return detectNyOpeningFirstPresentedFvg(m1, dateKey);
  }

  const endMinutes = spec.openMinutes + spec.windowMinutes;
  return firstFvgInWindow(
    m1,
    dateKey,
    spec.openMinutes,
    endMinutes,
    "session_open",
    spec.label,
    `first ~${spec.windowMinutes} min after ${formatMinutes(spec.openMinutes)} open`,
    spec.openMinutes,
    spec.middleNotOpenBar
  );
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Post-FHDR: first 1m FVG beyond body-close break of 9:30–10:30 range. */
export function detectPostFhdrFirstPresentedFvg(
  m1: Bar[],
  dateKey: string
): FirstPresentedFvgResult | null {
  const fhdrBars = barsInEstWindow(m1, NY_OPEN, FHDR_END, dateKey);
  if (fhdrBars.length < 3) return null;

  const fhdrHigh = Math.max(...fhdrBars.map((b) => b.high));
  const fhdrLow = Math.min(...fhdrBars.map((b) => b.low));
  const afterFhdr = m1.filter(
    (b) => getEstDateKey(b.time) === dateKey && getEstMinutes(b.time) >= FHDR_END
  );
  if (afterFhdr.length < 3) return null;

  let breakIndex = -1;
  let breakDirection: "bullish" | "bearish" | null = null;
  for (let i = 0; i < afterFhdr.length; i++) {
    const bar = afterFhdr[i];
    if (bar.close > fhdrHigh) {
      breakIndex = m1.indexOf(bar);
      breakDirection = "bullish";
      break;
    }
    if (bar.close < fhdrLow) {
      breakIndex = m1.indexOf(bar);
      breakDirection = "bearish";
      break;
    }
  }
  if (breakIndex < 2 || !breakDirection) return null;

  for (let i = breakIndex + 2; i < m1.length; i++) {
    const raw = fvgAtIndex(m1, i);
    if (!raw) continue;

    const lo = Math.min(raw.top, raw.bottom);
    const hi = Math.max(raw.top, raw.bottom);
    if (breakDirection === "bullish" && lo <= fhdrHigh) continue;
    if (breakDirection === "bearish" && hi >= fhdrLow) continue;

    return toFirstPresentedResult(
      m1,
      i,
      raw,
      "post_fhdr",
      "New York AM",
      "after first hour dealing range break (9:30–10:30)"
    );
  }

  return null;
}

export function detectFirstPresentedFvgs(
  m1: Bar[],
  asOf: Date,
  activeSessionId: SessionId
): {
  nyOpening: FirstPresentedFvgResult | null;
  postFhdr: FirstPresentedFvgResult | null;
  activeSession: FirstPresentedFvgResult | null;
} {
  const dateKey = getEstDateKey(asOf);
  const nyOpening = detectNyOpeningFirstPresentedFvg(m1, dateKey);
  const postFhdr = detectPostFhdrFirstPresentedFvg(m1, dateKey);
  const activeSession = detectSessionFirstPresentedFvg(m1, dateKey, activeSessionId);

  return { nyOpening, postFhdr, activeSession };
}

/** Refresh filled / inverted on an already-identified first-presented FVG (formation unchanged). */
export function refreshFirstPresentedFvg(
  m1: Bar[],
  prev: FirstPresentedFvgResult
): FirstPresentedFvgResult {
  const lo = Math.min(prev.fvg.top, prev.fvg.bottom);
  const hi = Math.max(prev.fvg.top, prev.fvg.bottom);
  let formedIndex = -1;
  if (prev.fvg.startTime != null) {
    const ts = prev.fvg.startTime;
    formedIndex = m1.findIndex((b) => Math.floor(b.time.getTime() / 1000) === ts);
    if (formedIndex < 0) {
      formedIndex = m1.findIndex((b) => Math.floor(b.time.getTime() / 1000) >= ts);
    }
  }
  const fvg = { ...prev.fvg, inverted: isFvgInverted(m1, prev.fvg, formedIndex >= 0 ? formedIndex : undefined) };
  return {
    ...prev,
    fvg,
    filled: formedIndex >= 0 ? isGapFilled(m1, formedIndex, lo, hi) : prev.filled,
  };
}

/**
 * Incremental first-presented FVG: reuse formations already found for the same EST date + session;
 * only re-scan variants that are still null. Detectors unchanged when they run.
 */
export function detectFirstPresentedFvgsIncremental(
  m1: Bar[],
  asOf: Date,
  activeSessionId: SessionId,
  prev:
    | {
        dateKey: string;
        sessionId: SessionId;
        result: {
          nyOpening: FirstPresentedFvgResult | null;
          postFhdr: FirstPresentedFvgResult | null;
          activeSession: FirstPresentedFvgResult | null;
        };
      }
    | null
    | undefined
): {
  nyOpening: FirstPresentedFvgResult | null;
  postFhdr: FirstPresentedFvgResult | null;
  activeSession: FirstPresentedFvgResult | null;
  reused: { nyOpening: boolean; postFhdr: boolean; activeSession: boolean };
} {
  const dateKey = getEstDateKey(asOf);
  const canReuseMeta = !!prev && prev.dateKey === dateKey && prev.sessionId === activeSessionId;

  const reused = { nyOpening: false, postFhdr: false, activeSession: false };

  let nyOpening: FirstPresentedFvgResult | null;
  if (canReuseMeta && prev!.result.nyOpening) {
    nyOpening = refreshFirstPresentedFvg(m1, prev!.result.nyOpening);
    reused.nyOpening = true;
  } else {
    nyOpening = detectNyOpeningFirstPresentedFvg(m1, dateKey);
  }

  let postFhdr: FirstPresentedFvgResult | null;
  if (canReuseMeta && prev!.result.postFhdr) {
    postFhdr = refreshFirstPresentedFvg(m1, prev!.result.postFhdr);
    reused.postFhdr = true;
  } else {
    postFhdr = detectPostFhdrFirstPresentedFvg(m1, dateKey);
  }

  let activeSession: FirstPresentedFvgResult | null;
  if (activeSessionId === "ny_am") {
    // Same as detectSessionFirstPresentedFvg(ny_am) → detectNyOpeningFirstPresentedFvg
    activeSession = nyOpening;
    reused.activeSession = reused.nyOpening;
  } else if (canReuseMeta && prev!.result.activeSession) {
    activeSession = refreshFirstPresentedFvg(m1, prev!.result.activeSession);
    reused.activeSession = true;
  } else {
    activeSession = detectSessionFirstPresentedFvg(m1, dateKey, activeSessionId);
  }

  return { nyOpening, postFhdr, activeSession, reused };
}

/**
 * ICT inverse FVG (IFVG) heuristic: polarity flips after a **body close** through the gap.
 * Bullish FVG inverted → bodies closed below gap bottom (was support, now resistance).
 * Bearish FVG inverted → bodies closed above gap top (was resistance, now support).
 */
export function isFvgInverted(bars: Bar[], fvg: FvgZone, formedAtIndex?: number): boolean {
  const lo = Math.min(fvg.top, fvg.bottom);
  const hi = Math.max(fvg.top, fvg.bottom);
  let start = formedAtIndex != null ? formedAtIndex + 1 : 0;

  if (formedAtIndex == null && fvg.startTime) {
    const ts = fvg.startTime;
    const idx = bars.findIndex((b) => Math.floor(b.time.getTime() / 1000) >= ts);
    start = idx >= 0 ? idx + 1 : 0;
  }

  for (let j = start; j < bars.length; j++) {
    const close = bars[j].close;
    if (fvg.type === "bullish" && close < lo) return true;
    if (fvg.type === "bearish" && close > hi) return true;
  }
  return false;
}

/** 15m / 5m unfilled fair value gaps for market context. */
export function detectUnfilledIntradayFvgs(
  bars: Bar[],
  timeframe: FvgZone["timeframe"],
  lookback = 40,
  maxCount = 5
): FvgZone[] {
  const fvgs: FvgZone[] = [];
  const start = Math.max(2, bars.length - lookback);

  for (let i = start; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];
    if (!c1 || !c3) continue;

    if (c1.high < c3.low && c3.low - c1.high >= MIN_GAP_POINTS) {
      const bottom = c1.high;
      const top = c3.low;
      const bullish: FvgZone = {
        timeframe,
        type: "bullish",
        top,
        bottom,
        formedAt: formatEst(c3.time),
        startTime: Math.floor(c3.time.getTime() / 1000),
      };
      bullish.inverted = isFvgInverted(bars, bullish, i);
      if (!bullish.inverted && isGapFilled(bars, i, bottom, top)) continue;
      fvgs.push(bullish);
    }

    if (c1.low > c3.high && c1.low - c3.high >= MIN_GAP_POINTS) {
      const bottom = c3.high;
      const top = c1.low;
      const bearish: FvgZone = {
        timeframe,
        type: "bearish",
        top,
        bottom,
        formedAt: formatEst(c3.time),
        startTime: Math.floor(c3.time.getTime() / 1000),
      };
      bearish.inverted = isFvgInverted(bars, bearish, i);
      if (!bearish.inverted && isGapFilled(bars, i, bottom, top)) continue;
      fvgs.push(bearish);
    }
  }

  return fvgs.slice(-maxCount);
}
