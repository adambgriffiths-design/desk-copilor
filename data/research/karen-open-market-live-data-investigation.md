# KAREN — OPEN-MARKET LIVE DATA INVESTIGATION

**Date:** 2026-08-15 (Saturday)  
**Mode:** INVESTIGATE ONLY — no product/primary code changes, no commit/push/deploy  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`  
**Honesty:** CME/Globex expected **CLOSED** today. This report does **not** claim open-session UI verification. Weekend stale behavior is out of scope for “fix” (see `karen-live-market-data-stopping-diagnosis.md`).

**Probes:** code-path read of TV → Last UI and `/api/quote` fallback; weekend Yahoo + prod `/api/quote` samples; temporary `.tmp/probe-open-market-live-data.ts` for next Globex open.

---

## OPEN-SESSION VERIFIED: NO

Market closed (Sat UTC). Upstream prints do not advance. Browser TV `DC_PRICE_TICK` cadence not measured this run.

**Next open session:** run  
`npx tsx .tmp/probe-open-market-live-data.ts --duration-sec 90 --interval-sec 5`  
then complete the manual extension checklist in `.tmp/probe-open-market-live-data-summary.md`.

---

## LIVE DATA STATUS (this Saturday probe)

| Layer | Status | Evidence |
|-------|--------|----------|
| **SOURCE** | **STALE** (closed) | Yahoo last 1m bar `2026-08-14T20:59:00.000Z`; price frozen across T+0…T+20s. Tickstream REST timed out this run (key present path attempted; no fresh lag sample). |
| **SERVER** | **STOPPED** local / **LIVE** Vercel | `http://127.0.0.1:3020` health fail; prod health 200 `version=1.4.64`. |
| **API** | **STALE** but answering | Prod `GET /api/quote?symbol=MNQ` → `yahoo_bar_close` @ 30141.75, `timestamp=2026-08-14T20:59:59.000Z` (~9.7h age). Tickstream live path not selected (would need ≤60s age). |
| **CLIENT** | **LIVE timers** / **tick-mode blocks backend Last** | TV poll 250ms continues; strip 2.5s; backend quote intentionally not applied to Last in tick mode. |
| **UI** | **Would demote** without new TV restamps | LIVE ≤2s → STALE ≤60s → UNAVAILABLE. Hidden/collapsed panel skips UI apply. |

```
LIVE DATA STATUS:
SOURCE:   STALE (CME Globex weekend — no new ticks)
SERVER:   STOPPED (:3020) / LIVE (Vercel)
API:      STALE (serves Friday Yahoo print)
CLIENT:   LIVE (timers) + tick-mode refuses backend Last paint
UI:       Not open-session verified
```

---

## EXACT POINT WHERE LIVE PRICE STOPS

### A) Weekend / closed (observed today — not the open-market bug)

```
Upstream tick production (CME closed)
        │  ← NEW TICKS STOP HERE
        ▼
Providers keep returning Friday last print
        ▼
Age gates demote LIVE → STALE → UNAVAILABLE
```

### B) Open-market failure mode (code-determined; NOT session-verified)

When Globex **is** open, the Last box stays live **only** while the TV tick chain restamps. The first place live UI can fail open-session is:

```
tv-bridge.js (__dcPriceTickTimer @ 50ms)
        │  postMessage DC_PRICE_TICK
        │  (dedupe: same price posts at most ~1/s)
        ▼
chart-price.js message handler → applyTick(...)
        │  ← PRIMARY OWNER of Last in tick mode
        │  poll @ 250ms continues, but emitPriceIfChanged() is empty in tick mode
        │  axis re-apply only if last TV age > TICK_LIVE_MAX_AGE_MS (2s)
        ▼
content.js startWatcher → noteLivePrice + updateMarketBarUI
        │  skipped if document.hidden || !isPanelExpanded()
        ▼
LIVE badge requires liveSource + age ≤ 2s
```

**If TV ticks stop while market is open**, the designed fallback does **not** paint `/api/quote` onto Last:

