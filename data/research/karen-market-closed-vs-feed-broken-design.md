# KAREN — MARKET CLOSED vs DATA FEED BROKEN (DESIGN)

**Date:** 2026-08-15 (Saturday)  
**Mode:** INVESTIGATE + DESIGN ONLY — no product code changes, no commit/push/deploy  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`  
**Priors:** `karen-live-market-data-stopping-diagnosis.md` (weekend probe); `karen-live-market-state-truth-audit.md`; `karen-weekend-offmarket-test-audit.md`; `research-nq-session-boundary-gap.md`  
**Not found:** `karen-open-market-live-data-investigation.md` (does not exist)  
**Market-closed unify:** `.tmp/karen-market-closed-unify` exists as a worktree copy; **no** new open/closed calendar or closed-vs-broken classifier started there (same session helpers as main).

**Hard rules for this design (and any future implementation):**
- Do **not** invent ticks.
- Do **not** weaken freshness thresholds.
- Do **not** make stale appear LIVE.
- Old price while **OPEN** = **DATA FAILURE**.
- Old price while **CLOSED** = **NORMAL**.
- Do **not** classify holiday from Sat/Sun or old price alone.
- Do **not** classify outage as MARKET CLOSED.
- Do **not** classify normal close as DATA_FEED_BROKEN.
- Futures (CME Globex for MNQ/NQ) calendar is **authority** — not equity RTH, not UK bank holidays.

---

## Designed state vocabulary (exist vs need)

| State | Meaning | Exists today? | Notes |
|-------|---------|---------------|-------|
| **MARKET_OPEN** | CME Globex should be producing new prints **now** | **No** as named state | Only age gates; no `isGlobexOpen(now)` |
| **MARKET_CLOSED** | Regular daily/weekend halt — no new ticks expected | **No** as named state | UI collapses to STALE / UNAVAILABLE / hop DISCONNECTED |
| **MARKET_HOLIDAY** | Exchange holiday full close | **No** | Must come from calendar, never from age or weekday alone |
| **MARKET_EARLY_CLOSE** | Holiday-adjacent early halt (still “closed” UX after halt) | **No** | Needs calendar + halt time |
| **DATA_FEED_STALE** | Market open (or should be); prints exist but age > live gate, < broken | **Partial** | UI `STALE` / hop `DEGRADED` / API `STALE` — **not** gated on session open |
| **DATA_FEED_BROKEN** | Market open; no usable live print / providers fail while ticks expected | **Partial** | Mixed into `UNAVAILABLE`, `DISCONNECTED`, `LIVE_DATA_UNAVAILABLE` |
| **LOCAL_API_UNAVAILABLE** | Extension cannot reach preferred local Next (`:3020`) | **Partial** | Connection hop / api-config localhost preference; not labeled distinctly in market bar |
| **UPSTREAM_UNAVAILABLE** | Tickstream/Yahoo/TV source HTTP/WS fail (not merely old print) | **Partial** | `/api/quote` 503 / null; Tickstream reject; no separate UI enum |

**UI rule:** `MARKET_CLOSED` / `MARKET_HOLIDAY` / `MARKET_EARLY_CLOSE` share **closed UX** (last print allowed, never LIVE).  
**UI rule:** `MARKET_OPEN` + stale/broken → **DATA STALE / FEED PROBLEM** (never “market closed”).

**Existing UI tokens (do not invent LIVE):** header/market bar use `LIVE` | `STALE` | `UNAVAILABLE`; hops use `CONNECTED` | `DEGRADED` | `DISCONNECTED`; API quality uses `LIVE` | `DEGRADED` | `STALE` | `UNAVAILABLE`. Design maps new session/data states **onto** these without promoting stale to LIVE.

---

## Calendar differences (authority)

| Calendar | Applies to MNQ/NQ desk? | Typical hours (ET) | Holiday source |
|----------|-------------------------|--------------------|----------------|
| **CME Globex (equity index futures)** | **YES — authority** | Sun ~18:00 → Fri ~17:00; daily maintenance ~17:00–18:00 | CME holiday / early-close schedule for equity index futures |
| **US equity cash (NYSE/Nasdaq)** | No for last-print truth | Mon–Fri 09:30–16:00 | Equity exchange calendar — **must not** drive Globex open/closed |
| **UK bank holiday** | No | N/A | Irrelevant to CME Globex MNQ |
| **ICT session labels** (`asia` / `london` / `ny_*`) | Narrative only | Kill-zone clocks | **Not** open/closed; runs even on weekends in code |

Weekend halt (Fri ~17:00 → Sun ~18:00) and daily maintenance hour are **MARKET_CLOSED**, not holidays. Holidays are **named exchange closures** on weekdays (or early closes) from the CME schedule.

---

## 1. CURRENT SESSION / CALENDAR SOURCE

**Authoritative pieces that already exist (reuse — do not invent a second session-day system):**

| Symbol / helper | File | Role |
|-----------------|------|------|
| `cmeSessionDateKey` / `cmeSessionDateKeyFromDate` | `lib/market-data.ts` | Globex **session date** rolls at **18:00 ET** |
| `cmeWeekSundayKey` | `lib/market-data.ts` | Week key from Sunday 18:00 ET |
| `getEstMinutes` / `getEstDateKey` | `lib/market-data.ts` | America/New_York wall clock |
| `barsInCmeSession` / `aggregateSessionBar` / `sessionCloseBar` | `lib/market-data.ts` | Session OHLC for PDH/PDC |
| `isConsecutiveTradingSession` | `lib/market-data.ts` | Allows Fri→Mon daily gap (1–3 calendar days) for FVG adjacency — **not** a holiday table |
| `SESSION_BOUNDARY_GAP` | `lib/research/dataset/validate.ts` | Treats ~60m gap at session roll as expected maintenance |
| Comments / NWOG | `lib/market-data.ts` | Fri ~17:00 close + Sun 18:00 open encoded in **level math**, not as `isOpen` |

**Not a market calendar:**
- `lib/sessions.ts` `resolveSessionContext` — ICT Asia/London/NY phases only; no open/closed; no weekend gate.
- Yahoo `regularMarketTime` / last bar age — **observation**, not calendar.
- Sat/Sun weekday alone — insufficient (Sunday after 18:00 can be OPEN).

**Holiday / early-close sufficiency:** **INSUFFICIENT.** There is **no** CME holiday list, no early-close table, and no `isGlobexTradingNow(asOf)` predicate. Do **not** invent a second session-date key; **extend** `market-data` with an open/closed/holiday layer that **consumes** existing `cmeSessionDateKey` + ET helpers + a **small explicit holiday/early-close table** (or curated JSON) for equity-index futures.

---

## 2. CURRENT CLOSED / OPEN LOGIC

**There is no open/closed decision.** Behavior is age-only:

| Layer | Gate | Behavior when old |
|-------|------|-------------------|
| Tickstream live path | `LIVE_PRICE_MAX_AGE_MS = 60_000` (`lib/chart-live-price.ts`, `stream-snapshot.ts`) | Reject quote; fall through to Yahoo |
| `/api/quote` | Same Tickstream gate → Yahoo last | Still **200** with Friday stamp on weekend |
| Observation audit | `STALE_BAR_SEC = 120` (`lib/data-quality-check.ts`) | `stale_bar` critical → STALE / cannot decide |
| Extension tick UI | LIVE ≤ **2s**; STALE ≤ **60s**; else UNAVAILABLE (`extension/content.js`, `chart-price.js`) | LIVE → STALE → UNAVAILABLE |
| Market hop | `TICK_LIVE_MS=2s` CONNECTED; ≤60s DEGRADED; else DISCONNECTED (`lib/connection-state.ts`) | Weekend → DISCONNECTED |
| API data quality | `LIVE` / `DEGRADED` / `STALE` / `UNAVAILABLE` (`lib/api-data-quality.ts`) | Age/quality driven; no session open check |
| `LIVE_DATA_UNAVAILABLE_VERDICT` | Connection blocked copy | Speaks “live data unavailable” — **not** “market closed” |

**Implication:** Weekend and open-session outages look the same in the UI after age gates fire.

---

## 3. HOLIDAY HANDLING

**Product / live path:** **None.**

**Adjacent only:**
- Decision time-travel / red-team tests assert **no invent** across holiday-like gaps (`scripts/test-decision-history-time-travel.ts`, `red-team-B-G-time-session.ts`).
- Casual/mentor intent treat the word “holiday” as **travel chat**, not exchange calendar.

**Design rule:** `MARKET_HOLIDAY` only if `(date ∈ CME equity-index holiday table)` OR `(weekday session would be open but calendar marks closed)`. Never from `ageMs` or Sat/Sun alone.

---

## 4. EARLY-CLOSE HANDLING

**None.** No early-close times, no “closed after 13:00 on X” logic.

Daily **17:00–18:00 ET** maintenance is documented in comments / session-boundary research as expected halt — treat as **MARKET_CLOSED** (regular), not early-close, not broken.

`MARKET_EARLY_CLOSE` = calendar says tradeable day ends early; after that halt time → closed UX; before → OPEN freshness rules.

---

## 5. DATA-FRESHNESS LOGIC

### End-to-end path (TV → Tickstream → Yahoo → server → `/api/quote` → extension → UI)

```
SOURCE
  TV DOM Last (tv-bridge → DC_PRICE_TICK)     expected cadence: continuous while open
  Tickstream REST /quote (+ short WS local)   live iff age ≤ 60s
  Yahoo chart / regularMarketTime             last print; may be hours old when closed
        │
