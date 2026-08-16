# KAREN — contradiction_type feature-story audit

**DATE:** 2026-08-16  
**MODE:** representation research only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**SELECTIVE_UNLOCK:** PARKED · **C4_SINGLE_CHANGE:** NOT_DEFINED  
**ALS / score / unlock / trading behavior:** none  
**OUTCOMES_INSPECTED:** NO  

**Prior SoT:** typed contradiction measurement **PASS** · MEANINGFUL_REPRESENTATION=YES · SoT drift reconciled  
**Sources:** `lib/contradiction-report.ts`, `lib/interpretation-engine.ts`, `lib/observation-engine.ts`, `lib/bias-analysis.ts`, `lib/desk-pipeline.ts`, `lib/decision-layer.ts`, `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts`, [`karen-contradiction-type-measurement.md`](./karen-contradiction-type-measurement.md), [`karen-force-wait-contradiction-semantics.md`](./karen-force-wait-contradiction-semantics.md), `contradiction-type-measurement-latest.json` (counts only)

---

## Goal

Determine whether `contradiction_type` has a coherent PIT-safe semantic definition that deserves to become part of Karen’s decision-time representation — **not** whether it predicts outcomes, and **not** whether it unlocks WAIT.

---

## TAXONOMY (3 observed types under FORCE_WAIT shadow-ACT)

| Taxonomy id | ContradictionReport `id` | Polarity | Free-text string (stamp) |
|-------------|--------------------------|----------|--------------------------|
| **STRUCTURE_VS_BIAS_BULLISH_STRUCT** | `structure_vs_bias` | `bullish_struct_bearish_bias` | `Bullish structure opposes bearish tradeable bias` |
| **STRUCTURE_VS_BIAS_BEARISH_STRUCT** | `structure_vs_bias` | `bearish_struct_bullish_bias` | `Bearish structure opposes bullish tradeable bias` |
| **HTF_BIAS_MISALIGNED** | `htf_misaligned` | — | `Higher timeframe biases not aligned` |

Plus stamp-level **NONE** (empty contradiction list) — not a conflict type, but the residual cell when `contradictionCount===0`.

---

## Per-type feature story

### 1. STRUCTURE_VS_BIAS_BULLISH_STRUCT

| Field | Finding |
|-------|---------|
| **Exact typed ID/name** | Taxonomy: `STRUCTURE_VS_BIAS_BULLISH_STRUCT` · Report id: `structure_vs_bias` · Polarity: `bullish_struct_bearish_bias` |
| **GENERATION_PATH** | (1) Observation freezes `market_structure` via `mapStructure(mss.direction, …)` and `htf_bias.tradeable_bias` via `computeBiasStack` → `observation-engine`. (2) `buildMarketInterpretation` pushes the fixed string when `market_structure==="bullish"` ∧ `tradeable_bias==="bearish"` (`interpretation-engine.ts` ~102–103). (3) Parallel typed item in `buildContradictionReport` with same predicate (`contradiction-report.ts` ~26–33, severity `blocking`, affects `both`). (4) Shadow stamp copies `reasoningStructure.contradictions: string[]` only — typed report **not** stamped (`featuresAtT` in `karen-dv-force-wait-shadow-stamps-y1500.ts`). |
| **PIT inputs** | At asOf *t*: chart/LTF MSS direction → `market_structure`; daily/m15/m5 bias stack → `tradeable_bias`. No future bars, no outcome labels. |
| **Market/evidence meaning** | Local/observed structure is bullish while the tradeable HTF bias is bearish — structure↔bias **opposition** (bullish-structure polarity). Distinct market story from the mirror polarity. |
| **Available at decision time?** | **YES** — both fields exist on the frozen observation before WAIT/verdict. |
| **Deterministic / stable?** | **YES** — fixed boolean predicate → fixed string / fixed report id; polarity is a pure function of which side is bullish. |
| **Distinct vs other types / renames?** | Distinct from `HTF_BIAS_MISALIGNED` (stack agreement ≠ structure↔bias). Distinct from `contradictionCount`, `cited_mss`, support side, entry model. **Note:** given stamped `marketStructure` + `tradeableBias`, this flag is *reconstructible* as their opposition; its value as representation is naming the **conflict**, not inventing a third raw observable. When it fires, MSS was present and opposite bias (`mapStructure` bias-fallback cannot produce opposition). |
| **Leakage / post-t?** | **None** — observation + interpretation at *t* only. |
| **Frequency (counts only)** | Events: **358** · Solo combo: **350** · With HTF: **8** · Under `cc===1`: **350** |

