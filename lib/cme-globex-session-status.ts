/**
 * CME Globex equity-index futures session status (MNQ/NQ authority).
 * Calendar open/closed only — does not invent ticks or change freshness thresholds.
 */

import { LIVE_PRICE_MAX_AGE_MS } from "./chart-live-price";
import { getEstDateKey, getEstMinutes } from "./market-data";
import { cmeSessionDateKey } from "./tickstream/htf-aggregate";

export type CmeGlobexMarketState =
  | "MARKET_OPEN"
  | "MARKET_CLOSED"
  | "MARKET_HOLIDAY"
  | "MARKET_EARLY_CLOSE";

export type CmeGlobexSessionStatus = {
  marketState: CmeGlobexMarketState;
  expectFresh: boolean;
  reason: string;
  nextOpenEt?: string;
  /** EST calendar date key for `asOf` (not a second session-day system). */
  estDateKey: string;
  /** Existing Globex session-date key (18:00 ET roll). */
  cmeSessionKey: string;
  estMinutes: number;
  /**
   * Internal: curated holiday table covers 2025–2027 only.
   * Beyond that we do NOT invent holidays — regular Globex rules apply.
   */
  calendarCoverage?: "curated" | "beyond_table";
};

/** Reuse existing session-date helper — thin Date wrapper only. */
export function cmeSessionDateKeyFromDate(date: Date): string {
  return cmeSessionDateKey(Math.floor(date.getTime() / 1000));
}

const MAINT_START_MIN = 17 * 60;
const MAINT_END_MIN = 18 * 60;
const WEEKEND_CLOSE_MIN = 17 * 60;
const SUNDAY_OPEN_MIN = 18 * 60;

type CalendarEntry =
  | {
      date: string;
      type: "holiday";
      name: string;
      /** If set, holiday only until this ET minute; after → fall through to regular. */
      untilEtMinutes?: number;
      /** If set, overnight may still trade until this ET minute; then holiday. */
      afterEtMinutes?: number;
    }
  | {
      date: string;
      type: "early_close";
      name: string;
      haltEtMinutes: number;
      /** Same-day Globex reopen (ET minutes). Omit when next open is Sunday 18:00. */
      resumeEtMinutes?: number;
    };

/**
 * Explicit CME equity-index futures holiday / early-close table (curated).
 * Times are America/New_York. Never infer from Sat/Sun or stale prints.
 * Source pattern: CME Globex equity-index holiday hours (CT+1 → ET).
 */
