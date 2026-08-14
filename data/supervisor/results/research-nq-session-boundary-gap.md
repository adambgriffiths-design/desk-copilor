# Research: CME session boundary gap on NQ Aug 12

**Task ID:** research-nq-session-boundary-gap  
**Agent:** Composer  
**Status:** COMPLETE

## Question
Is the 60-minute missing-minute WARNING on real NQ data a data defect or expected CME globex maintenance?

## Data used
- Dataset `2562961408b256ac94f1` / `nq-aug12-2026-cme`
- 1381 candles, `start_timestamp` 1786485600 → `end_timestamp` 1786572000
- Session definition: `CME_GLOBEX_18:00_ET`

## Evidence
Validation (`data/research-fixtures/nq-aug12-2026-cme/validation.json`):
- **status:** WARNING (not INVALID)
- **missingMinuteCount:** 60
- **duplicateCount:** 0, **invalidOhlcCount:** 0
- **Issue:** `SESSION_BOUNDARY_GAP` at timestamp 1786572000 — "Gap of 60 minute(s) across CME session boundary (2026-08-12 → 2026-08-13)"

Validator logic (`lib/research/dataset/validate.ts`): gaps across session boundaries are classified separately from intraday `MISSING_MINUTES`.

Last bar in dataset: `2026-08-12T20:59:00.000Z` — no bars after until next globex session.

## Conclusion
The gap is **expected CME daily maintenance** at the globex session roll (18:00 ET boundary), not random data corruption. Safe for point-in-time replay **within** the loaded window; do not extrapolate past `end_timestamp`.

**Data problem vs strategy problem:** Data handling is correct (WARNING not INVALID). Missing hour must not be treated as tradable time.

## Confidence
**High** for classification; **medium** that 60 min exactly matches CME maintenance (not independently verified against exchange calendar).

## Next task
`research-nq-baseline-ny-oos` — baseline backtest with test window from NY open (in progress)

STOP.
