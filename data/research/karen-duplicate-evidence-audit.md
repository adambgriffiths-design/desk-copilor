# KAREN — correlated / duplicate evidence audit

**DATE:** 2026-08-16  
**MODE:** research documentation only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**ALS / score / unlock / implementation / trading changes:** none  
**Outcome labels:** **not used** (`OUTCOMES: NO`)  
**Scope:** Can Karen count essentially the same underlying market fact multiple times through different reasons / concepts?  
**Sources:** `lib/observation-engine.ts`, `lib/interpretation-engine.ts`, `lib/decision-envelope.ts`, `lib/structure.ts`, `lib/observation-facts.ts`, `lib/research/architecture/map.ts`, prior WAIT-upstream audits

---

## VERDICT

| Field | Value |
|-------|--------|
| **CAN_DOUBLE_COUNT_SAME_FACT** | **YES** |
| **INDEPENDENT_CONFLUENCE_ENFORCED** | **NO** |
| **NEEDS_EVIDENCE_SOURCE_IDS** | **YES** |
| **OUTCOMES** | **NO** |

Karen’s support gate is a **reason-string count** (`reasons.length >= 2`). Reasons, `entry_model`, and envelope `citedConcepts` are separate *labels* over overlapping PIT facts. There is **no** independence / dependency / shared-source check before confluence is treated as multi-factor.

Stable evidence-source IDs **or** explicit dependency/group links are required before “confluence richness” can be distinguished from correlated re-description of one impulse.

---

## TRACE (PIT evidence → concepts → reasons)

```text
bars / MarketState
  → detectors (MSS, displacement body, FVG gaps, liquidity levels, bias stack)
  → Observation evidence keys + fields (Layer 1 freeze)
  → Interpretation reasons[] + entry_model + observation_refs (Layer 2)
  → longSupported / shortSupported  ⇐  count(reasons) >= 2
  → DecisionEnvelope reasoningChain[] + citedConcepts[]
  → DV / featuresAtT often keeps counts / concept names, not reason identity
```

### Layer map

| Stage | Artifact | What it encodes | Independence? |
|-------|----------|-----------------|---------------|
| Detectors | `structureFacts.mss`, body-size displacement, `m1UnfilledFvgs`, sweeps | Physical / chart events | Detectors are **correlated by construction** on the same impulse candle(s) |
| Observation | `market_structure`, `displacement`, `fvg.*`, `htf_bias.*`, `evidence["structure.*"]` | Frozen fields + string evidence map | Keys differ; **no event-id** linking “same candle / same swing break” |
| Interpretation | free-text `long_case.reasons` / `short_case.reasons` | One string per *concept-shaped* check | Strings do **not** share a source id; length is confluence |
| Entry model | e.g. `Displacement + FVG retrace`, `{structure} structure continuation` | Narrative bundle of the same fields | Re-labels the bundle; does not add a new fact |
| Envelope chain | `mss`, `displacement`, `fvg`, `htf_bias`, … each with `evidence.source` | Playbook checklist rows | Per-concept sources; **no group / dependency edge** |
| Cited concepts | `citedConcepts[]` | Names of concepts with `outcome===true` (or conflict/wait hits) | Citation list can look like multi-factor when rows share one impulse |

---

## CONCRETE DOUBLE-COUNT / DEPENDENCY PATHS

### 1. HTF bias aliased into “structure” (same fact → two reasons)

`mapStructure` (`lib/observation-engine.ts`):

- If MSS direction exists → `market_structure` = MSS direction.
- Else if tradeable bias is bullish/bearish → **`market_structure` copies HTF bias**.

Interpretation then:

1. Pushes `"HTF bias bullish|bearish"` citing `bias_stack.tradeable_bias`.
2. Pushes `"Observed market structure is bullish|bearish"` citing `structure.mss_direction` **even when structure was bias-filled and MSS may be absent**.

**Effect:** one underlying lean (HTF tradeable bias) can satisfy `reasons.length >= 2` alone.

### 2. MSS ↔ market_structure ↔ entry_model “structure continuation”

- Detector: body close through prior swing (`detectMss` in `lib/structure.ts`).
- Observation: `market_structure` + evidence `structure.mss_*`.
- Reason: `"Observed market structure is …"`.
- Envelope concept: `mss` with `evidence.source = "structure.mss"`.
- Fallback entry model: `` `${market_structure} structure continuation` ``.

**Effect:** one MSS event appears as structure reason, MSS concept, and often the entry-model name — three surfaces, one fact.

### 3. Displacement ↔ MSS ↔ FVG (same impulse, multiple confluence credits)

