/**
 * Header status mapping — KAREN DEGRADED must not fire for Whisper cascade
 * while she can still listen/read.
 * Desk ONLINE must not OR TV Last / DEGRADED+backendUp into green LIVE.
 */
import { createRequire } from "module";
import {
  canConfidentlyAnalyse,
  evaluateApiHopHealth,
  evaluateChatStreamHealth,
  evaluateConnectionState,
  evaluateMarketHopHealth,
  isDeskOnline,
} from "../lib/connection-state";

const require = createRequire(import.meta.url);
const {
  mapKarenStatus,
  isKarenVoiceDownState,
  isKarenReadyOnline,
  mapConnectionToDataStatus,
} = require("../extension/desk-ui-components.js") as {
  mapKarenStatus: (
    phase: string,
    opts?: {
      listening?: boolean;
      speaking?: boolean;
      degraded?: boolean;
      connecting?: boolean;
      engineMode?: string;
      backendUp?: boolean;
      connState?: string;
      tvLive?: boolean;
      deskOnline?: boolean;
      healthDegraded?: boolean;
      apiHop?: string;
      marketHop?: string;
      chatHop?: string;
    }
  ) => string;
  isKarenReadyOnline: (opts?: Record<string, unknown>) => boolean;
  isKarenVoiceDownState: (opts: {
    autoVoice?: boolean;
    userOff?: boolean;
    listening?: boolean;
    speaking?: boolean;
    connecting?: boolean;
    engineMode?: string;
    realtimeActive?: boolean;
    realtimeWants?: boolean;
  }) => boolean;
  mapConnectionToDataStatus: (conn: {
    backendUp?: boolean;
    state?: string;
    healthDegraded?: boolean;
  }) => string;
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
  console.log("ok:", msg);
}

assert(
  mapKarenStatus("idle", { listening: true, degraded: true }) === "LISTENING",
  "cascade + listening is LISTENING, not DEGRADED"
);
assert(
  mapKarenStatus("idle", { speaking: true, degraded: true }) === "THINKING",
  "speaking wins over degraded"
);
assert(
  mapKarenStatus("idle", { listening: false, speaking: false, degraded: true }) === "DEGRADED",
  "voice actually down → DEGRADED"
);
assert(
  mapKarenStatus("idle", { listening: false, speaking: false, degraded: false }) === "READY",
  "idle + no online signal → grey READY"
);
assert(
  mapKarenStatus("idle", { backendUp: true, connState: "CONNECTED" }) === "LIVE",
  "idle + CONNECTED → LIVE green"
);
assert(
  mapKarenStatus("idle", { backendUp: true, connState: "DEGRADED" }) === "READY",
  "idle + DEGRADED with backendUp → grey READY (not desk ONLINE)"
);
assert(
  mapKarenStatus("idle", { tvLive: true, connState: "FAILED", backendUp: false }) === "READY",
  "idle + tvLive alone → grey READY (MARKET LIVE ≠ desk ONLINE)"
);
assert(
  !isKarenReadyOnline({ tvLive: true, connState: "DISCONNECTED", backendUp: false }),
  "tvLive does not make isKarenReadyOnline"
);
assert(
  !isKarenReadyOnline({ backendUp: true, connState: "DEGRADED" }),
  "DEGRADED+backendUp does not make isKarenReadyOnline"
);
assert(
  isKarenReadyOnline({ deskOnline: true }) === true,
  "explicit deskOnline → ready online"
);
assert(
  isKarenReadyOnline({ healthDegraded: true, connState: "CONNECTED" }) === false,
  "cached/degraded health never ready-online"
);
assert(
  mapKarenStatus("idle", { backendUp: false, connState: "RECONNECTING" }) === "READY",
  "idle + reconnecting → grey READY"
);
assert(
  mapKarenStatus("listening", { backendUp: true, connState: "CONNECTED" }) === "LISTENING",
  "listening stays purple even when online"
);
assert(
  mapKarenStatus("thinking", { backendUp: true, connState: "CONNECTED" }) === "THINKING",
  "thinking stays blue even when online"
);
assert(
  mapKarenStatus("analyzing", { backendUp: true, connState: "CONNECTED" }) === "ANALYZING",
  "analyzing stays blue even when online"
);
assert(
  mapKarenStatus("idle", { connecting: true, degraded: true }) === "WAITING",
  "connecting is WAITING, not DEGRADED"
);
assert(
  mapKarenStatus("idle", { engineMode: "cascade", listening: false, degraded: true }) ===
    "LISTENING",
  "cascade session is LISTENING even if listen flag dropped"
);
assert(
  mapKarenStatus("idle", { engineMode: "realtime", listening: false, degraded: true }) ===
    "LISTENING",
  "realtime session is LISTENING during reconnect gap"
);
assert(
  isKarenVoiceDownState({ autoVoice: true, engineMode: "cascade" }) === false,
  "cascade engine is not voice-down"
);
assert(
  isKarenVoiceDownState({ autoVoice: true, connecting: true }) === false,
  "connecting is not voice-down"
);
assert(
  isKarenVoiceDownState({ autoVoice: true, realtimeWants: true }) === false,
  "realtime wants-active is not voice-down"
);
assert(
  isKarenVoiceDownState({ autoVoice: true, engineMode: "off", listening: false }) === true,
  "auto-voice on + engine off + not listening → DEGRADED"
);
assert(
  isKarenVoiceDownState({ autoVoice: false, engineMode: "off" }) === false,
  "auto-voice off is not DEGRADED"
);
assert(
  mapConnectionToDataStatus({ backendUp: true, state: "DEGRADED" }) === "STALE",
  "connection DEGRADED maps DATA to STALE (TV Last must not override)"
);
assert(
  mapConnectionToDataStatus({ backendUp: true, state: "CONNECTED" }) === "LIVE",
  "CONNECTED → DATA LIVE"
);

