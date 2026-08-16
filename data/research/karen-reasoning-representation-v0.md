# KAREN — Reasoning representation v0

**DATE:** 2026-08-16  
**MODE:** representation only  
**EDGE_CLAIM:** NONE  
**OUTCOMES_INSPECTED:** NO  
**UNLOCK / ALS / VAL / HOLDOUT:** not touched  
**VERSION:** `reasoning_repr_v0`

---

## Schema

Additive `featuresAtT` fields (citedConcepts + reason counts unchanged):

```ts
reasoningRepresentationVersion: "reasoning_repr_v0"
reasoningChainCompact: Array<{
  concept: string;
  checked: boolean;
  outcome: "true" | "false" | "uncertain";
  detected: boolean;
  usedInDecision: boolean;
  role: "PRIMARY" | "SUPPORTING" | "NONE";
  evidenceSource: string; // copy of evidence.source
}>
conflictBetween: "primary_vs_htf" | "session_stay_out" | "both_sides" | "none" | null
```

Source: `DecisionEnvelope.reasoningChain[]` + `conflictResolution.between` via
`lib/reasoning-stamp-features.ts` (`stampReasoningFeaturesFromEnvelope` /
`stampReasoningFeaturesFromEvidence`).

No invented fields. Empty evidence → empty rows + null `conflictBetween`.
`citedConcepts` retained; identity check: PRIMARY ids ≡ citedConcepts.

---

## PIT notes

- Rows are frozen from the envelope already computed at decision/asOf — no look-ahead.
- Pass-through from EvidenceAtT when compact rows are present (DV regenerate / enrich).
- Shadow stamp path (`featuresAtT` in `karen-dv-force-wait-shadow-stamps-y1500.ts`) merges additively.
- Trading behaviour / playbook / cite logic unchanged.

---

## Smoke quantification (outcome-blind)

Fixture sample n=4 (`bullish-wait`, conflict, `bearish-wait`, `neutral-no-trade`) via
`scripts/test-reasoning-stamp-features.ts` — **not** full Y=1500.

| Metric | Value |
|--------|------:|
| Reasoning rows preserved | **40** (10 playbook × 4) |
| PRIMARY | **17** |
| SUPPORTING | **4** |
| NONE | **19** |
| usedInDecision but absent from citedConcepts | **4** (all SUPPORTING; **4/4** stamps) |
| Stamps with ≥2 rows sharing `evidenceSource` | **4/4** (4 source-pair counts) |

Previously hidden used evidence: SUPPORTING rows were used in the decision but invisible to
`citedConcepts∋…` screens. Shared-source duplication reported only — not fixed.

---

## Files

- `lib/reasoning-stamp-features.ts`
- `scripts/test-reasoning-stamp-features.ts`
- `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts` (featuresAtT wiring)
- Schema note: `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500.schema.md`

Related audit: [`karen-reasoning-chain-info-loss-audit.md`](./karen-reasoning-chain-info-loss-audit.md)

---

## Governance

SELECTIVE_UNLOCK **PARKED** · C4_SINGLE_CHANGE **NOT_DEFINED** · VAL/HOLDOUT **UNTOUCHED**