| Label | Detector | Typical coupling |
|-------|----------|------------------|
| MSS | Close through swing | Impulsive close that also has a large body |
| Displacement | Recent 1m body > 1.5× lookback average body | Same / adjacent bars as the structure break |
| FVG | Unfilled 1m gap from displacement geometry | Gap **produced by** the displacement candle |

Interpretation credits separately when present:

- structure reason (MSS / aliased structure),
- `"Displacement present after sell-side sweep"` (when SSL raid + displacement),
- `"Bullish|Bearish FVG present in observation"`.

Envelope cites `mss` + `displacement` + `fvg` independently when each `outcome === "true"` on long/short stance.

**Effect:** one displacement impulse can look like 2–3 independent confluence factors.

### 4. Liquidity sweep → displacement reason (dependent confirmation)

SSL raid note is a long reason; if `displacement === "present"`, a **second** long reason is added: `"Displacement present after sell-side sweep"`.

Displacement here is framed as confirmation **of** the sweep story, not a second independent market fact — yet both increment `longReasons.length`.

### 5. Entry model re-bundles the same bundle

Named models (`NY open sweep + displacement + FVG retrace`, `Displacement + FVG retrace entry`, `… structure continuation`) are **conjunction labels** over fields already counted as reasons. They do not add independence; narrative and `citedConcepts` can still present them as multi-concept support.

### 6. Research / stamp view flattens further

Prior audits already record: reason **lists** → `longReasonCount` / `shortReasonCount`; `reasoningChain` → `citedConcepts` names. Counts and concept lists **cannot** recover whether two reasons shared one source event. See `karen-force-wait-decision-path-audit.md`, `karen-decision-pipeline-info-loss-audit.md`, deferred item `audit-area-4-independent-confluence`.

---

## WHAT EXISTS TODAY (partial provenance — not enough)

| Mechanism | Role | Gap vs independence |
|-----------|------|---------------------|
| `obs.evidence` string map | PIT field dump | Keys are field paths, not event ids |
| `observation_refs[]` | Which evidence keys were touched | Dedupes keys with `Set`; **does not** dedupe reasons or mark shared events |
| `ObservationFact.id` / `evidence_key` | Queryable Layer-1 registry | Fact ids per concept; **no** “same candle / same swing” group |
| `ReasoningEvidence.source` on chain rows | Per-concept source string | One source **per concept**, not a shared source across dependent concepts |
| Contradiction / explainability `evidence_paths` | Audit trails | Paths, not confluence-independence |

None of these prevent `reasons.length` or `citedConcepts.length` from treating dependent labels as separate weight.

---

## DEPENDENCY GROUPS (suggested framing — representation only)

Not an implementation plan — illustration of what is missing:

| Group id (example) | Members that should not all count as independent |
|--------------------|--------------------------------------------------|
| `impulse_structure` | MSS / `market_structure` reason / envelope `mss` / “structure continuation” entry_model |
| `impulse_displacement` | displacement present + FVG formed by that body + “displacement after sweep” reason |
| `bias_lean` | `htf_bias` reason + bias-aliased `market_structure` when MSS absent |
| `ssl_raid_story` | sell-side sweep note + displacement-after-SSL (confirmation of same raid) |

Without group membership or a shared `evidence_source_id` on each reason/concept row, confluence remains a **bag of labels**.

---

## ANSWER TO THE ASK

**Does Karen need stable evidence-source IDs or dependency/group information?**

**YES.**

- **Stable evidence-source IDs** (e.g. candle/swing/event id shared by MSS, displacement, and FVG rows), **and/or**
- **Explicit dependency / group edges** among reasons and concepts,

are required to tell independent confluence from correlated re-description. Current keys (`structure.mss`, `structure.displacement`, …) name *fields*, not *underlying events*, and the support gate only counts reason strings.

This audit does **not** prescribe trading changes, unlocks, scores, or outcome-driven thresholds.

---

## GOVERNANCE

| Field | Value |
|-------|--------|
| **OUTCOMES** | **NO** |
| **NEEDS_EVIDENCE_SOURCE_IDS** | **YES** |
| **EDGE_CLAIM** | **NONE** |
| **HOLDOUT** | **SEALED** |
| **VAL** | **DO NOT TOUCH** |
| **SELECTIVE_UNLOCK** | unchanged (**PARKED**) |
| **Trading / production code** | untouched |

Related: [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md) (audit area 4) · [`karen-force-wait-decision-path-audit.md`](./karen-force-wait-decision-path-audit.md) · [`karen-decision-pipeline-info-loss-audit.md`](./karen-decision-pipeline-info-loss-audit.md) · [`karen-research-debt-inventory.md`](./karen-research-debt-inventory.md) (`audit-area-4-independent-confluence`)
