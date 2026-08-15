# Karen — Quiet vs Active Day Causal Feature Analysis

**PHASE:** research / measure-only  
**TREE:** `.tmp/karen-final-integration/`  
**TIME:** 2026-08-15T20:30:00Z (approx)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**TUNING:** none · **VAL:** not touched · **weights:** unchanged  

**Panel source:** `opportunity-frequency-dense-panel-latest.json` (40 even-spaced DEV days, STRICT episodes)  
**Decision sample:** baseline-v2 @ cadence **30m**, lookback 10d · Y=**1847** · PIT=**0**  
**Script:** `scripts/karen-dv-quiet-vs-active-day-analysis.ts`  
**JSON:** `data/karen-decision-validation/acquisition/reports/quiet-vs-active-day-analysis-latest.json`  
**Registry:** `exp-quiet-vs-active-day-analysis-2026-08-15` · decision=`research` · PIT=0  

---

## Return card

| Field | Value |
|---|---|
| QUIET_RATE | **62.5%** (25/40) |
| ACTIVE_MEDIAN_OPP | **28** (active+mid days with STRICT ep ≥ 1) |
| ACTIVE_CLUSTER_MEDIAN | 28.5 (ep ≥ 10) |
| VERDICT | **gating_defect** |
| EDGE_CLAIM | **NONE** |
| PIT_VIOLATIONS | **0** |
| NEXT_SAFE_TASK | DONE → see `karen-era-split-entry-force-wait.md` (era_regime_change_mixed); next: consume peer c1 for protocol gates |

---

## 1. Definitions (reuse panel)

| Label | Rule |
|---|---|
| Quiet | STRICT actionable episodes == 0 |
| Mid | 1–9 STRICT episodes |
| Active (compare set) | STRICT episodes ≥ 1 (mid + high-active) |
| High-active | STRICT episodes ≥ 10 |
| TRADE_OPPORTUNITY | STRICT actionable episode (panel SoT) |

**Leakage policy**

- **Predictive / causal:** prior trading-day range, ATR14 ending at prior day, overnight range & gap through RTH open (completes before RTH).
- **Descriptive PIT:** same-day decision flags averaged across asOf stamps (structure, WAIT drivers, cites). Not used as prior predictors.
- **Forbidden:** same-day full-session range as a quietness explainer; any threshold search / tune.

---

## 2. Classification (40-day panel)

Matches panel §11: quiet **25/40 = 62.5%**, mid **1**, high-active **14**.

- First active panel day: **2024-06-24** (6 ep, mid-band)
- **17 consecutive quiet panel days** before that (2023-10-02 → 2024-06-07)
- Late-panel quiet rate (from first active onward): **34.8%** (8/23)

Per-day STRICT counts (unchanged):  
`[0×17, 6, 35, 0×4, 33, 26, 24, 34, 31, 28, 23, 28, 19, 43, 30, 0×4, 29, 21]`

---

## 3. Prior-day / overnight features (causal)

Pre-declared classifier: predict quiet if `priorDayRange < sample_median(priorDayRange)` — **no threshold search**.

| Metric | Value |
|---|---:|
| Threshold (sample median) | 292.6 pts |
| Accuracy | **32.5%** |
| Precision / Recall | 45.0% / 36.0% |
| Confusion | TP9 FP11 TN4 FN16 |

| Feature | Quiet median | Active median | Δ (active − quiet) |
|---|---:|---:|---:|
| priorDayRange | **304.5** | 234.3 | **−70.3** |
| priorDayAtr14 | 271.2 | 325.2 | +54.0 |
| overnightRange | **302.5** | 220.8 | **−81.8** |
| overnightGapAbs | 86.3 | 79.8 | −6.5 |

**Read:** Quiet days are **not** low prior-day / overnight range days. Quiet medians are *higher* on range/overnight than active. A simple prior-range gate does **not** predict quiet (accuracy worse than chance). This rejects “intelligently inactive on low-opportunity regime” as the dominant explanation.

---

## 4. Same-day as-of features (PIT descriptive @ 30m)

| Feature | Quiet median | Active median | Δ |
|---|---:|---:|---:|
| actionableRate | 0.000 | 0.140 | +0.140 |
| waitRate | 0.851 | 0.702 | −0.149 |
| meanReasonCount | 3.68 | 3.74 | +0.06 |
| meanContradictionCount | 0.53 | 0.60 | +0.06 |
| mssRate | **0.936** | 0.915 | −0.021 |
| fvgRate | **0.894** | 0.936 | +0.043 |
| displacementRate | **0.745** | 0.733 | −0.011 |
| sweepCiteRate | 0.605 | 0.468 | −0.137 |
| htfBiasCiteRate | 0.489 | 0.404 | −0.085 |
| premiumDiscountCiteRate | 1.000 | 0.851 | −0.149 |
| pdCiteRate | 0.149 | 0.140 | −0.009 |
| entryForceWaitShareOfWait | **0.917** | 0.909 | −0.008 |
| bothSidesShareOfWait | 0.083 | 0.091 | +0.008 |
| sessionNyAmShare | 0.085 | 0.085 | 0 |
| biasDirectionalShare | 1.000 | 0.915 | −0.085 |

**Read:** Quiet days still print **MSS / FVG / displacement** at high rates and accumulate reasons comparable to active days. Delivery is suppressed (actionableRate=0) while WAIT is dominated by **ENTRY_STATUS_FORCE_WAIT (~92%)** — same primary driver family as the WAIT taxonomy (89.6% on 8-day SoT). Structure is present; desk delivery is gated off for entire days/blocks.

---

## 5. Verdict

### **gating_defect** (not intelligent_filter; not merely mixed)

Evidence stack:

1. **Chronological block:** 17 consecutive early-panel quiet days — not a day-by-day opportunity filter.
2. **Prior-day features fail:** median-split accuracy 32.5%; quiet has *higher* prior/overnight range.
3. **Structure present on quiet days:** mss/fvg/disp medians ~0.94 / 0.89 / 0.74.
4. **WAIT primary:** ENTRY_STATUS_FORCE_WAIT ~91.7% of quiet-day WAITs.

Karen is **not** primarily “intelligently inactive on low-opportunity days.” Entire sessions/days (and an early-archive era) are suppressed despite as-of structure — consistent with a **gating / delivery defect** (entry-status force-wait and/or early-archive regime interaction), not a healthy opportunity-frequency filter.

This is **not** permission to tune on VAL. EDGE_CLAIM remains NONE.

---

## 6. Peer note (non-blocking)

Peer overcaution candidates already on disk:

- `data/research/karen-dev-overcaution-candidates.md`
- Smoke: **c1_wait_entry_actionable** marked promising (WAIT→ACT large Δ); c2/c3 not meeting bar on smoke sample.
- Smoke VAL heuristic ran for c1 — still **EDGE_CLAIM NONE**; full Y=1500 peer status may still be completing.

Quiet-vs-active analysis did **not** wait on peer completion. c1 directionally aligns with ENTRY_STATUS_FORCE_WAIT dominance found here — candidate review remains a separate DEV protocol step.

---

## 7. NEXT_SAFE_TASK

1. **Preferred:** DEV-only era-split measure of ENTRY_STATUS_FORCE_WAIT / actionable density **pre vs post 2024-06-24** on the dense panel (still no tune).
2. **Or:** Consume finished peer overcaution candidate results → protocol REJECT / RESEARCH_MORE / PROMOTE_TO_VALIDATION gates only.
3. Do **not** unlock HOLDOUT. Do **not** threshold-tune from this panel alone.

---

## EDGE_CLAIM

**NONE**
