# Karen — Era-split ENTRY_STATUS_FORCE_WAIT (pre vs post 2024-06-24)

**PHASE:** research / measure-only  
**TREE:** `.tmp/karen-final-integration/`  
**TIME:** 2026-08-15T20:45:00Z (approx)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**TUNING:** none · **VAL:** not touched · **weights:** unchanged  

**Split:** `2024-06-24` (first active dense-panel day; POST inclusive)  
**Panel:** 40 even-spaced DEV days (`opportunity-frequency-dense-panel-latest.json`)  
**Decision sample:** quiet-vs-active scored records @ **30m** · Y=**1847** · PIT=**0**  
**Script:** `scripts/karen-dv-era-split-entry-force-wait.ts`  
**JSON:** `data/karen-decision-validation/acquisition/reports/era-split-entry-force-wait-latest.json`  
**Registry:** `exp-era-split-entry-force-wait-2026-08-15` · decision=`research` · PIT=0  

---

## Return card

| Field | Value |
|---|---|
| PRE days | **17** (2023-10-02 → 2024-06-07) |
| POST days | **23** (2024-06-24 → 2025-05-30) |
| PRE quiet rate | **100%** (17/17) |
| POST quiet rate | **34.8%** (8/23) |
| PRE opp/day | **0.00** (STRICT ep=0) |
| POST opp/day | **17.83** (STRICT ep=410) |
| PRE ENTRY_FORCE / WAIT | **90.9%** (599/659) |
| POST ENTRY_FORCE / WAIT | **89.1%** (723/811) |
| POST T-before (STRICT) | **31.8%** |
| POST mean proxyR | **−1.860** |
| VERDICT | **era_regime_change_mixed** |
| EDGE_CLAIM | **NONE** |
| PIT_VIOLATIONS | **0** |
| NEXT_SAFE_TASK | Re-gate peer **c1_wait_entry_actionable** when Y=1500 report publishes (protocol RESEARCH_MORE on smoke — see `karen-dev-candidate-c1-protocol-decision.md`) |

---

## 1. Question

Is the early archive era systematically suppressed by `ENTRY_STATUS_FORCE_WAIT` and/or a data/schema regime change?

Reuse only existing DEV scored records. No re-eval, no threshold search, no HOLDOUT.

---

## 2. PRE vs POST metrics

| Metric | PRE (&lt; 2024-06-24) | POST (≥ 2024-06-24) | Δ (POST−PRE) |
|---|---:|---:|---:|
| Panel days | 17 | 23 | — |
| Quiet rate | **100%** | **34.8%** | **−65.2 pp** |
| STRICT opportunities/day | **0.00** | **17.83** | **+17.83** |
| STRICT episodes total | 0 | **410** | +410 |
| Decision evals @30m | 792 | 1055 | — |
| Actionable stamps | **0** | **95** | +95 |
| Actionable rate | **0.0%** | **9.0%** | +9.0 pp |
| WAIT count | 659 | 811 | — |
| ENTRY_STATUS_FORCE_WAIT % of WAIT | **90.9%** | **89.1%** | −1.7 pp |
| BOTH_SIDES % of WAIT | 9.1% | 10.9% | +1.8 pp |
| median mss / fvg / disp | 0.91 / 0.81 / 0.74 | 0.91 / 0.96 / 0.73 | structure present both |

### T-before / proxyR (cheap from dense panel STRICT quality)

| Era | STRICT ep | T-before | mean proxyR | med MFE / MAE |
|---|---:|---:|---:|---:|
| PRE | 0 | n/a | n/a | n/a |
| POST | 410 | **31.8%** | **−1.860** | 11.625 / 11.875 |

All panel STRICT episodes fall on POST (PRE ep=0). Aggregate quality = POST quality.

---

## 3. Answer

**Yes on delivery suppression; mixed on mechanism.**

1. PRE is a **complete zero-delivery block** (17/17 quiet, 0 STRICT episodes) despite **high structure** (mss/fvg/disp medians ~0.91/0.81/0.74).
2. POST unlocks actionable density (**17.8 opp/day**, quiet 34.8%).
3. `ENTRY_STATUS_FORCE_WAIT` share of WAIT is **~same** PRE vs POST (90.9% → 89.1%) — not a PRE-only spike in that driver rate.
4. Therefore the break is an **era × gate / archive-schema regime interaction**: the same force-wait-dominated WAIT regime delivers nothing early and does deliver later. This extends the quiet-vs-active **gating_defect** finding with a chronological cut.

This is **not** permission to tune on VAL. EDGE_CLAIM remains NONE.

---

## 4. Verdict

### **era_regime_change_mixed**

- Early era **is** systematically suppressed on desk delivery.
- Suppression is **not** explained by a higher PRE-only `ENTRY_STATUS_FORCE_WAIT` rate (rates match).
- Points to early-archive regime interaction with the persistent entry-force gate (data/schema/regime), not “PRE days simply lack structure.”

Sibling of quiet-vs-active `gating_defect` — chronological confirmation, still measure-only.

---

## 5. Peer note (non-blocking)

On disk (smoke Y=48):

- `data/research/karen-dev-overcaution-candidates.md`
- **c1_wait_entry_actionable** promising (WAIT→ACT large Δ; T-before 82.1%; proxyR 0.214)
- c2 / c3 fail smoke bar
- Smoke VAL heuristic for c1 ran — still **EDGE_CLAIM NONE**

Era-split did **not** wait on full Y=1500. c1 remains the natural single-change candidate for protocol gates next.

---

## 6. NEXT_SAFE_TASK

1. **Preferred:** Re-gate peer overcaution **c1_wait_entry_actionable** when full Y=1500 report is published (smoke already gated → **RESEARCH_MORE**; see `karen-dev-candidate-c1-protocol-decision.md`).
2. Do **not** unlock HOLDOUT. Do **not** threshold-tune from this era panel alone.
3. Optional later: diagnose *why* PRE archive days never clear entryStatus despite structure (schema / feature / entry-band interaction) — still measure-first.

---

## EDGE_CLAIM

**NONE**
