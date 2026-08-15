# Day Supervisor — KAREN Edge Validation Progress

**TREE:** `.tmp/karen-final-integration/`
**MODE:** MEASUREMENT / VALIDATION only
**EDGE_CLAIM:** NONE
**HOLDOUT:** PROTECTED / SEALED

---

## TIME
2026-08-15T20:40:12Z

## CURRENT_TASK
Semantic baseline frozen · DEV overcaution candidates Y=1500 published · VAL once for c1 (quality caveat).

## STATUS
**BASELINE_FROZEN_ID=`baseline-v2`.** Invent-path v3/v4 documented not promoted. DEV candidates c1/c2/c3 measured on identical Y=1500. c1 structural winner; VAL structural lift but proxyR worsened → **back to DEV** (not production). Experiment ALS default remains `none`. HOLDOUT PROTECTED. EDGE_CLAIM NONE.

## DATASET_PROGRESS
- Carve v1 DEV 2023-10-02 → 2025-05-31 (X=429)
- Dense DEV candidates: Y=1500 identical asOfs · baseline Z=73 (paired)
- VAL once (c1): Y=500 · holdout not touched

## EVALUATION_POINTS
- Dense DEV even: **1500** @ cadence 10 (identical across candidates)

## ACTIONABLE_DECISIONS (paired DEV)
| ID | WAIT | ACT | T-before | mean proxyR |
|----|-----:|----:|---------:|------------:|
| none (frozen) | 1188 | 73 | 21.4% | −0.330 |
| c1_wait_entry_actionable | 114 | 1147 | 58.1% | 0.314 |
| c2_min_reasons_1 | 1404 | 46 | 30.4% | −0.303 |
| c3_widen_entry_band | 1188 | 73 | 21.4% | −0.330 |

## VAL (c1 only — one test)
- Structural: WAIT 359→41 · ACT 74→392 · T-before 32.5%→50.2%
- Quality caveat: mean proxyR **−0.561 → −1.053** (worse) → treat as **VAL quality fail → back to DEV**
- ACT rate on DEV ~76% would fail frequency/spam gate for PROMOTE

## PIT_VIOLATIONS
0

## BASELINES
**BASELINE_FROZEN_ID = baseline-v2** · v3/v4 CANDIDATE not promoted · experiment ALS default `none`

## NEXT_TASK
Softer DEV variants of entry-wait restraint (not binary c1) — or Adam review. **Holdout stays PROTECTED.** No production flip.

## QUEUE_LOCK (2026-08-15)
Docs-only: ONE bottleneck = WAIT quality / `c4_shadow_quality_gated_wait`; five suspects queued — see `karen-research-queue-one-bottleneck.md`. No parallel experiments launched.

## EDGE_CLAIM
NONE

## HOLDOUT
PROTECTED
