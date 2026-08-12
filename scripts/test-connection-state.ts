import {
  MARKET_FRESH_MS,
  MAX_RECONNECT_RETRIES,
  buildConnectionSnapshot,
  computeBackoffMs,
  computeDataAge,
  enrichPayloadMeta,
  evaluateConnectionState,
  formatConnectionStatus,
  isLiveDataAvailable,
  isMarketFresh,
  LIVE_DATA_UNAVAILABLE_VERDICT,
  transitionState,
} from "../lib/connection-state";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = 1_700_000_000_000;
const freshPulse = { source: "desk-tracker", timestamp: now - 420, receivedAt: now - 420 };
const stalePulse = { source: "desk-tracker", timestamp: now - 18_000, receivedAt: now - 18_000 };

assert(evaluateConnectionState({ backendUp: false, retryCount: 0 }) === "DISCONNECTED", "backend down → DISCONNECTED");
assert(
  evaluateConnectionState({ backendUp: true, marketPulse: freshPulse, now }) === "CONNECTED",
  "backend + fresh market → CONNECTED"
);
assert(
  evaluateConnectionState({ backendUp: true, marketPulse: stalePulse, now }) === "DEGRADED",
  "backend + stale market → DEGRADED"
);
assert(
  evaluateConnectionState({ backendUp: false, reconnecting: true, retryCount: MAX_RECONNECT_RETRIES }) === "FAILED",
  "exhausted retries → FAILED"
);
assert(
  evaluateConnectionState({ backendUp: false, reconnecting: true, retryCount: 2 }) === "RECONNECTING",
  "retry in flight → RECONNECTING"
);

assert(isMarketFresh(freshPulse, now), "420ms pulse is fresh");
assert(!isMarketFresh(stalePulse, now), "18s pulse is stale");
assert(computeDataAge(freshPulse, now) === 420, "data age computed");

const connected = buildConnectionSnapshot({
  backendUp: true,
  marketMeta: freshPulse,
  backendVersion: "1.4.60",
  apiBaseUrl: "https://desk-copilor.vercel.app",
  now,
});
assert(isLiveDataAvailable(connected), "CONNECTED implies live data");
assert(formatConnectionStatus(connected, now).includes("LIVE"), "status line shows LIVE");
assert(formatConnectionStatus(connected, now).includes("420ms"), "status line shows age");

const degraded = buildConnectionSnapshot({
  backendUp: true,
  marketMeta: stalePulse,
  now,
});
assert(!isLiveDataAvailable(degraded), "DEGRADED is not live");
assert(formatConnectionStatus(degraded, now).includes("DEGRADED"), "status shows DEGRADED");
assert(formatConnectionStatus(degraded, now).includes("18s"), "degraded shows stale age");

const t = transitionState("DISCONNECTED", "CONNECTING", "probe");
assert(t?.from === "DISCONNECTED" && t.to === "CONNECTING", "transition recorded");
assert(transitionState("CONNECTED", "CONNECTED", "noop") === null, "same state no transition");

const enriched = enrichPayloadMeta({ foo: 1 }, connected, now);
assert(enriched._connection.connectionState === "CONNECTED", "payload meta attached");
assert(enriched._connection.stale === false, "connected payload not stale");
assert(enriched._connection.dataAge === 420, "payload dataAge");

const staleEnriched = enrichPayloadMeta({ foo: 1 }, degraded, now);
assert(staleEnriched._connection.stale === true, "degraded payload marked stale");

assert(LIVE_DATA_UNAVAILABLE_VERDICT.verdict.includes("WAIT"), "blocked verdict is WAIT");
assert(LIVE_DATA_UNAVAILABLE_VERDICT.spokenBrief.includes("live data unavailable"), "blocked spoken brief");

const b1 = computeBackoffMs(1, 0);
const b2 = computeBackoffMs(2, 0);
assert(b2 >= b1, "backoff increases");
assert(b1 >= 1000, "minimum backoff");

/** Simulated failure modes */
assert(evaluateConnectionState({ backendUp: false, retryCount: 1 }) === "RECONNECTING", "404/500 → reconnecting");
assert(
  evaluateConnectionState({ backendUp: true, marketPulse: null, now }) === "DEGRADED",
  "missing market state → DEGRADED not CONNECTED"
);
assert(
  !isLiveDataAvailable(buildConnectionSnapshot({ backendUp: true, marketMeta: null, now })),
  "no fake live on missing market"
);

assert(MARKET_FRESH_MS === 15_000, "fresh threshold exported");

/** Manager — single reconnect loop, no duplicate timers */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const connMod = require("../extension/connection-state.js");
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
assert(
  manager.snapshot().state === "RECONNECTING" || manager.snapshot().state === "DISCONNECTED",
  "manager enters reconnect path"
);
manager.clearReconnectTimer();

console.log("test-connection-state: ok");
process.exit(0);
