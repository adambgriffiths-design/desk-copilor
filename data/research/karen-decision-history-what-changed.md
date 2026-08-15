# KAREN — Decision history / what changed

**Date:** 2026-08-14  
**Mode:** HISTORICAL fixture PIT + LIVE DecisionEnvelope history ring  
**Label:** Outputs are always labeled **HISTORICAL** or **LIVE**  
**Verdict:** **PASS** (regression tests)

Authoritative path only: `buildKarenReplayResponse` → `runDeskPipeline` → `DecisionEnvelope`.  
Does **not** use `buildDeterministicKarenResponse` / legacy formatter. No new replay system.

---

## 1. How to ask (examples)

| Question | Behavior |
|----------|----------|
| `What was your decision at 09:31?` | DecisionEnvelope at that ET clock (exact bar), or nearest previous |
| `What was your decision at 08:31?` | Explicit **no decision available** if no bar at/before that clock |
| `What changed since 09:31?` | Compare earlier clock → session tip (historical) or latest LIVE |
| `Why did your decision change?` | Same three-section compare (optionally with `since HH:MM`) |
| `What was different between 09:31 and 10:20?` | Dual independent PIT cutoffs |

**UI / API**

- **Historical fixture UI:** send `historicalFixture: { fixtureId: "synthetic-ny-am", barIndex: 50 }` (or `true`) on `/api/chat/stream`. Clock questions are answered inside `answerHistoricalFixtureTurn`.
- **Live:** same questions hit the LIVE history ring when envelopes have been recorded from live pipeline reads. If the ring is empty, Karen says so (does not invent).

Clocks are interpreted as **America/New_York** session time against fixture bars (or LIVE `asOf`).

---

## 2. How history is stored / resolved

### Storage — `lib/decision-envelope-history.ts`

Two isolated rings (never mixed):

- `LIVE` — filled on successful `runDeskPipeline` when recording is **not** suppressed
- `HISTORICAL` — filled on historical fixture builds / time-travel lookups (`force: true`)

Each entry preserves:

- `asOf` timestamp  
- stance / verdict / confidence  
- full `DecisionEnvelope` (thesis, evidence via `layers.facts`, conflicts, invalidation)  
- optional `marketState` snapshot (price, bias, structure, displacement, fvg, verdict, stateHash)  
- optional `fixtureId` / `barIndex`  
- `decisionKey` is composed at answer time as `{fixtureId}@{barIndex}|{stance}|{verdict}|{asOf}`

Suppress helper: `withDecisionHistorySuppressed` / `withSuppressedDecisionHistoryRecord` — used while building historical PIT so LIVE is not polluted.

### Resolution — `lib/decision-time-travel.ts`

- Parse clocks / between / why-changed via `lib/decision-history-query.ts`
- **HISTORICAL:** find m1 bar at or before requested ET clock → `ReplayDataCutoff(asOf)` → `assertNoFutureLeak` → `buildKarenReplayResponse` **only at that asOf**
- **Compare:** two independent cutoffs; earlier must not see bars after its `asOf`
- Never reconstructs a missing earlier decision from later data

### Wiring

- `lib/research/replay/historical-ui.ts` — records HISTORICAL; routes clock/compare questions through time-travel
- `lib/desk-pipeline.ts` — records LIVE (skipped when suppressed)
- `app/api/chat/stream/route.ts` — LIVE clock/compare answered from LIVE ring only

---

## 3. LIVE vs HISTORICAL isolation proof

| Check | Result |
|-------|--------|
| Historical build leaves live intel cache unchanged | PASS (`test:karen-historical-ui` + time-travel §7) |
| Historical build restores `lastPipeline` | PASS |
| Historical build does not write LIVE ring | PASS (LIVE empty after fixture build) |
| LIVE record does not alter HISTORICAL lane tags | PASS |
| Historical answers carry HISTORICAL banner, never LIVE banner | PASS |
| Suppress during PIT build prevents LIVE auto-record | PASS (by design + tests) |

---

## 4. Compare section format

Every compare reply includes:

```
1. WHAT CHANGED IN MARKET STATE
2. WHAT CHANGED IN INTERPRETATION
3. WHAT CHANGED IN DECISION
```

Plus THEN / NOW spoken envelopes. Flag: `DECISION CHANGED: YES|NO`.  
Single-time answers include an explicit **DECISION TIMESTAMP / AS-OF** line.

---

## 5. Tests + PASS/FAIL

```bash
npm run test:decision-history-time-travel
npm run test:karen-historical-ui
```

| Suite | Result |
|-------|--------|
| `test:decision-history-time-travel` (synthetic-ny-am, in-process) | **58 passed, 0 failed** |
| `test:karen-historical-ui` (isolation regression) | **31 passed, 0 failed** |

Covered cases:

- exact timestamp  
- nearest previous decision  
- no decision available  
- decision changed  
- decision unchanged (stance)  
- future-data leakage (`assertNoFutureLeak` + truncated-dataset independence)  
- LIVE vs HISTORICAL isolation  

---

## 6. Limitations

- Clock times are **session ET**, not arbitrary timezones; fixture day is implied by the loaded fixture.
- LIVE history only exists after successful live pipeline reads in this process; cold starts have an empty LIVE ring.
- “Nearest previous” is bar-at-or-before, not a separate decision event stream.
- Thesis text can differ slightly even when stance is unchanged; “unchanged” checks focus on stance/decision-section deltas.
- No tick engine / no large replay / trading logic and DecisionEnvelope semantics unchanged.
- Process-local rings (not persisted across server restarts).

---

## Files touched (summary)

| File | Role |
|------|------|
| `lib/decision-envelope-history.ts` | LIVE/HISTORICAL ring |
| `lib/decision-history-query.ts` | Clock / between / why-changed parse |
| `lib/decision-time-travel.ts` | PIT lookup + three-section compare |
| `lib/research/replay/historical-ui.ts` | Record HISTORICAL; route questions |
| `lib/desk-pipeline.ts` | Record LIVE when not suppressed |
| `lib/mentor-intent.ts` | CHANGE_ANALYSIS / lookback helpers |
| `app/api/chat/stream/route.ts` | LIVE history answers |
| `scripts/test-decision-history-time-travel.ts` | Regression |
| `package.json` | `test:decision-history-time-travel` |
