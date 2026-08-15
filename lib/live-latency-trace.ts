/**
 * Lightweight live trading latency instrumentation.
 * Measurement + structured report only — never changes decisions or market logic.
 *
 * Enable: LIVE_LATENCY_TRACE=1 (console + SSE timings.liveLatency).
 * Always-on path still records marks via live-latency-profile; this module formats them.
 */

import {
  beginLiveLatency,
  clearLiveLatency,
  getLiveLatency,
  markLiveLatency,
  snapshotLiveLatency,
  type LiveLatencyProfile,
} from "./live-latency-profile";

export const LIVE_LATENCY_STAGES = [
  "request_received",
  "intent_classified",
  "market_data_started",
  "market_data_complete",
  "market_context_started",
  "market_context_complete",
  "decision_envelope_complete",
  "llm_request_started",
  "llm_first_token",
  "sse_first_visible_token",
  "final_response",
] as const;

export type LiveLatencyStage = (typeof LIVE_LATENCY_STAGES)[number];

/** Internal mark names (compat with existing tN profile marks). */
export const STAGE_MARK: Record<LiveLatencyStage, string> = {
  request_received: "t1_backend",
  intent_classified: "t2_intent",
  market_data_started: "t3_market_data_begin",
  market_data_complete: "t4_live_price",
  market_context_started: "t5_context_begin",
  market_context_complete: "t6_context_complete",
  decision_envelope_complete: "t7_envelope",
  llm_request_started: "t8_llm_begin",
  llm_first_token: "t9_first_llm_token",
  sse_first_visible_token: "t11_first_sse",
  final_response: "t12_done",
};

export type LiveLatencyCacheResult = "HIT" | "MISS" | "N/A";

export type LiveLatencyDataMode = "LIVE" | "HISTORICAL_FIXTURE";

export type LiveLatencyTraceMeta = {
  requestType?: string | null;
  cache?: LiveLatencyCacheResult | null;
  missReason?: string | null;
  barIdentity?: string | null;
  /** True when miss reason is bars (new 1m / fingerprint change). */
  new1mBarInvalidation?: boolean | null;
  tickstreamUsed?: boolean | null;
  yahooFetched?: boolean | null;
  /** HISTORICAL_FIXTURE = PIT fixture path — not live-market latency. */
  dataMode?: LiveLatencyDataMode | null;
  fixtureId?: string | null;
};

export type LiveLatencyTraceReport = {
  requestId: string;
  stages: Record<LiveLatencyStage, number | null>;
  meta: {
    requestType: string | null;
    cache: LiveLatencyCacheResult;
    missReason: string | null;
    barIdentity: string | null;
    new1mBarInvalidation: boolean | null;
    tickstreamUsed: boolean | null;
    yahooFetched: boolean | null;
    dataMode: LiveLatencyDataMode | null;
    fixtureId: string | null;
    totalMs: number | null;
  };
};

type TraceState = {
  meta: LiveLatencyTraceMeta;
};

let state: TraceState | null = null;

export function isLiveLatencyTraceEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const v = env.LIVE_LATENCY_TRACE;
  if (v == null || v === "") return false;
  return v === "1" || /^true$/i.test(v) || /^yes$/i.test(v);
}

/** Pure: map profile marks + meta → structured report. No side effects. */
export function buildLiveLatencyReport(
  profile: Pick<LiveLatencyProfile, "requestId" | "marks"> | null | undefined,
  meta: LiveLatencyTraceMeta = {}
): LiveLatencyTraceReport | null {
  if (!profile) return null;
  const stages = {} as Record<LiveLatencyStage, number | null>;
  for (const stage of LIVE_LATENCY_STAGES) {
    const mark = STAGE_MARK[stage];
    const ms = profile.marks[mark];
    stages[stage] = typeof ms === "number" && Number.isFinite(ms) ? Math.round(ms) : null;
  }
  // Compat: older runs marked t3_market_data after Yahoo only — treat as data complete if no begin mark.
  if (stages.market_data_started == null && typeof profile.marks.t3_market_data === "number") {
    stages.market_data_started = Math.round(profile.marks.t3_market_data);
  }
  const finalMs = stages.final_response;
  const cache: LiveLatencyCacheResult =
    meta.cache === "HIT" || meta.cache === "MISS" || meta.cache === "N/A"
      ? meta.cache
      : "N/A";
  return {
    requestId: profile.requestId,
    stages,
    meta: {
      requestType: meta.requestType ?? null,
      cache,
      missReason: meta.missReason ?? null,
      barIdentity: meta.barIdentity ?? null,
      new1mBarInvalidation:
        meta.new1mBarInvalidation ??
        (meta.missReason === "bars" ? true : meta.missReason != null ? false : null),
      tickstreamUsed: meta.tickstreamUsed ?? null,
      yahooFetched: meta.yahooFetched ?? null,
      dataMode: meta.dataMode ?? null,
      fixtureId: meta.fixtureId ?? null,
      totalMs: finalMs,
    },
  };
}

