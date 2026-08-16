# KAREN — Decision-pipeline information-loss audit (Lane 2)

**DATE:** 2026-08-16  
**MODE:** representation audit only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**ALS / score / unlock / trading behavior / commit:** none  
**OUTCOMES_INSPECTED:** NO  

**Authorization:** Adam — Lane 2 information-loss audit (parallel OK with outcome-relation RUN).

**Continuation:** NEW findings (beyond contradictions / HTF / liquidity) → [`karen-decision-pipeline-info-loss-audit-v2.md`](./karen-decision-pipeline-info-loss-audit-v2.md).  
**Status note (2026-08-16):** HTF stack stamped (`htf_bias_repr_v0`) — v1 rank-3 superseded. Liquidity timing (`liquidity_repr_v1`) including session `formedAt` = **PASS** (smoke freq); see timing audit + internal-vs-featuresAtT.

---

## METHOD

Trace PIT-safe structured objects computed **before** the decision, then compare what exists internally vs what lands in research-facing `featuresAtT`.

### Pipeline path audited

```
MarketContext / MarketState
  → observation-engine.buildMarketObservation → ReadonlyMarketObservation (frozen)
  → interpretation-engine.buildMarketInterpretation → MarketInterpretation
  → contradiction-report.buildContradictionReport → ContradictionReport
  → decision-layer → TradingDecision
  → desk-pipeline (+ explainability / uncertainty / data_quality_report)
  → decision-envelope.buildDecisionEnvelope → DecisionEnvelope
       (reasoningChain[], conflictLog, horizons, thesis, citedConcepts[])
  → DV EvidenceAtT + ReasoningStructureAtT (record at asOf)
  → scripts/karen-dv-force-wait-shadow-stamps-y1500.ts featuresAtT(...)
       (+ lib/contradiction-stamp-features.ts typed attach)
```

### Sources read

| Source | Role |
|--------|------|
| `lib/desk-schema.ts` | Observation / interpretation / pipeline result types |
| `lib/observation-engine.ts` | What Layer 1 freezes |
| `lib/interpretation-engine.ts` | Reasons, contradictions strings, support flags |
| `lib/contradiction-report.ts` | Typed `ContradictionItem[]` + aggregates |
| `lib/decision-layer.ts` | Verdict from interp + obs constraints |
| `lib/decision-envelope.ts` | `reasoningChain`, conflict, thesis, citedConcepts |
| `lib/explainability.ts` | Citation objects (pipeline-only today) |
| `lib/contradiction-stamp-features.ts` | Typed stamp / DV reconstruction |
| `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts` | `featuresAtT` surface |
| DV `EvidenceAtT` / `ReasoningStructureAtT` (v0 record shape) | What survives into DV before stamp |

### Loss rank order (fixed)

**OMITTED** > **flattened-to-count** > **bool/string lossy** > **fully preserved**

Ranking uses **information loss only** — no GOOD/BAD, proxyR, MFE/MAE, clearance, or outcome-conditioned stats.

### HTF_BIAS_MISALIGNED lesson (applied as filter)

`htf_misaligned` / stack agreement **cannot** be reconstructed from `tradeableBias` alone (directional tradeable bias can exist under partial TF conflict). Flag any similar case where a rich PIT object is collapsed to a summary field that does not invert.

---

## LOSS_TABLE (ranked)

