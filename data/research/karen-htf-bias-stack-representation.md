# Karen HTF bias stack representation (`htf_bias_repr_v0`)

**DATE:** 2026-08-16  
**SCOPE:** Representation only — stamp Daily / 15m / 5m leans + alignment into `featuresAtT`.  
**EDGE_CLAIM:** NONE · **OUTCOMES:** NO · **UNLOCK:** PARKED · **VAL / HOLDOUT:** not touched  

---

## Why

`obs.htf_bias` already carries `{daily, m15, m5, aligned, tradeable_bias}`. Collapsing to `tradeableBias` alone loses invertibility for HTF misalignment (same class as HTF_BIAS_MISALIGNED).

## Stamp surface

| Field | Source |
|-------|--------|
| `htfBiasDaily` | `obs.htf_bias.daily` |
| `htfBiasM15` | `obs.htf_bias.m15` |
| `htfBiasM5` | `obs.htf_bias.m5` |
| `htfAligned` | `obs.htf_bias.aligned` (`true` / `false` / `"unknown"`) |
| `htfBias` | nested `{daily,m15,m5,aligned}` when all present |
| `htfBiasRepresentationVersion` | `htf_bias_repr_v0` |
| `tradeableBias` | **unchanged** (back-compat) |

Helpers: `lib/htf-bias-stamp-features.ts`  
Enrich: `scripts/karen-dv-enrich-liquidity-stamps-v1.ts` (joint with `liquidity_repr_v1`)

## Coverage (outcome-blind smoke)

On n=12 FORCE_WAIT stamps (PIT obs rebuild):

| Metric | Value |
|--------|------:|
| Stamps with full stack (daily+m15+m5+aligned) | 12 / 12 (100%) |

Residuals (not this version): `conflictPairs[]`, `alignedCount`, `dominantBias` — see info-loss v2 N12.

## Status

**PASS** — stack stamped; `tradeableBias` retained; smoke coverage 100%.  
Full Y=1500 dump enrich is progressive (RAM-capped batch merge); representation gate does not require overnight restamp.

OUTCOMES_TOUCHED: **NO**  
UNLOCK: **PARKED**