```
fetchBackendPriceFallback() / QUOTE → /api/quote
        │  may still fetch Tickstream/Yahoo
        ▼
tickMode === true → return qPx early   ← STOP PAINT HERE
        │  (no noteLivePrice, no Last update)
        ▼
Last ages out → STALE (≤60s) → UNAVAILABLE
```

**Exact stop for open-session recovery:**  
`extension/content.js` `fetchBackendPriceFallback` — tick-mode early return **before** `noteLivePrice`.  
Secondary gate: `refreshContextStripPrice` in tick mode only reads `DeskCopilotChartPrice.readQuoteSync()` and never calls the backend.  
Tertiary: `chartPricePayload` returns `{}` in tick mode when TV quote is missing (no backend fill for Last).

Amplifier (API hop, not TV): dead/slow `localhost:3020` with cached trust can delay or sticky-block Vercel (see below).

**Not in scope / not the stop:** Redis, decision memory, six-feature patch, continuous recorder, `verdict-engine.ts`.

---

## EXPECTED REFRESH INTERVAL

| Path | Expected |
|------|----------|
| MAIN-world TV bridge scan (`tv-bridge.js`) | **50ms** timer continuous while page alive |
| `DC_PRICE_TICK` postMessage | On price change immediately; **same price ≤1/s** (`lastPosted` dedupe) |
| Isolated poll (`chart-price.js`) | **250ms** tick / **1000ms** minute — continues after first success |
| Context strip price refresh | **2500ms** (`CONTEXT_PRICE_MS`) |
| Backend quote fallback cooldown | **20s** |
| Tickstream accepted as live (`LIVE_PRICE_MAX_AGE_MS`) | age ≤ **60s** |
| UI LIVE (tick mode) | age ≤ **2s** (`TICK_LIVE_MAX_AGE_MS`) |
| UI STALE (tick mode) | age ≤ **60s** (`TICK_STALE_MAX_AGE_MS`) |
| Localhost health trust TTL | **120s** (`HEALTH_TTL_MS`) |
| Heartbeat / warm | 60s / 240s (connection, not Last print) |

**Open-market expectation for “staying live”:** Last restamp interval should stay **≤2s** while TV prints move (or backend tickstream must be allowed to paint with a coherent age policy — today it is not).

---

## ACTUAL REFRESH INTERVAL (measured)

### Upstream / API (weekend — closed)

| Wall sample | Yahoo lastBar | Yahoo age | Prod `/api/quote` source | Quote age | Tickstream |
|-------------|---------------|-----------|--------------------------|-----------|------------|
| T+0s | 2026-08-14T20:59:00Z | ~34977s | yahoo_bar_close | ~34918s | timeout |
| T+10s | same | ~34987s | yahoo_bar_close | ~34928s | timeout |
| T+20s | same | ~34998s | yahoo_bar_close | ~34939s | timeout |

- Providers/API **keep answering**; **print timestamps do not advance**.
- **Actual print refresh interval:** **∞ / frozen** (closed market).
- Local `:3020`: unavailable.
- JSONL: `.tmp/probe-open-market-live-data.jsonl`

### Client (code — not browser-timed this run)

- Poll/timer lifecycle does **not** stop after first success.
- Tick-mode UI refresh of Last depends on `DC_PRICE_TICK` / axis rescue, not on `/api/quote`.
- Open-session TV cadence: **UNKNOWN** until next Globex open (probe path below).

---

## LAST FRESH TIMESTAMP

| Feed | Timestamp (UTC) | Notes |
|------|-----------------|-------|
| Yahoo 1m last bar | **2026-08-14T20:59:00.000Z** | Frozen across probe |
| Yahoo regularMarketTime | **2026-08-14T20:59:59.000Z** | Same Friday session end |
| Prod `/api/quote` | **2026-08-14T20:59:59.000Z** | `yahoo_bar_close` |
| Tickstream REST (this run) | **n/a** | Request aborted (timeout); prior weekend diagnosis had `2026-08-14T21:39:38.000Z` |
| Within 60s live gate? | **No** | |

---

## SOURCE / SERVER / API / CLIENT / UI

