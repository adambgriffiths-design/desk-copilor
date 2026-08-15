# Semantic confounder micro-measurements (A3 + A4)

**TIME:** 2026-08-15T19:24:04.581Z
**TREE:** `.tmp/karen-final-integration/`
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED
**MODE:** observation-only dual compute — no production swap

## Method

- Days: 2023-10-02, 2023-12-28, 2024-03-25, 2024-06-19, 2024-09-13, 2024-12-09, 2025-03-04, 2025-05-30
- Cadence: 15m · lookback 5d · samples PD=710 REH=710

## A3 — EST calendar PD vs CME session PD

| Metric | Value |
|---|---:|
| keyDisagreeRate | 25.6% |
| hlcDisagreeRate | 95.8% |
| medianAbsPdhDelta | 0.75 |
| VERDICT | **MATERIAL_LABELING_CONFOUNDER** |

### By ET hour bucket

| Bucket | n | keyDisagree | hlcDisagree |
|---|---:|---:|---:|
| 1800-0000_globex_roll | 182 | 100.0% | 83.5% |
| 0000-0200 | 64 | 0.0% | 100.0% |
| 0200-0930 | 240 | 0.0% | 100.0% |
| 0930-1600_rth | 196 | 0.0% | 100.0% |
| 1600-1800 | 28 | 0.0% | 100.0% |

## A4 — Dual REH algorithms

| Metric | Value |
|---|---:|
| rehAgreeRate | 40.0% |
| relAgreeRate | 39.4% |
| presenceAgreeRate | 84.4% |
| bothSidesPriceAgreeRate | 13.9% |
| disagreeRate | 86.1% |
| VERDICT | **MATERIAL_DUAL_ALGORITHM_NOISE** |

## Promotion

- **NOT promoted.** No PD key swap. No REH unify.
- Confounders remain tagged; measurements inform DEV correctness backlog only.

**EDGE_CLAIM: NONE**
