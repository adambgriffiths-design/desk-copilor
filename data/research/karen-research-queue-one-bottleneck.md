# KAREN — Research queue: one bottleneck + five suspects

**DATE:** 2026-08-16  
**TREE:** `.tmp/karen-final-integration/` (mirrored to repo `data/research/`)  
**MODE:** documentation / governance only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**LOGIC:** no trading-logic / weight / threshold / experiment launch from this document  

---

## Adam’s framing (SoT)

You do **not** have six current bottlenecks.

You have:

1. **ONE current bottleneck** — evidence-representation richness **before** WAIT (Adam upstream reframing) — research direction `c4_shadow_quality_gated_wait` remains a label only, **not** a ready-to-score/implement candidate
2. **Five suspects queued behind it** — parked; attack only when Adam opens them

### UPSTREAM_BOTTLENECK (LOCKED)

Bottleneck is **no longer** “which WAITs should we unlock?”  
It **is:** “is Karen representing the quality and sequence of evidence richly enough before she reaches the WAIT decision?”

**Four audit areas (exactly):** (1) contradiction type (not count); (2) confirmation sequence / freshness; (3) liquidity meaning (taken vs breached vs interacted); (4) independent confluence vs duplicated/correlated reasons.

Selective one-knob unlock on the **current** feature set is **PARKED**. Alt one-knob scan **NONE_JUSTIFIED**. `C4_SINGLE_CHANGE=NOT_DEFINED`. Stamp dump is **done**; `h_c4_fw_unlock_cited_mss` is **DEFINE_BLOCK / CLOSED**. STOP_CONDITION **YES** → **ONE_FEATURE=contradiction_type** (measure only). Do **not** launch evidence-weighting, entry-timing, target/inv, regime, or execution experiments while selective unlock stays PARKED. Open queued suspect #1 (weighting) **only if Adam explicitly says so**.

### STOP_CONDITION (CLOSED — YES)

| Verdict | Action |
|---------|--------|
| **YES** (recorded) | Measure **ONE** PIT-safe representation: **contradiction_type** (not count). **No unlock now.** |
| **NO** (not taken) | Would **PARK FORCE_WAIT** as active research attack — only if typed measurement later fails a quality story. |

| Field | Value |
|-------|--------|
| **AUDIT_STATUS** | **complete** |
| **STOP_CONDITION** | **YES** |
| **ONE_FEATURE** | **contradiction_type** |
| **NEW_FEATURE_STORY_JUSTIFIED** | **YES** |

See [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md) · [`karen-wait-upstream-stop-condition.md`](./karen-wait-upstream-stop-condition.md) · [`karen-contradiction-type-measurement.md`](./karen-contradiction-type-measurement.md).

---

## Ordered queue

| Slot | Focus | Role |
|------|--------|------|
| **NOW** | Evidence-representation richness **before** WAIT (four audit areas) — selective unlock **PARKED** | **CURRENT_BOTTLENECK** — only active attack surface |
| **NEXT if WAIT isn’t enough** | Evidence weighting / conflict resolution (strong fresh cancelled by weak opposing; correlated double-count) | **QUEUED_SUSPECT #1** |
| **then** | Entry timing (right direction, late actionable → poor R:R) | **QUEUED_SUSPECT #2** |
| **then** | Target / invalidation geometry (separate “direction right?” from “T/S construction good?”) | **QUEUED_SUSPECT #3** |
| **then** | Remaining semantic confounders (EST-vs-CME PD; dual REH/REL) — parked correctly for now | **QUEUED_SUSPECT #4** |
| **then** | Regime dependence (pre/post 2024-06-24 — rule out data/features/session before `MARKET_REGIME`) | **QUEUED_SUSPECT #5** |
| **then** | Execution realism (fills / slippage / commissions / trade-mgmt before tradable edge) | Later gate — not a parallel bottleneck |
| **then** | OOS / VAL / holdout (per existing protocols; holdout sealed) | Protocol confirmation only — **HOLDOUT SEALED** |

**Prerequisite (already frozen, not a current bottleneck):** semantic baseline-v2 HEAD; v3/v4 candidates not promoted. Do not reopen invent-path baseline as a competing “current” hop.

---

## CURRENT_BOTTLENECK (only)

