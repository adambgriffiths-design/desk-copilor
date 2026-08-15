# KAREN — Live vs Historical Decision Status Parity Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes, no tick engine, no invented decisions, no commit/push/deploy  
**Question:** For “what was your decision at 9:30,” do LIVE and HISTORICAL return the same top-level status vocabulary (LONG / SHORT / WAIT) from the **recorded** `DecisionEnvelope` at that timestamp — not a recalculation that can repaint with later candles — and say “no recorded decision” when none exists?

**Regression checked:** `npm run test:decision-history-time-travel` → **58 passed, 0 failed**  
**Prior audits:** `karen-recorded-vs-counterfactual-vs-hindsight-audit.md` (A/B/C FAIL), `karen-live-decision-recording-path-audit.md`, `karen-live-decision-history-integrity-audit.md`, `karen-historical-decision-retrieval-test.md`

---

## STATUS VOCABULARY PARITY:

**Shared formatter, divergent sources.**

Both LIVE and HISTORICAL at-time replies go through the same `formatAtTimeReply` in `lib/decision-time-travel.ts`:

| Field | Source | Values |
|-------|--------|--------|
| `STANCE:` | `envelope.stance` | `long` / `short` / `flat` / `wait` / `monitor` (not the UI triad alone) |
| `VERDICT:` | `marketState.verdict` (pipeline) or entry `verdict` | typically `LONG` / `SHORT` / `WAIT` / `NO_TRADE` |
| Spoken line | `formatMentorTradeSpoken` → `stanceRoleLine` | e.g. `TRADE DECISION: LONG — …` / `FLAT — …` / `WAIT — …` / `MONITOR — …` |

`uiVerdictFromStance` (`lib/decision-contract-output.ts`) maps `long→LONG`, `short→SHORT`, `wait→WAIT`, `flat|monitor→NO_TRADE`, but **at-time mentor replies do not emit a single top-level LONG/SHORT/WAIT line** — they emit STANCE + VERDICT + TRADE DECISION role text.

**Parity of labels when a snapshot exists:** YES — same formatter / same field names.  
**Parity of meaning for “recorded status at T”:** NO — HISTORICAL snapshot is usually a fresh PIT rebuild, not the ring entry (see below).  
**Strict LONG/SHORT/WAIT-only top-level:** PARTIAL — WAIT-family also surfaces as `flat` / `monitor` / `NO_TRADE` / `WAIT` depending on field.

---

## LIVE PATH:

**PASS — store retrieve (Path A).**

```
isDecisionHistoryTimeQuery → answerLiveDecisionHistoryQuery
  → lookupLiveAtClock / findDecisionAtOrBefore("LIVE", …)
  → entryToSnapshot(stored DecisionEnvelopeHistoryEntry)
  → formatAtTimeReply(…, "LIVE")
```

| Check | Result |
|-------|--------|
| “at HH:MM” uses recorded envelope | **YES** — `lookupLiveAtClock` scans LIVE ring only; no pipeline re-run |
| Top-level status from record | **YES** — `entry.stance`, `entry.verdict` / `entry.envelope` |
| Empty ring | **YES** — `NO DECISION AVAILABLE` / `live_decision_missing`; does not invent |
| Wired from | `app/api/chat/stream/route.ts` when not historical |

Caveats (not status-vocabulary failures): process-local ring only; EST minute-of-day clock can bind prior calendar day; soft skew on minutes-ago can mislabel age (not future leak).

---

## HISTORICAL PATH:

**FAIL for recorded-status parity — PIT rebuild (Path B) under Path A wording.**

```
answerHistoricalDecisionTimeTravel → lookupHistoricalDecisionAtClock
  → findFixtureBarAtOrBeforeClock
  → ReplayDataCutoff + buildKarenReplayResponse / runDeskPipeline
  → snapshotFromPipeline
  → optional recordDecisionEnvelopeHistory(…, force: true)
  → formatAtTimeReply(…, "HISTORICAL")
```

