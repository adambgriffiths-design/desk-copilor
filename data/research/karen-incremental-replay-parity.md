# Karen incremental research replay parity

**Date:** 2026-08-15  
**Dataset:** `nq-aug12-2026-cme` (6 checkpoints + 8 sequential bars, single process)  
**Scope:** Research replay harness only — no architecture-v1 / trading-logic / production Karen changes.

---

## FINAL REPORT

| Field | Value |
|-------|-------|
| **IMPLEMENTED** | YES — `mode: CURRENT \| OPTIMIZED` on research replay (`evaluateArchitecturesAtCutoff`, `ReplayEngine`, historical experiment) |
| **CURRENT TIME** | **12.44 s** context build (6 checkpoints, fresh CURRENT each) |
| **OPTIMIZED TIME** | **21.01 s** context build (6 checkpoints, one session) |
| **E2E eval (1 checkpoint)** | CURRENT **6.71 s** / OPTIMIZED **0.02 s** (`evaluateArchitecturesAtCutoff` v1) |
| **CURRENT ms/bar** | 789.7 ms (sequential 8 bars, full rebuild path) |
| **OPTIMIZED ms/bar** | 308.5 ms (sequential 8 bars, syncSeries/applyClosedBar) |
| **ACTUAL SPEEDUP** | **0.59×** checkpoint total (CURRENT ÷ OPTIMIZED); bar walk **2.56×** |
| **PARITY** | **PASS** |
| **FIRST DIVERGENCE** | none |
| **PIT** | **PASS** — 6/6 poisons unchanged at T (barIndex=812) |
| **MEMORY (RSS / heap MB)** | start 85.4/19.9 → end 1599.1/29.6 |
| **CPU** | Single-threaded Node (~100% one core during context build) |
| **RECOMMENDATION** | Parity PASS + PIT PASS but OPTIMIZED not faster on this benchmark (12.4s vs 21.0s). Keep default CURRENT. |

---

## Checkpoint parity detail

| # | barIndex | asOf (UTC) | pass | first divergent field |
|---|--------:|---|:---:|:---|
| 1 | 248 | 2026-08-12T02:08:00.000Z | PASS | — |
| 2 | 436 | 2026-08-12T05:16:00.000Z | PASS | — |
| 3 | 624 | 2026-08-12T08:24:00.000Z | PASS | — |
| 4 | 812 | 2026-08-12T11:32:00.000Z | PASS | — |
| 5 | 1000 | 2026-08-12T14:40:00.000Z | PASS | — |
| 6 | 1188 | 2026-08-12T17:48:00.000Z | PASS | — |

---

## Mode wiring

| Component | CURRENT | OPTIMIZED |
|-----------|---------|-----------|
| `evaluateArchitecturesAtCutoff` | `ReplayDataCutoff.buildContextAtBarIndex` | `ResearchContextSession` → `IncrementalMarketEngine.syncSeries` |
| `ReplayEngine` | Full rebuild per cursor | Incremental session + cache |
| `runHistoricalExperiment` | Default `resolveResearchReplayMode()` → **CURRENT** | Set `RESEARCH_REPLAY_MODE=OPTIMIZED` or `--mode OPTIMIZED` |
| Default | **CURRENT** (explicit default; opt-in only) | Parity **PASS** on Aug-12 benchmark — set `RESEARCH_REPLAY_MODE=OPTIMIZED` for sequential replay |

---

## Evidence class

**INFRASTRUCTURE / DEBUGGING** — not EDGE EVIDENCE. Small controlled fixture only; no 6-month replay run.

No commit / push / deploy.
