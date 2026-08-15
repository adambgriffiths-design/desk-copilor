# Trading-brain Baseline integrity â FROZEN v2 vs CANDIDATE v4

**Phase:** trading-brain-correctness
**FIX:** Empty-session HL refuse only
**TRUE_V2_MECHANISM:** `withTradingBrainBaseline("v2")` (frozen HEAD; still invents empty-session HL via today fallback)
**CANDIDATE_V4:** `withTradingBrainBaseline("v4")` â empty_session_hl_refuse — empty session window → unknown (no today-HL / lastPrice invent)
**FULL_REPLAY:** PASS
**Paired asOfs:** 214/214
**Baseline v2 still FROZEN:** yes
**Baseline v4 FROZEN:** no (CANDIDATE)
**Edge claimed:** false

## Verdict counts (paired identical asOfs)

| | LONG | SHORT | WAIT | NO_TRADE | ACTIONABLE | TOTAL |
|---|---:|---:|---:|---:|---:|---:|
| V2_COUNTS | 16 | 12 | 155 | 31 | 26 | 214 |
| V4_COUNTS | 16 | 12 | 155 | 31 | 26 | 214 |
| DELTAS (v4−v2) | 0 | 0 | 0 | 0 | 0 | 0 |

## Structural diff (beyond verdict)

| Metric | Count |
|---|---:|
| structureChanged | 0 |
| verdictChanged | 0 |
| structureChanged & verdict unchanged | 0 |
| same WAIT, reasoning/structure changed | 0 |
| same NO_TRADE, less/fake-confluence fields changed | 0 |

Field hit counts: {}

Structural buckets: {"SAME_VERDICT_SAME_REASONING":214,"SAME_VERDICT_CHANGED_REASONING":0,"VERDICT_CHANGED":0,"ACTIONABILITY_CHANGED":0,"QG_CHANGED":0}

## Empty-session HL fallback confounder rate

| | active | rate |
|---|---:|---:|
| v2 (frozen) | 0 | 0.0% |
| v4 (candidate) | 0 | 0.0% |

## Confounder tag rates (active / paired)

| Id | v2 active | v2 rate | v4 active | v4 rate |
|---|---:|---:|---:|---:|
| bias_as_structure_fallback | 0 | 0.0% | 0 | 0.0% |
| undirected_displacement | 0 | 0.0% | 0 | 0.0% |
| sweeps_dual_credit | 0 | 0.0% | 0 | 0.0% |
| est_yahoo_daily_ne_cme_session | 214 | 100.0% | 214 | 100.0% |
| empty_session_hl_fallback | 0 | 0.0% | 0 | 0.0% |
| order_block_stub | 214 | 100.0% | 214 | 100.0% |
| dual_reh_algorithms | 214 | 100.0% | 214 | 100.0% |

## Outcome metrics (recorded; EDGE_CLAIM NONE)

| Metric | v2 | v4 |
|---|---:|---:|
| MEDIAN_MFE | 18 | 18 |
| MEDIAN_MAE | 41.5 | 41.5 |
| TARGET_BEFORE_INVALIDATION_RATE | 0.1875 | 0.1875 |

## Prior / related candidates

- baseline-v3 (separate): pd_refuse_last_price_invent — already measured; not stacked here
- **baseline-v4** (this candidate): empty_session_hl_fallback refuse

**Note:** Confounder auto-detect for empty_session_hl_fallback may remain inactive without session HL provenance flags — structural deltas still measure the refuse path.

**BASELINE_V4_CANDIDATE**
**EDGE CLAIM: NONE**
