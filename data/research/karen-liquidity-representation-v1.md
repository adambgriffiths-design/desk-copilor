# KAREN — liquidity representation v1 (timing / provenance)

**DATE:** 2026-08-16  
**STATUS:** INSTRUMENTED · freq probe PASS (n=12) · full dump enrich PENDING → priority #1 **PARTIAL**  
**version id:** `liquidity_repr_v1`  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**SELECTIVE_UNLOCK:** PARKED · **C4_SINGLE_CHANGE:** NOT_DEFINED  
**ALS / score / unlock / trading behavior:** none  
**OUTCOMES:** NO  

---

## Framing (locked)

- `liquidity_repr_v0` already defines structured level rows (`label` / `price` / `side` / `taken` / `status` / `source` / `why` [+ `id`]). **Side is not the gap.**
- `liquidity_repr_v1` = **v0 levels + sweep timing / provenance fields** (second-order richness).
- Priorities **#2** (broader pools) and **#3** (interaction sequence history) are **NOT_STARTED** until #1 stamp + outcome-blind freq PASS.

Inventory SoT: [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md)

---

## Field schema (`featuresAtT`)

### Back-compat

| Field | Notes |
|-------|-------|
| `sweepPresent` | Retained; lossy bool — must not be treated as SoT |
| `liquidityLevelCount` / `liquidityTakenCount` | Derived counts |

### Level row (`liquidityLevels[]`) — full array

**v0 core (unchanged meaning):**

| Field | Type | Notes |
|-------|------|-------|
| `label` | string | Required |
| `price` | number | Required |
| `taken` | `boolean \| "unknown"` | Required |
| `side` | `buy_side \| sell_side` | When present on obs |
| `status` | NamedLevelStatus | Engine vocabulary only |
| `source` | string | When present |
| `why` | string | When present |
| `id` | string | When present |

**v1 timing / provenance (additive):**

| Field | Type | Notes |
|-------|------|-------|
| `formedAt` | number (ms) | Level formation time when known |
| `qualifyingTickAt` | number (ms) | **PIT sweep / interaction time** |
| `qualifyingTickPrice` | number | Qualifying tick price |
| `candleId` | string | Qualifying candle id |

```ts
liquidityRepresentationVersion: "liquidity_repr_v1"
```

Provenance: same PIT fields already on `obs.liquidity.levels[]` (`buildLiquidityLevels`) — no invented vocabulary.

---

## Freeze / change rule

Do not silently mutate v1 after outcome inspection. Broader pools (#2) or status-history (#3) require `liquidity_repr_v2+` and a fresh predeclare.

---

## Implementation pointers

| Path | Role |
|------|------|
| `lib/liquidity-stamp-features.ts` | `stampLiquidityFeaturesFromObs` / `FromEvidence` |
| `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts` | Native `featuresAtT` emit |
| `scripts/karen-dv-enrich-liquidity-stamps-v1.ts` | PIT enrich of existing Y=1500 dump |
| DV `EvidenceAtT.liquidityLevels` | Future full regenerate parity |

---

## Governance

EDGE_CLAIM **NONE** · HOLDOUT **SEALED** · VAL **DO NOT TOUCH** · unlock **PARKED** · outcomes **NO**
