# Karen — Opportunity Frequency Reconciliation + Episode-Level Trade Audit

**PHASE:** historical-validation / backtest-engineering
**TREE:** `.tmp/karen-final-integration/`
**MODE:** MEASURE → RECONCILE → VERIFY
**EDGE_CLAIM:** NONE
**HOLDOUT_STATUS:** SEALED
**Generated:** 2026-08-15T18:38:02.858Z

---

## FINAL REPORT CARD

| Field | Value |
|---|---|
| PHASE | historical-validation / backtest-engineering |
| DAYS_ANALYZED | 8 dense full-session (+ sparse DEV X=429) |
| EVALUATION_POINTS | dense 2119 · sparse 1500 |
| ACTIONABLE_EVALUATIONS | dense 125 · sparse 71 |
| UNIQUE_ACTIONABLE_EPISODES | 102 (STRICT) |
| MEDIAN_OPPORTUNITIES_PER_DAY | 10.5 |
| MEAN_OPPORTUNITIES_PER_DAY | 12.75 |
| P25_P50_P75_P90 | 0.0 / 10.5 / 26.3 / 27.3 |
| QUIET_DAY_RATE | 50.0% |
| LONG/SHORT_EPISODES | 50 / 52 |
| STATE_FLIPS_PER_DAY | median 73.0 (total 593) |
| MEDIAN_EPISODE_DURATION | 5.0 min inclusive |
| ONE_EVAL_EPISODES | 83 (81.4%) |
| PERSISTENT_EPISODES (2+) | 19 (18.6%) |
| WAIT_TO_ACTION_LATENCY | median 5.0 min · ≤15m 87.3% |
| EXECUTED_TRADE | NOT AVAILABLE — no fill/execution model in DV harness |
| BACKTEST_PERFORMANCE | wall 41134ms · 51.51 evals/s · workers=4 |
| SEMANTIC_HASH_MATCH | true |
| PIT_VIOLATIONS | 0 |
| EDGE_CLAIM | NONE |
| HOLDOUT_STATUS | SEALED |

---

## 1. DEFINITIONS (machine)

### EVALUATION_POINT
One DecisionEnvelope freeze at asOf t via evaluateAnalysisQualityGate (baseline-v2). Fields: verdict, stance, canDeliverVerdict, actionableEntry, evidence, reasoningStructure, triggerInvalidation. PIT: bars ≤ t only.

### ACTIONABLE_EVALUATION
Evaluation_point where actionableEntry===true ∧ verdict∈{LONG,SHORT}. Equivalent: canDeliverVerdict ∧ directional verdict. Non-deliverable L/S ideas are NOT actionable.

### DIRECTIONAL_IDEA
Evaluation_point with verdict∈{LONG,SHORT} regardless of canDeliver. Includes QG-blocked or non-deliverable directional reads. Distinct from ACTIONABLE_ENTRY.

### ACTIONABLE_ENTRY
Synonym of ACTIONABLE_EVALUATION at a single asOf — the desk-deliverable entry signal at t (not a fill).

### STATE_FLIP
Adjacent chronological evaluation_points (same day stream) where stateOf(t)≠stateOf(t+1). stateOf maps: actionable L/S→side; non-deliverable L/S→WAIT; else verdict WAIT|NO_TRADE|OTHER.

### DIRECTIONAL_STATE_CHANGE
STATE_FLIP where at least one side of the pair is LONG or SHORT (excludes pure WAIT↔NO_TRADE idle churn).

### ACTIONABLE_EPISODE
Maximal consecutive run of identical actionable side under a named EpisodePolicy. STRICT: same side only. THESIS_AWARE: break on thesisKey change (bias|structure|entryModel|inv|target). SESSION_AWARE: break on sessionLabel change.

### TRADE_OPPORTUNITY
Canonical = one ACTIONABLE_EPISODE under STRICT policy. Repeated identical L/S stamps inside the run are ONE opportunity, not N trades.

### EXECUTED_TRADE
NOT AVAILABLE in this harness — no broker fill, size, slippage, or live invalidation-exit model. Do not equate opportunities with trades.

