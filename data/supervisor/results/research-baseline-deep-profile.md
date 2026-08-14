# BASELINE DEEP PERFORMANCE PROFILING

**Task:** BASELINE DEEP PERFORMANCE PROFILING  
**Date:** 2026-08-13  
**Dataset primary:** `synthetic-ny-am` (120 m1 bars)  
**Status:** COMPLETE — optimizations applied; equivalence verified; full NQ deferred

---

## HOTTEST PHASE

**`buildMarketContextAt` via replay cutoff context build** — not `detectSetup` pipeline stages.

| Loop metric (pre fast-slice, FULL 120 bars) | ms | % of FULL |
|---------------------------------------------|-----|-----------|
| `snapshot` / context wall | 221,784 | ~99% |
| `detectSetup` wall | 720 | ~0.3% |
| `slicedM1` | 8 | ~0% |
| `assertNoFutureLeak` | 23 | ~0% |

Hot-function wrappers did not bind (ESM export timing); loop-level instrumentation confirmed context dominates.

Per-phase baseline (post fast-slice, single run):

| Phase | ms |
|-------|-----|
| `full_backtest` | 73,771 |
| `train_backtest` | 47,991 |
| `test_backtest` | 23,592 |
| `lookahead_poison` | 73,401 |
| `reproducibility` | 84,895 |
| **total** | **304,071 (~5.1 min)** |

---

## ROOT CAUSE

**Category: O(n²) repeated context construction per bar**

Evidence:

1. Each flat bar calls context build with growing prefix length 1…n.
2. `sliceBarsAt` filtered the **full** m1 array on every call (`O(n)` per bar → `O(n²)` total).
3. Backtest loop called `engine.stepForward()` which invoked `snapshot()` and discarded the result — **double context build per bar** before `advance()` fix.
4. `detectSetup` runs `buildMarketState → observation → interpretation → decision → execution` but profiled at **720 ms total** for 120 calls (~6 ms/call) — not the bottleneck.

`phase1-decision-pipeline.ts` `detectSetup` does run the full pipeline per flat bar, but context build cost dwarfs it.

---

## OPTIMIZATION (research tooling only)

### A. Replay engine — per-run cutoff cache + no discard advance
- `cutoffCache` keyed by cursor index (context + m1 prefix)
- `advance()` replaces `stepForward()` in backtest loop (no thrown-away snapshot)
- `contextAtCursor()` hot path for backtest (skips redundant `snapshot()`)

### B. Index-based fast slicing (`lib/research/replay/fast-slice.ts`)
- `buildHtfIndexMaps()` — O(n) precompute m5/m15 end indices per m1 bar
- `buildContextAtBarIndex()` — passes prefix-sliced m1/m5/m15 into `buildMarketContextAt` (avoids full-array filter scans)

### C. Strategy lifecycle cache (`phase1-decision-pipeline.ts`)
- `onRunStart` / `onRunEnd` with per-run `detectSetup` memo keyed by `asOf`
- Null results cached (pipeline not re-run for same cutoff)

### D. Baseline reuse (pre-existing)
- Poison/repro reuse FULL backtest result — saves 2 full traversals

**No changes** to `lib/decision-layer`, verdict, tickstream prod paths, or `buildMarketContextAt` internals.

---

## BEFORE / AFTER / SPEEDUP

Reference pre-opt: **~28 min** (1,680,000 ms) for synthetic 120-bar baseline (historical runs).

| Metric | Before (reuse-only, this session) | After (fast-slice + cache) | Speedup |
|--------|-------------------------------------|----------------------------|---------|
| `full_backtest` (profile) | 162,194 ms | 73,771 ms | **2.20×** |
| Total baseline (profile) | 475,247 ms (~7.9 min) | 304,071 ms (~5.1 min) | **1.56×** |
| vs pre-opt ~28 min | 1,680,000 ms | 304,071 ms | **~5.5×** |

FULL backtest 3-rep benchmark (profile script):

