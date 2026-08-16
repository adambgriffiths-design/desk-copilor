# KAREN — Research handoff (canonical)

**DATE:** 2026-08-16  
**MODE:** multi-machine clarity / governance pointer  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  

**UI bridge (no Chrome paste):** [karen-ui-bridge-workflow.md](./karen-ui-bridge-workflow.md) · brief [KAREN-UI-BRIEF.md](./KAREN-UI-BRIEF.md) · reply [KAREN-UI-REPLY.md](./KAREN-UI-REPLY.md)

**Plain-English board:** [KAREN-OPEN-ME.md](./KAREN-OPEN-ME.md) → [KAREN-RESEARCH-COMMAND-CENTRE.md](./KAREN-RESEARCH-COMMAND-CENTRE.md)

Lane 1 owns trading-decision research. This file is the short SoT map only.

---

## Bottleneck (CURRENT)

Evidence-representation richness **before** WAIT — not "which WAITs unlock?"

| Field | Value |
|-------|--------|
| **SELECTIVE_UNLOCK** | **PARKED** |
| **STOP_CONDITION** | **YES** (closed) → ONE_FEATURE = **contradiction_type** |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** |
| **READY_TO_SCORE / IMPLEMENT** | **N** |

Lock: [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md)

---

## Active measurement (Lane 1)

**Lane 1 typed contradiction** — `contradiction_repr_v1`. Outcome-relation **RUN_COMPLETED**; WAIT branch **CONTINUE** (not killed). Measure only; no unlock / score / ALS / VAL.

| Step | Status |
|------|--------|
| Instrument typed `contradictionItems` / `contradiction_repr_v1` | **PASS** |
| Provenance | **PASS** — [`karen-contradiction-type-provenance.md`](./karen-contradiction-type-provenance.md) |
| Engine coverage | **PASS** — [`karen-contradiction-engine-coverage.md`](./karen-contradiction-engine-coverage.md) |
| Restamp / enrich | **PASS** — [`karen-contradiction-lane1-restamp-note.md`](./karen-contradiction-lane1-restamp-note.md) |
| Frequency / co-occurrence | **PASS** — [`karen-contradiction-type-measurement.md`](./karen-contradiction-type-measurement.md) |
| Spec | **FROZEN** — [`karen-contradiction-representation-spec-v1.md`](./karen-contradiction-representation-spec-v1.md) |
| Type-vs-count richer | **YES** — [`karen-contradiction-type-vs-count-measurement.md`](./karen-contradiction-type-vs-count-measurement.md) |
| Feature-story audit | **YES** — [`karen-contradiction-type-feature-story.md`](./karen-contradiction-type-feature-story.md) |
| Outcome-relation | **RUN_COMPLETED** — `m_contradiction_type_outcome_relation_v0` **PASS** · MEANINGFUL_ASSOCIATION=**YES** · HETEROGENEITY_WITHIN_CC1=**YES** · KILL_WAIT_BRANCH=**NO** · triage **CONTINUE_WAIT_REPRESENTATION_WORK** — [`karen-contradiction-type-outcome-relation-measurement.md`](./karen-contradiction-type-outcome-relation-measurement.md) |

---

## Lane 2 (governance / optional)

CLI ready: `karen:research:status`, `sot-check`, `governance-check`.

**Info-loss audit:** **DONE** (2026-08-16) — [`karen-decision-pipeline-info-loss-audit.md`](./karen-decision-pipeline-info-loss-audit.md). Outcomes not inspected.

**Liquidity:** priority **#1** timing (`liquidity_repr_v1`) = **PASS** (session `formedAt` wired; smoke freq 100% formedAt session+PD; dump enrich progressive 12/1075 on 8GB). Priority **#2** full map = **NEXT / NOT_STARTED**. Priority **#3** sequence = **NOT_STARTED**. SoT: [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md) · [`karen-liquidity-timing-freshness-audit.md`](./karen-liquidity-timing-freshness-audit.md) · freq [`karen-liquidity-representation-freq-partial.md`](./karen-liquidity-representation-freq-partial.md).

**HTF bias stack** (`htf_bias_repr_v0`) = **PASS** — [`karen-htf-bias-stack-representation.md`](./karen-htf-bias-stack-representation.md).

---

## Parked (do not open)

- Selective one-knob unlock on current features
- c4 score / implement (`c4_shadow_quality_gated_wait` = label only)
- Audit areas 2–4 (confirmation sequence, liquidity meaning, independent confluence)
- Five QUEUED_SUSPECTS (weighting → entry timing → T/inv → semantic confounders → regime)
- Binary c1 (`REJECT`); cited_mss seed (`DEFINE_BLOCK`)

Queue: [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md)

---

## Last results (pointers)

- c1 Y=1500 + VAL → **REJECT** (Gate 10 + VAL proxyR) — keep FORCE_WAIT in prod
- FORCE_WAIT stamp dump N≈1075 done; `CLEAR_PIT_SAFE_DISCRIMINATOR=NO`
- Alt one-knob scan → **BEST_ALT=NONE_JUSTIFIED**
- Lane 1 typed repr **FROZEN**; type-vs-count **RICHER=YES**; outcome-relation **RUN_COMPLETED** → **CONTINUE_WAIT_REPRESENTATION_WORK** (unlock still PARKED)

Detail: [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md)

---

## Next action

**NEXT (pointer only — do not implement yet):** full liquidity map (priority #2) — NY-pre, ORG, gaps, REH/REL, EQH/EQL.  

Liquidity #1 timing + HTF stack = **PASS**. Optional: continue progressive dump enrich (`--merge --skip-enriched`) when RAM allows. Do **not** invent unlocks, open weighting, or touch VAL/HOLDOUT.

---

## EDGE / HOLDOUT / VAL rules

| Rule | Value |
|------|--------|
| **EDGE_CLAIM** | **NONE** always until Adam says otherwise |
| **HOLDOUT** | **SEALED** — no peek; no `KAREN_HOLDOUT_UNLOCK` without explicit Adam unlock |
| **VAL** | **DO NOT TOUCH** — c1 one-shot consumed; no retune / second VAL |
| **ALS / registry score** | none while `C4_SINGLE_CHANGE=NOT_DEFINED` |

Governance CLI: `npm run karen:research:governance-check`

---

## Debt inventory

[`karen-research-debt-inventory.md`](./karen-research-debt-inventory.md)

---

## Machine commands (Lane 2)

```bash
npm run karen:research:status          # bottleneck / active / parked / next
npm run karen:research:sot-check       # SoT drift vs feature-gap lock
npm run karen:research:governance-check
```

See also: [`README.md`](./README.md)
