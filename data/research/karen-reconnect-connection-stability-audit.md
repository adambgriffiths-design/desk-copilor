# KAREN — Reconnect & connection stability audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY. No code changes. No commit / push / deploy. No new health system. No marathon.  
**Extension under review:** **v1.4.131** (`extension/manifest.json`, `content.js`, `background.js`, `api-config.js`, `connection-state.js`).  
**Priors:** `karen-connection-reliability.md`, `karen-connectivity-regression-audit.md`, `karen-speed-connection-priority-audit.md`, `karen-online-status-meaning-audit.md`, `karen-online-status-truth-fix.md`.

---

## Trace (process boundaries)

```
TradingView Last (tv-bridge 50ms → chart-price)
  → content.js (MARKET/DATA/KAREN, ensureBackend, heartbeat PING, chat port)
  → chrome.runtime (keepalive port · PING/RECONNECT · desk-copilot-chat-stream)
  → background.js connectionManager + api-config
  → LOCAL_CANDIDATES (:3020 → :3000 → :3001 → :3010) then Vercel
  → /api/health  (liveness only: { ok, version })
  → market routes (/api/levels · market-snapshot · quote · desk-tracker)
  → /api/chat/stream  (90s AbortController on port)
  → SSE / JSON → panel
```

---

## What is already in good shape (do not re-litigate)

| Area | Status | Evidence |
|---|---|---|
| False green from TV Last OR | **Fixed in 1.4.131** | `updateAgentStatus` / `isDeskOnline` — no `hasFreshTvLast` into `.dc-online` |
| Cached health as CONNECTED | **Fixed** | `healthDegraded` → machine DEGRADED; `isDeskOnline` false |
| Receiving-end vs invalidated | **Fixed 1.4.118** | SW wake 300→2400ms ×4; no permanent Close-tab latch |
| Duplicate Realtime WS / voice reinject | **Guarded** | `shouldOpenNewRealtimeSocket`, `__dc*Rev` early return |
| `scheduleReconnect` storm | **Guarded** | single timer / `reconnectLoopActive`; unit PASS |
| Health probe coalesce | **OK** | `probePromise` in manager; content `pingInFlight` |
| Chat stream port | **One per START** | 90s abort on disconnect |
| Keepalive | **Intentional single** | reconnect-on-disconnect every 1.5s if dead |
| Request timeouts | **Present** | local health 2.5–5s; apiFetch 15s; chat 90s; levels 65s UI |

Unit: prior `npm run test:connection` + desk-ui ONLINE truth tests reported PASS in 1.4.131 fix notes. This pass did not re-run live TV/mic.

---

## Failure / risk matrix (current tree)

| Risk | EXPECTED | ACTUAL (code) | Storm / dup? | User impact |
|---|---|---|---|---|
| **Sticky local base after hang** | Fail over to next local / Vercel when health dies | `HEALTH_TTL_MS=120s` + `trustCachedLocal` + `resolveApiBase` **returns lastGood even after `ping.ok===false`**; chat prefers `cachedBase` **without re-probe** | No timer thrash; **request thrash against dead base** | Chat/levels hang up to **90s** on hung Next; failover delayed |
| **:3020 vs :3000 latch** | Prefer `dev:karen` (:3020), else live Ready port | Probe order lists **:3020 first**; first health-ok wins + `rememberBase` sticks 120s | Parallel batch OK | Wrong/old process on 3020 wins over healthy :3000 until cache clear / RECONNECT |
| **Health ≠ usable desk** | ONLINE only if request path works | Health is version-only; levels/snapshot can still timeout while `backendUp` true | None | DEGRADED/CONNECTED with dead market routes (known) |
| **ensureBackend 120s optimism** | Fresh ping when unsure | Skips ping if `backendUp` + check &lt;120s; **also proceeds on cached localhost** when ping failed but DEGRADED/CONNECTED | Coalesced | Chat starts against known-slow/dead local |
| **`pingFailStreak < 3`** | Fail closed for ensure | Still returns **true** (demotes green only) | None | Brief “up” for request gate while SW/health flaky |
| **Duplicate health polling** | One layer | SW `connectionManager.start` + content heartbeat **60s** + agent loop force RECONNECT when offline + warm every **240s** | Coalesced, not a storm | Extra load on hung Next; not primary bug |
| **Reconnect ×10 / manual** | Cap at FAILED | Auto loop caps 10; **manual `forceReconnect` resets `retryCount`** | No schedule storm | Manual spam never hits FAILED |
| **Chat success early** | Success after usable SSE | `recordRequestSuccess` on HTTP **headers OK** | None | API hop stays “fresh” while body may hang |
| **False ONLINE UI** | Desk green = request path | **Mitigated 1.4.131** | — | MARKET LIVE can still disagree with DATA (by design) |
| **Never-timeout** | All fetches bounded | Bounded in code | — | Not a current bug; hung **server** still burns the full timeout budget |

---

## Deep dive: sticky localhost routing (the live break)

### Mechanism

1. **`api-config.js` `HEALTH_TTL_MS = 120_000`**  
   After one successful local `/api/health`, `trustCachedLocal` / in-memory `cachedBase` + `apiBaseLastGood` keep that base “trusted.”

2. **`pingHealth` on timeout / fail**  
   Can still return `{ ok: true, degraded: true, base: trustedLocal }` — UI correctly becomes **DEGRADED** (post-1.4.131), but **`backendUp` stays true** and the base stays remembered.

