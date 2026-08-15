# KAREN — Recorded decision vs PIT analysis vs hindsight

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no trading-logic / tick-engine changes, no commit/push/deploy  
**Question:** Are these three ask-types treated as different paths?

| ID | User question | Required behavior |
|----|---------------|-------------------|
| **A** | “What was your recorded decision at 09:30?” | Retrieve the **actual recorded** `DecisionEnvelope` |
| **B** | “Knowing only what was available at 09:30, what would your analysis have been?” | Historical **point-in-time (PIT)** analysis — **no** future information |
| **C** | “Knowing what happened afterward, would you have changed that decision?” | Explicit **hindsight** label; must **never** rewrite A |

---

## PATH A EXISTS:

**PARTIAL — lane-dependent.**

| Lane | Exists? | Mechanism |
|------|---------|-----------|
| **LIVE** | **YES** | `answerLiveDecisionHistoryQuery` → `lookupLiveAtClock` / `findDecisionAtOrBefore("LIVE", …)` reads the process-local LIVE ring in `lib/decision-envelope-history.ts`. Does **not** re-run the pipeline. Empty ring → deterministic `NO DECISION AVAILABLE` / `live_decision_missing`. |
| **HISTORICAL** | **NO as pure retrieve** | `lookupHistoricalDecisionAtClock` always **re-builds** via `ReplayDataCutoff` → `buildKarenReplayResponse` → `runDeskPipeline`, then optionally `recordDecisionEnvelopeHistory(..., force: true)`. It does **not** prefer an already-stored HISTORICAL entry at that clock. |

**Ask language for A** is supported: `What was your decision at 09:31?`, `…10 minutes ago`, etc. (`parseDecisionHistoryQuery` kind `at_time` / `minutes_ago`). There is **no** distinct phrasing for “recorded” vs “would have analyzed.”

**Caveat (API metadata):** In `answerHistoricalFixtureTurn`, time-travel **reply text** comes from the traveled snapshot, but returned `envelope` / `decisionKey` are taken from the **session tip** (`buildHistoricalFixtureIntelligence(req)`), not necessarily the at-time envelope. Clients that trust `envelope` over `reply` can mis-attribute the tip decision as the past one.

---

## PATH B EXISTS:

**YES as capability; NO as a separate route from A.**

- **Capability:** HISTORICAL time-travel / fixture builds are PIT: `ReplayDataCutoff(asOf)` + `assertNoFutureLeak()` + sliced bars ≤ T, then full pipeline → `DecisionEnvelope`. Documented in `karen-decision-history-what-changed.md` / `karen-decision-history-time-travel.md`.
- **Routing:** Same query kinds as A (`at_time`, `minutes_ago`). Example B wording (“knowing only what was available at 09:30…”) still matches `at_time` whenever a clock + `\bat\b` (or decision words) appear — **not** a dedicated intent.
- **LIVE gap:** On LIVE, “what would your analysis have been at 09:30 with only then-available data?” is answered by **store retrieve (A)**, not a fresh PIT rebuild of then-available market data. So B-intent on LIVE is **not** implemented.
- **HISTORICAL:** “What was your decision at T?” is effectively **B (re-run)**, not A (retrieve prior recording). Re-run results may then be force-recorded into the HISTORICAL ring (append/dedupe), which is post-hoc storage of a rebuild, not “the original recorded call.”

Research-only note: architecture outcomes mark WAIT **counterfactual** excursion labels (`lib/research/architecture/outcomes.ts`) as post-T scoring — that is **not** chat Path B/C.

---

## PATH C EXISTS:

**NO as a mentor/chat path.**

- No query kind, mentor intent, or prompt contract for “knowing what happened afterward / would you have changed.”
- `lib/chat-prompt.ts` has **no** hindsight / counterfactual / recorded-vs-reanalysis language.
- Closest existing behavior is **dual-PIT compare** (`since` / `between` / `why_changed` / `what_changed`): two independent cutoffs or two LIVE ring entries, labeled LIVE or HISTORICAL, sections for market / interpretation / decision change. That is **chronological compare of two past states**, not “use future outcomes to critique T.”
- Research mentor eval has `no_hindsight` / `hindsight_leakage` **against** citing post-cutoff candles — opposite of offering labeled C.
- Architecture `counterfactual: true` on WAIT outcomes is offline labeling, not a chat rewrite of A.

