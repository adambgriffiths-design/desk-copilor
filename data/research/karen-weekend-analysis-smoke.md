# KAREN — Weekend analysis smoke test

**Date:** 2026-08-14  
**Mode:** SMOKE — existing `research:replay` + in-process DecisionEnvelope / wait-followup / intent routing  
**Label:** **HISTORICAL / FIXTURE — NOT LIVE MARKET DATA**  
**Verdict:** **PASS**

No new harness. No tick-current / trading / ICT / envelope / PIT changes. No commit / push / deploy. One small fixture only.

---

## Fixture

| Item | Value |
|------|--------|
| Requested | `synthetic-mn-am` (typo) → used **`synthetic-ny-am`** per `karen-weekend-offmarket-test-audit.md` |
| Path | `data/replay-fixtures/synthetic-ny-am.json` |
| Bars | 120 × 1m (m5/m15/daily present) |
| Index | **50** (decision-rich: pipeline WAIT / envelope **flat**; HTF+primary both bearish) |
| Symbol | `MNQ=F` |
| As-of | `2026-08-12T14:20:00.000Z` |
| Price at cutoff | ~25006.9 |
| Structure | Bias bearish \| MSS none \| FVGs 0 \| PD premium |

CLI snapshot: `data/research/runs/replay-2026-08-14T22-12-34-388Z/snapshot.json`  
(`npm run research:replay -- --fixture synthetic-ny-am --index 50` — CLI uses deterministic Karen formatter; envelope checks below use existing `buildKarenReplayResponse` → `runDeskPipeline` on the **same** fixture cutoff.)

---

## Checks 1–9 — DecisionEnvelope (FIXTURE)

| # | Field | Result | Detail |
|---|--------|--------|--------|
| 1 | **stance** | PASS | `flat` (pipeline verdict `WAIT`) |
| 2 | **thesis** | PASS | `complete=true`; what=`bearish structure continuation` |
| 3 | **evidence vs interpretation** | PASS | `layers.facts` ≠ `layers.interpretation` (165 vs 399 chars) |
| 4 | **detected vs used** | PASS | Playbook chain present; e.g. `premium_discount` PRIMARY used; `htf_bias` detected/unused NONE; `session_liquidity` PRIMARY |
| 5 | **conflictLog** | PASS | `disagree=false`; HTF bearish agrees with primary bearish; stance flat |
| 6 | **invalidation** | PASS | Condition present (`validateDecisionEnvelope` accepts) |
| 7 | **validateDecisionEnvelope** | PASS | **0 errors** |
| 8 | **mentor matches envelope** | PASS | `formatMentorTradeSpoken` reflects stance=`flat` |
| 9 | **mentor coaching same envelope** | PASS | `answerMentorCoaching("Why?")` → WAIT_EXPLANATION on same flat/WAIT decision |

Envelope summary (FIXTURE):

- stance `flat` / confidence `medium` / primaryLean `bearish` / htfLean `bearish`
- citedConcepts: `premium_discount`, `session_liquidity`
- conflict: no HTF↔tactical disagreement; stay flat (WAIT) despite bearish lean (no clean trigger)

---

## Checks 10–11 — Follow-ups (same decision, offline)

In-process `tryDeterministicMentorFollowUp` + structured formatters on the **fixture** envelope (seeded intel cache; **no Yahoo / Tickstream**).

| Question | Intent | Deterministic | Same decision | Invented live state | Result |
|----------|--------|---------------|---------------|---------------------|--------|
| Why? | WAIT_EXPLANATION | yes | yes (PREVIOUS DECISION / FLAT) | no | PASS |
| why not long? | EXPLAIN_PREVIOUS_MARKET_READ | yes | yes (WHY NOT LONG + CURRENT STANCE: FLAT) | no | PASS |
| why not short? | EXPLAIN_PREVIOUS_MARKET_READ | yes | yes (WHY NOT SHORT + CURRENT STANCE: FLAT) | no | PASS |
| What are you waiting for? | WAIT_EXPLANATION | yes | yes (WAITING FOR / prior call) | no | PASS |

Supporting offline suite: `npm run test:karen-wait-followup` → **134 passed, 0 failed** (FIXTURE / REPLAY_FIXTURES).

---

## Check 12 — General questions off market pipeline

| Question | Conversational intent | Mentor | Off market? | Result |
|----------|----------------------|--------|-------------|--------|
| what's the capital of germany? | GENERAL_KNOWLEDGE | GENERAL_CHAT | yes | PASS |
| tell me a joke | GENERAL_CHAT | GENERAL_CHAT | yes | PASS |
| what is 2+2? | GENERAL_KNOWLEDGE | GENERAL_CHAT | yes | PASS |

Supporting: `npm run test:karen-intent-routing` → **135 passed, 0 failed**.

---

## Performance (HISTORICAL / FIXTURE CPU — not live TTFT)

| Stage | ms |
|-------|-----|
| Fixture load | **0.82** |
| Market context (`buildContext` at cutoff) | **3725.98** |
| Karen replay response (`buildKarenReplayResponse` / desk pipeline) | **111.37** |
| DecisionEnvelope attach (already on pipeline contract) | **0.01** |
| LLM | **0** (deterministic offline; no OpenAI) |
| **Total (load→envelope)** | **~3838** |
| Follow-ups (4 questions, in-process) | **84.33** |

Cold first context build dominates; no live market_data / LLM first-token measured (weekend-safe).

---

## Notes

1. User `synthetic-mn-am` → **`synthetic-ny-am`** (only matching fixture on disk).  
2. CLI `research:replay` prints deterministic Karen (`SHORT`); envelope truth for this smoke is pipeline **WAIT / flat** via `buildKarenReplayResponse` — same bars, labeled FIXTURE.  
3. Index 50 kept (wait/flat + follow-up rich); no larger backtest.

---

## Final

**PASS** — HISTORICAL / FIXTURE weekend analysis smoke complete. STOP.