| Field | Value |
|-------|--------|
| **CURRENT** | Evidence-representation richness **before** WAIT (Adam upstream SoT) |
| **c4 posture** | Research direction only — **`C4_SINGLE_CHANGE=NOT_DEFINED`**, **no score** — cited_mss seed **DEFINE_BLOCK / CLOSED**; alt one-knob **NONE_JUSTIFIED**; selective unlock **PARKED**. **Not** ready-to-score / ready-to-implement |
| **id (direction)** | `c4_shadow_quality_gated_wait` |
| **pre-declare (text)** | `h_c4_fw_unlock_cited_mss` — **BLOCKED/CLOSED** — [`karen-c4-wait-hypothesis-predeclare.md`](./karen-c4-wait-hypothesis-predeclare.md) |
| **H-review** | [`karen-c4-h-review-cited-mss.md`](./karen-c4-h-review-cited-mss.md) — **ADAM_DECISION=DEFINE_BLOCK**; confound YES; Gate-10 34.1% |
| **alt scan** | [`karen-c4-alt-discriminator-scan.md`](./karen-c4-alt-discriminator-scan.md) — **BEST_ALT=NONE_JUSTIFIED** |
| **feature-gap lock** | [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md) — Adam SoT; **UPSTREAM_FRAMING=LOCKED**; **SELECTIVE_UNLOCK=PARKED**; **STOP_CONDITION** recorded |
| **problem** | Not “which WAIT to unlock” — whether evidence quality/sequence/liquidity/confluence is represented richly enough **before** the WAIT decision; current features cannot safely pick unlocks |
| **active pointer** | [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md) — Lane 1 typed repr **FROZEN**; outcome-relation **RUN_COMPLETED** → **CONTINUE_WAIT_REPRESENTATION_WORK**; feature-story [`karen-contradiction-type-feature-story.md`](./karen-contradiction-type-feature-story.md) |
| **diagnostic** | [`karen-c4-shadow-quality-gated-wait.md`](./karen-c4-shadow-quality-gated-wait.md) — RESEARCH_MORE |
| **in-flight / next** | **NEXT_SINGLE_ACTION:** outcome-relation `m_contradiction_type_outcome_relation_v0` **PASS** — MEANINGFUL_ASSOCIATION=YES · KILL_WAIT_BRANCH=NO ([`karen-contradiction-type-outcome-relation-measurement.md`](./karen-contradiction-type-outcome-relation-measurement.md)). **CONTINUE** WAIT-representation on typed contradiction; await Adam next representation step **or** stop. **ONE_FEATURE=contradiction_type**. Selective unlock **PARKED**. Do **not** open weighting unless Adam says so; do **not** score/unlock |
| **AUDIT_STATUS** | **complete** — STOP_CONDITION **YES**; **ONE_FEATURE=contradiction_type** |
| **closed** | Binary `c1_wait_entry_actionable` — **REJECT** promote; `h_c4_fw_unlock_cited_mss` — **DEFINE_BLOCK / CLOSED** as c4 seed; selective one-knob unlock on current features — **PARKED** |

---

## QUEUED_SUSPECTS (five — not parallel bottlenecks)

| # | Suspect | Why parked | Unpark when |
|--:|---------|------------|-------------|
| 1 | Evidence weighting / conflict | BOTH_SIDES ~10%; continuous margins largely NOT MEASURED; not justified while upstream WAIT representation audit is open | **Only if Adam explicitly says so** (STOP_CONDITION NO path, or WAIT path parked enough) **and** residual failure still looks like conflict/cancel |
| 2 | Entry timing | Direction may be right while late ACT destroys R:R | After selective WAIT unlock path is even on the table again — not now |
| 3 | Target / invalidation geometry | Must separate “direction right?” from “T/S construction good?” | After direction / entry timing are isolable |
| 4 | Semantic confounders (EST–CME PD; dual REH/REL) | Correctly parked; labeling confounders, not the current upstream attack | After WAIT path; measure before any weigher claim that depends on PD/eq-pool labels |
| 5 | Regime dependence (pre/post 2024-06-24) | Enormous opportunity gap — rule out data/features/session **before** `MARKET_REGIME` | After upstream hops; era-split measure-first only |

Execution realism and OOS/VAL/holdout sit **after** the five suspects. They are not additional “current bottlenecks.”

---

## Forbidden while CURRENT_BOTTLENECK is open

- Selective unlock mining / one-knob unlock experiments on the current feature set
- Launch evidence-weighting / conflict experiments (unless Adam opens)
- Launch entry-timing, target/inv, regime, or execution experiments
- Score / implement / register c4 or `h_c4_fw_unlock_cited_mss` (DEFINE_BLOCK’d) while `C4_SINGLE_CHANGE=NOT_DEFINED` / `CLEAR_PIT_SAFE_DISCRIMINATOR=NO`
- Treat research pre-declare as a ready-to-score single-change; do not resurrect blocked cited_mss / cc=1 renames
- Treat the five suspects as parallel bottlenecks
- Invent a STOP_CONDITION verdict that conflicts with the closed YES / contradiction_type SoT
- VAL peek / retune; HOLDOUT unlock
- Trading-logic / weight / threshold changes from this doc
- EDGE_CLAIM of any kind

---

## Relation to other SoT docs

