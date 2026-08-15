/**
 * Live latency instrumentation — measurement only; must not alter decision path.
 * Run: npm run test:live-latency-trace
 */
import {
  beginLiveLatencyTrace,
  buildLiveLatencyReport,
  emitLiveLatencyTraceIfEnabled,
  formatLiveLatencyReport,
  isLiveLatencyTraceEnabled,
  liveLatencyTimingsPayload,
  markLiveLatencyStage,
  patchLiveLatencyTraceMeta,
  resetLiveLatencyTraceForTests,
  snapshotLiveLatencyTrace,
  STAGE_MARK,
} from "../lib/live-latency-trace";
import {
  beginLiveLatency,
  clearLiveLatency,
  noteLlmUsage,
  snapshotLiveLatency,
} from "../lib/live-latency-profile";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// --- Pure report builder ---
const syntheticProfile = {
  requestId: "lat-test-1",
  marks: {
    [STAGE_MARK.request_received]: 0,
    [STAGE_MARK.intent_classified]: 12,
    [STAGE_MARK.market_data_started]: 15,
    [STAGE_MARK.market_data_complete]: 420,
    [STAGE_MARK.market_context_started]: 421,
    [STAGE_MARK.market_context_complete]: 1800,
    [STAGE_MARK.decision_envelope_complete]: 1850,
    [STAGE_MARK.llm_request_started]: 1900,
    [STAGE_MARK.llm_first_token]: 3200,
    [STAGE_MARK.sse_first_visible_token]: 3201,
    [STAGE_MARK.final_response]: 5100,
  },
};

const report = buildLiveLatencyReport(syntheticProfile, {
  requestType: "trading:CURRENT_MARKET_READ",
  cache: "MISS",
  missReason: "bars",
  barIdentity: "sym=MNQ|m1t=1",
  new1mBarInvalidation: true,
  tickstreamUsed: true,
  yahooFetched: false,
});
assert(!!report, "report built");
assert(report!.stages.request_received === 0, "request_received");
assert(report!.stages.intent_classified === 12, "intent_classified");
assert(report!.stages.market_data_started === 15, "market_data_started");
assert(report!.stages.market_data_complete === 420, "market_data_complete");
assert(report!.stages.market_context_started === 421, "market_context_started");
assert(report!.stages.market_context_complete === 1800, "market_context_complete");
assert(report!.stages.decision_envelope_complete === 1850, "decision_envelope_complete");
assert(report!.stages.llm_request_started === 1900, "llm_request_started");
assert(report!.stages.llm_first_token === 3200, "llm_first_token");
assert(report!.stages.sse_first_visible_token === 3201, "sse_first_visible_token");
assert(report!.stages.final_response === 5100, "final_response");
assert(report!.meta.totalMs === 5100, "totalMs");
assert(report!.meta.cache === "MISS", "cache MISS");
assert(report!.meta.missReason === "bars", "missReason");
assert(report!.meta.new1mBarInvalidation === true, "new1m");
assert(report!.meta.tickstreamUsed === true, "tickstream");
assert(report!.meta.yahooFetched === false, "yahooFetched");

const formatted = formatLiveLatencyReport(report!);
assert(formatted.includes("cache=MISS"), "format cache");
assert(formatted.includes("total=5100ms"), "format total");
assert(!formatted.includes("candles"), "no candles");

assert(buildLiveLatencyReport(null) === null, "null profile → null report");
assert(isLiveLatencyTraceEnabled({ LIVE_LATENCY_TRACE: "1" } as NodeJS.ProcessEnv), "env 1");
assert(isLiveLatencyTraceEnabled({ LIVE_LATENCY_TRACE: "true" } as NodeJS.ProcessEnv), "env true");
assert(!isLiveLatencyTraceEnabled({} as NodeJS.ProcessEnv), "env off");
assert(!isLiveLatencyTraceEnabled({ LIVE_LATENCY_TRACE: "0" } as NodeJS.ProcessEnv), "env 0");

// --- Instrumentation must not mutate decision / reply stand-ins ---
const envelope = Object.freeze({
  stance: "wait",
  thesis: "No tradeable opportunity yet",
  execution: Object.freeze({ entry: null, stop: null, target: null }),
});
const reply = "WAIT — no tradeable opportunity yet";
const baselineEnvelope = JSON.stringify(envelope);
const baselineReply = reply;