| Check | Result |
|-------|--------|
| Prefers HISTORICAL ring when entry exists at T | **NO** — never calls `findDecisionAtOrBefore("HISTORICAL", …)` before rebuild |
| Returns recorded LONG/SHORT/WAIT from ring | **NO** when asking via NL time-travel — always recalculates |
| May force-append rebuild into ring | **YES** — `force: true` after rebuild (dedupe by fixtureId+barIndex+stateHash) |
| Wired from | `lib/research/replay/historical-ui.ts` |

Helpers (`getDecisionEnvelopeHistory` / `findDecisionAtOrBefore("HISTORICAL")`) **can** read the ring, but the **mentor NL at-time path does not use them** for HISTORICAL. Confirmed in `karen-historical-decision-retrieval-test.md`: ring-only probe correctly reports no 09:30 record; `answerHistoricalDecisionTimeTravel("… at 09:30")` still PIT-builds and answers `DECISION AT 09:30`.

---

## RECORDED VS RECALCULATED:

| Lane | “What was your decision at T?” | Source |
|------|--------------------------------|--------|
| LIVE | Recorded | Ring entry → `entryToSnapshot` |
| HISTORICAL | Recalculated | Fixture bars ≤ T → full pipeline → new envelope |

Same question language (`parseDecisionHistoryQuery` `at_time` / `minutes_ago`) → opposite semantics by lane. This matches the A/B collapse in `karen-recorded-vs-counterfactual-vs-hindsight-audit.md`.

**Repaint vs later candles (HISTORICAL rebuild):** Cutoff slices bars ≤ T and `assertNoFutureLeak` — rebuild does **not** ingest post-T candles. Repaint risk is **pipeline/code drift** and **treating a rebuild as “the recorded call”**, not candle look-ahead into the PIT slice.

**Repaint vs later LIVE decisions:** LIVE retrieve ignores `asOf > target`; later entries do not mutate earlier rows.

---

## NO-RECORD BEHAVIOR:

| Lane | Behavior when no recorded decision at T | Invents? |
|------|------------------------------------------|----------|
| LIVE | `NO DECISION AVAILABLE at {clock}` / ask-for-a-read first | **No** |
| HISTORICAL (NL) | If fixture has a bar at/before T → **rebuilds a decision** and may record it | **Yes** (as “decision at T,” not labeled PIT-only) |
| HISTORICAL (NL) | No bar at/before T → `NO DECISION AVAILABLE` / `historical_decision_missing` | **No** |
| HISTORICAL (ring helpers only) | Miss → no invention (retrieval test Q1) | **No** |

Required product line (“no recorded decision” / equivalent) is **met on LIVE** and on HISTORICAL **only when bars are missing**, not when a bar exists but no prior recording.

Exact string “no recorded decision” is **not** used; product uses **`NO DECISION AVAILABLE`**. That is an equivalent miss banner for LIVE; HISTORICAL miss wording is the same when no bars.

---

## FUTURE LEAK / REPAINT:

| Layer | Verdict | Notes |
|-------|---------|-------|
| HISTORICAL PIT at T | **PASS (anti-leak)** | `ReplayDataCutoff` + `assertNoFutureLeak`; suite §6 truncated stance parity |
| LIVE ring at T | **PASS (anti-leak)** | `findDecisionAtOrBefore` skips `asOf > target` |
| HISTORICAL as “recorded” | **FAIL (semantic)** | Rebuild is PIT-safe but not the stored original call |
| Later pipeline version | **Repaint risk** | Same clock asked later can yield a new envelope if code changed; ring-first would freeze the original |
| Session tip envelope on historical-ui | Attribution risk (prior A/B/C audit) | Reply may be traveled; structured tip envelope can disagree |

---

## Verify checklist (this audit)