export const CME_EQUITY_INDEX_CALENDAR: readonly CalendarEntry[] = [
  { date: "2025-01-01", type: "holiday", name: "New Year's Day", untilEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2025-01-20", type: "early_close", name: "MLK Day", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2025-02-17", type: "early_close", name: "Presidents Day", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2025-04-18", type: "holiday", name: "Good Friday", afterEtMinutes: 9 * 60 + 15 },
  { date: "2025-05-26", type: "early_close", name: "Memorial Day", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2025-06-19", type: "early_close", name: "Juneteenth", haltEtMinutes: 13 * 60 },
  { date: "2025-07-04", type: "early_close", name: "Independence Day", haltEtMinutes: 13 * 60 },
  { date: "2025-09-01", type: "early_close", name: "Labor Day", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2025-11-27", type: "early_close", name: "Thanksgiving", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2025-11-28", type: "early_close", name: "Day after Thanksgiving", haltEtMinutes: 13 * 60 + 15 },
  { date: "2025-12-24", type: "early_close", name: "Christmas Eve", haltEtMinutes: 13 * 60 + 15 },
  { date: "2025-12-25", type: "holiday", name: "Christmas Day" },

  { date: "2026-01-01", type: "holiday", name: "New Year's Day", untilEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2026-01-19", type: "early_close", name: "MLK Day", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2026-02-16", type: "early_close", name: "Presidents Day", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2026-04-03", type: "holiday", name: "Good Friday", afterEtMinutes: 9 * 60 + 15 },
  { date: "2026-05-25", type: "early_close", name: "Memorial Day", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2026-06-19", type: "early_close", name: "Juneteenth", haltEtMinutes: 13 * 60 },
  { date: "2026-07-03", type: "early_close", name: "Independence Day (observed)", haltEtMinutes: 13 * 60 },
  { date: "2026-09-07", type: "early_close", name: "Labor Day", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2026-11-26", type: "early_close", name: "Thanksgiving", haltEtMinutes: 13 * 60, resumeEtMinutes: SUNDAY_OPEN_MIN },
  { date: "2026-11-27", type: "early_close", name: "Day after Thanksgiving", haltEtMinutes: 13 * 60 + 15 },
  { date: "2026-12-24", type: "early_close", name: "Christmas Eve", haltEtMinutes: 13 * 60 + 15 },
  { date: "2026-12-25", type: "holiday", name: "Christmas Day" },
  { date: "2027-01-01", type: "holiday", name: "New Year's Day" },
];

const CAL_BY_DATE = new Map(CME_EQUITY_INDEX_CALENDAR.map((e) => [e.date, e]));

/** Inclusive curated holiday years — do not invent beyond this range. */
export const CME_CALENDAR_CURATED_YEAR_MIN = 2025;
export const CME_CALENDAR_CURATED_YEAR_MAX = 2027;

export function isCmeCalendarYearCurated(estDateKey: string): boolean {
  const y = Number(String(estDateKey || "").slice(0, 4));
  return Number.isFinite(y) && y >= CME_CALENDAR_CURATED_YEAR_MIN && y <= CME_CALENDAR_CURATED_YEAR_MAX;
}

function estWeekdaySun0(date: Date): number {
  const short = date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[short] ?? 0;
}

function formatEtClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ET`;
}

function nextSundayOpenEt(asOf: Date, estDateKey: string, estMinutes: number): string {
  const wd = estWeekdaySun0(asOf);
  if (wd === 0 && estMinutes < SUNDAY_OPEN_MIN) {
    return `Sun ${formatEtClock(SUNDAY_OPEN_MIN)}`;
  }
  // Advance calendar days in ET until next Sunday open.
  const base = new Date(`${estDateKey}T12:00:00Z`);
  for (let i = 1; i <= 8; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    if (estWeekdaySun0(d) === 0) {
      return `${getEstDateKey(d)} Sun ${formatEtClock(SUNDAY_OPEN_MIN)}`;
    }
  }
  return `Sun ${formatEtClock(SUNDAY_OPEN_MIN)}`;
}

function nextAfterMaintenance(asOf: Date, estDateKey: string): string {
  const wd = estWeekdaySun0(asOf);
  if (wd >= 1 && wd <= 4) {
    return `${estDateKey} ${formatEtClock(MAINT_END_MIN)}`;
  }
  return nextSundayOpenEt(asOf, estDateKey, getEstMinutes(asOf));
}

function regularGlobexStatus(
  asOf: Date,
  estDateKey: string,
  estMinutes: number
): Omit<CmeGlobexSessionStatus, "cmeSessionKey" | "estDateKey" | "estMinutes"> {
  const wd = estWeekdaySun0(asOf);

  if (wd === 6) {
    return {
      marketState: "MARKET_CLOSED",
      expectFresh: false,
      reason: "Market closed for weekend",
      nextOpenEt: nextSundayOpenEt(asOf, estDateKey, estMinutes),
    };
  }
  if (wd === 5 && estMinutes >= WEEKEND_CLOSE_MIN) {
    return {
      marketState: "MARKET_CLOSED",
      expectFresh: false,
      reason: "Market closed for weekend",
      nextOpenEt: nextSundayOpenEt(asOf, estDateKey, estMinutes),
    };
  }
  if (wd === 0 && estMinutes < SUNDAY_OPEN_MIN) {
    return {
      marketState: "MARKET_CLOSED",
      expectFresh: false,
      reason: "Market closed · opens Sun 18:00 ET",
      nextOpenEt: `Sun ${formatEtClock(SUNDAY_OPEN_MIN)}`,
    };
  }
  if (wd >= 1 && wd <= 4 && estMinutes >= MAINT_START_MIN && estMinutes < MAINT_END_MIN) {
    return {
      marketState: "MARKET_CLOSED",
      expectFresh: false,
      reason: "Market closed · daily maintenance",
      nextOpenEt: nextAfterMaintenance(asOf, estDateKey),
    };
  }

  return {
    marketState: "MARKET_OPEN",
    expectFresh: true,
    reason: "CME Globex equity-index session open",
  };
}

/**
 * Deterministic Globex session classifier. Always pass `asOf` (no hidden Date.now()).
 */
export function getCmeGlobexSessionStatus(asOf: Date): CmeGlobexSessionStatus {
  const estDateKey = getEstDateKey(asOf);
  const estMinutes = getEstMinutes(asOf);
  const cmeSessionKey = cmeSessionDateKeyFromDate(asOf);
  const curated = isCmeCalendarYearCurated(estDateKey);
  const coverage = curated ? ("curated" as const) : ("beyond_table" as const);
  const entry = CAL_BY_DATE.get(estDateKey);

  // Beyond curated years: never invent a holiday — regular Globex open/closed only.
  if (!curated) {
    const regular = regularGlobexStatus(asOf, estDateKey, estMinutes);
    return {
      ...regular,
      reason:
        regular.expectFresh === false
          ? `${regular.reason} · holiday calendar not curated for ${estDateKey.slice(0, 4)}`
          : `${regular.reason} · holiday calendar not curated for ${estDateKey.slice(0, 4)}`,
      estDateKey,
      cmeSessionKey,
      estMinutes,
      calendarCoverage: coverage,
    };
  }

  if (entry?.type === "holiday") {
    const until = entry.untilEtMinutes;
    const after = entry.afterEtMinutes;
    if (until != null && estMinutes >= until) {
      const regular = regularGlobexStatus(asOf, estDateKey, estMinutes);
      return { ...regular, estDateKey, cmeSessionKey, estMinutes, calendarCoverage: coverage };
    }
    if (after != null && estMinutes < after) {
      const regular = regularGlobexStatus(asOf, estDateKey, estMinutes);
      return { ...regular, estDateKey, cmeSessionKey, estMinutes, calendarCoverage: coverage };
    }
    return {
      marketState: "MARKET_HOLIDAY",
      expectFresh: false,
      reason: `Market holiday · ${entry.name}`,
      nextOpenEt:
        until != null
          ? `${estDateKey} ${formatEtClock(until)}`
          : nextSundayOpenEt(asOf, estDateKey, estMinutes),
      estDateKey,
      cmeSessionKey,
      estMinutes,
      calendarCoverage: coverage,
    };
  }

  if (entry?.type === "early_close") {
    const { haltEtMinutes, resumeEtMinutes, name } = entry;
    if (estMinutes >= haltEtMinutes && (resumeEtMinutes == null || estMinutes < resumeEtMinutes)) {
      return {
        marketState: "MARKET_EARLY_CLOSE",
        expectFresh: false,
        reason: `Early close · ${name}`,
        nextOpenEt:
          resumeEtMinutes != null
            ? `${estDateKey} ${formatEtClock(resumeEtMinutes)}`
            : nextSundayOpenEt(asOf, estDateKey, estMinutes),
        estDateKey,
        cmeSessionKey,
        estMinutes,
        calendarCoverage: coverage,
      };
    }
  }

  const regular = regularGlobexStatus(asOf, estDateKey, estMinutes);
  return { ...regular, estDateKey, cmeSessionKey, estMinutes, calendarCoverage: coverage };
}

export function isTickstreamLiveSource(source: string | null | undefined): boolean {
  return source === "tickstream_live" || source === "tickstream_quote";
}

export function isYahooLastPrintSource(source: string | null | undefined): boolean {
  return source === "yahoo_bar_close" || source === "yahoo";
}

/**
 * Open-market Last recovery gate: only when calendar expects fresh prints AND
 * `/api/quote` carried a Tickstream print within the existing 60s live gate.
 * Never allows Yahoo old close as LIVE recovery.
 */
export function shouldRecoverLastFromQuote(opts: {
  expectFresh: boolean;
  source: string | null | undefined;
  lastPrintAgeMs: number | null | undefined;
  /** Defaults to LIVE_PRICE_MAX_AGE_MS (60s) — do not raise. */
  liveMaxAgeMs?: number;
}): boolean {
  if (!opts.expectFresh) return false;
  if (!isTickstreamLiveSource(opts.source)) return false;
  if (isYahooLastPrintSource(opts.source)) return false;
  const age = opts.lastPrintAgeMs;
  if (age == null || !Number.isFinite(age) || age < 0) return false;
  const maxAge = opts.liveMaxAgeMs ?? LIVE_PRICE_MAX_AGE_MS;
  return age <= maxAge;
}

export type ClosedVsBrokenUiKind =
  | "LIVE_OK"
  | "OPEN_STALE"
  | "OPEN_BROKEN"
  | "CLOSED_NORMAL"
  | "HOLIDAY_NORMAL"
  | "EARLY_CLOSE_NORMAL";

/** Map calendar + age onto UI messaging kind (thresholds unchanged). */
export function classifyClosedVsBrokenUi(opts: {
  marketState: CmeGlobexMarketState;
  expectFresh: boolean;
  lastPrintAgeMs: number | null | undefined;
  tickLiveMaxAgeMs?: number;
  liveMaxAgeMs?: number;
}): ClosedVsBrokenUiKind {
  const tickLive = opts.tickLiveMaxAgeMs ?? 2_000;
  const liveMax = opts.liveMaxAgeMs ?? LIVE_PRICE_MAX_AGE_MS;
  const age = opts.lastPrintAgeMs;

  if (!opts.expectFresh) {
    if (opts.marketState === "MARKET_HOLIDAY") return "HOLIDAY_NORMAL";
    if (opts.marketState === "MARKET_EARLY_CLOSE") return "EARLY_CLOSE_NORMAL";
    return "CLOSED_NORMAL";
  }

  if (age == null || !Number.isFinite(age)) return "OPEN_BROKEN";
  if (age <= tickLive) return "LIVE_OK";
  if (age <= liveMax) return "OPEN_STALE";
  return "OPEN_BROKEN";
}

export function uiMessageForClosedVsBroken(
  kind: ClosedVsBrokenUiKind,
  reason: string,
  lastPrintLabel?: string
): string {
  const last = lastPrintLabel ? ` · last @ ${lastPrintLabel}` : "";
  switch (kind) {
    case "LIVE_OK":
      return "Live";
    case "OPEN_STALE":
      return `Market open · data stale${last}`;
    case "OPEN_BROKEN":
      return `Market open · feed problem${last}`;
    case "HOLIDAY_NORMAL":
      return `${reason}${last}`;
    case "EARLY_CLOSE_NORMAL":
      return `${reason}${last}`;
    case "CLOSED_NORMAL":
    default:
      return `${reason}${last}`;
  }
}
