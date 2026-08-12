/** Shared API base URL — always Vercel unless Options overrides. */
const PRODUCTION_BASE = "https://desk-copilor.vercel.app";

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

async function getApiBase() {
  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  const custom = normalizeBase(apiBaseUrl);
  return custom || PRODUCTION_BASE;
}

async function probeBase(base, timeoutMs) {
  const res = await fetch(`${base}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeBase(base);
}

/** Health check — Vercel only (or custom URL from Options). */
async function pingHealth() {
  const base = await getApiBase();
  const candidates = [cachedBase === base ? null : base, base].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const ok = await probeBase(candidate, 10000);
      rememberBase(ok);
      return { ok: true, base: ok };
    } catch {
      /* try next */
    }
  }

  cachedBase = null;
  return {
    ok: false,
    error: `Backend offline — check ${base} in Extension Options`,
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
