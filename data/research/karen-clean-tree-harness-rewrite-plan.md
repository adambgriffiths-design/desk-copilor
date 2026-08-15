# Overnight — Clean-tree harness rewrite plan (research only)

**Date:** 2026-08-15  
**Mode:** PLAN ONLY — no patch apply; no clean-tree edits required tonight  
**Goal:** Make features 2–5 verifiable in `.tmp/karen-six-feature-clean` without pulling excluded modules

## Harness blockers (from patch review)

| Suite | Blocker | Proposed overnight-safe rewrite |
|-------|---------|----------------------------------|
| quality-gate-envelope-dedupe | `resetQualityGateCache` + optional historical-ui §7 | Stub `resetQualityGateCache` as no-op in harness; skip §7 historical fixture section under `CLEAN_SHIPSET=1` |
| karen-instant-read-llm-skip | live-latency-profile for timing JSON only | Guard timing block: if no `beginLiveLatency`, skip timing asserts; keep skip-correctness asserts |
| decision-history-time-travel | historical-ui session helpers | Inline `intelFromFixture` / clear via existing history clear APIs already used in §9 LIVE cases |
| karen-wait-followup | mentor-coaching + missing clean chat-engine wait helpers | Split: unit-test `mentor-intent` past-tense + `formatStructuredWaitFollowUp` only under clean flag |

## Acceptance for “clean tree green”

- Feature 1: adapter suite (already PASS)
- Features 2–5: at least one focused green run each after harness stubs
- Feature 6: mentor-intent past-tense unit cases without coaching

## Do not

- Add recorder / latency product libs to clean patch to make harnesses pass
- Apply patch to primary WT without approval

## Next after approval

1. Implement harness stubs in dirty WT scripts (env-gated)  
2. Copy/run in clean tree  
3. Then consider apply
