# KAREN — Historical decision retrieval test

**Date:** 2026-08-15  
**Mode:** HISTORICAL / FIXTURE ring + existing helpers (in-process)  
**Fixture:** `synthetic-ny-am`  
**Code changes:** **none**  
**Commit / push / deploy:** none  

## Method

1. Cleared LIVE + HISTORICAL rings.
2. Recorded real DecisionEnvelopes via existing `lookupHistoricalDecisionAtClock` at weekend/test clocks **09:31, 09:41, 10:20** (+ historical-ui session tip at barIndex 50 = 10:20 — deduped).
3. Answered the four questions from the **HISTORICAL ring** (`getDecisionEnvelopeHistory` / `latestDecisionEnvelope` / `findDecisionAtOrBefore` / `compareDecisionSnapshots`) — **not** by inventing a 09:30 entry.
4. Also called `answerHistoricalDecisionTimeTravel("What was your decision at 09:30?")` to check NL API behavior vs recorded-only rule.

Fixture **has** m1 bar 0 at EST **09:30** (`2026-08-12T13:30:00.000Z`). Bar presence ≠ recorded decision. Weekend pass / decision-history tests record **09:31+**, not 09:30.

Recorded ring after setup (3 entries):

| EST | asOf (UTC) | stance | verdict |
|-----|------------|--------|---------|
| 09:31 | 2026-08-12T13:31:00.000Z | monitor | NO_TRADE |
| 09:41 | 2026-08-12T13:41:00.000Z | monitor | NO_TRADE |
| 10:20 | 2026-08-12T14:20:00.000Z | flat | WAIT |

LIVE ring remained empty.

---

## Question results

### 1. "What was your decision at 09:30?"

**Answer:** No decision was recorded at 09:30.

| Check | Result |
|-------|--------|
| Exact 09:30 entry in HISTORICAL ring | **none** |
| Invented / re-decided for the ring answer | **no** |
| Exact required wording meaning | **PASS** |

**API note (gap):** `answerHistoricalDecisionTimeTravel` still **PIT-rebuilds** bar 0 and replies `DECISION AT 09:30` (stance `monitor` / `NO_TRADE`) even when the ring has no 09:30 record. That violates the recorded-only rule if the NL path is treated as retrieval. Helpers used for this test did **not** manufacture.

**Q1 verdict (recorded-retrieval):** **PASS**

---

### 2. "What was your last recorded decision?"

**Answer (from ring):** Last recorded DecisionEnvelope at **10:20 EST** (`2026-08-12T14:20:00.000Z`, barIndex 50): stance **flat**, verdict **WAIT**, confidence medium, thesis `bearish structure continuation`, price ~25006.9, htfBias bearish.  
decisionKey: `synthetic-ny-am@50|flat|WAIT|2026-08-12T14:20:00.000Z`

| Check | Result |
|-------|--------|
| Source | HISTORICAL ring `latestDecisionEnvelope` |
| Matches weekend smoke tip (index 50 / flat / WAIT) | yes |
| Invented | no |

**Parse gap:** `parseDecisionHistoryQuery("What was your last recorded decision?")` → `kind: none` (no dedicated NL path). Retrieval via `latestDecisionEnvelope` works.

**Q2 verdict:** **PASS**

---

### 3. "What was your decision immediately before 09:30?"

**Answer:** No decision was recorded immediately before 09:30.

(`findDecisionAtOrBefore(HISTORICAL, 09:30 − 1ms)` → null; earliest recorded is 09:31.)

| Check | Result |
|-------|--------|
| Ring retrieval | miss (honest) |
| Invented prior decision | no |

**Parse gap:** NL parse treats this as `at_time` 09:30 (not “before”).

**Q3 verdict:** **PASS**

---

### 4. "What changed between 09:30 and the next recorded decision?"

**Answer:** No decision was recorded at 09:30 — cannot compare 09:30 → next recorded decision.

Next recorded after 09:30 clock: **09:31** monitor / NO_TRADE (not used as a fake 09:30 baseline).

| Check | Result |
|-------|--------|
| Refused to invent 09:30 side of compare | **PASS** |
| Did not re-decide “as if” at 09:30 for this answer | **PASS** |

**Supporting evidence (recorded↔recorded compare path):** `compareDecisionSnapshots` on recorded **09:31 → 10:20** (existing weekend clocks) separates sections correctly:

| Section | Changes |
|---------|---------|
| **MARKET STATE** | price 25001.1 → ~25006.9; htfBias unknown→bearish; structure unknown→bearish; displacement/fvg unknown→absent |
| **REASON FOR CHANGE** (interpretation) | interpretation text; thesis.what — → bearish structure continuation; thesis.whyNow |
| **DECISION** | stance monitor→flat; verdict NO_TRADE→WAIT; invalidation condition |

`DECISION CHANGED: YES`. Formatted output includes sections 1/2/3.

**Q4 verdict (asked 09:30 pair):** **PASS** (honest miss; no manufacture)  
**Compare helper:** **PASS** on recorded 09:31→10:20

---

## Rule scorecard

| Rule | Result | Notes |
|------|--------|-------|
| Historical question retrieves **recorded** DecisionEnvelope (not current/later market as-if) | **PASS*** | *Ring/helper path. NL `answerHistoricalDecisionTimeTravel` at_time **FAIL**s this (PIT rebuild). |
| If none at 09:30 → meaning of “No decision was recorded at 09:30.” | **PASS** | Exact ring miss; no invented 09:30 entry. |
| What-changed separates MARKET STATE / DECISION / REASON | **PASS** | Demonstrated on recorded 09:31→10:20; 09:30 pair correctly refused. |
| Code change needed | **none** | Gap reported only. |

---

## Gap (no fix applied)

`lookupHistoricalDecisionAtClock` / `answerHistoricalDecisionTimeTravel` for HISTORICAL **rebuilds PIT from fixture bars** and records, rather than answering from the ring-only when an exact clock was never recorded. LIVE lane already ring-only. If product intent is “recorded-only” for clock questions, HISTORICAL at_time should check the ring first and return the no-decision wording when missing — **not done here** (prefer report).

Also: no NL parse for “last recorded decision”; “immediately before HH:MM” collapses to `at_time`.

---

## Overall

| | |
|--|--|
| Q1 | **PASS** (recorded: none at 09:30) |
| Q2 | **PASS** (last = 10:20 flat/WAIT) |
| Q3 | **PASS** (none before 09:30) |
| Q4 | **PASS** (cannot compare without 09:30; compare path OK on 09:31→10:20) |
| Code change | **none** |
| **Overall** | **PASS** (recorded-retrieval exercise) with **documented NL API gap** (PIT manufacture at 09:30) |

In-process probes used existing helpers only; disposable scripts were not kept.
