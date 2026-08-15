/**
 * TradingView right-axis LAST badge parser + tick-mode display policy.
 * Keep in sync with extension/tv-bridge.js parseLastBox and extension/chart-price.js parseAxisLastBadge.
 *
 * LAST is the price immediately before bar-remaining 00:ss–04:ss — not the first
 * comma-price in a parent (scale tick / bar high), not lastCloseFast, not bid/ask.
 */

export const TICK_LIVE_MAX_AGE_MS = 2000;
export const TICK_STALE_MAX_AGE_MS = 60_000;
/** Fresh previous 1m close: forming minute plus a short completion buffer. */
export const MINUTE_LIVE_MAX_AGE_MS = 90_000;

const LAST_BEFORE_COUNTDOWN =
  /(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{5}(?:\.\d{1,2})?)(?=\s*0[0-4]:\d{2}\b)/g;

function roundMnq(n: number): number {
  return Math.round(n * 4) / 4;
}

function normalizeLastBoxText(text: string): string {
  return String(text)
    .replace(/[\u2236\uFF1A\uA789]/g, ":")
    .replace(/[\u00a0\s\u202f]+/g, " ")
    .trim();
}

/** Price immediately before bar remaining. Clock times like 08:14 do not match. */
export function parseTvAxisLastBadge(text: string | null | undefined): number | null {
  if (!text) return null;
  LAST_BEFORE_COUNTDOWN.lastIndex = 0;
  const raw = normalizeLastBoxText(text);
  const hits = [...raw.matchAll(LAST_BEFORE_COUNTDOWN)];
  if (!hits.length) return null;
  const n = parseFloat(hits[hits.length - 1][1].replace(/,/g, ""));
  if (n >= 20000 && n <= 45000) return roundMnq(n);
  return null;
}

export function isBarCountdownLeaf(text: string | null | undefined): boolean {
  const t = String(text || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2236\uFF1A\uA789]/g, ":")
    .trim();
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const mm = Number(t.slice(0, 2));
  return mm >= 0 && mm <= 4;
}

export type TickQuote = {
  value: number;
  source: string;
  timestamp: number;
};

export type TickBarState = {
  value: number | null;
  source: string | null;
  ageMs: number | null;
  freshnessTs: number | null;
  dataStatus: "LIVE" | "STALE" | "UNAVAILABLE";
};

export type MarketHeaderStatus = "LIVE" | "STALE" | "DELAYED" | "UNAVAILABLE";

export type MinuteBarState = {
  value: number | null;
  source: string | null;
  ageMs: number | null;
  freshnessTs: number | null;
  dataStatus: "LIVE" | "STALE" | "UNAVAILABLE";
};

function tickState(tick: TickQuote, now: number): TickBarState {
  const ageMs = Math.max(0, now - tick.timestamp);
  if (ageMs > TICK_STALE_MAX_AGE_MS) {
    return {
      value: null,
      source: tick.source,
      ageMs,
      freshnessTs: tick.timestamp,
      dataStatus: "UNAVAILABLE",
    };
  }
  if (ageMs <= TICK_LIVE_MAX_AGE_MS) {
    return {
      value: tick.value,
      source: tick.source,
      ageMs,
      freshnessTs: tick.timestamp,
      dataStatus: "LIVE",
    };
  }
  return {
    value: tick.value,
    source: tick.source,
    ageMs,
    freshnessTs: tick.timestamp,
    dataStatus: "STALE",
  };
}

function isTvLastSource(source: string | null | undefined): boolean {
  return source === "tradingview_live" || source === "tradingview_quote";
}

/**
 * Tick-mode UI: prefer DC_PRICE_TICK. If ticks miss, use axis Last-badge parse
 * (price immediately before 00:ss–04:ss). Never first-comma scrape or Yahoo.
 * Never restamp freshness to `now`.
 */
export function resolveTickModeDisplay(args: {
  lastTick: TickQuote | null;
  isolatedScrape?: number | null;
  axisBadge?: TickQuote | null;
  now: number;
}): TickBarState {
  void args.isolatedScrape;
  const tick = args.lastTick;
  if (tick && Number.isFinite(tick.value) && isTvLastSource(tick.source)) {
    const state = tickState(tick, args.now);
    if (state.dataStatus === "LIVE") return state;
    const badge = args.axisBadge;
    if (badge && Number.isFinite(badge.value) && isTvLastSource(badge.source)) {
      const badgeState = tickState(badge, args.now);
      if (badgeState.dataStatus === "LIVE") return badgeState;
    }
    return state;
  }
  const badge = args.axisBadge;
  if (badge && Number.isFinite(badge.value) && isTvLastSource(badge.source)) {
    return tickState(badge, args.now);
  }
  return {
    value: null,
    source: null,
    ageMs: null,
    freshnessTs: null,
    dataStatus: "UNAVAILABLE",
  };
}

function isCompleted1mClose(source: string | null | undefined): boolean {
  return source === "tv_1m_close";
}

/**
 * 1m mode: completed candle CLOSE only. Not forming open, not Yahoo, not a
 * cached Last mislabeled as live. A current previous-bar close is LIVE (not
 * DELAYED/STALE). STALE only when that close is actually old.
 */
export function resolveMinuteModeDisplay(args: {
  lastClose: TickQuote | null;
  yahooOrBackend?: TickQuote | null;
  now: number;
}): MinuteBarState {
  const close = args.lastClose;
  if (close && Number.isFinite(close.value) && isCompleted1mClose(close.source)) {
    const ageMs = Math.max(0, args.now - close.timestamp);
    return {
      value: close.value,
      source: close.source,
      ageMs,
      freshnessTs: close.timestamp,
      dataStatus: ageMs > MINUTE_LIVE_MAX_AGE_MS ? "STALE" : "LIVE",
    };
  }
  const fallback = args.yahooOrBackend;
  if (fallback && Number.isFinite(fallback.value)) {
    return {
      value: fallback.value,
      source: fallback.source,
      ageMs: Math.max(0, args.now - fallback.timestamp),
      freshnessTs: fallback.timestamp,
      dataStatus: "STALE",
    };
  }
  return {
    value: null,
    source: null,
    ageMs: null,
    freshnessTs: null,
    dataStatus: "UNAVAILABLE",
  };
}

/**
 * Header MARKET follows the ticker, not backend.
 * Fresh 1m completed close → LIVE. DELAYED is never the 1m happy path.
 * Cached Last in 1m mode must not show STALE just because tvLive is false.
 */
export function resolveMarketHeaderStatus(args: {
  mode: "tick" | "minute";
  dataStatus: string;
  hasPrice: boolean;
}): MarketHeaderStatus {
  if (args.mode === "minute") {
    if (args.dataStatus === "STALE") return "STALE";
    if (args.dataStatus === "UNAVAILABLE" || args.dataStatus === "OFFLINE") return "UNAVAILABLE";
    if (args.hasPrice || args.dataStatus === "LIVE" || args.dataStatus === "DELAYED" || args.dataStatus === "WAITING") {
      return "LIVE";
    }
    return "UNAVAILABLE";
  }
  if (args.dataStatus === "LIVE") return "LIVE";
  if (args.dataStatus === "STALE") return "STALE";
  return "UNAVAILABLE";
}
