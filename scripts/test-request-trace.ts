import {
  createRequestTrace,
  markStage,
  mergeVoiceLatency,
  mergeChartExport,
  mergeObservations,
  markLlmGrounding,
  completeTrace,
  evaluateReleaseChecklist,
  exportSuccessRate,
  formatLivePipeline,
  traceHasFailure,
  RELEASE_THRESHOLDS,
} from "../lib/request-trace";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const trace = createRequestTrace("test-1", "Where is the last MSS?", true);
markStage(trace, "route", { status: "pass", route: "MARKET_SNAPSHOT", ms: 12 });
mergeVoiceLatency(trace, {
  totalMs: 2100,
  metrics: { timeToFinalTranscript: 980, timeToFirstResponse: 1500 },
  marks: { transcript_handoff: 980 },
});
mergeChartExport(trace, { ok: true, quality: "good", source: "tv_export", candleCount: 30 });
mergeObservations(trace, ["structure.mss"], false);
markLlmGrounding(trace, "snapshot", true);
markStage(trace, "response", { status: "pass", source: "snapshot", preview: "MSS at 25100" });
completeTrace(trace);

assert(trace.stages.route.status === "pass", "route pass");
assert(trace.stages.voice.ms === 2100, "voice ms");
assert(trace.stages.marketDataQuality.quality === "good", "export quality");
assert(!traceHasFailure(trace), "no failures");
assert(formatLivePipeline(trace).includes("✓ Route"), "pipeline format");

const failTrace = createRequestTrace("test-2", "bad", false);
markStage(failTrace, "apis", { status: "fail", reason: "timeout" });
completeTrace(failTrace);
assert(traceHasFailure(failTrace), "detect failure");

const checklist = evaluateReleaseChecklist({
  traces: [trace],
  goldenTestsPass: true,
  openCriticals: 0,
});
assert(checklist.pass, "checklist pass with good trace");
assert(RELEASE_THRESHOLDS.voiceTotalMs === 3000, "voice threshold");

const badVoice = createRequestTrace("v-slow", "hi", true);
markStage(badVoice, "voice", { status: "pass", ms: 4500 });
completeTrace(badVoice);
const badCheck = evaluateReleaseChecklist({ traces: [badVoice], goldenTestsPass: true });
assert(!badCheck.pass, "slow voice fails checklist");

assert(exportSuccessRate([trace, failTrace]) >= 0, "export rate computed");

console.log("test-request-trace: ok");
