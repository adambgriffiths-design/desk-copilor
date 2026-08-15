# DEV actionable performance audit (LONG/SHORT)

**EDGE_CLAIM:** NONE
**HOLDOUT:** PROTECTED — not accessed
**LOGIC ALTERED:** No
**TIME:** 2026-08-15T18:06:38.954Z
**Window:** archive-carve-v1 DEVELOPMENT 2023-10-02 → 2025-05-31
**Method:** frozen baseline-v2 · even · cadence 10 · Y≈1500 · horizon 30m

## Counts

| N actionable | LONG | SHORT | Y eval | WAIT | NO_TRADE |
|-------------:|-----:|------:|-------:|-----:|---------:|
| **71** | 39 | 32 | 1500 | 1188 | 239 |

## Target vs invalidation

| Slice | n | T-before-inv | Inv-before-T | scored T/Inv |
|-------|--:|-------------:|-------------:|-------------:|
| ALL | 71 | 19.5% | 80.5% | 41 |
| LONG | 39 | 23.8% | 76.2% | 21 |
| SHORT | 32 | 15.0% | 85.0% | 20 |

## MFE / MAE / R

R = excursion / |entry−invalidation| when invalidation parses (70/71 actionables).

| Slice | med MFE | med MAE | med MFE_R | med MAE_R | mean proxyR |
|-------|--------:|--------:|----------:|----------:|------------:|
| ALL | 12.000 | 9.500 | 1.568 | 1.053 | -0.330 |
| LONG | 11.750 | 10.750 | 1.268 | 0.962 | -0.304 |
| SHORT | 17.375 | 9.000 | 2.043 | 1.082 | -0.363 |

## Expectancy proxy (heuristic)

HEURISTIC expectancy proxy (not PnL, not edge): mean(proxyR) where proxyR = +mfeR if target-before-inv, −maeR if inv-before-target, else (mfeR−maeR) when both R defined; R = excursion/|entry−invalidation| when inv parses. Horizon=30m. DEV only.

- mean proxyR (all): **-0.330**
- median proxyR (all): **-0.611**
- mean proxyR LONG / SHORT: **-0.304** / **-0.363**
- n with proxyR: 70

## Session / time breakdown (actionables)

### Session

| Session | n | med MFE | med MAE | T-before rate | mean proxyR |
|---------|--:|--------:|--------:|--------------:|------------:|
| OTHER | 53 | 11.250 | 9.000 | 23.3% | 0.019 |
| NY_LUNCH | 8 | 23.625 | 16.000 | 20.0% | 0.454 |
| NY_AM | 5 | 26.500 | 34.750 | 0.0% | -1.269 |
| NY_PM | 5 | 33.250 | 16.000 | 0.0% | -4.274 |

### Time bucket ET

| Time bucket | n | med MFE | med MAE | T-before rate | mean proxyR |
|------------|--:|--------:|--------:|--------------:|------------:|
| other | 53 | 11.250 | 9.000 | 23.3% | 0.019 |
| 1130-1330_lunch | 8 | 23.625 | 16.000 | 20.0% | 0.454 |
| 1000-1130 | 5 | 26.500 | 34.750 | 0.0% | -1.269 |
| 1330-1600_afternoon | 5 | 33.250 | 16.000 | 0.0% | -4.274 |

## Best / worst decisions (evidence @ t frozen; outcomes post-freeze)

### Best by MFE (top 5)

1. **SHORT** @ `2024-11-22T09:07:00.000Z` — MFE=104.750 MAE=2.750 proxyR=9.488 T-before=null · bias=neutral struct=bearish session=OTHER
2. **SHORT** @ `2025-03-27T19:38:00.000Z` — MFE=92.750 MAE=16.000 proxyR=-5.333 T-before=false · bias=neutral struct=bearish session=NY_PM
3. **LONG** @ `2024-09-30T13:19:00.000Z` — MFE=85.500 MAE=8.500 proxyR=-1.063 T-before=false · bias=neutral struct=bullish session=OTHER
4. **SHORT** @ `2024-11-20T17:07:00.000Z` — MFE=76.750 MAE=7.250 proxyR=2.752 T-before=null · bias=neutral struct=bearish session=NY_LUNCH
5. **LONG** @ `2024-10-16T14:10:00.000Z` — MFE=65.750 MAE=16.250 proxyR=1.435 T-before=null · bias=neutral struct=bullish session=NY_AM

### Worst by MAE (top 5)

1. **SHORT** @ `2025-05-22T14:57:00.000Z` — MFE=0.500 MAE=92.000 proxyR=-2.190 Inv-before=true · bias=neutral struct=bearish session=NY_AM
2. **LONG** @ `2025-02-25T09:18:00.000Z` — MFE=4.000 MAE=58.750 proxyR=-3.219 Inv-before=true · bias=neutral struct=bullish session=OTHER
3. **LONG** @ `2025-03-03T17:18:00.000Z` — MFE=25.250 MAE=57.750 proxyR=-1.638 Inv-before=true · bias=neutral struct=bullish session=NY_LUNCH
4. **LONG** @ `2025-05-30T14:37:00.000Z` — MFE=4.000 MAE=50.250 proxyR=-0.465 Inv-before=null · bias=bullish struct=bullish session=NY_AM
5. **LONG** @ `2025-02-18T16:48:00.000Z` — MFE=9.250 MAE=44.500 proxyR=-2.342 Inv-before=true · bias=neutral struct=bullish session=NY_LUNCH

## EDGE_CLAIM

NONE

JSON: `acquisition/reports/nq-history-archive-dev-dual-audit-latest.json`