### EPISODE_BREAKS
Episode ends on: (1) stance/side change to opposite L/S, (2) return to WAIT/NO_TRADE/OTHER, (3) session boundary (SESSION_AWARE only), (4) thesisKey change (THESIS_AWARE only), (5) calendar day boundary (analysis is day-partitioned for per-day rates), (6) eval stream end. Invalidation price hit is NOT an in-sample episode break (no live exit model). decisionKey/stateTransitionKey changes alone do not break STRICT episodes if side unchanged.

---

## 2. SPARSE_VS_DENSE_RECONCILIATION

Same DEV carve `2023-10-02` → `2025-05-31` (archive trading days ≈ 429).

### Sparse (dual-audit even sample)
- X trading days: **429**
- Y evaluation_points: **1500** @ cadence 10m · mode=even · lookback 60d
- Z actionable_evaluations: **71** (L/S from counts; WAIT=1188, NT=239)
- Sparse evals/day: **3.50** · actionable/day: **0.166**
- Actionable rate: **4.7%**

### Dense (full-session sample days)
- Sample days (even across DEV): 2023-10-02, 2023-12-28, 2024-03-25, 2024-06-19, 2024-09-13, 2024-12-09, 2025-03-04, 2025-05-30
- Evaluation_points: **2119** @ cadence 5m · lookback 10d
- Actionable_evaluations: **125**
- Unique STRICT episodes: **102**
- Mean evals/day: **264.9** · actionable rate: **5.9%**
- Episodes/day median/mean: **10.5** / **12.75**

### Mathematics
1. **Sampling density ratio** = dense_evals_per_day / sparse_evals_per_day = **75.8×**
2. **Coverage fraction** = sparse_evals_per_day / dense_evals_per_day = **1.3%** of dense stamps
3. Trading minutes/day ≈ mean_evals_per_day × cadence = **1324** min
4. Sparse spacing ≈ trading_minutes_per_day / sparse_evals_per_day = **379** min between sparse hits
5. Mean inclusive episode duration = **6.1** min
6. **P(catch)** ≈ min(1, duration / sparse_spacing) = **1.6%**
7. E[sparse actionables | dense rate] = rate_dense × Y_sparse = **88.5** (observed **71**)
8. E[sparse hits | catch model] = (ep/day)×X×P(catch)×collapse = **108.4**
9. Rate ratio dense/sparse = **1.25** (rates are same order; absolute /day counts are not)

**Verdict:** Sparse ~71–84 actionables across 429 days is **compatible** with dense ~10.5 median opportunities/day. Sparse is a **coverage** problem (≈1.3% of session stamps), not evidence of a different opportunity regime. Short episodes (mostly 1 cadence tick) have low catch probability under even@1500.

_Sparse even@1500 is not a full-session replay; it under-samples short episodes. Dense 5m full-day catches brief L/S stamps that sparse misses. Actionable *rates* are comparable; absolute counts/day are not._

---

## 3. Opportunity episode audit (STRICT)

| Metric | Value |
|---|---:|
| Unique episodes | 102 |
| Median / mean /day | 10.5 / 12.75 |
| P25 / P50 / P75 / P90 | 0.0 / 10.5 / 26.3 / 27.3 |
| Quiet day rate | 50.0% (4/8) |
| LONG / SHORT | 50 / 52 |
| Distribution | `[0,0,0,27,0,28,26,21]` |

Per-episode sample (first 60) in JSON report. Quality attached at episode **start** asOf (first actionable stamp).

---

## 4. Distinct vs repeated — EPISODE_POLICY_SENSITIVITY

| Policy | Episodes | Med/day | Mean/day | Quiet | Collapse (evals/ep) | Dist |
|---|---:|---:|---:|---:|---:|---|
| STRICT ★ | 102 | 10.5 | 12.75 | 50.0% | 1.23 | `[0,0,0,27,0,28,26,21]` |
| THESIS_AWARE | 115 | 14.0 | 14.38 | 50.0% | 1.09 | `[0,0,0,29,0,29,29,28]` |
| SESSION_AWARE | 102 | 10.5 | 12.75 | 50.0% | 1.23 | `[0,0,0,27,0,28,26,21]` |

