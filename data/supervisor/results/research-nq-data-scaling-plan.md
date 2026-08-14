# Research: NQ Historical Data Scaling Plan

**Task ID:** research-nq-data-scaling-plan  
**Agent:** Composer (subagent)  
**Status:** COMPLETE  
**Builds on:** research-karen-mentor-methodology, research-mentor-quality-nq-aug12 (1ab78d11 — not duplicated), be4d9b45 (TickStream authority)

---

## Executive summary

| Question | Answer |
|----------|--------|
| **LOCAL DATA FOUND** | **1 real CME day** (Aug 12 2026) + synthetic test fixture only |
| **ACQUISITION PATH** | Existing `npm run research:dataset` → TickStream historical ticks → validated 1m store |
| **CHECKPOINT METHOD** | Stratified session-phase anchors + regime-shift candidates (`lib/research/mentor/checkpoint-selection.ts`) |
| **COST/CHECKPOINT** | **~10.8s p50 / ~11.4s avg** (pipeline + rubric, Aug 12 benchmark) |
| **REQUIRES ADAM** | **NO** if `TICKSTREAM_API_KEY` already in `.env.local` (used Aug 13); **YES** if key missing or API quota blocks multi-week fetch |

**Do NOT run full baseline on months of data.** Mentor eval is checkpoint-based (~12/session), not per-bar (~3800ms/bar).

---

## PART 1 — Local data inventory

### Real NQ (TickStream / CME)

| Location | ID / alias | Bars | Date range (UTC) | Source | Validation | Fingerprint |
|----------|------------|------|------------------|--------|------------|-------------|
| `data/research/datasets/2562961408b256ac94f1/` | `2562961408b256ac94f1` | 1381 | 2026-08-11T22:00 → 2026-08-12T22:00 | tickstream | **WARNING** | `2dbbd59249d84137` |
| `data/research-fixtures/nq-aug12-2026-cme/` | `nq-aug12-2026-cme` | 1381 | same (mirror bundle) | tickstream | **WARNING** | same |

**Validation detail (acceptable for research):**
- `candleCount`: 1381
- `missingMinuteCount`: 60 (expected `SESSION_BOUNDARY_GAP` at CME roll 2026-08-12 → 2026-08-13)
- `duplicateCount`: 0, `invalidOhlcCount`: 0
- `integrityStatus`: WARNING (not INVALID)

**Timestamps:** `start_timestamp=1786485600`, `end_timestamp=1786572000`  
**Disk:** ~163 KB `candles.json` per session-day bundle

### Non-canonical / incomplete

| Location | Notes |
|----------|-------|
| `data/research-fixtures/synthetic-ny-am.json` | 120 bars, synthetic — methodology tests only, **not mentor regime eval** |
| `data/research/datasets/e524ccc3a842e999a8eb/` | Observation/outcome stubs only — **no candles.json**, not usable |

### Beyond Aug 12?

**No additional real NQ days exist locally.** All other `data/research/runs/` and `baseline-runs/` artifacts reference the same single-session dataset.

---

## PART 1b — Acquisition path (existing tooling)

### Canonical command

```bash
npm run research:dataset -- \
  --symbol NQ \
  --start 2026-08-05T22:00:00Z \
  --end 2026-08-12T22:00:00Z \
  --fixture-id nq-week-aug05-aug12-2026-cme
```

**Pipeline:** TickStream `/history/ticks` → `aggregateTicksTo1m` → `validateCandles` → `data/research/datasets/{id}/` + optional fixture bundle.

**Config:** `TICKSTREAM_API_KEY` via `process.env` or `.env.local` / `.env` (`lib/tickstream/quote.ts`). Never logged.

**Fetch semantics:** Default `chunkSeconds=300` (~5 min windows), pagination-safe, µs→sec normalization at ingestion boundary.

**Yahoo:** Screening only per be4d9b45 — **not for canonical mentor eval.**

### Recommended staged loads

| Stage | Window (CME sessions) | Command `--start` / `--end` | `--fixture-id` suggestion |
|-------|----------------------|----------------------------|---------------------------|
| 1 week | Aug 5–12 2026 (5 sessions) | `2026-08-05T22:00:00Z` / `2026-08-12T22:00:00Z` | `nq-week-aug05-aug12-2026-cme` |
| 1 month | Jul 14–Aug 12 2026 (~22 sessions) | `2026-07-14T22:00:00Z` / `2026-08-12T22:00:00Z` | `nq-month-jul14-aug12-2026-cme` |
| 3 months | May–Aug 2026 (~66 sessions) | `2026-05-12T22:00:00Z` / `2026-08-12T22:00:00Z` | `nq-q2-may-aug12-2026-cme` |

