# Karen connectivity regression audit — 2026-08-14

**Mode:** read-only audit. No reconnect implementation, no extension edits, no commit/push/deploy, no new `next-dev`, no Chrome/Cursor kill, no OpenAI/esbuild storms.  
**Extension path under test:** **v1.4.128** (`extension/manifest.json` + `content.js` `DC_VERSION`).  
**Submodule rev guards (lag):** voice / realtime / tracker / chart-price **1.4.118**; tv-bridge **1.4.112**.  
**Prior baseline:** `data/research/karen-connection-reliability.md` (v1.4.118 era).  
**Unit tests this run:** `npm run test:connection` → **PASS** (`test-connection-state` + `test-connection-reliability`).

---

## Live backend status (this runner)

| Target | Result |
|---|---|
| `http://127.0.0.1:3000/api/health` | **Intermittent** — one early 200 `{"ok":true,"version":"1.4.84"}`; later probes **timeout** (2–5s) while Node PID had been listening |
| `http://localhost:3000/api/health` | **Timeout** (IPv6/`localhost` worse than `127.0.0.1`) |
| TCP `:3000` | Listener observed (Node PID 9292), then later `Test-NetConnection` **False** — unstable |
| `https://desk-copilor.vercel.app/api/health` | **200** `{"ok":true,"version":"1.4.64"}` |

**Verdict for live HTTP:** local Karen treated as **OFFLINE / hung** for this audit. Heavy local routes (`/api/levels`, market-snapshot, chat) **skipped**. Prod health used only as a light reference that a healthy app returns JSON `ok:true`, not mere TCP accept.

Code-path audit below still applies to the 1.4.128 live path the extension ships.

---

## Version / probe path verified

| Artifact | Value |
|---|---|
| `extension/manifest.json` `version` | `1.4.128` |
| `content.js` `DC_VERSION` | `1.4.128` |
| Boot guard | `dc-boot-1.4.128` — same-rev reinject returns early |
| `api-config.js` probes | `/api/health` via `probeBase`; requires `res.ok` **and** `data.ok === true` |
| Local candidates | `:3020`, `:3000`, `:3001`, `:3010` (localhost + 127.0.0.1), then Vercel |
| Background PING / RECONNECT | `connectionManager.probeBackend` / `forceReconnect` → `pingHealth` |
| Package / health version when local briefly answered | `1.4.84` (behind extension UI version) |

---

## Does GREEN ONLINE mean application health?

**No — not strictly.**

| Layer | What “green / LIVE” means |
|---|---|
| CSS `.dc-online` (green accent) | `connState === "CONNECTED"` **OR** `hasFreshTvLast()` (TV tick ≤2s) — see `updateAgentStatus` in `content.js` |
| Button text `● LIVE` | Same OR — TV Last alone can paint LIVE while DATA is DEGRADED |
| Snapshot `CONNECTED` | `backendUp` **and** market pulse fresh ≤60s (`evaluateConnectionState`) — **not** health alone |
| `backendUp` / PING `ok` | Set when `pingHealth` returns `ok:true` **or** `recordRequestSuccess` on any API |
| `pingHealth` false positive | `trustCachedLocal` / `HEALTH_TTL_MS` (120s) can return `{ ok: true, degraded: true }` **without** a fresh `/api/health` body |

**Strict claim “GREEN = `/api/health` ok” → FAIL.**  
**Partial claim “probe path requires health JSON `ok:true` when not using cache” → PASS in `probeBase`.**  
**TCP listener alone never sets CONNECTED** — hung Next without JSON fails `probeBase`, unless the 120s local cache lies.

Market LIVE badge (header MARKET ≤2s ticks) is **independent** of API hop / RECONNECT green.

---

## Scenario results

Failure rows use: **EXPECTED | ACTUAL | RECOVERY TIME | DUPLICATES | LAST VALID DATA**

### 1. Healthy

| | |
|---|---|
| **Code** | **PASS** — `probeBase` needs HTTP OK + `ok:true`; manager → CONNECTED only with fresh pulse |
| **Live local** | **FAIL / OFFLINE** — hung after brief success |
| **Live prod health** | **PASS** (reference only) |

When local hung:  
**EXPECTED:** DISCONNECTED / RECONNECTING after failed health · **ACTUAL:** TCP may still listen, HTTP timeout · **RECOVERY:** N/A (not restarted) · **DUPLICATES:** none observed · **LAST VALID DATA:** brief `1.4.84` health at audit start, then none

### 2. Backend restart

