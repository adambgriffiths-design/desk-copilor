# KAREN — WAIT quality feature-gap lock (Adam SoT)

**DATE:** 2026-08-16  
**MODE:** documentation / governance only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**ALS / score registry / production / trading code:** none — do **not** score, register, implement, or commit from this lock

---

## LOCKED_FINDING (Adam — do not argue)

> FORCE_WAIT is demonstrably suppressing some GOOD opportunities, but the current features do not tell us safely which individual WAITs should be released.

Record as SoT. Do not argue against it.

---

## UPSTREAM_BOTTLENECK (Adam reframing — LOCKED)

Bottleneck is **no longer** “which WAITs should we unlock?”

It **is:** “is Karen representing the quality and sequence of evidence richly enough before she reaches the WAIT decision?”

| Field | Value |
|-------|--------|
| **UPSTREAM_FRAMING** | **LOCKED** |
| **Attack mode** | Evidence-representation richness **before** WAIT |
| **SELECTIVE_UNLOCK** | **PARKED** |
| **BEST_ALT** | **NONE_JUSTIFIED** |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| **EDGE_CLAIM** | **NONE** |
| **HOLDOUT** | **SEALED** |

### Four audit areas (exactly)

1. **Contradiction type** (not count)
2. **Confirmation sequence / freshness**
3. **Liquidity meaning** (taken vs breached vs interacted)
4. **Independent confluence** vs duplicated/correlated reasons

Do not reopen unlock-subset mining on the current feature set while this framing holds.

---

## Evidence pointers

| Pointer | Status | Doc / note |
|---------|--------|------------|
| **c1 REJECT** | Global unlock fails | Binary `c1_wait_entry_actionable` — Gate 10 + VAL proxyR **REJECT**; see `karen-dev-candidate-c1-protocol-decision.md` / next-single-change Track A |
| **cited_mss DEFINE_BLOCK** | Collinear + Gate-10 fail | [`karen-c4-h-review-cited-mss.md`](./karen-c4-h-review-cited-mss.md) — `cited_mss` ≈ `contradictionCount===1` (φ≈0.938, agreement 97%); unlock-all projects Gate-10 ACT **34.1%** |
| **alt scan NONE_JUSTIFIED** | No clean one-knob replacement | [`karen-c4-alt-discriminator-scan.md`](./karen-c4-alt-discriminator-scan.md) — **BEST_ALT=NONE_JUSTIFIED** on current `featuresAtT` |
| **mechanism review** | **DONE** | [`karen-force-wait-good-bad-mechanism-review.md`](./karen-force-wait-good-bad-mechanism-review.md) — **NEW_FEATURE_STORY_JUSTIFIED=YES** |
| **contradiction semantics** | **DONE** | [`karen-force-wait-contradiction-semantics.md`](./karen-force-wait-contradiction-semantics.md) — **CONTRADICTION_COUNT_LOSSY=YES**; type justified |
| **contradiction feature-story** | **DONE** | [`karen-contradiction-type-feature-story.md`](./karen-contradiction-type-feature-story.md) — **FEATURE_STORY_JUSTIFIED=YES**; typed objects recommended |
| **decision-path audit** | **DONE** | [`karen-force-wait-decision-path-audit.md`](./karen-force-wait-decision-path-audit.md) — lossy steps ranked; one next instrument |

**AUDIT_STATUS:** **complete** — STOP_CONDITION verdict **YES** (one representation).

---

## IMPLICATION

**Park selective one-knob unlock on the *current* feature set.**

FORCE_WAIT over-suppression is real; safe per-stamp release is not — not with today’s observables. Mining unlock knobs on cc=1 / cited_mss renames, count bins, or side/model asymmetries is closed under this lock.

Upstream work is **representation richness before WAIT**, not unlock selection.

| Field | Value |
|-------|--------|
| **SELECTIVE_UNLOCK** | **PARKED** (current feature set) |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** |
| **CURRENT bottleneck** | Evidence quality / sequence **representation before WAIT** (not which WAITs to unlock) |
| **Attack mode** | Instrument **one** PIT-safe representation — **contradiction type (not count)** — measure only; unlock stays PARKED |

---

## STOP_CONDITION

| Field | Value |
|-------|--------|
| **STOP_CONDITION** | **CLOSED** |
| **NEW_FEATURE_STORY_JUSTIFIED** | **YES** |
| **ONE representation** | **contradiction type (not count)** |
| **Action** | Measure/instrument that one feature only. **No unlock now.** No score / VAL / ALS. |
| **If measurement fails later** | Then **PARK FORCE_WAIT** as active research attack — no subset-hunting |

Deferred (not next): confirmation sequence/freshness; liquidity meaning; independent vs duplicated reasons.

---

## What would unstick (this YES branch)

Instrument **contradiction type (not count)** at *t* (reuse typed `ContradictionReport` ids + structure↔bias polarity). Measure frequency/co-occurrence only.

Still not:

- Rename / near-collinear of `contradictionCount===1` or `cited_mss`
- Post-hoc n≤229 carve from blocked seeds
- proxyR / outcome / delay-class mining
- Selective unlock on the current feature set

Any future discriminator must stay **Gate-10 aware** (Y=1500 unlock budget n∈[~50, 229] given baseline ACT≈71).

---

## NEXT_SINGLE_ACTION

**Lane 1 typed representation frozen** — [`karen-contradiction-representation-spec-v1.md`](./karen-contradiction-representation-spec-v1.md) (`contradiction_repr_v1`). Provenance **PASS** · engine coverage **YES** · type-vs-count **RICHER=YES**. Outcome-relation **RUN_COMPLETED** — MEANINGFUL_ASSOCIATION=YES · KILL_WAIT_BRANCH=NO → **CONTINUE_WAIT_REPRESENTATION_WORK** ([`karen-contradiction-type-outcome-relation-measurement.md`](./karen-contradiction-type-outcome-relation-measurement.md)). Feature-story prior: [`karen-contradiction-type-feature-story.md`](./karen-contradiction-type-feature-story.md) (**YES**). **NEXT:** CONTINUE WAIT-representation on typed contradiction — await Adam next representation step **or** stop. **No unlock / score / VAL**. Selective unlock **PARKED**. Do not open weighting / areas 2–4 unless Adam says so. EDGE_CLAIM NONE. HOLDOUT SEALED.

| Field | Value |
|-------|--------|
| **AUDIT_STATUS** | **complete** |
| **STOP_CONDITION** | **YES** |
| **ONE_FEATURE** | **contradiction_type** |
| **SELECTIVE_UNLOCK** | **PARKED** |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |

---

## Governance snapshot

| Field | Value |
|-------|--------|
| **UPSTREAM_FRAMING** | **LOCKED** |
| **LOCKED** | **YES** |
| **SELECTIVE_UNLOCK** | **PARKED** |
| **BEST_ALT** | **NONE_JUSTIFIED** |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** |
| **AUDIT_STATUS** | **complete** |
| **STOP_CONDITION** | **YES → contradiction type (not count)** |
| **NEW_FEATURE_STORY_JUSTIFIED** | **YES** |
| **EDGE_CLAIM** | **NONE** |
| **HOLDOUT** | **SEALED** |

**Related:** [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md) · [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md) · [`karen-force-wait-contradiction-semantics.md`](./karen-force-wait-contradiction-semantics.md)
