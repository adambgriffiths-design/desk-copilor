/**
 * Connection reliability regressions — receiving-end vs invalidated,
 * stale-reload latch, hop health, duplicate socket, backoff.
 * Run: npx tsx scripts/test-connection-reliability.ts
 */
import {
  SW_WAKE_MAX_RETRIES,
  SW_WAKE_BACKOFF_MAX_MS,
  canConfidentlyAnalyse,
  classifyExtensionMessagingFailure,
  computeSwWakeBackoffMs,
  evaluateApiHopHealth,
  evaluateChatStreamHealth,
  evaluateMarketHopHealth,
  evaluateVoiceComponentHealth,
  formatHopHealthPanel,
  isDeskOnline,
  isExtensionContextInvalidated,
  isReceivingEndFailure,
  nextStaleReloadLatch,
  parseStaleReloadLatch,
  shouldAutoReloadForInvalidated,
  shouldOpenNewRealtimeSocket,
  shouldRetryReceivingEnd,
  buildHopHealthSnapshot,
} from "../lib/connection-state";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const RECEIVING_END = "Could not establish connection. Receiving end does not exist.";
const INVALIDATED = "Extension context invalidated.";

assert(classifyExtensionMessagingFailure(RECEIVING_END) === "receiving_end", "receiving-end classified");
assert(classifyExtensionMessagingFailure(new Error(RECEIVING_END)) === "receiving_end", "receiving-end Error");
assert(classifyExtensionMessagingFailure(INVALIDATED) === "invalidated", "invalidated classified");
assert(classifyExtensionMessagingFailure("Extension context invalidated.") === "invalidated", "context invalidated");
assert(classifyExtensionMessagingFailure("HTTP 500") === null, "HTTP 500 is not messaging");
assert(isReceivingEndFailure(RECEIVING_END), "isReceivingEndFailure");
assert(isExtensionContextInvalidated(INVALIDATED), "isExtensionContextInvalidated");
assert(!isExtensionContextInvalidated(RECEIVING_END), "receiving-end is not invalidated");
assert(!isReceivingEndFailure(INVALIDATED), "invalidated is not receiving-end");

assert(parseStaleReloadLatch("1") === null, "old permanent latch '1' does not block recovery");
assert(parseStaleReloadLatch(null) === null, "empty latch");
assert(parseStaleReloadLatch("{not json") === null, "malformed latch");
const latch = parseStaleReloadLatch(JSON.stringify({ version: "1.4.118", at: 1_700_000_000_000 }));
assert(latch?.version === "1.4.118" && latch.at === 1_700_000_000_000, "json latch parsed");

assert(
  shouldAutoReloadForInvalidated(null, "1.4.118", 1_700_000_060_000),
  "no latch → reload allowed"
);
assert(
  shouldAutoReloadForInvalidated({ version: "1.4.116", at: 1_700_000_000_000 }, "1.4.118", 1_700_000_010_000),
  "version change → reload allowed"
);
assert(
  !shouldAutoReloadForInvalidated({ version: "1.4.118", at: 1_700_000_000_000 }, "1.4.118", 1_700_000_010_000),
  "same version within 60s → no reload storm"
);
assert(
  shouldAutoReloadForInvalidated({ version: "1.4.118", at: 1_700_000_000_000 }, "1.4.118", 1_700_000_070_000),
  "same version after cooldown → reload allowed again"
);
const next = nextStaleReloadLatch("1.4.118", 42);
assert(next.version === "1.4.118" && next.at === 42, "next latch written");

assert(shouldRetryReceivingEnd(1, 4), "retry 1 of 4");
assert(shouldRetryReceivingEnd(3, 4), "retry 3 of 4");
assert(!shouldRetryReceivingEnd(4, 4), "no retry after max");
assert(!shouldRetryReceivingEnd(0, 4), "attempt 0 invalid");
assert(SW_WAKE_MAX_RETRIES === 4, "bounded wake retries");

const b1 = computeSwWakeBackoffMs(1, 0);
const b2 = computeSwWakeBackoffMs(2, 0);
const b3 = computeSwWakeBackoffMs(3, 0);
const b4 = computeSwWakeBackoffMs(4, 0);
assert(b1 === 300, "wake backoff 300");
assert(b2 === 600, "wake backoff 600");
assert(b3 === 1200, "wake backoff 1200");
assert(b4 === 2400, "wake backoff 2400");
assert(computeSwWakeBackoffMs(12, 0) === SW_WAKE_BACKOFF_MAX_MS, "wake backoff capped");
assert(b1 < b2 && b2 < b3 && b3 <= b4, "exponential");

