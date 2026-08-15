# KAREN — Red-Team Bugfixes Report (E mutability + B last decision)

**Date:** 2026-08-15  
**Clean tree:** `.tmp/karen-six-feature-clean/`  
**Scope:** Fix ONLY BUG 1 (L1 DecisionEnvelope mutability) and BUG 2 (LIVE last-decision query)  
**Operator constraints honored:** no primary product edits, no git add/commit/push/deploy/apply-patch, no continuous recorder, no `verdict-engine.ts`, no unrelated features

---

## BUG 1 MUTABILITY: **PASS**

**Repro:** `npx tsx scripts/red-team-E-mutability-repro.ts` → exit 0, `ALL PASS`

| Assertion | Result |
|-----------|--------|
| caller mutation cannot change L1 | PASS (`whyNow=FROZEN_WHY_NOW_TOKEN`, `stance=wait`) |
| retrieved mutation cannot change L1 | PASS |
| Redis hydrate intact | PASS (`decisionKey=FROZEN-KEY`) |

**Fix (clean tree only):** `lib/decision-envelope-history.ts`
1. Deep-clone `DecisionEnvelope` (+ `marketState`) via `structuredClone` **before** L1 store in `recordDecisionEnvelopeHistory`
2. Deep-clone on public lookups: `getDecisionEnvelopeHistory` maps `cloneHistoryEntry`; `record` / dedup returns return clones; `findDecisionAtOrBefore` / `latestDecisionEnvelope` / `findDecisionStrictlyBefore` return clones from that path
3. Nested thesis / invalidation / levels / metadata / arrays protected by deep clone (not `Object.freeze`)
4. Schema unchanged; Redis still `JSON.stringify`s the stored clone at record time (immutability contract preserved)

---

## BUG 2 LAST DECISION: **PASS**

**Repro:** `npx tsx scripts/red-team-B-last-decision-repro.ts` → exit 0, `ALL PASS`

| Assertion | Result |
|-----------|--------|
| parse `What was your last decision?` → `last_recorded` | PASS |
| parse `What was your last recorded decision?` → `last_recorded` | PASS |
| parse `your last recorded decision` → `last_recorded` | PASS |
| LIVE latest returned (`responseSource=live_decision_last_recorded`, `LAST_TAG`) | PASS |
| empty LIVE → honest miss | PASS |
| historical fixtures isolated from LIVE | PASS |
| historical `last_recorded` still works | PASS |
| no PIT reconstruction | PASS |

**Fix (clean tree only):**
- `lib/decision-history-query.ts` — match natural “last / last recorded decision” phrases → `kind=last_recorded`
- `lib/decision-time-travel.ts` — `answerLiveDecisionHistoryQuery` branch for `last_recorded` using `latestDecisionEnvelope("LIVE")` only (no PIT, no LLM)

---

## REGRESSION TESTS

| # | Script | Result | Counts |
|---|--------|--------|--------|
| 1 | `red-team-E-mutability-repro.ts` | **PASS** | 3/3 asserts |
| 2 | `red-team-B-last-decision-repro.ts` | **PASS** | 12/12 asserts |
| 3 | `test-decision-memory-adapter.ts` | **PASS** | 49 passed, 0 failed |
| 4 | `test-decision-history-time-travel.ts` | **PASS** | 127 passed, 0 failed |
| 5 | `verify-feature2-qg-envelope-dedupe.ts` | **PASS** | 24 passed, 0 failed |
| 6 | `verify-feature3-instant-read.ts` | **PASS** | 20 passed, 0 failed |
| 7 | `verify-feature4-session-boundary.ts` | **PASS** | 13 passed, 0 failed |
| 8 | `verify-feature5-historical-why-now.ts` | **PASS** | 27 passed, 0 failed |
| 9 | `verify-feature6-wait-routing.ts` | **PASS** | 25 passed, 0 failed |

**REGRESSION TESTS: 9 PASS / 0 FAIL** (scripts 1–9)

---

## TYPECHECK: **FAIL**

`npx tsc --noEmit` exit 2 — **pre-existing / unrelated** to these two bugfixes:

```
lib/observation-facts.ts(279,72): error TS2339: Property 'side' does not exist...
lib/observation-facts.ts(282,21): error TS2339: Property 'status' does not exist...
lib/observation-facts.ts(282,37): error TS2339: Property 'status' does not exist...
lib/observation-facts.ts(283,29): error TS2339: Property 'status' does not exist...
lib/observation-facts.ts(295,18): error TS2339: Property 'id' does not exist...
```

No diagnostics on `decision-envelope-history.ts`, `decision-history-query.ts`, or `decision-time-travel.ts`.  
**Not fixed** (out of scope per absolute rules). Documented here and stopped.

---

## FORBIDDEN IMPORTS: **PASS**

Scan of product paths (`lib/`, `app/`, …) for:
`continuous-decision-recorder`, `decision-memory-material`, `withManualAnalysePriority`, `live-latency-profile`, `market-data-errors`  
→ **ZERO hits**

---

## PATCH SCOPE: **UNCHANGED**

Touched only:
- `lib/decision-envelope-history.ts` (immutability)
- `lib/decision-history-query.ts` (last-decision parse)
- `lib/decision-time-travel.ts` (LIVE last_recorded answer)
- `scripts/red-team-E-mutability-repro.ts` / `scripts/red-team-B-last-decision-repro.ts` (assertions)

Did not touch chat-engine wait wire / F6 paths. Did not re-add `conversational-intent.ts`.

---

## SHIP STATUS: **CONDITIONAL HOLD**

Both verified red-team bugs are fixed with executable evidence and full listed regression suite green.  
Hold reason: clean-tree `tsc --noEmit` still fails on unrelated `lib/observation-facts.ts` liquidity typing (5 errors). Resolve that separately before calling the six-feature clean tree fully ship-ready.

---

## Confirm

| Gate | Value |
|------|-------|
| Primary WT product code changed | **NO** (report only under `data/research/`) |
| Patch applied | **NO** |
| Commit | **NO** |
| Push | **NO** |
| Deploy | **NO** |
| Recorder shipped | **NO** |
