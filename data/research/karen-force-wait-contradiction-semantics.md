# KAREN — FORCE_WAIT contradiction semantics review (not count)

**DATE:** 2026-08-16  
**MODE:** research documentation only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**ALS / score / unlock / implementation:** none  
**Outcome labels:** **not used** for taxonomy or justification  
**Source:** `force-wait-shadow-stamps-y1500-latest.json` (FORCE_WAIT shadow-ACT n=1074)  
**Code:** `lib/interpretation-engine.ts`, `lib/contradiction-report.ts`  
**Lock:** selective unlock **PARKED** — [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md)

**Bottleneck frame:** evidence quality / conflict **representation before WAIT** — not “which WAITs to unlock.”

---

## KEY FINDING (fold-in)

Typed **`ContradictionReport`** (`id` / `severity` / `affects` / `evidence_paths`) already exists in `lib/contradiction-report.ts`, but stamp `featuresAtT` only keeps `reasoningStructure.contradictions: string[]` + **`contradictionCount`**. On this dump there are **only 3 unique contradiction strings**. Count therefore collapses distinct market conflicts (and discards typed ids that production already computes).

---

## TAXONOMY (named types — decision-time only)

Built from (a) strings observed on FORCE_WAIT stamps and (b) types the interpreters can emit that are **absent** from this pool but real in code.

### Observed on FORCE_WAIT pool (`featuresAtT.contradictions`)

| Type id | Semantic meaning | Source rule |
|---------|------------------|-------------|
| **STRUCTURE_VS_BIAS_BULLISH_STRUCT** | LTF/observed structure bullish while tradeable HTF bias bearish | `market_structure===bullish` ∧ `tradeable_bias===bearish` |
| **STRUCTURE_VS_BIAS_BEARISH_STRUCT** | Structure bearish while tradeable bias bullish | mirror of above |
| **HTF_BIAS_MISALIGNED** | Higher-timeframe bias stack not aligned | `htf_bias.aligned===false` |
| **NONE** | Empty contradiction list | one-sided support can still FORCE_WAIT via entry WAIT |

### Emitable in code but **not** present as stamp strings on this pool

| Type id | Semantic meaning | Notes |
|---------|------------------|-------|
| **BUY_SIDE_LIQUIDITY_RAID** | High/BSL taken — not bullish continuation | `describeSweptLevel` / block-long path; often diverts away from one-sided LONG FORCE_WAIT |
| **STRUCTURE_UNKNOWN** / **DISPLACEMENT_UNKNOWN** / **FVG_UNKNOWN** | Required field unknown | tends toward NO_TRADE upstream |
| **DATA_QUALITY** | Missing/stale observation | NO_TRADE |
| **BOTH_CASES_SUPPORTED** | Typed report only | `ContradictionReport` id `both_cases_supported` — not in free-text stamp list for this population |

Polarity of structure↔bias is **two different market stories**; free-text keeps them as separate strings, but **`contradictionCount===1` treats them as identical mass**.

---

## FREQUENCIES (FORCE_WAIT shadow-ACT; outcome-independent)

| Type / combo | Stamps (n) | Notes |
|--------------|----------:|-------|
| NONE (cc=0) | 620 | 57.7% of pool — WAIT without recorded contradiction |
| STRUCTURE_VS_BIAS_BULLISH_STRUCT only | 350 | |
| STRUCTURE_VS_BIAS_BEARISH_STRUCT only | 72 | |
| HTF_BIAS_MISALIGNED only | 13 | |
| struct>bias_bull + HTF | 8 | |
| struct>bias_bear + HTF | 11 | |
| **cc=1** | 435 | almost all single structure↔bias |
| **cc=2** | 19 | only multi-string cells |
| Unique contradiction **strings** | **3** | entire dump |
| Contradiction **events** (string occurrences) | 1093 | vs 1074 stamps |

Same structure↔bias **string** co-occurs with ≥15 distinct evidence bundles (displacement × direction × fvg × sweep × entryModel) — count cannot recover that.

---

## EXAMPLES (asOf + type)

| asOf | Type |
|------|------|
| 2023-10-16T14:15:00.000Z | STRUCTURE_VS_BIAS_BULLISH_STRUCT |
| 2023-10-02T00:00:00.000Z | STRUCTURE_VS_BIAS_BULLISH_STRUCT |
| 2023-10-20T15:02:00.000Z | NONE (cc=0; retrace WAIT) |
| 2023-10-19T19:42:00.000Z | NONE |
| *(bearish-struct cells)* | STRUCTURE_VS_BIAS_BEARISH_STRUCT (n=83 events) |
| *(htf-only cells)* | HTF_BIAS_MISALIGNED (n=13 alone) |

Support-filter mismatch (representation bug, not unlock): longSupported clears contradictions containing `"opposes bullish"` only — so **STRUCTURE_VS_BIAS_BULLISH_STRUCT** (“opposes **bearish**”) does **not** block LONG support. Recorded conflict ≠ gate effect.

---

## CONTRADICTION_COUNT_LOSSY

**YES**

Reasons (outcome-free):

1. **Type collapse** — structure↔bias polarity, HTF misalign, and (in code) liquidity-raid / unknown-field conflicts are different evidence conflicts; count is a cardinality.  
2. **Context collapse** — identical string + `cc===1` spans many displacement/FVG/sweep/model bundles.  
3. **Pipeline discard** — typed `ContradictionReport` ids already computed elsewhere are **not** stamped into `featuresAtT`.  
4. **Population blindness** — only 3 strings appear; richer raid/unknown types never show up as countable features here.

`contradictionCount===1` is therefore **not** a WAIT-quality signal; it is a lossy rename of “mostly structure↔bias conflict present” (already DEFINE_BLOCK’d with cited_mss).

---

## NEW_PIT_SAFE_CONTRADICTION_TYPE_JUSTIFIED

**YES** (independent of outcomes)

Justification: stamp at *t* the typed id(s) Karen already knows how to build (`structure_vs_bias` + direction, `htf_misaligned`, interp raid notes, severity/affects) instead of only `string[]` length. PIT-safe: derived from observation + interpretation at decision time. **Not** an unlock predicate; **not** a c4 single-change.

---

## NEXT_SINGLE_MEASUREMENT

**Instrument only: contradiction type (not count)** — add PIT-safe typed contradiction id(s) (+ polarity for structure↔bias) onto FORCE_WAIT stamps / featuresAtT; frequency and co-occurrence only. No unlock, no score, no VAL.

---

## Governance

EDGE_CLAIM NONE · HOLDOUT SEALED · VAL DO NOT TOUCH · no ALS / trading code / commit  
See also: [`karen-force-wait-good-bad-mechanism-review.md`](./karen-force-wait-good-bad-mechanism-review.md) · [`karen-force-wait-decision-path-audit.md`](./karen-force-wait-decision-path-audit.md)
