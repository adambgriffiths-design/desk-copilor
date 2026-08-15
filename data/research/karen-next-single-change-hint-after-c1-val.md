# Next single-change hint — after binary c1 VAL fail

**DATE:** 2026-08-15  
**TREE:** `.tmp/karen-final-integration/` (mirrored here)  
**BASELINE_FROZEN_ID:** `baseline-v2`  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED / PROTECTED  
**READY_TO_IMPLEMENT:** N  
**Production ALS:** `none` (do not flip)

**Canonical ONE_NEXT id:** `c4_shadow_quality_gated_wait`  
**SoT:** [`karen-next-single-change-dev-candidate.md`](./karen-next-single-change-dev-candidate.md)

---

## Closed candidate

Binary `c1_wait_entry_actionable` (**REJECT** for promote):

- DEV Y=1500: T-before / proxyR looked strong; Gate **10 FAIL** (~76% ACT)
- VAL: structural lift; mean proxyR **−0.561 → −1.053** (quality fail) → back to DEV; **no second VAL**
- Registry: `exp-c1-wait-entry-actionable-dev-y1500-2026-08-15` · `decision=reject`
- See `karen-dev-candidate-c1-protocol-decision.md`

Do **not** promote / implement binary WAIT-gate removal. Do **not** launch a weight sweep.

---

## ONE next DEV candidate — `c4_shadow_quality_gated_wait`

**Shadow-quality + delay-vs-suppress refined entry-wait gate (hop 2 — measure first).**

| Field | Value |
|-------|--------|
| **id** | `c4_shadow_quality_gated_wait` |
| **single_change** | Default FORCE_WAIT stays for `entryStatus==="WAIT"`; unlock directional L/S **only** when pre-declared shadow quality clears a floor **and** stamp is brief-delay class; permanent-suppress / low-quality stay WAIT; EXTENDED always waits |
| **vs binary c1** | Not “WAIT never blocks” |

Hypothesis (DEV only; shadow / paired asOfs; no production edit yet):

> Among one-sided-support stamps currently forced to WAIT by `entryStatus==="WAIT"`, classify each as **brief delay** vs **permanent session suppression**, and unlock only delay-class stamps whose **shadow quality** (paired T-before / proxyR floor) clears a pre-declared bar — keeping suppression where quality collapses.

Why this (not weighting / conflict next):

- First-broken-hop queue still ranks **WAIT / ENTRY_STATUS_FORCE_WAIT** ahead of weighting.
- Track B: BOTH_SIDES ~10% — **DEFER** conflict/weight work.
- Binary removal proved volume can rise with DEV lift that **fails VAL expectancy** — need selectivity (quality + delay vs suppress).

Out of scope: weight sweeps, minReasons retunes, c2/c3 revival, VAL re-run, holdout peek, production ALS change, binary c1 re-implement.

**READY_FOR_ADAM:** N  
**EDGE_CLAIM:** NONE  
