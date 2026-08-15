# Karen DV / Backtest Performance Engineering

**TREE:** `.tmp/karen-final-integration/`  
**EDGE_CLAIM:** NONE · **HOLDOUT:** sealed · No trading-logic / threshold / cadence thinning  
**Generated:** 2026-08-15T19:15:00.000Z

## 0. Gate summary

| Gate | Result |
|---|---|
| CACHE wired | **Y** (`PitSafeDaySession` → `evaluateDecisionAtAsOf`) |
| INCREMENTAL_STRUCTURE | **PASS** (per-detector + semantic hash + growing compact) |
| INCREMENTAL_CONTEXT | **PASS** (session HL / NWOG / ORG / fvgDaily / m5·m15 FVG + semantic hash) |
| HASH_MATCH (cold≡pit+struct+ctx) | **PASS** (`a3c57a2992af5e72`) |
| PIT | **PASS** |
| DAY_MS this wave (2024-09-13, 5m, 252 asOfs, warm best-of) | **3142** → **1632** (**~48%**) |
| DAY_MS vs early cold baseline | **5808** → **~1.6s** |
| Microbench structure-only speedup (80 asOfs) | **~6.0×** (cold 768 → incr 128) |
| STRETCH &lt;5s full day | **Y** (best local **~1.6s**/day @ 5m) |
| **QG Amdahl stop** | **YES** — QG **53%** &gt; feature **37%** |
| asOf-within-day parallel | **OFF** (PIT equivalence not proven) |
| worker_threads vs Promise-pool | **Real threads** (**~2.6× @4** prior re-bench) |

## 1. FEATURE_INTERNAL_BREAKDOWN

### Live residual (post Intl + fvgDaily + compact)

Source: `scripts/_dv-live-incr-residual.ts` / `scripts/_dv-structure-subprofile.ts`

| Bucket | Share of remaining feature | Notes |
|---|---:|---|
| structure (compact + pools + FP) | ~majority | compact was ~55% of structure before growing cache |
| m5·m15 FVG | ~0.5% | lookback-40; formatEst cache collapsed Intl tax |
| NWOG | ~2% | weekKey-by-day + formed freeze |
| fvgDaily / PD | &lt;2% | completed-day cache |
| sessions / org / slice | low | already incremental |

### E2E phase share (warm, struct+ctx) — **this wave**

Source: `npx tsx scripts/karen-dv-context-phase-measure.ts` →  
`dv-context-phase-measure-latest.json`

| Phase | ms | % wall |
|---|---:|---:|
| **decision_envelope_qg** | 887 | **53.1%** |
| **feature_construction** | 623 | **37.3%** |
| pit_slicing | 52 | 3.1% |
| observation | 42 | 2.5% |
| interpretation | 8 | 0.5% |

Feat ms/eval: **~8.6** (prior ctx) → **~2.5** (this wave).

### THEORETICAL_MAX_PER_BOTTLENECK (Amdahl)

| Bottleneck | If driven to ~0 | Notes |
|---|---|---|
| remaining feature_construction (~37% @ 1.6s) | **~1.6×** → ~**1.0s** floor | No longer dominant |
| decision_envelope_qg (~53%) | ~**2.1×** | **Dominant — stop for feature work** |
| Perfect day-parallel 4 / 8 | ≤**4×** / ≤**8×** wall | Independent days only |
| asOf-within-day parallel | unknown | **Blocked** until PIT hash proof |

**QG Amdahl stop signal:** **YES** — QG **53%** &gt; feature **37%**. Further feature-only gains expected &lt;10% day wall without QG work.

## 2. INCREMENTAL_STATUS / CACHE_STATUS

| Item | Status |
|---|---|
| `PitSafeDaySession` | **WIRED** |
| HTF precomputed maps + `buildContextAtBarIndex` | **ACTIVE** |
| EST-day bar index (session extraction) | **ACTIVE** (PIT-clamped at asOf) |
| PD dayKey cache (EST) | **ACTIVE** |
| ORG dayKey cache (once formed) | **ACTIVE** |
| ORG via EST-day index (`computeOrgFromDayIndex`) | **WIRED + HASH PASS** |
| True incremental structure t→t+1 | **WIRED + HASH PASS** |
| Growing structure compact (y+today concat) | **WIRED + HASH PASS** |
| **IncrementalContextEngine** (session HL / NWOG / HTF FVG / fvgDaily) | **WIRED + HASH PASS** |
| NWOG week-key freeze + day→weekKey memo | **ACTIVE** |
| Session HL freeze-after-close + t→t+1 update | **ACTIVE** |
| fvgDaily completed-day cache | **ACTIVE** |
| formatEst / estWeekdayShort timestamp caches | **ACTIVE** (PIT-safe Intl memo) |
| m5·m15 FVG by HTF end index | **WIRED** (low hit-rate @ 5m; cheap after formatEst cache) |
| Cached ≡ uncached semantic hash | **PASS** |
| One-load parent + compact `windowM1` to workers | **YES** |
| Persistent `worker_threads` pool | **YES** |
| asOf-within-day parallel | **OFF** |

