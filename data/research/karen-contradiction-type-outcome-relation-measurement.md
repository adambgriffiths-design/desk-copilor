# KAREN — contradiction_type ↔ outcome relation (MEASUREMENT)

**measurement_id:** `m_contradiction_type_outcome_relation_v0`  
**DATE:** 2026-08-16  
**RUN:** **PASS** (Adam-authorized)  
**Predeclare:** [`karen-contradiction-type-outcome-relation-predeclare.md`](./karen-contradiction-type-outcome-relation-predeclare.md)  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**SELECTIVE_UNLOCK:** **PARKED** · **C4_SINGLE_CHANGE:** **NOT_DEFINED**  
**ALS / score / unlock / trading behavior:** none  

---

## Question (descriptive only)

Do typed contradiction cells (taxonomy / polarity / co-occurrence) show a stable GOOD/BAD association on FORCE_WAIT shadow-ACT Y=1500 stamps — enough to **continue WAIT-representation work**, not to unlock?

---

## Population / features

| Field | Value |
|-------|--------|
| **Population** | FORCE_WAIT shadow-ACT DEV stamps Y=1500 (n=**1074**) |
| **Source** | `force-wait-shadow-stamps-y1500-latest.json` (enriched `contradictionItems`) |
| **Representation** | `contradiction_repr_v1` |
| **Primary axis** | Typed taxonomy cells from `contradictionItems` — **not** `contradictionCount` alone |
| **Labels** | `c1Shadow.outcomeLabel` GOOD / BAD / NEUTRAL (NEUTRAL reported separately; not folded into BAD) |

Plan executed exactly as predeclared: (1) type×label (2) polarity×label (3) co-occurrence joints (4) severity secondary. **No** threshold mining, multi-knob search, or unlock design.

---

## 1. Contingency — type × GOOD/BAD

Rates use **goodRateAmongDecided** = GOOD / (GOOD+BAD). Pool: GOOD 612 · BAD 365 · NEUTRAL 97 · decided good-rate **0.626**.

| Typed cell | n | GOOD | BAD | NEUTRAL | goodRateAmongDecided | Δ vs NONE |
|------------|--:|-----:|----:|--------:|---------------------:|----------:|
| **NONE** | 620 | 251 | 281 | 88 | **0.472** | — |
| **STRUCTURE_VS_BIAS_BULLISH_STRUCT** (solo) | 350 | 285 | 58 | 7 | **0.831** | +0.359 |
| **STRUCTURE_VS_BIAS_BEARISH_STRUCT** (solo) | 72 | 53 | 18 | 1 | **0.746** | +0.275 |
| **HTF_BIAS_MISALIGNED** (solo) | 13 | 5 | 7 | 1 | **0.417** | −0.055 |
| HTF + BULLISH_STRUCT | 8 | 7 | 1 | 0 | 0.875 | +0.403 |
| HTF + BEARISH_STRUCT | 11 | 11 | 0 | 0 | 1.000 | +0.528 |

Solo structure↔bias cells carry the association story (large n). Joint / HTF-solo cells are raw-reported; **do not dominate** the verdict (small-n).

---

## 2. Contingency — polarity × label (`structure_vs_bias` events)

| Polarity | n | GOOD | BAD | NEUTRAL | goodRateAmongDecided |
|----------|--:|-----:|----:|--------:|---------------------:|
| `bullish_struct_bearish_bias` | 358 | 292 | 59 | 7 | **0.832** |
| `bearish_struct_bullish_bias` | 83 | 64 | 18 | 1 | **0.780** |

Both polarities elevated vs NONE (~0.472). Bullish-struct polarity slightly higher than bearish-struct; both interpretable from the feature-story market meanings (mirror opposition stories, not a count rename).

---

## 3. Co-occurrence

| Joint cell | n | GOOD | BAD | NEUTRAL |
|------------|--:|-----:|----:|--------:|
| HTF + BULLISH_STRUCT | 8 | 7 | 1 | 0 |
| HTF + BEARISH_STRUCT | 11 | 11 | 0 | 0 |

Small-n; reported raw; **not** merged into “any contradiction”; **not** used as primary discriminator story.

---

## 4. Severity (secondary)

Within stamped types, severity is **deterministic from type** (`structure_vs_bias` → blocking; `htf_misaligned` → warning). No within-type severity contrast available — severity table collapses to type. Documented; no invented severities.

---

## 5. Heterogeneity within `cc===1` (typed cells, not count)

Under `contradictionCount===1` (n=435):

| Cell | n | goodRateAmongDecided |
|------|--:|---------------------:|
| STRUCTURE_VS_BIAS_BULLISH_STRUCT | 350 | **0.831** |
| STRUCTURE_VS_BIAS_BEARISH_STRUCT | 72 | **0.746** |
| HTF_BIAS_MISALIGNED | 13 | **0.417** |

**HETEROGENEITY_WITHIN_CC1 = YES** — types are not exchangeable under a fixed count bin (spread ≫ 10pp). Association does **not** collapse to `contradictionCount` alone (secondary count diagnostic: cc=0 good-rate 0.472 vs cc=1 mixed by type).

---

## Triage (predeclare §8 — representation only)

| Field | Value |
|-------|--------|
| **MEANINGFUL_ASSOCIATION** | **YES** — solo structure↔bias cells ≥+27pp vs NONE (decided n≥71); pattern matches feature-story opposition meaning |
| **HETEROGENEITY_WITHIN_CC1** | **YES** |
| **triageVerdict** | **CONTINUE_WAIT_REPRESENTATION_WORK** |
| **KILL_WAIT_BRANCH** | **NO** |
| **UNLOCK** | still **PARKED** (not authorized; association ≠ causal unlock) |

Descriptive association only — **not** a Gate-10 unlock predicate, ALS score, or `C4_SINGLE_CHANGE`.

---

## Paths

- Report JSON: `data/karen-decision-validation/acquisition/reports/contradiction-type-outcome-relation-latest.json`
- Predeclare: [`karen-contradiction-type-outcome-relation-predeclare.md`](./karen-contradiction-type-outcome-relation-predeclare.md)
- Spec: [`karen-contradiction-representation-spec-v1.md`](./karen-contradiction-representation-spec-v1.md)

---

## Exact return block

```
MEASUREMENT_ID: m_contradiction_type_outcome_relation_v0
RUN: PASS
HETEROGENEITY_WITHIN_CC1: YES
MEANINGFUL_ASSOCIATION: YES
KILL_WAIT_BRANCH: NO
UNLOCK: still PARKED
NEXT: CONTINUE WAIT-representation on typed contradiction (association YES); no unlock / no c4 / await Adam next representation step or stop
REPORT_PATH: data/research/karen-contradiction-type-outcome-relation-measurement.md
```
