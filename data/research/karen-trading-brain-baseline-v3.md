# Trading-brain Baseline integrity — FROZEN v2 vs CANDIDATE v3

**Phase:** trading-brain-correctness
**FIX:** PD refuse lastPrice invent only
**TRUE_V2_MECHANISM:** `withTradingBrainBaseline("v2")` (frozen HEAD; still invents PD via lastPrice)
**CANDIDATE_V3:** `withTradingBrainBaseline("v3")` — pd_refuse_last_price_invent — missing prior day → PD unknown (no lastPrice invent)
**FULL_REPLAY:** PASS
**Paired asOfs:** 214/214
**Baseline v2 still FROZEN:** yes
**Baseline v3 FROZEN:** no (CANDIDATE)
**Edge claimed:** false

## Verdict counts (paired identical asOfs)

| | LONG | SHORT | WAIT | NO_TRADE | ACTIONABLE | TOTAL |
|---|---:|---:|---:|---:|---:|---:|
| V2_COUNTS | 16 | 12 | 155 | 31 | 26 | 214 |
| V3_COUNTS | 16 | 12 | 155 | 31 | 26 | 214 |
| DELTAS (v3−v2) | 0 | 0 | 0 | 0 | 0 | 0 |

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

## PD lastPrice fallback confounder rate

| | active | rate |
|---|---:|---:|
| v2 (frozen) | 0 | 0.0% |
| v3 (candidate) | 0 | 0.0% |

## Confounder tag rates (active / paired)

| Id | v2 active | v2 rate | v3 active | v3 rate |
|---|---:|---:|---:|---:|
| bias_as_structure_fallback | 0 | 0.0% | 0 | 0.0% |
| undirected_displacement | 0 | 0.0% | 0 | 0.0% |
| sweeps_dual_credit | 0 | 0.0% | 0 | 0.0% |
| est_yahoo_daily_ne_cme_session | 214 | 100.0% | 214 | 100.0% |
| pd_level_fallback_last_price | 0 | 0.0% | 0 | 0.0% |
| empty_session_hl_fallback | 0 | 0.0% | 0 | 0.0% |
| order_block_stub | 214 | 100.0% | 214 | 100.0% |
| dual_reh_algorithms | 214 | 100.0% | 214 | 100.0% |

## Outcome metrics (recorded; EDGE_CLAIM NONE)

| Metric | v2 | v3 |
|---|---:|---:|
| MEDIAN_MFE | 18 | 18 |
| MEDIAN_MAE | 41.5 | 41.5 |
| TARGET_BEFORE_INVALIDATION_RATE | 0.1875 | 0.1875 |

## Roadmap (NOT implemented)

- **baseline-v4** (medium): empty_session_hl_fallback — Fake session levels from empty-window → today HL fallback — refuse / unknown

**BASELINE_V3_CANDIDATE**
**EDGE CLAIM: NONE**
