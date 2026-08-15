# Karen connection reliability — 2026-08-14

**Mode:** audit + one fix. No commit / push / deploy. No market-reasoning, REH/EQL, or mentor redesign.  
**Extension to reload:** **v1.4.118** (unpacked `extension/` + hard-refresh TradingView).  
**Prod hostname:** `https://desk-copilor.vercel.app` (intentional spelling).  
**Prod `/api/health` version:** `1.4.64` (local package `1.4.84` — prod is behind; this pass did not deploy).  
**Local `npm run dev`:** **DISCONNECTED** (127.0.0.1:3000 and :3001 refused).

Health below is from **actual responses / timestamps / unit recovery**, not “a socket exists.”

---

## Connection chain (process boundaries)

```
TradingView DOM / last-badge
  → MAIN world tv-bridge.js (50ms tick postMessage)
  → isolated chart-price.js (quote + ageMs)
  → content.js (MARKET/DATA badges, market pulse)
  → chrome.runtime.sendMessage / keepalive port
  → background.js service worker
  → api-config pingHealth / apiFetch  (localhost:3000/3001 then Vercel)
  → /api/health · /api/levels · /api/market-snapshot · /api/market-intelligence
  → market-state engine (prod)
  → /api/chat/stream  (port desk-copilot-chat-stream)
  → STT: OpenAI Realtime WS  or  Whisper cascade
  → TTS: Realtime PCM  or  /api/voice/tts  or  speechSynthesis
  → frontend panel (chat bubble + header)
```

States used: `DISCONNECTED | CONNECTING | CONNECTED | DEGRADED | RECONNECTING | FAILED`.  
A live WebSocket / health socket **with no ticks** is **DEGRADED**, not CONNECTED.

Independent user-facing truth (already in header; now also Diagnostics → Connection):

- **MARKET** = TV Last freshness (LIVE ≤2s, STALE ≤60s, else unavailable)
- **DATA** = backend pulse / connection snapshot
- **KAREN** = voice session (LISTENING / DEGRADED only if mic/session actually down)

---

## Per-hop log (this run)

| Hop | STATUS | LATENCY | LAST SUCCESS | LAST FAILURE | ERROR | RECONNECT | RETRY | DATA FRESHNESS |
|---|---|---|---|---|---|---|---|---|
| TradingView → extension | **UNVERIFIED** (no TV tab in this runner) | tick poll 50ms in code | — | — | — | MAIN-world timer replaced, not stacked | — | ticks only if Last badge advances |
| Extension isolated / live price | **UNVERIFIED** live | quote cache 300ms | — | — | receiving-end on SW sleep (fixed path) | SW wake 300–2400ms ×4 | bounded | LIVE if `ageMs≤2000` |
| Backend `/api/health` | **CONNECTED** | 581ms cold, **183ms** warm | 2026-08-14T11:53Z `ok:true` v1.4.64 | local refuse ~2.1s | local: connection refused | pingHealth localhost then Vercel | no storm | health ≠ market ticks |
| `/api/warm` | **CONNECTED** | 223ms | 200 `ok` | — | — | fire-and-forget after Vercel health | — | n/a |
| `/api/session` | **CONNECTED** | 155ms | 200 | — | — | — | — | journal empty |
| `/api/levels` | **FAILED / timeout** | **>25000ms** | none this run | timeout | operation timed out | click RECONNECT | 1 probe | no levels body |
| `/api/market-snapshot` | **DEGRADED** | **14549ms** | 200 with `intent:price` | first probe 400 (missing question — probe error, not outage) | spoken: live market data unavailable; last price unknown | — | — | **no last price** — not a live tick |
| `/api/chat/stream` | **CONNECTED** (casual) | **377ms** full SSE `done` | 200 casual “hi” | first probe 500 on empty `ping` body | empty body ≠ outage | port abort 90s | single port | casual route only |
| Market-state engine | **DEGRADED** | snapshot 14.5s | engine answered “unknown / unavailable” | levels timeout | no TV last on this HTTP probe | — | — | **stale/missing** |
| STT | **UNVERIFIED** live | Realtime WS connect timeout 20s in code | — | — | receiving-end on TRANSCRIBE | 8 Realtime reconnects, then cascade | SW wake ×4 | silence ≠ dead if listening |
| TTS | **UNVERIFIED** live | — | — | — | tracked separately from STT | no second WS if OPEN | — | speaking ≠ STT |
| Frontend | **PASS** code | header + Diagnostics hop panel | unit tests | — | old latch “Close tab…” | version-scoped 60s cooldown | — | MARKET vs KAREN independent |