| | |
|---|---|
| **Code** | **PASS** |
| **Live** | **SKIPPED** (no restart induced) |

**EXPECTED:** RECONNECTING → probe → CONNECTED/DEGRADED · **ACTUAL (code):** `forceReconnect` clears cache (`clearApiCache`), resets `retryCount`, single `probePromise` · **RECOVERY:** backoff 1s×2^(n−1) cap 60s, max 10 · **DUPLICATES:** `scheduleReconnect` ignored if timer/loop active · **LAST VALID DATA:** `lastSuccessfulRequest` / pulse retained until overwritten

### 3. Network interruption

| | |
|---|---|
| **Code** | **PASS** |
| **Live** | **SKIPPED** |

**EXPECTED:** request fail → lastError; after streak, DISCONNECTED + scheduleReconnect · **ACTUAL:** `apiFetchTracked` → `recordRequestFailure`; content `pingFailStreak < 3` can **keep treating backend as up** briefly · **RECOVERY:** heartbeat 60s + reconnect loop · **DUPLICATES:** `pingInFlight` coalesces · **LAST VALID DATA:** prior snapshot until overwritten

### 4. Stale market feed

| | |
|---|---|
| **Code** | **PASS** (unit) |
| **Live TV** | **UNVERIFIED** |

**EXPECTED:** backend up + pulse >60s → DEGRADED; ticks >2s → MARKET DEGRADED · **ACTUAL (unit):** confirmed in `test-connection*` · **RECOVERY:** click RECONNECT / new pulse · **DUPLICATES:** none · **LAST VALID DATA:** `lastSuccessfulMarketUpdate` / tick age in hop panel

### 5. Socket open but application unavailable

| | |
|---|---|
| **Code** | **PASS with caveat** |
| **Live** | **OBSERVED** on local `:3000` |

**EXPECTED:** not CONNECTED / not fake green from TCP · **ACTUAL:** listener existed, `/api/health` timed out; `probeBase` fails; **but** 120s `trustedLocal` can still return `ok:true` degraded · **RECOVERY:** depends on cache TTL / clear on RECONNECT · **DUPLICATES:** none · **LAST VALID DATA:** cached `apiBaseLastGood` may outlive real app

### 6. Chat unavailable

| | |
|---|---|
| **Code** | **PASS (independent hop)** |
| **Live** | **SKIPPED** |

**EXPECTED:** CHAT STREAM FAILED/BUSY without flipping MARKET CONNECTED · **ACTUAL:** hop `evaluateChatStreamHealth`; stream port 90s abort; content `chatBusy` / `lastChatStreamError` · **RECOVERY:** user retry / RECONNECT messaging · **DUPLICATES:** one `desk-copilot-chat-stream` port per start · **LAST VALID DATA:** prior chat bubbles / last error string

### 7. Market data unavailable

| | |
|---|---|
| **Code** | **PASS** |
| **Live** | **SKIPPED** (local hung; no levels/snapshot marathon) |

**EXPECTED:** DEGRADED or LIVE_DATA_UNAVAILABLE_VERDICT; `canConfidentlyAnalyse` false unless market hop CONNECTED · **ACTUAL (code/unit):** matches · **RECOVERY:** RECONNECT + fresh TV/pulse · **DUPLICATES:** none · **LAST VALID DATA:** last tick / last pulse age

### 8. Service worker restart / sleep

| | |
|---|---|
| **Code** | **PASS** (unit) |
| **Live** | **UNVERIFIED** |

**EXPECTED:** receiving-end → wake retries, no tab reload · **ACTUAL (unit):** 300→600→1200→2400ms ×4; invalidated separate with 60s version latch · **RECOVERY:** ≤ ~4.5s wake budget · **DUPLICATES:** keepalive single port, reconnect on disconnect · **LAST VALID DATA:** content snapshot until SW replies

### 9. Reconnect (manual)

| | |
|---|---|
| **Code** | **PASS** |
| **Live UI** | **UNVERIFIED** (no TV tab in runner) |

**EXPECTED:** RECONNECT → `forceReconnect` → status line · **ACTUAL:** `#dc-reconnect` → `pingBackend(true)` → `bgSend({type:"RECONNECT"})` · **RECOVERY:** probe timeout budget ~12–18s UI · **DUPLICATES:** `pingInFlight` wait · **LAST VALID DATA:** statusLine / diagnostics from snap

### 10. Reconnect repeated ×10

| | |
|---|---|
| **Unit / sim** | **PASS (no storm)** |
| **Timed full backoff to FAILED** | **NOT RUN** (intentionally — no thrash) |

