# KAREN — Evidence dependency representation v0

**DATE:** 2026-08-16  
**MODE:** representation / audit only  
**EDGE_CLAIM:** NONE  
**OUTCOMES_INSPECTED:** NO  
**TRADING_BEHAVIOUR_CHANGED:** NO  
**SELECTIVE_UNLOCK:** PARKED  
**C4_SINGLE_CHANGE:** NOT_DEFINED  
**VAL / HOLDOUT:** UNTOUCHED  

**Prior art:** [`karen-duplicate-evidence-audit.md`](./karen-duplicate-evidence-audit.md) · [`karen-reasoning-chain-info-loss-audit.md`](./karen-reasoning-chain-info-loss-audit.md)

**Code:** `lib/evidence-dependency-repr-v0.ts` · smoke `scripts/karen-evidence-dependency-smoke.ts` · result `karen-evidence-dependency-smoke-v0.json`

---

## VERDICT

| Field | Value |
|-------|--------|
| **DUPLICATE_EVIDENCE_CONFIRMED** | **YES** (code-proven paths + synthetic smoke) |
| **PIT_SAFE** | **PASS** — IDs from frozen observation fields only |
| **STABLE_SOURCE_IDS_JUSTIFIED** | **YES** — distinguishes shared vs separate sources without changing counts |
| **INDEPENDENT_CONFLUENCE_ENFORCED** | **NO** (unchanged — representation only) |

---

## TRACE (raw PIT → decision)

```text
bars / MarketState / MarketContext.structureFacts
  → observation-engine (Layer 1 freeze)
       evidence keys + market_structure / displacement / fvg / liquidity.levels
  → interpretation-engine (Layer 2)
       long_case.reasons[] / short_case.reasons[] / entry_model
       support ⇐ reasons.length >= 2   ← NO independence check
  → decision-envelope
       reasoningChain[] (per-concept ReasoningEvidence.source)
       citedConcepts[] (PRIMARY names)
  → research stamps
       often counts / concept names only
```

Independence is lost as soon as reasons are a **bag of strings**. Envelope `evidence.source` names a *field*, not a shared *event*.

---

## PROVEN DEPENDENCY PATHS (code only — no invention)

| Path | Proof in code | Same underlying fact? |
|------|---------------|------------------------|
| HTF bias → aliased `market_structure` → two reasons | `mapStructure` copies bias when MSS absent (`observation-engine`); interp pushes bias reason **and** structure reason even without `evidence["structure.mss_direction"]` | **YES** — `src:bias:tradeable:{lean}` |
| SSL raid + “Displacement present after sell-side sweep” | Interp only pushes displacement reason when `sslRaid && !bslRaid` | **YES** — confirmation of raid story (`dep:ssl_disp_confirm:…`) |
| MSS → structure reason + envelope `mss` | When `structure.mss_direction` present; envelope uses `structure.mss` + `mss.atTime` | **YES** for structure/MSS surfaces (`src:mss:…`) |
| Entry model conjunction | Named models re-label fields already in reasons | **YES** as `derivedFrom[]` / `dep:entry_bundle:…` (not a reason count) |

### Explicitly **not** auto-grouped (cannot prove from reason path)

| Suspected coupling | Why not proven here |
|--------------------|---------------------|
| MSS ↔ displacement ↔ FVG “same impulse” | Displacement detector returns status/points only (no candleId). FVG uses last unfilled zone prices. No shared event id on interpretation reasons. Prior audit notes correlation-by-construction; v0 leaves them **separate families** until candle anchors exist. |

---

## SMALLEST PIT-SAFE REPRESENTATION (`evidence_dependency_repr_v0`)

Additive annotation over existing reasons / entry_model. **Does not** dedupe, change `reasons.length`, or alter support gates.

```ts
EvidenceDependencyNode {
  surfaceId: string;           // stable row id (surface:side:slug)
  surface: "interpretation_reason" | "entry_model";
  side: "long" | "short" | "neutral";
  label: string;               // exact reason / entry_model text
  evidenceFamily: "htf_bias" | "mss_structure" | "displacement"
                | "fvg" | "liquidity_sweep" | "entry_model" | "unknown";
  evidenceSourceId: string | null;  // deterministic PIT source
  derivedFrom: string[];            // proven upstream source ids
  dependencyGroupId: string | null; // shared group when proven
  provenance: "deterministic" | "code_path" | "unresolved";
}
```

### Deterministic `evidenceSourceId` recipes (from frozen obs)

| Family | Recipe |
|--------|--------|
| HTF bias | `src:bias:tradeable:{tradeable_bias}` |
| MSS / true structure | `src:mss:{direction}:level:{mss_level}` |
| Bias-aliased structure | same as bias (`code_path`) |
| FVG | `src:fvg:{direction}:{bottom}:{top}` |
| Displacement | `src:disp:present:pts:{points}` (status identity only — weak event id) |
| Liquidity sweep | `src:liq:{label}:candle:{candleId}` prefer tick/price fallbacks |

### Proven `dependencyGroupId` recipes

| Group | Members |
|-------|---------|
| `dep:bias_alias:{biasSourceId}` | HTF bias reason + structure reason when aliased |
| `dep:ssl_disp_confirm:{sweepIds}` | SSL sweep reason(s) + displacement-after reason |
| `dep:mss_structure:{mssSourceId}` | Structure reason tied to MSS source |
| `dep:entry_bundle:{derivedFrom…}` | Entry model only (narrative bundle) |

Names chosen to sit beside existing `evidence_key` / `ReasoningEvidence.source` without colliding with liquidity/reasoning stamp versions.

---

## SMOKE (synthetic, outcome-blind)

Command: `npx tsx scripts/karen-evidence-dependency-smoke.ts`

| Case | Result |
|------|--------|
| `bias_alias_double_count` | **Shared** — 2 long reasons, 1 group (`HTF bias` + `Observed market structure`) |
| `ssl_raid_plus_displacement_confirm` | **Shared** — PDL taken + displacement-after |
| `mss_and_bias_independent` | **Separate** — `src:bias:…` vs `src:mss:…` |
| `ssl_and_fvg_separate_families` | **Separate** — liq candle id vs fvg band |
| `mss_disp_fvg_co_present_ungrouped` | Co-present families; disp/FVG **not** forced into one group |

Provenance on smoke reason rows: **determinedRate = 1.00** (synthetic fixtures fully keyed). Live stamps will show more `unresolved` where candle/level anchors are missing (esp. bare displacement).

`reasonCountsPreserved = true` — annotation does not change counts.

---

## WHAT THIS ENABLES LATER (not done now)

- Distinguish “2 reasons / 1 source” from “2 reasons / 2 sources” in research stamps.
- Optional future independence metric — **only after** Adam authorizes measurement work.
- Does **not** unlock WAIT, change ALS, or redefine C4.

---

## GOVERNANCE

| Field | Value |
|-------|--------|
| EDGE_CLAIM | NONE |
| OUTCOMES | NO |
| UNLOCK | PARKED |
| C4 | NOT_DEFINED |
| VAL / HOLDOUT | UNTOUCHED |
| Y=1500 regen | not required |

Related debt: `audit-area-4-independent-confluence` in [`karen-research-debt-inventory.md`](./karen-research-debt-inventory.md).
