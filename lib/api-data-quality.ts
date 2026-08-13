import type { DeskMarketIntelligence } from "./market-intelligence";
import { auditDataQuality } from "./data-quality-check";

export type ApiDataQuality = "LIVE" | "DEGRADED" | "STALE" | "UNAVAILABLE";

export type ApiDataQualityReport = {
  dataQuality: ApiDataQuality;
  canDecide: boolean;
  reasons: string[];
};

export function resolveApiDataQuality(
  intel: DeskMarketIntelligence,
  chartLastPrice?: number | null
): ApiDataQualityReport {
  const audit = auditDataQuality(intel.ctx, intel.state);
  const obs = intel.observation;
  const reasons: string[] = [];
  const price = chartLastPrice ?? intel.state.lastPrice;

  if (!audit.can_observe || obs.data_quality === "missing") {
    if (!audit.can_observe) reasons.push("market state unavailable");
    if (obs.data_quality === "missing") reasons.push("observation data missing");
    return { dataQuality: "UNAVAILABLE", canDecide: false, reasons };
  }
  if (obs.data_quality === "stale" || audit.flag === "stale") {
    reasons.push("market data stale");
    return { dataQuality: "STALE", canDecide: false, reasons };
  }
  if (!(price > 0 && Number.isFinite(price))) {
    reasons.push("current price unknown");
    return { dataQuality: "DEGRADED", canDecide: false, reasons };
  }
  if (obs.htf_bias.tradeable_bias === "unknown") {
    reasons.push("tradeable bias unknown");
  }
  if (obs.data_quality === "degraded" || !audit.can_decide || reasons.length) {
    return {
      dataQuality: "DEGRADED",
      canDecide: false,
      reasons: reasons.length ? reasons : ["degraded market observations"],
    };
  }
  return { dataQuality: "LIVE", canDecide: true, reasons: [] };
}

export function attachApiDataQuality<T extends Record<string, unknown>>(
  payload: T,
  report: ApiDataQualityReport
): T & { dataQuality: ApiDataQuality; dataQualityReasons: string[]; canDecide: boolean } {
  return {
    ...payload,
    dataQuality: report.dataQuality,
    dataQualityReasons: report.reasons,
    canDecide: report.canDecide,
  };
}
