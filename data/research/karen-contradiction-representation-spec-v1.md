# KAREN — contradiction representation spec v1 (FROZEN)

**DATE:** 2026-08-16  
**STATUS:** **FROZEN**  
**version id:** `contradiction_repr_v1`  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**SELECTIVE_UNLOCK:** PARKED · **C4_SINGLE_CHANGE:** NOT_DEFINED  
**ALS / score / unlock / trading behavior:** none  

---

## Freeze rule

**Must not redefine this schema after outcomes are inspected.**  
Any future change requires a new version id (`contradiction_repr_v2+`) and a fresh predeclare — do not silently mutate v1.

---

## Field schema (`featuresAtT`)

### Legacy (unchanged meaning)

| Field | Type | Notes |
|-------|------|-------|
| `contradictions` | `string[]` | Free-text from reasoningStructure / interp |
| `contradictionCount` | `number` | `contradictions.length` |

### Typed (additive)

| Field | Type | Notes |
|-------|------|-------|
| `contradictionRepresentationVersion` | `"contradiction_repr_v1"` | Spec pin |
| `contradictionItems` | `ContradictionStampItem[]` | Multi-label; empty ⇒ NONE |

```ts
type ContradictionStampItem = {
  id: string;
  severity: "blocking" | "warning";
  affects: "long" | "short" | "both" | "decision";
  polarity: "bullish_struct_bearish_bias" | "bearish_struct_bullish_bias" | null;
  evidence_paths: string[];
  description: string;
};
```

---

## Allowed ids (engine inventory)

From `buildContradictionReport` / `CONTRADICTION_ENGINE_EMITABLE_IDS`:

1. `structure_vs_bias`
2. `htf_misaligned`
3. `data_quality`
4. `unknown_market_structure`
5. `unknown_displacement`
6. `unknown_fvg_status`
7. `both_cases_supported`
8. `interp_contradiction` (catch-all for unmatched free-text)

Schema may carry future ids as strings without dropping rows; closed categorical collapse is forbidden under v1.

---

## Polarity rules

| Condition | polarity |
|-----------|----------|
| `marketStructure==bullish` ∧ `tradeableBias==bearish` | `bullish_struct_bearish_bias` |
| `marketStructure==bearish` ∧ `tradeableBias==bullish` | `bearish_struct_bullish_bias` |
| Any other id / non-opposition | `null` |

Polarity is attached only when `id === "structure_vs_bias"`.

---

## Severity / affects

Retained from `ContradictionItem` in `lib/contradiction-report.ts` (do not invent new severities under v1):

| id | severity | affects |
|----|----------|---------|
| structure_vs_bias | blocking | both |
| htf_misaligned | warning | decision |
| data_quality | blocking | decision |
| unknown_* | blocking | decision |
| both_cases_supported | blocking | decision |
| interp_contradiction | warning | decision |

---

## Generation path (stamp)

1. **Preferred:** `stampContradictionItemsFromObsInterp(obs, interp)` → `buildContradictionReport` + polarity.  
2. **DV stamps:** `stampContradictionItemsFromDvEvidence` from asOf evidence + reasoningStructure (documented reconstruction; `htfAligned`/`dataQuality` optional / string-inferred).

Implementation: `lib/contradiction-stamp-features.ts`  
Stamp wiring: `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts`  
Enrich path (typed parity without full DV re-run): `scripts/karen-dv-enrich-contradiction-items-stamps.ts`

---

## Non-goals under this freeze

- Not an unlock predicate  
- Not a c4 single-change  
- Not ALS / registry score  
- Not a license to redefine after seeing GOOD/BAD  

---

## Pointers

- Coverage: [`karen-contradiction-engine-coverage.md`](./karen-contradiction-engine-coverage.md)  
- Provenance: [`karen-contradiction-type-provenance.md`](./karen-contradiction-type-provenance.md)  
- Frequency: [`karen-contradiction-type-measurement.md`](./karen-contradiction-type-measurement.md)  
- Type-vs-count: [`karen-contradiction-type-vs-count-predeclare.md`](./karen-contradiction-type-vs-count-predeclare.md)  
- Outcome relation: **DEFERRED** — [`karen-contradiction-type-outcome-relation-predeclare.md`](./karen-contradiction-type-outcome-relation-predeclare.md)