SERVER
  resolveTickstreamAuthoritativePrice         drop if age > 60s
  fetchYahooLastPrice                         always returns last known stamp
        │
API
  GET /api/quote                              Tickstream → Yahoo; 503 only if both fail
        │
CLIENT
  chart-price.js 250ms tick poll              Last box owned by TV in tick mode
  content.js strip / pulse                    backend quote fallback; tick mode often skips paint
  api-config                                  localhost:3020 first, else Vercel
        │
UI
  LIVE ≤2s · STALE ≤60s · else UNAVAILABLE
  market hop CONNECTED / DEGRADED / DISCONNECTED (same ages)
```

### Open + stop vs closed (from weekend diagnosis)

| Situation | What happens today | Correct classification |
|-----------|--------------------|------------------------|
| **Closed (Fri halt / weekend)** | Upstream keeps answering same print; age gates → STALE/DISCONNECTED | **MARKET_CLOSED** + last print OK |
| **Open + TV bridge dies** | Tick-mode Last freezes; backend may still have Tickstream ≤60s but tick UI may not paint it as LIVE | **DATA_FEED_STALE** or **BROKEN** if no feed ≤60s |
| **Open + Tickstream+Yahoo dead** | `/api/quote` 503; UI UNAVAILABLE | **UPSTREAM_UNAVAILABLE** / **DATA_FEED_BROKEN** |
| **Local :3020 down** | Prefer-localhost sticky failure; Vercel may still work | **LOCAL_API_UNAVAILABLE** (orthogonal to market calendar) |

**Do not weaken:** keep 2s / 60s / 120s as-is. Session awareness only **reinterprets** what STALE/UNAVAILABLE **means** in copy and state enum — it must not mark old weekend prints as LIVE.

---

## 6. CLOSED-vs-BROKEN DECISION TREE

Primary question: **“Should I be receiving fresh data RIGHT NOW?”**

```
Q0. Can we reach a desk API? (local preferred, else prod)
    NO  → LOCAL_API_UNAVAILABLE (and still evaluate calendar for messaging)
    YES → continue

