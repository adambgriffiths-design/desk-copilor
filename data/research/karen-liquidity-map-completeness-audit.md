# KAREN — liquidity map completeness audit

**Date:** 2026-08-16  
**Scope:** Decision-time liquidity identity coverage only. Representation / funnel map.  
**OUTCOMES:** NO  
**Trading / unlock / VAL / HOLDOUT:** untouched  

Related SoT: [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md) · [`karen-liquidity-representation-v1.md`](./karen-liquidity-representation-v1.md)

---

## Verdict

Karen **computes** a wide liquidity map at decision time (named levels, session H/L, ORG, gaps, REH/REL, research EQH/EQL).  
Only a **narrow named-level subset** reaches `obs.liquidity.levels[]`, and **that same subset** is what `liquidity_repr_v0/v1` stamps into `featuresAtT`.  

BSL/SSL are **sides**, not separate pool ids. Broader pools (NY-pre, ORG, NDOG/NWOG, REH/REL, EQH/EQL, NY-PM) are known upstream but **disappear** before the stamp surface (except where chat facts / drawings expose them outside `featuresAtT`).

---

## Funnel (code path)

```
MarketContext (levels.ts / pd-arrays / sessions / org / nwog)
  ├─ liquidityLevelsFromContext  → structureFacts candidates + interactions/sweeps
  ├─ structureFacts.relativeEqualPools (structure.ts)
  ├─ obs.reh_rel (reh-rel.ts via observation-engine)
  ├─ EqhEqlLiquidity → StructureStateBundle.liquidity (incremental engine; research)
  └─ buildLiquidityLevels (observation-engine) → obs.liquidity.levels[]  ← NARROW
        └─ stampLiquidityFeaturesFromObs (liquidity-stamp-features.ts)
              → featuresAtT.liquidityLevels[] + counts + liquidity_repr_v1
```

| Layer | Role |
|-------|------|
| `computeHtfPdArrays` (`lib/pd-arrays.ts`) | PDH/PDL/PDC/PDO/CDO/CDEQ/PDEQ + NDOG/NWOG ± daily FVG mids |
| `liquidityLevelsFromContext` (`lib/levels.ts`) | PD levels + Asia/London/**NY-pre**/NY-RTH + ORG top/bottom/CE |
| `buildStructureFacts` (`lib/structure.ts`) | Interactions + sweeps on sweepable ids; `relativeEqualPools` |
| `buildLiquidityLevels` (`lib/observation-engine.ts`) | **Only** PDH/PDL/PDC + Asia/London/NY-RTH |
| `detectRehRel` (`lib/reh-rel.ts`) | `obs.reh_rel` (not copied into `liquidity.levels`) |
| `detectEqhEqlLiquidity` (`lib/research/eqh-eql-liquidity.ts`) | Research pools → `StructureStateBundle.liquidity` |
| `stampLiquidityFeaturesFromObs` | Mirrors `obs.liquidity.levels` → `featuresAtT` |

---

## Coverage table

Legend for **featuresAtT**:
- **YES** — row lands in `featuresAtT.liquidityLevels[]` when stamped (`liquidity_repr_v0/v1`)
- **NO** — known at decision time but absent from stamped liquidity levels
- **SIDE** — not a level id; encoded as `side: buy_side|sell_side` (BSL/SSL)

