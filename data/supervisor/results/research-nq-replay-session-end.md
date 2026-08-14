# Research: NQ real-data replay at session end

**Task ID:** research-nq-replay-session-end  
**Agent:** Composer (Cursor pickup)  
**Status:** COMPLETE

## Question
What does Karen's deterministic pipeline produce at the end of the Aug 12 globex window, and does it differ materially from NY open?

## Data used
- Dataset: `nq-aug12-2026-cme` (2562961408b256ac94f1)
- Timestamp: `2026-08-12T20:59:00.000Z` (last bar before session-boundary gap)
- 1380 bars visible at cutoff

## Execution
```
npm run research:replay -- --dataset nq-aug12-2026-cme --timestamp "2026-08-12T20:59:00.000Z"
```

## Result
| Field | NY open (14:30Z) | Session end (20:59Z) |
|-------|------------------|----------------------|
| Price | 29907.5 | 29805.75 |
| Verdict | **LONG** | **SHORT** |
| Bias | bullish | bearish |
| MSS | bullish @ 29918.5 | bearish @ 29812.8 |
| PD zone | premium | equilibrium |
| Confidence | 62 | (see snapshot) |

Run: `replay-2026-08-13T14-47-14-461Z`

## Tests
- Record cross-check: price 29805.75, 1380 bars matches stored record `nq-aug12-2026-cme__2026-08-12T20-59-00.000Z.json`
- Invalid ISO (`20-59` hyphens) incorrectly snaps to dataset start — **operator/CLI validation gap**, not data bug

## Evidence
- Opposite directional verdicts same session day on real data
- Structure shifted from bullish MSS/premium to bearish MSS/equilibrium

## Conclusion
Karen deterministic pipeline **flips LONG→SHORT** intraday on Aug 12 NQ. This is expected MSS/PD sensitivity, not leakage — but it weakens any single-snapshot edge claim. Needs baseline setup counts before strategy conclusions.

## Confidence
**Medium-high** on replay accuracy; **low** on tradable edge (direction flip intraday)

## Next task
`research-nq-baseline-full` — honest baseline backtest on full real dataset for setup counts, look-ahead test, reproducibility

STOP.
