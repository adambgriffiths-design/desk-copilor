# KAREN — Next single-change DEV candidate (A vs B dual diagnostic)

**DATE:** 2026-08-16 (reconciled: AUDIT **complete**; STOP_CONDITION **YES**; ONE_FEATURE **contradiction_type**; selective unlock **PARKED**; c4 NOT_DEFINED; BEST_ALT **NONE_JUSTIFIED**)  
**TREE:** `.tmp/karen-final-integration/` (mirrored here)  
**MODE:** measurement / research — **READY_TO_IMPLEMENT: N** · **READY_TO_SCORE: N**  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** c1 one-shot consumed → quality **FAIL** (proxyR); **no second VAL**; do not promote  
**BASELINE:** baseline-v2 (FROZEN HEAD; v3/v4 not promoted)

---

## SUPERSESSION

| Prior | Status |
|-------|--------|
| ONE_NEXT = binary `c1_wait_entry_actionable` (implement / promote) | **SUPERSEDED** — **REJECT** promote; **not** the implement-next step |
| Re-gate after Y=1500 smoke clears | **DONE** — Y=1500 + VAL ingested |
| c4 as ready-to-score / implement-next single-change | **NOT_DEFINED** — research direction only until a clear PIT-safe discriminator is pre-declared |
| “Which WAITs unlock?” as active bottleneck | **SUPERSEDED** — Adam upstream: evidence-representation richness **before** WAIT |

Authoritative c1: `exp-c1-wait-entry-actionable-dev-y1500-2026-08-15` · `decision=reject` · see `karen-dev-candidate-c1-protocol-decision.md`.

---

## Dual ranking (explanatory power + outcome impact)

| Rank | Component | Why |
|-----:|-----------|-----|
| **1** | **Evidence representation before WAIT** | Adam SoT — quality/sequence/liquidity/confluence richness upstream of the WAIT decision; selective unlock **PARKED** |
| **1b** | **ENTRY_STATUS_FORCE_WAIT / entry gate** | Still ~**90%** of WAIT primary — explanatory power remains high, but attack is **not** unlock mining; binary removal failed VAL quality + Gate 10 |
| **2** | **Evidence weighting / conflict** | BOTH_SIDES ~**10%**; c2 ACT worse on Y=1500. **DEFER** — Adam-open only |

**FIRST_BROKEN (policy):** still `ENTRY_STATUS_FORCE_WAIT` after one-sided support — **binary removal is closed**; selective unlock **PARKED**.

---

## CURRENT bottleneck + c4 research direction (NOT a scoreable candidate)