---

## 1. Market data connection

**Not CONNECTED just because the bridge timer exists.**

- Tick health: `ageMs ≤ 2s` → CONNECTED / MARKET LIVE; `≤60s` → DEGRADED / STALE; older → DISCONNECTED / unavailable.
- Duplicate ticks: incremental engine + STT duplicate drop already exist; not retested live.
- Out-of-order / session / contract: **not exercised** this pass (out of scope vs PDH/liquidity agents).
- Prod snapshot **without a TV last** correctly refused a price quote (“last price: unknown”). That is honest DEGRADED, not a fake live print.
- `/api/levels` timed out — market-state from Vercel is **not** a live feed this run.

**Live TV ticks: not measured here.** Reload v1.4.118 on the chart to confirm MARKET LIVE vs STALE from `ageMs`.

## 2. Backend / API connection

Measured against production (local down):

| Request | Result |
|---|---|
| GET `/api/health` | 200, 581ms then 183ms |
| GET `/api/warm` | 200, 223ms |
| GET `/api/session` | 200, 155ms |
| GET `/api/levels?symbol=MNQ` | **timeout 25s** |
| POST `/api/market-snapshot` `{question, symbol}` | 200, 14.5s, **no live price** |
| POST `/api/chat/stream` casual `hi` | 200 SSE, 377ms |

Three sequential light requests (health → warm → session) succeeded; connection state did not stick on a dead socket. Heavy market routes are slow or empty of ticks.

`api-config.js` already prefers live localhost then Vercel (not a Vercel-only lock in current code). Local was down, so auto-path would use prod.

## 3. Voice connection (independent components)

Do **not** treat “voice connected” as one bit.

| Component | This run |
|---|---|
| Mic / session | UNVERIFIED live |
| STT | UNVERIFIED live; hop `STT: CONNECTED` only if listening |
| TTS | UNVERIFIED live; hop `TTS: FAILED` if last playback failed even when STT is up |
| Intent / Karen | not a transport hop; routing left alone |

Cascade is still a working mic (KAREN LISTENING, not DEGRADED) — `test-desk-ui-status` PASS. Amber KAREN only when auto-voice wants a session and none exists.

## 4. Reconnect behaviour

**Highest-value defect (fixed in 1.4.118):**

`Could not establish connection. Receiving end does not exist.` was lumped with `Extension context invalidated`. Both triggered `recoverFromStaleExtension()`, which:

1. Reloaded TradingView on a **sleeping MV3 service worker** (wrong — `sendMessage` should wake it).
2. Wrote `sessionStorage dc-stale-reload = "1"`, **never cleared on success**, so the next receiving-end showed **“Close tab → reload extension → open fresh chart”** for the rest of the tab session.

That is a false FAILED / stuck desk after a normal Chrome SW nap.

**Now:**

- `receiving_end` → bounded exponential wake (300 / 600 / 1200 / 2400 ms, max 4). **No page reload.**
- `invalidated` → at most one reload per version per 60s, latch is `{version, at}` JSON. Old `"1"` is ignored.
- Successful `bgSend` / PING clears the latch.

Live interrupt of TV / mic / backend was **not** performed in this runner.

## 5. Backoff / retry

| Path | Bound |
|---|---|
| Backend reconnect | 1s × 2^(n-1), cap 60s, max 10 (`createConnectionManager` single timer) |
| SW receiving-end | 300ms × 2^(n-1), cap 2.4s, max 4 |
| Realtime WS | 1.5s × 2^(n-1), cap 30s, max 8, then Whisper cascade |
| Duplicate `scheduleReconnect` | ignored if loop already active |

