/** Shared API base URL — prefer local `npm run dev:karen`, else Vercel production. */
const PRODUCTION_BASE = "https://desk-copilor.vercel.app";
/**
 * Active Vercel preview for extension testing (no trailing slash).
 * When PIN_PREVIEW_API_BASE is true and the user has not chosen AUTO,
 * the service worker writes this into chrome.storage.sync and clears sticky
 * localhost last-good so Options/auto resolve do not stick on old hosts.
 */
const PREVIEW_BASE = "https://desk-copilor-lvmufjv3k-adam-b45d.vercel.app";
const PIN_PREVIEW_API_BASE = true;
const LOCAL_CANDIDATES = [
  "http://localhost:3020",
  "http://127.0.0.1:3020",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3010",
  "http://127.0.0.1:3010",
];
/** First local probe — dev can be slow under desk-tracker load. */
const LOCAL_PROBE_TIMEOUT_MS = 2500;
/** Patient retry when quick probe times out (still local, not Vercel). */
const LOCAL_PROBE_RETRY_MS = 3500;
const LOCAL_PROBE_RETRIES = 2;

let cachedBase = null;
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

function isLocalBase(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost") return false;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return port === "3020" || port === "3000" || port === "3001" || port === "3010";
  } catch {
    return false;
  }
}

function isAllowedBase(url) {
  return isLocalBase(url) || isVercelBase(url);
}

function isProbeTimeout(err) {
  const msg = err instanceof Error ? err.message : String(err || "");
  return err?.name === "TimeoutError" || /timeout|aborted/i.test(msg);
}

function classifyBackendKind(base) {
  const n = normalizeBase(base);
  if (!n) return "unknown";
  if (isLocalBase(n)) return "localhost";
  if (n === PRODUCTION_BASE) return "production";
  if (isVercelBase(n) && n === normalizeBase(PREVIEW_BASE)) return "preview";
  if (isVercelBase(n)) return "custom";
  return "custom";
}

function rememberBase(base) {
  const normalized = normalizeBase(base);
  if (!normalized || !isAllowedBase(normalized)) return;
  cachedBase = normalized;
  lastHealthOkAt = Date.now();
  // lastGood is an AUTO performance hint only — never store non-local as lastGood local,
  // and only persist local lastGood when we are not in explicit mode (checked async below).
  if (isLocalBase(normalized)) {
    chrome.storage.sync.get(["apiBaseUrl", "apiBasePreferAuto"]).then((stored) => {
      const custom = normalizeBase(stored.apiBaseUrl);
      const preferAuto = stored.apiBasePreferAuto === true;
      const explicit = custom && custom !== PRODUCTION_BASE && isAllowedBase(custom) && !preferAuto;
      if (!explicit) {
        chrome.storage.local.set({ apiBaseLastGood: normalized }).catch(() => {});
      }
    }).catch(() => {});
  } else {
    chrome.storage.local.set({ apiBaseLastGood: normalized }).catch(() => {});
  }
}

async function getStoredLastGoodLocal() {
  const { apiBaseLastGood } = await chrome.storage.local.get("apiBaseLastGood");
  const last = normalizeBase(apiBaseLastGood);
  return last && isLocalBase(last) ? last : null;
}

function trustCachedLocal(now = Date.now()) {
  if (!cachedBase || !isLocalBase(cachedBase) || lastHealthOkAt <= 0) return null;
  if (now - lastHealthOkAt >= HEALTH_TTL_MS) return null;
  return cachedBase;
}

/** Stored override, or empty string for auto (localhost then Vercel). */
async function getStoredCustomBase() {
  const stored = await chrome.storage.sync.get(["apiBaseUrl", "apiBasePreferAuto"]);
  if (stored.apiBasePreferAuto === true) return "";
  const custom = normalizeBase(stored.apiBaseUrl);
  if (!custom || custom === PRODUCTION_BASE) return "";
  if (!isAllowedBase(custom)) return "";
  return custom;
}

