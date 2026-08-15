# DEV overcaution candidates (vs frozen baseline-v2)

**EDGE_CLAIM:** NONE
**HOLDOUT:** PROTECTED
**BASELINE_FROZEN_ID:** baseline-v2
**TIME:** 2026-08-15T20:40:12.230Z
**Planned identical asOfs:** 1500

## Candidates (one change each)

| ID | WAIT | NO_TRADE | ACT | L/S | WAIT→ACT | ACT→WAIT | T-before | mean proxyR | Promising? |
|----|-----:|---------:|----:|----:|---------:|---------:|---------:|------------:|:-----------|
| none | 1188 | 239 | 73 | 41/32 | — | — | 21.4% | -0.330 | baseline |
| c1_wait_entry_actionable | 114 | 239 | 1147 | 560/587 | 1074 | 0 | 58.1% | 0.314 | YES |
| c2_min_reasons_1 | 1404 | 50 | 46 | 25/21 | 0 | 30 | 30.4% | -0.303 | no |
| c3_widen_entry_band | 1188 | 239 | 73 | 41/32 | 0 | 0 | 21.4% | -0.330 | no |

## Notes

- **c1_wait_entry_actionable:** One change: entryStatus WAIT no longer blocks directional LONG/SHORT (EXTENDED still waits). WAITΔ=-1074 ACTΔ=1074 T-before 21.4%→58.1% proxyR -0.330→0.314
- **c2_min_reasons_1:** One change: long/short supported when reasons.length >= 1 (was >= 2). WAITΔ=216 ACTΔ=-27 T-before 21.4%→30.4% proxyR -0.330→-0.303 — not meeting DEV winner bar
- **c3_widen_entry_band:** One change: MAX_ENTRY_FROM_PRICE 28 → 42 (wider reachable entry zone). WAITΔ=0 ACTΔ=0 T-before 21.4%→21.4% proxyR -0.330→-0.330 — not meeting DEV winner bar

## VAL

Ran one VAL test for **c1_wait_entry_actionable** (VALIDATION 2025-06-01→2025-12-31, Y=500 even@cadence10).

| ID | WAIT | ACT | T-before | mean proxyR |
|----|-----:|----:|---------:|------------:|
| none | 359 | 74 | 32.5% | -0.561 |
| c1_wait_entry_actionable | 41 | 392 | 50.2% | -1.053 |

**VAL structural lift:** WAITΔ=−318 · ACTΔ=+318 · T-before 32.5%→50.2% (heuristic gate used for “pass”).

**VAL quality caveat:** mean proxyR **worsened** (−0.561 → −1.053). Structural overcaution relief is real; expectancy/proxy quality is **not** improved. Treat as process candidate only — **not** production promotion, **not** edge.

If a stricter quality gate were applied (proxyR must not degrade), this would be **VAL FAIL → back to DEV**.

## Production / freeze

- Semantic invent-path: **baseline-v2 FROZEN** (unchanged)
- Experiment ALS default remains **`none`** — c1 not shipped to production
- v3/v4 invent-path candidates remain **not promoted**

## EDGE_CLAIM

NONE

## HOLDOUT

PROTECTED — not accessed
