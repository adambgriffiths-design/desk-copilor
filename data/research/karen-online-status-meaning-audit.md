# Karen — make ONLINE status mean something (audit)

**Date:** 2026-08-14  
**Mode:** AUDIT ONLY. No implementation. No new health system. No commit/push/deploy. No code changes.  
**Read-only preference:** `extension/connection-state.js`, `api-config.js`, `content.js` reconnect UI, `background.js` (avoid conflicting with in-flight latency instrumentation).  
**Extension version observed:** `1.4.130` (`extension/manifest.json`).  
**Priors:** `karen-connectivity-regression-audit.md`, `karen-speed-connection-priority-audit.md`, `karen-connection-reliability.md`.

---

## Problem

GREEN / ONLINE / `● LIVE` / `.dc-online` can appear when the **backend request path is unusable** (hung local Next, dead chat stream, levels/snapshot failure, or health-only liveness).

---

## Request path under audit

```
TradingView Last (tv-bridge → chart-price)
  → content.js (MARKET/DATA badges, .dc-online, market pulse)
  → chrome.runtime (keepalive / PING / RECONNECT / chat port)
  → background.js connectionManager + api-config
  → local :3000/:3020/… or Vercel
  → /api/health  (liveness only: { ok: true, version })
  → market-data hops: /api/levels · /api/market-snapshot · /api/quote · desk-tracker
  → /api/chat/stream  (desk-copilot-chat-stream port, 90s abort)
  → SSE / JSON response → panel
```

Independent hops already exist in `connection-state.js` (`buildHopHealthSnapshot`): **MARKET** | **API** | **STT** | **TTS** | **CHAT STREAM**. Combined snapshot `evaluateConnectionState` still collapses backend + 60s pulse into one `CONNECTED`/`DEGRADED`.

---

## Proposed product states (minimum conditions)

Map desired trader-facing labels onto existing machinery. Do **not** invent a parallel health stack — reuse hop evaluators + snapshot.

| Product state | Minimum meaning | Existing mapping |
|---|---|---|
| **ONLINE** | Request path usable for desk work: fresh API hop **and** market hop not dead, chat stream not FAILED | Today’s `CONNECTED` is **weaker** than this. Target: `evaluateApiHopHealth === CONNECTED` **and** `evaluateMarketHopHealth !== DISCONNECTED` **and** chat hop ≠ FAILED. Green UI must require this, not TV Last alone. |
| **DEGRADED** | Backend reachable / recently “up”, but market state or heavy routes weak | Snapshot `DEGRADED` (`backendUp` + pulse >60s or missing). Also: `pingHealth` `{ ok:true, degraded:true }` from 120s cache. |
| **STALE** | Price/ticks exist but not live (2s–60s tick age, or DATA STALE) | Market hop `DEGRADED`; header MARKET/DATA `STALE`. Distinct from DEGRADED (backend) — keep split. |
| **DISCONNECTED** | Backend not up; no usable API | Snapshot `DISCONNECTED` / `FAILED`; header OFFLINE. |
| **UNKNOWN** | No trustworthy snapshot yet | `CONNECTING` / `RECONNECTING` / SW waking / null snapshot / first paint. |

### Mapping to current machine states

| Machine (`evaluateConnectionState`) | Product default |
|---|---|
| `CONNECTED` | Candidate ONLINE **only if** chat not FAILED and green is not TV-OR. Today: often false ONLINE. |
| `DEGRADED` | DEGRADED (backend) + possibly STALE (market) |
| `RECONNECTING` / `CONNECTING` | UNKNOWN (or “WAITING” in UI) |
| `DISCONNECTED` / `FAILED` | DISCONNECTED |

Header already splits **MARKET** (ticks) vs **DATA** (backend snapshot) vs **KAREN** (voice). That split is correct; the bug is the RECONNECT button / KAREN idle green OR-ing TV Last.

---

## CURRENT ONLINE LOGIC

### A. Combined snapshot (SSOT candidate — background)

`createConnectionManager` in `extension/connection-state.js`:

- `backendUp = true` when `pingHealth` returns `ok`, **or** any `recordRequestSuccess` (any tracked API / chat HTTP 200).
- State = `evaluateConnectionState`:
  - `!backendUp` → `DISCONNECTED` / `RECONNECTING` / `FAILED`
  - `backendUp` + market pulse age ≤ **60s** → **`CONNECTED`**
  - `backendUp` + no/stale pulse → **`DEGRADED`**
- `isLiveDataAvailable(snapshot)` ≡ `state === "CONNECTED"` only.

`/api/health` (`app/api/health/route.ts`) returns `{ ok: true, version }` only — **no** market-data or chat check.

### B. Health / base resolution (`api-config.js`)

- `probeBase`: requires HTTP OK **and** `data.ok === true` (good when probe actually runs).
- **`HEALTH_TTL_MS = 120_000`**: `trustCachedLocal` can return `{ ok: true, degraded: true }` **without** a fresh health body (timeout / failed probe paths).
- `resolveApiBase` can return cached localhost for 120s **without** re-probing (`force` false).
- Manual RECONNECT clears cache via `clearCache` → `clearApiCache()`.

