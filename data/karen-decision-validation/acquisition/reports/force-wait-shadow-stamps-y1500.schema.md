# FORCE_WAIT shadow stamp dump — schema (DEV Y=1500)

**KIND:** `force_wait_shadow_stamps_y1500`  
**BASELINE:** baseline-v2  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** not touched  
**REPRESENTATION:** `contradiction_repr_v1` + `htf_bias_repr_v0` + `liquidity_repr_v1` + `liquidity_map_repr_v0` + `reasoning_repr_v0`

## Reasoning (`reasoning_repr_v0`)

`featuresAtT.reasoningChainCompact[]` — compact copy of `DecisionEnvelope.reasoningChain` at asOf:

| Field | Required |
|-------|----------|
| concept, checked, outcome, detected, usedInDecision, role | yes when chain present |
| evidenceSource | yes (copied from `evidence.source`; empty string if absent) |

`featuresAtT.conflictBetween` — `conflictResolution.between` when present; else null.

`citedConcepts` + `longReasonCount` / `shortReasonCount` retained for back-compat (PRIMARY ≈ citedConcepts).

## Liquidity (`liquidity_repr_v1`)

`featuresAtT.liquidityLevels[]` — full array from `obs.liquidity.levels` at asOf:

| Field | Required |
|-------|----------|
| label, price, taken | yes |
| side, status, source | yes when present on obs |
| formedAt, qualifyingTickAt, qualifyingTickPrice | yes when present on obs |
| id, candleId, why | yes when present on obs |

Session asia/london/ny_rth extremes carry `formedAt` from `ctx.sessions.*Time` (extreme print time).

`sweepPresent` retained for back-compat.

## HTF bias stack (`htf_bias_repr_v0`)

`htfBiasDaily`, `htfBiasM15`, `htfBiasM5`, `htfAligned`, nested `htfBias` — `tradeableBias` unchanged.
