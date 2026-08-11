/** Shared API base URL resolution — import via importScripts in service worker. */
const LOCAL_HOSTS = ["127.0.0.1", "localhost"];
const LOCAL_PORTS = [3000, 3001, 3002];

let cachedBase = null;

function normalizeBase(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function localBases() {
  const bases = [];
  for (const host of LOCAL_HOSTS) {
    for (const port of LOCAL_PORTS) {
      bases.push(`http://${host}:${port}`);
    }
  }
  return bases;
}

async function getApiBases() {
  const stored = await chrome.storage.sync.get("apiBaseUrl");
  const custom = normalizeBase(stored.apiBaseUrl);
  if (custom) return [custom, ...localBases()];
  return localBases();
}

async function probeBase(base, timeoutMs) {
  const res = await fetch(`${base}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return base;
}

/** Find first reachable backend — parallel probe so dead ports don't stack timeouts. */
async function resolveApiBase(probeTimeoutMs = 3500) {
  if (cachedBase) {
    try {
      await probeBase(cachedBase, 2000);
      return cachedBase;
    } catch {
      cachedBase = null;
    }
  }

  try {
    const session = await chrome.storage.session.get("apiBaseResolved");
    if (session.apiBaseResolved) {
      await probeBase(session.apiBaseResolved, 2000);
      cachedBase = session.apiBaseResolved;
      return cachedBase;
    }
  } catch {
    /* try full discovery */
  }

  const bases = await getApiBases();
  const unique = [...new Set(bases)];
  const results = await Promise.allSettled(
    unique.map((base) => probeBase(base, probeTimeoutMs))
  );
  for (const r of results) {
    if (r.status === "fulfilled") {
      cachedBase = r.value;
      chrome.storage.session.set({ apiBaseResolved: cachedBase }).catch(() => {});
      return cachedBase;
    }
  }

  throw new Error("Backend offline — run npm run dev or set API URL in extension options");
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
      (res.status === 500
        ? "Backend error — check server logs or run npm run dev"
        : `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return data;
}
