# KAREN — LIVE Decision History Session Boundary Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no new product storage, no commit/push/deploy  
**Question:** Can a historical query retrieve a DecisionEnvelope from the **wrong trading session**?  
**Scope:** LIVE ring lookup (`lookupLiveAtClock` / `answerLiveDecisionHistoryQuery`), timestamps, `decisionKey`, session identity  
**Evidence:** code paths + prior integrity audit case 9 + in-process probes (synthetic ring entries; **not** live market data)

| Source | Result |
|--------|--------|
| `npm run test:decision-history-time-travel` | Strong on HISTORICAL PIT; **no LIVE session-boundary cases** |
| `.tmp-decision-history-integrity-probe.ts` case 9 | `leakAcrossSessions: true` (prior-day 09:31 returned) |
| `.tmp-session-boundary-audit-probe.ts` | **1 PASS / 7 FAIL** across required scenarios |

**Prior integrity note verified:** LIVE clock match is **EST HH:MM only** (no calendar day / CME session key) → **session leak risk confirmed with evidence.**

---

## MAIN FINDING

**FAIL — LIVE “What was your decision at HH:MM?” is not session-bound.**

`lookupLiveAtClock` in `lib/decision-time-travel.ts` matches ring entries solely by `getEstMinutes(asOf) === clockMinutes(HH:MM)` (and otherwise “nearest previous” by minute-of-day). It does **not** filter by:

- `getEstDateKey` (calendar day in America/New_York), or
- `cmeSessionDateKeyFromDate` (CME Globex session day, 18:00 ET roll),

even though both helpers already exist in `lib/market-data.ts`.

A dead stub builds a `target` Date from the latest LIVE `asOf` day, then discards it (`void target; void exact`). Banner text `LIVE — CURRENT SESSION HISTORY` therefore overclaims: replies can cite a **prior calendar / CME session** that merely shares the same EST clock.

Worse: when **two days** both have the same HH:MM, the scan **breaks on the first (oldest)** match — so “at 09:30” prefers **yesterday**, not today.

`decisionKey` is persisted on LIVE entries and includes full ISO `asOf` when synthesized at record time (`LIVE@?|stance|verdict|asOfIso` from `desk-pipeline.ts`), so **identity of the wrong row is honest** — retrieval simply picks the wrong row. `asOfEst` stores **HH:MM only** (`formatEst`), not date/session.

HISTORICAL path is largely insulated for single-session fixtures (`barIndex` cap + fixture-scoped ring); this audit’s FAIL is specifically **LIVE clock queries**.

---

## Mechanism (code)

```835:872:lib/decision-time-travel.ts
function lookupLiveAtClock(clock: ParsedClockTime): DecisionSnapshot {
  const live = getDecisionEnvelopeHistory("LIVE");
  // ...
  const latest = live[live.length - 1]!;
  const base = new Date(latest.asOf);
  const target = new Date(base);
  const targetMins = clockMinutes(clock);
  let best: DecisionEnvelopeHistoryEntry | null = null;
  let exact = false;
  for (const e of live) {
    const mins = getEstMinutes(new Date(e.asOf));
    if (mins === targetMins) {
      best = e;
      exact = true;
      break; // first chronological HH:MM hit wins (often prior day)
    }
    if (mins <= targetMins) best = e; // cross-day nearest-previous
  }
  // ...
  void target;
  void exact;
  return entryToSnapshot(best, clock.raw);
}
```

Parse path (`lib/decision-history-query.ts`) extracts **hour/minute only** — no date token — so resolution **must** bind clock to a session using latest LIVE context; today it does not.

Absolute helpers used elsewhere (`findDecisionAtOrBefore`) are ISO-safe; the leak is specific to **named-clock** LIVE queries (`at_time` / `since` / `between` / `why_changed` with clock).

---

## Scenario matrix (PASS / FAIL)

Synthetic LIVE ring only. Pass criteria: answer must not return a decision whose `asOf` belongs to a **different** calendar/CME session than the one implied by the latest LIVE entry when that session has no matching HH:MM (honest miss). Same-day exact HH:MM must hit the same-day row. When two days share HH:MM, prefer the session of the latest LIVE context (not the oldest ring entry).