Simulation (`createConnectionManager`, 10× `forceReconnect` failing): **10 pings**, no duplicate schedule storm; `scheduleReconnect`×12 → **0 immediate pings** (single timer).  
Note: each **manual** `forceReconnect` **resets `retryCount`**, so 10 UI clicks never reach FAILED via max-retries; automatic loop caps at `MAX_RECONNECT_RETRIES` (10).

**EXPECTED:** ≤1 in-flight probe / timer · **ACTUAL:** matched · **RECOVERY:** N/A · **DUPLICATES:** none · **LAST VALID DATA:** lastError `"down"` in sim

---

## Duplicate findings

| Area | Status | Notes |
|---|---|---|
| Background `connectionManager` | **OK** | Single instance at SW load |
| Health probe coalescing | **OK** | `probePromise` |
| Reconnect timer | **OK** | `reconnectLoopActive` / `reconnectTimer` |
| Realtime WebSocket | **OK** | `connectInFlight`, `shouldOpenNewRealtimeSocket`, cleanup before new WS |
| Voice / tracker / price reinject | **OK** | `__dc*Rev` early return |
| tv-bridge tick timer | **OK** | clears `__dcPriceTickTimer` before new interval |
| Content boot | **OK** | `dc-boot-${DC_VERSION}` |
| Chat stream port | **OK** | one port per START; abort on disconnect |
| Keepalive port | **OK** | reconnect-on-disconnect pattern (intentional single) |
| **Rev skew risk** | **WATCH** | UI `1.4.128` vs voice/realtime/tracker `1.4.118` / bridge `1.4.112` — same submodule rev skips re-init after content-only bump |
| **Reinject script list gap** | **WATCH** | `background.js` `ISOLATED_SCRIPTS` omits `conversation-state.js` + `mentor-intent.js` present in manifest (not a socket duplicate; incomplete reinject) |
| **False green paths** | **RISK** | TV Live OR CONNECTED; 120s local health cache; `pingFailStreak < 3` optimism |

No evidence of intentional dual API clients beyond shared `api-config.js` in the SW. Content does not fetch localhost directly for desk APIs (by design — SW proxy).

---

## Pass/fail summary

| # | Scenario | Result |
|---|---|---|
| 1 | Healthy | **CODE PASS** / **LIVE LOCAL FAIL (OFFLINE)** / prod health PASS |
| 2 | Backend restart | **CODE PASS** / live SKIPPED |
| 3 | Network interruption | **CODE PASS** / live SKIPPED |
| 4 | Stale market feed | **CODE PASS** / live TV UNVERIFIED |
| 5 | Socket open, app unavailable | **OBSERVED + CODE PASS w/ cache caveat** |
| 6 | Chat unavailable | **CODE PASS** / live SKIPPED |
| 7 | Market data unavailable | **CODE PASS** / live SKIPPED |
| 8 | Service worker restart | **CODE PASS** / live UNVERIFIED |
| 9 | Reconnect | **CODE PASS** / live UI UNVERIFIED |
| 10 | Reconnect ×10 | **UNIT/SIM PASS** (no thrash marathon) |

**GREEN = app health (`/api/health` ok)?** → **FAIL** (green can be TV Last alone; CONNECTED needs pulse; cache can claim ok without fresh health).

**Duplicate sockets/listeners/streams/clients?** → **No hard duplicate bug found** in 1.4.128 path; guards from 1.4.118 still present. Remaining risks: rev skew, reinject script gap, health cache optimism.

---

## Remaining risks

1. Local Next on `:3000` can accept TCP then hang — extension may show cached “ok” for up to 120s.  
2. Green RECONNECT button ≠ application health; MARKET badge and DATA badge can disagree (by design) but green UI OR’s TV Live.  
3. Manual RECONNECT never exhausts to FAILED (retry reset); only automatic loop hits max 10.  
4. Extension **1.4.128** vs local API **1.4.84** vs prod **1.4.64** version skew.  
5. Live TradingView + mic still required to prove ticks, STT/TTS uniqueness after SW nap.  
6. `ISOLATED_SCRIPTS` missing conversation/mentor modules on reinject.  
7. Prior reliability note still stands: health 200 ≠ levels/snapshot/chat healthy — do not marathon those here.

---

## Tests run

```
npm run test:connection
→ test-connection-state: ok
→ test-connection-reliability: ok
```

Plus in-process sim: 10× `forceReconnect` fail + duplicate `scheduleReconnect` (no timer thrash).

---

**No implementation, commit, push, deploy, or process kill performed.**