| Layer | Open-market role | Status now |
|-------|------------------|------------|
| **SOURCE** | TV chart Last; Tickstream REST; Yahoo | STALE / closed |
| **SERVER** | Next local :3020 or Vercel serverless | Local STOPPED; Vercel LIVE |
| **API** | `GET /api/quote` Tickstream→Yahoo; age gate 60s on Tickstream | Serving stale Yahoo |
| **CLIENT** | Bridge 50ms → tick apply; poll 250ms; strip 2.5s; fallback 20s | Timers alive; tick mode blocks backend Last |
| **UI** | LIVE≤2s / STALE≤60s; skip if hidden/collapsed | Not open-verified |

---

## Checklist answers (investigation questions)

### Does `DC_PRICE_TICK` fire continuously during open CME session?

**Code:** Bridge timer runs continuously (50ms). Posts are **not** one-shot; they continue while the MAIN-world IIFE is alive. Same price is throttled to ~1/s; changing prices post more often.  
**Open-session measured:** **NO** — not verified today.

### Does `chart-price.js` keep polling/applying ticks after first success?

**Yes (code).** `restartPricePoll` keeps a 250ms interval. In tick mode, `emitPriceIfChanged` is intentionally empty; apply path is `DC_PRICE_TICK` → `applyTick`, plus axis rescue when age >2s. It does **not** stop after first success.

### If TV stops ticks, does client correctly fall back to `/api/quote`?

**No (for Last box).** Fallback may *fetch* quote (DEGRADED + `!hasLocalChartPrice`, or panel init), but in tick mode it **returns without** `noteLivePrice`. Strip refresh never calls backend in tick mode.  
Also: `hasLocalChartPrice()` treats any finite `contextStripPrice` as local **without age check**, so DEGRADED-triggered fallback often never runs after a prior print.

### Why does tick mode avoid applying backend quote to Last?

**By design ownership:** comments state MAIN-world `DC_PRICE_TICK` owns Last; isolated DOM re-parse is blocked to avoid scale/high false reads. Explicit early returns:

- `fetchBackendPriceFallback`: `if (tickMode) return qPx;` (no paint)
- `chartPricePayload`: `if (tickMode) return {};`
- `refreshContextStripPrice`: tick branch only uses `readQuoteSync`

### If `/api/quote` has fresh Tickstream under 60s live gate, can UI safely use it?

**Server:** Yes — `/api/quote` returns Tickstream when `ageMs ≤ 60_000` and price is MNQ-range.  
**UI today:** No — tick mode will not paint it onto Last.  
**If allowed:** Numerically safe under the same 60s gate used server-side. **Caveat:** UI LIVE badge still requires age ≤**2s**; a Tickstream quote with e.g. 5–30s lag would paint as **STALE**, not LIVE, unless badge policy is aligned (describe-only; do not raise weekend thresholds as a “fix”).

### Does localhost :3020 unavailable/slow cause sticky bad cached localhost vs immediate Vercel?

**Yes (code).**

- Prefers local candidates before Vercel (`api-config.js`).
- `trustCachedLocal` / `HEALTH_TTL_MS=120s` can return cached localhost without re-probe.
- On **slow/timeout** local health, `pingHealth` can return `ok: true, degraded: true` with cached localhost and **skip Vercel**.
- On failed ping, `resolveApiBase` can still return stored `apiBaseLastGood` local.
- Hard connection refused eventually clears `lastHealthOkAt` on network error and can fall through — but timeout+trust path is the sticky case. Observed today: :3020 down, prod still fine if client reaches it.

### Hidden tabs/panels suppressing updates?

**Yes.** `refreshContextStripPrice`, `startWatcher` UI apply, bias/session timers skip when `document.hidden` or panel collapsed. Bridge/poll may still run; Last UI does not update until visible+expanded.

### Measure update interval ≥60s during OPEN market session?

**Not measured** — market closed. Probe + checklist prepared for next open.

---

## ROOT CAUSE

**Today (Saturday):** Live price “stops” because **CME is closed** — upstream last print frozen; age gates correctly demote. Do not change weekend behavior.

**Open-market residual risk (code):** When Globex is open, Last stays live only via TV `DC_PRICE_TICK` (≤2s restamp). If the TV bridge stops or stalls, the client **does not** apply a still-fresh Tickstream `/api/quote` to the Last box (tick-mode early return + strip never falls back). Sticky dead/slow localhost can also break the API hop even when Vercel would serve a live Tickstream quote. Hidden/collapsed panel suppresses UI updates independently.

**Distinction:** Weekend freeze ≠ open-session poll death. Open-session claim requires the `.tmp` probe showing advancing timestamps **and** a browser tick count.

---

## SMALLEST SAFE FIX (describe only — do not implement)

1. **Tick-mode Last recovery (smallest open-session fix):** When `getUpdateMode()==="tick"` and TV quote is missing or age > `TICK_LIVE_MAX_AGE_MS` (or > STALE), if `/api/quote` returns `tickstream_quote` / `tickstream_live` with `ageMs ≤ LIVE_PRICE_MAX_AGE_MS` (60s), call `noteLivePrice` with that source/timestamp. Do **not** paint `yahoo_bar_close` as LIVE. Do **not** widen weekend gates.
2. **Optional badge alignment:** Treat tickstream Last as LIVE with a dedicated threshold (≤60s or a mid value), or show LIVE only when lag ≤2s and STALE when 2s&lt;lag≤60s — but still show the print (today UNAVAILABLE/blank after 60s with no TV).
3. **Fallback trigger hygiene:** Make `hasLocalChartPrice` age-aware (or use `hasFreshTvLast`) so DEGRADED can invoke fallback when TV is stale.
4. **Local API hop:** On local health timeout, fall through to Vercel instead of returning trusted dead localhost; clear `apiBaseLastGood` on connection refused immediately.

No Redis / decision-memory / six-feature / recorder / verdict-engine changes.

---

## Path to probe script for next open session

| Artifact | Path |
|----------|------|
| Probe script | `.tmp/probe-open-market-live-data.ts` |
| JSONL output | `.tmp/probe-open-market-live-data.jsonl` |
| Summary | `.tmp/probe-open-market-live-data-summary.md` |

```bash
# During Globex open (e.g. Mon–Fri or Sun after ~18:00 ET), from repo root:
npx tsx .tmp/probe-open-market-live-data.ts --duration-sec 90 --interval-sec 5
```

**Pass criteria for OPEN-SESSION VERIFIED: YES**

1. Probe reports `openSessionLikely: true` (Yahoo bar and/or Tickstream timestamps advance, or Tickstream ≤60s).
2. Manual: Karen panel expanded, tab visible; Last stays LIVE while MNQ moves; `DC_PRICE_TICK` continues over ≥30s.
3. Optional: stop TV bridge / leave chart — confirm whether Last recovers via `/api/quote` (expect **fail today** until fix #1).

Temporary probes only under `.tmp/` — marked temporary; no primary product changes.

---

## Required summary fields

| Field | Value |
|-------|--------|
| **EXACT POINT WHERE LIVE PRICE STOPS** | Closed: upstream tick production. Open residual: tick-mode refuses backend Last paint at `fetchBackendPriceFallback` / strip path after TV restamps stop (+ optional sticky localhost API hop). |
| **EXPECTED REFRESH INTERVAL** | Bridge 50ms; tick post ≤1s same price; poll 250ms; strip 2.5s; LIVE ≤2s; Tickstream gate 60s |
| **ACTUAL REFRESH INTERVAL** | Weekend: prints frozen (~∞); API still answers. Open TV cadence: not measured |
| **LAST FRESH TIMESTAMP** | Yahoo / prod quote **2026-08-14T20:59:59.000Z** (bar **20:59:00Z**) |
| **SOURCE / SERVER / API / CLIENT / UI** | STALE / local STOPPED+Vercel LIVE / STALE serving / timers LIVE but no backend Last / not open-verified |
| **ROOT CAUSE** | Weekend = market closed. Open risk = TV-owned Last with no Tickstream paint + localhost stickiness + hidden-panel skip |
| **SMALLEST SAFE FIX** | Paint fresh tickstream `/api/quote` into Last when TV stale/missing in tick mode; fix localhost fallthrough; age-aware fallback trigger |
| **OPEN-SESSION VERIFIED** | **NO** — use `.tmp/probe-open-market-live-data.ts` next open |

STOP. No product changes.
