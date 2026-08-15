# KAREN — Next single-change DEV candidate (A vs B dual diagnostic)

**DATE:** 2026-08-15 (reconciled: c4 RESEARCH_MORE / NOT_DEFINED; pre-declare `h_c4_fw_unlock_cited_mss` text only)  
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

Authoritative c1: `exp-c1-wait-entry-actionable-dev-y1500-2026-08-15` · `decision=reject` · see `karen-dev-candidate-c1-protocol-decision.md`.

---

## Dual ranking (explanatory power + outcome impact)

| Rank | Component | Why |
|-----:|-----------|-----|
| **1** | **ENTRY_STATUS_FORCE_WAIT / entry gate** | Still ~**90%** of WAIT primary — **#1 by explanatory power**. Binary removal failed VAL quality + Gate 10 → hop stays first-broken; next fix must be **refined**, not global flip. |
| **2** | **Evidence weighting / conflict** | BOTH_SIDES ~**10%**; c2 ACT worse on Y=1500. **DEFER** — not justified while WAIT quality discrimination remains CURRENT. |
| — | Entry timing / target-inv | Later hops after selective WAIT diagnosis. |

**FIRST_BROKEN (policy):** still `ENTRY_STATUS_FORCE_WAIT` after one-sided support — **binary removal is closed**.

---

## CURRENT bottleneck + c4 research direction (NOT a scoreable candidate)

| Field | Value |
|-------|--------|
| **CURRENT bottleneck** | **WAIT quality discrimination** (still) |
| **c4 status** | **RESEARCH_MORE** · **`C4_SINGLE_CHANGE=NOT_DEFINED`** · **no score** — research direction only until a clear PIT-safe discriminator is pre-declared |
| **id (direction)** | `c4_shadow_quality_gated_wait` |
| **intended shape (when defined)** | Keep default FORCE_WAIT for `entryStatus==="WAIT"`; allow directional LONG/SHORT **only when** a pre-declared **shadow quality + brief-delay class** predicate passes (one knob). Permanent-suppress / low-quality shadows stay WAIT. `EXTENDED` always forces WAIT. **Not** binary global WAIT→actionable. |
| **hypothesis (direction)** | Binary c1 unlocked ~76% ACT and VAL proxyR worsened. Selective unlock of delay-class stamps whose shadow quality clears a floor *might* relieve overcaution without Gate-10 spam / OOS expectancy collapse — **unproven; no predicate yet**. |
| **expected_effect (when scored)** | Moderate WAIT→ACT (≪ c1’s 1074); ACT rate under promote frequency bar; DEV T-before / mean proxyR must not degrade vs paired baseline. |
| **failure_condition (when scored)** | Gate 10 fail **or** T-before/proxyR worse than paired baseline **or** PIT>0 → REJECT/RESEARCH_MORE; never promote; **no VAL** until DEV promote gates pass. |
| **registry** | Do **not** register / score c4 until discriminator is pre-declared. Do **not** reuse c1 fingerprint. Closed: `exp-c1-wait-entry-actionable-dev-y1500-2026-08-15` reject. Diagnostic: **C4_DEFINED NO** (no score row). |
| **hint doc** | [`karen-next-single-change-hint-after-c1-val.md`](./karen-next-single-change-hint-after-c1-val.md) |
| **diagnostic** | [`karen-c4-shadow-quality-gated-wait.md`](./karen-c4-shadow-quality-gated-wait.md) — stamp dump N=1075 done; `CLEAR_PIT_SAFE_DISCRIMINATOR=NO` → **C4 still NOT_DEFINED**; no ALS path |
| **pre-declare (research text)** | [`karen-c4-wait-hypothesis-predeclare.md`](./karen-c4-wait-hypothesis-predeclare.md) — **`h_c4_fw_unlock_cited_mss`** (FORCE_WAIT ∧ `cited_mss===true`); **not** a scored/implemented single-change |
| **stamp dump** | `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json` (+ `.jsonl` / `.schema.md`) |
| **implementation / score** | **N** — Production ALS stays `none`. Pre-declare ≠ c4 predicate. **Not** ready-to-score. |

### Explicit non-candidates

| id | Why not |
|----|---------|
| `c1_wait_entry_actionable` | **REJECT** promote — Gate 10 + VAL proxyR; **not** implement-next |
| Flip FORCE_WAIT off globally | Same as binary c1 |
| `c2_min_reasons_1` / `c3_widen_entry_band` | Fail / null on Y=1500 |
| Weight / conflict rewrite | Track B minority — DEFER |
| Evidence-conflict-only | Not justified while FORCE_WAIT remains #1 explanatory |
| Score / implement c4 now | **C4_SINGLE_CHANGE=NOT_DEFINED** — no PIT-safe discriminator pre-declared |

---

## Track A summary (ingest — finalized)

| Item | Value |
|------|--------|
| EXACT_GATE_PREDICATE | `shouldForceEntryWait` true when `WAIT\|EXTENDED` + XOR support → WAIT |
| CURRENT_ACTIONABLE | N=71 · T-before≈0.195 · proxyR≈−0.330 (dual-audit) |
| COUNTERFACTUAL Y=1500 c1 | WAIT→ACT 1074 · T-before 58.1% · proxyR 0.314 · ACT rate ~76% |
| VAL c1 | T-before lift · proxyR **−0.561 → −1.053** (worse) → back to DEV |
| GATE_CONCLUSION | **KEEP_GATE (prod)** + **REJECT binary c1** + **RESEARCH_MORE `c4_shadow_quality_gated_wait`** (NOT_DEFINED) |

Full note: `karen-entry-status-force-wait-bottleneck.md`.

## Track B summary

| Item | Value |
|------|--------|
| BOTH_SIDES share | ~10% of WAIT |
| Conclusion | **DEFER** weighting — not open while CURRENT = WAIT quality |

Full note: `karen-evidence-weighting-conflict-diagnostic.md`.

---

## NEXT_SINGLE_ACTION

Stamp dump **done** (N=1075). Research pre-declare **done:** `h_c4_fw_unlock_cited_mss` — **c4 remains NOT_DEFINED** (`CLEAR_PIT_SAFE_DISCRIMINATOR=NO`). §2 clearance **done** (panel n=104; never 71.2%; cited_mss HARMFUL_SUPPRESSION 61.7% — failure #4 does not fire). Next: **Adam review** whether H may become a registered c4 single-change — **still no** ALS path / registry score / VAL. **Do not** implement binary c1. **Do not** open weighting / conflict. HOLDOUT sealed. EDGE_CLAIM NONE.

---

## See also (queue lock)

**Research queue SoT:** [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md) — **CURRENT = WAIT quality discrimination (still)**; c4 = research direction / **NOT_DEFINED**; stamp dump done; pre-declare `h_c4_fw_unlock_cited_mss` (text only). Evidence weighting and other suspects stay **QUEUED**. Binary c1 remains **REJECT**.

**READY_TO_IMPLEMENT:** N  
**READY_TO_SCORE:** N  
**READY_FOR_ADAM:** N  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