async function getApiBase() {
  const custom = await getStoredCustomBase();
  return custom || cachedBase || PRODUCTION_BASE;
}

async function getApiBaseDebugSnapshot() {
  const custom = await getStoredCustomBase();
  const { apiBaseLastGood } = await chrome.storage.local.get("apiBaseLastGood");
  const { apiBasePreferAuto } = await chrome.storage.sync.get("apiBasePreferAuto");
  return {
    mode: custom ? "explicit" : "auto",
    preferAuto: apiBasePreferAuto === true,
    configuredBase: custom || "",
    resolvedBase: cachedBase || "",
    lastGoodBase: normalizeBase(apiBaseLastGood) || "",
    pinPreview: PIN_PREVIEW_API_BASE,
    previewBase: PREVIEW_BASE,
  };
}

/**
 * Pin Options `apiBaseUrl` to the active preview and clear sticky last-good.
 * Skipped when user explicitly chose AUTO (`apiBasePreferAuto`).
 */
async function pinPreviewApiBase() {
  if (!PIN_PREVIEW_API_BASE) return normalizeBase(PREVIEW_BASE);
  const { apiBasePreferAuto } = await chrome.storage.sync.get("apiBasePreferAuto");
  if (apiBasePreferAuto === true) return "";
  const target = normalizeBase(PREVIEW_BASE);
  if (!target || !isAllowedBase(target)) return "";
  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  const custom = normalizeBase(apiBaseUrl);
  if (custom !== target) {
    await chrome.storage.sync.set({ apiBaseUrl: target });
  }
  await chrome.storage.local.remove("apiBaseLastGood");
  cachedBase = target;
  lastHealthOkAt = 0;
  return target;
}

/** Drop illegal stored URLs. Optionally pin active preview for ship testing. */
async function ensureApiBase() {
  if (PIN_PREVIEW_API_BASE) {
    await pinPreviewApiBase();
  }
  const { apiBaseUrl } = await chrome.storage.sync.get("apiBaseUrl");
  const custom = normalizeBase(apiBaseUrl);
  if (custom && !isAllowedBase(custom)) {
    await chrome.storage.sync.remove("apiBaseUrl");
  }
  const explicit = await getStoredCustomBase();
  const { apiBaseLastGood } = await chrome.storage.local.get("apiBaseLastGood");
  const last = normalizeBase(apiBaseLastGood);
  if (last && !isAllowedBase(last)) {
    await chrome.storage.local.remove("apiBaseLastGood");
    if (cachedBase && !isAllowedBase(cachedBase)) cachedBase = null;
  }
  // Sticky lastGood elsewhere must not override an explicit pin.
  if (explicit && last && last !== explicit) {
    await chrome.storage.local.remove("apiBaseLastGood");
  }
  if (explicit && cachedBase && cachedBase !== explicit) {
    cachedBase = null;
    lastHealthOkAt = 0;
  }
}

async function ensureVercelApiBase() {
  return ensureApiBase();
}