const now = 1_700_000_000_000;

/** A — Fresh tick, backend down: MARKET LIVE OK; desk ONLINE false */
assert(evaluateMarketHopHealth({ tickAgeMs: 400, hasPrice: true }) === "CONNECTED", "A: MARKET LIVE");
assert(
  !isDeskOnline({
    backendUp: false,
    lastSuccessfulRequest: null,
    tickAgeMs: 400,
    hasPrice: true,
    now,
  }),
  "A: fresh tick + DISCONNECTED → not desk ONLINE"
);

/** B — backendUp, pulse/API stale → DEGRADED; not ONLINE */
assert(
  evaluateConnectionState({
    backendUp: true,
    marketPulse: { source: "t", timestamp: now - 70_000, receivedAt: now - 70_000 },
    now,
  }) === "DEGRADED",
  "B: stale pulse → DEGRADED"
);
assert(
  !isDeskOnline({
    backendUp: true,
    lastSuccessfulRequest: now - 90_000,
    tickAgeMs: 70_000,
    hasPrice: true,
    now,
  }),
  "B: not desk ONLINE when stale"
);

/** C — healthDegraded/cached local → not ONLINE */
assert(
  evaluateConnectionState({
    backendUp: true,
    healthDegraded: true,
    marketPulse: { source: "t", timestamp: now - 200, receivedAt: now - 200 },
    now,
  }) === "DEGRADED",
  "C: cached health → DEGRADED even with fresh pulse"
);
assert(
  !isDeskOnline({
    backendUp: true,
    healthDegraded: true,
    lastSuccessfulRequest: now,
    tickAgeMs: 200,
    hasPrice: true,
    now,
  }),
  "C: healthDegraded never desk ONLINE"
);

/** D — API success 90s ago → API hop DEGRADED */
assert(
  evaluateApiHopHealth({
    backendUp: true,
    lastSuccessfulRequest: now - 90_000,
    now,
  }) === "DEGRADED",
  "D: API success 90s ago → DEGRADED"
);

/** E — Tick age 5s → market DEGRADED; canConfidentlyAnalyse false */
assert(evaluateMarketHopHealth({ tickAgeMs: 5000, hasPrice: true }) === "DEGRADED", "E: tick 5s DEGRADED");
assert(!canConfidentlyAnalyse("DEGRADED"), "E: no confident analysis");

/** F — Chat hop failed blocks ONLINE */
assert(evaluateChatStreamHealth({ failed: true }) === "FAILED", "F: chat FAILED");
assert(
  !isDeskOnline({
    backendUp: true,
    lastSuccessfulRequest: now,
    tickAgeMs: 400,
    hasPrice: true,
    chatFailed: true,
    now,
  }),
  "F: chat failed blocks desk ONLINE"
);
assert(
  isDeskOnline({
    backendUp: true,
    lastSuccessfulRequest: now,
    tickAgeMs: 400,
    hasPrice: true,
    now,
  }),
  "F control: healthy path is desk ONLINE"
);

console.log("PASS test-desk-ui-status");
