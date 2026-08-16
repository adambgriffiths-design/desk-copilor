# KAREN — Lane 1 restamp note (typed contradictionItems)

**DATE:** 2026-08-16  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH

## Method used

**Enrichment restamp** (not full DV Y=1500 re-run):

`node --import tsx scripts/karen-dv-enrich-contradiction-items-stamps.ts`

### Why not full DV regenerate

- Root `lib/decision-validation` is incomplete (DV harness lives under `.tmp/karen-final-integration/`).
- DV records never carried full obs+interp on the stamp path — only EvidenceAtT + ReasoningStructureAtT.
- Typed fields are a **deterministic function** of those already-stamped asOf fields via `stampContradictionItemsFromDvEvidence` — identical to what `featuresAtT` now emits in `karen-dv-force-wait-shadow-stamps-y1500.ts`.

Therefore enriching the existing Y=1500 dump is **typed-representation parity** with a full regenerate for `contradictionItems`.

## What changed on disk

| Artifact | Change |
|----------|--------|
| `force-wait-shadow-stamps-y1500-latest.json` | Additive `contradictionItems` + `contradictionRepresentationVersion` on every stamp |
| `force-wait-shadow-stamps-y1500-latest.jsonl` | Same |
| `force-wait-shadow-stamps-y1500.schema.md` | Documents typed fields |
| Pre-enrich backup | `force-wait-shadow-stamps-y1500-pre-enrich-*.json` |

Legacy `contradictions[]` / `contradictionCount` / `c1Shadow` / baseline verdicts: **unchanged** (provenance PASS).

## Stamp pipeline instrumentation

Future full regenerates will emit typed fields natively from `featuresAtT` in `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts` (mirrored under `.tmp/karen-final-integration/`).

**L1_RESTAMP:** PASS (enrich path; typed parity)