**Merge strategy:** One continuous fetch per stage (not per-day loops) — loader handles chunking internally. Validate after write; expect one `SESSION_BOUNDARY_GAP` WARNING per session boundary.

**Stop condition for Adam:** API key missing, 401/403 from TickStream, or paid-tier depth limit on historical archive.

---

## PART 2 — Minimum data for mentor eval at cutoff T

### Pipeline trace (point-in-time)

```
m1 candles (TickStream, sliced ≤ T)
  → researchDatasetToReplayMarketData → m1 + derived m5/m15/daily (HTF from 1m)
  → ReplayDataCutoff.slicedM1/m5/m15/daily()
  → buildMarketContextAt(ctx)          // levels, ORG, PD arrays, MSS, FVGs, sessions
  → buildResearchChartSnapshotFromBars // research_bars adapter → data_quality
  → buildMarketState → runDeskPipeline
      → observation (structure, displacement, FVG, data_quality)
      → interpretation (long/short cases, entry_model)
      → decision (LONG/SHORT/WAIT/NO_TRADE)
  → buildKarenReplayResponse → evaluateMentorResponse (10-criterion rubric)
```

### Minimum requirements (no full baseline)

| Layer | Required at T | Source |
|-------|---------------|--------|
| **m1 bars** | ≥ ~30 bars warmup; ideally full session prefix | TickStream 1m |
| **HTF bars** | m5, m15, daily derived from m1 prefix | `aggregateHtfFrom1m` |
| **chartSnapshot** | `research_bars` with cutoff-scored quality | `chart-snapshot-from-bars.ts` |
| **MarketContext** | ORG, PDH/PDL, sessions, structure/MSS, FVGs | `buildMarketContextAt` |
| **Observation** | `market_structure`, `data_quality`, displacement, FVG status | observation engine |
| **Interpretation** | long/short case support flags | interpretation engine |
| **Decision** | verdict + invalidation when directional | decision layer |
| **Karen response** | evidence fields for rubric | `buildKarenReplayResponse` |

**NOT required for mentor eval:** per-bar baseline loop, outcome labels, Yahoo data, TV drawings, post-T bars (except optional post-hoc audit, not scored).

**Multi-day minimum:** ≥5 distinct CME session days for LOW confidence regime coverage; ≥22 sessions for MODERATE multi-regime claims.

---

## PART 3 — Scalable checkpoint-based evaluation design

### Workflow

```
historical dataset (multi-session m1)
  → buildStratifiedCheckpointPlan(bars)     // candidate cutoffs
  → for each checkpoint T:
       ReplayDataCutoff → pipeline → Karen → evaluateMentorResponse
  → aggregate: criterion averages, falsification rates, mentorEvalReady %
  → markdown/json report (no per-bar baseline)
```

### Intelligent sampling algorithm

Implemented in `lib/research/mentor/checkpoint-selection.ts`.

**Principles (anti-cherry-pick):**
1. **Fixed session-phase strata** — 12 anchors per CME session (globex, overnight, pre-market, NY open, lunch, PM, session end, etc.). Guarantees AM/PM and session-boundary coverage.
2. **Regime-shift strata** — max 2 adaptive candidates per session when 60-bar regime proxy changes (trend/range/volatile/quiet). Uses **only bars ≤ T**; no outcome filter.
3. **No verdict filtering** — WAIT/NO_TRADE/LONG/SHORT all included; rubric scores reasoning, not P&L.
4. **Deterministic tie-break** — seeded hash for subsampling excess regime shifts (reproducible runs).
5. **Post-hoc audit separated** — invalidation breach check is diagnostic only (already in `research-run-mentor-eval.ts`).

**Regime proxies (point-in-time):**
- `trend_up` / `trend_down`: normalized 60-bar drift vs ATR
- `range`: moderate drift, moderate vol
- `volatile` / `quiet`: recent range vs trailing average

**Aug 12 plan preview:** 13 checkpoints (12 session phases + 1 regime shift on partial Aug 13 bar). Run: `npx tsx scripts/research-mentor-checkpoint-plan.ts`

### Benchmark (actual run, Aug 12, NY open 14:30Z)

Script: `scripts/research-mentor-checkpoint-benchmark.ts`

| Metric | ms |
|--------|-----|
| min | 5,763 |
| p50 | **10,793** |
| avg | **11,383** |
| p95 | 28,920 |
| max | 28,920 |

