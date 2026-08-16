# KAREN — contradiction_type ↔ outcome relation (PREDECLARE only)

**DATE:** 2026-08-16  
**MODE:** measurement pre-registration — **RUN completed**  
**STATUS:** **RUN_COMPLETED**  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**SELECTIVE_UNLOCK:** PARKED · **C4_SINGLE_CHANGE:** NOT_DEFINED  
**ALS / score / unlock / trading behavior:** none  
**RUN_AUTHORIZED:** **YES** (Adam 2026-08-16)  
**RUN_COMPLETED:** **YES** — 2026-08-16  
**Result:** [`karen-contradiction-type-outcome-relation-measurement.md`](./karen-contradiction-type-outcome-relation-measurement.md) · `contradiction-type-outcome-relation-latest.json`

**Prior gate (satisfied):** type-vs-count **RICHER=YES** · typed stamps `contradiction_repr_v1`. See [`karen-contradiction-type-vs-count-predeclare.md`](./karen-contradiction-type-vs-count-predeclare.md) · [`karen-contradiction-representation-spec-v1.md`](./karen-contradiction-representation-spec-v1.md).

---

## 1. Feature story (prior — YES)

**FEATURE_STORY_JUSTIFIED:** **YES** (prior; not re-litigated here)

Authoritative audit: [`karen-contradiction-type-feature-story.md`](./karen-contradiction-type-feature-story.md)

| Prior finding | Value |
|---------------|--------|
| **RECOMMENDED_REPRESENTATION** | typed objects retaining source / severity / polarity |
| **PIT_SAFE** | YES |
| **OUTCOMES_INSPECTED** | NO (feature-story deliberately avoided outcomes) |
| **MEANINGFUL_REPRESENTATION** | YES (measurement PASS + feature-story YES) |

This document earns the *next* methodological step only: **pre-declare** how typed contradiction relates to stamp outcomes — because feature meaning was established first. It does **not** run that analysis.

---

## 2. Measurement id (PREDECLARE)

| Field | Value |
|-------|--------|
| **measurement_id** | `m_contradiction_type_outcome_relation_v0` |
| **status** | **RUN_COMPLETED** — Adam authorized RUN 2026-08-16; results in measurement note |
| **kind** | descriptive association (type / polarity × GOOD/BAD) |
| **not** | unlock predicate, c4 single-change, ALS experiment, score row |

---

## 3. Exact population

| Field | Value |
|-------|--------|
| **Population** | FORCE_WAIT shadow-ACT DEV stamps |
| **Horizon** | **Y=1500** |
| **Source** | `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json` (+ `.jsonl`) |
| **Schema** | [`force-wait-shadow-stamps-y1500.schema.md`](../karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500.schema.md) |
| **Carve** | Same shadow-ACT pool used in prior contradiction frequency / feature-story work (baseline FORCE_WAIT → ACT-under-c1 shadow; n≈1074) |
| **Baseline** | baseline-v2 |
| **Split** | DEV only — no VAL, no HOLDOUT |

Do not expand population, re-stamp, or mix non-FORCE_WAIT / non-Y=1500 rows under this id.

---

## 4. Exact features (predictors / cells — not count alone)

Association cells must use **typed** contradiction representation, not `contradictionCount` alone.

| Feature | Definition for this measurement |
|---------|----------------------------------|
| **typed contradiction id** | Report `id` from taxonomy: `structure_vs_bias`, `htf_misaligned` (plus **NONE** when contradiction list empty) |
| **polarity** | For `structure_vs_bias` only: `bullish_struct_bearish_bias` \| `bearish_struct_bullish_bias` (maps to STRUCTURE_VS_BIAS_BULLISH_STRUCT / STRUCTURE_VS_BIAS_BEARISH_STRUCT) |
| **severity** | Include **if stamped / reconstructible** on the row (`blocking` vs `warning` from ContradictionReport); if not present on stamp strings, reconstruct via known id→severity map from feature-story — document reconstruction; do not invent new severities |
| **co-occurrence** | Multi-label rows allowed (HTF + structure↔bias); report joint cells separately from solo |

**Explicitly insufficient as sole feature:** `contradictionCount` (or any count-only binning). Count may appear only as a *secondary* diagnostic column, never as the primary association axis.

Taxonomy reference (feature-story): STRUCTURE_VS_BIAS_BULLISH_STRUCT · STRUCTURE_VS_BIAS_BEARISH_STRUCT · HTF_BIAS_MISALIGNED · NONE.

---

## 5. Exact outcomes (relate later — when RUN authorized)

| Field | Value |
|-------|--------|
| **Labels** | Stamp `c1Shadow.outcomeLabel` already on Y=1500 FORCE_WAIT shadow stamps: **GOOD** / **BAD** (and NEUTRAL if present) |
| **Label rule** | Per schema: T-before-inv → GOOD; inv-before-T → BAD; else proxyR ≥0.25 GOOD / ≤−0.25 BAD; else NEUTRAL |
| **Analysis mode** | **Descriptive association only** — rates / contingency / co-occurrence |
| **Not authorized** | Using labels to pick unlock thresholds, Gate-10 design, profitability, or live predicates |

Outcomes exist on the dump; this predeclare **forbids inspecting them for this measurement until Adam says RUN**.

---

## 6. FORBIDDEN until Adam says “run”

Until explicit authorization to **RUN** `m_contradiction_type_outcome_relation_v0`:

