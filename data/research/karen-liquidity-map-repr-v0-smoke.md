# KAREN — liquidity map representation smoke (`liquidity_map_repr_v0`)

**DATE:** 2026-08-16  
**SCOPE:** Small PIT-safe coverage (n=8) — not full Y=1500.  
**OUTCOMES:** NO · **UNLOCK:** PARKED · **VAL/HOLDOUT:** untouched  

## Verdict

**PASS** — structures observed across smoke asOfs: NY-pre, ORG, gaps(NDOG/NWOG/ORG_band), REH/REL(obs), relativeEqualPools, EQH/EQL

| Structure | Appeared in smoke? |
|-----------|-------------------|
| NY-pre H/L | YES |
| ORG | YES |
| Gaps (NDOG/NWOG/ORG band) | YES |
| REH/REL (`obs.reh_rel`) | YES |
| relativeEqualPools | YES |
| EQH/EQL (research areas) | YES |

## Notes

- Stamp helper: `lib/liquidity-map-stamp-features.ts`
- Keeps `liquidityLevels` + `liquidity_repr_v1`
- Additive pools only; detectors unchanged
- EQH/EQL stamped only when `detectEqhEqlLiquidity` returns areas at asOf (not invented)

## Per-asOf (truncated)

- `2023-10-02T00:00:00.000Z` — pools=27 levels=9 · ny_pre=true org=false gaps=true reh=true eqh=true
- `2023-10-02T06:00:00.000Z` — pools=27 levels=9 · ny_pre=true org=false gaps=true reh=true eqh=true
- `2023-10-02T12:10:00.000Z` — pools=27 levels=9 · ny_pre=true org=false gaps=true reh=true eqh=true
- `2023-10-03T01:30:00.000Z` — pools=28 levels=9 · ny_pre=true org=false gaps=true reh=true eqh=true
- `2023-10-03T07:40:00.000Z` — pools=25 levels=9 · ny_pre=true org=false gaps=true reh=true eqh=true
- `2023-10-03T20:00:00.000Z` — pools=33 levels=9 · ny_pre=true org=true gaps=true reh=true eqh=true
- `2023-10-04T03:10:00.000Z` — pools=26 levels=9 · ny_pre=true org=true gaps=true reh=true eqh=false
- `2023-10-04T15:30:00.000Z` — pools=30 levels=9 · ny_pre=true org=true gaps=true reh=true eqh=false

JSON: `C:/Users/adamg/Projects/desk-copilot/data/karen-decision-validation/acquisition/reports/liquidity-map-repr-v0-smoke-latest.json`
