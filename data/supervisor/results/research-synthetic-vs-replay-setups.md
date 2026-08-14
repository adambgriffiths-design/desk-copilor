# Research: Synthetic baseline 0 setups vs replay LONG/SHORT

**Task ID:** research-synthetic-vs-replay-setups  
**Agent:** Composer (Cursor subagent)  
**Status:** COMPLETE

## Question
Why does synthetic baseline produce 0 setups while real replay produces LONG/SHORT snapshots?

## Falsification result
**FALSIFIED as meaningful strategy difference.** The discrepancy is **not** because one pipeline finds better trades. Replay snapshots and baseline backtest measure **different things**:

| Path | Code | Verdict behavior |
|------|------|------------------|
| Replay CLI | `buildDeterministicKarenResponse` | **Always** LONG or SHORT from `biasStack.dominantBias` / MSS direction — never WAIT/NO_TRADE |
| Full pipeline | `buildKarenReplayResponse` → `runDeskPipeline` | NO_TRADE on all tested historical cutoffs |
| Baseline backtest | `createPhase1DecisionPipelineStrategy.detectSetup` | Same pipeline as above + ACTIVE entry gate → 0 setups |

Prior NQ replay reports (`research-nq-replay-ny-open`, `research-nq-replay-session-end`) labeled Karen verdict LONG/SHORT but snapshots show `"source": "deterministic"` — **not** pipeline verdict.

## Divergence point
**First divergence:** `scripts/research-run-replay.ts` line 67 calls `buildDeterministicKarenResponse` instead of `buildKarenReplayResponse`.

```94:125:lib/research/replay/karen.ts
export function buildDeterministicKarenResponse(...) {
  const longBias = bias === "bullish" || ctx.structureFacts.mss?.direction === "bullish";
  return {
    ...
    pipelineVerdict: longBias ? "LONG" : "SHORT",
    source: "deterministic",
  };
}
```

**Second divergence (baseline-specific):** Even when baseline runs the real pipeline via `detectSetup`, `decision-layer` gates on `obs.data_quality`:

```50:59:lib/decision-layer.ts
if (obs.data_quality === "missing" || obs.data_quality === "stale") {
  return { verdict: "NO_TRADE", ... };
}
```

Research baseline passes `chartSnapshot.source: "none"` → `scoreChartQuality` → `missing`. Historical bars with `tv_export` still read **stale** vs `Date.now()` (120s threshold), so NO_TRADE persists on Aug 2026 data.

## Evidence tables

### synthetic-ny-am (13 sample bars, full window 120)

| asOf (UTC) | bars | bias | replay (det) | pipeline | entryStatus | baseline |
|------------|------|------|--------------|----------|-------------|----------|
| 13:30 | 1 | bearish | SHORT | NO_TRADE | WAIT | NONE |
| 13:40 | 11 | bullish | LONG | NO_TRADE | ACTIVE | NONE |
| 14:20 | 51 | bearish | SHORT | NO_TRADE | WAIT | NONE |
| 15:29 | 120 | neutral | SHORT | NO_TRADE | — | NONE |

**Summary:** deterministic LONG\|SHORT **13/13**; pipeline LONG\|SHORT **0/13**; baseline setups **0/13**; all rejects `verdict=NO_TRADE`.

### nq-aug12-2026-cme (prior replay timestamps)

| Timestamp | bars | bias | MSS | replay (det) | pipeline | entryStatus | baseline |
|-----------|------|------|-----|--------------|----------|-------------|----------|
| 2026-08-12T14:30:00Z | 991 | bullish | bullish | LONG | NO_TRADE | WAIT | NONE |
| 2026-08-12T20:59:00Z | 1380 | bearish | bearish | SHORT | NO_TRADE | ACTIVE | NONE |

At session end, entryStatus=ACTIVE but pipeline verdict still NO_TRADE (data_quality gate fires before interpretation).

### Baseline-path pipeline dump (with chartSnapshot candles)

| Cutoff | dataQ | structure | long/short supported | verdict | entryStatus |
|--------|-------|-----------|---------------------|---------|-------------|
| syn 14:20 | missing | unknown | false/false | NO_TRADE | WAIT |
| nq 14:30 | missing | unknown | false/false | NO_TRADE | WAIT |
| nq 20:59 | missing | unknown | false/false | NO_TRADE | ACTIVE |

With `source: "tv_export"` + 80 candles on NQ: dataQ=**stale**, verdict still NO_TRADE.

## Root cause (layered)
1. **Primary:** Replay CLI uses a bias-only heuristic (`deterministic` source) that always emits directional verdicts; it does not run Phase 1 decision/execution gates.
2. **Secondary:** Baseline correctly runs Phase 1 but historical replay cannot pass live data-quality gates (`missing` from `source:none`, or `stale` from wall-clock age vs cutoff bars).
3. **Not the cause:** ACTIVE entry gate alone — at NQ session end entryStatus=ACTIVE but verdict is already NO_TRADE. Dataset characteristics (MSS, bias) differ between paths but are irrelevant because pipeline never reaches interpretation on historical data.

## Regression test
Added `test9ReplayDeterministicVsBaselineDivergence` in `scripts/test-research-baseline.ts`:
- Asserts deterministic replay always LONG\|SHORT on synthetic samples
- Asserts full pipeline returns NO_TRADE on same cutoffs
- Asserts baseline produces zero setups
- Tags `source === "deterministic"`

Diagnostic script: `scripts/research-compare-pipelines.ts` (stage-by-stage table).

## Tests + build
| Command | Result |
|---------|--------|
| `npm run test:research-baseline` | **26/26 PASS** (incl. new test9) |
| `npm run test:research-backtest` | 26/26 PASS |
| `npm run test:research-dataset` | 51/51 PASS |
| `npm run test:research-dataset-replay` | 20/20 PASS |
| `npm run test:research-replay` | 26/26 PASS |
| `npm run build` | PASS (after fixing incremental.ts import) |

## Confidence
**High** on falsification — direct code trace + stage comparison at equivalent cutoffs. Replay LONG/SHORT is **not** comparable to baseline setup counts without aligning paths.

## Next task
**`research-baseline-historical-data-quality`** (new, priority 32): Research-only fix — score chart quality at cutoff `asOf` (not `Date.now()`), use `tv_export` source in baseline strategy chartSnapshot, verify pipeline can reach LONG/SHORT/WAIT on NQ timestamps before chunked full baseline.

**Keep queued:** `research-baseline-chunked-execution` — do not run full 1381-bar NQ until historical data-quality alignment is resolved.

## Artifacts
- `scripts/research-compare-pipelines.ts`
- `scripts/test-research-baseline.ts` (test9)
- `lib/research/backtest/incremental.ts` (import fix)

STOP.
