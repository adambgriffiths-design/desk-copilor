/**
 * Connection lifecycle — health alone ≠ CONNECTED.
 * CONNECTED requires backend up + fresh market state.
 */

export type ConnectionStateName =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "DEGRADED"
  | "RECONNECTING"
  | "FAILED";

export type ConnectionTransition = {
  from: ConnectionStateName;
  to: ConnectionStateName;
  reason: string;
  at: number;
};

export type MarketPulse = {
  source: string;
  timestamp: number;
  receivedAt: number;
  symbol?: string;
  timeframe?: string;
  version?: string;
};

export type ConnectionSnapshot = {
  state: ConnectionStateName;
  backendUp: boolean;
  marketFresh: boolean;
  /** True when last health was cached/degraded — never desk ONLINE. */
  healthDegraded?: boolean;
  backendVersion: string | null;
  apiBaseUrl: string | null;
  lastSuccessfulRequest: number | null;
  lastSuccessfulMarketUpdate: number | null;
  lastError: string | null;
  retryCount: number;
  dataAge: number | null;
  marketMeta: MarketPulse | null;
  lastTransition: ConnectionTransition | null;
  transitions: ConnectionTransition[];
};

export type EvaluateInput = {
  backendUp: boolean;
  backendVersion?: string | null;
  apiBaseUrl?: string | null;
  marketPulse?: MarketPulse | null;
  now?: number;
  retryCount?: number;
  maxRetries?: number;
  lastError?: string | null;
  lastSuccessfulRequest?: number | null;
  reconnecting?: boolean;
  /** Cached/trusted-local health — never qualifies as desk ONLINE. */
  healthDegraded?: boolean;
};

/** Pulse younger than this counts as CONNECTED. 15s caused LIVE/DEGRADED flicker. */
export const MARKET_FRESH_MS = 60_000;
export const MARKET_STALE_MS = 60_000;
export const MAX_RECONNECT_RETRIES = 10;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;
/** MV3 service-worker wake — not a page reload. */
export const SW_WAKE_MAX_RETRIES = 4;
export const SW_WAKE_BACKOFF_BASE_MS = 300;
export const SW_WAKE_BACKOFF_MAX_MS = 2_400;
export const INVALIDATED_RELOAD_COOLDOWN_MS = 60_000;
export const API_FRESH_MS = 60_000;
export const TICK_LIVE_MS = 2_000;
export const TICK_STALE_MS = 60_000;

export function computeDataAge(pulse: MarketPulse | null | undefined, now = Date.now()): number | null {
  if (!pulse) return null;
  const anchor = pulse.receivedAt || pulse.timestamp;
  if (!Number.isFinite(anchor)) return null;
  return Math.max(0, now - anchor);
}

export function isMarketFresh(pulse: MarketPulse | null | undefined, now = Date.now()): boolean {
  const age = computeDataAge(pulse, now);
  return age != null && age <= MARKET_FRESH_MS;
}

export function isLiveDataAvailable(snapshot: Pick<ConnectionSnapshot, "state">): boolean {
  return snapshot.state === "CONNECTED";
}

export type ExtensionMessagingKind = "invalidated" | "receiving_end" | null;

export type StaleReloadLatch = {
  version: string;
  at: number;
};

export type HopHealthState = ConnectionStateName;
export type ChatStreamHealth = "READY" | "BUSY" | "FAILED";
export type ReconnectHealth = "IDLE" | "ATTEMPTING";

export type HopHealthSnapshot = {
  market: HopHealthState;
  api: HopHealthState;
  stt: HopHealthState;
  tts: HopHealthState;
  chatStream: ChatStreamHealth;
  reconnect: ReconnectHealth;
  lastTickAt: number | null;
  lastPrice: number | null;
  lastApiSuccessAt: number | null;
  lastSttAt: number | null;
  lastTtsAt: number | null;
  lastError: string | null;
};

/** Chrome MV3: orphaned content script or sleeping service worker — not a Vercel outage. */
export function classifyExtensionMessagingFailure(err: unknown): ExtensionMessagingKind {
  const m = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  if (m.includes("invalidated") || m.includes("extension context")) return "invalidated";
  if (m.includes("receiving end") || m.includes("could not establish connection")) return "receiving_end";
  return null;
}

