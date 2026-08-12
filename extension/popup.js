
const VERDICT_TIMEOUT_MS = 120000;

function setStatus(text, ok) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = ok === true ? "ok" : ok === false ? "err" : "";
}

async function publishResult(payload) {
  await chrome.storage.session.set({ dcVerdictResult: payload });
}

(async () => {
  try {
    const { dcVerdictRequest } = await chrome.storage.session.get("dcVerdictRequest");
    const symbol = dcVerdictRequest?.symbol || "MNQ1!";
    await chrome.storage.session.remove("dcVerdictRequest");

    setStatus("Capturing chart…", null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.windowId || !tab.url?.includes("tradingview.com")) {
      throw new Error("Open a TradingView chart tab first");
    }

    let dataUrl;
    if (tab.id && typeof chrome.tabs.captureTab === "function") {
      try {
        dataUrl = await chrome.tabs.captureTab(tab.id, { format: "png" });
      } catch {
        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      }
    } else {
      dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    }

    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    setStatus("Analyzing… (5–20 sec)", null);

    const data = await apiFetch("/api/live-verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: "image/png",
        symbol,
      }),
      timeoutMs: VERDICT_TIMEOUT_MS,
    });

    await publishResult({ data, ts: Date.now() });
    setStatus("Done — see panel", true);
    setTimeout(() => window.close(), 500);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setStatus(message, false);
    await publishResult({ error: message, ts: Date.now() }).catch(() => {});
  }
})();