**Canonical policy: STRICT**

Product semantics: one DecisionEnvelope deliverable LONG/SHORT run = one TRADE_OPPORTUNITY; thesis/session variants are diagnostic inflation detectors, not separate desk fills.

Inflation detectors: if THESIS_AWARE ≫ STRICT, identical-side stamps are re-thesing (noisy). If SESSION_AWARE ≈ STRICT, session boundaries rarely split runs.

---

## 5. STATE_FLIPS — FLIP_MATRIX

| Kind | Count | /day | % | Med persistence (min) | Mean persistence |
|---|---:|---:|---:|---:|---:|
| WAIT→NO_TRADE | 201 | 25.13 | 33.9% | 15.0 | 34.0 |
| NO_TRADE→WAIT | 198 | 24.75 | 33.4% | 5.0 | 7.5 |
| WAIT→LONG | 38 | 4.75 | 6.4% | 15.0 | 22.9 |
| LONG→WAIT | 38 | 4.75 | 6.4% | 5.0 | 6.1 |
| SHORT→WAIT | 31 | 3.88 | 5.2% | 5.0 | 5.8 |
| WAIT→SHORT | 30 | 3.75 | 5.1% | 15.0 | 22.7 |
| NO_TRADE→SHORT | 18 | 2.25 | 3.0% | 5.0 | 8.9 |
| SHORT→NO_TRADE | 16 | 2.00 | 2.7% | 5.0 | 5.9 |
| NO_TRADE→LONG | 7 | 0.88 | 1.2% | 5.0 | 10.0 |
| LONG→NO_TRADE | 7 | 0.88 | 1.2% | 5.0 | 6.4 |
| SHORT→LONG | 5 | 0.63 | 0.8% | 5.0 | 68.0 |
| LONG→SHORT | 4 | 0.50 | 0.7% | 7.5 | 7.5 |

Idle WAIT↔NO_TRADE dominates. Hard LONG↔SHORT flips are rare.

---

## 6. Actionable dynamics

| State time share | Minutes | Share |
|---|---:|---:|
| Actionable L/S | 625 | 5.9% |
| WAIT | 8240 | 77.8% |
| NO_TRADE | 1730 | 16.3% |

| Persistence | n | rate |
|---|---:|---:|
| 1-eval | 83 | 81.4% |
| ≥2 evals | 19 | 18.6% |
| ≥3 evals | 2 | 2.0% |
| ≥5 evals | 1 | 1.0% |

Median inclusive duration: **5.0** min · mean **6.13** min.

---

## 7. Trade-frequency estimate

| Quantity | Value |
|---|---|
| **OPPORTUNITIES_PER_DAY** (STRICT median) | **10.5** |
| OPPORTUNITIES_PER_DAY (mean) | 12.75 |
| EXECUTABLE_ENTRIES_PER_DAY | **NOT AVAILABLE** (no execution model) |
| TRADES_PER_DAY | **Do not report** — would conflate opportunities with fills |

---

## 8. QUALITY_BY_EPISODE (heuristic — not edge)

proxyR / MFE / MAE attached at episode **start** stamp; horizon 30m. EDGE_CLAIM remains NONE.

| Slice | n | med MFE | med MAE | mean proxyR | T-before rate |
|---|---:|---:|---:|---:|---:|
| ALL | 102 | 11.75 | 11.00 | -0.306 | 26.3% |
| 1-eval (short) | 83 | 15.50 | 11.25 | -0.199 | 30.4% |
| ≥2-eval (persistent) | 19 | 9.50 | 8.75 | -0.765 | 9.1% |
| LONG | 50 | 11.00 | 9.00 | 0.292 | 27.3% |
| SHORT | 52 | 14.25 | 12.63 | -0.869 | 25.7% |
| First of day | 4 | 10.75 | 11.63 | 0.414 | 100.0% |
| Later of day | 98 | 11.75 | 11.00 | -0.336 | 25.0% |

### FREQUENCY_INTERPRETATION

