import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import type { DataQualityFlag } from "./desk-schema";

export type DataQualityIssue = {
  code: string;
  severity: "critical" | "warning";
  message: string;
  field?: string;
};

export type DataQualityReport = {
  flag: DataQualityFlag;
  score: number;
  issues: DataQualityIssue[];
  can_observe: boolean;
  can_decide: boolean;
  stale_sec?: number;
  timestamp_aligned: boolean;
};

const STALE_BAR_SEC = 120;
const MAX_TIMESTAMP_DRIFT_SEC = 90;

function flagFromIssues(issues: DataQualityIssue[]): DataQualityFlag {
  if (issues.some((i) => i.code === "missing_state" || i.code === "no_candles")) return "missing";
  if (issues.some((i) => i.severity === "critical")) return "stale";
  if (issues.length > 0) return "degraded";
  return "good";
}

/** Deterministic data quality audit before observation engine runs. */
export function auditDataQuality(
  ctx: MarketContext,
  state: MarketState
): DataQualityReport {
  const issues: DataQualityIssue[] = [];

  if (!state || !state.symbol) {
    issues.push({ code: "missing_state", severity: "critical", message: "MarketState missing or empty" });
  }

  if (!state.candles?.length) {
    issues.push({
      code: "no_candles",
      severity: "critical",
      message: "No OHLC candles in MarketState",
      field: "candles",
    });
  }

  if (state.lastPrice <= 0 || !Number.isFinite(state.lastPrice)) {
    issues.push({
      code: "invalid_price",
      severity: "critical",
      message: "Last price missing or invalid",
      field: "lastPrice",
    });
  }

  if (state.quality?.reasons?.length) {
    for (const r of state.quality.reasons) {
      issues.push({ code: "state_quality", severity: "warning", message: r });
    }
  }

  const drift = state.quality?.timestampDriftSec;
  let timestamp_aligned = true;
  if (drift != null && drift > MAX_TIMESTAMP_DRIFT_SEC) {
    timestamp_aligned = false;
    issues.push({
      code: "timestamp_drift",
      severity: "warning",
      message: `Chart bar timestamps drift ${drift}s from live price`,
      field: "quality.timestampDriftSec",
    });
  }

  let stale_sec: number | undefined;
  const lastBarTime = state.quality?.lastBarTime ?? state.candles.at(-1)?.t;
  if (lastBarTime) {
    stale_sec = Math.round((Date.now() - lastBarTime) / 1000);
    if (stale_sec > STALE_BAR_SEC) {
      issues.push({
        code: "stale_bar",
        severity: "critical",
        message: `Last bar is ${stale_sec}s old`,
        field: "candles[-1].t",
      });
    }
  }

  if (state.lastPriceSource === "yahoo" && !state.quality?.reasons?.includes("tradingview_tick")) {
    issues.push({
      code: "yahoo_only",
      severity: "warning",
      message: "Live price from Yahoo only — TradingView tick not attached",
      field: "lastPriceSource",
    });
  }

  if (!ctx.daily?.lastClose || ctx.daily.lastClose <= 0) {
    issues.push({
      code: "missing_context_price",
      severity: "warning",
      message: "MarketContext daily lastClose missing",
      field: "daily.lastClose",
    });
  }

  const flag = state.quality?.flag ?? flagFromIssues(issues);
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const score = Math.max(0, 100 - criticalCount * 35 - (issues.length - criticalCount) * 10);

  return {
    flag,
    score,
    issues,
    can_observe: flag === "good" || flag === "degraded",
    can_decide: flag === "good" || flag === "degraded",
    stale_sec,
    timestamp_aligned,
  };
}
