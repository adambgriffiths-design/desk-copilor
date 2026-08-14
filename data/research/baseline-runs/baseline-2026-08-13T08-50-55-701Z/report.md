=== HONEST BASELINE BACKTEST ===

## Dataset
- **ID:** synthetic-ny-am
- **Label:** Synthetic NY AM Mini (Aug 12 2026)
- **Symbol:** MNQ=F
- **Date range:** 2026-08-12T13:30:00.000Z → 2026-08-12T15:29:00.000Z
- **Bars:** 120
- **Dataset version:** n/a (fixture)

## Data quality (interpret before performance)
- **Integrity:** VALID
- **Total candles:** 120
- **Missing minutes:** 0
- **Duplicates:** 0
- **Invalid OHLC:** 0
- **Session boundary gaps:** 0
- **Partial first/last:** false / false
- **Ambiguous handling:** Intrabar stop+target on same candle → AMBIGUOUS (no open-proximity heuristic in baseline outcome.ts)

## Strategy definition
- **Version:** `phase1-decision-pipeline@spec-1.0.0+pipeline-1.0.0`
- **Rules:** Phase 1 observation → interpretation → decision → execution scaffold
- **Traded verdicts:** LONG, SHORT with entryStatus ACTIVE
- **Entry / stop / target:** scaffold anchor / decision invalidation / target1

### Documented ambiguities (not guessed)
- Stop uses decision-layer invalidation (sweep/MSS ±5) per ICT spec canonical example; execution-plan labels invalidation as thesis-only, not a stop.
- Entry fill at execution-scaffold anchor (long=zone top, short=zone bottom) when verdict LONG|SHORT and entryStatus ACTIVE only.
- WAIT and NO_TRADE verdicts produce no setup — not counted as missed trades.
- MarketState for observation uses sliced 1m OHLC as chart candles; no TradingView export — displacement may read unknown on thin history.
- Target 1 from execution scaffold (nearest PD/session level ≥45pt from anchor); not interpretation.target (always null in Phase 1).
- 1m timeframe only; HTF bias from existing buildMarketContextAt — Yahoo/CME daily boundary conflicts documented in MARKET_STRUCTURE_DATA_REQUIREMENTS.md.

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
- Window: 2026-08-12T13:30:00.000Z → 2026-08-12T14:53:00.000Z
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
- Window: 2026-08-12T14:54:00.000Z → 2026-08-12T15:29:00.000Z
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
- **LOOK-AHEAD TEST:** PASS — historical decisions unchanged when future candle poisoned
- **REPRODUCIBILITY:** PASS — identical setup outcomes on repeat run
- **Fingerprint:** `9a9966b41a1b8e34616376f8b262d1f870b20fd85c8090e9a06e19e5443608d0`
- **Git revision:** 018310a672e9274c8e3c537d04d085b39658fa14

## Interpretation
**INSUFFICIENT DATA — zero decisive setups in out-of-sample window; cannot assess edge.**

_Internal research only — no optimization, no prod Karen changes._