### This wave (hash-gated)

1. **Intl memo** — `formatEst` + `estWeekdayShort` cached by epoch ms (same strings as prior `toLocale*`).
2. **fvgDaily / dayOpen** — IncrementalContextEngine caches completed daily FVG series + day open.
3. **NWOG** — EST dayKey → CME week Sunday key memo (avoids weekday walk on hits).
4. **todayM1** — binary PIT clamp instead of linear filter.
5. **Structure compact** — growing yesterday+today; concat fast-path when today ≥120 bars (skips merge/sort); `priorEstDateKeyFromIndex` instead of full-prefix scan.

Scripts:

- `scripts/test-karen-dv-incremental-context.ts` — piece + E2E semantic gate  
- `scripts/test-karen-dv-incremental-structure.ts` — per-detector + E2E semantic gate  
- `scripts/test-karen-dv-pit-cache-equiv.ts` — cached≡uncached hash gate  
- `scripts/karen-dv-context-subprofile.ts` — non-structure breakdown  
- `scripts/karen-dv-context-phase-measure.ts` — warm struct vs struct+ctx phases  
- `scripts/karen-dv-incr-structure-bench.ts` — cold / pit / struct / struct+ctx day ms  
- `scripts/karen-dv-perf-bench.ts` — 1/2/4/8 bench + regression baseline  

## 3. DAY_MS / STRETCH (this session)

Day **2024-09-13**, cadence 5m, **252** asOfs, warm process, best-of order-swapped runs:

| Mode | Best day ms | Feat ms/eval |
|---|---:|---:|
| Cold (no pit) | ~**6612–9990** (order/GC sensitive) | ~21–50 |
| Pit + incremental structure only | **2493** | **~6.3** |
| Pit + structure + **context** (prior wave) | **3142** | **~8.6** |
| Pit + structure + context (**this wave**) | **1632** | **~2.5** |

- **DAY_MS:** **1632** (vs prior ctx **3142**, **1.93×**; stretch still **Y**)  
- **HASH_MATCH:** **PASS** (`a3c57a2992af5e72`)  
- **stop_reason:** **qg_dominant**

## 4. WORKERS_1_2_4 (prior re-bench; re-run optional)

4 DEV days @ cadence 5m, `worker_threads`, PitSafeDaySession on (struct+ctx) — numbers from prior wave; serial local day now **~1.6s**:

| Workers | Mode | Wall ms | Speedup vs 1 | Evals/sec | Days/sec | RSS MB | Feat ms/eval | Est 429d DEV (min) | Est 739d (min) | Hash≡serial |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | threads | 44988 | 1.00× | 24.10 | 0.089 | 609 | 26.54 | 80.4 | 138.5 | true |
| 2 | threads | 21228 | **2.12×** | 51.06 | 0.188 | 619 | 20.32 | 37.9 | 65.4 | true |
| 4 | threads | 17027 | **2.64×** | **63.66** | **0.235** | 535 | 28.13 | **30.4** | **52.4** | true |

Prefer days/sec from warm serial × parallel efficiency for planning (~1.6s serial → rough **~0.6 day/s @4** if prior 2.6× holds).

## 5. Regression baseline

- `data/karen-decision-validation/acquisition/reports/dv-perf-regression-baseline.json`
- `data/karen-decision-validation/acquisition/reports/dv-perf-bench-latest.json`
- `data/karen-decision-validation/acquisition/reports/dv-incremental-structure-gate-latest.json`
- `data/karen-decision-validation/acquisition/reports/dv-incremental-context-gate-latest.json`
- `data/karen-decision-validation/acquisition/reports/dv-context-phase-measure-latest.json`
- Fail if evals/sec drops **>25%** vs baseline on same cadence/day set without waiver

## 6. Next bottleneck (ordered)

1. **Decision envelope + QG (~53%)** — dominant; next perf wave should target QG/envelope, not feature  
2. Residual feature (~37%) — mostly structure pools / FP fill; expected day gain &lt;10% if chased alone  
3. Expand day-parallel sample (≥8 days) to use 8 workers  
4. asOf-within-day parallel remains **OFF** until separate PIT hash proof  
5. Event-driven cadence remains research-only until larger miss≈0 study  

## EDGE_CLAIM

**NONE**
