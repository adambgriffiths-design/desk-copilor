# KAREN — contradiction type adds info beyond count (PREDECLARE)

**DATE:** 2026-08-16  
**MODE:** measurement pre-registration (+ authorized to RUN after typed stamp verify)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**SELECTIVE_UNLOCK:** PARKED · **C4_SINGLE_CHANGE:** NOT_DEFINED  
**ALS / score / unlock / trading behavior:** none  
**OUTCOMES_INSPECTED:** NO (forbidden)

---

## Measurement id

| Field | Value |
|-------|--------|
| **measurement_id** | `m_contradiction_type_adds_info_beyond_count_v0` |
| **status** | **PREDECLARED** — RUN after typed representation stamped + provenance PASS |
| **kind** | outcome-blind representation richness |
| **not** | outcome relation, unlock predicate, c4, ALS, score |

---

## Question (exactly one)

**Does representing contradiction type add information beyond `contradictionCount`?**

---

## Population

FORCE_WAIT shadow-ACT DEV stamps Y=1500 — same carve as typed stamp dump  
`force-wait-shadow-stamps-y1500-latest.json` (typed `contradictionItems`).

---

## Analysis plan (no outcomes)

1. Entropy of count bins vs entropy of typed taxonomy / type-combo  
2. Conditional entropy **H(type | count)**  
3. Distinct typed cells under each count bin (especially `cc===1`)  
4. Co-occurrence structure among typed ids  

**Forbidden on this measurement:** GOOD/BAD, proxyR, MFE/MAE, clearance, profitability, unlock design.

---

## Success criterion (representation only)

| Verdict | Criterion |
|---------|-----------|
| **RICHER = YES** | H(type\|count) > 0.01 **or** >1 distinct taxonomy cell under `contradictionCount===1` |
| **RICHER = NO** | Type collapses to count (no residual information) |

---

## Governance

Outcome-relation (`m_contradiction_type_outcome_relation_v0`) stays **DEFERRED** until this measurement shows **RICHER=YES**.

**RUN_AUTHORIZED:** YES after Lane-1 stamp + provenance PASS (Adam sequence: stamp → verify → predeclare → measure richness; outcomes later).