| Rank | Structured object (internal, PIT @ t) | Exists as | Lands in `featuresAtT` as | Loss class | Reconstructible from stamp? |
|-----:|----------------------------------------|-----------|---------------------------|------------|------------------------------|
| 1 | `obs.liquidity.levels[]` — per-level `{label, price, taken, status, side, source, ticks, why}` (+ upstream sweeps / reh_rel / EQH·EQL / session·ORG·gap ids) | Full array on observation (+ richer structureFacts) | **PARTIAL FIX** via `liquidity_repr_v0`: `liquidityLevels[]` `{label,price,side,taken,status,source,why}` + `liquidityLevelCount` / `liquidityTakenCount` + `sweepPresent` still present. See [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md) | **partial fix** — remaining = timing/proof ticks + `liquiditySweeps` events + `reh_rel` + EQH/EQL pools + session/ORG/gap levels not in obs array | **Partial** — stamped level fields YES when Evidence carries levels; remaining gaps **NO** |
| 2 | `DecisionEnvelope.reasoningChain[]` — per-concept `{checked, detected, usedInDecision, role, evidence, outcome, impact}` | Full chain on envelope | `citedConcepts: string[]` only | **OMITTED** → string list | **NO** — role / evidence / outcome / PDH vs PDL sweep items / session_liquidity stay-out details lost |
| 3 | `obs.htf_bias` — `{daily, m15, m5, aligned, tradeable_bias}` | Full stack on observation | `tradeableBias` only | **OMITTED** → single string | **NO** — **HTF_BIAS_MISALIGNED lesson**; `aligned` and per-TF leans not stamped; typed `htf_misaligned` item needs string fallback or optional `htfAligned` |
| 4 | `obs.reh_rel` — nearest REH/REL + level arrays with confirmation/status/geometry | Full block on observation | *(absent)* | **OMITTED** | **NO** |
| 5 | `ConflictLog` / `ConflictResolution` / `HorizonRead` / dual horizons | Structured on envelope | Stance / prose only (`whyNow`, invalidation strings) | **OMITTED** | **NO** — disagree / between / winner / ltfAgainstHtfAllowed lost |
| 6 | `obs.fvg` — `{status, direction, top, bottom}` | Full object | `fvgStatus` only | **OMITTED** (geometry+polarity) | **NO** from status alone; polarity only if present in reason prose |
| 7 | `ExplainabilityReport` / `UncertaintyReport` / `data_quality_report` | On `DeskPipelineResult` | *(absent)* | **OMITTED** | **NO** |
| 8 | `obs.premium_discount` — `{zone, price_location}` | On observation | Derived `pdPosition` / dist from PDH–PDL only | **OMITTED** (zone enum) | **Partial** — geometric mid ≠ premium/discount/equilibrium label |
| 9 | `interp.long_case.reasons[]` / `short_case.reasons[]` | Full string lists on interp + DV `reasoningStructure` | `longReasonCount` / `shortReasonCount` / `reasonMargin` only (**arrays not copied into featuresAtT**) | **flattened-to-count** | **NO** from featuresAtT — identity / duplication / correlation invisible (DV record retains arrays offline) |
| 10 | `obs.order_block` | Enum on observation | *(absent)* | **OMITTED** | **NO** |
| 11 | `obs.data_quality` | Flag on observation | *(absent on EvidenceAtT)*; typed `data_quality` item only if stamp input supplied | **OMITTED** | **NO** on current DV evidence |
| 12 | `obs.displacement_points` | Number on observation | *(absent)*; `displacement` status only | **OMITTED** | **NO** |
| 13 | `obs.evidence` map + `time_context` | Rich string map / kill-zone·AMD context | `factsPreview` ≤240 chars + session/time buckets | **bool/string lossy** | **NO** — truncated prose |
| 14 | MSS object (level, time, direction) | In ctx / evidence paths | `marketStructure` + `mssPresent` bool | **bool/string lossy** | **Partial** — direction in structure string; level/time lost |
| 15 | Liquidity confounder / dual-credit | Confounder tags on DV | `sweepPresent` + `confounderActiveIds` | **bool/string lossy** | **Partial** |
| 16 | Support geometry | `longSupported`/`shortSupported` + reasons | Booleans + derived `supportSide` | **bool/string lossy** (side enum) | Side OK; reason identity not |
| 17 | Legacy `contradictions: string[]` | Interp + RS | Still stamped + `contradictionCount` | count = lossy view; strings = medium | Count alone **NO**; strings **partial** |
| 18 | `ContradictionReport.items[]` (+ severity/affects/polarity) | Built pre-decision | `contradictionItems` + `contradictionRepresentationVersion` | **fully preserved** (typed) | **YES** (see ALREADY_FIXED caveats) |
| 19 | Scalars: `tradeableBias`, `marketStructure`, `displacement`, `fvgStatus`, session/time, `entryModel`, PDH/PDL/`lastPrice` | On obs / evidence | Same fields (plus PD geometry) | **fully preserved** | **YES** |

---

## TOP_LOSSES (max 10)

