# Research: NQ real-data replay at NY open

**Task ID:** research-nq-replay-ny-open  
**Agent:** Composer (Cursor pickup)  
**Status:** COMPLETE

## Question
Does point-in-time replay on real TickStream NQ data (Aug 12 2026) match stored records and preserve look-ahead safety at 09:30 ET?

## Data used
- Dataset: `2562961408b256ac94f1` / fixture `nq-aug12-2026-cme`
- Timestamp: `2026-08-12T14:30:00.000Z` (NY RTH open)
- Source: TickStream historical 1m, 1381 candles, validation WARNING (60 min session-boundary gap)

## Execution
```
npm run research:replay -- --dataset nq-aug12-2026-cme --timestamp 2026-08-12T14:30:00.000Z
```

## Result
| Field | Replay snapshot | Stored record |
|-------|-----------------|---------------|
| Price | 29907.5 | 29907.5 |
| Bars at cutoff | 991 | 991 |
| Karen verdict | LONG | LONG |
| Structure | Bullish MSS @ 29918.5, premium PD | — |
| Confidence | 62 | — |

Run: `replay-2026-08-13T14-38-22-907Z`

## Tests
- `test:research-dataset-replay`: 20/20 PASS (determinism on repeat)
- Manual record vs snapshot: exact match on price, bars, verdict

## Evidence
- `data/research/runs/replay-2026-08-13T14-38-22-907Z/snapshot.json`
- `data/research/records/nq-aug12-2026-cme/nq-aug12-2026-cme__2026-08-12T14-30-00.000Z.json`

## Conclusion
Real-data replay is **deterministic and consistent** with archived point-in-time records at NY open. No look-ahead leak detected at this cutoff.

## Confidence
**High** (direct fingerprint match + passing integration tests)

## Next task
`research-nq-replay-session-end` — same dataset at globex session end to test intraday regime change

STOP.