- ~81.4% of STRICT episodes are **1-eval** (≤ one cadence tick) — high raw episode counts can still be **noisy flickers**.
- Median opportunities/day **10.5** is a real count under STRICT collapse, but quality (mean proxyR=-0.306) must not be read as edge.
- Persistent (≥2) mean proxyR=-0.765 vs all -0.306 — compare only as descriptive; no promotion.
- Bimodal quiet/active days (quiet rate 50.0%) means the median is **not** “~10 trades every day”; active days run ~20–28 episodes.
- **Meaningful as opportunity frequency; not meaningful as trade frequency or expectancy.**

---

## 9. WAIT / NO_TRADE relationship

Sparse WAIT audit (dual-audit): WAIT=1188 (79.2% of evals); MISSED_OPPORTUNITY heuristic **75.7%**; verdict **structurally_overcautious**.

Dense WAIT→action latency (STRICT episode starts with a prior same-day WAIT):
- n latencies: 102
- median / mean: **5.0** / **12.0** min
- ≤5 / 15 / 30 / 60m: 66.7% / 87.3% / 98.0% / 99.0%
- WAIT evals that never see later same-day actionable: **57.9%** (954/1648)

**Reconciliation with ~76% missed-opportunity heuristic:** that label is a *forward-excursion* classifier on WAIT rows (clean one-sided MFE), **not** a count of TRADE_OPPORTUNITYs Karen failed to take. Dense dynamics show most clock time is WAIT/NT, actionable episodes are brief, and many WAITs never convert same-day — consistent with structural selectivity (or overcaution) rather than a claim that ~10.5 opportunities/day are “missed WAITs.” Patient vs late: use latency percentiles above; structurally overcautious remains the sparse WAIT audit verdict, unchanged by frequency math.

---

## 10. BACKTEST_PERFORMANCE / PIT

| Metric | Value |
|---|---:|
| Parallel wall | 41134 ms |
| Σ day eval | 40308 ms |
| Speedup vs Σ | 0.98× |
| Evals/sec | 51.51 |
| SEMANTIC_HASH_MATCH | true |
| PIT violations | 0 |

Worker bench (4-day subset):

| Workers | Wall ms | vs 1 |
|---:|---:|---:|
| 1 | 159170 | 1.00× |
| 2 | 190825 | 0.83× |
| 4 | 153331 | 1.04× |

_Note: bench above is in-process Promise-pool (this workstream). Parallel perf agent (same tree) reports worker_threads ≈ **1.79× / 2.70× / 2.70×** at 2/4/8 workers with PitSafeDaySession wired and SEMANTIC_HASH_MATCH PASS — see `karen-dv-backtest-performance.md` / progress board._

---

## NEXT_RECOMMENDATION

Treat STRICT ~10.5 median OPPORTUNITIES_PER_DAY as the frequency SoT for product language, keep sparse dual-audit for quality/WAIT diagnostics only, and do not tune thresholds until a larger dense-day panel confirms the quiet/active bimodality.

## EDGE_CLAIM
NONE

## 11. DENSE PANEL BIMODALITY CONFIRMATION

**Generated:** 2026-08-15T18:54:36.262Z
**TREE:** `.tmp/karen-final-integration/`
**MODE:** MEASURE only — no tune · **EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED
**Selection:** even-spaced chronological DEV days (`evenPick_DEV_chronological`, want=40)

Prior 8-day SoT (STRICT median **10.5**, quiet 50%) remains the product frequency reference unless this panel materially contradicts it.

### Panel report card