| Scenario | Verdict | Evidence |
|----------|---------|----------|
| **same day** | **PASS** | Ring: 2026-08-15 09:30 + 10:15. Ask `at 09:30` → `same-day-0930` / LONG. No cross-session leak when only one day exists. |
| **previous session** | **FAIL** | Prior 2026-08-14 09:31 + today 10:00. Ask `at 09:31` → returns **prior-session-0931** (should miss: no today 09:31). Integrity probe case 9: `leakAcrossSessions: true`. |
| **overnight → RTH** | **FAIL** | Prior RTH 09:30 + overnight 21:00 + RTH 10:00. Ask `at 09:30` during RTH day → **prior-rth-0930**. Overnight row correctly keyed to CME session `2026-08-15` but clock lookup ignores it. |
| **RTH → overnight** | **FAIL** | Prior RTH 09:30 + overnight 22:30. Ask `at 09:30` in overnight → **rth-day-0930** (prior RTH), not miss. |
| **weekend** | **FAIL** | Fri 09:30 + Mon 10:00. Mon ask `at 09:30` → **friday-0930**. |
| **holiday** | **FAIL** | Pre-gap Wed 09:30 + post-gap Fri 10:00 (holiday-gap stand-in). Ask `at 09:30` → **pre-holiday-0930**. Same HH:MM leak; no holiday calendar needed to prove. |
| **timezone / DST** | **FAIL** | Pre-DST 2026-03-06 09:30 + post-DST 2026-03-09 10:00. Ask `at 09:30` → **pre-dst-0930**. `America/New_York` correctly maps minutes, but **no day/session gate** remains. |
| **same HH:MM two days** (extra) | **FAIL** | Day1 09:30 + Day2 09:30 + Day2 10:00. Ask `at 09:30` → **day1-0930** (oldest), not day2. |

**Nearest-previous cross-day:** ask `at 09:45` with only prior 09:31 + today 10:00 → returns prior 09:31 (`mins <= targetMins` without session filter).

| Regression / companion | Session boundary locked? |
|------------------------|--------------------------|
| `test:decision-history-time-travel` | **No** LIVE session-boundary assertions |
| Integrity audit case 9 | Documented FAIL; repro confirmed |
| HISTORICAL fixture clock + `barIndex` cap | **PASS** for single-session fixtures (out of LIVE scope) |

---

## Timestamps / decisionKey / session identity

| Field | On LIVE ring | Used in clock lookup? | Notes |
|-------|--------------|----------------------|-------|
| `asOf` (ISO) | Yes | Indirectly via `getEstMinutes` only | Full instant present; day/session discarded |
| `asOfEst` | HH:MM only | Display | No date; weak session signal |
| `recordedAt` | Yes | No | Wall-clock write time |
| `decisionKey` | Yes (persisted) | No | Pipeline: `LIVE@?\|stance\|verdict\|asOfIso`; probe keys stable; **does not prevent wrong-session pick** |
| `lane` | `LIVE` | N/A | Isolation from HISTORICAL still PASS |
| CME / EST date | Computable from `asOf` | **Not used** | `cmeSessionDateKeyFromDate` / `getEstDateKey` unused by `lookupLiveAtClock` |
| Ring capacity | max 80 | — | Multi-day process uptime can retain prior sessions → leak surface |

---

## SAFE NEXT FIX (doc only — do not implement in this audit)

1. **Bind clock queries to a session key derived from the latest LIVE `asOf`** (prefer `cmeSessionDateKeyFromDate(latest.asOf)`; fallback `getEstDateKey` if product wants calendar-day semantics). Filter candidates to that session before HH:MM exact / nearest-previous.
2. **Wire the existing `target` Date stub** — resolve HH:MM onto the latest entry’s EST (or CME) day, then `findDecisionAtOrBefore("LIVE", targetIso)` with a same-session skew, instead of minute-of-day scan.
3. If two exact HH:MM hits exist, prefer **latest same-session** match (not first in ring).
4. On miss: keep honest `NO DECISION AVAILABLE` / `live_decision_missing` — do **not** invent or fall back across sessions.
5. Optionally persist `sessionKey` (or full `asOfEst` with date) on record for cheaper filters; not required if computed from `asOf`.
6. Add regression cases mirroring `.tmp-session-boundary-audit-probe.ts` into `test:decision-history-time-travel` (previous session, weekend, two-day same HH:MM, nearest cross-day).

No change to HISTORICAL PIT rebuild, no new durable store, no LIVE/HISTORICAL mixing.

---

## Overall verdict

**FAIL** for LIVE session-boundary safety.

Same-day-only rings work by accident; any retained prior-session HH:MM (overnight↔RTH, weekend, holiday gap, DST week, or duplicate 09:30) can answer “What was your decision at 09:30?” with the **wrong session’s** DecisionEnvelope. Prior integrity audit case 9 stands.

---

## Stop

Audit complete. No remediation code, commit, push, or deploy performed.
