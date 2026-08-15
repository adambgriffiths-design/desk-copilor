# KAREN — API Base Pin / Localhost Override Diagnosis

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/` (mirrored critical fix → root `extension/` Adam loads)  
**Mode:** DIAGNOSE → SMALLEST FIX → VERIFY  
**Deploy / commit / push:** NOT DONE  

---

## ROOT_CAUSE

Explicit preview was written to Options / `chrome.storage.sync.apiBaseUrl` (via `PREVIEW_BASE` + `PIN_PREVIEW_API_BASE`), but **runtime resolution still probed localhost first** and returned the healthy local backend. Options field showed the preview URL; Connected / fetches used `http://localhost:3020`.

Contributing factors in the live root extension before the fix:

1. **`pingHealth()` had no Vercel-explicit early exit** — after `ensureApiBase()` / pin wrote the preview URL, it still ran `resolveLocalProbe()` whenever `custom` was not a *local* URL.
2. **`resolveApiBase()` trusted `cachedBase` / `apiBaseLastGood` localhost shortcuts before honouring an explicit non-local pin.**
3. **`background.js` chat/TTS preferred stale `cachedBase`** (`cachedBase || resolveApiBase()`), so a prior AUTO localhost resolve could win even after storage showed preview.
4. Integration-tree Options was a separate regression: **Save always wrote production**, field was readonly, no Use Active Preview — so tree Options could not express mode B/C correctly.

## FIRST_BROKEN_HOP

**`pingHealth()` → localhost-first probe after explicit Vercel `apiBaseUrl` was already set**  
(Trace hop: `ensureApiBase` / pin OK → **`pingHealth` ignores vercel pin** → `rememberBase(localhost)` → Connected UI / chat use localhost)

Secondary hop (same symptom family): `background.js` chat stream using stale `cachedBase` before re-resolve.

Not first-broken: Options field vs storage mismatch (field correctly showed pinned preview); content.js independent cache (none found).

## MODE_BEFORE

`explicit` (storage / Options showed preview) **but runtime behaved as AUTO localhost-first**

## CONFIGURED_BASE_BEFORE

`https://desk-copilor-iheit8p38-adam-b45d.vercel.app`

## RESOLVED_BASE_BEFORE

`http://localhost:3020`

## ACTUAL_FETCH_BASE_BEFORE

`http://localhost:3020` (health Connected line + chat stream via SW `cachedBase` / `pingHealth` local win)

---

## FIX

1. **Explicit mode is authoritative** in `api-config.js`:
   - Vercel/custom pin → probe **only** that host; fail closed; **no** localhost probe / silent lastGood substitution.
   - Local explicit pin → probe only that local URL.
   - AUTO (blank / `apiBasePreferAuto`) → localhost-first then production (unchanged).
2. **`resolveApiBase()` checks `getStoredCustomBase()` first** — never return trusted local / lastGood when explicit is set.
3. **SAVE / Use Active Preview / Reset**:
   - `applyExplicitApiBase` / Options write `apiBaseUrl`, clear `apiBasePreferAuto`, clear stale `apiBaseLastGood`, null in-memory cache.
   - Reset sets `apiBasePreferAuto: true` so `PIN_PREVIEW_API_BASE` does not immediately re-pin over AUTO.
4. **`resolveRequestBase()` in background** — chat + TTS prefer explicit pin over stale `cachedBase`.
5. **Options UI** — editable URL, Use active preview, Reset to auto, Connected → actual host, debug block: BACKEND / BASE / VERSION / MODE / CONFIGURED / RESOLVED / LAST_GOOD.
6. Synced same files to root `extension/` so Adam’s unpacked load path matches the tree.

## FILES_CHANGED