**Unlabeled risk:** Phrases like “knowing what happened afterward, would you have changed…?” typically **miss** `isDecisionHistoryTimeQuery` (no clock / change parser hit) and fall through to normal LLM / trading stream with **current** context — implicit hindsight **without** an explicit C label, and without mutating the history store.

---

## ROUTING SEPARATION:

| Concern | Current state |
|---------|----------------|
| A vs B | **Not separated.** One parser (`lib/decision-history-query.ts`); kinds do not encode recorded vs PIT-reanalyze. LIVE implements A; HISTORICAL implements B-shaped rebuild under A wording. |
| Compare vs A/B | **Partially separated** — kinds `since` / `between` / `why_changed` / `what_changed` vs `at_time` / `minutes_ago`. Still not Path C. |
| LIVE vs HISTORICAL lanes | **Separated** — banners + rings never mix; stream wires LIVE in `app/api/chat/stream/route.ts`, HISTORICAL in `historical-ui.ts`. |
| Mentor intent | Clock / what-changed often classified as `CHANGE_ANALYSIS` or decision-at-time helpers in `mentor-intent.ts`; stream short-circuits history queries **before** full chart read when matched. No `HINDSIGHT` / `COUNTERFACTUAL` / `RECORDED_ONLY` intent. |
| C vs A | **No C route** → cannot formally separate; store mutate-on-C is absent by lack of feature, not by guard. |

```
User clock/decision/what-changed ask
        │
        ├─ historicalFixture? ──► answerHistoricalDecisionTimeTravel
        │                         (rebuild PIT at clocks / compare)
        │
        └─ live ──► answerLiveDecisionHistoryQuery
                    (retrieve LIVE ring / compare entries)
```

---

## FUTURE-DATA LEAKAGE:

| Layer | Status | Notes |
|-------|--------|-------|
| HISTORICAL rebuild at T | **Guarded** | `assertNoFutureLeak` + slice checks in `lookupHistoricalDecisionAtClock`; truncated-fixture stance parity in tests. |
| LIVE retrieve at T | **Guarded vs future asOf** | `findDecisionAtOrBefore` skips `asOf > target`. Soft `maxSkewMs` can return an **older** entry than requested lookback (mislabel, not future leak). |
| Compare earlier/later | **Guarded** | Both sides independent PIT or ring entries; `compareDecisionSnapshots` refuses earlier.asOf > later.asOf. |
| LLM fallback (no history match) | **Leak risk** | C-like or B-like natural language without clock patterns can get **current** market context → unlabeled hindsight / non-PIT answer. |
| Session tip envelope on historical time-travel response | **Attribution risk** | Reply PIT-safe; structured `envelope` may still be tip-asOf. |
| Pre-agg HTF elsewhere | Out of scope but known | Live/replay parity audits note pre-aggregated HTF look-ahead; time-travel path uses cutoff builders. |

---

## RISK OF C REWRITING A:

**LOW for store mutation today; MEDIUM for user-facing confusion.**

- Compare / time-travel **do not** overwrite earlier ring entries by asOf. LIVE/HISTORICAL append with same-minute / same-barIndex dedupe that **returns the existing last entry** when hash/stance match — they do not patch an older id in place.
- HISTORICAL `force: true` **appends** a new rebuild at that bar (or returns last if fixtureId+barIndex+stateHash match) — can add a **second narrative** of “decision at T” that is a recompute, not a rewrite of a prior id, but **blurs A authenticity**.
- No C handler → C cannot rewrite A via a dedicated path.
- Confusion risk: user asks A, HISTORICAL answers with a **fresh B rebuild**; user asks C-like English, LLM may “revise” the past verbally while the ring stays intact.

---

## TESTS:

