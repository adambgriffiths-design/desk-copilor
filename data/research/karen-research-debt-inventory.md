# KAREN — Research debt inventory (docs only)

**DATE:** 2026-08-16  
**MODE:** documentation audit only — no new hypotheses, no score/ALS/VAL/HOLDOUT, no implement/commit  
**SCOPE:** `data/research/*.md` (primary); skim `data/karen-decision-validation/**/reports/*.md`; `.tmp/karen-final-integration/data/research/` only for mirror drift notes  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  

---

## METHOD

1. Grep/search status tokens across `data/research/*.md`: `RESEARCH_MORE`, `NOT_DEFINED`, `BLOCKED`, `DEFINE_BLOCK`, `OPEN`, `PENDING`, `PARKED`, `NONE_JUSTIFIED`, `NOT MEASURED`, `NEXT_SINGLE_ACTION`, `READY_TO_SCORE`, `READY_TO_IMPLEMENT`, `CLEAR_PIT_SAFE`, `AUDIT_STATUS`, `STOP_CONDITION`, `QUEUED_SUSPECT`, `DEFER`, `SUPERSEDED`, unfinished follow-ups.
2. Extract each outstanding item as a row (id/slug, status, one-line description, source, date if present, bottleneck relation).
3. Deduplicate: same debt repeated across docs → one canonical row + pointer list.
4. Rank by **decision impact** (would resolving change a concrete next decision?):
   - **A** — resolving changes a live decision gate now
   - **B** — clarifying / bookkeeping / parked queue; low immediate decision value
   - **C** — obsolete / superseded / no longer matters given locks (c1 REJECT, cited_mss DEFINE_BLOCK, selective unlock PARKED, unlock mining closed)
5. Prefer repo `data/research/` over `.tmp/...` mirrors. Note: several SoT files **DIFF** between trees (including queue + feature-gap lock); treat **repo** copies as inventory sources.

**Not inventoried as research debt:** conversational/UX smoke TODOs, weather routing failures, generic protocol definitions of RESEARCH_MORE (gate language), or outcome-label INCONCLUSIVE cells inside finished measurements.

---

## LOCKED_CONTEXT

| Field | Value (current SoT) |
|-------|---------------------|
| **SELECTIVE_UNLOCK** | **PARKED** (current feature set) |
| **CURRENT bottleneck** | Evidence-representation richness **before** WAIT (not “which WAITs unlock?”) |
| **STOP_CONDITION** | Recorded as YES/NO gate on the four-area audit; **workstream reports + feature-gap lock record YES** — see drift row below |
| **BEST_ALT** | **NONE_JUSTIFIED** |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** |
| **EDGE_CLAIM** | **NONE** |
| **HOLDOUT** | **SEALED** |
| **VAL** | DO NOT TOUCH |
| **READY_TO_SCORE / READY_TO_IMPLEMENT** | **N** |