export function isExtensionMessagingFailure(err: unknown): boolean {
  return classifyExtensionMessagingFailure(err) != null;
}

export function isReceivingEndFailure(err: unknown): boolean {
  return classifyExtensionMessagingFailure(err) === "receiving_end";
}

export function isExtensionContextInvalidated(err: unknown): boolean {
  return classifyExtensionMessagingFailure(err) === "invalidated";
}

/** Old latch was the string "1" and blocked recovery for the whole tab session. */
export function parseStaleReloadLatch(raw: string | null | undefined): StaleReloadLatch | null {
  if (!raw || raw === "1") return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const rec = v as { version?: unknown; at?: unknown };
    if (typeof rec.version !== "string" || typeof rec.at !== "number" || !Number.isFinite(rec.at)) {
      return null;
    }
    return { version: rec.version, at: rec.at };
  } catch {
    return null;
  }
}

export function shouldAutoReloadForInvalidated(
  latch: StaleReloadLatch | null,
  version: string,
  now = Date.now(),
  cooldownMs = INVALIDATED_RELOAD_COOLDOWN_MS
): boolean {
  if (!latch) return true;
  if (latch.version !== version) return true;
  return now - latch.at >= cooldownMs;
}

export function nextStaleReloadLatch(version: string, now = Date.now()): StaleReloadLatch {
  return { version, at: now };
}

export function computeSwWakeBackoffMs(attempt: number, jitter = 0): number {
  const exp = Math.min(
    SW_WAKE_BACKOFF_MAX_MS,
    SW_WAKE_BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempt - 1))
  );
  const jitterMs = jitter > 0 ? Math.floor(Math.random() * jitter) : 0;
  return exp + jitterMs;
}

export function shouldRetryReceivingEnd(attempt: number, max = SW_WAKE_MAX_RETRIES): boolean {
  return attempt >= 1 && attempt < max;
}

/** WebSocket.CONNECTING = 0, OPEN = 1 — do not open a second Realtime socket. */
export function shouldOpenNewRealtimeSocket(
  readyState: number | null | undefined,
  connectInFlight: boolean
): boolean {
  if (connectInFlight) return false;
  if (readyState === 0 || readyState === 1) return false;
  return true;
}

export function evaluateMarketHopHealth(input: {
  tickAgeMs?: number | null;
  hasPrice?: boolean;
}): HopHealthState {
  const age = input.tickAgeMs;
  const hasPrice = input.hasPrice === true || (age != null && Number.isFinite(age));
  if (age != null && age <= TICK_LIVE_MS) return "CONNECTED";
  if (hasPrice && (age == null || age <= TICK_STALE_MS)) return "DEGRADED";
  return "DISCONNECTED";
}

export function evaluateApiHopHealth(input: {
  backendUp?: boolean;
  lastSuccessfulRequest?: number | null;
  reconnecting?: boolean;
  retryCount?: number;
  now?: number;
}): HopHealthState {
  const now = input.now ?? Date.now();
  const retryCount = input.retryCount ?? 0;
  if (!input.backendUp) {
    if (input.reconnecting && retryCount >= MAX_RECONNECT_RETRIES) return "FAILED";
    if (input.reconnecting || retryCount > 0) return "RECONNECTING";
    return retryCount >= MAX_RECONNECT_RETRIES ? "FAILED" : "DISCONNECTED";
  }
  const last = input.lastSuccessfulRequest;
  if (last == null) return "DEGRADED";
  if (now - last <= API_FRESH_MS) return "CONNECTED";
  return "DEGRADED";
}

export function evaluateVoiceComponentHealth(input: {
  sessionActive?: boolean;
  connecting?: boolean;
  failed?: boolean;
  lastActivityAt?: number | null;
}): HopHealthState {
  if (input.failed) return "FAILED";
  if (input.connecting) return "CONNECTING";
  if (input.sessionActive) return "CONNECTED";
  return "DISCONNECTED";
}

