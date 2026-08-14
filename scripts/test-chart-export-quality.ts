import {
  buildExportTraceRecord,
  buildChartExportUnavailableMessage,
  classifyExportQuality,
  computeBarAgeMs,
  computeExportRetryDelayMs,
  exportTimeoutForAttempt,
  hasStructuredChartData,
  isChartQualityUsable,
  parseChartSnapshotInput,
  scoreChartQuality,
  shouldRetryExportAttempt,
} from "../lib/chart-snapshot";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const nowSec = 1_700_000_000;

function candles(n: number, start = nowSec - n * 60) {
  return Array.from({ length: n }, (_, i) => ({
    t: start + i * 60,
    o: 25090 + i * 0.25,
    h: 25105 + i * 0.25,
    l: 25085 + i * 0.25,
    c: 25100 + i * 0.25,
    v: 1200,
  }));
}

// --- quality classification ---
assert(classifyExportQuality({ source: "tv_export", candleCount: 30, reasons: [] }) === "good", "good export");
assert(
  classifyExportQuality({
    source: "tv_export",
    candleCount: 30,
    reasons: ["drawing_export_failed"],
    exportPartial: false,
  }) === "degraded",
  "drawing failure -> degraded"
);
assert(
  classifyExportQuality({
    source: "tv_export",
    candleCount: 30,
    reasons: ["export_partial_failure"],
    exportPartial: true,
  }) === "partial",
  "partial export"
);
assert(
  classifyExportQuality({
    source: "tv_export",
    candleCount: 30,
    reasons: ["stale_last_bar"],
  }) === "stale",
  "stale bar"
);
assert(
  classifyExportQuality({
    source: "none",
    reason: "widget_not_found",
    candleCount: 0,
    reasons: ["export_failed"],
  }) === "missing",
  "widget missing -> missing"
);

// --- usable gate: degraded + partial pass, stale fails ---
assert(isChartQualityUsable({ quality: "degraded", reasons: [], candleCount: 30, drawingCount: 0 }), "degraded usable");
assert(isChartQualityUsable({ quality: "partial", reasons: [], candleCount: 30, drawingCount: 0 }), "partial usable");
assert(!isChartQualityUsable({ quality: "stale", reasons: ["stale_last_bar"], candleCount: 30, drawingCount: 0 }), "stale blocked");
assert(!isChartQualityUsable({ quality: "missing", reasons: ["export_failed"], candleCount: 0, drawingCount: 0 }), "missing blocked");

const degradedSnap = parseChartSnapshotInput({
  ok: true,
  source: "tv_export",
  candles: candles(25),
  qualityMeta: {
    quality: "degraded",
    reasons: ["drawing_export_failed"],
    candleCount: 25,
    drawingCount: 0,
  },
});
assert(degradedSnap != null && hasStructuredChartData(degradedSnap), "degraded passes hasStructured");

const partialSnap = parseChartSnapshotInput({
  ok: true,
  source: "tv_export",
  candles: candles(25),
  sync: { exportPartial: true },
  qualityMeta: {
    quality: "partial",
    reasons: ["export_partial_failure"],
    candleCount: 25,
    drawingCount: 0,
    exportPartial: true,
  },
});
assert(partialSnap != null && hasStructuredChartData(partialSnap), "partial passes hasStructured");

const staleSnap = parseChartSnapshotInput({
  ok: false,
  source: "tv_export",
  candles: candles(25, nowSec - 25 * 60 - 500),
  qualityMeta: {
    quality: "stale",
    reasons: ["stale_last_bar"],
    candleCount: 25,
    drawingCount: 0,
    lastBarAgeSec: 500,
  },
});
assert(staleSnap != null && !hasStructuredChartData(staleSnap), "stale fails hasStructured");

// --- instrumentation record shape ---
const trace = buildExportTraceRecord({
  requestId: "req-1",
  attempt: 1,
  exportStartTs: 1000,
  exportCompleteTs: 1450,
  snap: {
    ok: true,
    symbol: "MNQ1!",
    timeframe: "1",
    candles: candles(30),
    quality: "good",
    qualityMeta: { quality: "good", reasons: [], candleCount: 30, drawingCount: 0 },
    sync: { widgetFound: true },
  },
  currentLivePrice: 25100.25,
  expectedSymbol: "MNQ1!",
  expectedTimeframe: "1",
});
assert(trace.requestId === "req-1", "trace requestId");
assert(trace.durationMs === 450, "trace duration");
assert(trace.widgetFound === true, "trace widgetFound");
assert(trace.candleCount === 30, "trace candleCount");
assert(trace.firstCandleTs != null && trace.lastCandleTs != null, "trace candle ts");
assert(trace.currentLivePrice === 25100.25, "trace live price");
assert(trace.quality === "good", "trace quality");
assert(Array.isArray(trace.qualityRejectionReasons), "trace reasons array");
assert(trace.symbolMatch === true && trace.timeframeMatch === true, "symbol/tf match");

// --- retry/backoff ---
assert(computeExportRetryDelayMs(0) === 0, "no delay on first attempt");
assert(computeExportRetryDelayMs(1) === 400, "400ms backoff");
assert(computeExportRetryDelayMs(2) === 900, "900ms backoff");
assert(exportTimeoutForAttempt(0) === 3500, "fast timeout first");
assert(exportTimeoutForAttempt(1) === 4500, "retry timeout");

assert(shouldRetryExportAttempt({ reason: "widget_not_found", ok: false }, 1), "retry widget_not_found");
assert(shouldRetryExportAttempt({ reason: "timeout", ok: false }, 1), "retry timeout");
assert(!shouldRetryExportAttempt({ reason: "timeout", ok: false }, 3), "stop after max attempts");
assert(!shouldRetryExportAttempt({ ok: true, reason: undefined }, 1), "no retry on success");

// --- bar age ---
const age = computeBarAgeMs(nowSec, nowSec * 1000 + 5000);
assert(age === 5000, "bar age ms");

// --- scoreChartQuality partial path ---
const scored = scoreChartQuality(
  {
    ok: true,
    source: "tv_export",
    candles: candles(30),
    drawings: [],
    sync: { exportPartial: true, widgetFound: true },
    visibleRange: { from: nowSec - 3600, to: nowSec },
  },
  nowSec
);
assert(scored.quality === "partial", "scoreChartQuality partial");

// --- unavailable message includes reason snippet ---
const msg = buildChartExportUnavailableMessage(["stale_last_bar", "export_failed"]);
assert(msg.includes("stale"), "message includes stale reason");
assert(msg.includes("No call"), "message keeps NO_CALL base");
const timeoutMsg = buildChartExportUnavailableMessage(["export_failed", "export_partial_failure"], undefined, "timeout");
assert(timeoutMsg.includes("timed out"), "bridge reason preferred over partial flag");
assert(!timeoutMsg.includes("export_partial"), "partial not shown on hard timeout failure");

console.log("test-chart-export-quality: ok");
