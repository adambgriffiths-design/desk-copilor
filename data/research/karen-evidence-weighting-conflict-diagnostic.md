# KAREN — Evidence weighting / conflict diagnostic (Track B)

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/` (mirrored here)  
**MODE:** LIGHTWEIGHT — existing DEV artifacts only (no heavy replay)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH / not consumed for Track B; programme c1 VAL already failed quality (do not re-run / do not promote binary c1)  
**LOGIC:** unchanged (no weights / thresholds / gates edited)

---

## Constraint observance

- Peer `karen-dv-dev-overcaution-candidates` **not interrupted**. Published JSON still `smoke: true` (Y=48); log may show unpublished Y=1500 compute — **metrics from unpublished package = NOT USED**.
- No new Y=1500 / day-walk / brain replay launched.
- Sources: dual-audit Y=1500 aggregates, wait-driver taxonomy (8d), overcaution smoke (c1/c2/c3), interpretation + decision-layer code path (read-only), era-split / wait-overcaution notes.

---

## Architecture fact (critical)

Layer 3 (`buildTradingDecision`) is **binary support routing**, not continuous scoring:

> “explicit verdict from interpretation + observation constraints. **No weighted scores.**”

Interpretation support (`interpretation-engine.ts`):

| Rule | Frozen behaviour |
|------|------------------|
| Min reasons | `reasons.length >= 2` (`FROZEN_MIN_REASONS_FOR_SUPPORT`) |
| Hard blocks | structure/FVG `unknown`; opposing bias/structure contradiction string; NY reversal-lookalike without SSL sweep |
| Conflict branch | both `longSupported && shortSupported` → WAIT |
| Continuous long/short scores | **do not exist** on the verdict path |
| Concept `CONCEPT_WEIGHTS` / `weighted_contribution` | explainability / playbook naming — **not** the LONG/SHORT gate |

**Implication:** “evidence weighting” as a continuous margin problem is mostly **NOT MEASURED** because fields are absent from DecisionEnvelope verdict construction. What *is* measurable is binary support + contradiction tags + both-sides share.

---

## 1. Evidence combinations → actionable vs WAIT

### WAIT mass (decision-layer PRIMARY)

| Primary (8d taxonomy, WAIT=550) | n | % of WAIT |
|---------------------------------|--:|----------:|
| **ENTRY_STATUS_FORCE_WAIT** | 493 | **89.6%** |
| **BOTH_SIDES_CONFLICT** | 57 | **10.4%** |
| QG_BLOCKED | 0 | 0% |

Dual-audit Y=1500: WAIT=1188/1500 (**79.2%**); `both_sides_supported` tag = **113 / 9.5%** of WAITs (coarse proxy for conflict branch).

### Co-present evidence on WAIT (secondary; not causal)

| Flag | Taxonomy % of WAIT | Dual-audit WAIT driver miss rate |
|------|-------------------:|---------------------------------:|
| fvg present | 82.9% | 79.0% miss (n=1021) |
| displacement present | 74.9% | 75.9% miss (n=871) |
| contradictions_n=1 | 34.9% | 75.7% miss (n=441) |
| both_sides_supported | — | 74.3% miss (n=113) |
| contradictions_n=2 | — | 89.5% miss (n=19) |
| fvg absent | — | **55.1%** miss (n=167) — lower miss |

**Actionable path (frozen):** exactly one side supported **and** `entryStatus === ACTIVE` (not WAIT/EXTENDED) **and** QG canDeliver.

| Current actionables (dual-audit) | Value |
|----------------------------------|------:|
| N | 71 (39L / 32S) |
| T-before (scored) | **19.5%** |
| med MFE / MAE | 12 / 9.5 |
| mean proxyR | **−0.330** |

**Per-evidence-combination breakdown of actionables:** **NOT MEASURED** (dual-audit JSON has no per-row reason vectors / combo tables for ACT rows).

---

## 2. Contribution by evidence component

| Component | Status |
|-----------|--------|
| Continuous `weighted_contribution` → verdict | **NOT MEASURED** (not on verdict path) |
| Binary reason membership (bias / MSS / sweep / disp / FVG) | Code-defined; **frequency on WAIT** measured via taxonomy SECONDARY |
| Relative contribution ranks among reasons | **NOT MEASURED** (no score fields in dumps) |

Taxonomy SECONDARY on FORCE_WAIT WAITs (n=493): PD+session liquidity cited 100%; mss 448; fvg 399; bearish bias 381; displacement 358 — structure-rich WAITs dominate.

---

## 3. Long / short score margins

| Metric | Status |
|--------|--------|
| longScore − shortScore | **NOT MEASURED** (no scores) |
| reason-count margin (nLong − nShort) | **NOT MEASURED** (no per-row dumps on disk) |
| Smoke proxy: c2 both-sides support | baseline bothSides=2 → c2 bothSides=**16** (Y=48) with **ACTΔ=0** — relaxing minReasons creates *more* conflict stamps, not actionables |

---

## 4. Contradiction patterns

| Pattern | Where measured | Note |
|---------|----------------|------|
| Structure vs opposing HTF bias | Code: contradiction string zeros that side’s support | Binary cancel — **no strength threshold** |
| HTF biases not aligned | contradictions[] | Soft narrative; does not alone force WAIT |
| FVG/structure/displacement unknown | contradictions + often NO_TRADE | Upstream of weighting |
| Reversal lookalike w/o SSL | forces long unsupported | Skip, not weight |
| Dual-audit `contradictions_n=1` | 37.1% of WAIT; miss **75.7%** ≈ overall | Not distinctive vs FORCE_WAIT mass |
| `contradictions_n=2` | 1.6% of WAIT; miss **89.5%** | Rare; high miss but tiny n |
| BOTH_SIDES | ~10% WAIT | Real conflict branch; **secondary** to FORCE_WAIT |

---

## 5. Outcome quality by evidence combination

| Slice | MFE/MAE / T-before / proxyR |
|-------|-----------------------------|
| All WAIT (dual-audit) | med MFE/MAE 11.5/11.5; miss 75.7% (heuristic) |
| WAIT + fvg present | miss 79.0% — **NOT MEASURED** full T-before/proxyR by combo |
| WAIT + both_sides | miss 74.3% — same |
| WAIT + contradictions_n=1 | miss 75.7% — same |
| Actionable × evidence combo | **NOT MEASURED** |
| Offline rescoring without brain replay | **NOT AVAILABLE** (no per-asOf reason dumps stored) |

---

## 6. Targeted failure modes

### A) Weak opposing evidence canceling strong directional evidence

| Evidence | Finding |
|----------|---------|
| Mechanism | Opposing bias/structure contradiction **hard-zeros** support on the opposed side — not a weak-vs-strong weight fight |
| Continuous “weak cancel strong” | **NOT MEASURED** (no margins) |
| Prevalence of true both-sides WAIT | **~10%** of WAIT (taxonomy 10.4%; dual-audit tag 9.5%) |
| Era PRE/POST both-sides share | 9.1% / 10.9% — stable, does **not** explain PRE zero delivery |
| Smoke c2 (minReasons 1) | Increases both-sides support (2→16) but **zero** WAIT→ACT — entry FORCE_WAIT still dominates |

**Verdict:** Weak-opposing-cancel is a **plausible code-path hazard** on a **minority** of WAITs; it does **not** explain the ~90% FORCE_WAIT / 79% WAIT share.

### B) Weak evidence combinations allowed through to actionable

| Evidence | Finding |
|----------|---------|
| Gate to ACT | Requires ACTIVE entry zone + ≥2 reasons + one-sided support |
| Quality of current ACTs | Poor expectancy proxy (T-before 19.5%, proxyR −0.330) — **suggests** downstream decision quality issues **after** gate clears |
| Which weak combos among the 71 | **NOT MEASURED** (no combo table) |
| Smoke c1 unlock | Mass WAIT→ACT with provisional positive smoke quality — implies many gated states already had directional support; weakness-at-entry is separate from “weak combo passed” |

**Verdict:** Cannot confirm “weak combos leak to ACT” from artifacts; can confirm **current ACTs underperform** and need hop-3 scoring after WAIT diagnosis — not a license to retune weights now.

---

## Smoke contrast (weighting-adjacent vs entry gate)

| Candidate | Single change | WAIT→ACT (Y=48 smoke) | Promising? |
|-----------|---------------|----------------------:|:-----------|
| **c1** | entry WAIT no longer blocks | **43** | YES (smoke only) |
| **c2** | minReasons 2→1 | **0** | no |
| **c3** | widen entry band 28→42 | **0** | no |

---

## Track B conclusion

| Question | Answer |
|----------|--------|
| Is evidence weighting / conflict the dominant WAIT driver? | **No** — BOTH_SIDES ~10%; FORCE_WAIT ~90% |
| Are continuous weights broken? | **NOT MEASURED** as scores; verdict path is binary |
| Should next single change be a weight / conflict rewrite? | **No** — explanatory power and smoke Δ favor entry FORCE_WAIT |
| GATE for Track B work | **DEFER** weight/conflict experiments — binary c1 **REJECT** for promote (DEV Gate 10 + VAL proxyR); next is refined delay-vs-suppress on hop 2, not weights |

**TRACK_B_STATUS:** COMPLETE (artifacts-only) + reconciled: **do not recommend promoting binary c1**  
**PIT_VIOLATIONS:** 0 on ingested DEV packages  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  

---

## APPEND — post c1 Y=1500 + VAL

Binary `c1_wait_entry_actionable` showed DEV structural/quality lift then **VAL proxyR collapse** (−0.561 → −1.053) and Gate 10 spam (~76% ACT). **REJECT promote.** Track B remains secondary (~10% BOTH_SIDES); do not pivot to weight sweeps to “replace” c1. Next = **`c4_shadow_quality_gated_wait`** — see `karen-next-single-change-dev-candidate.md`.

## Artifacts consumed

- `nq-history-archive-dev-dual-audit-latest.json` + `karen-dev-wait-overcaution-audit.md`
- `wait-driver-taxonomy-latest.json` + `karen-wait-driver-taxonomy.md`
- `nq-history-archive-dev-overcaution-candidates-latest.json` (`smoke: false` Y=1500 + VAL) + research note
- `lib/interpretation-engine.ts`, `lib/decision-layer.ts`, `lib/decision-process-experiment.ts`
- `karen-era-split-entry-force-wait.md`, `karen-entry-status-force-wait-bottleneck.md`