export function evaluateChatStreamHealth(input: { busy?: boolean; failed?: boolean }): ChatStreamHealth {
  if (input.failed) return "FAILED";
  if (input.busy) return "BUSY";
  return "READY";
}

/** Fresh ticks required — a live socket with no prints is not a confident live read. */
export function canConfidentlyAnalyse(marketHop: HopHealthState): boolean {
  return marketHop === "CONNECTED";
}

/**
 * DESK ONLINE — request path usable (not TV Last).
 * Requires API hop CONNECTED + market hop not DISCONNECTED.
 * Cached/degraded health and failed chat never qualify.
 */
export function isDeskOnline(input: {
  backendUp?: boolean;
  lastSuccessfulRequest?: number | null;
  lastApiSuccessAt?: number | null;
  healthDegraded?: boolean;
  tickAgeMs?: number | null;
  hasPrice?: boolean;
  apiHop?: HopHealthState;
  marketHop?: HopHealthState;
  chatHop?: ChatStreamHealth;
  chatFailed?: boolean;
  reconnecting?: boolean;
  retryCount?: number;
  now?: number;
}): boolean {
  if (input.healthDegraded === true) return false;
  const now = input.now ?? Date.now();
  const api =
    input.apiHop ||
    evaluateApiHopHealth({
      backendUp: input.backendUp,
      lastSuccessfulRequest: input.lastSuccessfulRequest ?? input.lastApiSuccessAt,
      reconnecting: input.reconnecting,
      retryCount: input.retryCount,
      now,
    });
  const market =
    input.marketHop ||
    evaluateMarketHopHealth({
      tickAgeMs: input.tickAgeMs,
      hasPrice: input.hasPrice === true,
    });
  if (api !== "CONNECTED") return false;
  if (market === "DISCONNECTED") return false;
  if (input.chatHop === "FAILED" || input.chatFailed === true) return false;
  return true;
}

export function buildHopHealthSnapshot(input: {
  tickAgeMs?: number | null;
  lastPrice?: number | null;
  lastTickAt?: number | null;
  backendUp?: boolean;
  lastApiSuccessAt?: number | null;
  reconnecting?: boolean;
  retryCount?: number;
  sttActive?: boolean;
  ttsActive?: boolean;
  sttConnecting?: boolean;
  ttsConnecting?: boolean;
  sttFailed?: boolean;
  ttsFailed?: boolean;
  lastSttAt?: number | null;
  lastTtsAt?: number | null;
  chatBusy?: boolean;
  chatFailed?: boolean;
  lastError?: string | null;
  now?: number;
}): HopHealthSnapshot {
  const now = input.now ?? Date.now();
  const market = evaluateMarketHopHealth({
    tickAgeMs: input.tickAgeMs,
    hasPrice: Number.isFinite(input.lastPrice as number),
  });
  const api = evaluateApiHopHealth({
    backendUp: input.backendUp,
    lastSuccessfulRequest: input.lastApiSuccessAt,
    reconnecting: input.reconnecting,
    retryCount: input.retryCount,
    now,
  });
  return {
    market,
    api,
    stt: evaluateVoiceComponentHealth({
      sessionActive: input.sttActive,
      connecting: input.sttConnecting,
      failed: input.sttFailed,
      lastActivityAt: input.lastSttAt,
    }),
    tts: evaluateVoiceComponentHealth({
      sessionActive: input.ttsActive,
      connecting: input.ttsConnecting,
      failed: input.ttsFailed,
      lastActivityAt: input.lastTtsAt,
    }),
    chatStream: evaluateChatStreamHealth({ busy: input.chatBusy, failed: input.chatFailed }),
    reconnect: input.reconnecting ? "ATTEMPTING" : "IDLE",
    lastTickAt: input.lastTickAt ?? (input.tickAgeMs != null ? now - input.tickAgeMs : null),
    lastPrice: Number.isFinite(input.lastPrice as number) ? (input.lastPrice as number) : null,
    lastApiSuccessAt: input.lastApiSuccessAt ?? null,
    lastSttAt: input.lastSttAt ?? null,
    lastTtsAt: input.lastTtsAt ?? null,
    lastError: input.lastError ?? null,
  };
}

