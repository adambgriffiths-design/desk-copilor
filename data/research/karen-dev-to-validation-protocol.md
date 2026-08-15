# KAREN — Pre-registered DEV → VALIDATION Promotion Protocol

**PHASE:** historical-validation methodology  
**MODE:** research / pre-registration (measurement gates only)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED — never used for candidate selection or threshold setting  
**VALIDATION:** reserved for a **single** confirmatory gate pass per promoted candidate family — **not** for repeated tuning  
**TREE:** `.tmp/karen-final-integration/` (mirrored to repo `data/research/`)  
**PRE-REGISTERED:** 2026-08-15  
**BASELINE_FROZEN_ID:** `baseline-v2`  
**CARVE:** `archive-carve-v1`

---

## 0. Purpose and hard constraints

This document **pre-registers** an objective protocol for when a **DEV-only** trading-brain / decision-process candidate may progress to **VALIDATION**.

### Hard rules (non-negotiable)

1. Rules are fixed **before** inspecting additional candidate DEV results used for promotion decisions, and **before** using VALIDATION outcomes to set or revise gates.
2. Do **not** change Karen trading logic / weights to “pass” these gates after peeking VAL.
3. Do **not** unlock or inspect **UNTOUCHED_HOLDOUT** for selection, ranking, or gate calibration.
4. VALIDATION is **one-shot confirmation** per registered candidate (or registered family) — not a tuning loop.
5. Passing DEV gates does **not** create an edge claim. Passing VAL does **not** create an edge claim. Holdout remains sealed until a separate Adam unlock.
6. `EDGE_CLAIM` remains **NONE** under this protocol.

### Scope

| In scope | Out of scope |
|----------|--------------|
| DEV Decision Validation (DV) metrics vs frozen baseline-v2 | Weight optimization / genetic search |
| Decision-process experiment knobs (one change at a time) under `withTradingBrainBaseline("v2")` | Conversational / UX changes |
| Promotion to run VAL once | Promotion to production |
| Explicit REJECT / RESEARCH_MORE / PROMOTE_TO_VALIDATION | Holdout expectancy |

---

## 1. Frozen DEV reference (do not re-estimate from VAL)

All candidate comparisons are against the **frozen baseline-v2** dual-audit on carve-v1 **DEVELOPMENT** only.

| Field | Frozen DEV reference | Source |
|-------|---------------------:|--------|
| Window | 2023-10-02 → 2025-05-31 (X≈429 trading days) | carve-manifest-v1 |
| Method | even sample · cadence 10 · Y≈1500 · horizon 30m · baseline-v2 | dual-audit |
| Y (eval points) | **1500** | actionable + WAIT audits |
| Z (actionable evaluations) | **71** (LONG 39 / SHORT 32) | `karen-dev-actionable-performance-audit.md` |
| WAIT / NO_TRADE | **1188** / **239** (WAIT share **79.2%**) | `karen-dev-wait-overcaution-audit.md` |
| PIT violations | **0** | dual-audit |
| T-before-inv (ALL actionable, scored) | **19.5%** (Inv-before **80.5%**; scored n=41) | actionable audit |
| mean proxyR (ALL) | **−0.330** (median **−0.611**; n=70) | actionable audit |
| med MFE / med MAE (ALL) | **12.0** / **9.5** | actionable audit |
| WAIT heuristic GOOD / MISSED / INCONCLUSIVE | **0.3%** / **75.7%** / **24.1%** | WAIT audit |
| WAIT verdict | **structurally_overcautious** | WAIT audit |
| STRICT opportunities/day (8-day dense SoT) | median **10.5** · mean **12.75** · quiet **50%** | opportunity-frequency |
| STRICT opportunities (40-day dense panel) | median **0.0** · mean **10.25** · quiet **62.5%** · bimodality **YES** | opportunity-frequency §11 |
| Semantic baseline | **baseline-v2 FROZEN** (v3/v4 not promoted) | `karen-semantic-baseline-freeze.md` / baseline-v2 notes |

**Interpretation lock:** baseline T-before-inv ≈ **19.5%** and mean proxyR **negative (−0.330)** are the DEV reference. Candidates must **beat this frozen baseline** on pre-specified metrics **without peeking VAL**. Negative baseline expectancy is expected; “better than −0.330” is not an edge claim.

