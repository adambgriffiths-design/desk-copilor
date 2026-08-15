# Protocol decision — `c1_wait_entry_actionable` (Y=1500 + VAL) — FINAL

**TIME:** 2026-08-15T21:45:00Z  
**FINALIZED:** 2026-08-15T21:55:00Z (A/B vs VAL reconcile)  
**TREE:** `.tmp/karen-final-integration/`  
**BASELINE_FROZEN_ID:** `baseline-v2` (v3/v4 not promoted)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** PROTECTED / SEALED  
**Production ALS default:** `none` (unchanged)  
**VAL re-run:** FORBIDDEN

**Artifacts:**
- `data/research/karen-dev-overcaution-candidates.md` (full Y=1500, `smoke:false`)
- `…/nq-history-archive-dev-overcaution-candidates-latest.json`
- Registry: `exp-c1-wait-entry-actionable-dev-y1500-2026-08-15` (`decision=reject`)
- Semantic freeze: `karen-semantic-baseline-freeze.md` (+ supervisor append H)
- Superseded next-candidate pointer: `karen-next-single-change-dev-candidate.md` → **`c4_shadow_quality_gated_wait`**

---

## Supersession

1. Prior smoke-only outcome (**RESEARCH_MORE**, Y=48 incomplete package) is **superseded**.  
2. Prior A/B ONE_NEXT recommending binary `c1_wait_entry_actionable` as implement-next is **superseded** — binary c1 is **not** the next implementation step.  
3. Authoritative package: paired DEV **Y=1500** + one confirmatory VAL (no second VAL).

---

## Return card (protocol language) — FINAL

| Field | Value |
|---|---|
| **DECISION** | **REJECT** promote binary `c1_wait_entry_actionable` · **RESEARCH_MORE** only for refined successor **`c4_shadow_quality_gated_wait`** (DEV only; not a binary WAIT-gate flip) |
| READY_FOR_ADAM | **N** (do not promote / do not ship / do not implement binary c1) |
| DEV (Y=1500) | Strong structural + quality lift vs frozen paired baseline (T-before / proxyR) |
| Gate 10 (DEV) | **FAIL** — actionable rate ~**76%** ≫ 20% promote cap |
| VAL | One-shot ran · structural lift · mean proxyR **−0.561 → −1.053** (**FAIL** quality / non-degradation bar) → **back to DEV**; **no second VAL**; no retune from VAL residuals |
| EDGE_CLAIM | **NONE** |
| PIT | **0** |
| Package | **Complete** Y=1500 paired |

Per [`karen-dev-to-validation-protocol.md`](./karen-dev-to-validation-protocol.md):

- **REJECT** (this candidate / promote path): Gate **10 FAIL** (frequency insanity) and VAL confirmatory bar fail (paired mean proxyR delta &lt; 0). Do not promote to production; do not iterate by peeking VAL again; do **not** implement binary c1 next.
- **RESEARCH_MORE** (programme): stay on DEV; next one-knob is **`c4_shadow_quality_gated_wait`** (shadow-quality + delay-vs-suppress refined gate). Binary c1 archived as failed promote.

---

## Full DEV Y=1500 (authoritative; identical asOfs vs frozen v2)

| ID | WAIT | NT | ACT | L/S | WAIT→ACT | T-before | mean proxyR |
|----|-----:|---:|----:|----:|---------:|---------:|------------:|
| none | 1188 | 239 | 73 | 41/32 | — | 21.4% | −0.330 |
| **c1** | 114 | 239 | **1147** | 560/587 | **1074** | **58.1%** | **0.314** |
| c2_min_reasons_1 | 1404 | 50 | 46 | 25/21 | 0 | 30.4% | −0.303 (worse — ACT down) |
| c3_widen_entry_band | 1188 | 239 | 73 | 41/32 | 0 | 21.4% | −0.330 (null = same as none) |

## Gate highlights

| Gate | Result | Evidence |
|-----:|:------:|----------|
| 1 Sample | **PASS** | Y=1500 |
| 3 PIT | **PASS** | 0 |
| 6 T-before (DEV) | **PASS** | 21.4% → 58.1% |
| 8 proxyR (DEV) | **PASS** | −0.330 → 0.314 |
| 9 WAIT share | **spam risk** | 7.6% WAIT / ~76.5% ACT |
| 10 Frequency | **FAIL** | ACT rate ~**76%** ≫ 20% promote cap |
| VAL proxyR | **FAIL** | −0.561 → −1.053 |

**Aggregate:** Binary c1 **REJECT** for promote (Gate 10 + VAL proxyR quality fail). Refined successor **`c4_shadow_quality_gated_wait`** may continue on DEV only — **READY_FOR_ADAM: N**. Do **not** implement binary c1 next.

## EDGE_CLAIM

NONE

## HOLDOUT

PROTECTED / SEALED — not accessed
