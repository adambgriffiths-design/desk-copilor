# Karen Mentor Quality Evaluation — NQ Aug 12 2026

**Task ID:** research-mentor-quality-nq-aug12
**Dataset:** `nq-aug12-2026-cme` (1381 bars, SESSION_BOUNDARY_GAP WARNING acceptable)
**Path:** Phase 1 pipeline via `buildKarenReplayResponse` (NOT deterministic)
**Scope:** Mentor reasoning quality — NOT signal frequency, NOT edge, NOT infrastructure

---

## Summary

| Metric | Value |
|--------|-------|
| Historical cases | 13 |
| Average rubric score | 20/20 (100%) |
| mentorEvalReady pass | 13/13 |
| Confidence in evaluation | **MODERATE** |

Single-session sample — sufficient for methodology calibration, insufficient for multi-day mentor drift claims.

---

## Cutoff selection rationale

Cutoffs span CME Globex session phases rather than uniform bar sampling:

| # | Cutoff (UTC) | Label | Rationale |
|---|--------------|-------|-----------|
| 1 | 2026-08-11T22:45:00.000Z | Regime shift → range | Adaptive candidate on regime proxy change (no outcome filter) |
| 2 | 2026-08-12T02:00:00.000Z | Overnight mid | Low-liquidity overnight |
| 3 | 2026-08-12T06:00:00.000Z | Early morning | Pre-London globex |
| 4 | 2026-08-12T11:00:00.000Z | Pre-market | Pre-RTH PD context |
| 5 | 2026-08-12T13:00:00.000Z | Pre-NY open | Final pre-open |
| 6 | 2026-08-12T14:30:00.000Z | NY open | Canonical NY RTH anchor |
| 7 | 2026-08-12T15:30:00.000Z | Post-open hour | First hour displacement |
| 8 | 2026-08-12T16:30:00.000Z | Mid-morning RTH | Trend vs range |
| 9 | 2026-08-12T17:30:00.000Z | Lunch | Liquidity dip |
| 10 | 2026-08-12T19:00:00.000Z | PM session | Afternoon continuation |
| 11 | 2026-08-12T20:00:00.000Z | Regime shift → volatile | Adaptive candidate on regime proxy change (no outcome filter) |
| 12 | 2026-08-12T20:59:00.000Z | Session end | Last RTH minute |
| 13 | 2026-08-12T22:00:00.000Z | Globex open | CME session open — minimal RTH context |

---

## Score by criterion

| Criterion | Avg (0–2) |
|-----------|-----------|
| Sufficient observable info cited at cutoff | 2 |
| Structure evidence aligns with observation | 2 |
| Dominant vs conflicting evidence acknowledged | 2 |
| Uncertainty expressed when evidence mixed or incomplete | 2 |
| Actionable invalidation when directional | 2 |
| No future bar or outcome references | 2 |
| No forced LONG/SHORT when evidence insufficient | 2 |
| Verdict consistent with cited evidence | 2 |
| Entry idea + levels useful to a trader | 2 |
| Honest handling of missing/stale data | 2 |

### Strongest mentor behaviours

- **Sufficient observable info cited at cutoff** — avg 2/2
- **Structure evidence aligns with observation** — avg 2/2
- **Dominant vs conflicting evidence acknowledged** — avg 2/2

### Weakest mentor behaviours

- **Sufficient observable info cited at cutoff** — avg 2/2
- **Structure evidence aligns with observation** — avg 2/2
- **Dominant vs conflicting evidence acknowledged** — avg 2/2

---

## Falsification audit

| Flag | Cases detected |
|------|----------------|
| hindsight_leakage | 0/13 |
| overconfidence | 0/13 |
| forced_signal | 0/13 |
| cherry_pick | 0/13 |
| unavailable_info_cited | 0/13 |

**Post-hoc market audit (NOT scored):** Later candles used only to check invalidation breach within 60 bars after directional calls.

- PM session: Invalidation held over next 60 bars

---

## Uncertainty, structure, invalidation quality

| Cutoff | Verdict | Confidence | Structure | Long/Short supported | Uncertainty score | Invalidation score |
|--------|---------|------------|-----------|----------------------|-------------------|-------------------|
| Regime shift → range | WAIT | 45 | bearish (2/2) | true/true | 2/2 | 2/2 |
| Overnight mid | WAIT | 45 | bearish (2/2) | false/true | 2/2 | 2/2 |
| Early morning | WAIT | 45 | bullish (2/2) | true/true | 2/2 | 2/2 |
| Pre-market | WAIT | 45 | bullish (2/2) | true/true | 2/2 | 2/2 |
| Pre-NY open | WAIT | 45 | bullish (2/2) | true/true | 2/2 | 2/2 |
| NY open | WAIT | 45 | bullish (2/2) | true/true | 2/2 | 2/2 |
| Post-open hour | WAIT | 45 | bearish (2/2) | true/true | 2/2 | 2/2 |
| Mid-morning RTH | WAIT | 45 | bullish (2/2) | true/false | 2/2 | 2/2 |
| Lunch | WAIT | 45 | bullish (2/2) | true/false | 2/2 | 2/2 |
| PM session | SHORT | 65 | bearish (2/2) | false/true | 2/2 | 2/2 |
| Regime shift → volatile | WAIT | 45 | bearish (2/2) | false/true | 2/2 | 2/2 |
| Session end | WAIT | 45 | bearish (2/2) | true/true | 2/2 | 2/2 |
| Globex open | WAIT | 45 | bullish (2/2) | true/false | 2/2 | 2/2 |