resetLiveLatencyTraceForTests();
beginLiveLatencyTrace("lat-decision-off", { requestType: "test" });
markLiveLatencyStage("intent_classified");
assert(JSON.stringify(envelope) === baselineEnvelope, "envelope unchanged after begin");
assert(reply === baselineReply, "reply unchanged after begin");

patchLiveLatencyTraceMeta({
  cache: "HIT",
  missReason: null,
  barIdentity: "test-bar",
  tickstreamUsed: false,
  yahooFetched: false,
});
for (const stage of [
  "market_data_started",
  "market_data_complete",
  "market_context_started",
  "market_context_complete",
  "decision_envelope_complete",
  "llm_request_started",
  "llm_first_token",
  "sse_first_visible_token",
  "final_response",
] as const) {
  markLiveLatencyStage(stage);
}

assert(JSON.stringify(envelope) === baselineEnvelope, "envelope unchanged after full marks");
assert(reply === baselineReply, "reply unchanged after full marks");

const snapOff = buildLiveLatencyReport(
  { requestId: "x", marks: { t1_backend: 0, t12_done: 10 } },
  { requestType: "off" }
);
const snapOn = buildLiveLatencyReport(
  { requestId: "x", marks: { t1_backend: 0, t12_done: 10 } },
  { requestType: "on", cache: "MISS", missReason: "bars" }
);
assert(snapOff!.stages.final_response === snapOn!.stages.final_response, "report builder pure on stages");
assert(JSON.stringify(envelope) === baselineEnvelope, "envelope still identical on/off report build");

const snap = snapshotLiveLatencyTrace();
assert(!!snap, "snapshot present");
assert(snap!.meta.requestType === "test", "meta requestType");
assert(snap!.stages.final_response != null, "final_response marked");

const payload = liveLatencyTimingsPayload();
assert(!!payload.liveLatency, "timings payload has liveLatency");
assert(!!payload.profile, "timings payload has profile");
assert(payload.profile!.requestId === "lat-decision-off", "profile id");

const emittedOff = emitLiveLatencyTraceIfEnabled({} as NodeJS.ProcessEnv);
assert(!!emittedOff, "emit returns report even when disabled");

const emittedOn = emitLiveLatencyTraceIfEnabled({ LIVE_LATENCY_TRACE: "1" } as NodeJS.ProcessEnv);
assert(!!emittedOn && emittedOn.meta.totalMs != null, "emit when enabled");

resetLiveLatencyTraceForTests();
assert(snapshotLiveLatency() === null, "cleared profile");
assert(snapshotLiveLatencyTrace() === null, "cleared trace");

// --- completion_tokens measurement hook (no OpenAI call) ---
beginLiveLatency("usage-unit");
noteLlmUsage({ prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 });
const usageSnap = snapshotLiveLatency();
assert(usageSnap?.counters.completion_tokens === 7, "noteLlmUsage sets completion_tokens");
assert(usageSnap?.counters.prompt_tokens === 10, "noteLlmUsage sets prompt_tokens");
assert(
  (usageSnap?.notes ?? []).includes("completion_tokens=7"),
  "noteLlmUsage notes completion_tokens"
);
const usageReport = buildLiveLatencyReport(
  { requestId: "usage-unit", marks: { t1_backend: 0, t12_done: 5 } },
  { requestType: "usage" }
);
assert(!!usageReport, "usage report builds");
assert(
  formatLiveLatencyReport(usageReport!).includes("completion_tokens=7"),
  "formatLiveLatencyReport includes completion_tokens"
);
assert(
  formatLiveLatencyReport(usageReport!).includes("prompt_tokens=10"),
  "formatLiveLatencyReport includes prompt_tokens"
);
assert(
  formatLiveLatencyReport(usageReport!).includes("total_tokens=17"),
  "formatLiveLatencyReport includes total_tokens"
);
noteLlmUsage(null);
assert(snapshotLiveLatency()?.counters.completion_tokens === 7, "null usage is no-op");
noteLlmUsage({ completion_tokens: -1 });
assert(snapshotLiveLatency()?.counters.completion_tokens === 7, "negative tokens ignored");
clearLiveLatency();

console.log("test-live-latency-trace: ok");
process.exit(0);
