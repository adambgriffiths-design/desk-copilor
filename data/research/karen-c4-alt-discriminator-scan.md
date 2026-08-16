# KAREN — Alternate one-knob WAIT discriminator scan (measurement only)

**DATE:** 2026-08-16  
**MODE:** research measurement / documentation only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**ALS / score registry / production:** none — do **not** score, register, or implement  
**Source dump:** `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json`  
**Pool:** shadow-ACT FORCE_WAIT only (**n=1074**)  
**Blocked seed:** `h_c4_fw_unlock_cited_mss` — **DEFINE_BLOCK** ([`karen-c4-h-review-cited-mss.md`](./karen-c4-h-review-cited-mss.md))

---

## METHOD

1. Filter stamps to `population==="FORCE_WAIT"` ∧ `c1Shadow.actionable===true` (n=1074).  
2. Screen **PIT-safe `featuresAtT` only** — booleans, categorical equals, citedConcepts membership, reason-count equals/≥, structure↔bias agreement, confounder ids, coarse pdPosition halves/thirds (flagged as exploratory).  
3. **Excluded from predicates:** outcome labels, proxyR/MFE/MAE, `c1Shadow.waitClassBaseline` / delay class, any post-t clearance. No threshold mining on proxyR.  
4. For each binary predicate, compute: `n_true`, goodRate, badRate, nBad, φ and agreement vs `contradictionCount===1` and vs `cited_mss`, projected ACT = `(71 + n) / 1500`.  
5. **Pass constraints (all required for BEST):**  
   - Not nearly collinear with cc=1 or cited_mss: **|φ| &lt; ~0.7** and agreement **meaningfully below 97%**  
   - Unlock **n ∈ [~50, 229]** (Gate-10 budget on Y=1500 with baseline ACT≈71 → max unlock 229)  
   - badRate **clearly better than pool (~34%)** (used &lt;29% as “clearly”) and **preferably &lt; cited_mss 17.5%**  
   - goodRate lift vs pool (~57%) **meaningful** (used &gt;62%)  
   - nBad not tiny-cell noise (reject nBad&lt;5; reject nBad&lt;10 when n&lt;80)  
6. **Justification bar (beyond mechanical):** side/model asymmetry, count-threshold mining, NEUTRAL-only “protection,” or already-rejected predeclare alternatives → **not** BEST even if mechanical PASS.

**References:** pool goodRate **57.0%**, badRate **34.0%**; cited_mss n=441 / bad **17.5%** / Gate-10 proj **34.1%** (blocked).

---

## BEST_CANDIDATE

| Field | Value |
|-------|--------|
| **BEST_ALT** | **NONE_JUSTIFIED** |
| **UNLOCK_N / BAD_RATE / PHI_VS_CC1** | — (none justified) |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** (unchanged; Adam must pre-declare any future H) |

**Why none:** Mechanical size/collinearity/lift passes exist, but none beat cited_mss on badRate while staying independent, and the strongest mechanical pass (`entryModel==="bullish structure continuation"`) was already rejected in the c4 predeclare as side/model asymmetry mining (bearish twin badRate **52.7%**). Remaining mechanical passes sit at badRate **26–28%** — better than pool but not a clear quality isolator vs the blocked seed’s **17.5%**, and lack a stronger PIT feature story than count/cite tokens.

---

## Screened features (selected table)

Columns: feature · n_true · goodRate · badRate · nBad · φ vs cc=1 · agree vs cc=1 · projected ACT · mech pass/fail · fail notes.

### Blocked / reference

| feature | n | good | bad | nBad | φ_cc1 | agree_cc1 | proj ACT | mech | fail |
|---------|--:|-----:|----:|-----:|------:|----------:|---------:|------|------|
| pool (all shadow-ACT FW) | 1074 | 57.0% | 34.0% | 365 | — | — | — | — | baseline |
| `cited_mss===true` | 441 | 80.7% | 17.5% | 77 | 0.938 | 97.0% | 34.1% | FAIL | n&gt;229; collinear cc1+cms |
| `contradictionCount===1` | 435 | 78.9% | 19.1% | 83 | 1.000 | 100% | 33.7% | FAIL | n&gt;229; collinear |
| `mssPresent===true` | 981 | 59.4% | 35.9% | 352 | 0.241 | 48.8% | 70.1% | FAIL | n≫229; rates≈pool |
| `mssPresent===false` / `marketStructure==="unclear"` | 93 | 31.2% | 14.0% | 13 | −0.241 | 51.2% | 10.9% | FAIL | goodRate collapse (NEUTRAL-heavy); already rejected keep-WAIT |

### Mechanical PASS (size + not collinear + lift) — still not BEST

