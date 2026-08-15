const PRODUCTION_BASE = "https://desk-copilor.vercel.app";
/** Keep in sync with extension/api-config.js PREVIEW_BASE */
const PREVIEW_BASE = "https://desk-copilor-lvmufjv3k-adam-b45d.vercel.app";
const DEFAULT_VOICE = "marin";

function setStatus(text, ok) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = ok === true ? "ok" : ok === false ? "err" : "";
}

function setBackendMeta(meta) {
  const el = document.getElementById("backendMeta");
  if (!el) return;
  if (!meta) {
    el.textContent = "";
    return;
  }
  const lines = [
    `BACKEND: ${meta.backend || "—"}`,
    `BASE: ${meta.base || "—"}`,
    `VERSION: ${meta.version || "—"}`,
    `MODE: ${meta.mode || "—"}`,
    `CONFIGURED_BASE: ${meta.configuredBase || "(auto)"}`,
    `RESOLVED_BASE: ${meta.resolvedBase || "—"}`,
    `LAST_GOOD_BASE: ${meta.lastGoodBase || "—"}`,
  ];
  el.textContent = lines.join("\n");
}

function normalizeUrl(raw) {
  return String(raw || "")
    .trim()
    .replace(/\/+$/, "");
}

function isLocalUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const port = u.port || "80";
    return (
      (host === "127.0.0.1" || host === "localhost") &&
      (port === "3020" || port === "3000" || port === "3001" || port === "3010")
    );
  } catch {
    return false;
  }
}

function isAllowedUrl(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return isLocalUrl(url) || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function classifyBackend(base) {
  const n = normalizeUrl(base);
  if (!n) return "unknown";
  if (isLocalUrl(n)) return "localhost";
  if (n === PRODUCTION_BASE) return "production";
  if (n === PREVIEW_BASE) return "preview";
  if (n.endsWith(".vercel.app") || n.includes(".vercel.app")) return "custom";
  return "custom";
}

async function testConnection() {
  setStatus("Probing configured backend…", null);
  try {
    const res = await chrome.runtime.sendMessage({ type: "RECONNECT" });
    const debug = await chrome.runtime.sendMessage({ type: "GET_API_BASE_DEBUG" }).catch(() => null);
    if (res?.ok) {
      setStatus(`Connected → ${res.base}`, true);
      setBackendMeta({
        backend: classifyBackend(res.base),
        base: res.base,
        version: res.version || "—",
        mode: debug?.mode || (normalizeUrl(document.getElementById("apiBaseUrl").value) ? "explicit" : "auto"),
        configuredBase: debug?.configuredBase || normalizeUrl(document.getElementById("apiBaseUrl").value) || "(auto)",
        resolvedBase: debug?.resolvedBase || res.base,
        lastGoodBase: debug?.lastGoodBase || "—",
      });
      return;
    }
    setStatus(res?.error || "Could not connect", false);
    setBackendMeta({
      backend: classifyBackend(normalizeUrl(document.getElementById("apiBaseUrl").value)),
      base: debug?.configuredBase || normalizeUrl(document.getElementById("apiBaseUrl").value) || "—",
      version: "—",
      mode: debug?.mode || "—",
      configuredBase: debug?.configuredBase || "—",
      resolvedBase: debug?.resolvedBase || "—",
      lastGoodBase: debug?.lastGoodBase || "—",
    });
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), false);
  }
}

async function load() {
  const stored = await chrome.storage.sync.get(["apiBaseUrl", "voiceId", "apiBasePreferAuto"]);
  const url = normalizeUrl(stored.apiBaseUrl);
  if (stored.apiBasePreferAuto === true) {
    document.getElementById("apiBaseUrl").value = "";
  } else {
    document.getElementById("apiBaseUrl").value =
      !url || url === PRODUCTION_BASE ? "" : url;
  }

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
  const typed = normalizeUrl(document.getElementById("apiBaseUrl").value);
  try {
    localStorage.setItem("dc-route-debug", routeDebug ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (typed && !isAllowedUrl(typed)) {
    setStatus("URL must be localhost:3020/3000/3001/3010 or a vercel.app host", false);
    return;
  }
  const apiBaseUrl = !typed || typed === PRODUCTION_BASE ? "" : typed;
  if (apiBaseUrl) {
    await chrome.storage.sync.set({ apiBaseUrl, voiceId });
    await chrome.storage.sync.remove("apiBasePreferAuto");
  } else {
    await chrome.storage.sync.remove("apiBaseUrl");
    await chrome.storage.sync.set({ voiceId, apiBasePreferAuto: true });
  }
  await chrome.storage.local.remove("apiBaseLastGood");
  setStatus(
    `Saved — ${apiBaseUrl || "auto (localhost then Vercel)"}, voice ${voiceId}${
      routeDebug ? ", routing debug on" : ""
    }`,
    true
  );
  await testConnection();
}

document.getElementById("save").addEventListener("click", () => {
  void saveSettings();
});

document.getElementById("usePreview").addEventListener("click", async () => {
  document.getElementById("apiBaseUrl").value = PREVIEW_BASE;
  await chrome.storage.sync.set({
    apiBaseUrl: PREVIEW_BASE,
    voiceId: document.getElementById("voiceId").value || DEFAULT_VOICE,
  });
  await chrome.storage.sync.remove("apiBasePreferAuto");
  await chrome.storage.local.remove("apiBaseLastGood");
  setStatus(`Pinned preview — ${PREVIEW_BASE}`, true);
  await testConnection();
});

document.getElementById("reset").addEventListener("click", async () => {
  document.getElementById("apiBaseUrl").value = "";
  document.getElementById("voiceId").value = DEFAULT_VOICE;
  await chrome.storage.sync.remove("apiBaseUrl");
  await chrome.storage.sync.set({ voiceId: DEFAULT_VOICE, apiBasePreferAuto: true });
  await chrome.storage.local.remove("apiBaseLastGood");
  setStatus("Reset — auto (localhost then Vercel)", true);
  await testConnection();
});

load();
