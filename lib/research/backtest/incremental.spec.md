# Incremental / Checkpointed Baseline Runner — Design Spec

## Problem

Full-session NQ baseline (~1381 m1 bars) exceeds practical single-process wall-clock budget even after per-run caching and index-based context slicing. Runs were killed at 44–61 min with no report.

## Goals

- Deterministic, semantically identical output to monolithic `runBaselineBacktestOnData`
- Resume after failure; chunk progress to disk
- Preserve: point-in-time cutoff, feature/outcome separation, poison/repro checks, train/test split

## Non-goals

- Changing strategy rules or prod Karen modules
- Parallel non-deterministic aggregation

## Architecture

```
Dataset manifest
    → Chunk planner (bar ranges, e.g. 100 bars)
    → For each chunk:
         runBacktestWindow(FULL strategy, chunk range)
         append setups + checkpoint metadata
    → Merge setups (ordered by timestamp)
    → Derive TRAIN/TEST by filtering merged setups on split indices
    → Poison + repro on full dataset (reuse merged FULL setups as baselineResult)
    → Export manifest / results / report
```

## Checkpoint files (per runId)

| File | Content |
|------|---------|
| `checkpoints/manifest.json` | runId, datasetId, chunk plan, git revision, strategy version |
| `checkpoints/chunk-{i}.json` | `{ startIndex, endIndex, setups[], window, completedAt }` |
| `checkpoints/state.json` | `{ lastCompletedChunk, mergedSetupCount, fingerprintPartial }` |

## Chunk merge rules

1. Sort all chunk setups by `(timestamp, direction, entry)` — same as monolithic ordering
2. Statistics recomputed from merged list via `computeBaselineStatistics`
3. TRAIN/TEST periods: filter merged setups whose detection bar index ∈ split window (not re-run backtest unless boundary semantics proven equivalent)

## Validation gates (must pass before export)

- **Look-ahead poison**: unchanged API — `runLookAheadPoisonTest(replay, strategy, mergedFullResult)`
- **Reproducibility**: second FULL merge OR single `runReproducibilityTest` on full config
- **Chunk continuity**: chunk `i.endIndex + 1 === chunk i+1.startIndex`; no gaps/overlaps
- **Determinism**: re-merge produces identical fingerprint

## CLI sketch

```bash
npm run research:baseline -- --dataset nq-aug12-2026-cme --incremental --chunk-size 100
npm run research:baseline -- --resume baseline-2026-08-13T... 
```

## Minimal implementation path

1. `lib/research/backtest/incremental.ts` — chunk planner + merge + checkpoint I/O
2. Extend `scripts/research-run-baseline.ts` with `--incremental` / `--resume`
3. Supervisor task for full-NQ incremental pilot (100-bar chunks ≈ 14 chunks)

## FULL NQ readiness estimate

| Bars | Est. per-chunk (100 bars) | Chunks | Sequential est. |
|------|---------------------------|--------|-----------------|
| 1381 | ~2–4 min (post-opt)       | 14     | ~30–55 min      |

Incremental runner makes this **interruptible** and ** observable**; does not reduce total CPU without further algorithmic wins.

## Status

**Implemented** — `lib/research/backtest/incremental.ts` with chunk planner, state carry-over, checkpoint I/O, CLI `--incremental` / `--resume` / `--chunk-size`. Equivalence test in `test:research-baseline` test10.