**Interpretation:** One checkpoint ≈ **11s typical**, up to ~29s tail (context build + full desk pipeline). Memory: single fixture ~163 KB m1 + derived HTF — negligible.

**12-cutoff Aug 12 batch (existing):** ~12 × 11s ≈ **2.2 min** total mentor eval per session-day (vs **~88 min** full incremental baseline on same 1381 bars).

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/research-mentor-checkpoint-plan.ts` | Preview stratified cutoffs |
| `scripts/research-mentor-checkpoint-benchmark.ts` | Single-checkpoint timing |
| `scripts/research-run-mentor-eval.ts` | Batch eval + report |
| `npm run test:research-mentor-eval` | Framework regression |

---

## PART 4 — Data scaling table

Assumptions:
- ~1,381 m1 bars per CME session-day (~163 KB JSON)
- ~12–13 checkpoints per session (stratified plan)
- ~11s/checkpoint mentor eval (p50–avg benchmark)
- Baseline **excluded** from scaling (3,814 ms/bar measured — impractical for months)

| Stage | Sessions | Bars (est.) | Disk (est.) | Checkpoints | Mentor eval time (est.) | Memory (est.) | Confidence gain |
|-------|----------|-------------|-------------|-------------|-------------------------|---------------|-----------------|
| **1 day** | 1 | 1,381 | 163 KB | 12–13 | **~2 min** | <5 MB | Methodology calibration only (current) |
| **1 week** | 5 | ~6,900 | ~815 KB | ~65 | **~12 min** | <10 MB | LOW — first multi-day drift signal |
| **1 month** | 22 | ~30,400 | ~3.6 MB | ~286 | **~52 min** | <20 MB | MODERATE — AM/PM, trend/range mix |
| **3 months** | 66 | ~91,100 | ~11 MB | ~858 | **~2.6 h** | <50 MB | MODERATE–HIGH — seasonal/regime diversity |
| **6+ months** | 132+ | ~182k+ | ~22 MB+ | ~1,700+ | **~5+ h** | <80 MB | HIGH — rare events, OOS seasons |

### Non-linear effects

| Factor | Effect |
|--------|--------|
| Checkpoint count | **~linear in sessions**, not bars — practical scaling |
| Per-checkpoint latency | Slight increase with longer m1 prefix (more context to scan) — sub-linear vs bar count |
| TickStream fetch | **Super-linear in wall time** for dense tick windows — batch by week/month, not 1381 separate calls |
| Full baseline | **O(bars × 3.8s)** — 1 month ≈ 32 hours — **explicitly out of scope** until mentor method proven |

### TickStream fetch time (order-of-magnitude)

Aug 12 single session was fetched successfully (2026-08-13). No re-fetch benchmarked this task (avoid duplicate API load). Estimate **5–15 min per session-day** of tick archive depending on API latency — **1 week load ~30–75 min fetch + validation**, dominated by network not disk.

---

## Deliverables checklist

| Deliverable | Status |
|-------------|--------|
| `data/supervisor/results/research-nq-data-scaling-plan.md` | ✅ this file |
| `lib/research/mentor/checkpoint-selection.ts` | ✅ stratified sampler |
| `scripts/research-mentor-checkpoint-plan.ts` | ✅ plan preview |
| `scripts/research-mentor-checkpoint-benchmark.ts` | ✅ benchmark numbers |
| `data/supervisor/memory.json` | ✅ updated |
| `npm run test:research-mentor-eval` | ✅ (run below) |
| `npm run build` | ✅ (run below) |

---

## Next task (concrete — queue if supervisor active)

**Task:** `research-nq-load-week-tickstream`  
**Prompt:** Load 1 week NQ CME data (Aug 5–12 2026) via existing tooling, validate, preview checkpoint plan.

```bash
npm run research:dataset -- \
  --symbol NQ \
  --start 2026-08-05T22:00:00Z \
  --end 2026-08-12T22:00:00Z \
  --fixture-id nq-week-aug05-aug12-2026-cme
```

Then: `npx tsx scripts/research-mentor-checkpoint-plan.ts --dataset nq-week-aug05-aug12-2026-cme`

**Do NOT:** run full baseline, re-run Aug 12 mentor eval (1ab78d11), or use Yahoo for canonical eval.

---

## TESTS + BUILD

| Command | Result |
|---------|--------|
| `npm run test:research-mentor-eval` | **17/17 PASS** |
| `npm run build` | **PASS** |

---

*Generated by research-nq-data-scaling-plan task. Benchmark: scripts/research-mentor-checkpoint-benchmark.ts on nq-aug12-2026-cme @ 2026-08-12T14:30:00Z.*
