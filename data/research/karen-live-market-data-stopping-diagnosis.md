# KAREN — LIVE MARKET DATA STOPPING DIAGNOSIS

**Date:** 2026-08-15 (Saturday)  
**Mode:** INVESTIGATE ONLY — no product/primary code changes, no commit/push/deploy  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`  
**Probes:** isolated `.tmp/probe-live-market-freshness.ts` (removed after); prod HTTP; code path read; Karen terminal/port check  
**Browser UI:** not available for console/network capture this run (automation blocked; report does not invent browser console results)

---

## LIVE DATA STATUS

| Layer | Status | Evidence |
|-------|--------|----------|
| **SOURCE** | **STALE** (market closed — not producing new ticks) | Yahoo last 1m bar `2026-08-14T20:59:00.000Z` (~9.6h old); Tickstream quote `ts=2026-08-14T21:39:38.000Z` (~8.9h lag). Prices frozen across T+0…T+30s. |
| **SERVER** | **STOPPED** locally / **LIVE** on Vercel | `npm run dev:karen` terminal still marked running, but **nothing listens on :3020**. Prod `https://desk-copilor.vercel.app` health 200, quote 200. |
| **API** | **STALE** responses, still serving | Prod `GET /api/quote?symbol=MNQ` → `yahoo_bar_close` @ 30141.75, `timestamp=2026-08-14T20:59:59.000Z`. Tickstream path rejects (>60s age). Not a one-shot stop. |
| **CLIENT** | **LIVE** polling lifecycle / **STALE** freshness | Extension keeps timers (TV 250ms tick poll, context strip 2.5s, heartbeat 60s). Tick-mode UI does **not** apply backend quote to the Last box. LIVE badge needs age ≤2s. |
| **UI** | **STALE** (expected on weekend once age gates fire) | First paint can show a last print; without new TV ticks, age grows → STALE (>2s) → market hop DISCONNECTED (>60s). |

---

## LIVE DATA STATUS: (summary block)

```
LIVE DATA STATUS:
SOURCE:   STALE (CME Globex weekend halt — upstream answers, no new ticks)
SERVER:   STOPPED (local :3020) / LIVE (Vercel serverless request path)
API:      STALE (continues to respond; freshness fails age gates)
CLIENT:   LIVE (timers keep firing) / freshness STALE
UI:       STALE after age thresholds (not a one-request render freeze)
```

---

## EXACT POINT WHERE DATA STOPS

**Primary stop = SOURCE freshness**, not a client/API poll that exits after the first success.

```
Tickstream / Yahoo / TV last print
        │  ← NEW TICKS STOP HERE (Fri Globex halt; weekend)
        │     providers still return last Friday print
        ▼
Server resolveTickstreamAuthoritativePrice
        │  ← REJECTS tickstream when ageMs > LIVE_PRICE_MAX_AGE_MS (60s)
        ▼
GET /api/quote → yahoo_bar_close (Friday meta time)
        │
        ▼
Extension tick mode (TV DOM / DC_PRICE_TICK owns Last)
        │  ← Backend quote intentionally NOT applied to UI in tick mode
        │  ← Without new TV ticks, quote ageMs climbs
        ▼
UI LIVE (≤2s) → STALE (≤60s) → DISCONNECTED (>60s)
```

**Secondary local stop (API hop):** Karen Next on `:3020` is **not accepting connections** while the extension prefers localhost first (`api-config.js`). Prod Vercel still serves. This can make desk API calls fail after an earlier successful session even though the refresh *mechanism* did not intentionally stop.

**Not the stop point (this weekend probe):** Redis decision memory, six-feature patch, decision history, `liquidity_swept`, LLM latency, Vercel function “cold end after one request” for `/api/quote` (prod answered repeatedly).

---

## LAST FRESH TIMESTAMP

| Feed | Last observation (UTC) | Age at probe (~2026-08-15T06:35Z) |
|------|------------------------|----------------------------------|
| Yahoo 1m last bar | **2026-08-14T20:59:00.000Z** | ~**34560s** (~9.6h) |
| Yahoo `regularMarketTime` | **2026-08-14T20:59:59.000Z** | ~**34501s** |
| Tickstream REST `/quote` | **2026-08-14T21:39:38.000Z** | ~**32122s** (~8.9h) |
| Prod `/api/quote` timestamp | **2026-08-14T20:59:59.000Z** | same Yahoo Friday print |
| Within `LIVE_PRICE_MAX_AGE_MS` (60s)? | **No** for Tickstream and Yahoo bar times | |

Honest label: **CME Globex closed** (typical Fri ~17:00 ET → Sun ~18:00 ET). This is **“market closed / no new ticks”**, not “pipeline stopped polling while the market would have updates.”

