# Karen liquidity: internal vs featuresAtT

**Date:** 2026-08-16  
**Scope:** Representation only. No outcomes. No trading / unlock / VAL / HOLDOUT.  
**EDGE_CLAIM:** NONE  

---

## LOCKED FRAMING (Adam 2026-08-16)

| Claim | Status |
|-------|--------|
| **`liquidity_repr_v0` already carries structured levels** `{label, price, side, taken, status, source, why}` (+ `id` when present) | **LOCKED** — side is **not** the remaining gap |
| Remaining work is **second-order representation**, not blindness to pools/sides | **LOCKED** |
| OUTCOMES not touched — clean research only | **LOCKED** |

### Priority order for missing details (ONLY these, in order)

1. **Sweep timing / provenance** — `formedAt`, `qualifyingTickAt`, `qualifyingTickPrice`, `candleId` → **`PASS`** (2026-08-16)
2. **Broader pool identity** — REH/REL, EQH/EQL, NY-pre, ORG, NDOG/NWOG into `featuresAtT` → **NEXT / NOT_STARTED**
3. **Interaction sequence** — tested→touched→breached→swept→closed_beyond **history**, not only final status → **NOT_STARTED**

### Version map

| Version | Contents | Status |
|---------|----------|--------|
| `liquidity_repr_v0` | Core level rows (identity + side + taken + status + source + why) | Done |
| `liquidity_repr_v1` | **v0 levels + timing/provenance fields** (priority #1) | **PASS** |

Spec: [`karen-liquidity-representation-v1.md`](./karen-liquidity-representation-v1.md)  
Timing audit: [`karen-liquidity-timing-freshness-audit.md`](./karen-liquidity-timing-freshness-audit.md)

---

## INTERNAL (what Karen knows)

### A. `structureFacts` (pre-observation)

**`liquiditySweeps[]` (`LiquiditySweep`):** `levelId`, `label`, `price`, `side`, `at`, `atTime`

**`levelInteractions[]`:** `levelId`, `status`, `why`, `atTime?`, `candleId?`, `tickPrice?`

**`relativeEqualPools[]`:** `price`, `type` (`reh`|`rel`), `startTime`, `endTime?`, `barCount`

### B. `obs.liquidity.levels[]` (`desk-schema` / `buildLiquidityLevels`)

Built for: `pdh`, `pdl`, `pdc`, `asia_high/low`, `london_high/low`, `ny_rth_high/low` only.

Per level: `id?`, `label`, `price`, `taken`, `status?`, `side?`, `source?`, **`formedAt?`** (PD + session `*Time`), `qualifyingTickAt?`, `qualifyingTickPrice?`, `candleId?`, `why?`

### C. Adjacent liquidity (same obs / engine, not in `liquidity.levels`) — priority #2 territory

- **`obs.reh_rel`:** nearest + arrays  
- **EQH/EQL research**  
- Session NY-pre / ORG / gaps not copied onto `obs.liquidity.levels`

---

## FEATURESATT (stamp surface)

### `liquidity_repr_v1` (priority #1 — **PASS**)

Same as v0 **plus** on each level row when present on obs:

- `formedAt` — PD print time **and** asia/london/ny_rth extreme print times
- `qualifyingTickAt` ← PIT interaction time
- `qualifyingTickPrice`
- `candleId`

Helpers: `lib/liquidity-stamp-features.ts`.  
Enrich: `scripts/karen-dv-enrich-liquidity-stamps-v1.ts` (`--merge --skip-enriched` for progressive dump fill on 8GB hosts).

Outcome-blind smoke (n=12): **100%** level rows with `formedAt`; session 72/72; PD 36/36.

---

## LOST vs priority

| Gap | Priority | Notes |
|-----|----------|-------|
| Timing/provenance on level rows | **#1 PASS** | Session `formedAt` wired; stamp pass-through complete |
| Broader pool ids (REH/REL, EQH/EQL, NY-pre, ORG, NDOG/NWOG) | **#2 NEXT** | |
| Interaction **sequence** history | **#3 NOT_STARTED** | Final `status` only today |

---

OUTCOMES_TOUCHED: NO  
UNLOCK: PARKED