export function formatLiveLatencyReport(report: LiveLatencyTraceReport): string {
  const stageBits = LIVE_LATENCY_STAGES.map((s) => {
    const ms = report.stages[s];
    return `${s}=${ms == null ? "-" : `${ms}ms`}`;
  }).join(" ");
  const m = report.meta;
  const profile = snapshotLiveLatency();
  const completion =
    typeof profile?.counters.completion_tokens === "number"
      ? `completion_tokens=${profile.counters.completion_tokens}`
      : null;
  const prompt =
    typeof profile?.counters.prompt_tokens === "number"
      ? `prompt_tokens=${profile.counters.prompt_tokens}`
      : null;
  const totalTok =
    typeof profile?.counters.total_tokens === "number"
      ? `total_tokens=${profile.counters.total_tokens}`
      : null;
  return [
    `[live-latency] req=${report.requestId}`,
    `type=${m.requestType ?? "-"}`,
    `cache=${m.cache}`,
    m.missReason ? `miss=${m.missReason}` : null,
    m.barIdentity ? `bar=${m.barIdentity}` : null,
    m.new1mBarInvalidation != null ? `new1m=${m.new1mBarInvalidation}` : null,
    m.tickstreamUsed != null ? `tickstream=${m.tickstreamUsed}` : null,
    m.yahooFetched != null ? `yahooFetched=${m.yahooFetched}` : null,
    m.dataMode ? `dataMode=${m.dataMode}` : null,
    m.fixtureId ? `fixture=${m.fixtureId}` : null,
    m.totalMs != null ? `total=${m.totalMs}ms` : null,
    prompt,
    completion,
    totalTok,
    stageBits,
  ]
    .filter(Boolean)
    .join(" ");
}

export function beginLiveLatencyTrace(
  requestId: string,
  meta: LiveLatencyTraceMeta = {}
): void {
  beginLiveLatency(requestId);
  state = { meta: { ...meta } };
  markLiveLatency(STAGE_MARK.request_received);
}

export function patchLiveLatencyTraceMeta(patch: Partial<LiveLatencyTraceMeta>): void {
  if (!state) {
    if (!getLiveLatency()) return;
    state = { meta: {} };
  }
  state.meta = { ...state.meta, ...patch };
}

export function markLiveLatencyStage(stage: LiveLatencyStage, at = Date.now()): number {
  return markLiveLatency(STAGE_MARK[stage], at);
}

export function getLiveLatencyTraceMeta(): LiveLatencyTraceMeta {
  return { ...(state?.meta ?? {}) };
}

/** Snapshot structured report from current profile + meta. Pure w.r.t. decision path. */
export function snapshotLiveLatencyTrace(): LiveLatencyTraceReport | null {
  return buildLiveLatencyReport(snapshotLiveLatency(), state?.meta ?? {});
}

/** Emit compact console line when LIVE_LATENCY_TRACE=1. Never throws. */
export function emitLiveLatencyTraceIfEnabled(
  env: NodeJS.ProcessEnv = process.env
): LiveLatencyTraceReport | null {
  const report = snapshotLiveLatencyTrace();
  if (!report) return null;
  if (isLiveLatencyTraceEnabled(env)) {
    try {
      console.log(formatLiveLatencyReport(report));
    } catch {
      /* ignore logging failures */
    }
  }
  return report;
}

/** Compact payload for SSE done.timings — no market bars / payloads. */
export function liveLatencyTimingsPayload(): {
  liveLatency: LiveLatencyTraceReport | null;
  profile: LiveLatencyProfile | null;
} {
  return {
    liveLatency: snapshotLiveLatencyTrace(),
    profile: snapshotLiveLatency(),
  };
}

/** Test helper: clear module state without touching market/decision caches. */
export function resetLiveLatencyTraceForTests(): void {
  state = null;
  clearLiveLatency();
}
