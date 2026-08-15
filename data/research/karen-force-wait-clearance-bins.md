# KAREN — FORCE_WAIT → ACTIVE clearance bins (dense, measure-only)

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/` (mirrored to repo `data/research/`)  
**MODE:** DEV measure-only  
**BASELINE:** baseline-v2  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** not touched  
**C4_DEFINED:** NO · **C4_SINGLE_CHANGE:** NOT_DEFINED

**Script:** `scripts/karen-dv-force-wait-clearance-bins.ts`  
**Artifact:** `data/karen-decision-validation/acquisition/reports/force-wait-clearance-bins-latest.json` (+ `.jsonl`)

---

## Question

For baseline-v2 states where `ENTRY_STATUS_FORCE_WAIT` fires and a directional thesis exists (c1 shadow side LONG/SHORT), does Karen later become **actionable in the same direction**, and in which latency bin?

Bins: ≤5m / ≤15m / ≤30m / ≤60m / same session / never.

---

## Method

| Item | Choice |
|------|--------|
| Stamp universe | `force-wait-shadow-stamps-y1500-latest` population=`FORCE_WAIT` ∩ directional c1Shadow |
| Dense join | Existing 40-day opportunity-frequency panel day list @ **5m** cadence, lookback 10d, workers=2 |
| Coverage | **104 / 1074** stamps fall on panel days (39 days with ≥1 stamp) |
| Clearance | First **later same-calendar-day** baseline `actionableEntry` with `verdict ===` gated shadow side |
| Session | Same calendar trading day (dense-panel convention) |
| entryStatus field | **Not on DV records** — actionable same-side delivery is the operational proxy for WAIT→ACTIVE unlock |
| Quality labels | Same post-freeze rule as stamp dump (T-before / inv-before / proxyR ±0.25) |
| PIT | **0** |
| Wall | ~199s |

**Honest coverage:** This closes §2 for the **panel ∩ stamp** slice. Full 1074-stamp clearance histogram without denser day coverage remains **partially NOT MEASURED**.

### Delay-class rules (outcome quality when available)

| Class | Rule |
|-------|------|
| **HARMFUL_SUPPRESSION** | never clears ∧ gated GOOD |
| **USEFUL_SUPPRESSION** | never clears ∧ gated BAD |
| **USEFUL_DELAY** | clears ∧ (BAD→GOOD, or GOOD→GOOD without proxyR drop >0.25, or BAD→BAD with proxyR improve >0.25) |
| **HARMFUL_DELAY** | clears ∧ (GOOD→BAD, or GOOD→GOOD with proxyR drop >0.25, or BAD→BAD without improve) |
| **INCONCLUSIVE** | NEUTRAL on either side / unscored |

---

## Bin counts (n=104, exclusive)

| Bin | n | share |
|-----|--:|------:|
| ≤5m | 5 | 4.8% |
| 5–15m | 4 | 3.8% |
| 15–30m | 4 | 3.8% |
| 30–60m | 4 | 3.8% |
| same session (>60m) | 13 | 12.5% |
| **never** | **74** | **71.2%** |

**Cumulative clear same session:** 30/104 = **28.8%**.  
Among clearers: median latency **41.5m** (mean 82.8m) — *not* the all-WAIT dense-panel median 5m (different population + same-direction constraint).

≤15m brief clear: **9/104 (8.7%)** only.

---

## Delay / suppression classes (n=104)

| Class | n | share |
|-------|--:|------:|
| **HARMFUL_SUPPRESSION** | **47** | **45.2%** |
| USEFUL_SUPPRESSION | 21 | 20.2% |
| HARMFUL_DELAY | 15 | 14.4% |
| USEFUL_DELAY | 11 | 10.6% |
| INCONCLUSIVE | 10 | 9.6% |

**Read:** Permanent **harmful suppression** dominates brief useful delay. Same-stamp c1 flips are not “delay”; dense same-direction clearance is rare and often late.

### Quality: gated shadow t vs eventual actionable t′ (cleared, both proxyR, n=26)

| Metric | Gated (unlock@t shadow) | Eventual actionable |
|--------|------------------------:|--------------------:|
| mean proxyR | **+0.974** | **−0.650** |
| Δ (eventual − gated) | — | **−1.624** |
| med MFE / MAE | 11.5 / 15.25 | 17.5 / 12.875 |
| T-before rate | 46.2% (of all 104 gated) | 20.0% (of cleared) |

When a FORCE_WAIT stamp *does* later clear same-side, expectancy vs unlock-at-t shadow is typically **worse** — delay is not free optionality.

---

## Stratified by `cited_mss` (inform `h_c4_fw_unlock_cited_mss`)

| | cited_mss=**true** | cited_mss=**false** |
|--|-------------------:|--------------------:|
| n | 47 | 57 |
| never | **36 (76.6%)** | 38 (66.7%) |
| ≤15m clear | **3 (6.4%)** | 6 (10.5%) |
| same-session clear | 11 (23.4%) | 19 (33.3%) |
| HARMFUL_SUPPRESSION | **29 (61.7%)** | 18 (31.6%) |
| USEFUL_SUPPRESSION | 7 (14.9%) | 14 (24.6%) |
| USEFUL_DELAY | 3 (6.4%) | 8 (14.0%) |
| HARMFUL_DELAY | 7 (14.9%) | 8 (14.0%) |
| INCONCLUSIVE | 1 | 9 |
| cleared both-proxy mean gated→eventual proxyR | **+3.04 → −0.60** (Δ −3.64, n=11) | −0.54 → −0.69 (Δ −0.14, n=15) |

### Implications for pre-declare `h_c4_fw_unlock_cited_mss`

1. **Failure condition #4 does NOT fire:** the “good” cited_mss mass is **not** mostly brief-delay that would clear without unlock. Brief ≤15m = 6.4%; never = 76.6%; HARMFUL_SUPPRESSION = 61.7%. Unlock would address **permanent suppression**, not steal a 5-minute wait.
2. **Unlock still mixed:** 7/47 USEFUL_SUPPRESSION (would unlock BAD shadows) + 7 HARMFUL_DELAY among clearers — quality gate / Adam still required.
3. **Cleared cited_mss quality collapse** (gated proxyR ≫ eventual) argues *against* “just wait for ACTIVE” as a substitute for selective unlock — and *for* studying unlock quality carefully (same VAL-collapse risk class as binary c1).
4. **Does not alone define c4:** panel slice n=47; still mixes BAD; confound with contradictionCount untested; no ALS/score/Adam sign-off.

---

## Contrast vs prior all-WAIT dense latency

| Source | Population | Median latency | Never same-day |
|--------|------------|---------------:|---------------:|
| Opportunity-frequency dense panel | any WAIT → any later actionable | ~5m | ~69% |
| **This measure** | FORCE_WAIT + **same direction** | **41.5m** (clearers only) | **71.2%** |

FORCE_WAIT-keyed same-direction clearance is **stricter and slower** than generic WAIT→action stats. Do not reuse the 5m median as the FORCE_WAIT delay taxonomy.

---

## Decision

| Field | Value |
|-------|--------|
| **§2 FORCE_WAIT clearance** | **MEASURED** on panel∩stamps (n=104); full 1074 denser coverage still optional / NOT MEASURED |
| **CLEAR_PIT_SAFE_DISCRIMINATOR** | **NO** (unchanged) |
| **C4_DEFINED** | **NO** |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| **DECISION** | **RESEARCH_MORE** |
| **READY_FOR_ADAM** | optional review of H implications — **not** promote |

**NEXT_SINGLE_ACTION:** Adam review whether `h_c4_fw_unlock_cited_mss` may become a registered c4 single-change given clearance shows permanent HARMFUL_SUPPRESSION (not brief-delay) — still no ALS/score without explicit define.

---

## FINAL REPORT CARD

```
POPULATION: FORCE_WAIT ∩ directional thesis ∩ dense-panel days
N: 104 / 1074 universe (panel coverage)
BINS_EXCLUSIVE: 5m=5 15m=4 30m=4 60m=4 same_session=13 never=74
CLEAR_SAME_SESSION: 28.8%
BRIEF_LE_15M: 8.7%
DELAY_CLASS: USEFUL_DELAY=11 HARMFUL_DELAY=15 HARMFUL_SUPPRESSION=47 USEFUL_SUPPRESSION=21 INCONCLUSIVE=10
CITED_MSS_TRUE: n=47 never=76.6% HARMFUL_SUPPRESSION=61.7% brief≤15m=6.4%
QUALITY_GATED_VS_EVENTUAL: mean proxyR +0.97 → −0.65 (cleared both-proxy n=26)
PIT: 0
C4: NOT_DEFINED
DECISION: RESEARCH_MORE
EDGE_CLAIM: NONE
```