| Suite / artifact | Covers | Gap vs A/B/C |
|------------------|--------|----------------|
| `npm run test:decision-history-time-travel` | Parse at_time/since/between/why_changed; exact/nearest/missing; changed/unchanged; **future-leak refuse** + truncated independence; LIVE↔HISTORICAL isolation | Does **not** assert A≠B routing; no C; no “recorded” vs “would have analyzed” phrasing |
| `npm run test:karen-historical-ui` | Fixture isolation / banners | Same |
| Mentor eval `no_hindsight` | Cited candles ≤ cutoff | Not chat A/B/C separation |
| `data/research/karen-live-decision-history-integrity-audit.md` | Store→retrieve integrity, no future asOf into past answers | Frames A-like integrity; does not require A/B/C triad |

**No test** asserts: “C never mutates A,” “B does not claim recorded,” or distinct intents for the three questions.

---

## PASS/FAIL (separation):

**FAIL**

Paths are **not** separated as A / B / C:

1. **A and B are collapsed** into one decision-history surface; LIVE≈A, HISTORICAL≈B under the same wording.  
2. **C does not exist** as an explicit, labeled chat path.  
3. Natural-language B/C can miss the history short-circuit and get unlabeled current-context answers.

PIT **anti-leak** machinery for HISTORICAL rebuilds and LIVE ring retrieve is relatively strong; that is **integrity**, not **triad separation**.

---

## SAFE NEXT FIX: (document only)

1. **Add three explicit query/intent kinds** (names illustrative): `RECORDED_AT` (A), `PIT_ANALYSIS_AT` (B), `HINDSIGHT_REVIEW` (C). Parse “recorded / what did you decide” → A; “knowing only what was available / as of then / blind” → B; “knowing what happened after / with hindsight / would you have changed” → C.  
2. **Implement A as store-first:** LIVE already; HISTORICAL should `findDecisionAtOrBefore("HISTORICAL", T)` when an entry exists, and only rebuild if missing **and** caller asked B (or an explicit rebuild flag) — never silently treat rebuild as “recorded.”  
3. **Implement B as PIT re-run only**, always labeled (e.g. `PIT ANALYSIS — NOT A RECORDED DECISION`), never writing over an existing A entry’s id/content; optional append of a separately typed “analysis” artifact if persistence is needed.  
4. **Implement C as read-only critique:** inputs = immutable A envelope + post-T facts; output must carry an explicit **HINDSIGHT** banner; **forbid** `recordDecisionEnvelopeHistory` for the past asOf; never replace A.  
5. **Fix historical-ui response contract:** when time-travel answers, return the traveled snapshot’s `envelope` / `decisionKey` (or omit envelope) so tip state cannot masquerade as A.  
6. **Tests (before any prod wiring):** A phrasing ≠ B phrasing routing; B truncated vs full fixture parity; C cannot change ring entry at T; future bar poison still fails; unlabeled C-like strings either refuse or force HINDSIGHT label without store write.

**Do not implement until a follow-up task explicitly authorizes separation work.**

---

## Key files reviewed

- `lib/decision-history-query.ts` — kinds: at_time / since / between / why_changed / minutes_ago / what_changed  
- `lib/decision-time-travel.ts` — LIVE retrieve vs HISTORICAL rebuild + compare  
- `lib/decision-envelope-history.ts` — LIVE/HISTORICAL rings, findAtOrBefore, suppress, dedupe  
- `lib/research/replay/historical-ui.ts` — HISTORICAL UI turn + time-travel short-circuit  
- `app/api/chat/stream/route.ts` — LIVE history short-circuit  
- `lib/mentor-intent.ts` — CHANGE_ANALYSIS / isDecisionAtTimeQuestion (no C)  
- `scripts/test-decision-history-time-travel.ts` — PIT leak + isolation  
- Prior docs: `karen-decision-history-time-travel.md`, `karen-decision-history-what-changed.md`, `karen-live-decision-history-integrity-audit.md`

---

## Bottom line

**Separation of A / B / C is not in place.** LIVE clock asks ≈ recorded retrieve (A). HISTORICAL clock asks ≈ PIT re-analysis (B) under A wording. Hindsight-with-future (C) is absent; unlabeled LLM fallback is the main C-shaped risk. Future-bar leakage into HISTORICAL rebuilds is tested and refused; that does not constitute triad separation.
