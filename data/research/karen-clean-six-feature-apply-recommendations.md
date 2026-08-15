# Overnight — Clean six-feature patch: apply recommendations (NO APPLY)

**Date:** 2026-08-15 (updated overnight)  
**Mode:** RESEARCH ONLY — do **not** apply `.tmp/karen-six-feature-clean.patch` to primary WT without Adam approval  
**Sources:** build report, patch review, shipset prep, overnight regression + clean-tree verify

## HUMAN ACTION REQUIRED

| Item | Status |
|------|--------|
| Apply clean six-feature patch to primary WT | **BLOCKED — needs explicit approval** |
| Redis local credentials / real Redis integration | **BLOCKED — use mock tests only** |
| Live warm HIT completion_tokens A/B | **BLOCKED — CME closed** |
| Ship continuous decision recorder | **FORBIDDEN overnight** |
| Wire vs drop orphaned `conversational-intent.ts` | **DROPPED overnight from clean** (see `overnight-clean-drop-conversational-intent.md`) |
| Chart-doing vs market-doing scoped product | **Separate decision** (`overnight-scoped-chart-qa-preexisting-fail.md`) |

## Overnight update — clean tree now verdable

| Check | Result |
|-------|--------|
| Feature 2 verify (QG envelope dedupe) | **24/24 PASS** |
| Feature 3 verify (instant-read) | **20/20 PASS** |
| Feature 4 verify (session-boundary) | **13/13 PASS** |
| Feature 5 verify (historical whyNow) | **27/27 PASS** |
| Feature 6 verify (wait routing) | **11/11 PASS** (orphan **dropped**) |
| Full soft-import harnesses | QG 34 · instant 49 · time-travel 122+ · past-tense 22 · adapter 49 |

Clean-tree product fixes applied overnight (**.tmp only**):

1. `tryInstantReadFromQualityGate` — `historicalFixture` short-circuit (parity dirty WT)
2. `formatQualityGateForPrompt` — restored envelope-copy / mentor-vs-trade / unlabeled-stance lines
3. **Dropped** unused `lib/conversational-intent.ts` from shipset

## Patches regenerated (not applied)

| File | Scope |
|------|--------|
| `.tmp/karen-six-feature-clean.patch` | Product-only (**18 paths**, no conversational-intent) — QG + historicalFixture + orphan drop |
| `.tmp/karen-six-feature-clean-with-harness.patch` | May lag; regenerate before apply if harness companion needed |

## Pre-apply gate (checklist)

1. Accept shipping **session-liquidity + mtf-horizons** into DecisionEnvelope (stance/conflict/horizon copy).  
2. ~~Decide: **wire or drop** orphaned `conversational-intent.ts`~~ — **DROPPED** from clean shipset overnight (F6 asserts absence). Dirty WT routing stays separate.  
3. ~~Restore clean-tree harnesses~~ — **DONE overnight** (soft-import / skip §7).  
4. Confirm feature 6 shipset includes dirty `tryDeterministicMentorFollowUp` carve **or** accept mentor-intent + casual regex only.  
5. Re-run after apply on primary: adapter, time-travel, instant-read, wait-followup, QG dedupe, intent-routing, conversation-routing, routing golden.

### Safer sequence

1. Review regenerated product patch + optional harness companion.  
2. Optional: trim unused session-liquidity formatters.  
3. Apply on approval only.  
4. Run regression gate.  
5. Separate PR for dirty-WT latency instrumentation (`completion_tokens`) if not in six-feature carve.

## Dirty WT green (overnight, relevant)

| Suite | Result |
|-------|--------|
| decision-history-time-travel | **135/135** |
| decision-memory-adapter | 49/49 |
| karen-intent-routing | **172/172** |
| karen-instant-read-llm-skip | 51/51 |
| karen-wait-followup | **142/142** |
| quality-gate-envelope-dedupe | 41/41 |
| conversation-routing | **61/61** |
| routing golden | **112/112** |
| karen-why-not-integrity | **40/40** |
| observation-proof | **3/3** |
| structure-snapshot | **124** |
| test:desk | **11/11** |
| live-replay-parity | **72/72** |
| voice-bottleneck | **57/57** |
| live-context-reuse | **49/49** |
| market-state-truth | **100/100** |
| conversation-chains | **42/42** |

**Also overnight on dirty WT (not in six-feature carve):** `structureFacts.fhdr`, chart-proof OHLC fixtures, completion_tokens instrumentation, structure location routing expand through wave 3 (AMD/eq/asia/premium/range/week/unfilled/turtle…).

## Stop

No patch apply. No commit/push/deploy.
