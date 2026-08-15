# KAREN — First-Broken-Hop Diagnostic Pipeline

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/` (mirrored to repo `data/research/`)  
**MODE:** lightweight documentation / governance only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**LOGIC:** no trading-logic / weight / threshold changes from this document  

---

## 0. Purpose (Adam’s SoT)

When performance is bad, locate **which link in the chain breaks first** — do **not** tweak final LONG/SHORT thresholds first.

This document encodes Adam’s ordered diagnostic pipeline as the **source of truth** for investigation sequencing after a clean semantic baseline. It does **not** authorize experiments, gate removal, weight sweeps, VAL peeks, or holdout unlock.

---

## 1. Decision chain (hops)

```
Market data
  → observations
  → evidence
  → weighting
  → WAIT / action gate
  → direction
  → entry
  → target / invalidation
  → execution
  → P&L
```

Each hop can poison everything downstream. Diagnose **upstream first**. A “bad” final stance or proxyR is a **symptom**, not a starting knob.

---

## 2. Ordered investigation queue

**SoT lock:** [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md) — you do **not** have six current bottlenecks. **CURRENT = WAIT quality only**; everything else below is a **QUEUED_SUSPECT** (or later protocol gate), not a parallel attack.

**Prerequisite (frozen, not CURRENT):** clean semantic baseline-v2 HEAD (v3/v4 candidates not promoted). Do not reopen invent-path baseline as a competing bottleneck.

### 2a. CURRENT_BOTTLENECK (only)

| Focus | Why | Status posture (2026-08-15) |
|-------|-----|-----------------------------|
| **WAIT quality discrimination** (still) — c4 = research direction only (not binary c1) | FORCE_WAIT still ~90% of WAIT primary. Binary c1 Y=1500+VAL: DEV strong, **REJECT** promote (Gate 10 + VAL proxyR). Need selective quality discrimination. | **KEEP_GATE prod**; **CURRENT = WAIT quality**; c4 = **RESEARCH_MORE / `C4_SINGLE_CHANGE=NOT_DEFINED`** (not ready-to-score). **In flight:** FORCE_WAIT shadow stamp dump — do not interrupt / duplicate; do not open weighting. See `karen-next-single-change-dev-candidate.md`. |

Frozen DEV actionable refs (context only): T-before-inv ~19.5%, mean proxyR −0.330 — used to judge whether WAIT unlocks add bad actionables, not as a second current bottleneck.

### 2b. QUEUED_SUSPECTS (parked — attack only when WAIT path is resolved enough)

| Order | Suspect | Why queued | Status posture |
|------:|---------|------------|----------------|
| **1** | Evidence weighting / conflict resolution | Strong fresh cancelled by weak opposing; correlated double-count. BOTH_SIDES ~10%; continuous margins largely NOT MEASURED. | **QUEUED_SUSPECT** — DEFER. See `karen-evidence-weighting-conflict-diagnostic.md` |
| **2** | Entry timing | Right direction, late actionable → poor R:R. Separate prediction quality from entry quality. | **QUEUED_SUSPECT** |
| **3** | Target / invalidation geometry | Separate “direction right?” from “T/S construction good?” | **QUEUED_SUSPECT** (backlog F1-class) |
| **4** | Remaining semantic confounders | EST-vs-CME PD; dual REH/REL — parked correctly for now | **QUEUED_SUSPECT** |
| **5** | Regime dependence | PRE/POST 2024-06-24 — rule out data/features/session **before** `MARKET_REGIME` | **QUEUED_SUSPECT** — measure-first |

### 2c. Later protocol gates (not parallel bottlenecks)

| Gate | Note |
|------|------|
| Execution realism | proxyR ≠ real P&L until fills/slippage/commissions/trade-mgmt |
| OOS / VAL / holdout | Per existing protocols; **HOLDOUT SEALED**; VAL one-shot after DEV promote only |
| Research speed | Perf only with **semantic hash equivalence** — not an edge hop |

---

## 3. Forbidden early moves

Do **not** jump ahead of the queue with these:

| Forbidden (early) | Why |
|-------------------|-----|
| **Treating QUEUED_SUSPECTS as parallel bottlenecks** | Adam SoT: ONE current bottleneck (WAIT quality discrimination); five suspects stay parked |
| **Evidence-weighting / entry-timing / target-inv / regime / execution experiments now** | Attack only after WAIT path is resolved enough — see queue SoT |
| **Weight / threshold sweeps** (genetic search, LONG/SHORT cutoffs, weigher retunes) | Optimizing on gated evidence; CURRENT WAIT quality not cleared |
| **Removing WAIT / `ENTRY_STATUS_FORCE_WAIT` to create trades** (binary c1) | Confounds protect vs make-late; **REJECT** promote — c4 remains research-only until a PIT-safe discriminator exists |
| **ICT concept stacking** as assumed truth | Hypotheses only — backlog / registry; not production weights |
| **HOLDOUT peek / unlock** | Sealed until separate Adam unlock |
| **VAL tuning loops** | VAL is one-shot confirmation after DEV promote only |
| **Interrupting / duplicating in-flight FORCE_WAIT shadow stamp dump** | Do not stop, restart, or open parallel WAIT attacks / weighting |
| **Scoring or implementing c4 before discriminator pre-declare** | `C4_SINGLE_CHANGE=NOT_DEFINED` — research direction only |
| **Launching heavy DV / edge experiments from this doc** | Governance only — register + promote via protocol |

---

## 4. Relation to other SoT docs

| Document | Relationship |
|----------|--------------|
| [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md) | **Queue SoT** — ONE CURRENT_BOTTLENECK (WAIT quality discrimination) + five QUEUED_SUSPECTS; c4 not scoreable until defined. |
| [`karen-dev-to-validation-protocol.md`](./karen-dev-to-validation-protocol.md) | **Promotion gates** after a candidate is ready. This pipeline decides **what to investigate / fix before** a candidate is worth gating. Passing DEV→VAL does not skip queue order. |
| [`karen-walk-forward-oos-protocol.md`](./karen-walk-forward-oos-protocol.md) | **Temporal robustness** (anchored WF + purge/embargo). Use after a hop-local fix is hypothesized — never to retune from OOS or open holdout. |
| [`karen-trading-brain-hypothesis-backlog.md`](./karen-trading-brain-hypothesis-backlog.md) | **Candidate hypotheses** mapped onto hops. Experiments stay one-change; backlog does not authorize parallel attacks on QUEUED_SUSPECTS. |
| [`karen-dv-experiment-registry.md`](./karen-dv-experiment-registry.md) | **Machine ledger** for any registered measurement. Registry enforces HOLDOUT seal + VAL no-tune; does not authorize jumping to weight sweeps. |
| In-flight FORCE_WAIT shadow stamp dump | **Only active work** — do **not** interrupt or duplicate; do not open weighting. See `karen-c4-shadow-quality-gated-wait.md`. |
| [`karen-evidence-weighting-conflict-diagnostic.md`](./karen-evidence-weighting-conflict-diagnostic.md) | QUEUED_SUSPECT #1 artifacts-only: conflict vs FORCE_WAIT share; margins NOT MEASURED — **not** active. |
| [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md) | Bottleneck pointer — c4 = **RESEARCH_MORE / NOT_DEFINED** (not ready-to-score); binary c1 **REJECT**; READY_TO_IMPLEMENT **N**. |
| [`karen-next-single-change-hint-after-c1-val.md`](./karen-next-single-change-hint-after-c1-val.md) | **ONE** post-c1 research direction (`c4` = delay-vs-suppress / shadow-quality gate) — not a defined single-change. |

---

## 5. How to use this pipeline (operators)

1. Confirm semantic baseline remains frozen before any weigher / conflict work.  
2. Attack **only** CURRENT_BOTTLENECK (WAIT quality discrimination) until resolved enough. Prefer shadow / counterfactual / measure-only designs. c4 is **NOT_DEFINED** — do not score/implement until a PIT-safe discriminator is pre-declared.  
3. Do **not** unpark QUEUED_SUSPECTS in parallel. Ask: “If WAIT quality were fixed, would downstream metrics still fail?” — isolate before stacking.  
4. Register DEV measurements in the experiment registry only after a single-change is defined; promote only via DEV→VAL protocol.  
5. Keep `EDGE_CLAIM: NONE` and **HOLDOUT SEALED** unless Adam unlocks.

---

## 6. Explicit non-goals (this document)

- No heavy DV jobs, no process kill/restart of in-flight agents  
- No trading-logic, weight, or threshold edits  
- No experiment launch, VAL peek, or holdout unlock  
- No edge claim  

---

## 7. Sync

Canonical copies:

- `data/research/karen-first-broken-hop-diagnostic-pipeline.md` (repo)
- `.tmp/karen-final-integration/data/research/karen-first-broken-hop-diagnostic-pipeline.md` (integration tree)

---

## 8. Changelog

| Time | Change |
|------|--------|
| 2026-08-15 | Initial lock — Adam pipeline SoT, ordered hops 1–9, forbidden early moves, cross-links |
| 2026-08-15 | Dual A/B: hop 2 ranked first-broken; hop 4 deferred; cross-link next-candidate + weighting diagnostic |
| 2026-08-15 | Reconcile: binary c1 REJECT after Y=1500+VAL; ONE_NEXT → `c4_shadow_quality_gated_wait`; no VAL re-run |
| 2026-08-15 | Queue lock: CURRENT = WAIT quality only; rest = QUEUED_SUSPECTS (see `karen-research-queue-one-bottleneck.md`) |
| 2026-08-15 | Reconcile: c4 = RESEARCH_MORE / NOT_DEFINED (not ready-to-score); in-flight = FORCE_WAIT shadow stamp dump |

**EDGE_CLAIM:** NONE  
**HOLDOUT_STATUS:** SEALED  
**VAL:** DO NOT TOUCH  
