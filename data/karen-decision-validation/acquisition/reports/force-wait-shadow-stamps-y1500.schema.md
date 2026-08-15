# FORCE_WAIT shadow stamp dump — schema (DEV Y=1500)

**KIND:** `force_wait_shadow_stamps_y1500`  
**BASELINE:** baseline-v2  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** not touched  
**C4_DEFINED:** NO · **C4_SINGLE_CHANGE:** NOT_DEFINED

## Purpose

PIT-safe stamp table for discriminator search: baseline FORCE_WAIT / WAIT→ACT-under-c1 states with features at *t* and c1 shadow side/outcomes scored **after** freeze.

## Files

| File | Content |
|------|---------|
| `force-wait-shadow-stamps-y1500-latest.json` | Full report + stamps[] |
| `force-wait-shadow-stamps-y1500-latest.jsonl` | One stamp JSON per line |
| `force-wait-shadow-stamps-y1500-*.json` | Timestamped snapshot |

## Stamp fields

- `asOf` — evaluation timestamp
- `population` — `FORCE_WAIT` | `WAIT_TO_ACT_NON_FORCE` | `FORCE_WAIT_STAY_WAIT`
- `baselineForceWaitPrimary` — taxonomy primary (one-sided support + WAIT)
- `featuresAtT` — evidence + reasoningStructure + PD geometry; **no** post-t labels
- `c1Shadow.side` / `outcomeLabel` — shadow under `c1_wait_entry_actionable` after freeze

### Outcome label rule (analysis only)

1. GOOD if `targetBeforeInvalidation`
2. BAD if `invalidationBeforeTarget`
3. else GOOD if `proxyR >= 0.25`; BAD if `proxyR <= -0.25`
4. else NEUTRAL

**Forbidden:** using outcomeLabel / proxyR / MFE/MAE as live gate features.

## Non-goals

- Not a scored experiment registry row
- Not a c4 predicate
- Does not resurrect/promote c1
