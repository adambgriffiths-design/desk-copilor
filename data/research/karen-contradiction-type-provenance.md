# KAREN — contradiction type stamp provenance

**DATE:** 2026-08-16  
**VERIFICATION:** **PASS**  
**REPRESENTATION:** `contradiction_repr_v1`  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH

## Purpose

Prove typed `contradictionItems` are deterministic from asOf-available DV evidence fields and additive (legacy contradictions / count / c1Shadow / baselineVerdict unchanged).

## Checks

| Check | Result | Detail |
|-------|--------|--------|
| deterministic_same_input | PASS | n=1 |
| polarity_bullish_struct | PASS |  |
| polarity_bearish_struct | PASS |  |
| polarity_none_when_aligned | PASS |  |
| schema_keys_present_on_items | PASS |  |
| engine_emitable_ids_inventory_nonempty | PASS | structure_vs_bias,htf_misaligned,data_quality,unknown_market_structure,unknown_displacement,unknown_fvg_status,both_cases_supported,interp_contradiction |
| dump_has_stamps | PASS | n=1075 |
| typed_fields_present_on_all_stamps | PASS | missing=0 |
| stamped_items_match_recompute | PASS | mismatch=0 |
| legacy_contradictions_intact | PASS | mismatch=0 |
| string_to_type_agreement | PASS | disagree=0 unmapped=0 |
| polarity_matches_structure_bias | PASS | disagree=0 |
| c1Shadow_present | PASS | missing=0 |
| representation_version | PASS |  |
| additive_only_legacy_byte_equal | PASS |  |
| additive_only_c1Shadow_byte_equal | PASS |  |
| additive_only_baselineVerdict_equal | PASS |  |

## Reconstruction note

DV `DecisionValidationRecordV0` does not carry full obs+interp. Stamp path uses `stampContradictionItemsFromDvEvidence` mirroring `buildContradictionReport` predicates from `marketStructure`, `tradeableBias`, `displacement`, `fvgStatus`, support flags, and contradiction strings. `htfAligned` / `dataQuality` are not on EvidenceAtT.

## Paths

- Report JSON: `data/karen-decision-validation/acquisition/reports/contradiction-type-provenance-latest.json`
- Stamp dump: `force-wait-shadow-stamps-y1500-latest.json`

## Non-goals

No unlock, ALS, score, outcomes, or decision-behavior change.
