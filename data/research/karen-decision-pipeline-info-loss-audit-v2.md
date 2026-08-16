# KAREN — Decision-pipeline information-loss audit v2

**DATE:** 2026-08-16  
**MODE:** representation audit only (continuation beyond contradictions / HTF / liquidity)  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**ALS / score / unlock / trading behavior / commit:** none  
**OUTCOMES_INSPECTED:** NO  

**Prior:** [`karen-decision-pipeline-info-loss-audit.md`](./karen-decision-pipeline-info-loss-audit.md) (v1)  
**This doc:** NEW findings only + status verify of already-known lanes. Rank by **information loss**, not profitability.

---

## METHOD

Same path as v1:

```
MarketContext / structureFacts / FeatureSet
  → observation-engine.buildMarketObservation → ReadonlyMarketObservation
  → interpretation / contradiction-report / decision-layer
  → desk-pipeline (+ explainability / uncertainty / DQ / analysis_contract)
  → decision-envelope.buildDecisionEnvelope
  → DV EvidenceAtT + ReasoningStructureAtT
  → featuresAtT (shadow stamps + htf/liquidity/contradiction stamp helpers)
```

**Loss rank order:** OMITTED > flattened-to-count/array→scalar > bool/string lossy > fully preserved  

**Filter:** HTF_BIAS_MISALIGNED lesson — a summary field that does not invert the rich PIT object counts as loss.

**Excluded from NEW ranking (verify only):** typed contradictions, HTF stack stamp, `liquidity_repr_v0` / remaining liquidity #1–#3 gaps.

---

## STATUS_VERIFY (already-known — not re-ranked as NEW)

| Lane | Internal | featuresAtT today | Status |
|------|----------|-------------------|--------|
| Typed contradictions | `ContradictionReport.items[]` | `contradictionItems` + `contradiction_repr_v1` | **FIXED** (caveats: DV may still infer `htf_misaligned` / omit `data_quality` item without optional inputs) |
| HTF bias stack | `obs.htf_bias` `{daily,m15,m5,aligned,tradeable_bias}` | `htfBiasDaily/M15/M5`, `htfAligned`, nested `htfBias`, `htf_bias_repr_v0` (+ `tradeableBias`) | **STAMPED** — v1 rank-3 **superseded**; residual below (`conflictPairs` / `alignedCount`) is NEW small loss |
| Liquidity core levels | `obs.liquidity.levels[]` | `liquidityLevels[]` + counts, `liquidity_repr_v1` (timing **PASS** — session `formedAt` wired) | **PASS** for #1 timing; pools/sequence = locked #2/#3 — see [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md) |