| # | Requirement | Result |
|---|-------------|--------|
| 1 | LIVE “at 9:30” → stored envelope stance/verdict if recorded | **PASS** |
| 2 | HISTORICAL “at 9:30” → same top-level status from RECORD if exists; not fresh recalculation | **FAIL** |
| 3 | Empty → deterministic no-record; never invent | **PASS** LIVE; **FAIL** HISTORICAL NL when bars exist |
| 4 | No future-data leakage / no candle repaint into past | **PASS** for leak guards; semantic repaint via HISTORICAL rebuild remains |
| 5 | Status PARITY live vs historical labels for same recorded envelope | **FAIL** — HISTORICAL does not read the same recorded envelope; formatter labels would match **if** both used the ring |

---

## PASS/FAIL:

**FAIL**

Status **formatter** vocabulary is shared, but **status source parity is not**: LIVE returns recorded envelope status; HISTORICAL recalculates PIT status under the same “what was your decision at T” ask. HISTORICAL invents a decision whenever a fixture bar exists even if nothing was recorded at that clock. Not a missing LIVE capability — LIVE store→retrieve already works.

**No code change applied** (prefer audit-only; fix is more than a one-line wire and would change HISTORICAL PIT test expectations if empty also stops rebuilding).

---

## SAFE NEXT FIX: (if FAIL)

1. **Store-first HISTORICAL at_time (minimal unify):** In `lookupHistoricalDecisionAtClock` (or only in the recorded-ask branch of `answerHistoricalDecisionTimeTravel`), resolve fixture clock → `asOf`, then `findDecisionAtOrBefore("HISTORICAL", asOf, { fixtureId })`. If an entry exists, return `entryToSnapshot(entry, clock.raw)` and **do not** re-run the pipeline. LIVE already does the analogous ring path.
2. **Empty record:** If no HISTORICAL ring entry at/before T for a **recorded-decision** ask, return `NO DECISION AVAILABLE` / “no recorded decision” — **do not** PIT-rebuild under A wording. Keep PIT rebuild behind an explicit B intent (`PIT_ANALYSIS_AT` / “knowing only what was available…”) if counterfactual analysis remains desired.
3. **Optional top-level triad line:** Emit one canonical status from recorded fields, e.g. `STATUS: ${entry.verdict}` when verdict is LONG/SHORT/WAIT, else map via `uiVerdictFromStance(entry.stance)` — so both lanes speak the same LONG/SHORT/WAIT (or NO_TRADE) headline.
4. **Tests before wiring:** (a) pre-record HISTORICAL entry at T → at_time returns same stance/verdict/asOf without calling pipeline; (b) empty ring + bar at T → miss, not rebuild, for recorded-ask; (c) existing PIT leak suite remains for explicit B path; (d) LIVE↔HISTORICAL isolation unchanged.

**Do not implement until a follow-up explicitly authorizes the unify** (this audit stopped at documentation).

---

## Key files

- `lib/decision-time-travel.ts` — LIVE retrieve vs HISTORICAL rebuild; shared `formatAtTimeReply`
- `lib/decision-envelope-history.ts` — dual rings; `findDecisionAtOrBefore` unused by HISTORICAL NL at_time
- `lib/decision-contract-output.ts` — `stanceRoleLine`, `formatMentorTradeSpoken`, `uiVerdictFromStance`
- `lib/research/replay/historical-ui.ts` — HISTORICAL mentor short-circuit
- `app/api/chat/stream/route.ts` — LIVE history short-circuit
- `scripts/test-decision-history-time-travel.ts` — PIT leak + isolation (does not assert store-first HISTORICAL)

---

## Bottom line

**LIVE already returns recorded status at T. HISTORICAL still rebuilds PIT and can invent a status when no record exists.** Shared LONG/SHORT/WAIT-*ish* labels in the reply formatter do not equal status parity until HISTORICAL reads the ring first and refuses to invent on miss.
