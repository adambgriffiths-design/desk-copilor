/** Shared API base URL resolution — import via importScripts in service worker. */
const PRODUCTION_BASE = "https://desk-copilor.vercel.app";
const LOCAL_BASE = "http://127.0.0.1:3000";
const LOCAL_FALLBACK = "http://localhost:3000";

let cachedBase = null;

function normalizeBase(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function rememberBase(base) {
  const normalized = normalizeBase(base);
  if (!normalized) return;
  cachedBase = normalized;
  chrome.storage.local.set({ apiBaseLastGood: normalized }).catch(() => {});
}

async function getCustomBase() {
  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  return normalizeBase(apiBaseUrl);
}

function isLocalBase(base) {
  const b = normalizeBase(base);
  return (
    b === LOCAL_BASE ||
    b === LOCAL_FALLBACK ||
    b.startsWith("http://127.0.0.1:") ||
    b.startsWith("http://localhost:")
  );
}

async function getApiCandidates() {
  const custom = await getCustomBase();
  if (custom) return [custom];
  return [PRODUCTION_BASE, LOCAL_BASE, LOCAL_FALLBACK];
}

async function probeBase(base, timeoutMs) {
  const res = await fetch(`${base}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeBase(base);
}

/** Health check — saved URL first, then production Vercel, localhost last. */
async function pingHealth() {
  const candidates = await getApiCandidates();
  const ordered = [];

  if (cachedBase && candidates.includes(cachedBase)) {
    ordered.push(cachedBase);
  }
  for (const base of candidates) {
    if (!ordered.includes(base)) ordered.push(base);
  }

  for (const base of ordered) {
    try {
      const ok = await probeBase(base, 8000);
      rememberBase(ok);
      return { ok: true, base: ok };
    } catch {
      /* try next */
    }
  }

  cachedBase = null;
  const hint = normalizeBase(await getCustomBase()) || PRODUCTION_BASE;
  return {
    ok: false,
    error: `Backend offline — check ${hint} is up (Extension Options → Save)`,
  };
}

function clearApiCache() {
  cachedBase = null;
  chrome.storage.local.remove("apiBaseLastGood").catch(() => {});
}

async function resolveApiBase() {
  const ping = await pingHealth();
  if (!ping.ok) throw new Error(ping.error);
  return ping.base;
}

async function apiFetch(path, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8000;
  const base = await resolveApiBase();
  const res = await fetch(`${base}${path}`, {
    method: options.method || "GET",
    headers: options.headers,
    body: options.body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.error ||
      data.message ||
      (res.status === 500 ? `Backend error at ${base}` : `HTTP ${res.status}`);
    throw new Error(msg);
  }
  rememberBase(base);
  return data;
}
