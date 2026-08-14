import type { Bar } from "./types";

const SYMBOL = "MNQ=F";
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
        }>;
      };
    }>;
    error?: { description?: string };
  };
};

export async function fetchBars(
  interval: "1d" | "15m" | "5m" | "1m",
  range: string
): Promise<Bar[]> {
  const url = `${YAHOO_CHART}/${SYMBOL}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance error: ${res.status}`);
  }

  const data = (await res.json()) as YahooChartResponse;
  const err = data.chart?.error?.description;
  if (err) throw new Error(err);

  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];

  if (!quote) throw new Error("No quote data returned");

  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      Number.isNaN(open)
    ) {
      continue;
    }
    bars.push({
      time: new Date(timestamps[i] * 1000),
      open,
      high,
      low,
      close,
    });
  }

  return bars;
}

/** Fast last print for the desk bar — Yahoo meta, then last 1m close. */
export async function fetchYahooLastPrice(yahooSymbol: string = SYMBOL): Promise<{
  price: number;
  timestamp: number;
  source: "yahoo_bar_close";
} | null> {
  try {
    const ticker = yahooSymbol === "NQ=F" ? "NQ=F" : "MNQ=F";
    const url = `${YAHOO_CHART}/${ticker}?interval=1m&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as YahooChartResponse;
    const result = data.chart?.result?.[0];
    const metaPx = Number(result?.meta?.regularMarketPrice);
    if (Number.isFinite(metaPx) && metaPx >= 20000 && metaPx <= 45000) {
      const tsSec = Number(result?.meta?.regularMarketTime);
      return {
        price: metaPx,
        timestamp: Number.isFinite(tsSec) && tsSec > 0 ? tsSec * 1000 : Date.now(),
        source: "yahoo_bar_close",
      };
    }
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const times = result?.timestamp ?? [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const close = closes[i];
      if (close == null || !Number.isFinite(close) || close < 20000 || close > 45000) continue;
      const tsSec = times[i];
      return {
        price: close,
        timestamp: Number.isFinite(tsSec) ? tsSec * 1000 : Date.now(),
        source: "yahoo_bar_close",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function fetchAllTimeframes() {
  const [daily, m15, m5, m1] = await Promise.all([
    fetchBars("1d", "3mo"),
    fetchBars("15m", "5d"),
    fetchBars("5m", "5d"),
    fetchBars("1m", "7d"),
  ]);
  return { daily, m15, m5, m1, symbol: SYMBOL };
}

const MARKET_CACHE_MS = 45_000;
let marketCache: { data: Awaited<ReturnType<typeof fetchAllTimeframes>>; expires: number } | null =
  null;
let marketFetchInFlight: Promise<Awaited<ReturnType<typeof fetchAllTimeframes>>> | null = null;

function livePriceDiffersFromCache(chartLastPrice?: number | null): boolean {
  if (chartLastPrice == null || !marketCache?.data) return false;
  const m1Last = marketCache.data.m1.at(-1)?.close;
  if (m1Last == null || !Number.isFinite(m1Last)) return false;
  return Math.abs(chartLastPrice - m1Last) >= 0.25;
}

/** Cached Yahoo fetch — shared across snapshot + verdict within ~45s. */
export async function fetchAllTimeframesCached(
  force = false,
  chartLastPrice?: number | null
) {
  const needsForce = force || livePriceDiffersFromCache(chartLastPrice);
  const now = Date.now();
  if (!needsForce && marketCache && now < marketCache.expires) {
    return marketCache.data;
  }
  if (!needsForce && marketFetchInFlight) {
    return marketFetchInFlight;
  }

  if (needsForce) {
    marketCache = null;
    marketFetchInFlight = null;
  }

  marketFetchInFlight = fetchAllTimeframes()
    .then((data) => {
      marketCache = { data, expires: Date.now() + MARKET_CACHE_MS };
      marketFetchInFlight = null;
      return data;
    })
    .catch((err) => {
      marketFetchInFlight = null;
      throw err;
    });

  return marketFetchInFlight;
}

/** Pre-warm Yahoo + serverless — call from extension before screenshot. */
export async function warmMarketDataCache(): Promise<void> {
  await fetchAllTimeframesCached();
}

/** Longer ranges for historical replay training (Yahoo 1m max ~7d). */
export async function fetchAllTimeframesForBacktest() {
  const [daily, m15, m5, m1] = await Promise.all([
    fetchBars("1d", "3mo"),
    fetchBars("15m", "60d"),
    fetchBars("5m", "60d"),
    fetchBars("1m", "7d"),
  ]);
  return { daily, m15, m5, m1, symbol: SYMBOL };
}

export function sliceBarsAt(bars: Bar[], asOf: Date): Bar[] {
  const t = asOf.getTime();
  return bars.filter((b) => b.time.getTime() <= t);
}

export function formatEst(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function getEstMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function getEstDateKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Calendar days between two EST date keys. */
export function estDayGapDays(a: Date, b: Date): number {
  const ka = getEstDateKey(a);
  const kb = getEstDateKey(b);
  const da = new Date(`${ka}T12:00:00Z`).getTime();
  const db = new Date(`${kb}T12:00:00Z`).getTime();
  return Math.round(Math.abs(db - da) / 86_400_000);
}

/** True when two daily bars are adjacent trading sessions (allows Fri → Mon). */
export function isConsecutiveTradingSession(prev: Bar, next: Bar): boolean {
  const gap = estDayGapDays(prev.time, next.time);
  return gap >= 1 && gap <= 3;
}

/** Completed EST daily bars for FVG — excludes partial today; patches today from 1m if needed. */
export function buildFvgDailyBars(yahooDaily: Bar[], m1: Bar[], asOf = new Date()): Bar[] {
  const today = getEstDateKey(asOf);
  const completed = yahooDaily.filter((b) => getEstDateKey(b.time) < today);

  const todayM1 = m1.filter((b) => getEstDateKey(b.time) === today);
  if (todayM1.length >= 30) {
    todayM1.sort((a, b) => a.time.getTime() - b.time.getTime());
    const agg: Bar = {
      time: todayM1.at(-1)!.time,
      open: todayM1[0].open,
      high: Math.max(...todayM1.map((b) => b.high)),
      low: Math.min(...todayM1.map((b) => b.low)),
      close: todayM1.at(-1)!.close,
    };
    if (getEstMinutes(asOf) >= 16 * 60) {
      completed.push(agg);
    }
  }

  return completed;
}

/** Unix seconds for a wall-clock time on an EST date key. */
export function estTimeOnDateKey(dateKey: string, hour: number, minute: number): number {
  const target = hour * 60 + minute;
  const base = new Date(`${dateKey}T12:00:00Z`).getTime();
  for (let t = base - 12 * 3_600_000; t < base + 36 * 3_600_000; t += 60_000) {
    const d = new Date(t);
    if (getEstDateKey(d) === dateKey && getEstMinutes(d) === target) {
      return Math.floor(t / 1000);
    }
  }
  return Math.floor(base / 1000);
}

/** @deprecated use estTimeOnDateKey */
export function estDayCloseTime(dateKey: string): number {
  return estTimeOnDateKey(dateKey, 17, 0);
}

/** When daily c3 completes — 5:00 PM ET (CME RTH close), aligned to 1m if available. */
export function dayFormationTime(dailyBar: Bar, m1: Bar[]): number {
  const key = getEstDateKey(dailyBar.time);
  const closeBar = findBarClosestTo(m1, 17 * 60, key);
  if (closeBar) return Math.floor(closeBar.time.getTime() / 1000);
  return estTimeOnDateKey(key, 17, 0);
}

/** When the daily FVG forms on a 1m chart — 6:00 PM ET on displacement day (c2), CME session open. */
export function fvgFormationTime(c2: Bar, m1: Bar[]): number {
  const key = getEstDateKey(c2.time);
  const bar = findBarClosestTo(m1, 18 * 60, key);
  if (bar) return Math.floor(bar.time.getTime() / 1000);
  return estTimeOnDateKey(key, 18, 0);
}

export function barsInEstWindow(
  bars: Bar[],
  startMinutes: number,
  endMinutes: number,
  dateKey?: string
): Bar[] {
  return bars.filter((b) => {
    if (dateKey && getEstDateKey(b.time) !== dateKey) return false;
    const m = getEstMinutes(b.time);
    if (startMinutes <= endMinutes) {
      return m >= startMinutes && m < endMinutes;
    }
    return m >= startMinutes || m < endMinutes;
  });
}

export function sessionHighLow(bars: Bar[]): { high: number; low: number } | null {
  if (bars.length === 0) return null;
  return {
    high: Math.max(...bars.map((b) => b.high)),
    low: Math.min(...bars.map((b) => b.low)),
  };
}

export function findBarClosestTo(bars: Bar[], targetMinutes: number, dateKey: string): Bar | null {
  const dayBars = bars.filter((b) => getEstDateKey(b.time) === dateKey);
  if (dayBars.length === 0) return null;

  let best: Bar | null = null;
  let bestDiff = Infinity;
  for (const bar of dayBars) {
    const diff = Math.abs(getEstMinutes(bar.time) - targetMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = bar;
    }
  }
  return bestDiff <= 2 ? best : null;
}

export function barTimeSec(bar: Bar): number {
  return Math.floor(bar.time.getTime() / 1000);
}

export const RTH_CLOSE_MIN = 16 * 60 + 15;
export const RTH_OPEN_MIN = 9 * 60 + 30;

export function priorEstDateKey(m1: Bar[], todayKey: string): string | null {
  const keys = [...new Set(m1.map((b) => getEstDateKey(b.time)))].sort();
  const idx = keys.indexOf(todayKey);
  return idx > 0 ? keys[idx - 1]! : null;
}

/** Bar on `dateKey` where the day high or low was first printed. */
export function findDayExtremeBar(
  m1: Bar[],
  dateKey: string,
  kind: "high" | "low"
): Bar | null {
  const dayBars = m1.filter((b) => getEstDateKey(b.time) === dateKey);
  if (!dayBars.length) return null;
  if (kind === "high") {
    const target = Math.max(...dayBars.map((b) => b.high));
    return findExtremeBarInWindow(dayBars, "high", target);
  }
  const target = Math.min(...dayBars.map((b) => b.low));
  return findExtremeBarInWindow(dayBars, "low", target);
}

/** Bar in `bars` that first printed the window high or low. */
export function findExtremeBarInWindow(
  bars: Bar[],
  kind: "high" | "low",
  targetPrice?: number
): Bar | null {
  if (!bars.length) return null;

  if (kind === "high") {
    const target = targetPrice ?? Math.max(...bars.map((b) => b.high));
    for (const bar of bars) {
      if (bar.high >= target - 0.01) return bar;
    }
    return null;
  }

  const target = targetPrice ?? Math.min(...bars.map((b) => b.low));
  for (const bar of bars) {
    if (bar.low <= target + 0.01) return bar;
  }
  return null;
}

/** Find the earliest m1 bar in `bars` that printed a level price. */
export function findFormationBarAtPrice(
  bars: Bar[],
  price: number,
  kind: "high" | "low",
  tolerance = 1.5
): number | null {
  for (const bar of bars) {
    const match =
      kind === "high"
        ? Math.abs(bar.high - price) <= tolerance
        : Math.abs(bar.low - price) <= tolerance;
    if (match) return barTimeSec(bar);
  }
  return null;
}

/** Find the m1 bar that printed a level price (for session H/L lines). */
export function findBarAtPrice(
  m1: Bar[],
  price: number,
  kind: "high" | "low",
  tolerance = 1.5
): number | null {
  return findFormationBarAtPrice(m1, price, kind, tolerance);
}

/** Unix seconds when each HTF PD level was established on the 1m chart. */
export function resolvePdLevelAnchorTimes(
  m1: Bar[],
  input: {
    fetchedAt: string;
    orgFormedAt?: number;
    hasNdog: boolean;
  }
): Record<string, number> {
  const todayKey = getEstDateKey(new Date(input.fetchedAt));
  const priorKey = priorEstDateKey(m1, todayKey);
  const anchors: Record<string, number> = {};

  if (priorKey) {
    const pdhBar = findDayExtremeBar(m1, priorKey, "high");
    const pdlBar = findDayExtremeBar(m1, priorKey, "low");
    const pdcBar = findBarClosestTo(m1, RTH_CLOSE_MIN, priorKey);
    if (pdhBar) anchors.pdh = barTimeSec(pdhBar);
    if (pdlBar) anchors.pdl = barTimeSec(pdlBar);
    if (pdcBar) {
      anchors.pdc = barTimeSec(pdcBar);
      anchors.pdeq = barTimeSec(pdcBar);
    }
  }

  const openBar = findBarClosestTo(m1, RTH_OPEN_MIN, todayKey);
  const gapComplete =
    input.orgFormedAt ?? (openBar ? barTimeSec(openBar) : undefined);
  if (openBar) {
    anchors.cdo = barTimeSec(openBar);
    anchors.cdeq = barTimeSec(openBar);
  }
  if (gapComplete != null && input.hasNdog) {
    anchors.ndog_top = gapComplete;
    anchors.ndog_bot = gapComplete;
  }

  return anchors;
}

function estWeekdayShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
}

/** CME week starts Sunday 6:00 PM ET — date key of that Sunday for the week containing `asOf`. */
export function cmeWeekSundayKey(asOf: Date): string | null {
  for (let daysBack = 0; daysBack <= 8; daysBack++) {
    const d = new Date(asOf.getTime() - daysBack * 86_400_000);
    if (estWeekdayShort(d) !== "Sun") continue;
    if (daysBack === 0 && getEstMinutes(asOf) < 18 * 60) continue;
    return getEstDateKey(d);
  }
  return null;
}

/** Friday immediately before the given Sunday date key. */
function fridayBeforeSunday(sundayKey: string): string | null {
  const anchor = new Date(`${sundayKey}T12:00:00Z`);
  for (let back = 1; back <= 3; back++) {
    const d = new Date(anchor.getTime() - back * 86_400_000);
    if (estWeekdayShort(d) === "Fri") return getEstDateKey(d);
  }
  return null;
}

export type NwogLevels = {
  top: number;
  bottom: number;
  weekOpen: number;
  priorWeekClose: number;
  startTime: number;
};

/**
 * NWOG = gap between prior Friday close and current week open (Sunday 6:00 PM ET).
 * Uses 1m bars when available; falls back to completed daily bars.
 */
export function computeNwog(m1: Bar[], daily: Bar[], asOf: Date): NwogLevels | null {
  const m1At = sliceBarsAt(m1, asOf);
  const sundayKey = cmeWeekSundayKey(asOf);
  if (!sundayKey) return null;

  const fridayKey = fridayBeforeSunday(sundayKey);
  if (!fridayKey) return null;

  const weekOpenBar = findBarClosestTo(m1At, 18 * 60, sundayKey);
  const friCloseBar =
    findBarClosestTo(m1At, 17 * 60, fridayKey) ??
    findBarClosestTo(m1At, 16 * 60 + 15, fridayKey);

  let weekOpen: number | null = weekOpenBar?.open ?? null;
  let priorWeekClose: number | null = friCloseBar?.close ?? null;
  let startTime =
    weekOpenBar != null
      ? Math.floor(weekOpenBar.time.getTime() / 1000)
      : estTimeOnDateKey(sundayKey, 18, 0);

  if (weekOpen == null || priorWeekClose == null) {
    const dailyBefore = daily.filter((b) => getEstDateKey(b.time) <= sundayKey);
    const friDaily = dailyBefore.find((b) => getEstDateKey(b.time) === fridayKey);
    const sunDaily = dailyBefore.find((b) => getEstDateKey(b.time) === sundayKey);
    const monDaily = dailyBefore.find((b) => {
      const d = new Date(`${sundayKey}T12:00:00Z`);
      const mon = new Date(d.getTime() + 86_400_000);
      return getEstDateKey(b.time) === getEstDateKey(mon);
    });
    const openDaily = sunDaily ?? monDaily;
    if (!friDaily || !openDaily) return null;
    weekOpen = openDaily.open;
    priorWeekClose = friDaily.close;
    startTime = estTimeOnDateKey(getEstDateKey(openDaily.time), 18, 0);
  }

  if (weekOpen == null || priorWeekClose == null) return null;
  if (Math.abs(weekOpen - priorWeekClose) < 0.25) return null;

  return {
    top: Math.max(weekOpen, priorWeekClose),
    bottom: Math.min(weekOpen, priorWeekClose),
    weekOpen,
    priorWeekClose,
    startTime,
  };
}
