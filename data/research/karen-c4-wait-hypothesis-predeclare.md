# KAREN — c4 WAIT hypothesis pre-declare (research text only)

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/` (mirrored to repo `data/research/`)  
**MODE:** research documentation only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**ALS / registry / production:** none — do **not** score, register, or implement

**Source dump:** `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json` (N=1075 stamps; shadow-ACT pool n=1074)

---

## Verdict

| Field | Value |
|-------|--------|
| **PREDECLARE** | **ONE** — `h_c4_fw_unlock_cited_mss` |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** (unchanged) |
| **C4_DEFINED** | **NO** |
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** (unchanged — pre-declare ≠ clean cut) |
| **DECISION** | **RESEARCH_MORE** |
| **NONE_JUSTIFIED** | no — one unlock hypothesis meets effect-size + N bar for *research text*; still fails ship/score bar |

---

## Pre-declared hypothesis (at most one)

### hypothesis_id

`h_c4_fw_unlock_cited_mss`

### predicate (features at *t* only)

Among baseline **FORCE_WAIT** stamps (one-sided support + `entryStatus===WAIT` that would flip under binary c1):

```
featuresAtT.cited_mss === true
```

- PIT-safe: reasoningStructure / evidence citation frozen at asOf.
- No outcome labels, proxyR, MFE/MAE, delay, or post-t clearance in the predicate.
- Complementary mass (`cited_mss===false`, n=633) stays WAIT under this hypothesis — not a second knob.

### intent

**Unlock** — selectively allow directional delivery (c1-like shadow side) **only** when MSS is cited at *t*; otherwise keep FORCE_WAIT.

Not a keep-WAIT-primary rule. (Structure-unclear keep-WAIT was considered and **not** chosen: n=93, mostly NEUTRAL, badRate *below* pool — weak “protect vs harmful” framing.)

### expected effect (DEV shadow, descriptive — not a scored claim)

| Slice | n | goodRate | badRate | notes |
|-------|--:|---------:|--------:|-------|
| Shadow-ACT pool | 1074 | 57.0% | 34.0% | dump univariate pool |
| **cited_mss=true** | **441** | **80.7%** | **17.5%** | Δgood **+23.7pp** vs pool |
| cited_mss=false | 633 | 40.4% | 45.5% | left waiting under this H |

**Expected if ever scored later (not authorized now):** unlock count ≪ c1’s 1074 (order ~441 same-stamp candidates on this carve); DEV goodRate / badRate on the unlocked subset should resemble the table above; ACT rate must stay under Gate-10 spam bar unlike binary c1.

### failure condition

Hypothesis fails as a *future* c4 seed if any of:

1. Unlocked subset still mixes too much BAD for quality gates (already **77 BAD / 17.5%** on DEV shadow — red flag).
2. Mean proxyR / T-before on unlocked subset does not beat paired baseline ACT, or collapses on any later confirmatory split (c1 VAL pattern).
3. `cited_mss` is confounded (e.g. nearly collinear with `contradictionCount=1` / mssPresent) such that the lift is not interpretable as MSS-citation quality.
4. Dense FORCE_WAIT→ACTIVE delay bins show the “good” cited_mss mass is mostly brief-delay that would clear without unlock — unlock then adds little vs waiting.
5. Any PIT>0 or outcome leakage into the live predicate.

### Clearance implications (§2, 2026-08-15) — for this H only

Source: [`karen-force-wait-clearance-bins.md`](./karen-force-wait-clearance-bins.md) (panel∩stamps n=104; cited_mss=true n=47).

| Check | Result |
|-------|--------|
| Failure #4 (brief-delay would clear anyway) | **Does not fire** — cited_mss=true never **76.6%**; ≤15m clear **6.4%**; HARMFUL_SUPPRESSION **61.7%** |
| Unlock vs wait | Unlock would address **permanent same-direction suppression**, not steal a ~5m wait |
| Still fails ship bar | USEFUL_SUPPRESSION 7/47; HARMFUL_DELAY 7/47; cleared gated→eventual proxyR **+3.04 → −0.60**; universe slice only; still mixes BAD on shadow dump |
| Full 1074 denser clearance | Still **NOT MEASURED** (optional) |

**Implication:** clearance *strengthens* the research stake that cited_mss unlock is about harmful permanent suppress — it does **not** authorize defining/scoring c4 without Adam.

### why NOT yet a c4 single-change

| Gap | Detail |
|-----|--------|
| Mixes GOOD+BAD | cited_mss=true still **77 BAD** (17.5%) + 8 NEUTRAL — not a protect/harmful isolator |
| Univariate only | No pre-registered interaction; contradictionCount=1 uplift looks confounded — do not add it |
| Delay taxonomy | §2 **measured** on panel slice — permanent suppress dominates; does not alone clear ship bar |
| Shadow ≠ DecisionEnvelope | Labels are post-freeze analysis; DEV aggregate already misled on binary c1 vs VAL |
| Gate / promote bar | No ALS path, no registry row, no score run — `C4_SINGLE_CHANGE` stays **NOT_DEFINED** |
| Side asymmetry parked | entryModel bullish vs bearish continuation (±20pp) is a *suspect*, not this hypothesis |

**CLEAR_PIT_SAFE_DISCRIMINATOR remains NO.** Pre-declare is a research stake in the ground, not permission to score.

---

## Rejected alternatives (this turn)

| Candidate | Why not chosen as the one pre-declare |
|-----------|----------------------------------------|
| keep-WAIT when `marketStructure===unclear` / `mssPresent===false` | n=93; goodRate↓ but badRate also↓ (NEUTRAL-heavy) — weak harmful-protect story |
| unlock `entryModel===bullish structure continuation` | n=209 solid uplift, but side/model asymmetry is second-order vs MSS cite; risk of mining side |
| unlock on `contradictionCount===1` | Likely confound with MSS citation — explicitly refused as gate |
| NONE_JUSTIFIED | Effect size + n on cited_mss meet research-hypothesis bar; score/implement bar still unmet |

---

## Governance

- Do **not** register ALS score run for c4 / this hypothesis id
- Do **not** implement production / `decision-process-experiment` path
- Do **not** VAL / HOLDOUT
- Do **not** resurrect binary c1
- Do **not** brute-force thresholds on proxyR or goodRate

**Related:** [`karen-c4-shadow-quality-gated-wait.md`](./karen-c4-shadow-quality-gated-wait.md) · [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md) · [`karen-research-queue-one-bottleneck.md`](./karen-research-queue-one-bottleneck.md)

---

## NEXT_SINGLE_ACTION

Adam review whether `h_c4_fw_unlock_cited_mss` may become a registered c4 single-change given §2 clearance (permanent HARMFUL_SUPPRESSION, not brief-delay) — **no** ALS / score / VAL without explicit define.

**DECISION:** RESEARCH_MORE  
**C4_SINGLE_CHANGE:** NOT_DEFINED  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED
