/** Shared API base URL — always Vercel production. */
const PRODUCTION_BASE = "https://desk-copilor.vercel.app";

let cachedBase = PRODUCTION_BASE;
/** Skip redundant /api/health probes between successful checks. */
let lastHealthOkAt = 0;
const HEALTH_TTL_MS = 120_000;

function normalizeBase(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function isVercelBase(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function rememberBase(base) {
  const normalized = normalizeBase(base);
  if (!normalized || !isVercelBase(normalized)) return;
  cachedBase = normalized;
  lastHealthOkAt = Date.now();
  chrome.storage.local.set({ apiBaseLastGood: normalized }).catch(() => {});
}

async function getApiBase() {
  return PRODUCTION_BASE;
}

/** Force Vercel on install/update — clear stale localhost from storage. */
async function ensureVercelApiBase() {
  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  const custom = normalizeBase(apiBaseUrl);
  if (!custom || !isVercelBase(custom)) {
    await chrome.storage.sync.set({ apiBaseUrl: PRODUCTION_BASE });
  }
  const { apiBaseLastGood } = await chrome.storage.local.get("apiBaseLastGood");
  const last = normalizeBase(apiBaseLastGood);
  if (last && !isVercelBase(last)) {
    await chrome.storage.local.remove("apiBaseLastGood");
    cachedBase = PRODUCTION_BASE;
  }
}

async function probeBase(base, timeoutMs) {
  const res = await fetch(`${base}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let version = null;
  try {
    const data = await res.json();
    version = data?.version || null;
  } catch {
    /* health body optional */
  }
  return { base: normalizeBase(base), version };
}

/** Health check — Vercel production only. */
async function pingHealth(opts = {}) {
  const timeoutMs = opts.quick ? 4500 : 10000;
  await ensureVercelApiBase();
  const base = await getApiBase();
  const candidates = [
    cachedBase && isVercelBase(cachedBase) ? cachedBase : null,
    base,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const probe = await probeBase(candidate, timeoutMs);
      rememberBase(probe.base);
      if (opts.warm !== false) {
        fetch(`${probe.base}/api/warm`, { signal: AbortSignal.timeout(12000) }).catch(() => {});
      }
      return { ok: true, base: probe.base, version: probe.version || null };
    } catch {
      /* try next */
    }
  }

  cachedBase = PRODUCTION_BASE;
  return {
    ok: false,
    error: `Vercel backend offline — ${base}`,
  };
}

function clearApiCache() {
  cachedBase = PRODUCTION_BASE;
  lastHealthOkAt = 0;
  chrome.storage.local.remove("apiBaseLastGood").catch(() => {});
}

async function resolveApiBase(opts = {}) {
  const force = opts.force === true;
  const now = Date.now();
  if (
    !force &&
    cachedBase &&
    isVercelBase(cachedBase) &&
    lastHealthOkAt > 0 &&
    now - lastHealthOkAt < HEALTH_TTL_MS
  ) {
    return cachedBase;
  }
  const ping = await pingHealth({ quick: true, warm: opts.warm !== false });
  if (!ping.ok) throw new Error(ping.error);
  return ping.base;
}

async function apiFetch(path, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  let base;
  try {
    base = await resolveApiBase({ force: options.forceBaseRefresh === true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg.includes("offline") ? msg : `Backend unreachable — ${msg}`);
  }
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err?.name === "TimeoutError" || msg.toLowerCase().includes("timeout")) {
      throw new Error(`Request timed out (${Math.round(timeoutMs / 1000)}s) — try again`);
    }
    lastHealthOkAt = 0;
    throw new Error(`Network error — ${msg}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.error ||
      data.message ||
      (res.status === 500 ? `Backend error at ${base}` : `HTTP ${res.status}`);
    if (res.status >= 500) lastHealthOkAt = 0;
    throw new Error(msg);
  }
  rememberBase(base);
  return data;
}
