# KAREN — H-review: `h_c4_fw_unlock_cited_mss` (gaps 1–2 + DEFINE_BLOCK)

**DATE:** 2026-08-16  
**MODE:** research measurement / documentation only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**ALS / score registry / production:** none — do **not** score, register, or implement  
**Source dump:** `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json` (paired Y=1500; stamps N=1075; shadow-ACT FORCE_WAIT pool n=1074)  
**Pre-declare:** [`karen-c4-wait-hypothesis-predeclare.md`](./karen-c4-wait-hypothesis-predeclare.md)  
**Alt discriminator scan:** [`karen-c4-alt-discriminator-scan.md`](./karen-c4-alt-discriminator-scan.md)

---

## ADAM_DECISION

| Field | Value |
|-------|--------|
| **ADAM_DECISION** | **DEFINE_BLOCK** |
| **hypothesis_id** | `h_c4_fw_unlock_cited_mss` |
| **Status as c4 seed** | **BLOCKED / CLOSED** |
| **H_VERDICT** | **DEFINE_BLOCK** (prior measurement history: RESEARCH_MORE_WITH_GAPS for gaps 1–2) |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** |
| **EDGE_CLAIM** | **NONE** |
| **HOLDOUT** | **SEALED** |
| **Score** | none |

**Rationale (Adam-approved DEFINE_BLOCK):** `cited_mss` is nearly collinear with `contradictionCount=1` (φ≈0.938, agreement 97.0%); unlock-all projects Gate-10 ACT **34.1%** on Y=1500 (fails ≤20% / unlock budget n≤229); residual BAD mix 17.5% (77 BAD). No justified n≤229 carve without a **new** PIT-safe predicate (not a post-hoc subset of cited_mss / cc=1).

**Post-lock (2026-08-16):** Adam locked feature-gap SoT — FORCE_WAIT suppresses some GOOD stamps, but current features cannot safely pick which WAITs to release. Selective unlock **PARKED**; see [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md).

Gaps closed earlier: **1** (confound table) and **2** (Gate-10 projection). No ALS, no registry, no VAL, no HOLDOUT, no trading-code changes.

---

## Evidence summary (prior + this pass)

### cited_mss rates (shadow-ACT FORCE_WAIT pool)

| Slice | n | goodRate | badRate | nBad |
|-------|--:|---------:|--------:|-----:|
| Pool | 1074 | 57.0% | 34.0% | 365 |
| **cited_mss=true** | **441** | **80.7%** | **17.5%** | **77** |
| cited_mss=false | 633 | 40.4% | 45.5% | 288 |

`cited_mss` derived as `citedConcepts` includes `"mss"` (matches dump univariate).

### §2 clearance (unchanged pointer)

Panel∩stamps n=104; cited_mss=true n=47 — failure #4 (brief-delay clears anyway) **does not fire** (HARMFUL_SUPPRESSION 61.7%; ≤15m clear 6.4%). Still fails ship bar (mixes BAD; USEFUL_SUPPRESSION / HARMFUL_DELAY residual). Full-1074 denser clearance still **NOT MEASURED**.

---

## Gap 1 — confound table: `cited_mss` × `contradictionCount`

**Pool:** shadow-ACT FORCE_WAIT only (n=1074).  
**Fields:** `featuresAtT.citedConcepts∋mss` × `featuresAtT.contradictionCount` (values observed: 0, 1, 2).

### Joint cells

| cited_mss | contradictionCount | n | goodRate | badRate | nBad |
|----------:|--------------------:|--:|---------:|--------:|-----:|
| true | 1 | 422 | 80.1% | 18.0% | 76 |
| true | 2 | 19 | 94.7% | 5.3% | 1 |
| true | 0 | 0 | — | — | — |
| false | 0 | 620 | 40.5% | 45.3% | 281 |
| false | 1 | 13 | 38.5% | 53.8% | 7 |
| false | 2 | 0 | — | — | — |

**Marginals for reference**

| Slice | n | goodRate | badRate | nBad |
|-------|--:|---------:|--------:|-----:|
| contradictionCount=1 | 435 | 78.9% | 19.1% | 83 |
| contradictionCount≠1 | 639 | 42.1% | 44.1% | 282 |

### Partial lift: `cited_mss | contradictionCount=1` vs `cited_mss | contradictionCount≠1`

| Condition | n | goodRate | badRate | nBad |
|-----------|--:|---------:|--------:|-----:|
| cited_mss ∧ cc=1 | 422 | 80.1% | 18.0% | 76 |
| cited_mss ∧ cc≠1 | 19 | 94.7% | 5.3% | 1 |
| ¬cited_mss ∧ cc=1 | 13 | 38.5% | 53.8% | 7 |

Almost all cited_mss mass sits inside cc=1 (422/441 = **95.7%**). The residual cited_mss∧cc≠1 cell is **n=19 only** — too thin to claim independent MSS-citation lift. Symmetrically, cc=1 without cited_mss is **n=13**.

### Collinearity verdict