Q1. Calendar: is CME Globex for MNQ expected open at asOf?
    Inputs (in order):
      a) Explicit holiday table → MARKET_HOLIDAY (full day)
      b) Early-close table → if now ≥ earlyHalt → MARKET_EARLY_CLOSE; else open window
      c) Weekend / Fri≥17:00 ET / Sun<18:00 ET → MARKET_CLOSED
      d) Daily maintenance 17:00–18:00 ET Mon–Thu → MARKET_CLOSED
      e) Else → MARKET_OPEN
    NEVER use print age alone for Q1.

Q2. If NOT MARKET_OPEN (closed / holiday / early-close):
      Expect: no new ticks; last print may be hours old.
      Data substate:
        - Upstream HTTP OK with last print → NORMAL closed (show last @ iso, age)
        - Upstream HTTP fail → UPSTREAM_UNAVAILABLE (still closed UX; mention feed unreachable)
      NEVER emit DATA_FEED_BROKEN solely because age > 60s while closed.
      NEVER emit LIVE.

Q3. If MARKET_OPEN:
      Expect: some live source age ≤ LIVE_PRICE_MAX_AGE_MS (60s) ideally;
      tick UI LIVE only if ≤2s (unchanged).
      Evaluate feeds independently:
        - Any authoritative live (TV / Tickstream) age ≤ 60s → data OK (UI LIVE only if ≤2s)
        - 2s < age ≤ 60s while open → DATA_FEED_STALE
        - age > 60s on all live sources OR all sources error while open → DATA_FEED_BROKEN
          (Yahoo-only hours-old bar while open counts as BROKEN, not CLOSED)
        - Provider HTTP/WS hard fail with no last print → UPSTREAM_UNAVAILABLE
      NEVER emit MARKET_CLOSED because age is large.