1. **Liquidity second-order gaps (after `liquidity_repr_v0`)** — core structured levels (incl. side) are **not** blind; remaining priority order is (1) timing/provenance → (2) broader pools → (3) interaction sequence — [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md). Active: `liquidity_repr_v1` = v0 + timing.
2. **`reasoningChain[]` → `citedConcepts[]`** — concept×evidence×role×outcome discarded; envelope already computed it.
3. **`htf_bias` stack → `tradeableBias`** — same class as HTF_BIAS_MISALIGNED: alignment / per-TF leans not invertible from tradeable alone.
4. **`reh_rel` block → omitted** — nearest pools + confirmation never enter EvidenceAtT / featuresAtT (liquidity priority **#2**).
5. **Envelope conflict / horizon structures → omitted** — only stance/prose survive.
6. **`fvg` direction + geometry → `fvgStatus`** — polarity and gap bounds lost as columns.
7. **Explainability / uncertainty / DQ reports → omitted** — claim tracing and unknown-field sets discarded at stamp.
8. **`premium_discount.zone` → PD geometry only** — zone enum not stamped; `pdPosition` is not a substitute.
9. **Reason lists → counts in featuresAtT** — confluence identity flattened even though DV still holds arrays.
10. **`data_quality` / `order_block` / `displacement_points` → omitted** — smaller objects but still PIT-computed and unused by stamp.

---

## ALREADY_FIXED (typed contradictions)

| Item | Status |
|------|--------|
| Typed `ContradictionItem` / report ids | Engine always built them (`lib/contradiction-report.ts`) |
| Stamp surface | **FIXED** — `featuresAtT.contradictionItems` + `contradictionRepresentationVersion = contradiction_repr_v1` via `lib/contradiction-stamp-features.ts` |
| Spec / measurement | Lane 1 COMPLETE — representation FROZEN; type-vs-count richer = YES |
| Legacy | `contradictions[]` / `contradictionCount` retained unchanged (count remains a lossy *view*, not the SoT) |

**Caveats (not reopen unlock):**

- DV reconstruction path lacks `htfAligned` / `dataQuality` on `EvidenceAtT`; `htf_misaligned` may rely on free-text fallback; `data_quality` typed item often absent unless optional inputs supplied.
- Aggregate flags `has_blocking` / `long_blocked` / `short_blocked` / `summary` are not stamped as fields (reconstructible from items).

---

## PARTIAL_FIX / NEXT (liquidity — locked framing)

| Item | Status |
|------|--------|
| `liquidity_repr_v0` core levels (label/price/side/taken/status/source/why) | **DEFINED** — side is **not** the gap |
| Priority **#1** timing/provenance → `liquidity_repr_v1` | **PASS** — session `formedAt` wired; smoke freq 100% formedAt (session+PD); dump enrich progressive on 8GB |
| Priority **#2** broader pools (REH/REL, EQH/EQL, NY-pre, ORG, NDOG/NWOG) | **NOT_STARTED** |
| Priority **#3** interaction sequence history | **NOT_STARTED** |
| Detail / SoT | [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md) · [`karen-liquidity-representation-v1.md`](./karen-liquidity-representation-v1.md) |

---

## NEXT_REPRESENTATION_CANDIDATES

Representation-only. **No unlock, no score, no ALS, no VAL.**

| Priority | Candidate | Why (loss class) | HTF-lesson analog? |
|----------|-----------|------------------|--------------------|
| **L1** | Liquidity timing/provenance on existing level rows (`liquidity_repr_v1`) | Second-order after v0; **active** | Bool/`status` without tick time does not invert |
| A | Stamp `htf_bias` stack: `daily`, `m15`, `m5`, `aligned` (alongside existing `tradeableBias`) | Rank-3 **OMITTED**; tiny schema; already on frozen obs | **YES** — exact lesson |
| **L2** | Broader pool identity into featuresAtT | Liquidity priority #2 — **blocked until L1 PASS** | |
| **L3** | Interaction sequence history | Liquidity priority #3 — **blocked until L1 PASS** | |
| C | Stamp `reasoningChain` compact rows: `{concept, detected, role, outcome}` | Rank-2 **OMITTED** | Similar — cited list ≠ chain state |
| D | Stamp `fvg.direction` (+ optional top/bottom) | Rank-6 **OMITTED** polarity/geometry | Status alone insufficient |
| E | Copy reason **lists** (or stable reason ids) into featuresAtT, not only counts | Rank-9 **flattened-to-count** | Count ≠ confluence identity |
| F | Stamp `premium_discount.zone` | Rank-8 **OMITTED** zone | Geometry ≠ zone |

**Recommended liquidity NEXT:** finish **L1** (`liquidity_repr_v1` stamp + outcome-blind freq) before any #2/#3 or outcome work.

---

## Governance

- EDGE_CLAIM **NONE**
- HOLDOUT **SEALED** · VAL **DO NOT TOUCH**
- No trading behavior change · no commit from this audit
- Selective unlock remains **PARKED** · `C4_SINGLE_CHANGE` **NOT_DEFINED**

Related: [`karen-force-wait-decision-path-audit.md`](./karen-force-wait-decision-path-audit.md) · [`karen-contradiction-type-feature-story.md`](./karen-contradiction-type-feature-story.md) · [`karen-contradiction-representation-spec-v1.md`](./karen-contradiction-representation-spec-v1.md) · [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md)

---

## Exact return block

```
INFO_LOSS_AUDIT: PASS
OUTCOMES_INSPECTED: NO
TOP_3_LOSSES:
  - liquidity #2 map (NY-pre/ORG/gaps/REH/REL/EQH/EQL) — timing #1 PASS
  - reasoningChain[] → citedConcepts[] only
  - (htf_bias stack STAMPED — htf_bias_repr_v0; residual conflictPairs only)
NEXT_REPRESENTATION: full liquidity map (priority #2) — not started
REPORT_PATH: data/research/karen-decision-pipeline-info-loss-audit.md
```
