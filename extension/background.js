/** Stats/learn proxied here — content scripts on HTTPS pages can't fetch localhost reliably. */
importScripts("api-config.js", "connection-state.js");

function broadcastConnectionState(snap) {
  const payload = { type: "CONNECTION_STATE", snapshot: snap };
  chrome.tabs.query({ url: ["*://www.tradingview.com/*", "*://*.tradingview.com/*"] }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    }
  });
}

const connectionManager = DeskCopilotConnection.createConnectionManager({
  pingHealth: async (opts) => {
    if (opts?.clearCache) clearApiCache();
    return pingHealth({ quick: opts?.quick !== false, warm: opts?.warm !== false });
  },
  onStateChange: (snap) => broadcastConnectionState(snap),
  onResync: () => broadcastConnectionState(connectionManager.snapshot()),
});

connectionManager.start();

function dbgBg(hypothesisId, location, message, data) {
  const payload = {
    sessionId: "600bac",
    runId: "analyse-4",
    hypothesisId,
    location,
    message,
    data: data || {},
    timestamp: Date.now(),
  };
  // #region agent log
  fetch("http://127.0.0.1:7739/ingest/47d0d229-274e-48ee-bfd4-654ac892ba81", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c9bf7" },
    body: JSON.stringify({
      sessionId: "9c9bf7",
      runId: "berlin-ext-1",
      hypothesisId,
      location,
      message,
      data: data || {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json", "X-Debug-Session-Id": "600bac" };
  fetch("http://127.0.0.1:7740/", {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(1500),
  }).catch(() => {});
  fetch("http://127.0.0.1:7739/ingest/47d0d229-274e-48ee-bfd4-654ac892ba81", {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(1500),
  }).catch(() => {});
}

async function apiFetchTracked(path, options = {}) {
  try {
    const data = await apiFetch(path, options);
    // Casual warm/session must not mint desk ONLINE via lastSuccessfulRequest.
    if (options.trackSuccess !== false) {
      connectionManager.recordRequestSuccess(cachedBase);
    }
    return data;
  } catch (err) {
    connectionManager.recordRequestFailure(err);
    throw err;
  }
}

async function notifyTradingViewTabsOverlaySync() {
  const patterns = ["*://www.tradingview.com/*", "*://*.tradingview.com/*"];
  const seen = new Set();
  for (const url of patterns) {
    const tabs = await chrome.tabs.query({ url });
    for (const tab of tabs) {
      if (!tab.id || seen.has(tab.id)) continue;
      seen.add(tab.id);
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "DC_OVERLAY_SYNC" });
      } catch {
        /* content script not ready */
      }
    }
  }
}

async function reloadTradingViewTabs() {
  const patterns = ["*://www.tradingview.com/*", "*://*.tradingview.com/*"];
  const seen = new Set();
  for (const url of patterns) {
    const tabs = await chrome.tabs.query({ url });
    for (const tab of tabs) {
      if (!tab.id || seen.has(tab.id)) continue;
      seen.add(tab.id);
      try {
        await chrome.tabs.reload(tab.id);
      } catch {
        /* tab closed */
      }
    }
  }
}

const ISOLATED_SCRIPTS = [
  "plain-language.js",
  "desk-persona.js",
  "session-context.js",
  "connection-state.js",
  "request-trace.js",
  "weather-local.js",
  "casual-chat.js",
  "pending-request.js",
  "transcription-guard.js",
  "chart-intent.js",
  "desk-route-intent.js",
  "voice-context-fix.js",
  "voice-interpret.js",
  "voice-emotion.js",
  "voice-quick-reply.js",
  "voice-spoken-sanitize.js",
  "voice-latency.js",
  "voice-realtime.js",
  "voice.js",
  "desk-memory.js",
  "level-toggles.js",
  "chart-draw.js",
  "chart-price.js",
  "chart-snapshot.js",
  "desk-ui-components.js",
  "desk-mock-analysis.js",
  "desk-verdict-ui.js",
  "desk-tracker.js",
  "content.js",
];

async function reinjectDeskScripts() {
  const patterns = ["*://www.tradingview.com/*", "*://*.tradingview.com/*"];
  const seen = new Set();
  let n = 0;
  for (const url of patterns) {
    const tabs = await chrome.tabs.query({ url });
    for (const tab of tabs) {
      if (!tab.id || seen.has(tab.id)) continue;
      seen.add(tab.id);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["tv-bridge.js"],
          world: "MAIN",
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ISOLATED_SCRIPTS,
          world: "ISOLATED",
        });
        n += 1;
      } catch (e) {
        dbgBg("L", "background.js:reinjectDeskScripts", "fail", {
          tabId: tab.id,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  dbgBg("L", "background.js:reinjectDeskScripts", "done", { tabs: n });
}

chrome.runtime.onInstalled.addListener((details) => {
  ensureApiBase().catch(() => {});
  notifyTradingViewTabsOverlaySync().catch(() => {});
  if (details.reason === "install" || details.reason === "update") {
    reloadTradingViewTabs().catch(() => {});
  } else {
    reinjectDeskScripts().catch(() => {});
  }
  dbgBg("L", "background.js:onInstalled", "installed", { reason: details.reason });
});

chrome.runtime.onStartup.addListener(() => {
  ensureApiBase().catch(() => {});
});

// Pin preview apiBaseUrl as soon as the service worker wakes (Options sync storage).
ensureApiBase().catch(() => {});

/** Prefer explicit pin over any stale in-memory cachedBase (e.g. leftover localhost). */
async function resolveRequestBase(requested) {
  const want = typeof requested === "string" ? normalizeBase(requested) : "";
  if (want && isAllowedBase(want)) return want;
  const custom = await getStoredCustomBase();
  if (custom) {
    if (cachedBase === custom) return custom;
    return resolveApiBase({ force: cachedBase != null && cachedBase !== custom });
  }
  // AUTO: never short-circuit on sticky cachedBase (hung local health-ok once).
  // resolveApiBase probes localhost and only trusts recent Vercel via HEALTH_TTL.
  return resolveApiBase();
}

/** Drop sticky AUTO cache after stream hard-fail / timeout so next turn re-probes. */
function clearStickyBaseAfterStreamFailure(base) {
  const b = normalizeBase(base || cachedBase);
  if (!b) {
    clearApiCache();
    return;
  }
  if (isLocalBase(b) || isVercelBase(b)) clearApiCache();
}

/** Keep service worker alive while a TradingView tab has the panel open. */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "desk-copilot-keepalive") {
    port.onMessage.addListener(() => {});
    port.onDisconnect.addListener(() => {});
    return;
  }

  if (port.name !== "desk-copilot-chat-stream") return;

  let portOpen = true;
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 90000);
  port.onDisconnect.addListener(() => {
    portOpen = false;
    ac.abort();
  });

  function safePortPost(message) {
    if (!portOpen) return false;
    try {
      port.postMessage(message);
      return true;
    } catch {
      portOpen = false;
      return false;
    }
  }

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== "START") return;
    const reqId = msg.requestId || null;
    const t0 = Date.now();
    dbgBg("C", "background.js:chat-stream", "received", { reqId, forceMarket: msg.forceMarket === true });
    try {
      const base = await resolveRequestBase(msg.apiBase);
      dbgBg("C", "background.js:chat-stream", "api-start", { reqId, base, ms: Date.now() - t0 });
      // #region agent log
      dbgBg("A", "background.js:chat-stream", "berlin-debug-base", {
        reqId,
        base,
        q: String(msg.messages?.at?.(-1)?.content || "").slice(0, 80),
        casualOnly: msg.casualOnly === true,
      });
      // #endregion
      const res = await fetch(`${base}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          messages: msg.messages,
          symbol: msg.symbol,
          lastVerdict: msg.lastVerdict,
          voiceInput: msg.voiceInput === true,
          voiceSttClean: msg.voiceSttClean === true,
          casualOnly: msg.casualOnly === true,
          chartLastPrice: msg.historicalFixture ? undefined : msg.chartLastPrice,
          forceMarket: msg.forceMarket === true,
          memory: msg.memory,
          conversationTurn: msg.conversationTurn,
          conversationId: msg.conversationId,
          intent: msg.intent,
          marketSnapshotId: msg.marketSnapshotId,
          requestId: msg.requestId,
          ...(msg.historicalFixture
            ? { historicalFixture: msg.historicalFixture }
            : {}),
        }),
      });

      const ct = res.headers.get("content-type") || "";
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // #region agent log
        dbgBg("A", "background.js:chat-stream", "berlin-debug-http-fail", {
          reqId,
          base,
          status: res.status,
          error: String(err.error || "").slice(0, 160),
          q: String(msg.messages?.at?.(-1)?.content || "").slice(0, 80),
        });
        // #endregion
        connectionManager.recordRequestFailure(new Error(err.error || `HTTP ${res.status}`));
        clearStickyBaseAfterStreamFailure(base);
        safePortPost({ type: "error", error: err.error || `HTTP ${res.status}` });
        safePortPost({ type: "done" });
        return;
      }
      connectionManager.recordRequestSuccess(base);
      dbgBg("C", "background.js:chat-stream", "api-response", {
        reqId,
        ms: Date.now() - t0,
        ct: ct.slice(0, 40),
        json: ct.includes("application/json"),
        // #region agent log
        base,
        status: res.status,
        q: String(msg.messages?.at?.(-1)?.content || "").slice(0, 80),
        // #endregion
      });

      if (ct.includes("application/json")) {
        const data = await res.json();
        safePortPost({ type: "json", data });
        safePortPost({ type: "done" });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        safePortPost({ type: "error", error: "No stream body" });
        safePortPost({ type: "done" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      while (portOpen) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            if (!safePortPost({ type: "sse", data: JSON.parse(line.slice(6)) })) break;
          } catch {
            /* ignore malformed chunk */
          }
        }
      }
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      safePortPost({ type: "done" });
    } catch (e) {
      connectionManager.recordRequestFailure(e);
      clearStickyBaseAfterStreamFailure(cachedBase);
      safePortPost({
        type: "error",
        error: e instanceof Error ? e.message : String(e),
      });
      safePortPost({ type: "done" });
    } finally {
      clearTimeout(timeoutId);
    }
  });
});

async function captureChartPng(tab) {
  if (!tab?.id) throw new Error("Open a TradingView chart tab");

  let fullTab = tab;
  try {
    fullTab = await chrome.tabs.get(tab.id);
  } catch {
    /* use sender tab */
  }

  const errors = [];

  if (typeof chrome.tabs.captureTab === "function") {
    try {
      return await chrome.tabs.captureTab(fullTab.id, { format: "png" });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (fullTab.windowId != null) {
    try {
      return await chrome.tabs.captureVisibleTab(fullTab.windowId, { format: "png" });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const needsClick = errors.some(
    (m) => m.includes("activeTab") || m.includes("all_urls")
  );
  // #region agent log
  dbgBg("M", "background.js:captureChartPng", "capture-failed", {
    errors,
    needsClick,
    tabId: fullTab?.id || null,
    windowId: fullTab?.windowId ?? null,
  });
  // #endregion
  throw new Error(
    needsClick
      ? "Click The Trading Desk icon in Chrome toolbar (grants screenshot), then Get verdict"
      : errors[0] || "Screenshot failed"
  );
}

async function runVerdictForTab(tab, symbol) {
  const dataUrl = await captureChartPng(tab);
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return apiFetchTracked("/api/live-verdict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: base64,
      mimeType: "image/png",
      symbol: symbol || "MNQ1!",
    }),
    timeoutMs: 120000,
  });
}

async function deliverVerdict(tabId, payload) {
  await chrome.storage.session.set({ dcVerdictResult: payload }).catch(() => {});
  if (tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "VERDICT_RESULT", payload });
    } catch {
      /* content script may not be ready */
    }
  }
}

/** Toolbar click = activeTab granted → screenshot works. */
chrome.action.onClicked.addListener(async (tab) => {
  // #region agent log
  dbgBg("M", "background.js:onClicked", "toolbar-click", {
    tabId: tab?.id || null,
    url: String(tab?.url || "").slice(0, 80),
  });
  // #endregion
  if (!tab?.id || !tab.url?.includes("tradingview.com")) return;
  await deliverVerdict(tab.id, { status: "capturing" });
  try {
    const stored = await chrome.storage.session.get("dcVerdictRequest");
    const symbol = stored?.dcVerdictRequest?.symbol || "MNQ1!";
    await chrome.storage.session.remove("dcVerdictRequest");
    const data = await runVerdictForTab(tab, symbol);
    await deliverVerdict(tab.id, { data, ts: Date.now() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await deliverVerdict(tab.id, { error: message, ts: Date.now() });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "REALTIME_SESSION") {
    apiFetchTracked("/api/voice/realtime-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: msg.symbol || "MNQ1!",
        voice: msg.voice || undefined,
      }),
      timeoutMs: 30000,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "GET_API_BASE_DEBUG") {
    getApiBaseDebugSnapshot()
      .then((snap) => sendResponse(snap))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "TTS") {
    Promise.resolve(resolveRequestBase())
      .then(async (base) => {
        const res = await fetch(`${base}/api/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(45000),
          body: JSON.stringify({
            text: msg.text || "",
            voice: msg.voice || undefined,
            speed: typeof msg.speed === "number" ? msg.speed : undefined,
            instructions: typeof msg.instructions === "string" ? msg.instructions : undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `TTS ${res.status}`);
        }
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const step = 0x8000;
        for (let i = 0; i < bytes.length; i += step) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
        }
        sendResponse({ audioBase64: btoa(binary), mimeType: "audio/mpeg" });
      })
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "VOICE_INTERPRET") {
    const body = { text: msg.text || "" };
    if (msg.recentContext) body.recentContext = msg.recentContext;
    if (Array.isArray(msg.messages)) body.messages = msg.messages;
    apiFetchTracked("/api/voice/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 15000,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message, text: msg.text, changed: false, raw: msg.text }));
    return true;
  }
  if (msg.type === "TRANSCRIBE") {
    apiFetchTracked("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: msg.audioBase64,
        mimeType: msg.mimeType || "audio/webm",
      }),
      timeoutMs: 45000,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "MARKET_SNAPSHOT") {
    apiFetchTracked("/api/market-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: msg.question || "",
        voiceInput: msg.voiceInput === true,
        chartLastPrice: msg.chartLastPrice,
        chartLastPriceSource: msg.chartLastPriceSource,
        chartLastPriceTs: msg.chartLastPriceTs,
        conversationContext: msg.conversationContext,
      }),
      timeoutMs: 20000,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "DESK_TRACKER") {
    apiFetchTracked("/api/desk-tracker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chartSnapshot: msg.chartSnapshot,
        chartLastPrice: msg.chartLastPrice,
        lastBarTime: msg.lastBarTime,
        candleClosed: msg.candleClosed === true,
        freeze: msg.freeze === true,
      }),
      timeoutMs: 30000,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "CHAT") {
    apiFetchTracked("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: msg.messages,
        symbol: msg.symbol,
        lastVerdict: msg.lastVerdict,
        voiceInput: msg.voiceInput === true,
        voiceSttClean: msg.voiceSttClean === true,
        chartLastPrice: msg.chartLastPrice,
        casualOnly: msg.casualOnly === true,
        wantsLiveWebData: msg.wantsLiveWebData === true,
        searchQuery: msg.searchQuery || undefined,
        memory: msg.memory,
      }),
      timeoutMs: 90000,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "PREPARE_VERDICT") {
    apiFetchTracked("/api/warm", { timeoutMs: 15000, trackSuccess: false }).catch(() => {});
    chrome.storage.session
      .set({ dcVerdictRequest: { symbol: msg.symbol || "MNQ1!", ts: Date.now() } })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "CAPTURE_CHART") {
    captureChartPng(sender.tab)
      .then((dataUrl) => {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        sendResponse({ base64 });
      })
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "VERDICT") {
    const run =
      msg.base64 != null
        ? apiFetchTracked("/api/live-verdict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: msg.base64,
              mimeType: "image/png",
              symbol: msg.symbol || "MNQ1!",
              question: msg.question,
            }),
            timeoutMs: 120000,
          })
        : runVerdictForTab(sender.tab, msg.symbol);
    run.then(sendResponse).catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "VERDICT_ASYNC") {
    const tabId = sender.tab?.id;
    const reqId = msg.requestId || null;
    const t0 = Date.now();
    dbgBg("C", "background.js:VERDICT_ASYNC", "received", { reqId, tabId, hasSnapshot: Boolean(msg.chartSnapshot), hasImage: Boolean(msg.base64) });
    deliverVerdict(tabId, { status: "analyzing" }).catch(() => {});
    apiFetchTracked("/api/live-verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: msg.base64,
        mimeType: "image/png",
        symbol: msg.symbol || "MNQ1!",
        question: msg.question,
        voiceInput: msg.voiceInput === true,
        chartLastPrice: msg.chartLastPrice,
        chartSnapshot: msg.chartSnapshot,
        debug: msg.debug === true,
        requestId: reqId,
      }),
      timeoutMs: 120000,
    })
      .then((data) => {
        dbgBg("C", "background.js:VERDICT_ASYNC", "complete", {
          reqId,
          ms: Date.now() - t0,
          hasSpoken: Boolean(data?.spokenBrief || data?.verdict),
        });
        deliverVerdict(tabId, { data, ts: Date.now() });
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        dbgBg("E", "background.js:VERDICT_ASYNC", "error", { reqId, ms: Date.now() - t0, message: message.slice(0, 160) });
        deliverVerdict(tabId, { error: message, ts: Date.now() });
      });
    sendResponse({ ok: true, requestId: reqId });
    return true;
  }
  if (msg.type === "LEVELS") {
    apiFetchTracked("/api/levels", { timeoutMs: 60000 })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "QUOTE") {
    const raw = String(msg.symbol || "MNQ");
    const clearlyNq = /(?:^|[^A-Z])NQ(?:1!|[FGHJKMNQUVXZ]|$|[^A-Z])/i.test(raw) && !/MNQ/i.test(raw);
    const resolved = clearlyNq ? "NQ" : "MNQ";
    dbgBg("I", "background.js:QUOTE", "quote", { requested: raw, resolved });
    apiFetchTracked(`/api/quote?symbol=${encodeURIComponent(resolved)}`, { timeoutMs: 8000 })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "DEBUG_LOG") {
    const body = JSON.stringify(msg.payload || {});
    const headers = { "Content-Type": "application/json", "X-Debug-Session-Id": "600bac" };
    fetch("http://127.0.0.1:7740/", {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(1500),
    }).catch(() => {});
    fetch("http://127.0.0.1:7739/ingest/47d0d229-274e-48ee-bfd4-654ac892ba81", {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(1500),
    }).catch(() => {});
    const staleRun = msg.payload?.runId;
    if (staleRun === "ticker-3" && !globalThis.__dcStaleReloadArmed) {
      globalThis.__dcStaleReloadArmed = true;
      dbgBg("L", "background.js:DEBUG_LOG", "stale-build-reload", { runId: staleRun });
      try {
        chrome.runtime.reload();
      } catch {
        /* ignore */
      }
    }
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "WARM") {
    apiFetchTracked("/api/warm", { timeoutMs: 12000, trackSuccess: false })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "PING" || msg.type === "RECONNECT") {
    const run =
      msg.type === "RECONNECT"
        ? connectionManager.forceReconnect()
        : connectionManager.probeBackend(false);
    run
      .then(async (snap) => {
        const debug = await getApiBaseDebugSnapshot().catch(() => null);
        sendResponse({
          ok: snap.backendUp,
          base: snap.apiBaseUrl,
          version: snap.backendVersion,
          backendKind: snap.apiBaseUrl ? classifyBackendKind(snap.apiBaseUrl) : null,
          connectionState: snap.state,
          diagnostics: snap,
          debug,
          statusLine: DeskCopilotConnection.formatConnectionStatus(snap),
          liveDataAvailable: DeskCopilotConnection.isLiveDataAvailable(snap),
        });
        if (!snap.backendUp) connectionManager.scheduleReconnect();
      })
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "GET_CONNECTION_STATE") {
    sendResponse({
      ...connectionManager.snapshot(),
      statusLine: DeskCopilotConnection.formatConnectionStatus(connectionManager.snapshot()),
      liveDataAvailable: connectionManager.isLiveDataAvailable(),
    });
    return false;
  }
  if (msg.type === "CONNECTION_MARKET_PULSE") {
    const snap = connectionManager.recordMarketPulse({
      source: msg.source,
      timestamp: msg.timestamp,
      receivedAt: msg.receivedAt || Date.now(),
      symbol: msg.symbol,
      timeframe: msg.timeframe,
      version: msg.version,
    });
    sendResponse({ ok: true, snapshot: snap });
    return false;
  }
  if (msg.type === "STATS") {
    apiFetchTracked("/api/session", { timeoutMs: 120000, trackSuccess: false })
      .then((data) => sendResponse(data))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "LEARN") {
    apiFetchTracked("/api/learn", { method: "POST", timeoutMs: 60000 })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
});