No retry storm in unit simulation (exactly 4 wake attempts then fail closed).

## 6. Stale connection detection

| Signal | Fresh | Stale |
|---|---|---|
| LAST_VALID_TICK / LAST_PRICE_UPDATE | ≤2s LIVE | ≤60s DEGRADED; >60s disconnected |
| LAST_SUCCESSFUL_REQUEST (API hop) | ≤60s CONNECTED | older or missing → DEGRADED even if `/api/health` once succeeded |
| LAST_STT / LAST_TTS | activity timestamps in Diagnostics | session-off = DISCONNECTED; last TTS error = TTS FAILED without flipping STT |

`canConfidentlyAnalyse` is **true only for market hop CONNECTED** (fresh ticks). Wired in lib + tests. Header MARKET already used 2s ticks. Full chart-read still uses existing WAIT / live-data-unavailable paths — not a mentor rewrite.

## 7. Connection state machine

Unchanged six states on the **backend+pulse** snapshot. **New independent hop machine** for Diagnostics so CONNECTED backend cannot hide a dead tick feed or a dead TTS path.

Impossible “CONNECTED while feed dead” is blocked on the **market hop** (`tickAgeMs=5s` → DEGRADED). Combined snapshot can still say CONNECTED for 60s pulses — that is DATA, not MARKET.

## 8. Multiple connection prevention

Same-rev reinject (executeScript / no page reload) previously re-ran `voice.js` / `voice-realtime.js` / `desk-tracker.js` IIFEs, orphaning the old WebSocket, STT, TTS, and 15s tracker poll.

**Now** rev guards `1.4.118`: same rev returns; new rev stops the previous session first. Realtime `connect()` closes a leftover socket before opening another; OPEN/CONNECTING sockets are not duplicated (`shouldOpenNewRealtimeSocket`).

tv-bridge already cleared `__dcPriceTickTimer` before starting a new 50ms loop.

## 9. Connection health panel (dev)

Diagnostics → **Connection** now prints:

```
MARKET FEED: CONNECTED | DEGRADED | DISCONNECTED | …
LAST TICK: <iso> (<age>)
PRICE: <value>
API: …
LAST API SUCCESS: …
STT: …
TTS: …
CHAT STREAM: READY | BUSY | FAILED
RECONNECT: IDLE | ATTEMPTING
```

plus the existing backend snapshot dump. Not final UI.

## 10. Failure injection

| Case | Expected | This run |
|---|---|---|
| receiving-end (SW sleep) | retry wake, no tab reload | **PASS unit** |
| invalidated context | one reload / version / 60s | **PASS unit** |
| stale ticks, API up | MARKET DEGRADED, API CONNECTED | **PASS unit** |
| TTS fail, STT up | TTS FAILED, STT CONNECTED | **PASS unit** |
| duplicate scheduleReconnect | one timer | **PASS unit** |
| network / TV reload / backend restart live | detect → recover | **NOT RUN** |
| `/api/levels` timeout | user-visible slow/degraded | **OBSERVED** 25s timeout |

## 11. User experience

Header already splits MARKET / DATA / KAREN. After reload of **v1.4.118**:

- TV Last moving, overnight Yahoo lag → **MARKET LIVE**, DATA may be STALE, KAREN independent.
- Mic down, ticks live → **MARKET LIVE**, **KAREN DEGRADED**.
- SW sleep → “Waking desk connection…” then recover, **not** “Close tab”.

## 12. Performance (measured)

| Stage | ms |
|---|---|
| Initial prod health (cold-ish) | **581** |
| Repeat health | **183** |
| Warm | **223** |
| Session | **155** |
| Casual chat SSE done | **377** |
| Market snapshot (no TV last) | **14549** |
| Levels | **>25000 timeout** |
| First tick / first voice | **not measured** (no TV/mic) |

Biggest latency contributor on this run: **`/api/levels` and market-snapshot**, not the health socket. Do not raise timeouts.

## 13. End-to-end

CONNECT → live price → text → follow-up → voice → kill feed → restore: **FAIL / not run** (no TradingView, no mic, local API down).