---

## EXPECTED REFRESH INTERVAL

| Path | Expected |
|------|----------|
| Extension TV tick poll (`chart-price.js`) | **250ms** (tick mode) / **1000ms** (minute mode) |
| MAIN-world TV bridge (`tv-bridge.js` `__dcPriceTickTimer`) | continuous `setInterval` while page alive |
| Context strip price (`content.js`) | **2500ms** (skipped if tab hidden or panel collapsed) |
| Backend quote fallback cooldown | **20s** |
| Yahoo multi-TF cache (`fetchAllTimeframesCached`) | **45s** TTL (bars); live print overlaid separately |
| Tickstream REST age gate | must be ≤ **60s** to count as live |
| UI LIVE badge (tick mode) | age ≤ **2s** |
| UI STALE / market hop DEGRADED | age ≤ **60s** |
| Observation `stale_bar` | last bar age > **120s** (`STALE_BAR_SEC`) |
| Health / API hop “fresh” | last success ≤ **60s** |
| Heartbeat ping | **60s** |
| Warm keepalive | **240s** |

Runtime: **Chrome extension + Next.js API** (local node preferred, else **Vercel serverless**). Live price is **not** a long-lived server SSE/WebSocket to the UI; Tickstream WS is server-side fallback only and **disabled on Vercel** (`VERCEL=1` → no WS in `stream-snapshot.ts`).

---

## ACTUAL REFRESH INTERVAL (measured)

### Upstream timeline (isolated probe)

| Wall | Yahoo price | Yahoo last-bar age | Tickstream price | Tickstream lag | Within 60s live gate? |
|------|-------------|--------------------|------------------|----------------|------------------------|
| T+0s | 30141.75 | 34560s | 30154.75 | 32122s | **false** |
| T+5s | 30141.75 | 34565s | 30154.75 | 32127s | **false** |
| T+10s | 30141.75 | 34570s | 30154.75 | 32132s | **false** |
| T+20s | 30141.75 | 34580s | 30154.75 | 32142s | **false** |
| T+30s | 30141.75 | 34590s | 30154.75 | 32152s | **false** |

Upstream **kept answering** every sample; **prints did not advance**. That is closed-market behavior.

### Server / API

| Target | Result |
|--------|--------|
| `http://127.0.0.1:3020/api/health` | **connection refused** (not listening) |
| `https://desk-copilor.vercel.app/api/health` | **200** `{"ok":true,"version":"1.4.64"}` |
| `https://desk-copilor.vercel.app/api/quote?symbol=MNQ` | **200** `source=yahoo_bar_close` Friday stamp |

API refresh: **on demand per client request** — continues. Content is **stale Friday last print**, not a live stream.

### Client

Code shows timers continue; tick-mode path does not stop after one request. UI update skips when `document.hidden` or panel collapsed. Browser console/network for the Karen panel **not captured** this run.

---

## Checklist answers

1. **Upstream still producing fresh data?** **No** — Friday last prints only; prices unchanged over 30s.
2. **Newest market-data observation timestamp?** Yahoo bar **2026-08-14T20:59:00Z**; Tickstream **2026-08-14T21:39:38Z**.
3. **Server continue receiving/fetching after first success?** **Yes** on Vercel/Yahoo/Tickstream REST. **Local :3020 dead** — cannot fetch.
4. **Polling / SSE / WebSocket / other?** Extension **browser polling** (250ms / 2.5s / 60s). API is **request/response**. Tickstream WS only as short server-side fallback locally; **off on Vercel**.
5. **Mechanism stop after one request / timeout / exception / serverless end / tab inactivity / connection loss / market-data timeout?** **No intentional one-shot stop.** Observed freeze = **no new upstream ticks** + **age gates**. Amplifiers: tab hidden / panel collapsed skip UI refresh; local connection loss to :3020; Tickstream quotes aged out (>60s) rejected.
6. **Browser console & network?** **UNKNOWN** (not available this run).
7. **API response stale while client still requests?** **Yes** (prod quote returns Friday Yahoo; client can keep calling).
8. **Client stops requesting?** **No evidence in code** of a one-and-done poll stop; freshness classification flips to STALE/DISCONNECTED.
9. **Cached response returned?** Yahoo bars **45s** in-process cache (server). Extension health can trust localhost up to **120s**. Weekend “staleness” is **upstream last print age**, not just cache.
10. **Recent changes:** `lib/market-data.ts` / quote / tickstream / extension price path last touched in releases through **v1.4.73** (ticker live / TV export recovery) and earlier connection/stale fixes (**v1.4.62**). Timeout hardening present (`YAHOO_FETCH_TIMEOUT_MS=15s`, `TICKSTREAM_QUOTE_TIMEOUT_MS=8s`). None of those invent weekend ticks.
11. **Timeline T+0… until stop:** Upstream print already stale at T+0; UI “live then stale” occurs within **~2s** of last TV restamp (tick LIVE gate), then **~60s** to market hop disconnect — **not** a multi-minute poll death.