async function probeBase(base, timeoutMs) {
  const res = await fetch(`${base}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data?.ok !== true) throw new Error("health not ok");
  return { base: normalizeBase(base), version: data?.version || null };
}

/** Probe dev ports in parallel — never let one hung port block others. */
async function probeLocalBatch(timeoutMs, bases) {
  let lastErr = null;
  const results = await Promise.allSettled(bases.map((base) => probeBase(base, timeoutMs)));
  for (const result of results) {
    if (result.status === "fulfilled") return result.value;
    lastErr = result.reason;
  }
  if (lastErr) throw lastErr;
  throw new Error("no local candidates");
}

async function probeLocalQuick() {
  const batches = [
    LOCAL_CANDIDATES.slice(0, 4),
    LOCAL_CANDIDATES.slice(4, 8),
  ];
  let lastErr = null;
  for (const batch of batches) {
    try {
      return await probeLocalBatch(LOCAL_PROBE_TIMEOUT_MS, batch);
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("no local candidates");
}

async function probeLocalPatient() {
  let lastErr = null;
  for (let attempt = 0; attempt < LOCAL_PROBE_RETRIES; attempt += 1) {
    const timeoutMs = LOCAL_PROBE_RETRY_MS + attempt * 1500;
    for (const batch of [LOCAL_CANDIDATES.slice(0, 4), LOCAL_CANDIDATES.slice(4, 8)]) {
      try {
        return await probeLocalBatch(timeoutMs, batch);
      } catch (err) {
        lastErr = err;
      }
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("local probe exhausted");
}

async function resolveLocalProbe(patient = false) {
  const lastGood = await getStoredLastGoodLocal();
  if (lastGood) {
    try {
      return await probeBase(
        lastGood,
        patient ? LOCAL_PROBE_RETRY_MS + 1500 : LOCAL_PROBE_TIMEOUT_MS
      );
    } catch {
      /* try full local sweep */
    }
  }
  try {
    return await probeLocalQuick();
  } catch (err) {
    if (!patient && isProbeTimeout(err)) {
      return probeLocalPatient();
    }
    throw err;
  }
}

function candidateList(custom, includeLocal) {
  const ordered = [];
  const push = (base) => {
    const n = normalizeBase(base);
    if (n && isAllowedBase(n) && !ordered.includes(n)) ordered.push(n);
  };
  if (includeLocal) {
    if (isLocalBase(custom)) push(custom);
    else LOCAL_CANDIDATES.forEach(push);
  }
  if (custom && !isLocalBase(custom)) push(custom);
  if (cachedBase) push(cachedBase);
  push(PRODUCTION_BASE);
  return ordered;
}

/**
 * Health check.
 * EXPLICIT custom/preview → probe that host only (no localhost-first).
 * AUTO → live localhost first, then Vercel.
 */
async function pingHealth(opts = {}) {
  const timeoutMs = opts.quick ? 4500 : 10000;
  await ensureApiBase();
  const custom = await getStoredCustomBase();
  const localOnly = Boolean(custom && isLocalBase(custom));
  const vercelPin = Boolean(custom && isVercelBase(custom));

  // Pinned preview/prod/custom URL — never probe localhost first; never silent-fallback.
  if (vercelPin) {
    try {
      const probe = await probeBase(custom, timeoutMs);
      rememberBase(probe.base);
      if (opts.warm !== false) {
        fetch(`${probe.base}/api/warm`, { signal: AbortSignal.timeout(12000) }).catch(() => {});
      }
      return {
        ok: true,
        base: probe.base,
        version: probe.version || null,
        backendKind: classifyBackendKind(probe.base),
      };
    } catch {
      lastHealthOkAt = 0;
      if (cachedBase && cachedBase !== custom) cachedBase = null;
      if (cachedBase === custom) cachedBase = null;
      return {
        ok: false,
        error: `Backend offline — pinned ${custom} did not pass /api/health`,
        base: custom,
        backendKind: classifyBackendKind(custom),
      };
    }
  }

  if (localOnly) {
    try {
      const probe = await probeBase(custom, LOCAL_PROBE_RETRY_MS + 1500);
      rememberBase(probe.base);
      return {
        ok: true,
        base: probe.base,
        version: probe.version || null,
        backendKind: classifyBackendKind(probe.base),
      };
    } catch {
      lastHealthOkAt = 0;
      if (cachedBase && isLocalBase(cachedBase)) cachedBase = null;
      return {
        ok: false,
        error: `Local backend offline — ${custom} (start npm run dev:karen)`,
        base: custom,
        backendKind: "localhost",
      };
    }
  }

  // AUTO mode
  try {
    const local = await resolveLocalProbe(!opts.quick);
    rememberBase(local.base);
    return {
      ok: true,
      base: local.base,
      version: local.version || null,
      backendKind: classifyBackendKind(local.base),
    };
  } catch {
    lastHealthOkAt = 0;
    if (cachedBase && isLocalBase(cachedBase)) cachedBase = null;
  }

  const candidates = candidateList("", false);
  for (const candidate of candidates) {
    if (isLocalBase(candidate)) continue;
    try {
      const probe = await probeBase(candidate, timeoutMs);
      rememberBase(probe.base);
      if (opts.warm !== false && isVercelBase(probe.base)) {
        fetch(`${probe.base}/api/warm`, { signal: AbortSignal.timeout(12000) }).catch(() => {});
      }
      return {
        ok: true,
        base: probe.base,
        version: probe.version || null,
        backendKind: classifyBackendKind(probe.base),
      };
    } catch {
      /* try next */
    }
  }

  cachedBase = null;
  lastHealthOkAt = 0;
  return {
    ok: false,
    error: `Backend offline — start npm run dev:karen or check ${PRODUCTION_BASE}`,
  };
}

function clearApiCache() {
  cachedBase = null;
  lastHealthOkAt = 0;
  chrome.storage.local.remove("apiBaseLastGood").catch(() => {});
}

/**
 * Apply an explicit base selection (SAVE / Use Active Preview).
 * Clears stale lastGood and in-memory cache so the next resolve uses the pin.
 */
async function applyExplicitApiBase(url) {
  const target = normalizeBase(url);
  if (!target || !isAllowedBase(target)) {
    throw new Error("URL must be localhost:3020/3000/3001/3010 or a vercel.app host");
  }
  await chrome.storage.sync.set({ apiBaseUrl: target });
  await chrome.storage.sync.remove("apiBasePreferAuto");
  await chrome.storage.local.remove("apiBaseLastGood");
  cachedBase = null;
  lastHealthOkAt = 0;
  return target;
}

/** RESET TO AUTO — clear explicit pin; localhost probing allowed again. */
async function applyAutoApiBase() {
  await chrome.storage.sync.remove("apiBaseUrl");
  await chrome.storage.sync.set({ apiBasePreferAuto: true });
  await chrome.storage.local.remove("apiBaseLastGood");
  cachedBase = null;
  lastHealthOkAt = 0;
}

async function resolveApiBase(opts = {}) {
  const force = opts.force === true;
  const now = Date.now();
  const custom = await getStoredCustomBase();

  // EXPLICIT mode: never trust localhost cache / lastGood from another host.
  if (custom) {
    if (
      !force &&
      cachedBase === custom &&
      lastHealthOkAt > 0 &&
      now - lastHealthOkAt < HEALTH_TTL_MS
    ) {
      return custom;
    }
    const ping = await pingHealth({ quick: true, warm: opts.warm !== false });
    if (!ping.ok) {
      throw new Error(ping.error);
    }
    return ping.base;
  }

  // AUTO — trust recent healthy Vercel/local cache.
  if (!force && cachedBase && lastHealthOkAt > 0 && now - lastHealthOkAt < HEALTH_TTL_MS) {
    if (isVercelBase(cachedBase)) return cachedBase;
  }
  const trustedLocal = trustCachedLocal(now);
  if (!force && trustedLocal) {
    try {
      await probeBase(trustedLocal, 800);
      return trustedLocal;
    } catch {
      lastHealthOkAt = 0;
      if (cachedBase && isLocalBase(cachedBase)) cachedBase = null;
    }
  }
  if (!force) {
    const lastGood = await getStoredLastGoodLocal();
    if (lastGood && lastHealthOkAt > 0 && now - lastHealthOkAt < HEALTH_TTL_MS) {
      try {
        await probeBase(lastGood, 800);
        cachedBase = lastGood;
        return lastGood;
      } catch {
        lastHealthOkAt = 0;
      }
    }
  }
  const ping = await pingHealth({ quick: true, warm: opts.warm !== false });
  if (!ping.ok) {
    throw new Error(ping.error);
  }
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
    if (!isProbeTimeout(err)) lastHealthOkAt = 0;
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
