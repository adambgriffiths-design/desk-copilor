# KAREN — Research queue: one bottleneck + five suspects

**DATE:** 2026-08-15  
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

1. **ONE current bottleneck** — WAIT quality discrimination (still) — research direction `c4_shadow_quality_gated_wait`, **not** a ready-to-score/implement candidate
2. **Five suspects queued behind it** — parked; attack only when the WAIT path is resolved enough

Do **not** launch evidence-weighting, entry-timing, target/inv, regime, or execution experiments while WAIT quality work is in flight. Stamp dump is **done**; research pre-declare `h_c4_fw_unlock_cited_mss` is **text only** — do **not** treat it as scoreable. Do **not** treat c4 as scoreable until a *clean* PIT-safe discriminator exists (`C4_SINGLE_CHANGE=NOT_DEFINED` still).

---

## Ordered queue

| Slot | Focus | Role |
|------|--------|------|
| **NOW** | **WAIT quality discrimination** (still) — c4 = research direction only; not binary c1 | **CURRENT_BOTTLENECK** — only active attack surface |
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
| **CURRENT** | **WAIT quality discrimination** (still) |
| **c4 posture** | Research direction only — **`C4_SINGLE_CHANGE=NOT_DEFINED`**, **RESEARCH_MORE**, **no score** — research pre-declare exists but is **not** a clean discriminator / not scoreable. **Not** ready-to-score / ready-to-implement |
| **id (direction)** | `c4_shadow_quality_gated_wait` |
| **pre-declare (text)** | `h_c4_fw_unlock_cited_mss` — [`karen-c4-wait-hypothesis-predeclare.md`](./karen-c4-wait-hypothesis-predeclare.md) |
| **problem** | Binary WAIT→actionable (c1) failed Gate 10 + VAL proxyR; FORCE_WAIT still ~90% of WAIT primary; need **quality discrimination**, not global flip |
| **active pointer** | [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md) — bottleneck pointer = WAIT quality; c4 **NOT** a defined single-change |
| **diagnostic** | [`karen-c4-shadow-quality-gated-wait.md`](./karen-c4-shadow-quality-gated-wait.md) — RESEARCH_MORE |
| **in-flight / next** | §2 clearance **done** (panel n=104); next = Adam review whether `h_c4_fw_unlock_cited_mss` may become registered c4 — do **not** open weighting / conflict / other suspects; do **not** score without explicit define |
| **closed** | Binary `c1_wait_entry_actionable` — **REJECT** promote |

---

## QUEUED_SUSPECTS (five — not parallel bottlenecks)

| # | Suspect | Why parked | Unpark when |
|--:|---------|------------|-------------|
| 1 | Evidence weighting / conflict | BOTH_SIDES ~10%; continuous margins largely NOT MEASURED; not justified while FORCE_WAIT remains #1 explanatory | WAIT quality path resolved enough **and** residual failure still looks like conflict/cancel |
| 2 | Entry timing | Direction may be right while late ACT destroys R:R | After selective WAIT unlock, score early vs late on actionables |
| 3 | Target / invalidation geometry | Must separate “direction right?” from “T/S construction good?” | After direction / entry timing are isolable |
| 4 | Semantic confounders (EST–CME PD; dual REH/REL) | Correctly parked; labeling confounders, not the current WAIT-quality attack | After WAIT path; measure before any weigher claim that depends on PD/eq-pool labels |
| 5 | Regime dependence (pre/post 2024-06-24) | Enormous opportunity gap — rule out data/features/session **before** `MARKET_REGIME` | After upstream hops; era-split measure-first only |

Execution realism and OOS/VAL/holdout sit **after** the five suspects. They are not additional “current bottlenecks.”

---

## Forbidden while CURRENT_BOTTLENECK is open

- Launch evidence-weighting / conflict experiments
- Launch entry-timing, target/inv, regime, or execution experiments
- Score / implement / register c4 or `h_c4_fw_unlock_cited_mss` while `C4_SINGLE_CHANGE=NOT_DEFINED` / `CLEAR_PIT_SAFE_DISCRIMINATOR=NO`
- Treat research pre-declare as a ready-to-score single-change
- Treat the five suspects as parallel bottlenecks
- VAL peek / retune; HOLDOUT unlock
- Trading-logic / weight / threshold changes from this doc
- EDGE_CLAIM of any kind

---

## Relation to other SoT docs

| Document | Relationship |
|----------|--------------|
| [`karen-first-broken-hop-diagnostic-pipeline.md`](./karen-first-broken-hop-diagnostic-pipeline.md) | Hop chain + **CURRENT = WAIT quality only**; rest = QUEUED_SUSPECTS |
| [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md) | Bottleneck pointer — c4 = **RESEARCH_MORE / NOT_DEFINED**, not ready-to-score |
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

**EDGE_CLAIM:** NONE  
**HOLDOUT_STATUS:** SEALED  
**VAL:** DO NOT TOUCH  
