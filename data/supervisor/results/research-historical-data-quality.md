# Research: Historical Data Quality Alignment

**Task:** research-historical-data-quality (methodology escalation)  
**Date:** 2026-08-13  
**Status:** COMPLETE

## ROOT CAUSE

Two layered failures blocked Phase 1 baseline from evaluating Karen on historical bars:

1. **Missing research adapter** — `phase1-decision-pipeline.ts` passed `chartSnapshot.source: "none"` with sliced OHLC candles. `scoreChartQuality` maps `source === "none"` → `quality: "missing"` regardless of candle count.

2. **Wall-clock staleness** — Even when prior investigations used `source: "tv_export"`, `scoreChartQuality(snap)` defaulted to `nowSec = Date.now()`. Aug 2026 bars read as 120+ seconds old vs wall clock → `stale_last_bar` → `data_quality: "stale"`.

**Gate location:** `decision-layer.ts` lines 50–59 returns `NO_TRADE` when `obs.data_quality === "missing" || "stale"`. This fires **before** interpretation/entry gates. Observation engine inherits quality from `state.quality.flag` via `buildMarketState` → `buildMarketObservation`.

**Exact divergence (baseline path):**

```
historical m1 bars → barsToChartCandles (80) → chartSnapshot { source: "none" }
→ scoreChartQuality (Date.now()) → missing|stale
→ buildMarketObservation → data_quality missing|stale
→ buildTradingDecision → NO_TRADE (gate)
→ detectSetup → null (never reaches ACTIVE entry gate)
```

## MISSING INPUT

**Nothing material is missing from the historical dataset.** TickStream/Yahoo-derived OHLC m1 bars contain the candle data Karen's observation engine consumes via `MarketState.candles`. What was missing was **research wiring**, not market data:

| Live Karen needs | Historical dataset has | Gap |
|------------------|------------------------|-----|
| OHLC candles (≥20) | m1 bars sliced at cutoff T | None — adapter maps bars → candles |
| Freshness vs "now" | Point-in-time bar at T | Fixed by scoring at `asOf`, not wall clock |
| Drawings / TV export | Not available | Acceptable — Phase 1 baseline ambiguities already document no drawings; structure from `MarketContext` |
| Live TV price | Bar close at T | Uses yahoo/bar close (existing research convention) |

Drawings and TradingView widget metadata are **not** required for Phase 1 decision-layer gates (structure comes from `MarketContext.structureFacts`).

## BASELINE/REPLAY DIVERGENCE

| Stage | Before fix | After fix |
|-------|------------|-----------|
| Replay CLI (`buildDeterministicKarenResponse`) | Always LONG\|SHORT (bias heuristic) | Unchanged — still not strategy evidence |
| Replay pipeline (`buildKarenReplayResponse`) | NO_TRADE (no chartSnapshot) | WAIT/LONG/SHORT per real pipeline |
| Baseline (`detectSetup`) | NO_TRADE → 0 setups | Pipeline runs; setups depend on verdict + ACTIVE entry |

**First meaningful divergence (pre-fix):** Replay CLI line 67 in `research-run-replay.ts` uses deterministic path. **Second divergence:** baseline/replay pipeline lacked chart snapshot adapter.

**Post-fix stage comparison (NQ Aug 12):**

| Cutoff | bars | dataQ | pipeline | entryStatus | baseline |
|--------|------|-------|----------|-------------|----------|
| 14:30 UTC | 991 | good | WAIT | WAIT | NONE |
| 20:59 UTC | 1380 | good | WAIT | ACTIVE | NONE |

Pipeline now reaches interpretation/decision. Zero setups at these cutoffs is **strategy verdict** (WAIT), not data-quality block.

**Synthetic (120 bars):** dataQ `good` from bar 21+; pipeline WAIT on samples; deterministic replay still LONG|SHORT (path mismatch preserved by design).

## CAN HISTORICAL DATA SUPPLY EQUIVALENT INPUTS

**YES** for Phase 1 baseline evaluation:

- OHLC m1 bars → `research_bars` chart snapshot (80-candle lookback)
- Freshness scored at cutoff `asOf` (simulates "live at T")
- `MarketContext` from existing `ReplayDataCutoff.buildContext`
- TickStream historical and Yahoo daily supply sufficient data for current pipeline

**Not equivalent (documented, not blocking):** TV user drawings, live extension price feed, sub-second tick order within a bar.

## FIX

Research-only changes:

1. **`lib/research/chart-snapshot-from-bars.ts`** — `buildResearchChartSnapshotFromBars()` maps sliced bars → `ChartSnapshotPayload` with `source: "research_bars"`, `visibleRange`, `sync.lastBarTime`, and `scoreChartQuality(snap, asOfSec)`.

2. **`lib/chart-snapshot.ts`** — Added `research_bars` to source union (honest provenance; scored like structured export, not `none`).

3. **`lib/research/backtest/strategies/phase1-decision-pipeline.ts`** — Uses adapter instead of `source: "none"`.

4. **`lib/research/replay/karen.ts`** — `buildKarenReplayResponse` uses same adapter (aligns replay pipeline with baseline).

5. **`scripts/research-compare-pipelines.ts`** — Diagnostic uses adapter for fair stage comparison.

6. **`scripts/test-research-baseline.ts`** — test9 updated (data_quality gate passes); test11 added (bars → snapshot → observation → decision).

**Not changed:** `decision-layer.ts`, observation/interpretation rules, data-quality thresholds, strategy entry gates.

## POINT-IN-TIME VALIDATION

Minimal fixture: synthetic-ny-am bar index 50 (`2026-08-12T14:20:00Z`, 51 bars at T).

| Check | Result |
|-------|--------|
| `chartSnapshot.source` | `research_bars` |
| `chartSnapshot.quality` | `good` (not missing/stale) |
| `obs.data_quality` | `good` |
| Decision blocked by DQ? | **No** — verdict_reason is framework logic, not "Chart data missing or stale" |
| Poison/look-ahead test | **PASS** (test1 unchanged) |
| Incremental ≡ monolithic | **PASS** (test10) |

NQ session-end (1380 bars): dataQ `good`, pipeline `WAIT`, entryStatus `ACTIVE` — confirms entry gate reachable when strategy permits.

## TESTS

| Command | Result |
|---------|--------|
| `npm run test:research-baseline` | **33/33 PASS** (+7 from test11, updated test9) |
| `npm run test:research-backtest` | **26/26 PASS** |
| `npm run test:research-dataset` | **51/51 PASS** |
| `npm run test:research-dataset-replay` | **20/20 PASS** |
| `npm run build` | **PASS** |

## BUILD

`npm run build` — compiled successfully after adding `research_bars` to `VerdictResult.chartDataSource` type union (type-only; no runtime behavior change).

## EDGE VALIDATION READY

**YES** — with caveats:

- Phase 1 pipeline can now evaluate historical Karen decisions without false data-quality rejection.
- Replay deterministic LONG/SHORT remains **non-comparable** to baseline (by design).
- Zero setups on tested NQ cutoffs reflects **WAIT verdict**, not infrastructure block — edge validation may still yield 0 trades on single session; methodology is now honest.
- Multi-day edge study should use **`research-karen-edge-validation-v2`** (queued, not executed here).

## Artifacts

- `lib/research/chart-snapshot-from-bars.ts`
- `lib/research/backtest/strategies/phase1-decision-pipeline.ts`
- `lib/research/replay/karen.ts`
- `scripts/test-research-baseline.ts` (test9, test11)
- `scripts/research-compare-pipelines.ts`

STOP.