| Field | Value |
|-------|--------|
| **CURRENT bottleneck** | Evidence-representation richness **before** WAIT (Adam upstream SoT) |
| **Four audit areas** | (1) contradiction type; (2) confirmation sequence/freshness; (3) liquidity meaning (taken vs breached vs interacted); (4) independent confluence vs duplicated/correlated reasons |
| **c4 status** | **`C4_SINGLE_CHANGE=NOT_DEFINED`** · **no score** — cited_mss seed **DEFINE_BLOCK / CLOSED**; alt one-knob **NONE_JUSTIFIED**; selective unlock **PARKED** ([`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md)); still no clear PIT-safe discriminator |
| **id (direction)** | `c4_shadow_quality_gated_wait` |
| **intended shape (when defined)** | Keep default FORCE_WAIT for `entryStatus==="WAIT"`; allow directional LONG/SHORT **only when** a pre-declared **shadow quality + brief-delay class** predicate passes (one knob). Permanent-suppress / low-quality shadows stay WAIT. `EXTENDED` always forces WAIT. **Not** binary global WAIT→actionable. **Not on the table until STOP_CONDITION YES + measured feature work.** |
| **hypothesis (direction)** | Binary c1 unlocked ~76% ACT and VAL proxyR worsened. Selective unlock of delay-class stamps whose shadow quality clears a floor *might* relieve overcaution without Gate-10 spam / OOS expectancy collapse — **unproven; no predicate yet**; unlock path **PARKED** |
| **expected_effect (when scored)** | Moderate WAIT→ACT (≪ c1’s 1074); ACT rate under promote frequency bar; DEV T-before / mean proxyR must not degrade vs paired baseline. |
| **failure_condition (when scored)** | Gate 10 fail **or** T-before/proxyR worse than paired baseline **or** PIT>0 → REJECT/RESEARCH_MORE; never promote; **no VAL** until DEV promote gates pass. |
| **registry** | Do **not** register / score c4 until discriminator is pre-declared. Do **not** reuse c1 fingerprint. Closed: `exp-c1-wait-entry-actionable-dev-y1500-2026-08-15` reject. Diagnostic: **C4_DEFINED NO** (no score row). |
| **hint doc** | [`karen-next-single-change-hint-after-c1-val.md`](./karen-next-single-change-hint-after-c1-val.md) |
| **diagnostic** | [`karen-c4-shadow-quality-gated-wait.md`](./karen-c4-shadow-quality-gated-wait.md) — stamp dump N=1075 done; `CLEAR_PIT_SAFE_DISCRIMINATOR=NO` → **C4 still NOT_DEFINED**; no ALS path |
| **pre-declare (research text)** | [`karen-c4-wait-hypothesis-predeclare.md`](./karen-c4-wait-hypothesis-predeclare.md) — **`h_c4_fw_unlock_cited_mss`** **BLOCKED/CLOSED** (DEFINE_BLOCK) |
| **H-review** | [`karen-c4-h-review-cited-mss.md`](./karen-c4-h-review-cited-mss.md) — **ADAM_DECISION=DEFINE_BLOCK**; confound YES; Gate-10 34.1%; **C4 NOT_DEFINED** |
| **alt discriminator scan** | [`karen-c4-alt-discriminator-scan.md`](./karen-c4-alt-discriminator-scan.md) — **BEST_ALT=NONE_JUSTIFIED** |
| **feature-gap lock** | [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md) — **UPSTREAM_FRAMING=LOCKED**; **SELECTIVE_UNLOCK=PARKED**; **STOP_CONDITION=YES**; **ONE_FEATURE=contradiction_type** |
| **stop condition pointer** | [`karen-wait-upstream-stop-condition.md`](./karen-wait-upstream-stop-condition.md) |
| **AUDIT_STATUS** | **complete** |
| **STOP_CONDITION** | **YES** |
| **ONE_FEATURE** | **contradiction_type** |
| **typed measurement** | [`karen-contradiction-type-measurement.md`](./karen-contradiction-type-measurement.md) — frequency/co-occurrence **PASS** (typed stamps; no unlock) |
| **feature-story audit** | [`karen-contradiction-type-feature-story.md`](./karen-contradiction-type-feature-story.md) — **FEATURE_STORY_JUSTIFIED=YES**; typed objects recommended; no unlock |
| **representation spec** | [`karen-contradiction-representation-spec-v1.md`](./karen-contradiction-representation-spec-v1.md) — **FROZEN** `contradiction_repr_v1` |
| **engine coverage** | [`karen-contradiction-engine-coverage.md`](./karen-contradiction-engine-coverage.md) — schema carries all emitables |
| **provenance** | [`karen-contradiction-type-provenance.md`](./karen-contradiction-type-provenance.md) — additive/deterministic **PASS** |
| **type-vs-count** | [`karen-contradiction-type-vs-count-predeclare.md`](./karen-contradiction-type-vs-count-predeclare.md) · measurement **RICHER=YES** |
| **outcome-relation** | [`karen-contradiction-type-outcome-relation-predeclare.md`](./karen-contradiction-type-outcome-relation-predeclare.md) · measurement [`karen-contradiction-type-outcome-relation-measurement.md`](./karen-contradiction-type-outcome-relation-measurement.md) — `m_contradiction_type_outcome_relation_v0` **RUN_COMPLETED** · MEANINGFUL_ASSOCIATION=**YES** · KILL_WAIT_BRANCH=**NO** · triage **CONTINUE_WAIT_REPRESENTATION_WORK** |
| **stamp dump** | `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json` (+ `.jsonl` / `.schema.md`) — typed `contradictionItems` |
| **implementation / score** | **N** — Production ALS stays `none`. Pre-declare ≠ c4 predicate. **Not** ready-to-score. Do **not** open weighting / audit areas 2–4 / unlock / VAL. |

### Explicit non-candidates

| id | Why not |
|----|---------|
| `c1_wait_entry_actionable` | **REJECT** promote — Gate 10 + VAL proxyR; **not** implement-next |
| Flip FORCE_WAIT off globally | Same as binary c1 |
| Selective one-knob unlock (current features) | **PARKED** — BEST_ALT NONE_JUSTIFIED |
| `c2_min_reasons_1` / `c3_widen_entry_band` | Fail / null on Y=1500 |
| Weight / conflict rewrite | Track B minority — DEFER (Adam-open only) |
| Evidence-conflict-only | Not justified while upstream representation audit is CURRENT |
| Score / implement c4 now | **C4_SINGLE_CHANGE=NOT_DEFINED** — no PIT-safe discriminator pre-declared |

---

## Track A summary (ingest — finalized)

| Item | Value |
|------|--------|
| EXACT_GATE_PREDICATE | `shouldForceEntryWait` true when `WAIT\|EXTENDED` + XOR support → WAIT |
| CURRENT_ACTIONABLE | N=71 · T-before≈0.195 · proxyR≈−0.330 (dual-audit) |
| COUNTERFACTUAL Y=1500 c1 | WAIT→ACT 1074 · T-before 58.1% · proxyR 0.314 · ACT rate ~76% |
| VAL c1 | T-before lift · proxyR **−0.561 → −1.053** (worse) → back to DEV |
| GATE_CONCLUSION | **KEEP_GATE (prod)** + **REJECT binary c1** + **RESEARCH_MORE `c4_shadow_quality_gated_wait`** (NOT_DEFINED) + selective unlock **PARKED** |

Full note: `karen-entry-status-force-wait-bottleneck.md`.

## Track B summary

| Item | Value |
|------|--------|
| BOTH_SIDES share | ~10% of WAIT |
| Conclusion | **DEFER** weighting — Adam-open only; not open while CURRENT = upstream evidence representation |

Full note: `karen-evidence-weighting-conflict-diagnostic.md`.

---

## NEXT_SINGLE_ACTION

**Outcome-relation RUN_COMPLETED** — `m_contradiction_type_outcome_relation_v0` **PASS**: MEANINGFUL_ASSOCIATION=**YES** · HETEROGENEITY_WITHIN_CC1=**YES** · KILL_WAIT_BRANCH=**NO** → triage **CONTINUE_WAIT_REPRESENTATION_WORK** ([`karen-contradiction-type-outcome-relation-measurement.md`](./karen-contradiction-type-outcome-relation-measurement.md)). Spec frozen: [`karen-contradiction-representation-spec-v1.md`](./karen-contradiction-representation-spec-v1.md). **NEXT:** CONTINUE WAIT-representation on typed contradiction — await Adam next representation step **or** stop. Selective unlock **PARKED**. **c4 remains NOT_DEFINED**. **Do not** open weighting, audit areas 2–4, unlock, ALS/registry score, or VAL. HOLDOUT sealed. EDGE_CLAIM NONE.

| Field | Value |
|-------|--------|
| **AUDIT_STATUS** | **complete** |
| **STOP_CONDITION** | **YES** |
| **ONE_FEATURE** | **contradiction_type** |
| **SELECTIVE_UNLOCK** | **PARKED** |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |

---

## See also (queue lock)

**Research queue SoT:** [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md) — **CURRENT = evidence-representation richness before WAIT**; selective unlock **PARKED**; **AUDIT_STATUS=complete**; **STOP_CONDITION=YES**; **ONE_FEATURE=contradiction_type**; c4 = research direction / **NOT_DEFINED**; alt scan **NONE_JUSTIFIED**. Evidence weighting stays **QUEUED** (Adam-open only). Binary c1 remains **REJECT**.

**READY_TO_IMPLEMENT:** N  
**READY_TO_SCORE:** N  
**READY_FOR_ADAM:** N  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
