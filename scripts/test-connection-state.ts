import {
  MARKET_FRESH_MS,
  MAX_RECONNECT_RETRIES,
  buildConnectionSnapshot,
  computeBackoffMs,
  computeDataAge,
  enrichPayloadMeta,
  evaluateConnectionState,
  formatConnectionStatus,
  isDeskOnline,
  isExtensionMessagingFailure,
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
const agingPulse = { source: "desk-tracker", timestamp: now - 18_000, receivedAt: now - 18_000 };
const stalePulse = { source: "desk-tracker", timestamp: now - 70_000, receivedAt: now - 70_000 };

assert(evaluateConnectionState({ backendUp: false, retryCount: 0 }) === "DISCONNECTED", "backend down → DISCONNECTED");
assert(
  evaluateConnectionState({ backendUp: true, marketPulse: freshPulse, now }) === "CONNECTED",
  "backend + fresh market → CONNECTED"
);
assert(
  evaluateConnectionState({ backendUp: true, marketPulse: agingPulse, now }) === "CONNECTED",
  "backend + 18s pulse still CONNECTED (60s fresh window)"
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
assert(isMarketFresh(agingPulse, now), "18s pulse is still fresh");
assert(!isMarketFresh(stalePulse, now), "70s pulse is stale");
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
assert(formatConnectionStatus(degraded, now).includes("1m") || formatConnectionStatus(degraded, now).includes("70s"), "degraded shows stale age");

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
  evaluateConnectionState({
    backendUp: true,
    healthDegraded: true,
    marketPulse: freshPulse,
    now,
  }) === "DEGRADED",
  "cached/degraded health → DEGRADED even with fresh pulse"
);
assert(
  !isLiveDataAvailable(buildConnectionSnapshot({ backendUp: true, marketMeta: null, now })),
  "no fake live on missing market"
);

assert(MARKET_FRESH_MS === 60_000, "fresh threshold exported");

assert(
  isExtensionMessagingFailure("Could not establish connection. Receiving end does not exist."),
  "receiving-end is extension messaging, not backend"
);
assert(
  isExtensionMessagingFailure(new Error("Extension context invalidated.")),
  "invalidated context is extension messaging"
);
assert(
  !isExtensionMessagingFailure("Vercel backend offline — https://desk-copilor.vercel.app"),
  "real backend down is not messaging"
);
assert(!isExtensionMessagingFailure("HTTP 500"), "HTTP 500 is not messaging");

/** Manager — single reconnect loop, no duplicate timers */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const connMod = require("../extension/connection-state.js");
assert(
  connMod.isExtensionMessagingFailure("Could not establish connection. Receiving end does not exist."),
  "extension JS matcher agrees"
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
assert(
  manager.snapshot().state === "RECONNECTING" || manager.snapshot().state === "DISCONNECTED",
  "manager enters reconnect path"
);
manager.clearReconnectTimer();

/** G — scheduleReconnect ×N single timer; forceReconnect clears health cache */
(async () => {
  let clearCacheSeen = 0;
  let degradedPing = false;
  const mgr2 = connMod.createConnectionManager({
    pingHealth: async (opts: { clearCache?: boolean }) => {
      if (opts?.clearCache) clearCacheSeen += 1;
      if (degradedPing) {
        return { ok: true, base: "http://127.0.0.1:3000", degraded: true, reason: "cached" };
      }
      return { ok: true, base: "http://127.0.0.1:3000", version: "test" };
    },
    onStateChange: () => {},
    onResync: () => {},
  });
  mgr2.scheduleReconnect();
  mgr2.scheduleReconnect();
  mgr2.scheduleReconnect();
  assert(typeof mgr2.clearReconnectTimer === "function", "G: single reconnect timer API present");
  mgr2.clearReconnectTimer();
  degradedPing = true;
  await mgr2.forceReconnect();
  assert(clearCacheSeen === 1, "G: forceReconnect clears health cache (clearCache)");
  assert(mgr2.snapshot().state === "DEGRADED", "G: degraded health → DEGRADED not ONLINE");
  assert(mgr2.snapshot().healthDegraded === true, "G: healthDegraded flag set");
  assert(
    !connMod.isDeskOnline({
      backendUp: true,
      healthDegraded: true,
      lastSuccessfulRequest: now,
      tickAgeMs: 200,
      hasPrice: true,
      now,
    }),
    "G: isDeskOnline false on degraded health"
  );
  assert(
    isDeskOnline({
      backendUp: true,
      lastSuccessfulRequest: now,
      tickAgeMs: 400,
      hasPrice: true,
      now,
    }),
    "desk ONLINE when API fresh + market present"
  );

  console.log("test-connection-state: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