| File | Change |
|------|--------|
| `.tmp/karen-final-integration/extension/api-config.js` | Explicit-first resolve; pin + preferAuto; debug snapshot |
| `.tmp/karen-final-integration/extension/options.js` | Save/Use Preview/Reset contract; Connected truth + meta |
| `.tmp/karen-final-integration/extension/options.html` | Editable field; Use active preview; backendMeta |
| `.tmp/karen-final-integration/extension/background.js` | `resolveRequestBase`; `GET_API_BASE_DEBUG`; chat/TTS |
| `.tmp/karen-final-integration/scripts/test-api-base-pin.ts` | Matrix 1–10 harness |
| `extension/api-config.js` | Mirrored |
| `extension/options.js` | Mirrored |
| `extension/options.html` | Mirrored |
| `extension/background.js` | Mirrored resolve path |

Weather / DV scaffolds: **not touched**.

---

## Test matrix

| # | Case | Result |
|---|------|--------|
| 1 | localhost healthy + AUTO → localhost | **PASS** |
| 2 | localhost dead + AUTO → production fallback | **PASS** |
| 3 | localhost healthy + explicit PREVIEW → PREVIEW (no localhost probe) | **PASS** |
| 4 | stale lastGood=localhost + explicit PREVIEW → PREVIEW | **PASS** |
| 5 | SW stale cached localhost + explicit PREVIEW → PREVIEW | **PASS** |
| 6 | explicit PREVIEW unreachable → honest failure, no localhost | **PASS** |
| 7 | RESET TO AUTO → localhost may win | **PASS** |
| 8 | reload / ensureApiBase persistence of explicit | **PASS** |
| 9 | SW wake pin seed → preview | **PASS** |
| 10 | Use Active Preview → exact PREVIEW_BASE | **PASS** |

Harness: `npx tsx .tmp/karen-final-integration/scripts/test-api-base-pin.ts` → **10/10 PASS**

---

## Scoreboard (brief §9)

```
ROOT_CAUSE: pingHealth/resolveApiBase ignored explicit Vercel pin and probed localhost first; SW also preferred stale cachedBase for chat
FIRST_BROKEN_HOP: pingHealth() localhost-first after apiBaseUrl already set to preview
MODE_BEFORE: explicit (UI/storage) but runtime AUTO-local
CONFIGURED_BASE_BEFORE: https://desk-copilor-iheit8p38-adam-b45d.vercel.app
RESOLVED_BASE_BEFORE: http://localhost:3020
ACTUAL_FETCH_BASE_BEFORE: http://localhost:3020

FIX: explicit-first ping/resolve; clear lastGood/cache on pin; resolveRequestBase for chat/TTS; Options Use Preview + preferAuto; debug BACKEND/BASE/VERSION
FILES_CHANGED: api-config.js, options.js, options.html, background.js (tree + root mirror); scripts/test-api-base-pin.ts

AUTO_LOCALHOST: PASS
EXPLICIT_PREVIEW: PASS
STALE_LAST_GOOD_OVERRIDE: PASS
SERVICE_WORKER_STALE_STATE: PASS
EXPLICIT_FAILURE_NO_SILENT_FALLBACK: PASS
RESET_TO_AUTO: PASS
RELOAD_PERSISTENCE: PASS

HEALTH_HOST: https://desk-copilor-iheit8p38-adam-b45d.vercel.app
HEALTH_VERSION: 1.4.78
CHAT_HOST: https://desk-copilor-iheit8p38-adam-b45d.vercel.app (POST /api/chat/stream → 200 text/event-stream; same host as health; SW resolveRequestBase shares resolveApiBase)

TYPECHECK: N/A (extension JS-only change)
FOCUSED_TESTS: 10/10 PASS (test-api-base-pin.ts)
```

---

## Human reload note

chrome://extensions → **Reload** unpacked extension (root or tree path you use) → Options → confirm:

```
Connected → https://desk-copilor-iheit8p38-adam-b45d.vercel.app
BACKEND: preview
VERSION: 1.4.78
MODE: explicit
```

If localhost still shows after reload with blank AUTO intentionally chosen, that is expected. Use **Use active preview** or ensure field is the preview URL and Save.

---

## Non-regression

- AUTO localhost-first retained (matrix 1).
- AUTO → production fallback retained (matrix 2).
- Explicit unreachable does not silently substitute localhost (matrix 6).
- No production deploy / commit / push.