| Field | Value |
|---|---|
| DAYS_IN_PANEL | **40** |
| EVALUATION_POINTS | 10877 @ 5m · lookback 10d |
| ACTIONABLE_EVALUATIONS | 582 |
| UNIQUE_STRICT_EPISODES | 410 |
| MEDIAN_OPPORTUNITIES_PER_DAY | **0.0** |
| MEAN_OPPORTUNITIES_PER_DAY | 10.25 |
| P25 / P50 / P75 / P90 | 0.0 / 0.0 / 24.5 / 31.2 |
| QUIET_DAY_RATE | **62.5%** (25/40) |
| ACTIVE_DAY median/mean ep | 28.0 / 27.33 |
| ACTIVE_DAY P25–P75 | 23.5 – 32.0 |
| MID_BAND days (1–9 ep) | 1 (2.5%) |
| HIGH_ACTIVE days (≥15 ep) | 14 |
| BIMODALITY_HOLDS | **YES** |
| ONE_EVAL / PERSISTENT(2+) | 314 (76.6%) / 96 (23.4%) |
| LONG / SHORT episodes | 200 / 210 |
| STATE_FLIPS median/day | 67.5 (total 2825) |
| SEMANTIC_HASH_MATCH | true |
| PIT_VIOLATIONS | 0 |
| PIT | **PASS** |
| EDGE_CLAIM | NONE |
| HOLDOUT_STATUS | SEALED |

### Sample days (40)

2023-10-02, 2023-10-16, 2023-10-31, 2023-11-15, 2023-11-30, 2023-12-15, 2024-01-03, 2024-01-19, 2024-02-05, 2024-02-20, 2024-03-06, 2024-03-21, 2024-04-08, 2024-04-23, 2024-05-08, 2024-05-23, 2024-06-07, 2024-06-24, 2024-07-09, 2024-07-24, 2024-08-08, 2024-08-23, 2024-09-10, 2024-09-25, 2024-10-10, 2024-10-25, 2024-11-11, 2024-11-26, 2024-12-11, 2024-12-26, 2025-01-10, 2025-01-27, 2025-02-11, 2025-02-26, 2025-03-13, 2025-03-28, 2025-04-14, 2025-04-30, 2025-05-15, 2025-05-30

### Per-day STRICT episode counts

`[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,35,0,0,0,0,33,26,24,34,31,28,23,28,19,43,30,0,0,0,0,29,21]`

### ONE_EVAL vs persistent

| Persistence | n | rate |
|---|---:|---:|
| 1-eval | 314 | 76.6% |
| ≥2 evals | 96 | 23.4% |
| ≥3 evals | 38 | 9.3% |
| ≥5 evals | 11 | 2.7% |

### Flip matrix summary (top kinds)

| Kind | Count | /day | % |
|---|---:|---:|---:|
| WAIT→NO_TRADE | 1026 | 25.65 | 36.3% |
| NO_TRADE→WAIT | 1018 | 25.45 | 36.0% |
| SHORT→WAIT | 167 | 4.17 | 5.9% |
| WAIT→SHORT | 163 | 4.08 | 5.8% |
| LONG→WAIT | 157 | 3.92 | 5.6% |
| WAIT→LONG | 154 | 3.85 | 5.5% |
| NO_TRADE→LONG | 28 | 0.70 | 1.0% |
| SHORT→NO_TRADE | 27 | 0.68 | 1.0% |
| NO_TRADE→SHORT | 27 | 0.68 | 1.0% |
| LONG→NO_TRADE | 22 | 0.55 | 0.8% |
| LONG→SHORT | 20 | 0.50 | 0.7% |
| SHORT→LONG | 16 | 0.40 | 0.6% |

### Bimodality verdict

- Rule: `holds := quietRate≥25% ∧ active≥3 ∧ midBand(1–9)≤25% ∧ (active median≥15 ∨ active mean≥15)`
- Quiet mass 62.5%; mid-band share 2.5%; active cluster median 28.0 (mean 27.33).
- **CONFIRMED:** quiet/active bimodality holds on this 40-day dense panel.
- Sparse dual-audit remains quality/WAIT-only; no threshold tuning from this panel.

### NEXT_RECOMMENDATION (post-panel)

Bimodality confirmed on 40-day dense DEV panel. Keep STRICT median opportunities/day language qualified by quiet/active regimes (panel median 0.0, quiet 62.5%). Retain 8-day SoT ~10.5 as the published frequency anchor unless a future full-DEV dense pass revises it. Sparse dual-audit for quality/WAIT only. **Do not tune.**

JSON: `data/karen-decision-validation/acquisition/reports/opportunity-frequency-dense-panel-latest.json`

<!-- END_DENSE_PANEL_BIMODALITY -->
