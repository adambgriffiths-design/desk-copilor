=== HONEST BASELINE BACKTEST ===

## Dataset
- **ID:** synthetic-ny-am
- **Label:** test
- **Symbol:** MNQ=F
- **Date range:** 2026-08-12T13:30:00.000Z → 2026-08-12T14:09:00.000Z
- **Bars:** 40
- **Dataset version:** n/a (fixture)

## Data quality (interpret before performance)
- **Integrity:** VALID
- **Total candles:** 40
- **Missing minutes:** 0
- **Duplicates:** 0
- **Invalid OHLC:** 0
- **Session boundary gaps:** 0
- **Partial first/last:** false / false
- **Ambiguous handling:** test

## Strategy definition
- **Version:** `phase1-decision-pipeline@spec-1.0.0+pipeline-1.0.0`
- **Rules:** Phase 1 observation → interpretation → decision → execution scaffold
- **Traded verdicts:** LONG, SHORT with entryStatus ACTIVE
- **Entry / stop / target:** scaffold anchor / decision invalidation / target1

### Documented ambiguities (not guessed)

## Statistics — FULL period
- Total setups: 0
- Wins / losses / ambiguous: 0 / 0 / 0
- Win rate: 0.0%
- Avg R: 0.000 | Median R: 0.000
- Expectancy: 0.000 R
- Profit factor: 0.00
- Max drawdown (R): 0.00
- Avg MFE / MAE: 0.00 / 0.00
- Avg holding: 0.0 bars (0.0 min)
- Max consecutive W/L: 0 / 0

## Statistics — TRAIN (in-sample)
- Window:  → 
- Total setups: 0
- Wins / losses / ambiguous: 0 / 0 / 0
- Win rate: 0.0%
- Avg R: 0.000 | Median R: 0.000
- Expectancy: 0.000 R
- Profit factor: 0.00
- Max drawdown (R): 0.00
- Avg MFE / MAE: 0.00 / 0.00
- Avg holding: 0.0 bars (0.0 min)
- Max consecutive W/L: 0 / 0

## OUT-OF-SAMPLE TEST period
- Window:  → 
- Total setups: 0
- Wins / losses / ambiguous: 0 / 0 / 0
- Win rate: 0.0%
- Avg R: 0.000 | Median R: 0.000
- Expectancy: 0.000 R
- Profit factor: 0.00
- Max drawdown (R): 0.00
- Avg MFE / MAE: 0.00 / 0.00
- Avg holding: 0.0 bars (0.0 min)
- Max consecutive W/L: 0 / 0

### Long / short (OOS)
_No setups in bucket._

### By timeframe (OOS)
_No setups in bucket._

### By setup type (OOS)
_No setups in bucket._

### By session (OOS)
_No setups in bucket._

### By month (OOS)
_No setups in bucket._

### By weekday (OOS)
_No setups in bucket._

## Validation
- **LOOK-AHEAD TEST:** PASS — test
- **REPRODUCIBILITY:** PASS — test
- **Fingerprint:** `test`
- **Git revision:** unavailable

## Interpretation
**INSUFFICIENT DATA**

_Internal research only — no optimization, no prod Karen changes._