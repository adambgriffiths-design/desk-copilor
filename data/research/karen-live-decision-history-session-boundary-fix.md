# KAREN — LIVE Decision History Session Boundary Fix

**Date:** 2026-08-15  
**Mode:** smallest safe fix — LIVE clock lookup only  
**Reference audit:** `data/research/karen-live-decision-history-session-boundary-audit.md`

## BEFORE

**FAIL**

`lookupLiveAtClock` matched LIVE ring entries by EST minute-of-day only (`getEstMinutes === HH:MM`). Prior calendar/CME sessions with the same clock leaked into “What was your decision at HH:MM?” answers. A dead `target` Date stub was built from latest `asOf` then discarded.

## AFTER

**PASS**

LIVE named-clock queries are session-bound via `cmeSessionDateKeyFromDate(latest.asOf)`. Candidates are filtered to that CME Globex session before exact HH:MM / nearest-previous. Miss → honest `live_decision_missing` / “No decision was recorded…”. No PIT rebuild, no LLM invent, no prior-session HH:MM fallback.

## SESSION DEFINITION USED

**CME SESSION** (`cmeSessionDateKeyFromDate` on latest LIVE `asOf`)

Overnight clocks (≥ 18:00 ET) bind to the calendar day before the session key via existing `estTimeOnDateKey` / `getEstDateKey` helpers. No new session system.

## TESTS

`npm run test:decision-history-time-travel` → **127 passed, 0 failed**

- Prior suite (§0–8 historical recorded-only + isolation) stayed green
- Added §9 LIVE session-boundary cases covering tests **1–12**:
  1. Same-day exact HH:MM
  2. Previous session → honest miss (no leak)
  3. Overnight → RTH → no prior RTH
  4. RTH → overnight → no prior RTH
  5. Weekend → no Friday leak
  6. Holiday gap → no pre-gap leak
  7. DST → no pre-DST leak
  8. Duplicate HH:MM → Day 2 only
  9. Nearest-previous cross-session blocked (+ same-session nearest still works)
  10. Exact current-session match
  11. LIVE/HISTORICAL isolation intact
  12. Historical recorded-only behaviour intact

## CROSS-SESSION LEAK

**NO**

## DUPLICATE HH:MM

**correct** — prefers latest same-session exact match (Day 2), never Day 1

## NEAREST-PREVIOUS CROSS-SESSION

**blocked** — prior-session 09:31 is not returned for current-session 09:45; same-session nearest (09:30→09:45) still works

## PIT REBUILD

**unchanged** — LIVE path remains ring-only; HISTORICAL NL at_time remains recorded-only

## LIVE/HISTORICAL ISOLATION

**pass**

## PERFORMANCE

**UNKNOWN** (micro-bench probe hung on cold import; session filter is O(n) over the LIVE ring ≤80 entries — negligible vs LLM path). Does **not** address warm Chat 3.7–4.8s latency.

## FILES CHANGED

- `lib/decision-time-travel.ts` — session-bound `lookupLiveAtClock`
- `scripts/test-decision-history-time-travel.ts` — §9 tests 1–12
- `data/research/karen-live-decision-history-session-boundary-fix.md` — this report

No commit. No push. No deploy.