| feature | n | good | bad | nBad | φ_cc1 | agree_cc1 | proj ACT | mech | justification |
|---------|--:|-----:|----:|-----:|------:|----------:|---------:|---------------|
| `entryModel==="bullish structure continuation"` | 209 | 77.5% | 20.6% | 43 | 0.313 | 68.0% | 18.7% | PASS_mech | **Reject as BEST** — bad &gt; cited_mss 17.5%; side asymmetry (bearish twin bad 52.7%); predeclare already parked |
| `absReasonMargin===0` | 127 | 73.2% | 26.0% | 33 | 0.420 | 70.6% | 13.2% | PASS_mech | bad 26% only modest vs pool; tied to reason-margin geometry, not a clear quality story |
| `longReasonCount===4` | 77 | 67.5% | 27.3% | 21 | 0.021 | 58.7% | 9.9% | PASS_mech | count bin; bad 27%; mining risk without predeclared story |
| `citedConcepts∋liquidity_sweep_pdl` | 65 | 72.3% | 27.7% | 18 | 0.061 | 59.8% | 9.1% | PASS_mech | cite-token; bad 28%; PDL-side asymmetry risk vs `…_pdh` |

### Other size-ok / notable fails

| feature | n | good | bad | nBad | φ_cc1 | agree_cc1 | proj ACT | mech | fail |
|---------|--:|-----:|----:|-----:|------:|----------:|---------:|------|------|
| `entryModel==="bearish structure continuation"` | 201 | 37.3% | 52.7% | 106 | −0.304 | 44.3% | 18.1% | FAIL | bad worse than pool; side twin of bullish |
| `citedConcepts∋liquidity_sweep_pdh` | 99 | 59.6% | 28.3% | 28 | −0.014 | 57.4% | 11.3% | FAIL | goodRate lift weak |
| `longReasonCount>=4` | 86 | 65.1% | 29.1% | 25 | 0.001 | 58.0% | 10.5% | FAIL | bad not clearly &lt; pool |
| `longReasonCount===3` | 186 | 65.6% | 30.1% | 56 | 0.194 | 63.4% | 17.1% | FAIL | bad not clearly better |
| `dayOfWeekEt==="Mon"` | 204 | 60.3% | 31.4% | 64 | 0.021 | 56.7% | 18.3% | FAIL | calendar mining; weak lift |
| `dayOfWeekEt==="Tue"` / `Wed` / `Fri` | 156–228 | ~54–56% | ~33–39% | — | ~0 | — | ≤19.9% | FAIL | calendar; ≈pool |
| `sessionLabel==="NY_AM"` / `NY_PM` / `NY_LUNCH` | 85–108 | ~56–58% | ~37–39% | — | ~0 | — | ≤11.9% | FAIL | ≈pool / worse |
| `timeBucketEt==="1000-1130"` | 68 | 57.4% | 35.3% | 24 | −0.035 | 57.4% | 9.3% | FAIL | ≈pool |
| `fvgStatus!==present` | 163 | 57.1% | 36.8% | 60 | −0.027 | 55.7% | 15.6% | FAIL | ≈pool |
| `shortReasonCount===4` / `>=4` / `===0` | 83–164 | ~47–49% | ~43–45% | — | −0.2…−0.3 | — | ≤15.7% | FAIL | worse than pool |
| `marketStructure==="bullish"` | 492 | 72.6% | 24.4% | 120 | 0.600 | 80.2% | 37.5% | FAIL | n&gt;229; φ_cc1 near 0.7 |
| `marketStructure==="bearish"` | 489 | 46.2% | 47.4% | 232 | −0.465 | 28.1% | 37.3% | FAIL | n&gt;229; bad worse |
| `sweepPresent===true` | 315 | 60.0% | 31.1% | 98 | 0.068 | 57.0% | 25.7% | FAIL | n&gt;229; weak |
| `confidence` | 1074 | — | — | — | — | — | — | n/a | always `"medium"` on this pool — no discriminator |
| `sessionLabel==="LONDON"` | 0 | — | — | — | — | — | — | n/a | absent in dump |
| delay / waitClass | — | — | — | — | — | — | — | excluded | not featuresAtT / outcome-adjacent |

**pdPosition halves/thirds:** screened exploratorily; none justified as a one-knob unlock without a predeclared PD-geometry story (threshold-bin risk). Not promoted.

---

## If a future BEST were declared (not now)

No predicate draft authorized. Any future unlock H must be **Adam-pre-declared**, PIT-safe at *t*, unlock n∈[~50,229], independent of cc=1/cited_mss, and still leaves **`C4_SINGLE_CHANGE=NOT_DEFINED`** until define.

---

## NEXT_SINGLE_ACTION

**Selective unlock PARKED** ([`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md)). **BEST_ALT=NONE_JUSTIFIED** / **C4_SINGLE_CHANGE=NOT_DEFINED** stand. Audit: instrument **contradiction type (not count)** only — [`karen-force-wait-contradiction-semantics.md`](./karen-force-wait-contradiction-semantics.md). No unlock/score/VAL.

---

## Governance

- Do **not** register ALS / score  
- Do **not** implement production / trading code  
- Do **not** VAL / HOLDOUT  
- Do **not** resurrect binary c1  
- Do **not** threshold-mine proxyR or carve n≤229 from blocked seeds post-hoc  
- **BEST_ALT:** NONE_JUSTIFIED · **C4_SINGLE_CHANGE:** NOT_DEFINED · **EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED
