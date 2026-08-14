# Karen Edge Validation — NQ Aug 12 2026

**Task:** karen-edge-validation-nq-aug12  
**Date:** 2026-08-13  
**Status:** COMPLETE (read-only analysis; no code changes, no commits)

## Primary question

Does Karen have a real, repeatable, out-of-sample edge?

**Answer: INCONCLUSIVE for positive edge. Evidence decreases confidence in any demonstrated tradable edge.**

Replay snapshots show directional calls (LONG/SHORT), but the honest baseline backtest (Phase 1 pipeline — the only valid strategy measurement) produces **zero setups** on real NQ data. Without completed trades, win rate, expectancy, and drawdown are undefined. A single session cannot support repeatability claims.

---

## State check (incremental pilot 69ac13d9)

| Item | Status |
|------|--------|
| Run ID | `baseline-2026-08-13T17-48-11-508Z` |
| Dataset | `nq-aug12-2026-cme` / `2562961408b256ac94f1` |
| Mode | `--incremental --chunk-size 100` (14 chunks, 1381 bars) |
| Progress at report time | **5/14 chunks complete** (~500 bars, 36%); still running in background |
| Setups so far | **0** (chunks 0–4) |
| Partial fingerprint | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` (empty setup list hash) |

No duplicate full baseline started. Prior synthetic full baseline (`baseline-2026-08-13T17-43-01-244Z`) is on `synthetic-ny-am`, not real NQ.

**Does this evidence increase or decrease confidence?** → **Decreases** — partial real-data run confirms zero setups through NY-open region; no counter-evidence emerging.

---

## Dataset context

| Field | Value |
|-------|-------|
| Symbol | NQ (MNQ-equivalent) |
| Bars | 1381 (1m) |
| Period | CME globex session Aug 12 → Aug 13 2026 |
| Validation | **WARNING** — 60 min session-boundary gap (user-approved) |
| Data source | TickStream historical |

Proposed TRAIN/TEST split (`--test-start 2026-08-12T14:30:00.000Z`, NY RTH open):

| Split | Window | Bars (approx) |
|-------|--------|---------------|
| TRAIN | Pre–14:30 UTC (overnight globex) | 991 (idx 0–989) |
| TEST (OOS) | 14:30 UTC → session end | 391 (idx 990–1380) |

---

## Experiment 1 — Phase 1 baseline backtest (honest strategy measurement)

**What is measured:** `createPhase1DecisionPipelineStrategy.detectSetup` — observation → interpretation → decision → execution scaffold. Only LONG/SHORT with `entryStatus === ACTIVE` become setups. This is the authoritative edge test.

| Metric | FULL (partial 500/1381 bars) | TRAIN (partial) | TEST/OOS (partial) |
|--------|------------------------------|-----------------|---------------------|
| **SAMPLE** | nq-aug12-2026-cme, incremental pilot | Bars 0–499 (subset of TRAIN window) | Not yet reached (starts ~bar 990) |
| **PERIOD** | Aug 12 globex (partial) | Pre-NY-open portion only | NY open → close (not yet processed) |
| **SETUPS** | 0 | 0 | 0 (projected; pipeline gate applies all bars) |
| **LONG** | 0 | 0 | 0 |
| **SHORT** | 0 | 0 | 0 |
| **WINS** | 0 | 0 | 0 |
| **LOSSES** | 0 | 0 | 0 |
| **EXPECTANCY** | 0 R (no trades) | 0 R | 0 R |
| **WIN RATE** | n/a | n/a | n/a |
| **MAX DRAWDOWN** | 0 R | 0 R | 0 R |
| **COST ASSUMPTIONS** | Perfect limit fill at scaffold anchor; no commission/slippage in `outcome.ts`; intrabar stop+target → AMBIGUOUS | Same | Same |
| **OOS RESULT** | Not yet isolated; 0 setups expected in TEST given root cause | — | 0 setups expected |
| **CONFIDENCE** | High that count is truly zero (not a sampling artifact) | — | — |
| **FALSIFICATION RESULT** | **Zero setups → edge INCONCLUSIVE, not positive.** Root cause confirmed: `chartSnapshot.source: "none"` → `obs.data_quality === "missing"` → decision-layer returns `NO_TRADE` on every bar before interpretation/entry gates run. |

**Root cause (prior falsification `research-synthetic-vs-replay-setups`, reproduced on NQ cutoffs):**

```
decision-layer.ts: if (obs.data_quality === "missing" || obs.data_quality === "stale") → NO_TRADE
phase1-decision-pipeline.ts: chartSnapshot.source = "none" → always missing on historical bars
```

Even at NQ 20:59 (replay shows `entryStatus=ACTIVE`), pipeline verdict is still `NO_TRADE` due to data-quality gate — ACTIVE entry gate never reached.

**Does this evidence increase or decrease confidence?** → **Decreases sharply** — the strategy measurement path cannot emit trades on historical data in current form.

---

## Experiment 2 — Synthetic baseline control (same pipeline, clean data)

| Metric | FULL | TRAIN | TEST/OOS |
|--------|------|-------|----------|
| **SAMPLE** | synthetic-ny-am, 120 bars | 84 bars | 36 bars |
| **PERIOD** | 2026-08-12 13:30–15:29 UTC | 13:30–14:53 | 14:54–15:29 |
| **SETUPS** | 0 | 0 | 0 |
| **LONG** | 0 | 0 | 0 |
| **SHORT** | 0 | 0 | 0 |
| **WINS** | 0 | 0 | 0 |
| **LOSSES** | 0 | 0 | 0 |
| **EXPECTANCY** | 0 R | 0 R | 0 R |
| **WIN RATE** | n/a | n/a | n/a |
| **MAX DRAWDOWN** | 0 R | 0 R | 0 R |
| **COST ASSUMPTIONS** | Same as Experiment 1 | Same | Same |
| **OOS RESULT** | 0 setups in TEST window | — | Confirms pipeline produces no trades even on VALID synthetic data |
| **CONFIDENCE** | High (full run complete, repro PASS) | — | — |
| **FALSIFICATION RESULT** | Synthetic control also zero — not an NQ-data artifact alone; pipeline + data-quality path blocks all historical setups. |

**Does this evidence increase or decrease confidence?** → **Decreases** — Karen Phase 1 baseline has never produced a single setup in any completed baseline run.

---

## Experiment 3 — Replay deterministic signals (separate source, NOT edge measurement)

**What is measured:** `buildDeterministicKarenResponse` (bias/MSS heuristic). **Not comparable to baseline.** Documented in `research-synthetic-vs-replay-setups`.

| Metric | NY open 14:30 UTC | Session end 20:59 UTC |
|--------|-------------------|------------------------|
| **SAMPLE** | 991 bars at cutoff | 1380 bars at cutoff |
| **PERIOD** | Aug 12 2026, single session | Same session |
| **SETUPS** | n/a (not baseline) | n/a |
| **LONG** | 1 (deterministic verdict) | 0 |
| **SHORT** | 0 | 1 (deterministic verdict) |
| **WINS / LOSSES** | Not evaluated (no baseline outcome path) | Not evaluated |
| **EXPECTANCY** | n/a | n/a |
| **WIN RATE** | n/a | n/a |
| **MAX DRAWDOWN** | n/a | n/a |
| **COST ASSUMPTIONS** | n/a — directional label only, no fill simulation | n/a |
| **OOS RESULT** | n/a — point-in-time snapshots, not walk-forward | Intraday flip LONG→SHORT same day |
| **CONFIDENCE** | High on replay determinism; **zero** on tradable edge | — |
| **FALSIFICATION RESULT** | **FALSIFIED as strategy edge evidence.** Replay always emits LONG or SHORT; full pipeline emits NO_TRADE on same cutoffs. Using replay verdicts to claim edge would be cherry-picking a non-strategy path. |

Snapshots: `replay-2026-08-13T14-38-22-907Z` (LONG @ 29907.5), `replay-2026-08-13T14-47-14-461Z` (SHORT @ 29805.75).

**Does this evidence increase or decrease confidence?** → **Decreases** if mistakenly treated as edge; **neutral** when correctly labeled as non-strategy diagnostic only.

---

## Experiment 4 — Cost / slippage sensitivity

| Metric | Value |
|--------|-------|
| **SAMPLE** | n/a — zero baseline setups to stress-test |
| **PERIOD** | n/a |
| **SETUPS** | 0 |
| **COST ASSUMPTIONS** | `lib/research/backtest/outcome.ts`: perfect fill at entry anchor; R = (exit−entry)/risk; **no commission, no slippage, no partial fills**. Intrabar stop+target → AMBIGUOUS (no tick order). |
| **OOS RESULT** | n/a |
| **CONFIDENCE** | n/a |
| **FALSIFICATION RESULT** | Cannot run cost sensitivity without setups. Even optimistic (zero cost) assumption does not rescue zero-trade result. |

**Does this evidence increase or decrease confidence?** → **Neutral** — no trades to degrade.

---

## Falsification checklist

| Test | Result |
|------|--------|
| Zero setups? | **YES** → edge INCONCLUSIVE, not positive |
| Single session? | **YES** (1 globex day) → cannot claim repeatable edge |
| TRAIN vs TEST | Both 0 setups (synthetic full; NQ partial + projected) — no OOS degradation because no in-sample signal either |
| Replay vs baseline alignment? | **FALSIFIED** — different code paths |
| Cherry-picking? | Avoided — used Phase 1 pipeline only for edge claim |
| Karen modified for better numbers? | **No** |

---

## Overall verdict

| Question | Answer |
|----------|--------|
| Real edge? | **No evidence of one** |
| Repeatable? | **Cannot assess** (0 trades, 1 session) |
| Out-of-sample? | **0 OOS setups** |
| Does evidence increase or decrease confidence in genuine edge? | **NEGATIVE / INCONCLUSIVE** |

**Summary:** Karen's Phase 1 decision pipeline — the only honest backtest path — produces **zero tradable setups** on real NQ Aug 12 data (confirmed partial incremental run) and on synthetic control data (full run). Replay LONG/SHORT snapshots are **deterministic bias labels**, not strategy outcomes, and must not be used as edge evidence. Until the pipeline can pass its own data-quality gates on historical bars and emit at least one LONG/SHORT setup with measurable outcomes, **no positive edge claim is supportable**.

---

## Incremental run note

Background run `baseline-2026-08-13T17-48-11-508Z` may complete later. Resume if interrupted:

```bash
npm run research:baseline -- --dataset nq-aug12-2026-cme --incremental --chunk-size 100 --resume baseline-2026-08-13T17-48-11-508Z
```

Expected completion outcome: **0 setups** (root cause is per-bar data-quality gate, not chunk sampling). Completing the run would confirm fingerprint/repro gates but would not change the edge conclusion.

---

## Next task

**None queued.** Edge validation is conclusively blocked at zero setups. Multi-day data or cost sensitivity would not answer the edge question until the Phase 1 pipeline can emit trades on historical bars — that is a pipeline/data-quality alignment issue, not edge validation. Per hard stop: no infrastructure tasks manufactured.

STOP.