| Document | Relationship |
|----------|--------------|
| [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md) | Upstream framing + STOP_CONDITION SoT |
| [`karen-wait-upstream-stop-condition.md`](./karen-wait-upstream-stop-condition.md) | Short pointer — STOP_CONDITION **YES** / **ONE_FEATURE=contradiction_type** |
| [`karen-contradiction-type-measurement.md`](./karen-contradiction-type-measurement.md) | Typed contradiction frequency measurement (dump map) |
| [`karen-contradiction-type-feature-story.md`](./karen-contradiction-type-feature-story.md) | Feature-story audit — typed objects recommended; PIT-safe; no unlock |
| [`karen-contradiction-type-outcome-relation-predeclare.md`](./karen-contradiction-type-outcome-relation-predeclare.md) | `m_contradiction_type_outcome_relation_v0` RUN_COMPLETED — CONTINUE_WAIT_REPRESENTATION_WORK; unlock PARKED |
| [`karen-contradiction-type-outcome-relation-measurement.md`](./karen-contradiction-type-outcome-relation-measurement.md) | Type×GOOD/BAD association PASS; KILL_WAIT_BRANCH=NO |
| [`karen-first-broken-hop-diagnostic-pipeline.md`](./karen-first-broken-hop-diagnostic-pipeline.md) | Hop chain; CURRENT = upstream evidence representation before WAIT; rest = QUEUED_SUSPECTS |
| [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md) | Bottleneck pointer — NEXT = CONTINUE WAIT-representation (outcome-relation PASS); c4 = **RESEARCH_MORE / NOT_DEFINED** |
| [`karen-trading-brain-hypothesis-backlog.md`](./karen-trading-brain-hypothesis-backlog.md) | Hypotheses map onto this queue; backlog order does not authorize parallel attacks |
| [`karen-evidence-weighting-conflict-diagnostic.md`](./karen-evidence-weighting-conflict-diagnostic.md) | Suspect #1 artifacts — **DEFER / QUEUED**, not active |
| [`karen-dev-to-validation-protocol.md`](./karen-dev-to-validation-protocol.md) | Promotion gates after a hop-local fix — does not reorder this queue |
| [`karen-walk-forward-oos-protocol.md`](./karen-walk-forward-oos-protocol.md) | Temporal robustness **after** a candidate exists — holdout sealed |

---

## Sync

Canonical copies:

- `data/research/karen-research-queue-one-bottleneck.md` (repo)
- `.tmp/karen-final-integration/data/research/karen-research-queue-one-bottleneck.md` (integration tree)

---

## Changelog

| Time | Change |
|------|--------|
| 2026-08-15 | Initial lock — Adam one-bottleneck + five queued suspects SoT |
| 2026-08-15 | Reconcile: CURRENT = WAIT quality (still); c4 = RESEARCH_MORE / NOT_DEFINED (not scoreable); in-flight = FORCE_WAIT shadow stamp dump; binary c1 REJECT |
| 2026-08-15 | Stamp dump done; pre-declare `h_c4_fw_unlock_cited_mss` (text only); c4 still NOT_DEFINED; next = §2 clearance bins |
| 2026-08-15 | §2 clearance measured (panel∩stamps n=104; never 71%; cited_mss HARMFUL_SUPPRESSION 62%); next = Adam H review — still no score |
| 2026-08-16 | H-review gaps 1–2 closed (`karen-c4-h-review-cited-mss.md`): cited_mss≈cc=1; Gate-10 unlock-all ACT 34.1%; CURRENT=WAIT quality; c4 still NOT_DEFINED; next = Adam define-block / stricter subset |
| 2026-08-16 | **ADAM_DECISION=DEFINE_BLOCK** for `h_c4_fw_unlock_cited_mss` (CLOSED as c4 seed); alt discriminator scan **NONE_JUSTIFIED** (`karen-c4-alt-discriminator-scan.md`); CURRENT remains WAIT quality; c4 still NOT_DEFINED |
| 2026-08-16 | Adam locked feature-gap SoT ([`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md)): selective unlock **PARKED**; attack = new at-t features (default A); weighting only if Adam opens |
| 2026-08-16 | **Upstream reframing LOCKED:** CURRENT = evidence-representation richness before WAIT; four audit areas; STOP_CONDITION recorded; NEXT = await audit YES/NO; AUDIT_STATUS pending |
| 2026-08-16 | Feature-story **YES**; outcome-relation predeclare `m_contradiction_type_outcome_relation_v0` written — **RUN_AUTHORIZED=NO**; NEXT = await Adam RUN or stop |
| 2026-08-16 | Outcome-relation **RUN_COMPLETED** — MEANINGFUL_ASSOCIATION=YES · HETEROGENEITY_WITHIN_CC1=YES · KILL_WAIT_BRANCH=NO → **CONTINUE_WAIT_REPRESENTATION_WORK**; unlock still PARKED; NEXT = await Adam next representation step or stop |

**EDGE_CLAIM:** NONE  
**HOLDOUT_STATUS:** SEALED  
**VAL:** DO NOT TOUCH  