export function formatHopHealthPanel(hop: HopHealthSnapshot, now = Date.now()): string {
  const ts = (v: number | null) => (v ? new Date(v).toISOString() : "—");
  const age = (v: number | null) => (v == null ? "—" : `${Math.max(0, now - v)}ms ago`);
  return [
    `MARKET FEED: ${hop.market}`,
    `LAST TICK: ${ts(hop.lastTickAt)} (${age(hop.lastTickAt)})`,
    `PRICE: ${hop.lastPrice != null ? hop.lastPrice : "—"}`,
    `API: ${hop.api}`,
    `LAST API SUCCESS: ${ts(hop.lastApiSuccessAt)} (${age(hop.lastApiSuccessAt)})`,
    `STT: ${hop.stt}`,
    `TTS: ${hop.tts}`,
    `CHAT STREAM: ${hop.chatStream}`,
    `RECONNECT: ${hop.reconnect}`,
    hop.lastError ? `LAST ERROR: ${hop.lastError}` : "LAST ERROR: —",
  ].join("\n");
}

export function computeBackoffMs(retryCount: number, jitter = 0): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, Math.max(0, retryCount - 1)));
  const jitterMs = jitter > 0 ? Math.floor(Math.random() * jitter) : 0;
  return exp + jitterMs;
}

export function evaluateConnectionState(input: EvaluateInput): ConnectionStateName {
  const now = input.now ?? Date.now();
  const retryCount = input.retryCount ?? 0;
  const maxRetries = input.maxRetries ?? MAX_RECONNECT_RETRIES;
  const marketFresh = isMarketFresh(input.marketPulse ?? null, now);

  if (!input.backendUp) {
    if (input.reconnecting && retryCount >= maxRetries) return "FAILED";
    if (input.reconnecting || retryCount > 0) return "RECONNECTING";
    return retryCount >= maxRetries ? "FAILED" : "DISCONNECTED";
  }

  // Cached/degraded health is never CONNECTED / desk ONLINE.
  if (input.healthDegraded) return "DEGRADED";

  if (input.reconnecting) {
    return marketFresh ? "CONNECTED" : "DEGRADED";
  }

  if (marketFresh) return "CONNECTED";
  return "DEGRADED";
}

export function transitionState(
  current: ConnectionStateName,
  next: ConnectionStateName,
  reason: string,
  at = Date.now()
): ConnectionTransition | null {
  if (current === next) return null;
  return { from: current, to: next, reason, at };
}

export function buildConnectionSnapshot(input: EvaluateInput & { state?: ConnectionStateName; marketMeta?: MarketPulse | null; transitions?: ConnectionTransition[]; lastTransition?: ConnectionTransition | null }): ConnectionSnapshot {
  const now = input.now ?? Date.now();
  const marketMeta = input.marketMeta ?? input.marketPulse ?? null;
  const dataAge = computeDataAge(marketMeta, now);
  const state =
    input.state ??
    evaluateConnectionState({
      ...input,
      marketPulse: marketMeta,
      now,
    });

  return {
    state,
    backendUp: Boolean(input.backendUp),
    marketFresh: isMarketFresh(marketMeta, now),
    healthDegraded: input.healthDegraded === true,
    backendVersion: input.backendVersion ?? null,
    apiBaseUrl: input.apiBaseUrl ?? null,
    lastSuccessfulRequest: input.lastSuccessfulRequest ?? null,
    lastSuccessfulMarketUpdate: marketMeta?.receivedAt ?? null,
    lastError: input.lastError ?? null,
    retryCount: input.retryCount ?? 0,
    dataAge,
    marketMeta,
    lastTransition: input.lastTransition ?? null,
    transitions: input.transitions ?? [],
  };
}