Partial HTTP: casual chat **PASS**; price snapshot **honest unavailable**; levels **FAIL timeout**.

## 14. Regression tests

`npm run test:connection` (includes new `test:connection-reliability`):

- `scripts/test-connection-state.ts` — **PASS**
- `scripts/test-connection-reliability.ts` — **PASS** (receiving-end vs invalidated, old latch `"1"`, wake backoff cap, no duplicate WS, stale tick DEGRADED, independent STT/TTS, no confident analysis on stale, manager single reconnect loop)
- `scripts/test-desk-ui-status.ts` — **PASS** (KAREN cascade ≠ DEGRADED)

---

## FINAL REPORT

**MARKET CONNECTION:** UNVERIFIED live TV (0% ticks in this runner). Prod snapshot last price **unknown**. Unit stale-tick path **PASS**.

**API CONNECTION:** **~67%** of probed prod routes succeeded with a body (health, warm, session, casual stream; snapshot 200 but no price; levels timeout). Local **0%**.

**VOICE CONNECTION:** **0%** live (STT/TTS not exercised). Unit hop split **PASS**. Cascade-not-DEGRADED **PASS**.

**RECONNECT SUCCESS:** **100%** unit receiving-end recovery (2 failures then success, 0 reloads). **0%** live interrupt.

**STALE DETECTION:** **PASS** (unit). Open socket + 5s-old tick = DEGRADED. API success 90s ago = DEGRADED.

**DUPLICATE CONNECTION PROTECTION:** **PASS** (unit + rev guards). OPEN Realtime socket will not open a second. Same-rev voice/tracker reinject returns.

**RECOVERY:** **PASS** unit / **UNVERIFIED** live TV.

**END-TO-END:** **FAIL** (not run on TradingView + mic).

**AVERAGE INITIAL CONNECTION:** **581ms** prod `/api/health` first probe (183ms repeat).

**AVERAGE RECONNECT:** SW wake schedule **300 → 600 → 1200 → 2400ms** (unit). Live reconnect not timed.

**TOP 5 CONNECTION FAILURES:**

1. Receiving-end (asleep service worker) treated as dead extension + permanent `dc-stale-reload` latch → stuck “Close tab”.
2. Duplicate Realtime WS / STT / TTS / tracker poll after same-rev script reinject.
3. `/api/levels` timeout (>25s) — market-state HTTP hop dead this run.
4. Market snapshot 14.5s with **no last price** (HTTP without TV Last is not a live feed).
5. Local backend down; prod API **v1.4.64** vs local **1.4.84**.

**ROOT CAUSES:**

1. `isExtensionMessagingFailure` merged SW-sleep with context-invalidated; latch `"1"` never cleared.
2. Voice/realtime/tracker IIFEs had no singleton on reinject; Realtime `connect()` could assign a new `WebSocket` without closing a leftover.
3. Vercel levels/snapshot work is heavy; health socket remaining up does not mean market data is flowing.
4. This runner has no TradingView DOM, so tick freshness cannot be claimed from HTTP.

**HIGHEST-VALUE FIX:** Treat **receiving-end as a bounded SW wake**, not a tab reload; drop the permanent stale-reload latch; keep invalidated reloads version-scoped. Plus cheap duplicate-session guards and a hop health diagnostic so MARKET LIVE / API STALE / VOICE DEGRADED can disagree.

**REMAINING RISKS:**

- Live TradingView + mic still required to prove ticks, STT, TTS, and post-reload uniqueness.
- Prod not deployed; extension v1.4.118 talks to API v1.4.64 until someone deploys.
- `/api/levels` timeout remains a real desk bottleneck (not fixed here; do not raise timeouts).
- `isLiveDataAvailable()` in content still treats a 60s backend pulse as live for some chart-read gates; confident **header MARKET** is 2s ticks. Full analysis gating was not redesigned.
- `HEALTH_TTL_MS` 120s localhost cache can delay failover if local dies mid-session.

**Do not treat the desk as reliable because `/api/health` returns 200.** This run: health up, levels timed out, snapshot had no last price, voice untested.

Reload **v1.4.118** on the chart. No commit, push, or deploy from this pass.
