/**
 * Desk tracker engine — orchestrates pending/confirm, state machine, timeline.
 */
import type { ChartSnapshotPayload } from "./chart-snapshot";
import { buildDeskMarketIntelligence, type DeskMarketIntelligence } from "./market-intelligence";
import {
  type DeskTrackerPhase,
  inferCloseTrigger,
  inferIntrabarTrigger,
  nextPhase,
  phaseLabel,
  statusColorForPhase,
} from "./desk-state-machine";
import {
  confirmEventsOnBarClose,
  detectPendingEvents,
  intrabarExecutionSignal,
  type TrackerEvent,
} from "./pending-events";
import {
  addTimelineEntry,
  getDecisionTimeline,
  getLatestTimelineEntry,
  transitionBrief,
  type TimelineEntry,
} from "./decision-timeline";
import type { TradingVerdict } from "./desk-schema";

export type DeskTrackerState = {
  phase: DeskTrackerPhase;
  status_color: "green" | "amber" | "red";
  phase_label: string;
  verdict: TradingVerdict | "—";
  last_close_time?: number;
  last_update: string;
  transition_brief: string;
  confirmed: TrackerEvent[];
  pending: TrackerEvent[];
  watching: string[];
  execution_signal: string | null;
  state_hash: string;
  timeline_id: string;
  price: number;
  htf_bias: string;
  nothing_changed: boolean;
};

let currentPhase: DeskTrackerPhase = "waiting";
let lastBarTimeSeen: number | null = null;

export function resetDeskTracker(): void {
  currentPhase = "waiting";
  lastBarTimeSeen = null;
}

export type TrackerInput = {
  chartSnapshot?: ChartSnapshotPayload | null;
  chartLastPrice?: number | null;
  candleClosed?: boolean;
  lastBarTime?: number | null;
  freeze?: boolean;
};

export async function runDeskTracker(input: TrackerInput): Promise<DeskTrackerState> {
  const intel = await buildDeskMarketIntelligence({
    chartSnapshot: input.chartSnapshot ?? null,
    chartLastPrice: input.chartLastPrice,
    forceFresh: input.candleClosed === true || input.chartLastPrice != null,
  });

  const livePrice = input.chartLastPrice ?? intel.state.lastPrice;
  const candles = intel.state.candles;
  const lastBar = candles.length ? candles[candles.length - 1] : null;
  const lastBarTime = input.lastBarTime ?? lastBar?.t ?? null;

  let candleClosed = input.candleClosed === true;
  if (lastBarTime != null && lastBarTimeSeen != null && lastBarTime > lastBarTimeSeen) {
    candleClosed = true;
  }
  if (lastBarTime != null) lastBarTimeSeen = lastBarTime;

  let pending = detectPendingEvents(intel.ctx, livePrice);
  let confirmed: TrackerEvent[] = [];
  let execution_signal: string | null = null;

  const intrabarTrig = inferIntrabarTrigger({
    phase: currentPhase,
    wickThroughLiquidity: pending.some((e) => e.id.startsWith("pending.sweep")),
    wickInFvg: pending.some((e) => e.concept === "fvg_entry"),
  });
  if (intrabarTrig) {
    currentPhase = nextPhase(currentPhase, intrabarTrig);
  }

  const exec = intrabarExecutionSignal(intel.ctx, livePrice);
  if (exec?.met && (currentPhase === "entry_watching" || currentPhase === "waiting_for_retrace")) {
    execution_signal = exec.detail;
    currentPhase = nextPhase(currentPhase, "wick_in_fvg_zone");
  }

  if (candleClosed && lastBar) {
    const closedBar = {
      t: lastBar.t,
      o: lastBar.o,
      h: lastBar.h,
      l: lastBar.l,
      c: lastBar.c,
    };
    const result = confirmEventsOnBarClose(pending, intel.ctx, closedBar);
    confirmed = result.confirmed;
    pending = result.stillPending;

    const mss = intel.ctx.structureFacts.mss;
    const sweepConfirmed = confirmed.some((e) => e.concept === "liquidity_sweep");
    const mssConfirmed = confirmed.some((e) => e.concept === "mss");
    const invalidated = confirmed.some((e) => e.concept === "invalidation");

    const closeTrig = inferCloseTrigger({
      phase: currentPhase,
      sweepConfirmed,
      mssConfirmed,
      fvgPresent: intel.observation.fvg.status === "present",
      invalidated,
      nearLiquidity: pending.some((e) => e.id === "pending.approach_pdh"),
    });
    if (closeTrig) {
      currentPhase = nextPhase(currentPhase, closeTrig);
    }

    if (intel.observation.data_quality === "missing") {
      currentPhase = "no_trade";
    }
  }

  if (currentPhase === "waiting" && pending.some((e) => e.id === "pending.approach_pdh")) {
    currentPhase = nextPhase(currentPhase, "approaching_liquidity");
  }

  const verdict: TradingVerdict | "—" =
    intel.observation.data_quality === "missing" || intel.observation.data_quality === "stale"
      ? "NO_TRADE"
      : candleClosed
        ? mapVerdict(intel)
        : getLatestTimelineEntry()?.verdict ?? mapVerdict(intel);

  const prevEntry = getLatestTimelineEntry();
  const watching = pending.map((p) => p.detail);
  const transition_brief = transitionBrief(prevEntry ?? null, {
    phase: currentPhase,
    verdict,
    confirmed,
    pending,
  });

  const nothing_changed =
    Boolean(prevEntry) &&
    prevEntry!.phase === currentPhase &&
    prevEntry!.verdict === verdict &&
    confirmed.length === 0;

  const shouldRecord = input.freeze || candleClosed || !prevEntry || !nothing_changed;

  let timeline_id = prevEntry?.id ?? "";
  if (shouldRecord) {
    const entry = addTimelineEntry({
      ts: new Date().toISOString(),
      bar_time: lastBarTime ?? undefined,
      price: livePrice,
      phase: currentPhase,
      status_color: statusColorForPhase(currentPhase),
      verdict,
      transition: transition_brief,
      what_changed: confirmed.map((c) => c.detail).join("; ") || (nothing_changed ? "Nothing changed" : "Intrabar watch"),
      watching: watching.slice(0, 4),
      pending_count: pending.length,
      state_hash: intel.state_hash,
      frozen: Boolean(input.freeze),
    });
    timeline_id = entry.id;
  }

  return {
    phase: currentPhase,
    status_color: statusColorForPhase(currentPhase),
    phase_label: phaseLabel(currentPhase),
    verdict,
    last_close_time: lastBarTime ?? undefined,
    last_update: new Date().toISOString(),
    transition_brief,
    confirmed,
    pending,
    watching,
    execution_signal,
    state_hash: intel.state_hash,
    timeline_id,
    price: livePrice,
    htf_bias: intel.observation.htf_bias.tradeable_bias,
    nothing_changed,
  };
}

function mapVerdict(intel: DeskMarketIntelligence): TradingVerdict {
  const d = intel.observation;
  if (d.data_quality === "missing") return "NO_TRADE";
  const bias = d.htf_bias.tradeable_bias;
  if (d.market_structure === "bullish" && bias === "bullish") return "LONG";
  if (d.market_structure === "bearish" && bias === "bearish") return "SHORT";
  if (d.market_structure === "unknown") return "NO_TRADE";
  return "WAIT";
}

export function getTrackerPhase(): DeskTrackerPhase {
  return currentPhase;
}

export { getLatestTimelineEntry, getDecisionTimeline, type TimelineEntry };