| Kind | Engine id(s) / type | Where Karen knows it | In `obs.liquidity.levels`? | Reaches `featuresAtT`? | Notes |
|------|---------------------|----------------------|----------------------------|------------------------|-------|
| **BSL** | (side) `buy_side` | sweeps / level `side` / `session-liquidity.ts` | as side on highs | **SIDE** (when parent level stamped) | Not a pool id |
| **SSL** | (side) `sell_side` | same | as side on lows | **SIDE** (when parent level stamped) | Not a pool id |
| **PDH** | `pdh` | `htfPdArrays` + structure + obs | **YES** | **YES** | `buy_side` |
| **PDL** | `pdl` | same | **YES** | **YES** | `sell_side` |
| **PDC** | `pdc` | same | **YES** | **YES** | Reference close; not sweepable PD raid |
| PDO / CDO / PDEQ / CDEQ | `pdo`,`cdo`,`pdeq`,`cdeq` | `htfPdArrays.levels` → structure candidates | **NO** | **NO** | Reference / equilibrium — not obs liquidity rows |
| Daily FVG mid | `d_fvg_*` | `htfPdArrays.levels` | **NO** | **NO** | Explicitly non-sweepable (`isSweepableLiquidityId`) |
| **Asia H/L** | `asia_high` / `asia_low` | sessions + structure + obs | **YES** | **YES** | |
| **London H/L** | `london_high` / `london_low` | same | **YES** | **YES** | |
| **NY RTH H/L** | `ny_rth_high` / `ny_rth_low` | same | **YES** | **YES** | |
| **NY-pre H/L** | `ny_pre_high` / `ny_pre_low` | sessions + `liquidityLevelsFromContext` + structure interactions/sweeps + chat facts | **NO** | **NO** | Dropped in `buildLiquidityLevels` |
| **NY PM H/L** | (sessions only) | `ctx.sessions.nyPm*` + chat facts | **NO** | **NO** | Not even in `liquidityLevelsFromContext` |
| **ORG** top/bottom/CE | `org_top` / `org_bottom` / `org_ce` | `ctx.org` + structure candidates + chat facts / drawings | **NO** | **NO** | In structure sweep set; absent from obs levels |
| **NDOG** | `ndog_top` / `ndog_bot` | `htfPdArrays` + structure + chat `gaps.ndog` | **NO** | **NO** | Gap band; not obs levels |
| **NWOG** | `nwog_top` / `nwog_bot` | `ctx.nwog` + structure + chat `gaps.nwog` | **NO** | **NO** | Gap band; not obs levels |
| **REH/REL (obs)** | `obs.reh_rel.*` | `detectRehRel` on observation | separate block | **NO** | Full block never stamped |
| **REH/REL (structure)** | `relativeEqualPools[]` | `structureFacts` / drawings / StructureState fallback | **NO** | **NO** | Parallel detector vs `obs.reh_rel` |
| **EQH/EQL** | research `LiquidityArea` / pools | incremental engine + `StructureStateBundle.liquidity` | **NO** | **NO** | Not on `MarketObservation` |
| Sweep events | `liquiditySweeps[]` | `structureFacts` | folded into `taken`/`status` on obs rows that exist | **lossy** | Event array not stamped; only per-level fields |
| Interaction sequence | `levelInteractions` + NamedLevelStatus | structure → obs `status` / ticks | final status only | **partial** (status + v1 ticks) | History (#3) not started |
| `sweepPresent` | bool | confounder / derived | n/a | **YES** (back-compat) | Lossy aggregate |

### Count summary

| Bucket | Count of kinds |
|--------|----------------|
| Named levels reaching `featuresAtT` | **9** rows max: PDH, PDL, PDC, Asia H/L, London H/L, NY RTH H/L |
| Known upstream, disappear before stamp | NY-pre, NY-PM, ORG×3, NDOG×2, NWOG×2, PDO/CDO/eq refs, daily FVG mids, REH/REL (both paths), EQH/EQL |
| Side vocabulary only | BSL, SSL |

---

## Disappear map (what drops where)

| Drop point | What is lost |
|------------|--------------|
| `liquidityLevelsFromContext` omits NY-PM | NY PM H/L never enter structure interactions/sweeps |
| `buildLiquidityLevels` allow-list | NY-pre, ORG, NDOG/NWOG, PDO/CDO/eq, any non-listed structure candidate — **never** become `obs.liquidity.levels` |
| Observation schema | EQH/EQL research pools not attached to `MarketObservation` |
| Stamp (`liquidity_repr_v*`) | Copies **only** `obs.liquidity.levels` — so `reh_rel`, gaps, ORG, NY-pre, EQH/EQL stay out of `featuresAtT` even when chat/drawings know them |
| Collapse into bool | Historical path / confounders still carry `sweepPresent`; structured levels fix identity for the 9-row set only |

---

## UNIFIED_REPR recommendation

**Name:** `liquidity_repr_unified_v0`  
**Goal:** One PIT-safe array at asOf that can carry every liquidity object Karen already computes, without inventing new detectors or touching outcomes.

### Shape

```ts
featuresAtT.liquidityPools: Array<{
  // identity
  id: string;                    // engine id when present (pdh, ny_pre_high, org_top, …)
  kind:
    | "named_level"              // PD / session H/L / ORG edge / gap edge / reference
    | "relative_equal"           // REH/REL (prefer obs.reh_rel; note source)
    | "equal_area"               // EQH/EQL LiquidityArea
    | "gap_band";                // NDOG/NWOG/ORG as band (optional dual: edges + band)
  label: string;
  side?: "buy_side" | "sell_side"; // BSL/SSL — always this vocabulary

  // geometry (point XOR band)
  price?: number;                // named / relative point
  priceLow?: number;
  priceHigh?: number;
  representativeLevel?: number;  // equal_area

  // state (engine vocabulary only)
  taken?: boolean | "unknown";
  status?: string;               // NamedLevelStatus | area status | reh status
  source?: string;               // cme_session_1m | session_1m | research_eqh | …
  detector?: "obs_levels" | "structure_candidates" | "reh_rel" | "relativeEqualPools" | "eqh_eql";

  // provenance (reuse liquidity_repr_v1 fields)
  formedAt?: number;
  qualifyingTickAt?: number;
  qualifyingTickPrice?: number;
  candleId?: string;
  why?: string;
  sweptAt?: number;              // equal_area when present
}>;

featuresAtT.liquidityPoolCount: number;
featuresAtT.liquidityTakenCount: number;   // taken === true only
featuresAtT.liquidityRepresentationVersion: "liquidity_repr_unified_v0";
featuresAtT.sweepPresent: boolean | null;  // retain back-compat
```

### Population rules (PIT-safe)

1. **Seed from** `obs.liquidity.levels` (current 9-row set) → `kind: "named_level"`.
2. **Add missing named candidates** present on context at asOf with interaction/sweep state from `structureFacts` when available: `ny_pre_*`, `org_*`, `ndog_*`, `nwog_*`, optionally `ny_pm_*` (compute interactions first if promoting NY-PM into structure candidates).
3. **Add** `obs.reh_rel.all_levels` (or nearest + active arrays) → `kind: "relative_equal"`, `detector: "reh_rel"`.
4. **Add** research EQH/EQL `areas` / displayed pools when the incremental snapshot is available at asOf → `kind: "equal_area"`, `detector: "eqh_eql"` (omit if engine not initialized — do not invent).
5. **Do not** merge REH detectors into one silent id: if both `reh_rel` and `relativeEqualPools` exist, stamp both with distinct `detector` (dedupe later is a separate research decision).
6. **Gap bands:** stamp edges as `named_level` **or** one `gap_band` row with `priceLow`/`priceHigh` — pick one convention and freeze it; prefer edges for parity with structure ids + optional band row for chat/facts.

### Compatibility

- Extends `liquidity_repr_v1` timing fields; does not remove `liquidityLevels` until a migrate window.
- Prefer alias: either keep `liquidityLevels` as the `named_level` subset, or rename once and bump version.
- Aligns with locked priority order: finish v1 timing freq **PASS** before implementing unified pool identity (priority #2 in handoff).

### Why this unified shape

- One stamp schema for all kinds already in code.
- Preserves BSL/SSL as `side` (no fake BSL/SSL pool ids).
- PIT: only objects computable from bars ≤ asOf and existing engine outputs.
- Outcome-blind: representation + frequency only.

---

## OUTCOMES

**OUTCOMES: NO**

---

## Source anchors

| File | Relevance |
|------|-----------|
| `lib/observation-engine.ts` `buildLiquidityLevels` | Obs allow-list (9 ids) |
| `lib/levels.ts` `liquidityLevelsFromContext` | Structure candidate set (+ NY-pre, ORG; − NY-PM) |
| `lib/pd-arrays.ts` `computeHtfPdArrays` | PD + NDOG/NWOG + refs |
| `lib/structure.ts` | Sweeps, interactions, relativeEqualPools, sweepable ids |
| `lib/reh-rel.ts` / `obs.reh_rel` | Observation REH/REL |
| `lib/research/eqh-eql-liquidity.ts` / `lib/structure-state.ts` | EQH/EQL → LiquidityPoolState |
| `lib/liquidity-stamp-features.ts` | featuresAtT mirror of obs levels only |
| `lib/session-liquidity.ts` | BSL/SSL side semantics |
| `lib/observation-facts.ts` | Chat facts for gaps/sessions (incl. NY-pre/PM) outside stamp |