| Metric | Value |
|--------|------:|
| Agreement (both true or both false for {cited_mss, cc=1}) | 1042/1074 = **97.0%** |
| Jaccard (intersection / union of the two positives) | 422/(422+19+13) = **0.930** |
| φ (phi) | **0.938** |
| P(cc=1 \| cited_mss) | **95.7%** |
| P(cited_mss \| cc=1) | **97.0%** |

**CONFOUND_COLLINEAR: YES** — `cited_mss` is nearly collinear with `contradictionCount===1` on this pool. Univariate “MSS cite” uplift is not cleanly separable from the one-contradiction bin; do not treat cited_mss as an independent quality discriminator.

---

## Gap 2 — Gate-10 projection if unlock all cited_mss=true

### Assumptions (explicit)

| Assumption | Value |
|------------|--------|
| **Denominator (Y)** | Paired DEV asOf universe **Y=1500** (archive-carve-v1, `fromYmd=2023-10-02`→`toYmd=2025-05-31`, cadence 10m, `limitTotal=1500`) — same universe as Gate 10 sparse bound in `karen-dev-to-validation-protocol.md` |
| **Baseline actionable (Z₀)** | **CURRENT_ACTIONABLE N=71** (dual-audit / next-single-change SoT; protocol also cites ~4.7% = 71/1500). Bottleneck note uses N=73 for the 1147 c1 tally — projection below uses **71** as requested; swapping to 73 changes rate by &lt;0.2pp |
| **Unlock add** | All FORCE_WAIT shadow-ACT stamps with **cited_mss=true**, **n=441** (additive: these are baseline WAIT / FORCE_WAIT, not already in CURRENT_ACTIONABLE) |
| **Projected Z** | Z₀ + 441 = **71 + 441 = 512** |
| **Gate-10 promote cap** | Sparse actionable rate Z/Y must stay in **[2%, 20%]** on Y=1500 → cap **≤300** actionables (~20%) |
| **Not assumed** | No quality filter beyond cited_mss; no overlap subtraction; no session/day reweight; not a scored run |

### Numbers

| Scenario | Z (actionable) | ACT rate Z/Y | vs 20% cap |
|----------|---------------:|-------------:|------------|
| Baseline (none) | 71 | **4.7%** | inside |
| Binary c1 (reference) | ~1147 (≈71+1074) | **~76.5%** | FAIL (known) |
| **Unlock all cited_mss=true** | **512** | **512/1500 = 34.1%** | **FAIL** (≃1.7× the 20% cap) |
| Max unlock to stay ≤20% | ≤300−71 = **229** | 20.0% | at cap |
| cited_mss unlock vs that budget | 441 − 229 = **+212 over** | — | too large |

**GATE10_PROJECTED_ACT:** **34.1%** (512/1500) under unlock-all-cited_mss — **fails** the ~20% Gate-10 promote cap even before quality / VAL bars. A shippable unlock under this denominator would need **n≤229** (≪441), and that still ignores residual BAD mix + collinearity.

---

## Closed as c4 seed (DEFINE_BLOCK)

Do **not** score, register, or implement `h_c4_fw_unlock_cited_mss`. Do **not** carve n≤229 from cited_mss/cc=1 post-hoc without a new PIT-safe feature story. Alternate one-knob screen on the same pool: [`karen-c4-alt-discriminator-scan.md`](./karen-c4-alt-discriminator-scan.md) → **BEST_ALT = NONE_JUSTIFIED**.

---

## Remaining gaps (historical; seed closed)

1. **BAD mix** — cited_mss=true still 77 BAD (17.5%) + 8 NEUTRAL; not a protect/harmful isolator.  
2. **Independence / alternative cut** — after YES collinearity, any future H needs a PIT-safe predicate that is *not* a near-rename of contradictionCount=1. Alt scan found no justified replacement.  
3. **Size vs Gate-10** — full cited_mss unlock overshoots 20%; no pre-declared subset with unlock n≤229 exists.  
4. **Full-1074 denser clearance** — still NOT MEASURED (panel slice only).  
5. **Shadow ≠ DecisionEnvelope** — DEV labels are post-freeze analysis; binary c1 already misled vs VAL.  
6. **Define / score path** — `C4_SINGLE_CHANGE` stays NOT_DEFINED; no ALS / registry / VAL authorized.

---

## NEXT_SINGLE_ACTION

**DEFINE_BLOCK stands.** Selective unlock **PARKED**. STOP_CONDITION **YES** → instrument **contradiction type (not count)** only ([`karen-force-wait-contradiction-semantics.md`](./karen-force-wait-contradiction-semantics.md)). No unlock/score/VAL.

---

## Governance

- Do **not** register ALS score run  
- Do **not** implement production / experiment path  
- Do **not** VAL / HOLDOUT  
- Do **not** resurrect binary c1  
- **ADAM_DECISION:** DEFINE_BLOCK · **C4_SINGLE_CHANGE:** NOT_DEFINED · **CLEAR_PIT_SAFE_DISCRIMINATOR:** NO · **EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED
