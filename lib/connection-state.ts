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
};

export const MARKET_FRESH_MS = 15_000;
export const MARKET_STALE_MS = 60_000;
export const MAX_RECONNECT_RETRIES = 10;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;

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
    return `DEGRADED — Backend ✓ Market state ✕ Last update: ${ageLabel}`;
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