### 2. STRUCTURE_VS_BIAS_BEARISH_STRUCT

| Field | Finding |
|-------|---------|
| **Exact typed ID/name** | Taxonomy: `STRUCTURE_VS_BIAS_BEARISH_STRUCT` · Report id: `structure_vs_bias` · Polarity: `bearish_struct_bullish_bias` |
| **GENERATION_PATH** | Mirror of (1): interp pushes `"Bearish structure opposes bullish tradeable bias"` when `market_structure==="bearish"` ∧ `tradeable_bias==="bullish"`; report id still `structure_vs_bias` (`contradiction-report.ts` ~35–42). Same stamp path (string only). |
| **PIT inputs** | Same as bullish-struct polarity: `market_structure`, `tradeable_bias` at *t*. |
| **Market/evidence meaning** | Observed structure bearish while tradeable HTF bias bullish — **mirror** opposition story. Not a synonym of bullish-struct polarity. |
| **Available at decision time?** | **YES** |
| **Deterministic / stable?** | **YES** |
| **Distinct?** | Distinct polarity of the same report id; under `cc===1` count cannot separate it from bullish-struct or HTF-only. Not a rename of side/model/cited-concept. |
| **Leakage / post-t?** | **None** |
| **Frequency (counts only)** | Events: **83** · Solo combo: **72** · With HTF: **11** · Under `cc===1`: **72** |

### 3. HTF_BIAS_MISALIGNED

| Field | Finding |
|-------|---------|
| **Exact typed ID/name** | Taxonomy: `HTF_BIAS_MISALIGNED` · Report id: `htf_misaligned` · Polarity: none |
| **GENERATION_PATH** | (1) `computeBiasStack(daily, m15, m5)` yields `alignedCount` (`bias-analysis.ts`). (2) Observation sets `htf_bias.aligned = (alignedCount >= 2)` else false when quality known (`observation-engine.ts` ~309). (3) Interp pushes `"Higher timeframe biases not aligned"` when `aligned === false` (`interpretation-engine.ts` ~108–109). (4) Report: id `htf_misaligned`, severity `warning`, affects `decision` (`contradiction-report.ts` ~45–52). (5) Stamp again keeps string only — **`aligned` is not a `featuresAtT` field today**. |
| **PIT inputs** | Daily / m15 / m5 bias hints at *t* (and data_quality gate). No post-t. |
| **Market/evidence meaning** | Fewer than two of D/15m/5m agree on the same non-neutral direction — HTF stack **not aligned**. Orthogonal to whether LTF structure opposes tradeable bias (can co-occur). |
| **Available at decision time?** | **YES** — on observation before decision. |
| **Deterministic / stable?** | **YES** — `alignedCount >= 2` threshold is fixed. |
| **Distinct?** | **YES** vs both structure↔bias polarities. Not reconstructible from currently stamped `tradeableBias` alone (bias can be directional under partial conflict). Not a count/cited/side/model rename. |
| **Leakage / post-t?** | **None** |
| **Frequency (counts only)** | Events: **32** · Solo combo: **13** · With bullish-struct: **8** · With bearish-struct: **11** · Under `cc===1`: **13** |

---

## Cross-cutting checks

### GENERATION_PATH (summary)

```
bias-analysis.computeBiasStack
  → observation-engine (market_structure, htf_bias.aligned, tradeable_bias)
    → interpretation-engine.buildMarketInterpretation → contradictions: string[]
    → contradiction-report.buildContradictionReport → typed items[]  (parallel; richer)
      → desk-pipeline attaches both
        → DV reasoningStructure keeps strings
          → shadow featuresAtT: contradictions[] + contradictionCount only
```

Decision-layer uses contradiction **strings** in verdict prose only; it does not invent types.

### PIT_SAFE

**YES** — all three types are pure functions of frozen observation fields at decision time.

### DETERMINISTIC

**YES** — fixed predicates → fixed strings / report ids; dump map was 1:1 (0 unmapped).

### DISTINCT_INFORMATION

**YES** — relative to `contradictionCount` (under `cc===1`, three taxonomy cells; entropy 0.833 vs count H=0). Distinct from cited-concept / support-side / entry-model fields. The two structure↔bias polarities are distinct market stories sharing one report id. HTF misalignment adds information not present as its own stamped feature today.

