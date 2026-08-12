const PRODUCTION_BASE = "https://desk-copilor.vercel.app";
const LOCAL_DEV_BASE = "http://127.0.0.1:3000";

function setStatus(text, ok) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = ok === true ? "ok" : ok === false ? "err" : "";
}

async function testConnection() {
  setStatus("Testing backend …", null);
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

async function load() {
  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  const url = normalizeUrl(apiBaseUrl) || PRODUCTION_BASE;
  if (!normalizeUrl(apiBaseUrl)) {
    await chrome.storage.sync.set({ apiBaseUrl: PRODUCTION_BASE });
  }
  document.getElementById("apiBaseUrl").value = url;
  await testConnection();
}

function normalizeUrl(raw) {
  return String(raw || "")
    .trim()
    .replace(/\/+$/, "");
}

document.getElementById("save").addEventListener("click", async () => {
  const raw = normalizeUrl(document.getElementById("apiBaseUrl").value);
  if (!raw) {
    setStatus("Enter your Vercel URL", false);
    return;
  }
  if (!/^https?:\/\//i.test(raw)) {
    setStatus("URL must start with http:// or https://", false);
    return;
  }
  await chrome.storage.sync.set({ apiBaseUrl: raw });
  setStatus(`Saved — ${raw}`, true);
  await testConnection();
});

document.getElementById("clear").addEventListener("click", async () => {
  document.getElementById("apiBaseUrl").value = LOCAL_DEV_BASE;
  await chrome.storage.sync.set({ apiBaseUrl: LOCAL_DEV_BASE });
  setStatus("Saved — local dev (npm run dev)", true);
  await testConnection();
});

load();
