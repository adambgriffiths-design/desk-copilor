import { getEstDateKey } from "../../market-data";
import { resolveSessionContext } from "../../sessions";
import type { BacktestSetupResult, BacktestStatistics } from "./types";
import { computeBacktestStatistics } from "./statistics";

export type StatBreakdown = {
  totalSetups: number;
  wins: number;
  losses: number;
  ambiguous: number;
  winRate: number;
  avgR: number;
  medianR: number;
  expectancy: number;
};

export type BaselineStatistics = BacktestStatistics & {
  medianR: number;
  breakdown: {
    byDirection: Record<string, StatBreakdown>;
    byTimeframe: Record<string, StatBreakdown>;
    bySetupType: Record<string, StatBreakdown>;
    bySession: Record<string, StatBreakdown>;
    byMonth: Record<string, StatBreakdown>;
    byWeekDay: Record<string, StatBreakdown>;
  };
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function breakdownFor(setups: BacktestSetupResult[]): StatBreakdown {
  const wins = setups.filter((s) => s.outcome === "WIN").length;
  const losses = setups.filter((s) => s.outcome === "LOSS").length;
  const ambiguous = setups.filter((s) => s.outcome === "AMBIGUOUS").length;
  const decisive = wins + losses;
  const rValues = setups.map((s) => s.result_R);
  return {
    totalSetups: setups.length,
    wins,
    losses,
    ambiguous,
    winRate: decisive > 0 ? round4(wins / decisive) : 0,
    avgR: round4(rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0),
    medianR: round4(median(rValues)),
    expectancy: round4(rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0),
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    const k = keyFn(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

function setupTypeOf(s: BacktestSetupResult): string {
  const t = s.features.setupType ?? s.features.setup_type;
  return typeof t === "string" ? t : "unknown";
}

function sessionOf(s: BacktestSetupResult): string {
  const sess = s.features.session;
  if (typeof sess === "string") return sess;
  try {
    const ctx = resolveSessionContext(new Date(s.timestamp));
    return ctx.id;
  } catch {
    return "unknown";
  }
}

function monthOf(s: BacktestSetupResult): string {
  return getEstDateKey(new Date(s.timestamp)).slice(0, 7);
}

function weekDayOf(s: BacktestSetupResult): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[new Date(s.timestamp).getUTCDay()] ?? "unknown";
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function computeBaselineStatistics(setups: BacktestSetupResult[]): BaselineStatistics {
  const base = computeBacktestStatistics(setups);
  const rValues = setups.map((s) => s.result_R);

  const mapBreakdown = (groups: Record<string, BacktestSetupResult[]>) => {
    const out: Record<string, StatBreakdown> = {};
    for (const [k, v] of Object.entries(groups)) {
      out[k] = breakdownFor(v);
    }
    return out;
  };

  return {
    ...base,
    medianR: round4(median(rValues)),
    breakdown: {
      byDirection: mapBreakdown(groupBy(setups, (s) => s.direction)),
      byTimeframe: mapBreakdown(groupBy(setups, (s) => s.timeframe)),
      bySetupType: mapBreakdown(groupBy(setups, setupTypeOf)),
      bySession: mapBreakdown(groupBy(setups, sessionOf)),
      byMonth: mapBreakdown(groupBy(setups, monthOf)),
      byWeekDay: mapBreakdown(groupBy(setups, weekDayOf)),
    },
  };
}