**Canonical locks:**  
[`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md) · [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md) · [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md)

---

## DEDUPED_TABLE (ranked A → C)

| Rank | id / slug | Status | One-line description | Sources (canonical first) | Date | Bottleneck relation |
|:----:|-----------|--------|----------------------|---------------------------|------|---------------------|
| **A** | `sot-audit-status-drift` | **CLOSED** | Queue / next-candidate / stop-pointer reconciled to **AUDIT_STATUS=complete**, **STOP_CONDITION=YES**, **ONE_FEATURE=contradiction_type** (match feature-gap lock + three audit reports). | four SoT docs listed in CRITICAL follow-up | 2026-08-16 | WAIT upstream / stop gate |
| **A** | `instrument-contradiction-type` | **MEASURED (PASS)** · not scored | Frequency/co-occurrence from dump string→typed map done; under cc=1: **3** taxonomy types; type more informative than count. No unlock/score/VAL. | `karen-contradiction-type-measurement.md`; JSON under acquisition/reports | 2026-08-16 | WAIT upstream (selected of four areas) |
| **A** | `c4_single_change` | **NOT_DEFINED** · **READY_TO_SCORE: N** · **READY_TO_IMPLEMENT: N** | c4 remains a research direction label only; no PIT-safe discriminator pre-declared; do not score/register/implement. | `karen-next-single-change-dev-candidate.md`; `karen-c4-shadow-quality-gated-wait.md`; `karen-dv-experiment-registry.md`; schema `force-wait-shadow-stamps-y1500.schema.md` | 2026-08-15→16 | c4 |
| **A** | `clear_pit_safe_discriminator` | **NO** | Explicit stop: no clear PIT-safe unlock discriminator on current `featuresAtT`; inventing a weak rule forbidden. | `karen-c4-shadow-quality-gated-wait.md`; feature-gap lock; H-review; alt scan | 2026-08-15→16 | c4 / selective unlock |
| **B** | `audit-area-2-confirmation-sequence` | **DEFERRED** | Confirmation sequence/freshness — real gap; parked behind contradiction-type instrument. | feature-gap lock; mechanism review; path audit | 2026-08-16 | WAIT upstream (deferred) |
| **B** | `audit-area-3-liquidity-meaning` | **DEFERRED** | Liquidity meaning (taken vs breached vs interacted) collapsed to `sweepPresent`; deferred. | same | 2026-08-16 | WAIT upstream (deferred) |
| **B** | `audit-area-4-independent-confluence` | **DEFERRED** | Independent vs duplicated/correlated reasons — counts only; deferred. | same | 2026-08-16 | WAIT upstream (deferred) |
| **B** | `queued-suspect-1-weighting` | **QUEUED / DEFER** · Adam-open only | Evidence weighting / conflict; continuous margins largely **NOT MEASURED**; BOTH_SIDES ~10%. | `karen-research-queue-one-bottleneck.md`; `karen-evidence-weighting-conflict-diagnostic.md`; first-broken pipeline | 2026-08-15 | weighting (parked) |
| **B** | `queued-suspect-2-entry-timing` | **QUEUED** | Right direction, late ACT → poor R:R. | queue SoT; first-broken | 2026-08-15 | other (parked) |
| **B** | `queued-suspect-3-target-inv` | **QUEUED** | Separate “direction right?” from T/S geometry. | queue SoT | 2026-08-15 | other (parked) |
| **B** | `queued-suspect-4-semantic-confounders` | **QUEUED / PARKED** | EST–CME PD; dual REH/REL. | queue SoT | 2026-08-15 | other (parked) |
| **B** | `queued-suspect-5-regime` | **QUEUED** | Pre/post 2024-06-24 — measure-first before `MARKET_REGIME`. | queue SoT | 2026-08-15 | other (parked) |
| **B** | `fw-clearance-full-1074` | **NOT MEASURED (optional)** | Panel∩stamps n=104 clearance measured; full-1074 denser coverage still optional. | `karen-force-wait-clearance-bins.md`; `karen-c4-h-review-cited-mss.md`; c4 diagnostic | 2026-08-15→16 | c4 / unlock path (low value under PARKED) |
| **B** | `weighting-continuous-margins` | **NOT MEASURED** (many cells) | Continuous scores/margins/combo tables absent from verdict path dumps. | `karen-evidence-weighting-conflict-diagnostic.md` | 2026-08-15 | weighting |
| **B** | `selective_unlock` | **PARKED** | One-knob unlock on current features closed until new measured representation exists. | feature-gap lock; queue; next-candidate | 2026-08-16 | selective unlock |
| **B** | `redis-prod-runtime` | **BLOCKED / NOT CONFIGURED** | Redis code path PASS; prod credentials / Analyse→Chat verification blocked. | `karen-redis-production-readiness-audit.md`; continuous-memory safety audits | (ops) | other (infra) |
| **B** | `project-control-phases-1-2` | **OPEN** (ops board) | Reliability / market-state phases still OPEN on control board — not WAIT research attack. | `project-control-blocker-board.md` | stale vs WAIT SoT | other |
| **C** | `c1_wait_entry_actionable` | **REJECT** · NEXT **SUPERSEDED** | Binary FORCE_WAIT removal — Gate 10 + VAL proxyR fail; do not re-run. | `karen-dev-candidate-c1-protocol-decision.md`; `karen-entry-status-force-wait-bottleneck.md` | 2026-08-15 | c1 (closed) |
| **C** | `h_c4_fw_unlock_cited_mss` | **DEFINE_BLOCK / CLOSED** | cited_mss ≈ cc=1; Gate-10 proj 34.1%; closed as c4 seed. | `karen-c4-h-review-cited-mss.md`; predeclare | 2026-08-16 | c4 (closed) |
| **C** | `best_alt_one_knob` | **NONE_JUSTIFIED** | Alt discriminator scan found no justified replacement on current features. | `karen-c4-alt-discriminator-scan.md` | 2026-08-16 | selective unlock (closed) |
| **C** | `stamp-dump-in-flight` | **DONE** (stale “in flight” text) | FORCE_WAIT shadow stamp dump N≈1075 complete; first-broken / older NEXT still say in-flight. | `karen-c4-shadow-quality-gated-wait.md` (done) vs first-broken pipeline (stale) | 2026-08-15 | c4 |
| **C** | `c4-diagnostic-next-adam-h-review` | **SUPERSEDED** | NEXT asking Adam whether cited_mss may become registered c4 — answered **DEFINE_BLOCK**. | `karen-c4-shadow-quality-gated-wait.md`; `karen-force-wait-clearance-bins.md` | 2026-08-15→16 | c4 |
| **C** | `unlock-subset-mining` | **CLOSED under lock** | cc=1 / cited_mss renames, count bins, side/model asymmetry mining. | feature-gap lock IMPLICATION | 2026-08-16 | selective unlock |
| **C** | `which-waits-unlock-bottleneck` | **SUPERSEDED** | Bottleneck reframed to evidence representation before WAIT. | next-candidate SUPERSESSION; feature-gap | 2026-08-16 | WAIT upstream |

**DV reports skim:** `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500.schema.md` restates `C4_DEFINED: NO` / `C4_SINGLE_CHANGE: NOT_DEFINED` only — no additional open follow-ups.

**`.tmp` mirrors:** Prefer repo. Meaningful DIFF set includes SoT files (`karen-research-queue-one-bottleneck.md`, `karen-wait-quality-feature-gap-lock.md`, `karen-wait-upstream-stop-condition.md`, predeclare, etc.). Do not treat tmp as newer without hash check.

---

## OBSOLETE_CAN_CLOSE

Items that are **done / closed / superseded** and should stop appearing as live NEXT:

1. Protocol-score / implement binary **c1** (`REJECT`; NEXT superseded).
2. **`h_c4_fw_unlock_cited_mss`** as c4 seed (**DEFINE_BLOCK**).
3. Adam H-review “define or stricter subset” for cited_mss (**DEFINE_BLOCK** answered).
4. Alt one-knob unlock mining on current `featuresAtT` (**NONE_JUSTIFIED** + selective unlock **PARKED**).
5. “Stamp dump in flight / do not interrupt” (dump **done**).
6. Bottleneck framing “which WAITs to unlock?” (**SUPERSEDED** by upstream representation).
7. Stale NEXT on `karen-c4-shadow-quality-gated-wait.md` / clearance bins asking to register cited_mss.
8. Optional full-1074 denser clearance **as unlock-path work** (unlock path parked; optional measurement is not a live gate).

---

## STILL_MATTERS_NOW (max 5)

1. **Investigate `contradiction_type` further** as representation only (typed stamp optional) — measurement **PASS**; do **not** park WAIT branch yet; no unlock/score/VAL.
2. **Keep locks cold:** `C4_SINGLE_CHANGE=NOT_DEFINED`, `CLEAR_PIT_SAFE=NO`, `READY_TO_*=N`, selective unlock **PARKED**, EDGE NONE, HOLDOUT SEALED.
3. **Do not unpark** queued suspect #1 (weighting) or deferred audit areas 2–4 unless Adam opens.
4. **SoT drift closed** — AUDIT complete / YES / contradiction_type across queue, next-candidate, stop-pointer, feature-gap lock.
5. **Obsolete NEXTs remain closed** — cited_mss define, c1 re-score, unlock-subset mining.

---

## RECOMMENDED_DROPS

Work that accumulated but **no longer matters** under current locks:

- Further one-knob / subset unlock screens on current features (alt scan closed).
- Re-opening cited_mss / cc=1 carve-outs or Gate-10 budget hunting on blocked seeds.
- Re-running binary c1 protocol/VAL.
- Treating full-1074 clearance densification as required before next step.
- Opening weighting / entry-timing / target-inv / regime / execution experiments “in parallel.”
- Treating `.tmp/karen-final-integration/data/research/` as authoritative when it DIFFers from repo.
- Ops-phase OPEN items on `project-control-blocker-board.md` as if they were the WAIT research bottleneck.

---

## NEXT_IF_ANY

**Investigate `contradiction_type` further as representation only** (no unlock/score/VAL). SoT reconciled; frequency measurement **PASS**. Do not open new tracks.

---

## PARENT_SUMMARY_COUNTS

| Metric | Value |
|--------|------:|
| **DEBT_ITEMS_TOTAL** (deduped rows) | **23** |
| **RANK_A_COUNT** | **4** |
| **RANK_B_COUNT** | **12** |
| **RANK_C_COUNT** | **7** |
| **OBSOLETE_COUNT** (can-close list) | **8** |