### C. Green UI (false-confidence surface)

| Surface | Sets green / LIVE when |
|---|---|
| `#dc-reconnect` `.dc-online` + text `● LIVE` | `connState === "CONNECTED"` **OR** `hasFreshTvLast()` (tick ≤2s) — `updateAgentStatus` |
| Header **DATA** | `extra.tvLive === true` forces **LIVE** even if snapshot DEGRADED |
| Header / row **KAREN** idle | `isKarenReadyOnline`: CONNECTED **OR** (DEGRADED && backendUp) **OR** tvLive → badge **LIVE** |
| Market bar / header **MARKET** | Tick path: LIVE ≤2s, STALE ≤60s (honest). Separate from RECONNECT green. |
| Diagnostics hop panel | Independent MARKET/API/CHAT — truthful, not what paints RECONNECT green |

### D. Optimism / caches in content

- `ensureBackend`: 120s `lastBackendCheck` + localhost CONNECTED/DEGRADED → proceed without fresh ping.
- `pingFailStreak < 3`: keep treating backend as up after ping errors.
- Heartbeat: PING every **60s**; every **5s** may `reportMarketPulse(..., { timestamp: Date.now() })` while price age &lt; **30s** — can **extend** `marketFresh` / CONNECTED after last real tick.
- Chat stream: `recordRequestSuccess` on HTTP **headers OK**, before SSE usefulness proven.
- Pulse throttle: `PULSE_MIN_INTERVAL_MS = 4000` from `noteLivePrice`.

### E. Timeouts (hanging requests)

| Path | Timeout |
|---|---|
| Local health probe | 2.5s quick / 3.5s+ patient |
| `pingHealth` Vercel | 4.5s quick / 10s |
| `apiFetch` default | 15s |
| Chat stream port | **90s** abort |
| Content `bgSend` PING/RECONNECT | 15s / 18s |
| Levels | 60s |
| Market snapshot | 20s (bg) |

---

## Every setter of ONLINE / `.dc-online` / CONNECTED / LIVE badge

| Location | What it sets | Trigger |
|---|---|---|
| `connection-state.js` `evaluateConnectionState` | Machine `CONNECTED` | `backendUp` + pulse ≤60s |
| `connection-state.js` `evaluateMarketHopHealth` | Hop MARKET `CONNECTED` | tick age ≤2s |
| `connection-state.js` `evaluateApiHopHealth` | Hop API `CONNECTED` | `backendUp` + last API success ≤60s |
| `connection-state.js` manager `probeBackend` / `recordRequestSuccess` / `recordMarketPulse` | Mutates `backendUp`, pulse, state | Health ok / any API ok / pulse |
| `background.js` PING/RECONNECT / `apiFetchTracked` / chat port | Feeds manager | Messages / fetch |
| `content.js` `updateAgentStatus` | **`.dc-online`**, `● LIVE` / `● KAREN LIVE` | CONNECTED **\|\|** tvLive |
| `content.js` `syncHeaderStatus` | MARKET/DATA/KAREN badges | tvLive can force DATA LIVE; KAREN via `isKarenReadyOnline` |
| `content.js` `updateMarketBarUI` | Market bar LIVE/STALE | Tick/minute age rules |
| `desk-ui-components.js` `isKarenReadyOnline` / `mapKarenStatus` | KAREN **LIVE** green | CONNECTED \| (DEGRADED+backendUp) \| tvLive |
| `desk-ui-components.js` `mapConnectionToDataStatus` | DATA LIVE/STALE/OFFLINE | Snapshot state (overridden by tvLive in syncHeader) |
| `panel.css` `.dc-reconnect.dc-online` | Green accent | Class only |

There is **no** literal product enum string `"ONLINE"` in the extension; user-facing synonym is **LIVE** / `.dc-online` / status line “LIVE — Backend ✓…”.

---

## FALSE-ONLINE CASES

1. **TV Last alone paints green** — `.dc-online` / `● LIVE` / KAREN LIVE while DATA snapshot is DEGRADED or chat dead (`CONNECTED \|\| tvLive`).
2. **120s local health cache** — `trustCachedLocal` → `ok: true` without fresh `/api/health`; hung Next + TCP listen still looks up.
3. **`resolveApiBase` / `ensureBackend` 120s** — requests aimed at cached localhost while app hung.
4. **Health 200 ≠ usable desk** — health is version-only; levels can timeout, snapshot can lack last price, chat can fail (observed in reliability audit).
5. **Any API success ⇒ `backendUp`** — casual warm/session/chat header OK keeps CONNECTED/DEGRADED without market-data path.
6. **Chat success on open** — stream `recordRequestSuccess` before body/SSE proves usable.
7. **`pingFailStreak < 3`** — UI keeps “up” through early ping failures.
8. **Pulse timestamp refresh** — 5s heartbeat re-stamps pulse with `Date.now()` while price &lt;30s old → CONNECTED window extended beyond real tick freshness.
9. **KAREN idle LIVE on DEGRADED+backendUp** — green without fresh market pulse.
10. **DEAD / hung request path with green TV** — classic false ONLINE: chart ticks, local API unusable.
11. **Duplicate listeners** — prior audits: no hard dual client; rev-skew / reinject script gap remain WATCH. Keepalive reconnect-on-disconnect is intentional single port. Not primary false-green cause.
12. **Swallowed errors** — chat SSE malformed chunks ignored; `bgSend` catch paths; probe candidate loop swallows per-base errors (by design) then may fall through to trustedLocal ok.