---

## Path map (end-to-end)

```
SOURCE
  TradingView chart Last (MAIN world tv-bridge → DC_PRICE_TICK)
  Tickstream REST GET /quote (+ optional short WS when not on Vercel)
  Yahoo Finance chart API (MNQ=F bars + regularMarketPrice)
        │
SERVER
  lib/tickstream/stream-snapshot.ts → resolveTickstreamAuthoritativePrice
  lib/market-data.ts → fetchYahooLastPrice / fetchAllTimeframesCached (45s)
  IncrementalMarketEngine overlays last print onto cached bars
        │
API
  GET /api/quote  (Tickstream → Yahoo fallback)
  POST /api/market-snapshot, /api/market-intelligence, chat/stream, /api/levels
  (Vercel serverless OR local Next :3020)
        │
CLIENT
  extension/chart-price.js  (250ms poll + tick apply)
  extension/content.js      (context strip, heartbeat, pulse)
  extension/background.js   QUOTE → apiFetch /api/quote
  extension/api-config.js   localhost:3020 first, else Vercel
        │
UI
  Desk bar price + LIVE/STALE/UNAVAILABLE badges (≤2s / ≤60s gates)
```

---

## ROOT CAUSE

**Primary (this Saturday probe):** Live updates “stop” because **CME is closed** — Yahoo and Tickstream keep returning the **same Friday last print**. The pipeline does **not** invent new ticks. Age gates then correctly demote LIVE → STALE → DISCONNECTED.

**Exact freshness cliff:** `LIVE_PRICE_MAX_AGE_MS = 60_000` rejects Tickstream for `/api/quote` live path; tick-mode UI LIVE requires **≤2s** TV age and **does not paint** backend quote onto the Last box.

**Contributing local factor:** **Karen on :3020 is not listening** while the extension prefers localhost. That breaks the **API hop** independently of upstream. Prod Vercel still answers with stale Yahoo.

**Distinction:** This is **market closed / no new ticks**, not “polling stopped while the market would have updates.” Re-verify during Globex hours to catch any open-session-only stop.

---

## SMALLEST FIX: (describe only — do not implement)

1. **Session-closed honesty (smallest product UX):** When Tickstream/Yahoo last-print age exceeds session/live thresholds (or Globex is closed), show **MARKET CLOSED / last print @ {iso} ({age})** instead of briefly LIVE then STALE. Do not treat weekend last-print as a live stream failure.
2. **Local API hop:** Restart `npm run dev:karen` on :3020 **or** clear `apiBaseLastGood` / avoid trusting a dead localhost cache so the extension falls through to Vercel when local refuse-connects (hard fail already falls through; timeout+trustedLocal path is the sticky case).
3. **Open-session follow-up only (if symptom persists Mon–Fri):** Confirm TV `DC_PRICE_TICK` keeps firing; if TV bridge dies while Tickstream lag ≤60s, allow tick-mode UI to apply `/api/quote` (today it returns early without `noteLivePrice`).

---

## Per-layer status (final)

| Layer | Status |
|-------|--------|
| SOURCE | **STALE** (weekend / no new ticks) |
| SERVER | **STOPPED** (local :3020) · **LIVE** (Vercel) |
| API | **STALE** (serving Friday print) |
| CLIENT | **LIVE** (timers) / freshness **STALE** |
| UI | **STALE** |

**EXACT POINT WHERE DATA STOPS:** Upstream tick production (CME closed) → then age gates; local :3020 down as API amplifier.  
**LAST FRESH TIMESTAMP:** `2026-08-14T21:39:38.000Z` (Tickstream); Yahoo bar `2026-08-14T20:59:00.000Z`.  
**EXPECTED REFRESH INTERVAL:** TV poll 250ms; strip 2.5s; Yahoo cache 45s; live age ≤60s.  
**ACTUAL REFRESH INTERVAL:** Providers/API keep answering; **print timestamps do not advance**; UI live window collapses in **~2s** without new TV restamps.  
**ROOT CAUSE:** Weekend Globex halt + live age gates (+ dead local :3020 for API).  
**SMALLEST FIX:** Closed-session labeling / clear dead localhost preference; optional tick-mode backend quote paint only if open-session TV bridge fails.

STOP.
