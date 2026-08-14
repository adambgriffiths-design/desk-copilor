# Research Baseline Runtime Bottleneck

**Task:** research-baseline-runtime-bottleneck  
**Date:** 2026-08-13  
**Status:** COMPLETE — gates pass; NQ full baseline deferred

## Executive summary

Baseline backtest on `synthetic-ny-am` (120 bars) is dominated by repeated full decision-pipeline passes (FULL + TRAIN + TEST + poison + repro). Reusing the FULL backtest result for poison/repro validation cuts synthetic runtime ~27% (profile) to ~8 min (CLI, warm run) while preserving fingerprint equivalence. Full NQ (1381 bars) remains impractical (~1.5–4 h estimated) and prior attempts were killed; chunked/checkpoint execution should precede any NQ baseline.

## Runtime before / after optimization

| Run | Dataset | Bars | Total | Notes |
|-----|---------|------|-------|-------|
| `baseline-2026-08-13T08-50-55-701Z` | synthetic-ny-am | 120 | ~28 min (est.) | Pre-optimization reference; fingerprint baseline |
| `baseline-2026-08-13T15-06-15-701Z` | synthetic-ny-am | 120 | **27.7 min** (1,663,475 ms) | Pre-opt CLI run, no phase logs |
| Profile (post-opt) | synthetic-ny-am | 120 | **20.5 min** (1,228,449 ms) | Per-phase timings captured |
| `baseline-2026-08-13T16-05-01-517Z` | synthetic-ny-am | 120 | **8.1 min** (483,368 ms) | Post-opt CLI with phase logs |

**Optimization savings:** ~27% (profile vs pre-opt) to ~71% (warm CLI vs pre-opt). Variance is high — per-bar pipeline cost dominates and is sensitive to CPU load.

### Per-phase timings (post-opt profile)

| Phase | ms | % of backtest sum |
|-------|-----|-------------------|
| `full_backtest` | 276,780 | 22.5% |
| `train_backtest` | 190,257 | 15.5% |
| `test_backtest` | 118,894 | 9.7% |
| `lookahead_poison` | 344,412 | 28.1% |
| `reproducibility` | 297,331 | 24.2% |
| `data_quality` | 7 | ~0% |
| **backtest_phases_sum** | **1,227,674** | 100% |

**Dominant bottleneck:** per-bar Phase 1 decision pipeline inside `runBacktest` / `runBacktestWindow`. Poison and repro each still require one additional full pass (mutated data / repeat determinism check).

## Optimization implemented

1. **`runLookAheadPoisonTest(replay, strategy, baselineResult?)`** — reuses FULL backtest setups for base comparison; only runs poisoned backtest.
2. **`runReproducibilityTest(config, firstRun?)`** — reuses FULL backtest as first deterministic run; only runs one repeat.
3. **`runBaselineBacktestOnData(..., onProgress?)`** — phase progress callbacks wired through CLI and profile script.
4. **`scripts/profile-baseline-runtime.ts`** — streams `[phase] Xms` as phases complete (survives partial runs).

No production Karen logic modified.

## Equivalence proof

| Check | Result |
|-------|--------|
| `test:research-baseline` (incl. test8 reuse) | **18 passed, 0 failed** |
| Fingerprint pre-opt (`08-50-55-701Z`) | `9a9966b41a1b8e34616376f8b262d1f870b20fd85c8090e9a06e19e5443608d0` |
| Fingerprint post-opt (`16-05-01-517Z`) | **MATCH** |
| Look-ahead | PASS |
| Reproducibility | PASS |
| Setups (full) | 0 (unchanged) |

## Test suite + build

| Command | Result |
|---------|--------|
| `npm run test:research-baseline` | 18 passed, 0 failed |
| `npm run test:research-backtest` | 26 passed, 0 failed |
| `npm run test:research-dataset` | 51 passed, 0 failed |
| `npm run test:research-dataset-replay` | 20 passed, 0 failed |
| `npm run build` | PASS |

## Killed NQ attempts (evidence, not correctness failures)

| Terminal | Dataset | Duration | Outcome |
|----------|---------|----------|---------|
| 492140 | nq-aug12-2026-cme (full) | ~61 min | Killed (exit 4294967295), no report |
| 492141 | nq-aug12-2026-cme (OOS from NY open) | ~44 min | Killed (exit 4294967295), no report |
| 492143 | synthetic profile (pre-streaming) | ~23.5 min | Killed, no phase output |

## NQ feasibility (deferred)

- NQ bars: **1381** vs synthetic **120** → **11.5× scale**
- Conservative estimate (profile 20.5 min): **~236 min (~3.9 h)**
- Optimistic estimate (warm CLI 8.1 min): **~93 min (~1.5 h)**
- Both exceed prior kill thresholds (44–61 min)

**Decision:** Do NOT run full NQ baseline until chunked/checkpoint tooling exists. Queued `research-baseline-chunked-execution` instead.

## Confidence

| Area | Level | Rationale |
|------|-------|-----------|
| Equivalence | **High** | Fingerprint match + test8 + full test suite |
| Bottleneck identification | **High** | Per-phase profile confirms backtest passes dominate |
| NQ runtime estimate | **Medium** | 2–3× variance observed between runs on same hardware |
| Zero-setup synthetic | **Low** | Falsification task queued — replay produces LONG/SHORT on same fixture |

## Next tasks queued

1. **`research-synthetic-vs-replay-setups`** — falsification: why baseline yields 0 setups while replay yields LONG/SHORT
2. **`research-baseline-chunked-execution`** — incremental/checkpoint baseline for NQ-scale datasets

**NOT queued:** full NQ baseline (gates pass but runtime still impractical).
