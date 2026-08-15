# KAREN — c4 Shadow-Quality-Gated WAIT Diagnostic

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/` (mirrored to repo `data/research/`)  
**PHASE:** decision-process research  
**BASELINE_FROZEN_ID:** `baseline-v2`  
**MODE:** DEV ONLY  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VALIDATION:** DO NOT TOUCH (c1 one-shot already consumed; not re-run)

**Programme question:** Can Karen distinguish, using only PIT-safe info at *t*, WAIT that protects vs WAIT that suppresses good opportunities?

---

## Hard constraints observed

- Do **not** resurrect binary `c1_wait_entry_actionable` as promote/implement-next
- Do **not** change evidence weights, baseline-v2, target/invalidation/session defs
- Do **not** access VAL/HOLDOUT; do **not** brute-force thresholds
- Shadow diagnostic ≠ real DecisionEnvelope unless a flagged ALS path is justified
- If `CLEAR_PIT_SAFE_DISCRIMINATOR = NO` → `C4_DEFINED = NO`, stop before inventing a weak rule

**Artifacts reused (no invent; no duplicate heavy Y=1500 re-run):**

| Artifact | Role |
|----------|------|
| `nq-history-archive-dev-overcaution-candidates-latest.json` (`smoke:false`, Y=1500) | Paired none vs c1 counts / quality |
| `karen-dev-candidate-c1-protocol-decision.md` | c1 REJECT + Gate 10 / VAL proxyR |
| `nq-history-archive-dev-dual-audit-latest.json` | WAIT class / drivers / evidenceAtT best-worst |
| `karen-wait-driver-taxonomy.md` | PRIMARY ENTRY_STATUS_FORCE_WAIT ≈90% |
| `karen-entry-status-force-wait-bottleneck.md` | Gate predicate + same-stamp suppress |
| `karen-opportunity-frequency-reconciliation.md` + dense panel | WAIT→ACTION latency / never-convert |
| `lib/decision-process-experiment.ts` | Existing ALS surface (`none` default) |

---

## 1 — c1 failure decompose (Y=1500 paired + recorded VAL)

| | none (baseline-v2) | c1_wait_entry_actionable |
|--|-------------------:|-------------------------:|
| WAIT | 1188 | 114 |
| ACT | 73 | 1147 |
| WAIT→ACT | — | **1074** |
| ACT→WAIT | — | **0** |
| T-before | 21.4% | 58.1% |
| mean proxyR | −0.330 | +0.314 |
| PIT | 0 | 0 |
| ACT rate | 4.9% | **76.5%** |

**VAL (already recorded; not re-run):** T-before 32.5%→50.2% but mean proxyR **−0.561 → −1.053** (quality FAIL).

**Failure anatomy (not “trade more”):**

1. **Selectivity collapse:** one knob flipped *all* `entryStatus===WAIT` one-sided stamps to L/S → Gate **10 FAIL** (spam).
2. **Quality mixture:** DEV aggregate shadow looked strong; confirmatory VAL expectancy **worsened** → unlocked population mixes good and bad stamps; binary rule cannot keep the protect subset.
3. **Wrong next move:** resurrecting c1 or lowering weights would not fix the missing *discriminator*.

Binary FORCE_WAIT removal is **closed**. Need a PIT-safe subset rule — only if one exists.

---

## 2 — Delay vs permanent suppression

### Sparse Y=1500 (c1 paired)

- **1074** WAIT→ACT at the **identical asOf** (0 ACT→WAIT).
- Interpretation: for the FORCE_WAIT mass that c1 unlocks, the gate is overwhelmingly **same-stamp suppression** of directional delivery, not a measured multi-minute delay that later clears on the same sparse sample.

### Dense panel (existing; different question)

From opportunity-frequency / dense panel (baseline dynamics, not c1 shadow):

| Metric | Value |
|--------|------:|
| WAIT→ACTION latency n | 102 (recon) / 407 (panel) |
| Median latency | **5 min** |
| ≤15m | ~87–93% |
| WAIT never actionable same-day | **~58–69%** |

So a **brief-delay class** exists among waits that *do* later become actionable, and a large **never-convert / session-suppress** class also exists.

### FORCE_WAIT-specific clearance (entryStatus WAIT→ACTIVE)

**Status (2026-08-15):** **MEASURED** on dense-panel ∩ Y=1500 FORCE_WAIT stamps (n=104 / 1074). Full-universe denser coverage still optional / partial NOT MEASURED. See [`karen-force-wait-clearance-bins.md`](./karen-force-wait-clearance-bins.md).

| Bin (exclusive) | n | share |
|-----------------|--:|------:|
| ≤5m | 5 | 4.8% |
| 5–15m | 4 | 3.8% |
| 15–30m | 4 | 3.8% |
| 30–60m | 4 | 3.8% |
| same session (>60m) | 13 | 12.5% |
| **never** | **74** | **71.2%** |

| Class | n |
|-------|--:|
| HARMFUL_SUPPRESSION | **47** |
| USEFUL_SUPPRESSION | 21 |
| HARMFUL_DELAY | 15 |
| USEFUL_DELAY | 11 |
| INCONCLUSIVE | 10 |

Clearers median latency **41.5m** (≠ all-WAIT dense ~5m). Gated vs eventual mean proxyR **+0.97 → −0.65** (cleared both-proxy n=26).

**Section 2 verdict:** Same-stamp suppression still dominates the *c1* unlock story. Dense FORCE_WAIT→same-direction clearance is mostly **never** (71%); brief ≤15m is rare (8.7%); permanent **HARMFUL_SUPPRESSION** is the largest class. Do not equate sparse same-stamp flips with delay; do not reuse generic WAIT→action 5m median for this primary.

---

## 3 — Shadow quality (diagnostic only)

**Shadow definition (analysis):** apply c1 semantics (`shouldForceEntryWait` only on `EXTENDED`) to stamps that baseline forced WAIT under `entryStatus===WAIT` + one-sided support. **Not** production DecisionEnvelope.

| Shadow aggregate | DEV Y=1500 |
|------------------|------------|
| Shadow ACT N | 1147 (1074 flips + 73 baseline ACT) |
| T-before | 0.581 |
| med MFE / MAE | 11.75 / 10.75 |
| mean proxyR | +0.314 |

**Quality read:** DEV shadow looks *better* than baseline ACT (−0.330), but recorded VAL on the same binary unlock **collapsed proxyR**. Aggregate DEV shadow quality is therefore **not trustworthy as a promote signal** and does **not** by itself identify the good subset.

No persisted stamp-level table of `{asOf, evidenceAtT, shadowSide, shadowProxyR}` from the Y=1500 run was found — only aggregates + dual-audit actionable best/worst (baseline ACT, n≈71).

---

## 4 — Good vs harmful WAIT discriminators (PIT-safe at t)

### Outcome labels (forbidden as gate features)

| Class (dual-audit heuristic) | n | share of WAIT |
|------------------------------|--:|--------------:|
| GOOD_WAIT | **3** | **0.3%** |
| MISSED_OPPORTUNITY | 899 | 75.7% |
| INCONCLUSIVE | 286 | 24.1% |

These use **post-t** excursions. They diagnose overcaution; they **must not** enter a live predicate.

### PIT-safe candidates inspected (no threshold sweep)

| Candidate at t | Observation | Separates protect vs harmful? |
|----------------|-------------|-------------------------------|
| PRIMARY = ENTRY_STATUS_FORCE_WAIT | ~90% of WAIT | Defines the *pool*, not a subset |
| `entryStatus` WAIT vs EXTENDED | c1 already keeps EXTENDED waiting | Does not split the 1074 WAIT unlocks |
| fvg / displacement / mss / contradictions | Miss rates ~75% across most flags; fvg=absent miss ~55% | **No clean cut** — present-flags dominate both miss mass and actionable best/worst |
| Session / time bucket | Miss rates high in all major buckets (≈73–88%) | No session-only unlock |
| both_sides_supported | ~10% WAIT; stays WAIT under c1 | Wrong primary for c4 |
| Baseline ACT evidenceAtT best vs worst | Overlap: often mss+displacement+fvg present on both | No obvious PIT signature of quality |

**GOOD_WAIT characteristics (protect):** n=3 only — **no stable PIT profile**. Cannot define “keep WAIT when …” from three stamps.

**HARMFUL_WAIT characteristics (suppress-good, descriptive):** large MISSED_OPPORTUNITY share; one-sided support + `entryStatus=WAIT`; c1 shows they *could* be delivered same stamp; VAL shows many of those deliveries are expectancy-negative OOS. **No PIT feature found that isolates the harmful subset from the protective remainder.**

### CLEAR_PIT_SAFE_DISCRIMINATOR

**NO** — not with existing artifacts, without data-mining outcome-conditioned thresholds.

---

## 5 — No data-mined magic

Refused:

- Mining shadow proxyR floors / T-before cutoffs against evidence flags
- Combining unrelated exceptions (session ∧ fvg ∧ contradictions ∧ …)
- Re-tuning weights or minReasons to “replace” a missing discriminator

---

## 6 — Define c4 only if justified

| Field | Value |
|-------|--------|
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** |
| **C4_DEFINED** | **NO** |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| Candidate ALS code path | **Not implemented** (would be unjustified) |
| Registry promote/score entry | **Not created** (register-before-score only applies if defined) |

Hypothesis from the hint doc remains a *research direction*, not a shippable one-knob until a PIT-safe subset rule is evidenced.

---

## 7 — Register before scoring

**N/A** — c4 not defined → no candidate scoring → no new experiment row with `candidate_version=c4_*`.

Ledger note only (this diagnostic): programme id `c4_shadow_quality_gated_wait` stays **research / not registered as scored candidate**.

---

## 8 — DEV paired asOf test

**Not run** for c4 (no predicate). Baseline vs binary-c1 paired Y=1500 already authoritative for section 1; do not re-score c1.

---

## 9 — Quality > quantity + stability

Without a selective rule, any unlock of the 1074 mass re-opens Gate 10 / VAL proxyR failure modes. Stability of a non-existent rule = **INCONCLUSIVE**. Prefer **zero new actionables** over spam.

---

## 10 — DECISION

| Decision | Apply? |
|----------|:------:|
| REJECT (c4 candidate) | N/A — never defined |
| **RESEARCH_MORE** | **YES** |
| PROMOTE_TO_VALIDATION | **NO** |

**READY_FOR_ADAM:** NO (promote path only)

**Production ALS:** remains `none` / baseline-v2.

---

## What would unblock a real c4 (next measurement only)

One measurement harness (DEV, no candidate predicate, no VAL):

1. On the **same** Y=1500 none/c1 paired asOfs, dump FORCE_WAIT stamps with:
   - PIT `evidenceAtT` (+ `entryStatus`, session, reason counts)
   - baseline verdict WAIT
   - shadow side under c1
   - shadow outcome metrics (T-before / MFE / MAE / proxyR) for analysis only
2. Optionally: dense FORCE_WAIT→`entryStatus=ACTIVE` clearance latency keyed to primary (close TOO_EARLY in §2)
3. Only **then** pre-declare **one** interpretable PIT condition if a clear cut appears — register — score.

Until that contingency exists, defining `c4_shadow_quality_gated_wait` would be inventing a weak rule.

---

## 11 — Y=1500 FORCE_WAIT shadow stamp dump (DEV, 2026-08-15)

**Status:** DONE (measurement only). Script: `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts` (TREE + repo mirror).

| Artifact | Path |
|----------|------|
| Full JSON | `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json` |
| JSONL | `…/force-wait-shadow-stamps-y1500-latest.jsonl` |
| Schema note | `…/force-wait-shadow-stamps-y1500.schema.md` |
| Run log | `…/force-wait-shadow-stamps-y1500-run.log` |

**Method:** identical archive-carve-v1 DEV plan as overcaution Y=1500 (`none` + `c1_wait_entry_actionable`, cadence=10, limit=1500). PIT=0. No registry score. No VAL.

### Counts

| Metric | Value |
|--------|------:|
| Paired asOfs | 1500 |
| **N stamps** | **1075** |
| FORCE_WAIT (WAIT→ACT under c1) | 1074 |
| FORCE_WAIT_STAY_WAIT | 1 |
| Shadow LONG / SHORT / WAIT | 519 / 555 / 1 |
| Outcome GOOD / BAD / NEUTRAL | 612 / 365 / 98 |
| Shadow ACT mean proxyR | +0.360 |
| Shadow ACT T-before | 60.2% |

Outcome labels are **post-freeze analysis only** (GOOD: T-before or proxyR≥0.25; BAD: inv-before or proxyR≤−0.25; else NEUTRAL). Forbidden as gate features.

### Univariate associations (optional; no combinations)

Pool shadow-ACT goodRate ≈ **57.0%**. Top |ΔgoodRate| levels (n≥20; not a c4 cut):

| Feature @ t | Level | n | goodRate | Δ vs pool |
|-------------|-------|--:|--------:|----------:|
| marketStructure | unclear | 93 | 31.2% | **−25.8pp** |
| mssPresent | false | 93 | 31.2% | −25.8pp |
| cited_mss | true | 441 | 80.7% | **+23.7pp** |
| contradictionCount | 1 | 435 | 78.9% | +21.9pp |
| entryModel | bullish structure continuation | 209 | 77.5% | +20.5pp |
| entryModel | bearish structure continuation | 201 | 37.3% | −19.7pp |

**Read:** associations exist (MSS citation / structure-clarity / entryModel side asymmetry), but each still mixes GOOD+BAD (e.g. cited_mss=true badRate 17.5%; unclear still 31% GOOD). No single PIT feature isolates protect vs harmful cleanly enough to pre-declare one knob. `contradictionCount=1` uplift is likely confounded with MSS presence — do **not** gate on it.

**Candidate hypotheses only (not predicates):**

1. Prefer unlock when `cited_mss=true` / structure clear; keep WAIT when `marketStructure=unclear` / `mssPresent=false`.
2. entryModel bullish vs bearish continuation quality asymmetry — investigate before any ALS wire.

**CLEAR_PIT_SAFE_DISCRIMINATOR:** still **NO** (hints ≠ pre-declarable rule).  
**C4_DEFINED:** **NO** · **C4_SINGLE_CHANGE:** **NOT_DEFINED** · **DECISION:** **RESEARCH_MORE**

§2 dense FORCE_WAIT→ACTIVE clearance: **MEASURED** on panel∩stamps (n=104) — see §2 update + `karen-force-wait-clearance-bins.md`. Full 1074 denser coverage optional.

---

## 12 — Pre-declare (research text only, 2026-08-15)

**Status:** ONE hypothesis pre-declared as research stake — **not** a c4 single-change.

| Field | Value |
|-------|--------|
| **PREDECLARE** | `h_c4_fw_unlock_cited_mss` |
| **Doc** | [`karen-c4-wait-hypothesis-predeclare.md`](./karen-c4-wait-hypothesis-predeclare.md) |
| **Predicate (at t)** | FORCE_WAIT ∧ `featuresAtT.cited_mss === true` |
| **Intent** | Unlock (selective); leave `cited_mss=false` WAIT |
| **Dump grounding** | n=441; goodRate 80.7% (Δ+23.7pp); badRate 17.5% still mixed |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** (still) |
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** (still) |
| **ALS / score / VAL** | **Forbidden** this turn |

Why not c4 yet: still mixes GOOD+BAD; possible confound with contradictionCount; shadow labels ≠ live gate; clearance now measured but does not by itself ship a knob.

**DECISION:** **RESEARCH_MORE**  
**NEXT_SINGLE_ACTION:** Adam review whether `h_c4_fw_unlock_cited_mss` may become a registered c4 single-change (clearance shows permanent HARMFUL_SUPPRESSION, not brief-delay) — still no ALS/score without explicit define.

---

## 13 — §2 clearance bins closed (panel slice, 2026-08-15)

**Doc:** [`karen-force-wait-clearance-bins.md`](./karen-force-wait-clearance-bins.md)  
**Artifact:** `force-wait-clearance-bins-latest.json` (n=104 panel∩FORCE_WAIT; PIT=0).

**cited_mss=true (n=47):** never 76.6%; HARMFUL_SUPPRESSION 61.7%; ≤15m clear 6.4% → pre-declare failure #4 (brief-delay would clear anyway) **does not fire**. Unlock would target permanent suppression. Still mixes USEFUL_SUPPRESSION (7) + HARMFUL_DELAY (7); cleared proxyR gated→eventual collapses (+3.04→−0.60). **C4 still NOT_DEFINED.**

---

## FINAL REPORT

```
BOTTLENECK_RESULT: ENTRY_STATUS_FORCE_WAIT same-stamp suppression (~90% WAIT primary; 1074 WAIT→ACT @identical asOf under binary c1). Binary c1 REJECT (Gate10 ACT~76.5% + VAL proxyR −0.561→−1.053). Stamp dump N=1075; research pre-declare h_c4_fw_unlock_cited_mss (cited_mss=true unlock; n=441 Δgood+23.7pp) — still no clean PIT cut / C4 NOT_DEFINED. §2 clearance n=104: never 71.2%; HARMFUL_SUPPRESSION 47; brief≤15m 8.7%.
GOOD_WAIT_CHARACTERISTICS: n=3/1188 (0.3%); no stable PIT-safe profile — protect class too thin to gate on
HARMFUL_WAIT_CHARACTERISTICS: MISSED_OPPORTUNITY heuristic 75.7% of WAIT; one-sided support + entryStatus=WAIT; unlockable same-stamp under c1 but OOS quality-mixed; stamp-level shadow GOOD/BAD mixed across same PIT flags; dense same-dir never-clear 71% with HARMFUL_SUPPRESSION largest
C4_SINGLE_CHANGE: NOT_DEFINED
NEW_ACTIONABLE_N: N/A (c4 not scored)
TARGET_BEFORE_INV_BASELINE_VS_C4: N/A (c4 not scored); baseline 21.4%; c1 shadow ref 58.1% (not a c4 result)
PROXY_R_BASELINE_VS_C4: N/A (c4 not scored); baseline −0.330; c1 shadow ref +0.314 DEV / VAL collapse recorded (not a c4 result); clearance gated→eventual mean +0.97→−0.65 (n=26 cleared)
MFE_MAE_BASELINE_VS_C4: N/A (c4 not scored); baseline med 12/9.75; c1 shadow ref 11.75/10.75
OPPORTUNITIES_PER_DAY_BASELINE_VS_C4: N/A (c4 not scored); baseline sparse ~0.17 act/day; dense STRICT median 10.5 ep/day
STABILITY: INCONCLUSIVE — CLEAR_PIT_SAFE_DISCRIMINATOR=NO; §2 panel slice measured (full 1074 denser coverage optional)
PIT_VIOLATIONS: 0
DECISION: RESEARCH_MORE
READY_FOR_ADAM: optional H review only — NO promote
NEXT_SINGLE_ACTION: Adam review whether h_c4_fw_unlock_cited_mss may become a registered c4 single-change (clearance = permanent HARMFUL_SUPPRESSION, not brief-delay) — no ALS/score without explicit define
```

**PREDECLARE:** `h_c4_fw_unlock_cited_mss` (research text only — see `karen-c4-wait-hypothesis-predeclare.md`)  
**CLEAR_PIT_SAFE_DISCRIMINATOR:** NO  
**C4_DEFINED:** NO  
**C4_SINGLE_CHANGE:** NOT_DEFINED  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
