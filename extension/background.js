/** Stats/rate/learn proxied here — content scripts on HTTPS pages can't fetch localhost reliably. */
importScripts("api-config.js");

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

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
    reloadTradingViewTabs().catch(() => {});
  }
});

/** Keep service worker alive while a TradingView tab has the panel open. */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "desk-copilot-keepalive") {
    port.onMessage.addListener(() => {});
    port.onDisconnect.addListener(() => {});
    return;
  }

  if (port.name !== "desk-copilot-chat-stream") return;

  let portOpen = true;
  port.onDisconnect.addListener(() => {
    portOpen = false;
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
    try {
      const base = await resolveApiBase();
      const res = await fetch(`${base}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: msg.messages,
          symbol: msg.symbol,
          lastVerdict: msg.lastVerdict,
          voiceInput: msg.voiceInput === true,
        }),
      });

      const ct = res.headers.get("content-type") || "";
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        safePortPost({ type: "error", error: err.error || `HTTP ${res.status}` });
        return;
      }

      if (ct.includes("application/json")) {
        const data = await res.json();
        safePortPost({ type: "json", data });
        safePortPost({ type: "done" });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        safePortPost({ type: "error", error: "No stream body" });
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
      safePortPost({
        type: "error",
        error: e instanceof Error ? e.message : String(e),
      });
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
  throw new Error(
    needsClick
      ? "Click The Trading Desk icon in Chrome toolbar (grants screenshot), then Get verdict"
      : errors[0] || "Screenshot failed"
  );
}

async function runVerdictForTab(tab, symbol) {
  const dataUrl = await captureChartPng(tab);
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return apiFetch("/api/live-verdict", {
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
    apiFetch("/api/voice/realtime-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: msg.symbol || "MNQ1!" }),
      timeoutMs: 30000,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "TTS") {
    resolveApiBase()
      .then(async (base) => {
        const res = await fetch(`${base}/api/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: msg.text || "" }),
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
  if (msg.type === "TRANSCRIBE") {
    apiFetch("/api/transcribe", {
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
  if (msg.type === "CHAT") {
    apiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: msg.messages,
        symbol: msg.symbol,
        lastVerdict: msg.lastVerdict,
        voiceInput: msg.voiceInput === true,
      }),
      timeoutMs: 60000,
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "PREPARE_VERDICT") {
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
        ? apiFetch("/api/live-verdict", {
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
    deliverVerdict(tabId, { status: "analyzing" }).catch(() => {});
    apiFetch("/api/live-verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: msg.base64,
        mimeType: "image/png",
        symbol: msg.symbol || "MNQ1!",
        question: msg.question,
        voiceInput: msg.voiceInput === true,
      }),
      timeoutMs: 120000,
    })
      .then((data) => deliverVerdict(tabId, { data, ts: Date.now() }))
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        deliverVerdict(tabId, { error: message, ts: Date.now() });
      });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "LEVELS") {
    apiFetch("/api/levels", { timeoutMs: 60000 })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "PING" || msg.type === "RECONNECT") {
    if (msg.type === "RECONNECT") clearApiCache();
    pingHealth()
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "STATS") {
    apiFetch("/api/session", { timeoutMs: 120000 })
      .then((data) => sendResponse(data))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "RATE") {
    apiFetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: msg.id, rating: msg.rating }),
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === "LEARN") {
    apiFetch("/api/learn", { method: "POST", timeoutMs: 60000 })
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
});
