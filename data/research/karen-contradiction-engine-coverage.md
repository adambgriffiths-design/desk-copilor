# KAREN — contradiction engine coverage audit

**DATE:** 2026-08-16  
**MODE:** representation schema coverage (inventory)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**ALS / score / unlock / trading behavior:** none  
**OUTCOMES_INSPECTED:** NO

**Source of truth for emitables:** `lib/contradiction-report.ts` → `buildContradictionReport`  
**Stamp schema carrier:** `featuresAtT.contradictionItems[]` (`contradiction_repr_v1`) via `lib/contradiction-stamp-features.ts`

---

## Goal

Feature story recorded **EXHAUSTIVE=NO** for the *observed* FORCE_WAIT taxonomy. This audit inventories **every id the engine can emit** and verifies the stamp representation schema can carry all of them — including unobserved cells.

---

## Full emitable inventory

| id | Trigger predicate | severity | affects | polarity | Observed on Y=1500 FORCE_WAIT shadow-ACT? |
|----|-------------------|----------|---------|----------|-------------------------------------------|
| `structure_vs_bias` | `market_structure==bullish` ∧ `tradeable_bias==bearish` **or** mirror | blocking | both | `bullish_struct_bearish_bias` \| `bearish_struct_bullish_bias` | **YES** |
| `htf_misaligned` | `htf_bias.aligned === false` | warning | decision | null | **YES** |
| `data_quality` | `data_quality` ∈ {`missing`,`stale`} | blocking | decision | null | **NO** (field not on DV EvidenceAtT; stamp emits only if supplied) |
| `unknown_market_structure` | `market_structure === "unknown"` | blocking | decision | null | **NO** (not seen in dump) |
| `unknown_displacement` | `displacement === "unknown"` | blocking | decision | null | **NO** |
| `unknown_fvg_status` | `fvg.status === "unknown"` | blocking | decision | null | **NO** |
| `both_cases_supported` | `long_case.supported` ∧ `short_case.supported` | blocking | decision | null | **NO** on FORCE_WAIT primary (one-sided by definition); schema carries it |
| `interp_contradiction` | free-text interp contradiction whose description is not already covered | warning | decision | null | **NO** on current dump (0 unmapped strings); catch-all for future text |

Static constant: `CONTRADICTION_ENGINE_EMITABLE_IDS` in `lib/contradiction-stamp-features.ts` (8 ids).

---

## Schema capacity check

Each stamp item is:

```ts
{
  id: string;
  severity: "blocking" | "warning";
  affects: "long" | "short" | "both" | "decision";
  polarity: "bullish_struct_bearish_bias" | "bearish_struct_bullish_bias" | null;
  evidence_paths: string[];
  description: string;
}
```

| Requirement | Status |
|-------------|--------|
| Carry all 8 engine ids | **YES** — `id` is open string; inventory listed above |
| Multi-item / co-occurrence | **YES** — array |
| Polarity for structure_vs_bias | **YES** — derived from marketStructure × tradeableBias |
| severity / affects | **YES** |
| evidence_paths | **YES** |
| Unobserved ids without schema change | **YES** — empty cells until observed |
| Closed 3-type categorical only | **Rejected** — would drop unobserved emitables |

**COVERAGE_SCHEMA_PASS:** **YES**

---

## Reconstruction limits (DV stamps)

| Field | On DV EvidenceAtT / ReasoningStructure? | Stamp behavior |
|-------|------------------------------------------|----------------|
| marketStructure / tradeableBias | YES | Direct predicates |
| displacement / fvgStatus | YES | Direct `unknown_*` if literal `"unknown"` |
| longSupported / shortSupported | YES | `both_cases_supported` |
| contradictions[] | YES | HTF string inference + `interp_contradiction` residual |
| htf_bias.aligned | **NO** | Infer misaligned from known HTF free-text string when explicit aligned absent |
| data_quality | **NO** | Not emitted unless caller supplies `dataQuality` |

Full `buildContradictionReport(obs, interp)` path remains available when obs+interp exist (`stampContradictionItemsFromObsInterp`).

---

## Verdict

| Field | Value |
|-------|--------|
| **ENGINE_IDS_INVENTORIED** | 8 |
| **SCHEMA_CAN_CARRY_ALL** | **YES** |
| **OBSERVED_SUBSET** | structure_vs_bias (2 polarities), htf_misaligned, NONE |
| **EXHAUSTIVE_OBSERVED_TAXONOMY** | **NO** (engine larger than observed) |
| **NEXT** | Frequency from typed stamps; freeze `contradiction_repr_v1` |

## Non-goals

No unlock, score, ALS, outcomes, or decision-behavior change.
