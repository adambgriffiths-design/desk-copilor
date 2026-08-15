/**
 * Extension connection lifecycle — shared between background + content.
 */
(function (root) {
  const MARKET_FRESH_MS = 60000;
  const MAX_RECONNECT_RETRIES = 10;
  const BACKOFF_BASE_MS = 1000;
  const BACKOFF_MAX_MS = 60000;
  const SW_WAKE_MAX_RETRIES = 4;
  const SW_WAKE_BACKOFF_BASE_MS = 300;
  const SW_WAKE_BACKOFF_MAX_MS = 2400;
  const INVALIDATED_RELOAD_COOLDOWN_MS = 60000;
  const API_FRESH_MS = 60000;
  const TICK_LIVE_MS = 2000;
  const TICK_STALE_MS = 60000;

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

  function classifyExtensionMessagingFailure(err) {
    const m = (err && err.message ? err.message : String(err || "")).toLowerCase();
    if (m.includes("invalidated") || m.includes("extension context")) return "invalidated";
    if (m.includes("receiving end") || m.includes("could not establish connection")) return "receiving_end";
    return null;
  }

  function isExtensionMessagingFailure(err) {
    return classifyExtensionMessagingFailure(err) != null;
  }

  function isReceivingEndFailure(err) {
    return classifyExtensionMessagingFailure(err) === "receiving_end";
  }

  function isExtensionContextInvalidated(err) {
    return classifyExtensionMessagingFailure(err) === "invalidated";
  }

  function parseStaleReloadLatch(raw) {
    if (!raw || raw === "1") return null;
    try {
      const v = JSON.parse(raw);
      if (!v || typeof v !== "object") return null;
      if (typeof v.version !== "string" || typeof v.at !== "number" || !Number.isFinite(v.at)) {
        return null;
      }
      return { version: v.version, at: v.at };
    } catch {
      return null;
    }
  }

  function shouldAutoReloadForInvalidated(latch, version, now = Date.now(), cooldownMs = INVALIDATED_RELOAD_COOLDOWN_MS) {
    if (!latch) return true;
    if (latch.version !== version) return true;
    return now - latch.at >= cooldownMs;
  }

  function nextStaleReloadLatch(version, now = Date.now()) {
    return { version, at: now };
  }

  function computeSwWakeBackoffMs(attempt, jitter = 0) {
    const exp = Math.min(
      SW_WAKE_BACKOFF_MAX_MS,
      SW_WAKE_BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempt - 1))
    );
    return exp + (jitter > 0 ? Math.floor(Math.random() * jitter) : 0);
  }

  function shouldRetryReceivingEnd(attempt, max = SW_WAKE_MAX_RETRIES) {
    return attempt >= 1 && attempt < max;
  }

  function shouldOpenNewRealtimeSocket(readyState, connectInFlight) {
    if (connectInFlight) return false;
    if (readyState === 0 || readyState === 1) return false;
    return true;
  }

  function evaluateMarketHopHealth(input) {
    const age = input?.tickAgeMs;
    const hasPrice = input?.hasPrice === true || (age != null && Number.isFinite(age));
    if (age != null && age <= TICK_LIVE_MS) return "CONNECTED";
    if (hasPrice && (age == null || age <= TICK_STALE_MS)) return "DEGRADED";
    return "DISCONNECTED";
  }

  function evaluateApiHopHealth(input) {
    const now = input?.now ?? Date.now();
    const retryCount = input?.retryCount ?? 0;
    if (!input?.backendUp) {
      if (input?.reconnecting && retryCount >= MAX_RECONNECT_RETRIES) return "FAILED";
      if (input?.reconnecting || retryCount > 0) return "RECONNECTING";
      return retryCount >= MAX_RECONNECT_RETRIES ? "FAILED" : "DISCONNECTED";
    }
    const last = input.lastSuccessfulRequest;
    if (last == null) return "DEGRADED";
    if (now - last <= API_FRESH_MS) return "CONNECTED";
    return "DEGRADED";
  }

  function evaluateVoiceComponentHealth(input) {
    if (input?.failed) return "FAILED";
    if (input?.connecting) return "CONNECTING";
    if (input?.sessionActive) return "CONNECTED";
    return "DISCONNECTED";
  }

  function evaluateChatStreamHealth(input) {
    if (input?.failed) return "FAILED";
    if (input?.busy) return "BUSY";
    return "READY";
  }

  function canConfidentlyAnalyse(marketHop) {
    return marketHop === "CONNECTED";
  }

  /**
   * DESK ONLINE — request path usable (not TV Last).
   * Requires API hop CONNECTED + market hop not DISCONNECTED.
   * Cached/degraded health and failed chat never qualify.
   */
  function isDeskOnline(input) {
    if (input?.healthDegraded === true) return false;
    const now = input?.now ?? Date.now();
    const api =
      input?.apiHop ||
      evaluateApiHopHealth({
        backendUp: input?.backendUp,
        lastSuccessfulRequest: input?.lastSuccessfulRequest ?? input?.lastApiSuccessAt,
        reconnecting: input?.reconnecting,
        retryCount: input?.retryCount,
        now,
      });
    const market =
      input?.marketHop ||
      evaluateMarketHopHealth({
        tickAgeMs: input?.tickAgeMs,
        hasPrice: input?.hasPrice === true,
      });
    if (api !== "CONNECTED") return false;
    if (market === "DISCONNECTED") return false;
    if (input?.chatHop === "FAILED" || input?.chatFailed === true) return false;
    return true;
  }

  function buildHopHealthSnapshot(input) {
    const now = input?.now ?? Date.now();
    const market = evaluateMarketHopHealth({
      tickAgeMs: input?.tickAgeMs,
      hasPrice: Number.isFinite(input?.lastPrice),
    });
    const api = evaluateApiHopHealth({
      backendUp: input?.backendUp,
      lastSuccessfulRequest: input?.lastApiSuccessAt,
      reconnecting: input?.reconnecting,
      retryCount: input?.retryCount,
      now,
    });
    return {
      market,
      api,
      stt: evaluateVoiceComponentHealth({
        sessionActive: input?.sttActive,
        connecting: input?.sttConnecting,
        failed: input?.sttFailed,
        lastActivityAt: input?.lastSttAt,
      }),
      tts: evaluateVoiceComponentHealth({
        sessionActive: input?.ttsActive,
        connecting: input?.ttsConnecting,
        failed: input?.ttsFailed,
        lastActivityAt: input?.lastTtsAt,
      }),
      chatStream: evaluateChatStreamHealth({ busy: input?.chatBusy, failed: input?.chatFailed }),
      reconnect: input?.reconnecting ? "ATTEMPTING" : "IDLE",
      lastTickAt: input?.lastTickAt ?? (input?.tickAgeMs != null ? now - input.tickAgeMs : null),
      lastPrice: Number.isFinite(input?.lastPrice) ? input.lastPrice : null,
      lastApiSuccessAt: input?.lastApiSuccessAt ?? null,
      lastSttAt: input?.lastSttAt ?? null,
      lastTtsAt: input?.lastTtsAt ?? null,
      lastError: input?.lastError ?? null,
    };
  }

  function formatHopHealthPanel(hop, now = Date.now()) {
    const ts = (v) => (v ? new Date(v).toISOString() : "—");
    const age = (v) => (v == null ? "—" : `${Math.max(0, now - v)}ms ago`);
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
    // Cached/degraded health is never CONNECTED / desk ONLINE.
    if (input.healthDegraded) return "DEGRADED";
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
    let healthDegraded = false;
    let marketMeta = null;
    let transitions = [];
    let lastTransition = null;
    let reconnectTimer = null;
    let reconnectLoopActive = false;
    let probePromise = null;

    function snapshot(now = Date.now()) {
      const next = evaluateConnectionState({
        backendUp,
        marketPulse: marketMeta,
        retryCount,
        reconnecting,
        healthDegraded,
        lastError,
        now,
      });
      if (next !== state) {
        applyState(next, "connection re-evaluated");
      }
      return buildConnectionSnapshot({
        state: next,
        backendUp,
        healthDegraded,
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
        healthDegraded,
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
      if (probePromise) return probePromise;

      probePromise = (async () => {
        if (forceReconnect) {
          reconnecting = true;
          applyState(retryCount > 0 ? "RECONNECTING" : "CONNECTING", "manual reconnect");
        } else if (state === "DISCONNECTED" || state === "FAILED") {
          applyState("CONNECTING", "initial probe");
        }

        try {
          const result = await deps.pingHealth({
            quick: !forceReconnect,
            warm: true,
            clearCache: forceReconnect,
          });
          if (result?.ok) {
            backendUp = true;
            apiBaseUrl = result.base || apiBaseUrl;
            backendVersion = result.version || backendVersion;
            if (forceReconnect) retryCount = 0;
            reconnecting = false;
            if (result.degraded === true) {
              // Cached/slow local health — reachable but never desk ONLINE.
              healthDegraded = true;
              lastError = result.reason || "cached health — degraded";
              recompute(forceReconnect ? "backend restored degraded" : "health degraded");
            } else {
              healthDegraded = false;
              lastSuccessfulRequest = Date.now();
              lastError = null;
              recompute(forceReconnect ? "backend restored" : "health ok");
            }
          } else {
            throw new Error(result?.error || "Backend not reachable");
          }
        } catch (err) {
          backendUp = false;
          healthDegraded = false;
          lastError = err instanceof Error ? err.message : String(err);
          retryCount += 1;
          recompute("health failed");
        }
        return snapshot();
      })();

      try {
        return await probePromise;
      } finally {
        probePromise = null;
      }
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
      healthDegraded = false;
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
    SW_WAKE_MAX_RETRIES,
    SW_WAKE_BACKOFF_BASE_MS,
    SW_WAKE_BACKOFF_MAX_MS,
    INVALIDATED_RELOAD_COOLDOWN_MS,
    API_FRESH_MS,
    TICK_LIVE_MS,
    TICK_STALE_MS,
    computeDataAge,
    isMarketFresh,
    isLiveDataAvailable,
    classifyExtensionMessagingFailure,
    isExtensionMessagingFailure,
    isReceivingEndFailure,
    isExtensionContextInvalidated,
    parseStaleReloadLatch,
    shouldAutoReloadForInvalidated,
    nextStaleReloadLatch,
    computeSwWakeBackoffMs,
    shouldRetryReceivingEnd,
    shouldOpenNewRealtimeSocket,
    evaluateMarketHopHealth,
    evaluateApiHopHealth,
    evaluateVoiceComponentHealth,
    evaluateChatStreamHealth,
    canConfidentlyAnalyse,
    isDeskOnline,
    buildHopHealthSnapshot,
    formatHopHealthPanel,
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
