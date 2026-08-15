# First historical research experiment

**Date:** 2026-08-14  
**Run ID:** `hist-exp-2026-08-14T14-40-10-298Z-nq-week-aug05-aug12-`  
**Status:** EXECUTED  
**Evidence class:** **DEBUGGING** — not **EDGE EVIDENCE**  
**Architecture:** frozen `architecture-v1` only — no winner selected  

---

## FINAL REPORT

| Field | Value |
|-------|-------|
| **DATA** | `nq-week-aug05-aug12-2026-cme` — 6880 bars, 6 CME session-days, 7 calendar days (2026-08-05 → 2026-08-12). Source: tickstream. data_version: `295f66b7aa9381c1`. GAP: 7 calendar days / ~5 session-days — need ≥1 month PIT NQ via TickStream or NT export |
| **CHECKPOINTS** | 61 (framework_session_anchors). ~12 session-phase anchors per CME day — not per-bar (~100× cheaper than full pass; see readiness audit) |
| **DECISIONS** | 61 complete v1 traces |
| **LONG** | 0 |
| **SHORT** | 0 |
| **WAIT** | 32 |
| **FLAT** | 29 (flat 23, monitor 6) |
| **CONCEPT COVERAGE** | 10 concepts seen; playbook detected counts: htf_bias=0, premium_discount=49, liquidity_sweep_pdh=18, liquidity_sweep_pdl=6, session_liquidity=30, eqh=61, eql=61, mss=56, displacement=51, fvg=60 |
| **PROVENANCE COVERAGE** | 392/392 detected concepts with evidence (100.0%) |
| **OUTCOME COVERAGE** | 61/61 with forward-window outcomes (100.0%) — labeled **after** T only |
| **PIT TEST** | PASS — 6/6 poisons + fingerprint reproducibility on first checkpoint |
| **TRAIN VAL OOS** | TRAIN n=37 (adequate); VAL n=12; OOS n=12 — chronological 60/20/20, no shuffle |
| **LEAKAGE TEST** | Outcomes in separate `outcomes.jsonl`; forward bars strictly after decision timestamp; architecture selection on VAL/OOS forbidden (`selectedArchitectureFrom: null`) |
| **BIGGEST DATA GAP** | GAP: 7 calendar days / ~5 session-days — need ≥1 month PIT NQ via TickStream or NT export |
| **BIGGEST RESEARCH GAP** | No multi-architecture comparison or ablation yet — v2/v3/H-A/B/C remain UNTESTED |
| **NEXT HIGHEST-VALUE EXPERIMENT** | Acquire ≥1 month PIT NQ 1m (TickStream week batches or NT Minute/Last GUI export); re-run this harness |

---

## Split detail

| Phase | n | LONG | SHORT | WAIT | FLAT+MON | Adequacy |
|-------|---|------|-------|------|----------|----------|
| TRAIN | 37 | 0 | 0 | 16 | 21 | adequate |
| VALIDATION | 12 | 0 | 0 | 10 | 2 | minimum |
| OOS | 12 | 0 | 0 | 6 | 6 | minimum |

---

## Run artifacts

- `C:\Users\adamg\Projects\desk-copilot\data\research\runs\hist-exp-2026-08-14T14-40-10-298Z-nq-week-aug05-aug12-/manifest.json`
- `C:\Users\adamg\Projects\desk-copilot\data\research\runs\hist-exp-2026-08-14T14-40-10-298Z-nq-week-aug05-aug12-/decisions.jsonl` — decision traces at T (context, concepts, conflicts, stance, horizons, entry/target/invalidation, fingerprints)
- `C:\Users\adamg\Projects\desk-copilot\data\research\runs\hist-exp-2026-08-14T14-40-10-298Z-nq-week-aug05-aug12-/outcomes.jsonl` — post-T labels only (MFE, MAE, target/invalidation reached, liquidity, structure invalidated, direction-after, WAIT counterfactual)

**Wall time:** 2585.1s (~43 min, 61 checkpoints, single process)  
**Dry run:** false

---

## Harness (research-only)

| Piece | Path |
|-------|------|
| Experiment runner | `lib/research/architecture/historical-experiment.ts` |
| CLI | `npm run research:historical-experiment` → `scripts/research-run-historical-experiment.ts` |
| Deterministic tests | `npm run test:research-historical-experiment` → **29 passed** |

**Checkpoint tradeoff:** Framework Mode A (~12 session-phase anchors/day) instead of per-bar evaluation. On this week: 61 checkpoints vs 6,880 bars (~112× fewer context rebuilds). Dominant cost remains `buildMarketContextAt` (~42 s/checkpoint on growing prefix).

**Reproducibility:** Same `data_version` + timestamp + `architecture-v1` → identical SHA-256 trace fingerprint (clocks excluded). Run fingerprint in manifest.

**Not changed:** production Karen, `lib/decision-envelope.ts`, architecture-v1 semantics, weights, ICT logic.

---

## Tests run this pass

| Suite | Result |
|-------|--------|
| `npm run test:research-historical-experiment` | **29 passed, 0 failed** |
| Full week execution | **61/61 checkpoints**, PIT 6/6, repro PASS |
