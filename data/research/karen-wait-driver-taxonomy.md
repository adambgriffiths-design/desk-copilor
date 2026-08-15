# WAIT-driver PRIMARY / SECONDARY taxonomy

**TIME:** 2026-08-15T19:25:20.366Z
**TREE:** `.tmp/karen-final-integration/`
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED
**BASELINE:** baseline-v2 · days 2023-10-02, 2023-12-28, 2024-03-25, 2024-06-19, 2024-09-13, 2024-12-09, 2025-03-04, 2025-05-30 · cadence 15m

## Counts

| TOTAL | WAIT | ACTIONABLE | NO_TRADE | PIT |
|---:|---:|---:|---:|---:|
| 712 | 550 | 45 | 116 | 0 |

## PRIMARY (mutually exclusive)

| Primary | n | share of WAIT |
|---|---:|---:|
| BOTH_SIDES_CONFLICT | 57 | 10.4% |
| ENTRY_STATUS_FORCE_WAIT | 493 | 89.6% |
| QG_BLOCKED | 0 | 0.0% |
| OTHER_WAIT | 0 | 0.0% |

### Definitions

- **BOTH_SIDES_CONFLICT** — `longSupported && shortSupported` → WAIT (decision-layer conflict branch).
- **ENTRY_STATUS_FORCE_WAIT** — exactly one side supported, but `entryStatus` WAIT|EXTENDED forces WAIT instead of LONG/SHORT.
- **QG_BLOCKED** — `canDeliverVerdict=false`.
- **OTHER_WAIT** — residual (should be near-zero if taxonomy covers the layer).

## SECONDARY (co-present; top overall)

| Flag | n | % of WAIT |
|---|---:|---:|
| cited_premium_discount | 550 | 100.0% |
| cited_session_liquidity | 550 | 100.0% |
| mss_present | 501 | 91.1% |
| fvg_present | 456 | 82.9% |
| bias_bearish | 426 | 77.5% |
| displacement_present | 412 | 74.9% |
| cited_eqh | 350 | 63.6% |
| cited_eql | 350 | 63.6% |
| cited_fvg | 298 | 54.2% |
| entry_model_Displacement + FVG retrace entry | 281 | 51.1% |
| cited_htf_bias | 193 | 35.1% |
| contradictions_n=1 | 192 | 34.9% |

## SECONDARY given PRIMARY

### ENTRY_STATUS_FORCE_WAIT

| Flag | n |
|---|---:|
| cited_premium_discount | 493 |
| cited_session_liquidity | 493 |
| mss_present | 448 |
| fvg_present | 399 |
| bias_bearish | 381 |
| displacement_present | 358 |
| cited_eqh | 344 |
| cited_eql | 344 |
| entry_model_Displacement + FVG retrace entry | 246 |
| cited_fvg | 241 |

### BOTH_SIDES_CONFLICT

| Flag | n |
|---|---:|
| fvg_present | 57 |
| cited_premium_discount | 57 |
| cited_session_liquidity | 57 |
| cited_fvg | 57 |
| displacement_present | 54 |
| mss_present | 53 |
| bias_bearish | 45 |
| entry_model_Displacement + FVG retrace entry | 35 |
| entry_model_NY open sweep + displacement + FVG retrace (Adam reversal model) | 19 |
| cited_liquidity_sweep_pdl | 17 |


## Note

This refines the coarse dual-audit driver table (which treated "engine restraint" as 100% of WAITs). PRIMARY splits restraint into **conflict** vs **entry-status force-wait**. Not an edge claim; not permission to tune on VAL.

**EDGE_CLAIM: NONE**