- Looking at GOOD/BAD (or proxyR / MFE/MAE / clearance) **rates by type** to pick unlock rules
- Gate-10 unlock design or ACT-rate targeting from type slices
- ALS / registry score / production wiring
- VAL peek, retune, or second VAL
- HOLDOUT unseal or any OOS claim
- Profitability / expectancy optimization
- Implementing typed objects into live decision code “because association looks good”
- Defining `C4_SINGLE_CHANGE` or selective unlock predicates from this measurement
- Threshold mining, multi-knob search, or post-hoc cell collapsing to manufacture a discriminator

**Also still forbidden (governance, unchanged):** selective unlock remains **PARKED**; `C4_SINGLE_CHANGE` stays **NOT_DEFINED**.

*(Adam authorized RUN 2026-08-16 — analysis executed under §7 only; unlock/c4 bans still hold.)*

---

## 7. Pre-registered analysis plan (execute only after RUN)

When Adam authorizes RUN, do **exactly** this plan — no extras:

1. **Contingency: type × GOOD/BAD**  
   Rows = taxonomy cells (solo types + NONE + documented co-occurrence joints as needed). Columns = GOOD / BAD (NEUTRAL reported separately, not folded into BAD). Counts + row rates. No p-hacking cutoffs as unlock gates.

2. **Contingency: polarity × label**  
   Among `structure_vs_bias` events only: bullish-struct polarity vs bearish-struct polarity × GOOD/BAD.

3. **Co-occurrence**  
   Joint HTF + structure↔bias cells × label (small-n expected; report raw counts; do not merge into “any contradiction”).

4. **Severity (if available)**  
   Optional secondary table: severity × label *within* type — descriptive only.

5. **Hard bans on the RUN**  
   - **NO** threshold mining  
   - **NO** multi-knob search  
   - **NO** “best unlock slice” selection  
   - Report **association**, not causal unlock or promote recommendation

Deliverable when run: a short results note under `data/research/` pointing at this predeclare id — still EDGE_CLAIM NONE, still no ALS/VAL/HOLDOUT.

**Executed 2026-08-16** → [`karen-contradiction-type-outcome-relation-measurement.md`](./karen-contradiction-type-outcome-relation-measurement.md).

---

## 8. Success / failure criteria (post-RUN — for representation triage)

These criteria decide whether typed contradiction **deserves further WAIT-representation work** vs **park** — **not** whether to unlock.

| Verdict | Criteria (descriptive) |
|---------|------------------------|
| **CONTINUE_WAIT_REPRESENTATION_WORK** | Clear, stable association pattern: at least one typed cell (or polarity) shows materially different GOOD/BAD mix vs NONE / pool **and** the pattern is interpretable from the feature-story market meaning (not a count rename). Co-occurrence / small-n cells do not dominate the story. |
| **PARK_TYPED_CONTRADICTION** | Types look exchangeable on GOOD/BAD (no meaningful differentiation); or lift collapses to `contradictionCount` / collinear cited features already closed; or association is too sparse/noisy to guide representation work. |

**Post-RUN triage (2026-08-16):** **CONTINUE_WAIT_REPRESENTATION_WORK** · MEANINGFUL_ASSOCIATION=YES · HETEROGENEITY_WITHIN_CC1=YES · KILL_WAIT_BRANCH=NO · UNLOCK still PARKED.

**Neither verdict unlocks WAIT, defines c4, or authorizes VAL.** Continue vs park is about **audit area 1 representation investment only**.

---

## 9. Governance lock

| Field | Value |
|-------|--------|
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** (unchanged) |
| **SELECTIVE_UNLOCK** | **PARKED** (unchanged) |
| **EDGE_CLAIM** | NONE |
| **HOLDOUT** | SEALED |
| **VAL** | DO NOT TOUCH |
| **ONE_FEATURE** | contradiction_type (still) |

Predeclare ≠ scored experiment ≠ unlock predicate.

---

## 10. NEXT_SINGLE_ACTION

**RUN_COMPLETED.** Triage = **CONTINUE_WAIT_REPRESENTATION_WORK** (do not kill WAIT branch). Selective unlock remains **PARKED**; `C4_SINGLE_CHANGE` **NOT_DEFINED**.

**NEXT:** continue WAIT-representation investment on typed contradiction (association established) — await Adam for the next representation step **or** stop. No unlock design, ALS/score, VAL, or HOLDOUT.

---

## Exact return block

```
FEATURE_STORY_JUSTIFIED: YES (prior — karen-contradiction-type-feature-story.md)
OUTCOME_RELATION_PREDECLARED: YES
OUTCOME_RELATION_STATUS: RUN_COMPLETED
measurement_id: m_contradiction_type_outcome_relation_v0
population: FORCE_WAIT shadow-ACT DEV stamps Y=1500
features: typed id + polarity (+ severity if stamped) — NOT count alone
outcomes: stamp GOOD/BAD — descriptive association only
RUN_AUTHORIZED: YES
RUN_COMPLETED: YES (2026-08-16)
MEANINGFUL_ASSOCIATION: YES
HETEROGENEITY_WITHIN_CC1: YES
KILL_WAIT_BRANCH: NO
triageVerdict: CONTINUE_WAIT_REPRESENTATION_WORK
C4_SINGLE_CHANGE: NOT_DEFINED
SELECTIVE_UNLOCK: PARKED
NEXT_SINGLE_ACTION: CONTINUE WAIT-representation on typed contradiction; no unlock / no c4; await Adam next step or stop
```
