# Karen liquidity representation — frequency (outcome-blind)

**DATE:** 2026-08-16  
**VERSION:** `liquidity_repr_v1`  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH  
**OUTCOMES:** NO · **UNLOCK:** PARKED  

**PARTIAL RUN:** n=12 stamps (smoke/limit) — not full Y=1500.


## Coverage

| Metric | Value |
|--------|------:|
| Stamps processed | 12 |
| Buy-side level rows | 48 |
| Sell-side level rows | 48 |
| Both sides on same stamp | 12 |
| Stamps with formedAt | 12 |
| Level rows with formedAt (%) | 100 |
| PD rows with formedAt (%) | 100 (36/36) |
| Session (asia/london/ny_rth) rows with formedAt (%) | 100 (72/72) |
| Stamps with qualifyingTick* | 11 |
| Stamps with candleId | 11 |
| Stamps with HTF stack (daily/m15/m5/aligned) | 12 (100%) |

## Status counts (level rows)

- `UNTOUCHED`: 73
- `CLOSED_BEYOND`: 22
- `TOUCHED`: 11
- `BREACHED`: 2

## Richness vs `sweepPresent` / vs v0 (no timing)

| sweepPresent | n | distinct v0 fingerprints | distinct v1 (+timing) | timing adds diversity | stamps with timing fields |
|--------------|--:|-------------------------:|----------------------:|:---------------------:|--------------------------:|
| true | 5 | 5 | 5 | no | 5 |
| false | 7 | 6 | 7 | YES | 7 |
| null | 0 | 0 | 0 | no | 0 |

Global: v0 distinct=11, v1 distinct=12, richerThanSweepPresent=true.

JSON: `C:/Users/adamg/Projects/desk-copilot/data/karen-decision-validation/acquisition/reports/liquidity-representation-freq-partial-2026-08-16T02-25-01-713Z.json`
