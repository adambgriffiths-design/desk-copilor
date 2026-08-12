const PRODUCTION_BASE = "https://desk-copilor.vercel.app";
const DEFAULT_VOICE = "marin";

function setStatus(text, ok) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = ok === true ? "ok" : ok === false ? "err" : "";
}

async function testConnection() {
  setStatus("Testing Vercel backend…", null);
  try {
    const res = await chrome.runtime.sendMessage({ type: "RECONNECT" });
    if (res?.ok) {
      setStatus(`Connected — ${res.base}`, true);
      return;
    }
    setStatus(res?.error || "Could not connect", false);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), false);
  }
}

function normalizeUrl(raw) {
  return String(raw || "")
    .trim()
    .replace(/\/+$/, "");
}

async function load() {
  const stored = await chrome.storage.sync.get(["apiBaseUrl", "voiceId"]);
  const url = normalizeUrl(stored.apiBaseUrl) || PRODUCTION_BASE;
  if (!normalizeUrl(stored.apiBaseUrl)) {
    await chrome.storage.sync.set({ apiBaseUrl: PRODUCTION_BASE });
  }
  document.getElementById("apiBaseUrl").value = url;

  const voice = stored.voiceId || DEFAULT_VOICE;
  const voiceEl = document.getElementById("voiceId");
  voiceEl.value = [...voiceEl.options].some((o) => o.value === voice)
    ? voice
    : DEFAULT_VOICE;
  if (!stored.voiceId) {
    await chrome.storage.sync.set({ voiceId: DEFAULT_VOICE });
  }

  try {
    const routeDebug = localStorage.getItem("dc-route-debug") === "1";
    document.getElementById("routeDebug").checked = routeDebug;
  } catch {
    /* ignore */
  }

  await testConnection();
}

async function saveSettings() {
  const voiceId = document.getElementById("voiceId").value || DEFAULT_VOICE;
  const routeDebug = document.getElementById("routeDebug").checked;
  try {
    localStorage.setItem("dc-route-debug", routeDebug ? "1" : "0");
  } catch {
    /* ignore */
  }
  await chrome.storage.sync.set({ apiBaseUrl: PRODUCTION_BASE, voiceId });
  await chrome.storage.local.remove("apiBaseLastGood");
  setStatus(`Saved — ${PRODUCTION_BASE}, voice ${voiceId}${routeDebug ? ", routing debug on" : ""}`, true);
  await testConnection();
}

document.getElementById("save").addEventListener("click", () => {
  void saveSettings();
});

document.getElementById("reset").addEventListener("click", async () => {
  document.getElementById("apiBaseUrl").value = PRODUCTION_BASE;
  document.getElementById("voiceId").value = DEFAULT_VOICE;
  await chrome.storage.sync.set({ apiBaseUrl: PRODUCTION_BASE, voiceId: DEFAULT_VOICE });
  await chrome.storage.local.remove("apiBaseLastGood");
  setStatus(`Reset — ${PRODUCTION_BASE}`, true);
  await testConnection();
});

load();
