/**
 * Extension connection lifecycle — shared between background + content.
 */
(function (root) {
  const MARKET_FRESH_MS = 15000;
  const MAX_RECONNECT_RETRIES = 10;
  const BACKOFF_BASE_MS = 1000;
  const BACKOFF_MAX_MS = 60000;

  function computeDataAge(pulse, now = Date.now()) {
    if (!pulse) return null;
    const anchor = pulse.receivedAt || pulse.timestamp;
    if (!Number.isFinite(anchor)) return null;
    return Math.max(0, now - anchor);
  }

  function isMarketFresh(pulse, now = Date.now()) {
    const age = computeDataAge(pulse, now);
    return age != null && age <= MARKET_FRESH_MS;
  }

  function isLiveDataAvailable(snapshot) {
    return snapshot?.state === "CONNECTED";
  }

  function computeBackoffMs(retryCount, jitter = 250) {
    const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, Math.max(0, retryCount - 1)));
    return exp + (jitter > 0 ? Math.floor(Math.random() * jitter) : 0);
  }

  function evaluateConnectionState(input) {
    const now = input.now ?? Date.now();
    const retryCount = input.retryCount ?? 0;
    const maxRetries = input.maxRetries ?? MAX_RECONNECT_RETRIES;
    const marketFresh = isMarketFresh(input.marketPulse ?? null, now);

    if (!input.backendUp) {
      if (input.reconnecting && retryCount >= maxRetries) return "FAILED";
      if (input.reconnecting || retryCount > 0) return "RECONNECTING";
      return retryCount >= maxRetries ? "FAILED" : "DISCONNECTED";
    }
    if (input.reconnecting) return marketFresh ? "CONNECTED" : "DEGRADED";
    if (marketFresh) return "CONNECTED";
    return "DEGRADED";
  }

  function transitionState(current, next, reason, at = Date.now()) {
    if (current === next) return null;
    return { from: current, to: next, reason, at };
  }

  function buildConnectionSnapshot(input) {
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

  function enrichPayloadMeta(payload, snapshot, now = Date.now()) {
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

  function formatConnectionStatus(snapshot, now = Date.now()) {
    const ageMs = snapshot.dataAge;
    const ageLabel =
      ageMs == null
        ? "no market update"
        : ageMs < 1000
          ? `${ageMs}ms ago`
          : ageMs < 60000
            ? `${Math.round(ageMs / 1000)}s ago`
            : `${Math.round(ageMs / 60000)}m ago`;

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

  function formatDiagnosticsPanel(snapshot) {
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

  const LIVE_DATA_UNAVAILABLE_VERDICT = {
    verdict:
      "VERDICT: WAIT\nSETUP: none — live data unavailable\nHTF BIAS: unknown\nENTRY: —\nINVALIDATION: —\nTARGET: —\nR:R: —\nDATA QUALITY: OFFLINE\nFINAL REASONING: WAIT / NO TRADE — LIVE DATA UNAVAILABLE",
    spokenBrief: "Wait — live data unavailable. Reconnect the desk before trading on this read.",
    panel: "WAIT / NO TRADE — LIVE DATA UNAVAILABLE",
    _liveDataBlocked: true,
  };

  function createConnectionManager(deps) {
    let state = "DISCONNECTED";
    let backendUp = false;
    let backendVersion = null;
    let apiBaseUrl = null;
    let lastSuccessfulRequest = null;
    let lastError = null;
    let retryCount = 0;
    let reconnecting = false;
    let marketMeta = null;
    let transitions = [];
    let lastTransition = null;
    let reconnectTimer = null;
    let reconnectLoopActive = false;
    let probeInFlight = false;

    function snapshot(now = Date.now()) {
      const next = evaluateConnectionState({
        backendUp,
        marketPulse: marketMeta,
        retryCount,
        reconnecting,
        lastError,
        now,
      });
      if (next !== state) {
        applyState(next, "connection re-evaluated");
      }
      return buildConnectionSnapshot({
        state: next,
        backendUp,
        backendVersion,
        apiBaseUrl,
        lastSuccessfulRequest,
        lastError,
        retryCount,
        marketMeta,
        lastTransition,
        transitions,
        now,
      });
    }

    function applyState(next, reason) {
      const t = transitionState(state, next, reason);
      if (t) {
        state = next;
        lastTransition = t;
        transitions = [...transitions.slice(-31), t];
        deps.onStateChange?.(snapshot());
      }
    }

    function recompute(reason) {
      const next = evaluateConnectionState({
        backendUp,
        marketPulse: marketMeta,
        retryCount,
        reconnecting,
        lastError,
      });
      applyState(next, reason);
      return snapshot();
    }

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    async function probeBackend(forceReconnect = false) {
      if (probeInFlight) return snapshot();
      probeInFlight = true;
      if (forceReconnect) {
        reconnecting = true;
        applyState(retryCount > 0 ? "RECONNECTING" : "CONNECTING", "manual reconnect");
      } else if (state === "DISCONNECTED" || state === "FAILED") {
        applyState("CONNECTING", "initial probe");
      }

      try {
        const result = await deps.pingHealth({ quick: !forceReconnect, warm: true, clearCache: forceReconnect });
        if (result?.ok) {
          backendUp = true;
          apiBaseUrl = result.base || apiBaseUrl;
          backendVersion = result.version || backendVersion;
          lastSuccessfulRequest = Date.now();
          lastError = null;
          if (forceReconnect) retryCount = 0;
          reconnecting = false;
          recompute(forceReconnect ? "backend restored" : "health ok");
        } else {
          throw new Error(result?.error || "Backend not reachable");
        }
      } catch (err) {
        backendUp = false;
        lastError = err instanceof Error ? err.message : String(err);
        retryCount += 1;
        recompute("health failed");
      } finally {
        probeInFlight = false;
      }
      return snapshot();
    }

    function scheduleReconnect() {
      if (reconnectLoopActive || reconnectTimer) return;
      if (state === "CONNECTED" || state === "DEGRADED") return;
      if (retryCount >= MAX_RECONNECT_RETRIES) {
        applyState("FAILED", "max retries");
        return;
      }
      reconnectLoopActive = true;
      reconnecting = true;
      applyState("RECONNECTING", "backoff reconnect");

      const delay = computeBackoffMs(retryCount);
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        reconnectLoopActive = false;
        await probeBackend(true);
        const snap = snapshot();
        if (snap.state !== "CONNECTED" && snap.state !== "DEGRADED" && retryCount < MAX_RECONNECT_RETRIES) {
          scheduleReconnect();
        } else if (snap.backendUp) {
          deps.onResync?.(snap);
        }
      }, delay);
    }

    function recordMarketPulse(pulse) {
      if (!pulse || !Number.isFinite(pulse.receivedAt ?? pulse.timestamp)) return snapshot();
      marketMeta = {
        source: pulse.source || "desk-tracker",
        timestamp: pulse.timestamp || pulse.receivedAt,
        receivedAt: pulse.receivedAt || Date.now(),
        symbol: pulse.symbol,
        timeframe: pulse.timeframe,
        version: pulse.version || backendVersion,
      };
      return recompute("market pulse");
    }

    function recordRequestSuccess(base) {
      lastSuccessfulRequest = Date.now();
      if (base) apiBaseUrl = base;
      lastError = null;
      backendUp = true;
      return recompute("request ok");
    }

    function recordRequestFailure(err) {
      lastError = err instanceof Error ? err.message : String(err);
      return recompute("request failed");
    }

    function forceReconnect() {
      clearReconnectTimer();
      reconnectLoopActive = false;
      retryCount = 0;
      reconnecting = true;
      return probeBackend(true);
    }

    function start() {
      void probeBackend(false).then((snap) => {
        if (snap.state !== "CONNECTED" && snap.state !== "DEGRADED") scheduleReconnect();
      });
    }

    return {
      snapshot,
      probeBackend,
      scheduleReconnect,
      recordMarketPulse,
      recordRequestSuccess,
      recordRequestFailure,
      forceReconnect,
      start,
      clearReconnectTimer,
      isLiveDataAvailable: () => isLiveDataAvailable(snapshot()),
    };
  }

  const api = {
    MARKET_FRESH_MS,
    MAX_RECONNECT_RETRIES,
    computeDataAge,
    isMarketFresh,
    isLiveDataAvailable,
    computeBackoffMs,
    evaluateConnectionState,
    transitionState,
    buildConnectionSnapshot,
    enrichPayloadMeta,
    formatConnectionStatus,
    formatDiagnosticsPanel,
    LIVE_DATA_UNAVAILABLE_VERDICT,
    createConnectionManager,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DeskCopilotConnection = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this);