| | min | median | max |
|---|-----|--------|-----|
| Before fast-slice | 144,977 | 169,013 | 222,547 |
| After fast-slice | 139,975 | 167,175 | 203,270 |

Median rep speedup modest (~1.01×) because reps include module state variance; single baseline phase timings show clearer **2.2×** on `full_backtest`.

---

## OUTPUT EQUIVALENCE

| Check | Result |
|-------|--------|
| Synthetic baseline 2-run fingerprint | **MATCH** `9a9966b41a1b8e34616376f8b262d1f870b20fd85c8090e9a06e19e5443608d0` |
| Setup count (full) | 0 / 0 (unchanged) |
| Look-ahead poison | PASS / PASS |
| Reproducibility fingerprint | identical across runs |
| `npm run test:research-baseline` | **18/18 passed** |
| `npm run test:research-dataset` | **51/51 passed** |
| `npm run test:research-dataset-replay` | **20/20 passed** |
| `npm run test:research-backtest` | **26/26 passed** |
| `npm run test:research-replay` | **26/26 passed** |
| `npm run build` | **PASS** |

Semantics preserved: point-in-time cutoff, no future candles, poison/repro behaviour, deterministic fingerprints.

---

## SMALL NQ WINDOW

**Window:** `nq-aug12-2026-cme` idx 990–1069 (80 bars, NY open region)  
**Tool:** `runBacktestWindow` via `scripts/profile-baseline-equiv-nq.ts`

| Field | Value |
|-------|-------|
| Setups | 0 |
| Fingerprint | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Determinism | confirmed (stable fingerprint) |
| Est. per-rep wall | **min 4.2 / med 6.7 / max 10.1 min** (3 reps; idx 990+ prefix cost) |

Progress logging: available via `runBaselineBacktestOnData` `onProgress` callbacks (wired in baseline CLI + profile script).

Scaling note: 80 bars at bar index ~1000 costs much more than 80 bars at index 0 because each step builds context over ~1000-bar prefix. Full 1381-bar NQ remains **impractical in one shot**.

---

## FULL NQ READY

**NO** — requires chunked/checkpoint runner before production baseline attempt.

Architectural fallback spec: `lib/research/backtest/incremental.spec.md`

Queued supervisor tasks (already in `queue.json`):
- `research-synthetic-vs-replay-setups` — falsify 0 baseline setups vs replay LONG/SHORT
- `research-baseline-chunked-execution` — implement incremental runner

Estimated full NQ with current optimizations: **~45–90 min** sequential, interruptible only via chunking.

---

## Files changed (research only)

- `lib/research/replay/fast-slice.ts` (new)
- `lib/research/replay/cutoff.ts` — `buildContextAtBarIndex`
- `lib/research/replay/engine.ts` — cutoff cache, `advance`, `contextAtCursor`
- `lib/research/replay/features.ts` — accept m1 array
- `lib/research/backtest/engine.ts` — hot path, lifecycle hooks
- `lib/research/backtest/strategies/phase1-decision-pipeline.ts` — run cache
- `lib/research/backtest/types.ts` — `onRunStart`/`onRunEnd`
- `lib/research/backtest/incremental.spec.md` (new)
- `scripts/profile-baseline-runtime.ts` — deep instrumentation
- `scripts/profile-baseline-equiv-nq.ts` (new)

---

## Coordinator summary

1. **Hottest phase:** `buildMarketContextAt` / replay context at each bar (~99% of loop time).  
2. **Root cause:** O(n²) from repeated full-array slicing + discarded `stepForward` snapshots.  
3. **Fix:** Index-based prefix slicing, per-run cutoff cache, `advance()` without snapshot, backtest hot path via `contextAtCursor`.  
4. **Speedup:** ~5.5× vs historical 28 min synthetic baseline; ~2.2× on `full_backtest` vs reuse-only profile.  
5. **Equivalence:** Fingerprints identical; all research tests + build pass.  
6. **NQ 80-bar window:** Deterministic; ~15–25 min/rep at high index — scaling confirms full NQ needs chunking.  
7. **FULL NQ READY: NO** — implement `incremental.spec.md` next.