3. **`resolveApiBase` fail-open** (critical):

```303:327:extension/api-config.js
async function resolveApiBase(opts = {}) {
  // ...
  const ping = await pingHealth({ quick: true, warm: opts.warm !== false });
  if (!ping.ok) {
    if (trustedLocal) return trustedLocal;
    const lastGood = await getStoredLastGoodLocal();
    if (lastGood) {
      cachedBase = lastGood;
      return lastGood;
    }
    throw new Error(ping.error);
  }
  return ping.base;
}
```

Even when health is **not** ok, traffic resolution **returns the dead local URL** instead of throwing / falling through to Vercel.

4. **Chat stream base selection** (`background.js`):

```210:215:extension/background.js
      const base =
        requested && isAllowedBase(requested)
          ? requested
          : cachedBase && isAllowedBase(cachedBase)
            ? cachedBase
            : await resolveApiBase();
```

If `cachedBase` is a hung `:3000`/`:3020`, the stream **never re-probes** — it POSTs there until the **90s** port abort.

5. **Content reinforces stickiness** — `ensureBackend` may return true for 120s on cached localhost after a failed ping; chat then passes `apiBase: connectionSnapshot.apiBaseUrl` into the stream port, locking the hung base further.

### Observed across prior audits (still applicable)

- Local Next **TCP listen + `/api/health` timeout** (hung compile / stuck event loop) — connectivity regression + speed audits.
- Health **200** while `/api/levels` **>25s timeout** and snapshot **no last price** — reliability audit.
- `:3000` vs `:3010` / `:3020` confusion — chart-read noreply / options prefer `dev:karen` on **3020** while many sessions run plain `next dev` on **3000**.

UI can now say **◐ DEGRADED** (truth fix) while the **request path still burns 15–90s against the same dead local**. That is reconnect/stability failure, not a badge bug.

### Why not “duplicate sockets” or “reconnect storm”?

Guards from 1.4.118–1.4.131 prevent timer storms and dual Realtime sockets. The failure mode is **serial stickiness**: one base, many long timeouts, delayed failover — feels like a reconnect loop to the trader, but is **base-cache loyalty**, not dual WS.

---

## Port routing note (:3020 vs :3000)

| Intent | Code |
|---|---|
| Preferred local | `npm run dev:karen` → **port 3020** (first in `LOCAL_CANDIDATES`) |
| Also probed | 3000, 3001, 3010 (localhost + 127.0.0.1) |
| Stick | First health-ok + `rememberBase` + 120s TTL + storage `apiBaseLastGood` |

Risk: anything answering `{ ok: true }` on **3020** (stale process, wrong app, briefly healthy then hung) wins over a Ready **3000**. Parallel probe within a batch is fine; **cross-session latch** is the hazard. Manual RECONNECT clears cache (`clearApiCache` via `forceReconnect`); heartbeat PING does **not**.

---

## Health polling duplication (secondary)

| Source | Interval / trigger |
|---|---|
| SW `connectionManager.start()` | Boot + reconnect backoff |
| Content `startHeartbeat` | PING every **60s** (hidden skip) |
| Content `refreshConnectionState` | every **20s** (snapshot only) |
| Agent loop | `pingBackend(true)` when offline &gt;45s |
| Warm keepalive | `/api/warm` every **240s** when panel open |
| Keepalive port | postMessage every **20s** (no HTTP) |

Not a reconnect storm (`pingInFlight` / `probePromise`). Still multiplies load on a **hung** Next and re-arms “last check” optimism without proving chat/levels.

---

## Single biggest connection reliability risk

### **Sticky cached localhost base (`HEALTH_TTL` + `resolveApiBase` fail-open + chat `cachedBase` short-circuit) routes market + chat to a hung or wrong local port for up to ~90s instead of failing over.**

**Why this one (vs false ONLINE, duplicate WS, port order alone):**

1. False ONLINE UI was **already fixed** in 1.4.131 — green badge is no longer the top reliability break.
2. Duplicate sockets / scheduleReconnect storms are **unit-guarded**.
3. Port order (:3020 first) is a **contributor** that feeds the same sticky cache; the killer is **not clearing / not failing over** once stuck.
4. End-to-end symptom matches every recent audit: health flaky or DEGRADED, **chat/levels still aimed at dead local**, long waits, manual RECONNECT as the only reliable cache break.

**Minimal future fix direction (not implemented here):** On health hard-fail or degraded timeout, **clear `cachedBase` / do not return `lastGood` from `resolveApiBase`**; chat stream must not short-circuit on `cachedBase` without a live probe or explicit non-degraded base; optionally prefer fail-over to Vercel when local is degraded. Do **not** raise timeouts; do **not** add a second health subsystem.

---

## Ranked remaining risks (after the top one)

2. Health 200 / `backendUp` without usable levels/snapshot/chat (product truth gap).  
3. `:3020`-first latch onto wrong process when both ports exist.  
4. `ensureBackend` + `pingFailStreak < 3` request-path optimism.  
5. Chat `recordRequestSuccess` on headers before SSE proves useful.  
6. Manual RECONNECT never exhausting to FAILED (retry reset).  
7. Live TV + mic E2E still unverified in runners.

---

## Stop criteria

Report written. **No code changes. No commit / push / deploy. No new health system. No marathon.**