```

**Critical asymmetry:**

| Condition | Market state | Data state |
|-----------|--------------|------------|
| Open + old price | MARKET_OPEN | DATA_FEED_STALE or DATA_FEED_BROKEN |
| Closed + old price | MARKET_CLOSED (or HOLIDAY / EARLY_CLOSE) | Normal (not broken) |
| Open + fresh | MARKET_OPEN | OK / LIVE |
| Closed + fresh (shouldn’t happen long) | Still CLOSED if calendar says so | Suspicious feed — investigate, don’t call OPEN from ticks alone without calendar |

---

## 7. TEST MATRIX (16 cases)

| # | Scenario | EXPECTED MARKET STATE | EXPECTED DATA STATE | EXPECTED UI STATE | USER MESSAGE (intent) | BUG IF TODAY? |
|---|----------|----------------------|---------------------|-------------------|------------------------|---------------|
| 1 | Tue 10:00 ET, TV tick age 0.5s | MARKET_OPEN | OK | LIVE | Live MNQ @ price | No |
| 2 | Tue 10:00 ET, TV age 15s, Tickstream age 5s | MARKET_OPEN | DATA_FEED_STALE (tick UI) / OK if backend used | STALE on tick Last; desk may still have usable quote | Data stale — last print Xs ago (market open) | **Partial** — no “open” framing |
| 3 | Tue 10:00 ET, TV dead, Tickstream+Yahoo age >60s but HTTP 200 | MARKET_OPEN | DATA_FEED_BROKEN | UNAVAILABLE / DISCONNECTED | Feed problem — market is open, no fresh print since … | **Yes** — reads like generic dead data, not open+broken |
| 4 | Tue 10:00 ET, Tickstream+Yahoo HTTP fail | MARKET_OPEN | UPSTREAM_UNAVAILABLE | UNAVAILABLE | Upstream unavailable (market open) | **Partial** |
| 5 | Tue 10:00 ET, local :3020 refuse, Vercel OK + fresh Tickstream | MARKET_OPEN | OK (+ LOCAL_API_UNAVAILABLE on local hop) | LIVE if TV; else backend via Vercel | Prefer noting local API down only if relevant | **Sticky localhost** risk (diagnosis) |
| 6 | Mon–Thu 17:30 ET (maintenance) | MARKET_CLOSED | Normal | Closed UX + last print | Market closed (daily halt) · last @ … | **Yes** — shows STALE/DISCONNECTED as if feed died |
| 7 | Fri 17:30 ET after Globex halt | MARKET_CLOSED | Normal | Closed UX | Market closed for weekend · last @ Fri … | **Yes** — same |
| 8 | Sat 12:00 ET, Yahoo Friday stamp | MARKET_CLOSED | Normal | Closed UX | Market closed · last @ … | **Yes** — weekend diagnosis case |
| 9 | Sun 12:00 ET (before 18:00) | MARKET_CLOSED | Normal | Closed UX | Market closed · opens Sun 18:00 ET | **Yes** |
| 10 | Sun 18:30 ET, fresh ticks | MARKET_OPEN | OK | LIVE | Live | No (when truly open) |
| 11 | US CME holiday weekday, no session | MARKET_HOLIDAY | Normal | Closed UX (holiday reason) | Market holiday · last @ … | **Yes** — no holiday state; would look STALE |
| 12 | Sat afternoon — must **not** label HOLIDAY | MARKET_CLOSED | Normal | Closed (weekend), **not** holiday | Weekend closed — not holiday | N/A if we wrongly say holiday = **bug** |
| 13 | Early-close day, still before early halt, fresh | MARKET_OPEN | OK | LIVE | Live | No calendar today |
| 14 | Early-close day, after early halt, old print | MARKET_EARLY_CLOSE | Normal | Closed UX (early close) | Early close · last @ … | **Yes** — no early-close |
| 15 | Open session, Tickstream ≤60s, TV bridge dead | MARKET_OPEN | DATA_FEED_STALE or OK via Tickstream | Should show non-LIVE honest backend / Tickstream — **not** CLOSED | Open · feed degraded (TV down; Tickstream Xs) | **Yes** — tick mode may hide backend; age→UNAVAILABLE looks like total death |
| 16 | Closed session, classify outage as CLOSED only if calendar closed; if open hours + outage → BROKEN | (by clock) | (by age/errors) | Must not swap labels | — | **Yes** today: closed and broken share STALE/UNAVAILABLE |

**Fixture discipline:** weekend cases use real last-print ages; open+broken cases need open-session fixtures or clock-injected `asOf` — never invent ticks to fake LIVE.

---

## 8. CURRENT GAPS

1. **No `isGlobexOpen` / session status API** — calendar incomplete for holidays & early closes.
2. **Age gates conflate CLOSED and BROKEN** in UI copy and hop health.
3. **No MARKET_HOLIDAY / EARLY_CLOSE** distinction (and risk of false holiday from weekend).
4. **`/api/quote` returns stale Yahoo as success** with no `marketStatus` / `expectFresh` field.
5. **Observation `stale_bar`** fires on weekend → blocks decide as if data bad.
6. **Tick-mode Last** ignores backend paint → open+TV-down looks worse than reality.
7. **LOCAL_API_UNAVAILABLE** not separated from market/feed in the price badge.
8. **Equity/ICT clocks** could be misused as open/closed if someone shortcuts — document Globex-only authority.
9. **market-closed-unify worktree** has not started this layer yet.
10. **No single decision function** answering “Should I be receiving fresh data RIGHT NOW?”

---

## 9. SMALLEST SAFE IMPLEMENTATION (describe only — do not implement)

**Scope ceiling:** session status + honesty in quote/UI labeling. **Out of scope:** six-feature, Redis, decision-layer, recorder, freshness threshold changes, inventing ticks.

1. **Add one module** (e.g. `lib/cme-globex-session-status.ts`) that:
   - Reuses `getEstMinutes` / `getEstDateKey` / existing session-day helpers.
   - Encodes regular open rules: Sun 18:00 → Fri 17:00 with Mon–Thu 17:00–18:00 halt.
   - Adds a **small explicit** holiday + early-close table for CME equity index futures (curated dates — not Sat/Sun inference).
   - Returns `{ marketState, expectFresh, reason, nextOpenEt? }` for `asOf`.

2. **Thread status into `/api/quote` (and optionally health)** as additive fields: `marketState`, `expectFresh`, `lastPrintAgeMs` — **without** changing when Tickstream is accepted (still ≤60s) and **without** labeling Yahoo weekend prints as live.

3. **Extension UI mapping only:**
   - If `!expectFresh` → closed UX shared by CLOSED / HOLIDAY / EARLY_CLOSE (reason string differs); show last print + age; **never LIVE**.
   - If `expectFresh` && age gates fail → DATA STALE / FEED PROBLEM copy; **never “market closed”**.
   - Keep 2s/60s thresholds unchanged.

4. **Optional smallest follow-up (open only):** if `expectFresh` && TV tick dead && Tickstream age ≤60s, allow tick-mode to display backend quote as **non-LIVE** honest secondary (still not LIVE unless ≤2s policy allows — likely STALE badge with Tickstream source). Do not use this to fake LIVE.

5. **Tests:** unit matrix for the 16 cases with **fixed `asOf`** + fixture ages; no network required for calendar; no threshold weakening.

**Explicit non-goals:** do not auto-derive holidays from missing bars; do not treat UK bank holidays; do not use equity 16:00 as Globex close.

---

## 10. FILES THAT WOULD CHANGE

| File | Change (when implementing) |
|------|----------------------------|
| **New** `lib/cme-globex-session-status.ts` (name flexible) | Open/closed/holiday/early-close predicate + `expectFresh` |
| **New** `data/cme-equity-index-holidays.json` (or const in module) | Explicit holiday / early-close table |
| `lib/market-data.ts` | Re-export only if needed; **do not** fork `cmeSessionDateKey` |
| `app/api/quote/route.ts` | Attach `marketState` / `expectFresh` / age metadata |
| `lib/chart-live-price.ts` | Optional helpers to classify data state given `expectFresh` — **no** threshold edits |
| `lib/connection-state.ts` / `extension/connection-state.js` | Map closed vs broken into tips / hop reasons (optional) |
| `extension/content.js` | Closed UX vs open+stale messaging in `updateMarketBarUI` / header |
| `extension/chart-price.js` | Only if open-session backend paint follow-up is included |
| `scripts/test-cme-globex-session-status.ts` (new) | 16-case unit matrix |
| `lib/api-data-quality.ts` / `lib/data-quality-check.ts` | **Later / careful:** weekend `stale_bar` should not mean feed broken when `!expectFresh` — only if product requires decide-path honesty; not required for smallest UI fix |

**Do not touch (this design):** Redis, decision envelope, six-feature patch, recorder, research replay engines (except reading session helpers).

---

## Trace summary: open+stop vs closed

| Hop | Open + stop (feed failure) | Closed (normal) |
|-----|----------------------------|-----------------|
| TV | Stops updating while session open | Stops at halt; expected |
| Tickstream | Should still move if healthy; if lag >60s while open → broken/stale | Lag hours → expected; reject for “live” but not a bug |
| Yahoo | Should advance bars while open | Frozen last bar → expected |
| Server | May reject Tickstream then serve Yahoo | Same code path; needs `expectFresh=false` to interpret |
| `/api/quote` | 200 stale or 503 while open → problem | 200 Friday stamp → normal closed |
| Extension | Timers keep firing | Timers keep firing |
| UI today | STALE → UNAVAILABLE | **Same** — **gap** |
| UI target | DATA STALE / FEED PROBLEM | MARKET CLOSED / HOLIDAY / EARLY CLOSE |

---

## Verdict

Karen already has a **CME session-date** authority (`cmeSessionDateKey` + ET helpers) but **no** trading open/closed/holiday calendar and **no** closed-vs-broken split. Freshness is **correctly strict**; weekend “LIVE then STALE” is **expected age-gate behavior**, mislabeled as feed failure. Smallest safe fix is a **Globex `expectFresh` classifier + UI/API honesty**, without inventing ticks or relaxing gates.

**STOP — design only. No code changes in this pass.**