assert(shouldOpenNewRealtimeSocket(null, false), "no socket → open");
assert(shouldOpenNewRealtimeSocket(3, false), "CLOSED → open");
assert(!shouldOpenNewRealtimeSocket(0, false), "CONNECTING → do not duplicate");
assert(!shouldOpenNewRealtimeSocket(1, false), "OPEN → do not duplicate");
assert(!shouldOpenNewRealtimeSocket(3, true), "in-flight → do not duplicate");

assert(evaluateMarketHopHealth({ tickAgeMs: 400, hasPrice: true }) === "CONNECTED", "fresh tick CONNECTED");
assert(evaluateMarketHopHealth({ tickAgeMs: 5000, hasPrice: true }) === "DEGRADED", "open socket no fresh ticks = DEGRADED");
assert(evaluateMarketHopHealth({ tickAgeMs: 70_000, hasPrice: true }) === "DISCONNECTED", "tick older than 60s = DISCONNECTED");
assert(evaluateMarketHopHealth({ hasPrice: false }) === "DISCONNECTED", "no price DISCONNECTED");
assert(!canConfidentlyAnalyse("DEGRADED"), "no confident analysis on stale ticks");
assert(!canConfidentlyAnalyse("DISCONNECTED"), "no confident analysis when disconnected");
assert(canConfidentlyAnalyse("CONNECTED"), "fresh ticks can analyse");

assert(
  evaluateApiHopHealth({ backendUp: true, lastSuccessfulRequest: 1_700_000_000_000, now: 1_700_000_010_000 }) ===
    "CONNECTED",
  "fresh API success CONNECTED"
);
assert(
  evaluateApiHopHealth({ backendUp: true, lastSuccessfulRequest: 1_700_000_000_000, now: 1_700_000_090_000 }) ===
    "DEGRADED",
  "stale API success DEGRADED even if health socket existed"
);
assert(
  evaluateApiHopHealth({ backendUp: true, lastSuccessfulRequest: null, now: 1_700_000_000_000 }) === "DEGRADED",
  "backend up but no successful request = DEGRADED"
);
assert(
  evaluateApiHopHealth({ backendUp: false, reconnecting: true, retryCount: 2 }) === "RECONNECTING",
  "API reconnecting"
);
assert(evaluateApiHopHealth({ backendUp: false, retryCount: 0 }) === "DISCONNECTED", "API down");

assert(evaluateVoiceComponentHealth({ sessionActive: true }) === "CONNECTED", "STT session CONNECTED");
assert(evaluateVoiceComponentHealth({ connecting: true }) === "CONNECTING", "STT connecting");
assert(evaluateVoiceComponentHealth({ failed: true, sessionActive: true }) === "FAILED", "STT failed wins");
assert(evaluateVoiceComponentHealth({}) === "DISCONNECTED", "STT off");
assert(
  evaluateVoiceComponentHealth({ sessionActive: true }) !==
    evaluateVoiceComponentHealth({ sessionActive: false, failed: true }),
  "STT and TTS can differ"
);
assert(evaluateChatStreamHealth({}) === "READY", "chat ready");
assert(evaluateChatStreamHealth({ busy: true }) === "BUSY", "chat busy");
assert(evaluateChatStreamHealth({ failed: true }) === "FAILED", "chat failed");

const deskNow = 1_700_000_000_000;
assert(
  !isDeskOnline({
    backendUp: false,
    tickAgeMs: 400,
    hasPrice: true,
    now: deskNow,
  }),
  "desk ONLINE false when API down (TV tick alone insufficient)"
);
assert(
  !isDeskOnline({
    backendUp: true,
    lastSuccessfulRequest: deskNow,
    healthDegraded: true,
    tickAgeMs: 400,
    hasPrice: true,
    now: deskNow,
  }),
  "desk ONLINE false on cached health"
);
assert(
  isDeskOnline({
    backendUp: true,
    lastSuccessfulRequest: deskNow,
    tickAgeMs: 400,
    hasPrice: true,
    now: deskNow,
  }),
  "desk ONLINE true when API fresh + market present"
);
assert(
  !isDeskOnline({
    backendUp: true,
    lastSuccessfulRequest: deskNow,
    tickAgeMs: 400,
    hasPrice: true,
    chatFailed: true,
    now: deskNow,
  }),
  "desk ONLINE false when chat hop failed"
);