---

## Per-case results

### Regime shift → range — 2026-08-11T22:45:00.000Z

- **Price:** 29634.8 | **Bars at T:** 46 | **data_quality:** good
- **Verdict:** WAIT — Conflicting cases — wait for clarity. 
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bearish MSS — body close below swing low 29642.25 at 18:45
- **Entry idea:** 29645.50–29650.00
- **Summary:** Mentor-quality pass (100%)

### Overnight mid — 2026-08-12T02:00:00.000Z

- **Price:** 29663.8 | **Bars at T:** 241 | **data_quality:** good
- **Verdict:** WAIT — SHORT bias — wait for retrace into 29663.50–29673.75. This resembles bearish structure continuation because PDH liquidity at 29663.75 was swept. PDL liquidity at 29663.75 was swept. PDC liquidity at 29663.75 was swept. No impulsive displacement detected in lookback. A bullish FVG exists between 29663.50–29673.75. I would consider SHORT because Observed market structure is bearish; Liquidity sweep observed at PDH, PDL, PDC. I rejected LONG because Bearish structure opposes bullish tradeable bias.
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bearish MSS — body close below swing low 29664.50 at 21:59
- **Entry idea:** 29663.50–29673.75
- **Summary:** Mentor-quality pass (100%)

### Early morning — 2026-08-12T06:00:00.000Z

- **Price:** 29719.8 | **Bars at T:** 481 | **data_quality:** good
- **Verdict:** WAIT — Conflicting cases — wait for clarity. 
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bullish MSS — body close above swing high 29718.00 at 02:00
- **Entry idea:** 29703.50–29706.75
- **Summary:** Mentor-quality pass (100%)

### Pre-market — 2026-08-12T11:00:00.000Z

- **Price:** 29828.0 | **Bars at T:** 781 | **data_quality:** good
- **Verdict:** WAIT — Conflicting cases — wait for clarity. 
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bullish MSS — body close above swing high 29819.00 at 07:00
- **Entry idea:** 29827.75–29835.50
- **Summary:** Mentor-quality pass (100%)

### Pre-NY open — 2026-08-12T13:00:00.000Z

- **Price:** 29920.8 | **Bars at T:** 901 | **data_quality:** good
- **Verdict:** WAIT — Conflicting cases — wait for clarity. 
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bullish MSS — body close above swing high 29916.00 at 08:54
- **Entry idea:** 29887.00–29893.75
- **Summary:** Mentor-quality pass (100%)

### NY open — 2026-08-12T14:30:00.000Z

- **Price:** 29907.5 | **Bars at T:** 991 | **data_quality:** good
- **Verdict:** WAIT — Conflicting cases — wait for clarity. 
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bullish MSS — body close above swing high 29918.50 at 10:27
- **Entry idea:** 29927.50–29931.25
- **Summary:** Mentor-quality pass (100%)

### Post-open hour — 2026-08-12T15:30:00.000Z

- **Price:** 29864.3 | **Bars at T:** 1051 | **data_quality:** good
- **Verdict:** WAIT — Conflicting cases — wait for clarity. Higher timeframe biases not aligned
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bearish MSS — body close below swing low 29848.75 at 11:25
- **Entry idea:** 29857.50–29861.50
- **Summary:** Mentor-quality pass (100%)

### Mid-morning RTH — 2026-08-12T16:30:00.000Z

- **Price:** 29875.0 | **Bars at T:** 1111 | **data_quality:** good
- **Verdict:** WAIT — LONG bias — wait for retrace into 29867.50–29871.00. This resembles bullish structure continuation because PDH liquidity at 30001.75 was swept. PDL liquidity at 29624.50 was swept. PDC liquidity at 29805.75 was swept. No impulsive displacement detected in lookback. A bullish FVG exists between 29867.50–29871.00. I would consider LONG because HTF bias bullish (bias_stack.tradeable_bias=bullish); Observed market structure is bullish; Liquidity sweep observed at PDH, PDL, PDC. I rejected SHORT because Higher timeframe biases not aligned.
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bullish MSS — body close above swing high 29877.75 at 12:26
- **Entry idea:** 29867.50–29871.00
- **Summary:** Mentor-quality pass (100%)