v1 rows still open but **not** treated as NEW: `reasoningChain`→`citedConcepts`, envelope conflict/horizons, single-`fvg` polarity/geometry, explainability/uncertainty/DQ reports, reason **lists**→counts, `order_block`, `displacement_points`, MSS level/time, `reh_rel` (liquidity #2).

---

## NEW_LOSS_TABLE (ranked by information loss)

| Rank | Structured object (PIT @ t, pre-decision) | Exists as | Lands in `featuresAtT` as | Loss class | Reconstructible from stamp? |
|-----:|-------------------------------------------|-----------|---------------------------|------------|------------------------------|
| N1 | `structureFacts.firstPresentedFvg` — `{nyOpening, postFhdr, activeSession}` each `FirstPresentedFvgResult` (`fvg` zone + `variant` + `filled` + window labels) | Full on `MarketContext` (chat/snapshot answers use it) | *(absent)* — never copied onto `MarketObservation` fields; not on `EvidenceAtT` | **OMITTED** | **NO** |
| N2 | `structureFacts.fhdr` — `{high, low, locked, startTime, endTime}` | Full on context; only stringified into `obs.evidence["structure.fhdr.*"]` | *(absent)* as columns; may appear truncated inside `factsPreview` ≤240 | **OMITTED** (geometry → optional prose scrap) | **NO** |
| N3 | `structureFacts.m1UnfilledFvgs[]` + `m1InvertedFvgs[]` — multi-zone `{type,top,bottom,formedAt,startTime,inverted,hasVolumeImbalance}` | Full arrays on context; `mapFvg` keeps **last** zone only on `obs.fvg` | `fvgStatus` only (no direction/top/bottom/count/IFVG ids) | **array→scalar** (+ polarity/geometry still omitted) | **NO** — status does not invert array identity, count, formed times, or IFVG set |
| N4 | `htfPdArrays.unfilledDailyFvgs[]` / `recentDailyFvgs[]` (+ daily OHLC/eq beyond PDH/PDL scalars) | Full on context | `pdh`/`pdl`/`lastPrice` (+ derived PD geometry) only | **OMITTED** (daily FVG set) | **NO** — distinct from 1m FVG and from `liquidityLevels` rows |
| N5 | `DecisionEnvelope` rich blocks beyond cited list: `reasoningChain[]` (concept×evidence×role×outcome), `conflictLog` / `conflictResolution`, `thesis` (`ThesisAnswers`), `logicOrder`, `read` (`HorizonRead`), `layers` | Full on envelope / analysis contract | `citedConcepts: string[]` + stance / `whyNow` / invalidation **strings** | **OMITTED** → string list + prose | **NO** — same class as v1 ranks 2/5; **new detail:** thesis completeness + logicOrder + per-item evidence prices/candleIds |
| N6 | `premiumDiscount` multi-axis — `{vsCurrentDayRange, vsPreviousDayRange, vsNwog, vsNdog}` | Full on context; obs keeps **only** `zone = vsCurrentDayRange` + prose `price_location`; Nwog/Ndog axes never become enum fields on obs | `pdPosition` / dist from PDH–PDL (geometric mid) | **OMITTED** (multi-frame enums) | **NO** — mid-range geometry ≠ current/previous/NWOG/NDOG zone labels (extends v1 zone loss) |
| N7 | `ExecutionScaffold` — `{entryLo/Hi, entryLabel, entryStatus, entryStatusFull, target1*, waitFor, call, structureNote}` | Built in `extractFeatures` / `getExecutionScaffold` before decision | At most `entryModel` string on RS (+ trigger/invalidation prose) | **OMITTED** → thin string | **NO** — numeric entry band, ACTIVE/EXTENDED/WAIT status, dual targets not recoverable |
| N8 | `activeSession` clock structure — `{id, killZone, amdPhase, macroWindow}` | On context; folded into `obs.time_context` prose + coarse `obs.session` bucket | `sessionLabel` / `timeBucketEt` / `dayOfWeekEt` | **bool/string lossy** | **NO** — killZone bool, AMD phase enum, macro window not invertible from session bucket |
| N9 | `ExplainabilityReport` (`citations[]` with claim→evidence_paths→values) + `UncertaintyReport.unknown_fields` + `DataQualityReport.issues[]` | On `DeskPipelineResult` | *(absent)* | **OMITTED** | **NO** (v1 rank-7 restated as still open; typed issue codes lost) |
| N10 | MSS object `{direction, level, at, atTime, description}` | On `structureFacts`; direction → `market_structure`; level only in evidence strings | `marketStructure` + `mssPresent` bool | **bool/string lossy** | **Partial** — direction maybe; level/time **NO** |
| N11 | `interp.long_case.reasons[]` / `short_case.reasons[]` (+ `observation_refs[]`) | Full on interp; DV RS retains reason **arrays** offline | `longReasonCount` / `shortReasonCount` / `reasonMargin` only; **`observation_refs` never stamped** | **flattened-to-count** + refs **OMITTED** | Counts **NO** for identity; refs **NO** |
| N12 | `biasStack` residuals after `htf_bias_repr_v0`: `conflictPairs[]`, `alignedCount`, `dominantBias`, `biasConflict` | Full on context; obs `aligned` is boolean (`alignedCount >= 2`) only | Per-TF leans + `htfAligned` stamped; pairs/count/dominant **absent** | **OMITTED** (secondary) | **Partial** — leans yes; which pairs conflict / exact alignedCount **NO** |
| N13 | Session extreme **formation times** (`asiaHighTime`, `londonLowTime`, …) + `FeatureSet.liquidityTargets` nearest support/resistance labels | On context / FeatureSet | Not on stamp (level prices may exist under liquidity if in obs array; **times/labels of nearest PD** not) | **OMITTED** | **NO** for times / nearest-label choice |
| N14 | `obs.order_block`, `obs.displacement_points`, `obs.data_quality` | On frozen observation | displacement **status** + RS `displacementDirection`; points / order_block / data_quality flag **absent** on EvidenceAtT | **OMITTED** | **NO** |
| N15 | `volContext` | *(not computed onto EvidenceAtT)* | Explicit `null` on stamp | n/a (honest null — not a silent drop of a populated object) | — |

---

## TOP_NEW_LOSSES

1. **`firstPresentedFvg` (3 variants) → completely omitted** — richest unused PIT object: zone geometry, variant (`ny_opening` / `post_fhdr` / `session_open`), filled flag; never reaches observation schema or `featuresAtT`.
2. **`fhdr` band → omitted** — high/low/locked/window only survive as evidence strings → truncated `factsPreview`; no stamp columns.
3. **1m FVG/IFVG arrays → single `fvgStatus`** — multi-zone identity, counts, formedAt, inverted set, volume-imbalance flags unrecoverable (worse than polarity-only loss on the last zone).
4. **Daily FVG arrays (`htfPdArrays.unfilledDailyFvgs` / `recentDailyFvgs`) → omitted** — separate from 1m FVG and from liquidity level rows; stamp has PDH/PDL scalars only.
5. **Envelope chain / conflict / thesis / logicOrder → `citedConcepts` + prose** — concept×evidence×role×outcome and thesis completeness still discarded at stamp.
6. **`premiumDiscount` four-axis enums → PD geometry / single current-day zone** — vsPrevious / vsNwog / vsNdog not stamped; `pdPosition` does not invert them.
7. **`ExecutionScaffold` → `entryModel` string** — numeric entry band, entryStatus, waitFor, targets collapsed.
8. **`killZone` / `amdPhase` / `macroWindow` → session buckets** — clock-structured facts flattened; not invertible from `sessionLabel`.
9. **Explainability / uncertainty / DQ issue lists → omitted** — claim tracing and typed DQ codes discarded.
10. **Reason lists + `observation_refs` → counts only** — confluence identity and cited obs paths invisible on `featuresAtT` (DV may still hold reason arrays offline).

---

## HTF-LESSON ANALOGS (NEW)

| Loss | Why same class as HTF_BIAS_MISALIGNED |
|------|----------------------------------------|
| N1 firstPresentedFvg | Any single `fvgStatus` / last-zone summary cannot invert which variant window presented the gap or whether it filled |
| N3 multi-FVG array | Status/presence ≠ set of zones + IFVG polarity flips |
| N6 premium multi-axis | `pdPosition` or current-day zone ≠ NWOG/NDOG/previous-day frame |
| N8 killZone/AMD | Session bucket ≠ kill-zone bool or AMD phase |
| N7 ExecutionScaffold | `entryModel` prose ≠ ACTIVE/EXTENDED band + targets |

---

## NEXT_REPRESENTATION_CANDIDATES (NEW only)

Representation-only. **No unlock, no score, no ALS, no VAL, no outcomes.**

| Priority | Candidate | Why |
|----------|-----------|-----|
| **N-A** | Stamp compact `firstPresentedFvg` rows (per variant: type/top/bottom/formedAt/filled) | Rank N1 — largest unused structured block |
| **N-B** | Stamp `fhdr` `{high,low,locked}` (+ optional window times) | Rank N2 — small schema, fully computed |
| **N-C** | Stamp FVG set summary: `fvgCount`, `ifvgCount`, last (or all) `{direction,top,bottom,formedAt,inverted}` — not status alone | Rank N3 — array→scalar |
| **N-D** | Stamp daily FVG list compact (or count + nearest) from `htfPdArrays` | Rank N4 |
| **N-E** | Stamp envelope compact: chain `{concept,detected,role,outcome}` + conflict `{disagree,between,winner}` + thesis.complete | Rank N5 |
| **N-F** | Stamp premium multi-axis enums (`vsCurrent`,`vsPrevious`,`vsNwog`,`vsNdog`) | Rank N6 |
| **N-G** | Stamp execution scaffold subset: `entryStatus`, entryLo/Hi, waitFor | Rank N7 |
| **N-H** | Stamp `killZone`, `amdPhase`, `macroWindow` alongside sessionLabel | Rank N8 |

**Do not** reopen liquidity #2/#3 or contradiction unlock work from this list. HTF stack stamp is done (`htf_bias_repr_v0`); only residuals in N12 remain.

---

## Governance

- EDGE_CLAIM **NONE**
- HOLDOUT **SEALED** · VAL **DO NOT TOUCH**
- OUTCOMES **NO**
- No trading behavior change · no commit from this audit

Related: [`karen-decision-pipeline-info-loss-audit.md`](./karen-decision-pipeline-info-loss-audit.md) · [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md) · [`karen-liquidity-representation-v1.md`](./karen-liquidity-representation-v1.md)

---

## Exact return block

```
INFO_LOSS_AUDIT_V2: PASS
OUTCOMES_INSPECTED: NO
STATUS_VERIFY:
  - contradictions typed: FIXED (contradiction_repr_v1)
  - htf_bias stack: STAMPED (htf_bias_repr_v0) — v1 rank-3 superseded
  - liquidity_repr_v0: PARTIAL — remaining timing (#1) then pools/sequence (#2/#3)
TOP_NEW_LOSSES:
  - firstPresentedFvg {nyOpening,postFhdr,activeSession} → omitted entirely
  - fhdr {high,low,locked} → evidence strings only / no stamp columns
  - m1UnfilledFvgs[]+m1InvertedFvgs[] → fvgStatus scalar (array identity lost)
  - htfPdArrays daily FVG arrays → omitted (PDH/PDL scalars only)
  - envelope reasoningChain/conflict/thesis/logicOrder → citedConcepts + prose
  - premiumDiscount 4-axis → pdPosition / current-day zone only
  - ExecutionScaffold → entryModel string
  - killZone/amdPhase/macroWindow → session buckets
NEXT_REPRESENTATION: stamp firstPresentedFvg compact rows (variant×zone×filled) — representation only
REPORT_PATH: data/research/karen-decision-pipeline-info-loss-audit-v2.md
```
