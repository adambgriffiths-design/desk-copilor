# Semantic baseline freeze — experiment lock

**TIME:** 2026-08-15T19:30:00Z  
**TREE:** `.tmp/karen-final-integration/`  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED / PROTECTED

## BASELINE_FROZEN_ID

**`baseline-v2`**

This is the frozen semantic invent-path / trading-brain baseline for all DEV decision-process threshold experiments.

## Formal ID package (all recorded)

| ID | Role | Status | Evidence |
|----|------|--------|----------|
| `baseline-v1` | prior freeze | FROZEN (superseded for experiments) | displacement/MSS path; sweeps still dual-credit |
| **`baseline-v2`** | **experiment + HEAD** | **FROZEN** | Sweep one-sided credit; full-214 structure+verdict deltas vs v1 |
| `baseline-v3` | invent-path candidate | CANDIDATE — **NOT promoted** | PD lastPrice refuse; micro FIX_PROVEN; natural 214 Δ0 |
| `baseline-v4` | invent-path candidate | CANDIDATE — **NOT promoted** | Empty-session HL refuse; PATH_TRIGGERED_Δ0 on DV |
| `archive-carve-v1` | dataset split | FROZEN | DEV 429 / VAL 152 / HO 158 sealed |
| `A3_est_vs_cme_pd` | labeling confounder | **MEASURED** — not swapped | hlcDisagree ~95.8% on dense 8d; keyDisagree 25.6% (roll window) |
| `A4_dual_reh` | dual-algorithm noise | **MEASURED** — not unified | bothSidesPriceAgree ~13.9%; presenceAgree ~84.4% |
| Perf hash `a3c57a2992af5e72` | optimized≡serial | **PASS** | pit+incr structure+context; QG-dominant stop |

## Why v2 (not v3/v4)

| ID | Status | Invent-path proof | Natural 214 Δ | Promotion |
|----|--------|-------------------|---------------|-----------|
| **v2** | **FROZEN** | Sweep one-sided credit | (vs v1) structure+verdict deltas expected | **YES — experiment + production HEAD** |
| v3 | CANDIDATE | **FIX_PROVEN_ON_MICROFIXTURE** (PD lastPrice invent→refuse; verdict Δ2/3) | **Δ0** | **NOT promoted** |
| v4 | CANDIDATE | **PATH_TRIGGERED_DELTA0** (context invent≠refuse; DV Δ0/3) | **Δ0** | **NOT promoted** |

Rationale (Adam programme):

1. Prefer the **cleanest correct brain already frozen** — v2 sweep dual-credit fix is proven on full-214.
2. Promote invent-path only with **clear invent-path proof** — v3 has micro proof but **Δ0 on natural corpus**. Do not change production default without Adam.
3. **Do not stack unclear promotions** — v4 path triggers in context but does not change DV verdicts; leave as candidate.
4. Overcaution experiments address `canDeliver=true but WAIT` via **thresholds/weights**, orthogonal to invent-path.
5. A3/A4 are **measurement-complete confounders** — do **not** swap PD keys or unify REH into production without a registered single-change candidate + Adam.

## Invent-path + confounder status

- **v3 PD refuse:** micro-fixture invent vs refuse; natural 214 Δ0.
- **v4 empty-session HL refuse:** micro context invent vs refuse; DV Δ0.
- **A3 EST vs CME PD:** observation-only dual compute; MATERIAL_LABELING_CONFOUNDER; medianAbsPdhDelta 0.75 — labeling noise, not auto-fix.
- **A4 dual REH:** observation REH vs structure pools; MATERIAL_DUAL_ALGORITHM_NOISE; presence mostly agrees, prices often differ.
- Artifacts: `karen-micro-fixtures-v3-v4.md`, `karen-semantic-confounder-micro.md`, v3/v4 reports under `data/karen-decision-validation/`.

**No invent-path or PD/REH production swaps in this stretch.** Semantic baseline remains **baseline-v2**.

## Experiment layer (separate ALS)

`lib/decision-process-experiment.ts` — default `"none"` = frozen production thresholds. DEV candidates flip **one** knob each under `withDecisionProcessExperiment`, always with `withTradingBrainBaseline("v2")`.

## EDGE_CLAIM

NONE