### Lunch — 2026-08-12T17:30:00.000Z

- **Price:** 29906.0 | **Bars at T:** 1171 | **data_quality:** good
- **Verdict:** WAIT — LONG bias — wait for retrace into 29907.25–29913.75. This resembles bullish structure continuation because PDH liquidity at 30001.75 was swept. PDL liquidity at 29624.50 was swept. PDC liquidity at 29805.75 was swept. No impulsive displacement detected in lookback. A bullish FVG exists between 29907.25–29913.75. I would consider LONG because HTF bias bullish (bias_stack.tradeable_bias=bullish); Observed market structure is bullish; Liquidity sweep observed at PDH, PDL, PDC. I rejected SHORT because insufficient bearish confluence.
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bullish MSS — body close above swing high 29909.50 at 13:28
- **Entry idea:** 29907.25–29913.75
- **Summary:** Mentor-quality pass (100%)

### PM session — 2026-08-12T19:00:00.000Z

- **Price:** 29901.0 | **Bars at T:** 1261 | **data_quality:** good
- **Verdict:** SHORT — SHORT — provided price retraces into 29902.25–29908.75. Invalidation: 30006.75.
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bearish MSS — body close below swing low 29909.00 at 14:58
- **Entry idea:** 29902.25–29908.75
- **Summary:** Mentor-quality pass (100%)

### Regime shift → volatile — 2026-08-12T20:00:00.000Z

- **Price:** 29862.8 | **Bars at T:** 1321 | **data_quality:** good
- **Verdict:** WAIT — SHORT bias — wait for retrace into 29837.75–29849.00. This resembles bearish structure continuation because PDH liquidity at 30001.75 was swept. PDL liquidity at 29624.50 was swept. PDC liquidity at 29805.75 was swept. No impulsive displacement detected in lookback. A bearish FVG exists between 29837.75–29849.00. I would consider SHORT because Observed market structure is bearish; Liquidity sweep observed at PDH, PDL, PDC; Bearish FVG present in observation. I rejected LONG because Bearish structure opposes bullish tradeable bias; Higher timeframe biases not aligned.
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bearish MSS — body close below swing low 29839.50 at 15:56
- **Entry idea:** 29837.75–29849.00
- **Summary:** Mentor-quality pass (100%)

### Session end — 2026-08-12T20:59:00.000Z

- **Price:** 29805.8 | **Bars at T:** 1380 | **data_quality:** good
- **Verdict:** WAIT — Conflicting cases — wait for clarity. 
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bearish MSS — body close below swing low 29812.75 at 16:59
- **Entry idea:** 29815.75–29819.00
- **Summary:** Mentor-quality pass (100%)

### Globex open — 2026-08-12T22:00:00.000Z

- **Price:** 29829.3 | **Bars at T:** 1381 | **data_quality:** good
- **Verdict:** WAIT — LONG bias — wait for retrace into 29811.50–29821.25. This resembles Displacement + FVG retrace entry because PDH liquidity at 30001.75 was swept. PDL liquidity at 29624.50 was swept. PDC liquidity at 29805.75 was swept. Price displaced upward by 4.25 points. A bullish FVG exists between 29811.50–29821.25. I would consider LONG because Observed market structure is bullish; Liquidity sweep observed at PDH, PDL, PDC; Displacement present after sweep. I rejected SHORT because Bullish structure opposes bearish tradeable bias.
- **Score:** 20/20 (100%) | mentorEvalReady: true
- **Structure evidence:** Bullish MSS — body close above swing high 29823.00 at 18:00
- **Entry idea:** 29811.50–29821.25
- **Summary:** Mentor-quality pass (100%)

---

## Representative examples

### Good mentor behaviour

**Regime shift → range (2026-08-11T22:45:00.000Z)** — 100%
- Verdict: WAIT with confidence 45
- 29645.50–29650.00
- Mentor-quality pass (100%)

**Overnight mid (2026-08-12T02:00:00.000Z)** — 100%
- Verdict: WAIT with confidence 45
- 29663.50–29673.75
- Mentor-quality pass (100%)

No cases scored below 70% or triggered falsification flags.

---

## Interpretation

Analysis quality is separated from eventual market outcome. WAIT/NO_TRADE verdicts score well when reasoning is honest and uncertainty is expressed.

- Pipeline source on all 13 cases — deterministic path not used.
- All cutoffs: data_quality=good (research_bars adapter working).
- Dominant verdict pattern: WAIT, SHORT.

**NOT measured:** Whether WAIT was eventually correct. Price direction is diagnostic only in post-hoc audit.

---

*Generated by scripts/research-run-mentor-eval.ts*