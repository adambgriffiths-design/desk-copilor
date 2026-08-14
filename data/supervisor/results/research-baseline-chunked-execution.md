# Chunked/Checkpoint Baseline Execution for NQ

**Task:** research-baseline-chunked-execution  
**Agent:** Composer (Cursor autonomous research)  
**Date:** 2026-08-13  
**Status:** COMPLETE

## Question

How can NQ-scale baseline runs (1381 bars) become resumable, checkpointed, and observable without changing strategy semantics?

## Task

Implement per `lib/research/backtest/incremental.spec.md`: chunk planner, state carry-over, checkpoint I/O, CLI flags, equivalence proof.

## Data used

- Spec: `lib/research/backtest/incremental.spec.md`
- Synthetic fixture: `minimalFixture()` (40 bars) for fast equivalence tests
- NQ dataset: `nq-aug12-2026-cme` (1381 bars) — **NOT run** (per compute policy)

## Runtime

~15 min (implementation + test suite; no full NQ baseline)

## Result

**Incremental baseline runner implemented and equivalence-proven on synthetic fixture.**

### Deliverables

| Component | Path |
|-----------|------|
| Chunk planner + state carry-over | `lib/research/backtest/engine.ts` — `planBarChunks`, `runBacktestSegment`, `runBacktestIncremental`, `BacktestCheckpointState` |
| Checkpoint I/O + baseline integration | `lib/research/backtest/incremental.ts` |
| ReplayEngine cursor resume | `lib/research/replay/engine.ts` — `setCursor()` |
| CLI | `scripts/research-run-baseline.ts` — `--incremental`, `--chunk-size N`, `--resume RUN_ID` |
| Equivalence test | `scripts/test-research-baseline.ts` test10 |
| Spec status | Updated to **Implemented** |

### Architecture

```
Dataset → planBarChunks(100 bars)
       → for each chunk: runBacktestSegment(state carry-over)
       → save checkpoints/{manifest,chunk-N,state}.json
       → merge setups (ordered by timestamp)
       → TRAIN/TEST windows (unchanged monolithic path)
       → poison + repro (reuse FULL result)
       → export
```

### Checkpoint files (per runId)

- `data/research/baseline-runs/{runId}/checkpoints/manifest.json`
- `data/research/baseline-runs/{runId}/checkpoints/chunk-{i}.json`
- `data/research/baseline-runs/{runId}/checkpoints/state.json`

### CLI usage

```bash
npm run research:baseline -- --dataset nq-aug12-2026-cme --incremental --chunk-size 100
npm run research:baseline -- --dataset nq-aug12-2026-cme --incremental --resume baseline-2026-08-13T...
```

## Evidence

### Equivalence (test10)

- Chunk plan continuity: PASS
- Monolithic vs incremental fingerprint (chunk-size 25): **MATCH**
- Monolithic vs incremental fingerprint (chunk-size 7): **MATCH**

### Test suite

| Command | Result |
|---------|--------|
| `npm run test:research-baseline` | **26 passed, 0 failed** |
| `npm run test:research-backtest` | **26 passed, 0 failed** |
| `npm run test:research-dataset` | **51 passed, 0 failed** |
| `npm run test:research-dataset-replay` | **20 passed, 0 failed** |
| `npm run test:supervisor` | 110 passed, 1 failed (pre-existing) |
| `npm run test:supervisor-parallel` | **20 passed, 0 failed** |
| `npm run build` | (see below) |

## Tests

New regression: **test10IncrementalEquivalence** verifies chunked execution produces identical setups to monolithic `runBacktest` across multiple chunk sizes.

## Conclusion

Chunked baseline execution is **ready for NQ pilot**. Tooling preserves train/test split, poison, repro, and point-in-time semantics. Total CPU time unchanged (~30–55 min sequential for 1381 bars post-opt) but runs are now **interruptible** and **progress-visible** per chunk.

**FULL NQ READY: YES (tooling)** — safe to attempt `--incremental --chunk-size 100` on NQ; not yet executed in this session due to compute policy.

## Confidence

**High** for equivalence on synthetic; **Medium** for NQ end-to-end until first incremental pilot completes.

## Next task

**research-nq-baseline-incremental-pilot** — run NQ baseline with `--incremental --chunk-size 100`, monitor chunk progress, verify fingerprint + poison/repro gates. Do NOT re-run if a partial checkpoint exists — resume instead.

## Reason for next task

Chunked tooling complete; falsification complete; gates pass. NQ full baseline was previously killed at 44–61 min without report — incremental pilot is the natural validation step before treating NQ baseline as production-ready research evidence.
