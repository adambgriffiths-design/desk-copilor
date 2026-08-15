# Karen — online status truth fix

**Date:** 2026-08-14  
**Extension:** `1.4.131`  
**Mode:** Safe fix only (no new health system, no commit/push/deploy, no market/DecisionEnvelope changes)

---

## ONLINE RULE BEFORE / AFTER

### BEFORE
- RECONNECT `.dc-online` / `● LIVE` when `connState === "CONNECTED"` **OR** `hasFreshTvLast()` (tick ≤2s).
- KAREN idle **LIVE** when `CONNECTED` **OR** (`DEGRADED` + `backendUp`) **OR** `tvLive`.
- Header **DATA** forced **LIVE** when `tvLive`.
- Cached `pingHealth` `{ ok:true, degraded:true }` still set `backendUp` + refreshed `lastSuccessfulRequest` → could become machine `CONNECTED` with a fresh pulse.
- Heartbeat pulse could re-stamp with `Date.now()` while price &lt;30s old, extending CONNECTED beyond real tick time.
- Casual `/api/warm` and `/api/session` success called `recordRequestSuccess` (kept API hop “fresh”).

### AFTER
- **DESK ONLINE** = `isDeskOnline(...)`:
  - API hop `CONNECTED` (fresh health-proof or tracked request ≤60s)
  - market hop **≠** `DISCONNECTED`
  - `healthDegraded !== true`
  - chat hop ≠ `FAILED` (when known)
- RECONNECT `.dc-online` / `● LIVE` / KAREN idle LIVE use **desk ONLINE only** — **no TV Last OR**.
- Cached/degraded health → snapshot `healthDegraded` + machine **DEGRADED** (never CONNECTED / never green ONLINE).
- Early ping failures demote CONNECTED → DEGRADED for green UI (still brief ensureBackend optimism).
- Heartbeat pulse uses **price timestamp** (`contextStripPriceTs`), not `Date.now()`.
- `/api/warm` and `/api/session` use `trackSuccess: false` — do not mint desk ONLINE. Chat/levels/snapshot/verdict still `recordRequestSuccess`.

---

## MARKET LIVE RULE

Unchanged and separate from desk ONLINE:

- Header / market bar **MARKET LIVE** from tick age ≤2s (`hasFreshTvLast` / TV Last).
- **STALE** for older ticks within the stale window; unavailable when no price.
- TV Last may show MARKET LIVE while RECONNECT stays OFFLINE/DEGRADED.

---

## PRODUCT STATE DEFINITIONS

| State | Meaning |
|---|---|
| **MARKET LIVE** | Market feed / price freshness (ticks) |
| **DESK ONLINE** | Request path confirmed usable (`isDeskOnline`) |
| **DESK DEGRADED** | Stale/cached/partial backend or market state |
| **DESK DISCONNECTED** | Request path unavailable |
| **DESK UNKNOWN** | Health not established (`CONNECTING` / `RECONNECTING` / first paint) |

---

## FALSE-ONLINE CASES ELIMINATED

1. TV Last alone painting `.dc-online` / `● LIVE` / KAREN LIVE while backend dead.
2. Cached/trusted-local health (`degraded: true`) claiming green ONLINE / CONNECTED.
3. DEGRADED + `backendUp` painting KAREN LIVE.
4. DATA header forced LIVE solely from TV Last.
5. Heartbeat `Date.now()` pulse extending CONNECTED past real tick freshness.
6. Casual warm/session success permanently refreshing API hop for desk ONLINE.
7. Early ping-fail streak keeping green CONNECTED (now demotes to DEGRADED).

**Preserved:** manual RECONNECT / `forceReconnect` (clears API cache), single `scheduleReconnect` timer, chat/trading `recordRequestSuccess`, MARKET LIVE from ticks.

**No duplicate health/reconnect loops added** — still one manager `start()`, one keepalive port reconnect-on-disconnect, `scheduleReconnect` gated by existing timer flag.

---

## TESTS

| ID | Expect | Result |
|---|---|---|
| A | Fresh tick + backend down → MARKET LIVE OK; desk ONLINE false | PASS |
| B | backendUp + stale pulse/API → DEGRADED; not ONLINE | PASS |
| C | `healthDegraded` / cached health → DEGRADED; not ONLINE | PASS |
| D | API success 90s ago → API hop DEGRADED | PASS |
| E | Tick age 5s → market DEGRADED; `canConfidentlyAnalyse` false | PASS |
| F | Chat hop failed → desk ONLINE blocked | PASS |
| G | `scheduleReconnect` ×N single timer; `forceReconnect` clears cache; degraded → DEGRADED | PASS |

Commands:
- `npm run test:connection` (state + reliability) — PASS
- `npx tsx scripts/test-desk-ui-status.ts` — PASS

---

## FILES CHANGED

- `extension/connection-state.js` — `isDeskOnline`, `healthDegraded` in manager/snapshot/`evaluateConnectionState`
- `lib/connection-state.ts` — mirrored helpers/types
- `extension/content.js` — desk ONLINE UI, pulse honesty, ping demotion; version `1.4.131`
- `extension/desk-ui-components.js` — `isKarenReadyOnline` no longer ORs tvLive / DEGRADED+backendUp
- `extension/background.js` — `trackSuccess: false` for warm/session
- `extension/manifest.json` — `1.4.131`
- `scripts/test-desk-ui-status.ts` — updated expectations + A–F
- `scripts/test-connection-state.ts` — healthDegraded + G
- `scripts/test-connection-reliability.ts` — `isDeskOnline` coverage
- `data/research/karen-online-status-truth-fix.md` — this report

**Not changed:** DecisionEnvelope, trading/market-data semantics, new health subsystem, timeouts, commit/push/deploy.
