const PRODUCTION_BASE = "https://desk-copilor.vercel.app";

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
  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  const url = normalizeUrl(apiBaseUrl) || PRODUCTION_BASE;
  if (!normalizeUrl(apiBaseUrl)) {
    await chrome.storage.sync.set({ apiBaseUrl: PRODUCTION_BASE });
  }
  document.getElementById("apiBaseUrl").value = url;
  await testConnection();
}

document.getElementById("save").addEventListener("click", async () => {
  const raw = normalizeUrl(document.getElementById("apiBaseUrl").value);
  if (!raw) {
    setStatus("Enter your Vercel URL", false);
    return;
  }
  if (!/^https:\/\//i.test(raw)) {
    setStatus("Use https:// (Vercel URL)", false);
    return;
  }
  await chrome.storage.sync.set({ apiBaseUrl: raw });
  await chrome.storage.local.remove("apiBaseLastGood");
  setStatus(`Saved — ${raw}`, true);
  await testConnection();
});

document.getElementById("reset").addEventListener("click", async () => {
  document.getElementById("apiBaseUrl").value = PRODUCTION_BASE;
  await chrome.storage.sync.set({ apiBaseUrl: PRODUCTION_BASE });
  await chrome.storage.local.remove("apiBaseLastGood");
  setStatus(`Reset — ${PRODUCTION_BASE}`, true);
  await testConnection();
});

load();