---

## SINGLE SOURCE OF TRUTH

**Keep:** `background.js` `connectionManager.snapshot()` as the only mutator of `backendUp` / combined `state` / pulse / `lastSuccessfulRequest`, broadcast via `CONNECTION_STATE`.

**Derive UI from:**

1. Combined snapshot (DATA / reconnect machine)  
2. Hop snapshot from `buildHopHealthSnapshot` (MARKET / API / CHAT) — already computed in content for Diagnostics  

**Stop treating as SSOT for green:**

- `hasFreshTvLast()` alone  
- `isKarenReadyOnline` OR of tvLive / DEGRADED+backendUp  
- `trustCachedLocal` as non-degraded ONLINE  

**Rule:** MARKET LIVE may stay green from ticks (honest local feed). RECONNECT / desk ONLINE green must mean **API hop usable**, not Last-price-only.

---

## SAFE FIX (design only — do not implement in this pass)

Ordered, minimal, no new health subsystem:

1. **Decouple green from TV Last** — `updateAgentStatus`: `.dc-online` / `● LIVE` only when snapshot `CONNECTED` (or stricter: API hop CONNECTED && market ≠ DISCONNECTED). Keep MARKET header on tick rules.
2. **Cache = DEGRADED, never green ONLINE** — if `pingHealth` returns `degraded: true` / trustedLocal, set `backendUp` path to DEGRADED UI; do not claim LIVE.
3. **Fail closed on ping** — remove or tighten `pingFailStreak < 3` optimism for green class; still allow brief WAITING/UNKNOWN.
4. **Pulse honesty** — heartbeat pulse must use **price timestamp**, not `Date.now()`, so CONNECTED cannot outlive tick freshness by 60s.
5. **Optional later (still reuse hops):** gate ONLINE on chat hop ≠ FAILED after last user chat attempt; do not add a second probe framework.
6. **Do not** raise timeouts; do not marathon levels/snapshot; do not rewrite mentor.

Highest-impact single change: **(1) stop OR-ing `hasFreshTvLast` into `.dc-online`.**

---

## REGRESSION TESTS

Existing (keep green):

- `npm run test:connection` — `test-connection-state.ts`, `test-connection-reliability.ts`
- `scripts/test-desk-ui-status.ts` — **update** expectations that currently require `tvLive → LIVE green` / `DEGRADED+backendUp → LIVE`

Add (unit, no live marathon):

| Test | Expect |
|---|---|
| Fresh tick, `backendUp=false`, state DISCONNECTED | MARKET LIVE OK; **`.dc-online` false**; RECONNECT not LIVE |
| `backendUp=true`, pulse null/stale | DEGRADED; not ONLINE green |
| `pingHealth` degraded/cached local | Not ONLINE; DEGRADED or UNKNOWN |
| API success 90s ago, backendUp true | API hop DEGRADED |
| Tick age 5s | Market hop DEGRADED; `canConfidentlyAnalyse` false |
| Chat hop failed | ONLINE blocked if product ONLINE requires chat ≠ FAILED |
| `scheduleReconnect` ×N | Still single timer (existing) |
| Manual forceReconnect | Clears health cache (existing wiring) |

Live (optional, one probe): local hung TCP + TV Last moving → must show MARKET LIVE + DATA/RECONNECT not green ONLINE.

---

## Trace verdict (layer by layer)

| Hop | Can look “up” while path unusable? |
|---|---|
| Extension UI green | **Yes** — TV OR + KAREN ready OR |
| Local backend health | **Yes** — 120s cache; health ≠ heavy routes |
| Market-data | **Yes** — CONNECTED from pulse/API success without levels |
| Chat endpoint | **Independent** — hop panel; does not clear TV green |
| Response stream | Success recorded early; 90s hang possible while UI already green |

---

## Sources (code / docs)

- `extension/connection-state.js`, `api-config.js`, `content.js`, `background.js`, `desk-ui-components.js`, `panel.css`
- `app/api/health/route.ts`
- `data/research/karen-connectivity-regression-audit.md`
- `data/research/karen-speed-connection-priority-audit.md`
- `data/research/karen-connection-reliability.md`

**No implementation, commit, push, or deploy performed.**
