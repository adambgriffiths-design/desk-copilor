# KAREN — does contradiction type add info beyond count?

**measurement_id:** `m_contradiction_type_adds_info_beyond_count_v0`  
**DATE:** 2026-08-16  
**RUN:** executed (outcome-blind)  
**TYPE_VS_COUNT_RICHER:** **YES**  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **OUTCOMES_INSPECTED:** NO

## Question

Does representing contradiction **type** add information beyond `contradictionCount`?

## Plan (predeclared) — executed

Entropy / conditional entropy / distinct types under each count bin / co-occurrence. **No outcomes.**

## Results

| Metric | Value |
|--------|------:|
| H(count bin) | 1.0887 |
| H(type combo) | 1.4435 |
| H(count, type) | 1.4435 |
| H(type \| count) | 0.3549 |
| I(type; count) | 1.0887 |
| Distinct types under cc=1 | 3 |

### Types under each count bin

**cc=0**
- NONE: 620

**cc=1**
- STRUCTURE_VS_BIAS_BULLISH_STRUCT: 350
- STRUCTURE_VS_BIAS_BEARISH_STRUCT: 72
- HTF_BIAS_MISALIGNED: 13

**cc=2**
- HTF_BIAS_MISALIGNED+STRUCTURE_VS_BIAS_BEARISH_STRUCT: 11
- HTF_BIAS_MISALIGNED+STRUCTURE_VS_BIAS_BULLISH_STRUCT: 8

## Verdict

**TYPE_VS_COUNT_RICHER = YES**  
Criterion: H(type|count) > 0.01 **or** >1 distinct taxonomy cell under cc=1.

## Paths

- `data/karen-decision-validation/acquisition/reports/contradiction-type-vs-count-latest.json`
- Frequency companion: `karen-contradiction-type-measurement.md`