const hop = buildHopHealthSnapshot({
  tickAgeMs: 5000,
  lastPrice: 30229.5,
  backendUp: true,
  lastApiSuccessAt: 1_700_000_000_000,
  sttActive: false,
  ttsActive: false,
  sttFailed: false,
  ttsFailed: true,
  chatBusy: false,
  reconnecting: false,
  now: 1_700_000_010_000,
});
assert(hop.market === "DEGRADED", "market hop independent");
assert(hop.api === "CONNECTED", "api hop independent of stale ticks");
assert(hop.stt === "DISCONNECTED", "stt independent");
assert(hop.tts === "FAILED", "tts independent of stt");
assert(hop.chatStream === "READY", "chat independent");
assert(hop.reconnect === "IDLE", "reconnect idle");

const panel = formatHopHealthPanel(hop, 1_700_000_010_000);
assert(panel.includes("MARKET FEED: DEGRADED"), "panel market");
assert(panel.includes("API: CONNECTED"), "panel api");
assert(panel.includes("STT: DISCONNECTED"), "panel stt");
assert(panel.includes("TTS: FAILED"), "panel tts");
assert(panel.includes("CHAT STREAM: READY"), "panel chat");
assert(panel.includes("PRICE: 30229.5"), "panel price");

// Simulated recovery: receiving-end retries then success — never auto-reload.
let reloads = 0;
let sends = 0;
function simulateBgSend(failures: number) {
  const max = SW_WAKE_MAX_RETRIES;
  for (let attempt = 1; attempt <= max; attempt++) {
    sends += 1;
    if (attempt <= failures) {
      const err = RECEIVING_END;
      if (classifyExtensionMessagingFailure(err) === "invalidated") reloads += 1;
      if (shouldRetryReceivingEnd(attempt, max)) continue;
      return { ok: false, reloads };
    }
    return { ok: true, reloads, sends };
  }
  return { ok: false, reloads, sends };
}
const recovered = simulateBgSend(2);
assert(recovered.ok === true, "receiving-end recovers without reload");
assert(recovered.reloads === 0, "receiving-end does not reload the tab");
assert(sends === 3, "two failures then success");

sends = 0;
const exhausted = simulateBgSend(8);
assert(exhausted.ok === false, "exhausted wake retries fail closed");
assert(exhausted.reloads === 0, "exhaustion still does not reload");
assert(sends === SW_WAKE_MAX_RETRIES, "does not retry-storm past max");

const connMod = require("../extension/connection-state.js");
assert(connMod.classifyExtensionMessagingFailure(RECEIVING_END) === "receiving_end", "extension JS classify");
assert(connMod.parseStaleReloadLatch("1") === null, "extension JS old latch");
assert(!connMod.shouldOpenNewRealtimeSocket(1, false), "extension JS no duplicate OPEN socket");
assert(connMod.evaluateMarketHopHealth({ tickAgeMs: 5000, hasPrice: true }) === "DEGRADED", "extension JS stale tick");
assert(!connMod.canConfidentlyAnalyse("DEGRADED"), "extension JS no confident stale analysis");
assert(typeof connMod.isDeskOnline === "function", "extension JS exports isDeskOnline");
assert(
  !connMod.isDeskOnline({ backendUp: false, tickAgeMs: 100, hasPrice: true, now: 1_700_000_000_000 }),
  "extension JS desk ONLINE ignores TV-only"
);

let pingCalls = 0;
const manager = connMod.createConnectionManager({
  pingHealth: async () => {
    pingCalls += 1;
    return { ok: false, error: "backend down" };
  },
  onStateChange: () => {},
  onResync: () => {},
});
manager.scheduleReconnect();
manager.scheduleReconnect();
manager.scheduleReconnect();
assert(pingCalls === 0, "duplicate scheduleReconnect does not fire extra pings immediately");
manager.clearReconnectTimer();

console.log("test-connection-reliability: ok");
process.exit(0);