export function enrichPayloadMeta<T extends Record<string, unknown>>(
  payload: T,
  snapshot: ConnectionSnapshot,
  now = Date.now()
): T & {
  _connection: {
    source: string;
    timestamp: number;
    receivedAt: number;
    version: string | null;
    symbol: string | null;
    timeframe: string | null;
    dataAge: number | null;
    connectionState: ConnectionStateName;
    stale: boolean;
  };
} {
  const meta = snapshot.marketMeta;
  const receivedAt = meta?.receivedAt ?? now;
  return {
    ...payload,
    _connection: {
      source: meta?.source ?? "unknown",
      timestamp: meta?.timestamp ?? receivedAt,
      receivedAt,
      version: snapshot.backendVersion,
      symbol: meta?.symbol ?? null,
      timeframe: meta?.timeframe ?? null,
      dataAge: snapshot.dataAge,
      connectionState: snapshot.state,
      stale: snapshot.state !== "CONNECTED",
    },
  };
}

export function formatConnectionStatus(snapshot: ConnectionSnapshot, now = Date.now()): string {
  const ageMs = snapshot.dataAge;
  const ageLabel =
    ageMs == null
      ? "no market update"
      : ageMs < 1000
        ? `${ageMs}ms ago`
        : ageMs < 60_000
          ? `${Math.round(ageMs / 1000)}s ago`
          : `${Math.round(ageMs / 60_000)}m ago`;

  if (snapshot.state === "CONNECTED") {
    return `LIVE — Backend ✓ Market data ✓ Market state ✓ Last update: ${ageLabel}`;
  }
    if (snapshot.state === "DEGRADED") {
      return `DEGRADED — Backend ✓ Market state ✕ Last update: ${ageLabel} · Click RECONNECT to refresh desk data`;
    }
  if (snapshot.state === "RECONNECTING") {
    return `RECONNECTING — attempt ${snapshot.retryCount} · ${snapshot.lastError || "checking backend…"}`;
  }
  if (snapshot.state === "FAILED") {
    return `FAILED — ${snapshot.lastError || "exhausted retries"} · click RECONNECT`;
  }
  if (snapshot.state === "CONNECTING") {
    return "CONNECTING — probing backend…";
  }
  return `OFFLINE — ${snapshot.lastError || "backend unreachable"}`;
}

export function formatDiagnosticsPanel(snapshot: ConnectionSnapshot): string {
  const lines = [
    `state: ${snapshot.state}`,
    `backend: ${snapshot.backendUp ? "up" : "down"}${snapshot.backendVersion ? ` (v${snapshot.backendVersion})` : ""}`,
    `market: ${snapshot.marketFresh ? "fresh" : "stale/missing"}`,
    `dataAge: ${snapshot.dataAge == null ? "—" : `${snapshot.dataAge}ms`}`,
    `apiBaseUrl: ${snapshot.apiBaseUrl || "—"}`,
    `lastSuccessfulRequest: ${snapshot.lastSuccessfulRequest ? new Date(snapshot.lastSuccessfulRequest).toISOString() : "—"}`,
    `lastSuccessfulMarketUpdate: ${snapshot.lastSuccessfulMarketUpdate ? new Date(snapshot.lastSuccessfulMarketUpdate).toISOString() : "—"}`,
    `retryCount: ${snapshot.retryCount}`,
    `lastError: ${snapshot.lastError || "—"}`,
  ];
  if (snapshot.lastTransition) {
    lines.push(
      `lastTransition: ${snapshot.lastTransition.from} → ${snapshot.lastTransition.to} (${snapshot.lastTransition.reason})`
    );
  }
  return lines.join("\n");
}

export const LIVE_DATA_UNAVAILABLE_VERDICT = {
  verdict:
    "VERDICT: WAIT\nSETUP: none — live data unavailable\nHTF BIAS: unknown\nENTRY: —\nINVALIDATION: —\nTARGET: —\nR:R: —\nDATA QUALITY: OFFLINE\nFINAL REASONING: WAIT / NO TRADE — LIVE DATA UNAVAILABLE",
  spokenBrief: "Wait — live data unavailable. Reconnect the desk before trading on this read.",
  panel: "WAIT / NO TRADE — LIVE DATA UNAVAILABLE",
  _liveDataBlocked: true,
};