### LEAKAGE_CHECK

**PASS** — no dependence on post-*t* prices, outcomes, proxyR, clearance, or labels. Stamp pipeline documents `featuresAtT` as evidence + reasoningStructure at asOf.

### EXHAUSTIVE

**NO** — for the observed FORCE_WAIT dump, the 3 strings (+ NONE) cover 100% of stamped events, but the **engine taxonomy is larger**: liquidity-raid notes, unknown structure/displacement/FVG, data_quality, `both_cases_supported` (typed report), etc. A closed 3-type categorical would silently drop future/other emitables.

### MUTUALLY_EXCLUSIVE

**NO** — HTF + structure↔bias co-occur (n=19 stamps: 8 + 11). Same stamp can carry two typed conflicts. Structure polarities do not co-occur with each other (opposite predicates).

### Frequencies (population n=1074; counts only; no outcomes)

| Combo | n | % |
|-------|--:|--:|
| NONE | 620 | 57.7% |
| STRUCTURE_VS_BIAS_BULLISH_STRUCT | 350 | 32.6% |
| STRUCTURE_VS_BIAS_BEARISH_STRUCT | 72 | 6.7% |
| HTF_BIAS_MISALIGNED | 13 | 1.2% |
| HTF + BEARISH_STRUCT | 11 | 1.0% |
| HTF + BULLISH_STRUCT | 8 | 0.7% |

Under `cc===1` (n=435): BULLISH_STRUCT 350 · BEARISH_STRUCT 72 · HTF 13.

---

## Recommended representation

| Option | Verdict |
|--------|---------|
| categorical `contradictionType` | **Insufficient** — co-occurrence (n=19) forces arbitrary primary pick or information loss; also collapses report severity/affects. |
| multi-label `contradictionTypes[]` | **Viable** for observed ids + polarity enums — handles co-occurrence; still drops severity/affects/evidence_paths already computed. |
| **typed objects retaining source/severity/polarity** | **RECOMMENDED** — matches existing `ContradictionItem` / `ContradictionReport`; multi-item by construction; polarity for `structure_vs_bias`; preserves severity (`blocking` vs `warning`) and affects. |
| NOT_ADOPTED | **Rejected** — coherent PIT-safe semantics exist; count is lossy; MEANINGFUL_REPRESENTATION already YES. |

**RECOMMENDED_REPRESENTATION:** typed objects retaining source/severity/polarity  
(Conceptual decision-time representation — **not** an unlock predicate, **not** a c4 single-change.)

**FEATURE_STORY_JUSTIFIED:** **YES**

---

## Governance / non-goals

- Selective WAIT unlock remains **PARKED**
- `C4_SINGLE_CHANGE=NOT_DEFINED` · `EDGE_CLAIM=NONE` · HOLDOUT **SEALED** · VAL **DO NOT TOUCH**
- No GOOD/BAD, proxyR, MFE/MAE, clearance, profitability, or outcome-conditioned stats inspected
- No trading code / score / ALS / commit from this audit

## NEXT_SINGLE_MEASUREMENT

Adopt **typed contradiction objects** (report `id` + structure↔bias polarity + severity/affects) into decision-time / `featuresAtT` representation measurement — frequency and co-occurrence only; cover emitable-but-unobserved ids as empty/rare cells. **No unlock, score, or VAL.**

---

## Exact return block

```
TAXONOMY
  STRUCTURE_VS_BIAS_BULLISH_STRUCT (structure_vs_bias / bullish_struct_bearish_bias)
  STRUCTURE_VS_BIAS_BEARISH_STRUCT (structure_vs_bias / bearish_struct_bullish_bias)
  HTF_BIAS_MISALIGNED (htf_misaligned)
GENERATION_PATH
  bias-stack+MSS → observation → interp strings ∥ ContradictionReport → stamp strings+count only
PIT_SAFE: YES
DETERMINISTIC: YES
DISTINCT_INFORMATION: YES
LEAKAGE_CHECK: PASS
EXHAUSTIVE: NO
MUTUALLY_EXCLUSIVE: NO
RECOMMENDED_REPRESENTATION: typed objects retaining source/severity/polarity
FEATURE_STORY_JUSTIFIED: YES
OUTCOMES_INSPECTED: NO
NEXT_SINGLE_MEASUREMENT: stamp typed ContradictionReport items (id+polarity+severity) into featuresAtT; frequency/co-occurrence only — no unlock/score/VAL
```
