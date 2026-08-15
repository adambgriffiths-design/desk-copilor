# KAREN — Recorded-decision vs PIT-reconstruction fix

**Date:** 2026-08-15  
**Mode:** smallest safe fix — no trading/ICT/envelope semantics, no new DB/replay/tick/perf, no commit/push/deploy  

## Gap (before)

| Path | Behavior |
|------|----------|
| Ring helpers | Honest miss when no entry at clock (e.g. 09:30) |
| NL `answerHistoricalDecisionTimeTravel("What was your decision at 09:30?")` | **PIT-rebuilt** fixture bar 0 and invented a stance/status even when HISTORICAL ring had no 09:30 record |

Rule violated: “What was your decision at HH:MM?” must mean **recorded DecisionEnvelope only**, not “what would Karen have decided…”.

## After

| Ask | Behavior |
|-----|----------|
| `What was your decision at HH:MM?` | HISTORICAL **ring exact EST clock** only via `lookupRecordedHistoricalAtClock` |
| Recorded hit | Exact stored envelope / status / decisionKey (`fromStore: true`) |
| Miss | `No decision was recorded at HH:MM.` — **no PIT rebuild** |
| `What was your last recorded decision?` | `latestDecisionEnvelope("HISTORICAL")` |
| `…immediately before HH:MM?` | `findDecisionStrictlyBefore` / `lookupRecordedHistoricalStrictlyBefore` |
| What-changed / between / since (NL) | Compares **recorded** ring snapshots only |
| LIVE | Unchanged — ring-only |
| `lookupHistoricalDecisionAtClock` | Still available for research/PIT + seeding the ring (not used by NL at_time) |
| Explicit “what would Karen have decided…” PIT intent | **Not created** |

## Code touchpoints

- `lib/decision-history-query.ts` — kinds `last_recorded`, `immediately_before`
- `lib/decision-envelope-history.ts` — `findDecisionStrictlyBefore`; persist helpers kept from partial prior work (`decisionKey` / `entryStatus`)
- `lib/decision-time-travel.ts` — recorded-only NL path; miss wording; between/since/what_changed use ring

## Exact before / after (09:30)

**Setup:** ring has recorded 09:31, 09:41, 10:20 — **no** 09:30 entry. Fixture **has** m1 bar at 09:30.

| | Before | After |
|--|--------|-------|
| NL at 09:30 | PIT rebuild → invented DECISION AT 09:30 (stance/status) | `No decision was recorded at 09:30.` |
| NL at 09:31 | Could rebuild (same as store if lucky) | Exact recorded 09:31 envelope/status |
| Later 09:41 recorded | Still could invent 09:30 via PIT | Still miss at 09:30 |
| Immediately before 09:30 | Collapsed to `at_time` 09:30 / PIT | Honest miss (nothing strictly before) |
| Last recorded | Parse `none` | Latest ring entry |
| Between 09:31–10:20 | PIT pair (also recorded as side effect) | Recorded↔recorded compare |

## TESTS

`npm run test:decision-history-time-travel` → **88 passed, 0 failed**

- Preserved prior suite (§0–7; was 58 asserts, still green with wording update for miss)
- Added §8 recorded-only vs PIT manufacture:
  - 09:31 → 09:31 decision
  - 09:30 no record → no-recorded-decision
  - later 09:41 does not manufacture 09:30
  - immediately before 09:30 ≠ at 09:30
  - last recorded → latest ring
  - what-changed compares recorded
  - future data cannot alter earlier recorded status
  - LIVE/HISTORICAL isolation

## STATUS PARITY / RETRIEVAL (narrow)

- **STATUS PARITY:** NL at_time returns frozen recorded `status` / stance when ring hit; never repaints via PIT.
- **HISTORICAL RETRIEVAL:** store-first exact clock; miss is explicit recorded-miss string.
- **WHAT-CHANGED:** NL compare uses recorded envelopes only.
- **FUTURE-DATA LEAKAGE:** later/future ring rows do not change earlier clock answers.
- **DECISIONKEY / ENTRYSTATUS:** persisted on ring write when provided (from earlier partial work); NL prefers stored `decisionKey`.