### Carve splits (measurement geography)

| Split | Window | X≈ | Role under this protocol |
|-------|--------|---:|--------------------------|
| DEVELOPMENT | 2023-10-02 → 2025-05-31 | 429 | Candidate exploration + promotion gates |
| VALIDATION | 2025-06-01 → 2025-12-31 | 152 | One-shot confirmatory gate only after PROMOTE |
| UNTOUCHED_HOLDOUT | 2026-01-01 → 2026-08-14 | 158 | **Sealed** — no peek |

### Anchored walk-forward OOS (extends DEV; does not replace VAL)

Primary temporal design (Adam ranking #1): **anchored expanding walk-forward + purge/embargo + sealed holdout**. See [`karen-walk-forward-oos-protocol.md`](./karen-walk-forward-oos-protocol.md) and `data/karen-decision-validation/configs/walk-forward-anchored-v1.json`.

| Layer | Role |
|-------|------|
| Inner OOS folds `wf-anchored-01..04` | Chronological robustness inside/near DEV — **report only; no retune on OOS** |
| Carve VALIDATION | Still **one-shot** after `PROMOTE_TO_VALIDATION` |
| Holdout 2026 | Still **sealed** |
| Random k-fold | **Forbidden** |

Purge/embargo: **30m** outcome horizon + **390m** NY RTH session buffer (**420m** total; ≥1 trading-day calendar gap). Combinatorial purged CV is a future robustness stub only.

---

## 2. Definitions (machine)

Use the same definitions as `karen-opportunity-frequency-reconciliation.md` unless noted.

| Term | Definition |
|------|------------|
| **EVALUATION_POINT** | One DecisionEnvelope freeze at asOf t (bars ≤ t only). |
| **ACTIONABLE_EVALUATION (Z)** | `actionableEntry===true` ∧ verdict ∈ {LONG, SHORT}. |
| **ACTIONABLE_EPISODE** | STRICT maximal consecutive same-side actionable run (canonical TRADE_OPPORTUNITY). |
| **proxyR** | Heuristic: +mfeR if target-before-inv; −maeR if inv-before-target; else (mfeR−maeR) when both R defined; R = excursion / \|entry−invalidation\| when inv parses. Horizon **30m**. **Not PnL.** |
| **T-before-inv rate** | Among actionable rows with a scored T/Inv outcome, share with target-before-invalidation. |
| **Candidate** | Exactly **one** registered decision-process / brain change vs baseline-v2 (no stacking). |
| **Family** | Pre-declared set of ≤K mutually exclusive one-knob candidates sharing one hypothesis label (see §15). |
| **Identical asOfs** | Candidate and baseline evaluated on the **same** DEV timestamp set (paired). |

---

## 3. Required measurement package (before any outcome)

A candidate is **ineligible** for PROMOTE / REJECT quality scoring until the package below exists. Missing package → **RESEARCH_MORE** (incomplete), not REJECT.

### 3.1 Mandatory DEV paired run

| Requirement | Spec |
|-------------|------|
| Baseline mode | `withTradingBrainBaseline("v2")` |
| Experiment mode | `withDecisionProcessExperiment(<candidate>)` vs `"none"` |
| Split | DEVELOPMENT only (`archive-carve-v1`) |
| Sample | `even` · cadence **10** · Y **≥ 1500** (prefer exactly 1500 matched to dual-audit) |
| Horizon | **30m** (same as dual-audit) |
| Pairing | Identical asOf list for baseline vs candidate |
| Outputs | Counts L/S/W/NT/Z; T-before; proxyR; MFE/MAE; PIT; semantic hash; DQ exclusion log |

### 3.2 Episode / frequency package (when actionable rate changes materially)

If candidate ΔZ vs baseline on identical asOfs is **≥ +10** actionable evaluations **or** WAIT share drops by **≥ 5 percentage points**, also require:

- Dense or episode collapse under **STRICT** policy on a pre-declared DEV day panel (≥8 days; prefer the published 8-day SoT days or the 40-day even panel — **do not cherry-pick days after seeing outcomes**).
- Report opportunities/day, quiet-day rate, LONG/SHORT episode split, 1-eval vs persistent share.

### 3.3 Integrity package

- PIT violations count  
- Semantic hash match (where harness supports it)  
- Data-quality exclusion ledger (§5)  
- Reproducibility fingerprint (§4)

---

## 4. Gate catalog (numbered 1–15)

Each gate returns **PASS**, **FAIL**, or **INCONCLUSIVE**.  
Outcome aggregation is in §5 (Outcomes).

---

### Gate 1 — Minimum sample size

**Purpose:** Avoid promoting on under-powered noise.

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Y_eval (paired DEV) | **≥ 1500** | Matches frozen dual-audit; smaller Y is RESEARCH_MORE |
| X_days covered by asOfs | **≥ 200** distinct DEV trading days | Dual-audit spans full DEV carve (~429); ≥200 prevents single-quarter cherry samples |
| Scored T/Inv actionable n | **≥ 30** for any T-before comparison used in Gate 6 | Baseline scored n=41; below 30 → INCONCLUSIVE on T-before |

**FAIL** if Y < 1000 or X_days < 100 (clearly under-specified).  
**INCONCLUSIVE** if 1000 ≤ Y < 1500 or 100 ≤ X_days < 200 → forces **RESEARCH_MORE**.

---

### Gate 2 — Minimum actionable episode / evaluation count

**Purpose:** Quality metrics on tiny Z are unstable; also block “never fires” and “fires constantly” extremes without frequency context.

| Metric | Threshold |
|--------|-----------|
| Z_candidate (actionable evaluations on paired Y) | **≥ 40** to claim T-before / proxyR superiority |
| Z_baseline on same asOfs | Recorded; expected ~71 at Y=1500 c10 |
| STRICT actionable episodes (if Gate 3.2 package required) | **≥ 30** episodes on the pre-declared dense panel |

**FAIL** if Z_candidate = 0 on Y≥1500 (candidate is inert).  
**INCONCLUSIVE** if 1 ≤ Z_candidate < 40 → cannot PROMOTE on expectancy metrics (may still RESEARCH_MORE for WAIT-process diagnostics only).

Conservative note: baseline Z=71 is already small; promotion requires **at least** Z≥40 **and** Gate 6–8 improvements — not “any positive blip.”

---

### Gate 3 — Required PIT integrity

| Metric | Threshold |
|--------|-----------|
| PIT violations (baseline run) | **= 0** |
| PIT violations (candidate run) | **= 0** |
| lookAhead / bars-after-t usage | **Forbidden** |

**FAIL** if either run has PIT > 0.  
No INCONCLUSIVE — PIT is binary.

---

### Gate 4 — Required reproducibility

| Metric | Threshold |
|--------|-----------|
| Re-run identical config | Core counts (Y, Z, L, S, W, NT) and T-before / mean proxyR match within **exact equality** for counts; T-before within **±0.5 pp** if floating; mean proxyR within **±0.01** |
| Semantic hash match (when available) | **true** on both baseline and candidate harness paths |
| Config fingerprint | Document: baseline id, experiment id, carve, cadence, Y, horizon, sample mode, git/tree id |

**FAIL** if two independent identical runs disagree beyond tolerances.  
**INCONCLUSIVE** if only one run exists → RESEARCH_MORE (must re-run once).

---

### Gate 5 — Acceptable data-quality exclusions

Exclusions are allowed **only** if pre-declared and logged; they must be identical for baseline and candidate.

| Allowed exclusion | Rule |
|-------------------|------|
| Missing bars / incomplete day | Drop asOf if lookback window cannot be formed; log count |
| Unparseable invalidation for R metrics | Exclude from proxyR / MFE_R denominators only (baseline excluded 1/71); do **not** drop from Z counts |
| Non-scored T/Inv | Report scored n separately (baseline scored 41/71) |

| Disallowed | Why |
|------------|-----|
| Dropping days because actionable performance looks bad | Selection bias |
| Different exclusion sets for baseline vs candidate | Confounding |
| Excluding > **10%** of Y without a mechanical DQ reason | Silent sample surgery |

**FAIL** if exclusion rate of Y > 10% without mechanical DQ justification, or if baseline/candidate exclusion sets differ.  
**PASS** if exclusion rate ≤ 10% and paired.

---

### Gate 6 — Target-before-invalidation criteria

**Frozen reference:** T-before-inv_ALL = **19.5%** (scored).

| Requirement | Threshold |
|-------------|-----------|
| Primary | T-before_candidate − T-before_baseline ≥ **+5.0 percentage points** on identical asOfs, scored subset |
| Absolute floor | T-before_candidate ≥ **24.5%** (= 19.5% + 5.0) **or** meet the delta rule if baseline re-estimate on same asOfs differs slightly — **use paired delta as authoritative** |
| Directional | Neither LONG nor SHORT T-before may fall by **> 10 pp** vs its paired baseline slice if that slice has scored n ≥ 15 |

**FAIL** if paired delta < 0 (worse than baseline) on ALL with scored n ≥ 30.  
**INCONCLUSIVE** if scored n < 30.  
**PASS** only if delta ≥ +5.0 pp and absolute candidate rate ≥ max(baseline_paired, 0.195) + 0.05 − ε with ε=0 for reporting (i.e. clear +5 pp).

Conservative: with scored n≈40, +5 pp is a **minimum detectable** practical bar, not statistical significance theater.

---

### Gate 7 — MFE / MAE criteria

**Frozen reference:** med MFE **12.0**, med MAE **9.5** (ALL actionable).

| Requirement | Threshold |
|-------------|-----------|
| Median MFE | Candidate med MFE ≥ baseline med MFE − **1.0** point (no material MFE collapse) |
| Median MAE | Candidate med MAE ≤ baseline med MAE + **1.0** point (no material MAE inflation) |
| Joint quality | Prefer med MFE − med MAE **≥** baseline (med MFE − med MAE); **FAIL** if (med MFE − med MAE) worsens by **> 3.0** points |

**FAIL** if MAE inflates > +1.0 **and** MFE falls > −1.0 simultaneously, or joint spread worsens > 3.0.  
**PASS** if neither material collapse nor joint deterioration beyond thresholds.

These are **guardrails against garbage-in volume**, not alpha claims.

---

### Gate 8 — Expectancy / proxy-R criteria

**Frozen reference:** mean proxyR **−0.330** (median **−0.611**).

| Requirement | Threshold |
|-------------|-----------|
| Primary | mean_proxyR_candidate − mean_proxyR_baseline ≥ **+0.10** (paired) |
| Absolute soft floor | mean_proxyR_candidate > **−0.23** (= −0.330 + 0.10) when baseline_paired ≈ −0.330 |
| Sign | Crossing **0** is **not** required for PROMOTE (baseline is negative; this protocol is process improvement, not edge) |
| n | proxyR n ≥ **40** |

**FAIL** if mean proxyR worsens (delta < 0) with n ≥ 40.  
**INCONCLUSIVE** if n < 40.  
**PASS** if delta ≥ +0.10.

**Explicit non-claim:** Improving from −0.33 toward −0.20 is still **EDGE_CLAIM: NONE**.

---

### Gate 9 — WAIT-quality criteria

**Frozen reference:** WAIT share **79.2%**; MISSED_OPPORTUNITY heuristic **75.7%**; GOOD_WAIT **0.3%**; structurally_overcautious.

Promotion candidates aimed at overcaution must show **process** improvement without turning WAIT into spam.

| Requirement | Threshold |
|-------------|-----------|
| WAIT→actionable conversion (paired) | If WAIT count drops, net new actionables must be mostly from engine-restraint WAIT (`canDeliver=true`), not from inventing deliverability |
| MISSED_OPPORTUNITY rate among remaining WAITs | Must not **increase** by > **5 pp** vs paired baseline (diagnostic) |
| GOOD_WAIT share | Must not collapse in a way that remaining WAITs are worse; if GOOD_WAIT n stays ≈0, treat as non-blocking (baseline already ~0) |
| Spam check | WAIT share must remain **≥ 40%** of Y unless Gate 10 frequency bounds also PASS on episode panel |

**FAIL** if candidate eliminates WAIT almost entirely (WAIT share < 20%) without Gate 10 PASS.  
**PASS** for overcaution-aimed candidates if WAIT share decreases **or** MISSED_OPPORTUNITY rate decreases by ≥ **5 pp**, **and** Gate 10 does not FAIL.

Note: MISSED_OPPORTUNITY is a **forward-excursion heuristic**, not a count of STRICT opportunities missed — use it only as a WAIT-quality diagnostic (see opportunity-frequency reconciliation §9).

---

### Gate 10 — Trade / opportunity-frequency sanity bounds

**Frozen references:**

- Sparse actionable rate ≈ **4.7%** (71/1500)  
- Dense STRICT median opportunities/day **10.5** (8-day SoT); panel mean ≈ **10.25** with quiet **62.5%** (40-day)  
- EXECUTED_TRADE / fills: **NOT AVAILABLE** — never treat Z as trades

| Bound | Threshold |
|-------|-----------|
| Sparse actionable rate (Z/Y) | Must stay within **[2%, 20%]** on paired Y=1500 |
| Relative to baseline rate | Candidate rate ≤ **3×** baseline rate on identical asOfs |
| STRICT ep/day (when panel required) | Active-day median ≤ **40**; quiet-day rate still in **[25%, 80%]** if bimodality claimed |
| 1-eval flicker share | If STRICT episodes ≥ 30, 1-eval share must remain **≤ 90%** (baseline ~76–81%) |

**FAIL** if actionable rate > 20% or > 3× baseline (likely threshold collapse).  
**FAIL** if actionable rate < 2% **and** candidate claims overcaution relief.  
**PASS** if inside bounds.

---

### Gate 11 — Stability across session / time / regime

Use paired DEV sub-windows. Dual-audit used 4 sub-windows; carve chunk history shows early DEV regime near-zero actionable.

| Requirement | Threshold |
|-------------|-----------|
| Sub-window coverage | Report T-before and mean proxyR in **≥ 3** chronological DEV thirds (or the dual-audit 4 windows) with Z_window ≥ 10 when possible |
| Sign of improvement | Paired proxyR or T-before improvement must hold in **≥ 2** of 3 thirds (not a single third) |
| Session sanity | If a session slice has n ≥ 15 actionables, mean proxyR must not degrade by **> 0.50** vs baseline in **every** major session simultaneously |

**FAIL** if all measurable improvement is concentrated in a single chronological third (§14).  
**INCONCLUSIVE** if < 2 windows have enough n → RESEARCH_MORE (need denser / longer DEV sample, still DEV-only).

---

### Gate 12 — LONG / SHORT imbalance checks

**Frozen reference:** L/S evaluations **39/32**; dense episodes ~**50/52** (balanced).

| Requirement | Threshold |
|-------------|-----------|
| Share balance | min(L,S) / max(L,S) ≥ **0.40** when Z ≥ 40 |
| Side quality | The minority side’s mean proxyR must not worsen by **> 0.25** vs its baseline if that side n ≥ 15 |
| One-sided candidate | A candidate that drives one side to < 15% of Z **FAIL**s unless pre-registered as a single-side hypothesis (then Gate 15 family rules apply) |

**FAIL** on extreme imbalance without pre-registration.  
**PASS** if balance ≥ 0.40 and no catastrophic minority-side degradation.

---

### Gate 13 — Maximum acceptable degradation in any important subgroup

Important subgroups (pre-specified):

1. LONG  
2. SHORT  
3. NY_AM / NY_PM / NY_LUNCH / OTHER (as labeled in dual-audit)  
4. Chronological DEV thirds  

| Rule | Threshold |
|------|-----------|
| Hard cap | No important subgroup with n ≥ 15 may show mean proxyR degradation **> 0.40** vs paired baseline |
| T-before cap | No important subgroup with scored n ≥ 15 may show T-before degradation **> 12 pp** |
| Exception | Subgroups with n < 15 are logged but do **not** veto (underpowered) |

**FAIL** if any n≥15 subgroup breaches a hard cap.  
**PASS** otherwise.

---

### Gate 14 — Rules preventing selection because of one unusually good period

| Rule | Detail |
|------|--------|
| Leave-one-third-out | Recompute primary Gate 6 & 8 deltas after dropping the **best** chronological third; residual delta must still be ≥ **50%** of the full-sample delta **and** Gate 6 residual ≥ **+2.5 pp**, Gate 8 residual ≥ **+0.05** |
| Top-days cap | If dense panel used: removing the best **2** opportunity days must not flip Gate 10 FAIL→PASS or create the entire Gate 8 gain |
| No post-hoc window edits | DEV window is carve-v1 DEVELOPMENT only — no shrinking to “good months” after seeing results |

**FAIL** if leave-one-third-out residual fails the residual floors.  
**PASS** if improvement survives removal of the best third.

---

### Gate 15 — Multiple-testing / hypothesis budget

| Rule | Threshold |
|------|-----------|
| Max **simultaneous** registered one-knob candidates before a VAL promotion decision | **K ≤ 5** in a family |
| Max families promoted to VAL without a protocol revision | **1 family** at a time |
| Stacking | **Forbidden** — no multi-knob “winner mashup” before VAL |
| Peeking | Informal VAL peeks (if any occurred historically) **do not** count as protocol compliance and **do not** authorize re-tuning |
| Alpha spending | If K > 5 candidates are screened on DEV for the same claim, **no PROMOTE** until a new pre-registered protocol revision raises K or switches to a holdout-safe selection design (Adam) |

**Rationale:** With Z≈70 and scored n≈40, even 5 comparisons consume the practical DEV budget. Beyond 5, “winner” is likely noise.

**FAIL** (protocol violation) if >5 candidates were compared on DEV for the same claim and the “best” is selected without pre-registered correction.  
**PASS** if ≤5 pre-declared candidates; promote at most **one** winner to VAL.

---

## 5. Outcomes (explicit)

Compute gates 1–15. Then assign **exactly one** outcome:

### REJECT

Assign **REJECT** if **any** of:

- Gate 3 FAIL (PIT)
- Gate 4 FAIL (non-reproducible)
- Gate 5 FAIL (DQ abuse)
- Gate 10 FAIL (frequency insanity / spam)
- Gate 14 FAIL (single-period driven)
- Gate 15 FAIL (multiple-testing violation)
- Gates 6 **and** 8 both FAIL (worse on both T-before and proxyR with adequate n)
- Candidate is inert (Gate 2 FAIL with Z=0) **and** not a pure correctness/no-op invent-path candidate (those stay CANDIDATE outside this protocol)

REJECT means: do not run VAL; do not iterate by peeking VAL; archive result; optionally start a **new** pre-declared candidate within remaining K budget.

### RESEARCH_MORE

Assign **RESEARCH_MORE** if **not REJECT** and **any** of:

- Any of Gates 1, 2, 4, 6, 8, 11 return **INCONCLUSIVE**
- Package §3 incomplete
- Gate 6 or 8 PASS in isolation but Gate 7 or 9 or 12 or 13 FAIL softly without hard FAIL above
- Improvement exists but fails Gate 14 residual floors only narrowly (document; expand DEV sample density **without** touching VAL/holdout)

RESEARCH_MORE means: stay on DEV; gather power / fix integrity; **do not** open VAL.

### PROMOTE_TO_VALIDATION

Assign **PROMOTE_TO_VALIDATION** only if **all** of:

1. Gates **3, 4, 5, 10, 14, 15** = PASS  
2. Gates **1, 2** = PASS (not INCONCLUSIVE)  
3. Gates **6 and 8** = PASS (both)  
4. Gates **7, 9, 12, 13** = PASS  
5. Gate **11** = PASS (stability)  
6. Exactly **one** winner selected from a family with K ≤ 5  
7. Written promotion card filed (template §6) **before** any VAL run  

PROMOTE means: permission to run **one** paired VAL measurement under carve-v1 VALIDATION with the **same** cadence/horizon/baseline-v2 settings. It does **not** mean production ship, weight freeze, or holdout unlock.

---

## 6. VALIDATION use rules (after PROMOTE only)

| Rule | Spec |
|------|------|
| Cadence / Y / horizon / baseline | Match the DEV promotion package (prefer even · c10 · Y as power allows; document if VAL Y differs due to shorter X≈152) |
| Attempts | **One** primary VAL readout per promoted candidate |
| Tuning | **Forbidden** — no threshold edits after seeing VAL |
| Pass/fail on VAL | Pre-registered confirmatory bar: paired VAL delta on T-before ≥ **0** **and** paired mean proxyR delta ≥ **0** vs baseline-v2 on identical VAL asOfs; **and** PIT=0. (Stricter DEV +5 pp / +0.10 is **not** re-required on VAL given smaller X — confirmation = non-degradation.) |
| Fail on VAL | Candidate returns to DEV as REJECT for promotion purposes; **no** immediate re-tune using VAL residuals |
| Holdout | Still sealed |

Any historical informal VAL peek is **outside** this protocol and must not be used to adjust §4 thresholds.

---

## 7. Promotion card template (required before VAL)

```text
CANDIDATE_ID:
BASELINE_FROZEN_ID: baseline-v2
CARVE: archive-carve-v1
DEV_Y / DEV_Z / scored_n:
PAIRED_TBEFORE_BASE → CAND (delta pp):
PAIRED_PROXYR_BASE → CAND (delta):
MED_MFE / MED_MAE base → cand:
WAIT_SHARE base → cand:
ACTIONABLE_RATE base → cand:
PIT: 0 / 0
REPRO_RUNS: 2
GATES_1_15: (table PASS/FAIL/INCONCLUSIVE)
FAMILY_K: (≤5)
WINNER_SELECTION_RULE: pre-declared (e.g. max paired proxyR delta among PASSing)
EDGE_CLAIM: NONE
HOLDOUT: SEALED
VAL_STATUS: NOT_RUN
```

---

## 8. What this protocol deliberately does **not** do

- Does not declare edge, profitability, or production readiness  
- Does not authorize holdout unlock  
- Does not promote invent-path baselines v3/v4 (separate correctness track; currently not promoted)  
- Does not equate STRICT opportunities/day with executable trades  
- Does not allow “looks better on one good week” promotion  

---

## 9. Sources (thresholds grounded in)

| Document | Role |
|----------|------|
| `karen-dev-actionable-performance-audit.md` | T-before **19.5%**, proxyR **−0.330**, MFE/MAE, Z=71 |
| `karen-dev-wait-overcaution-audit.md` | WAIT **79.2%**, missed-opp **75.7%**, structurally_overcautious |
| `karen-opportunity-frequency-reconciliation.md` | STRICT ~10.5/day SoT; bimodality; episode definitions |
| `day-karen-edge-validation-final.md` + carve-v1 | Split geography; DEV/VAL/holdout roles; denser DEV context |
| `karen-trading-brain-baseline-v2.md` / `karen-semantic-baseline-freeze.md` | Frozen brain id; no stack unclear promotions |
| `karen-dv-experiment-registry.md` | Machine ledger: experiment identity, HOLDOUT seal, VAL one-shot / no-tune guards |
| `karen-walk-forward-oos-protocol.md` | Anchored WF + purge/embargo calendar; extends DEV OOS; does not unlock holdout |
| `karen-first-broken-hop-diagnostic-pipeline.md` | Ordered hop queue (evidence → WAIT → actionables → weights…); forbids early weight sweeps / gate removal |

---

## See also

**Investigation order before promotion:** [`karen-first-broken-hop-diagnostic-pipeline.md`](./karen-first-broken-hop-diagnostic-pipeline.md) — locate the first broken hop; do not tune LONG/SHORT thresholds or remove WAIT gates to pass these gates.

---

## 10. Changelog

| Time | Change |
|------|--------|
| 2026-08-15 | Initial pre-registration — gates 1–15 + REJECT / RESEARCH_MORE / PROMOTE_TO_VALIDATION |
| 2026-08-15 | Wire note: experiment registry scaffolding (`karen-dv-experiment-registry.md`) enforces HOLDOUT seal + VAL tuning forbid at registration |
| 2026-08-15 | Cross-link: anchored walk-forward OOS protocol (`walk-forward-anchored-v1`) as primary temporal design |
| 2026-08-15 | Cross-link: first-broken-hop diagnostic pipeline (investigation order vs promotion gates) |

**EDGE_CLAIM:** NONE  
**HOLDOUT_STATUS:** SEALED  
**VALIDATION_TUNING:** FORBIDDEN  
