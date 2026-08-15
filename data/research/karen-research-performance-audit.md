# Karen research performance audit

**Date:** 2026-08-14  
**Scope:** Profile-only. No trading-semantics changes, no `architecture-v1` changes, no optimizations implemented, no commit/push/deploy.  
**Evidence class:** **INFRASTRUCTURE / DEBUGGING** — not EDGE EVIDENCE.

---

## BASELINE

### Methodology

| Item | Value |
|------|--------|
| **Process** | Single Node process (`npx tsx scripts/profile-research-pipeline-audit.ts`) |
| **Machine** | Windows dev box (same class as prior live-pipeline audit; ~99% CPU during long runs reported elsewhere) |
| **Dataset** | `nq-aug12-2026-cme` (`2562961408b256ac94f1`, **1 CME session-day**, 1381 1m bars) |
| **Checkpoints** | **6** evenly spaced bar indices (248 → 1188), after 60-bar warmup — **not** full-day minute replay |
| **Timer** | `performance.now()` wall time per stage |
| **Warmup** | First checkpoint pays module load; dataset load measured separately |
| **Raw artifact** | `data/research/karen-research-performance-profile.json` |

Prior cross-checks (not re-run here): `data/research/live-pipeline-profile.md` (NQ 1381-bar `buildMarketContextAt` ≈ **8575 ms** avg), `data/supervisor/results/research-mentor-minute-replay-nq-week.json` (sustained Phase-1 loop **4213 ms/eval** over 1321 bars).

### End-to-end research checkpoint (measured)

One **architecture-v1** decision at cutoff T via `evaluateArchitecturesAtCutoff`:

| Metric | Value |
|--------|--------|
| **Avg per checkpoint** | **10,221 ms** (6 checkpoints) |
| **Range (implied)** | ~7.5 s early day → ~10+ s late day (bar-index scaling) |
| **Dominant stage** | `buildContextAtBarIndex` inside evaluator (~96% of checkpoint) |

Phase-1 pipeline alone (`buildMarketState` → observation → interpretation → decision → execution): **~80 ms** per checkpoint — **not** the bottleneck.

### Memory & I/O (measured)

| Resource | Start | End (after 6 checkpoints + 8 sequential bars + incremental probe) |
|----------|-------|---------------------------------------------------------------------|
| **RSS** | 83 MB | 166 MB |
| **Heap** | 17 MB | 20 MB |
| **Dataset JSON load** | **725 ms** (includes fixture resolution + parse) | — |
| **Serialization** (`JSON.stringify` arch result) | **1.1 ms** avg | negligible |

I/O is **not** a blocker for on-disk fixtures (167 KB day / 830 KB week per readiness audit).

### CPU

Single-threaded JS. ~100% of one core during `buildMarketContextAt` / structure detectors. No parallel jobs were run for this audit.

---

## STAGE BREAKDOWN (6 checkpoints, avg ms per call)

Stages are timed independently at each checkpoint. **Note:** sub-stages below `buildContextAtBarIndex` are **embedded inside it** — percentages are diagnostic, not additive to the 10.2 s end-to-end path.

| Stage | Calls | Avg ms | % of summed stage time* | In default research path? |
|-------|------:|-------:|------------------------:|---------------------------|
| **architecture_evaluate_v1** | 6 | **10,221** | 41% | Yes (research harness) |
| **market_context / buildContextAtBarIndex** | 6 | **9,795** | 40% | Yes |
| **structure / buildStructureFacts** | 6 | 2,755 | 11% | Yes (inside context) |
| **structure / REH-REL** | 6 | 1,176 | 5% | Yes (inside structure facts) |
| **structure / EQH-EQL (720)** | 6 | 701 | 3% | **No** (live/incremental engine only) |
| desk_pipeline | 6 | 63 | 0.3% | Yes |
| observation + interpretation + decision | 6 | ~9 | 0% | Yes |
| candle_prep (slice prefix / sliceM1) | 6 | <0.1 | 0% | Yes |
| serialization / JSON | 6 | 1.1 | 0% | Yes (when persisting traces) |

\*Summed stage time double-counts because structure substages were also timed outside the monolithic context build.

### Mapping to requested pipeline stages

| Requested stage | Implementation | Avg ms (this run) |
|-----------------|----------------|------------------:|
| RAW DATA LOAD | `loadResearchDatasetFixture` | 725 (once) |
| Candle prep | `sliceBarsThroughIndex`, `sliceBarsAt` | <0.1 |
| Session | `recentSessionBars`, `sessionHighLowWithTimes`, `resolveSessionContext` | embedded in context (~est. 1–3 s) |
| Levels | `sliceDailyForAsOf`, `computeHtfPdArrays`, session level map | embedded in context |
| Swings | Inside MSS / structure detectors | embedded |
| EQH/EQL | `detectEqhEqlLiquidity` | 701 (not on default replay path) |
| REH/REL | `detectRelativeEqualPools` | 1,176 |
| Liquidity | `detectLiquiditySweeps`, level interactions in `buildStructureFacts` | ~3 ms sweeps + interactions in 2,755 ms bundle |
| FVG | `detectM1UnfilledFvgs`, HTF FVG in `levels.ts` | ~2 ms (1m standalone) |
| MSS/BOS | `detectMss` | ~2 ms standalone |
| HTF | m15/m5 bias, `computeHtfPdArrays`, HTF FVG | embedded in context |
| Market context | **`buildMarketContextAt` / `buildContextAtBarIndex`** | **9,795** |
| DecisionEnvelope | `runDeskPipeline` / envelope in `buildKarenReplayResponse` | 63 |
| Outcome calc | `labelRichOutcomes` (inside arch eval) | <1 ms (negligible vs context) |
| Serialization / storage | `JSON.stringify` | 1.1 |

Prior live profile (`live-pipeline-profile.md`, same NQ day) decomposed context further: **drawings ~4.8 s**, **structure ~3.0 s** — drawings are **live UI only**, not research replay.

---

## TOP 5 CPU / TIME CONSUMERS

| Rank | Function | Call count (6 cp) | Avg time | % of E2E (~10.2 s) | Cache? | Incremental? | Reuse prev state? | Changes semantics? |
|------|----------|------------------:|---------:|-------------------:|:------:|:------------:|:-----------------:|:------------------:|
| **1** | `buildMarketContextAt` via `ReplayDataCutoff.buildContextAtBarIndex` | 6 | **9,795 ms** | **~96%** | Partial (HTF maps precomputed) | **Yes** — `IncrementalMarketEngine` exists | **Yes** — rolling session/structure state | **Risk if wrong** — needs parity |
| **2** | `buildStructureFacts` (MSS, REH/REL, FVG, sweeps, level interactions) | 6 | **2,755 ms** | ~27% of context | No | **Partial** — engine skips when fingerprint unchanged | **Yes** — engine `structureRebuilds` gated | **Risk** — PIT lookbacks must match |
| **3** | `detectRelativeEqualPools` (REH/REL) | 6 | **1,176 ms** | ~12% of context | No | Theoretically (new pools only near session edge) | Rolling pool state possible | **High risk** — session scope sensitive |
| **4** | Session / HTF / daily prep inside `buildMarketContextAt` (residual) | 6 | **~5,900 ms** (est.) | ~60% of context | Session H/L for closed sessions | Rolling highs/lows per session | **Yes** for closed Asia/London | **Medium** — CME boundary correctness |
| **5** | `detectEqhEqlLiquidity(720)` | 6 | **701 ms** | N/A on default path | No | **Yes** — `eqh-eql-incremental.ts` | Engine reuses on quiet ticks (live) | **Not in research path today** |

**Not in top 5:** Decision layer, observation, interpretation, outcome labeling, JSON — all **<100 ms** combined.

---

## T → T+1 INCREMENTAL REUSE FEASIBILITY (analysis only)

### Measured sequential probe (8 bars @ index 248+, same process)

| Path | Avg ms / closed bar | vs full rebuild |
|------|--------------------:|----------------:|
| `cutoff.buildContext` (full filter slice) | **7,458** | baseline |
| `cutoff.buildContextAtBarIndex` (prefix + HTF maps) | **7,232** | **~3% faster** — prefix slice alone insufficient |
| `IncrementalMarketEngine.applyClosedBar` | **2,447** | **~3.0× faster** |

Incremental engine stats over 8 bars: `structureRebuilds=8/8`, `eqhEqlRebuilds=9/8`, `eqhEqlReused=0` — **no EQH reuse on closed-bar path in this probe**; structure still rebuilt every bar.

### What can roll forward (existing code)

| Mechanism | Location | Feasibility | Semantics risk |
|-----------|----------|-------------|----------------|
| HTF end-index maps | `buildHtfIndexMaps` in `fast-slice.ts` | **Already used** in minute replay | Low |
| Prefix slice at bar index | `buildContextAtBarIndex` | **Already used** in arch evaluator | Low — proven PIT-identical intent |
| Closed-bar incremental context | `lib/incremental-market-engine.ts` | **Exists for live**; not wired to research replay | **Medium** — must prove parity vs full rebuild at every T |
| EQH/EQL incremental | `lib/research/eqh-eql-incremental.ts` | Live engine only | Low for EQH itself; **not on research path** |
| Session level cache | Not implemented | Closed sessions (Asia, London) immutable after session end | **Medium** — NY partial session still mutates |
| Memoized `buildStructureFacts` | Partial in engine via `structureDrawingFingerprint` | Skip when last bar doesn't affect tracked levels | **High** without exhaustive parity tests |
| Checkpoint-only eval | `pickSmokeCutoffs`, mentor checkpoint sampler | **Already supported** — sparse T | None — changes coverage not semantics |

### Correctness requirement (mandatory before any opt)

Any optimization must pass **CURRENT vs OPTIMIZED parity** on:

1. Full `MarketContext` fingerprint at sampled cutoffs (≥6/session-day, including session boundaries).
2. Phase-1 pipeline verdict + envelope (`architecture-v1` identity).
3. Existing poison tests (`test:research-replay`, `test:research-decision-architecture`).

**Do not implement optimizations in this pass.**

---

## CURRENT RUNTIME TABLE (extrapolated — not run)

Assumptions:

- **Per-bar Phase-1 minute replay:** **4,213 ms/eval** — measured sustained loop, Aug 12 day, 1321 evals (`research-mentor-minute-replay-nq-week.json`).
- **Per-checkpoint architecture-v1 eval:** **10,221 ms/checkpoint** — this audit (isolated checkpoints, late-day weighted).
- **Bars per CME day:** 1,381 (Aug 12 fixture).
- **Bars per week (on disk):** 6,880.
- **Month / 3m / 6m:** linear extrapolation at 21 trading days/month, 1,381 bars/day (order-of-magnitude).

| Horizon | Bars (est.) | Phase-1 minute replay (4.2 s/bar) | Architecture checkpoint @ 6/day (10.2 s) | Architecture per-bar (10.2 s/bar) |
|---------|------------:|----------------------------------:|-----------------------------------------:|----------------------------------:|
| **1 day** | 1,381 | **1.6 h** | **~1 min** | **3.9 h** |
| **1 week** | 6,880 | **8.0 h** | **~7 min** | **19.5 h** |
| **1 month** | ~29,000 | **~34 h** | **~30 min** | **~82 h (~3.4 d)** |
| **3 months** | ~87,000 | **~4.2 d** | **~1.5 h** | **~10 d** |
| **6 months** | ~174,000 | **~8.4 d** | **~3 h** | **~20 d** |

With **incremental engine closed-bar path (2.45 s/bar, measured 8-bar probe, research wiring hypothetical):**

| Horizon | Per-bar est. |
|---------|-------------:|
| 1 day | **~56 min** |
| 1 week | **~4.7 h** |
| 1 month | **~20 h** |
| 6 months | **~5 d** |

Checkpoint mode remains the only viable default for multi-week architecture comparison until context rebuild cost drops.

---

## SECONDARY BOTTLENECKS

1. **O(n) prefix growth** — `sliceBarsAt` scans future bars; `barsInCmeSession` filters full m1 prefix every snapshot. Latent at 3–6 months even for checkpoints (`karen-research-readiness-audit.md`).
2. **REH/REL detector** — ~1.2 s/snapshot, ~12% of context; session-scoped but re-scans on every T.
3. **No architecture runner resume** — killing a multi-hour checkpoint batch loses work (unlike baseline incremental chunks).
4. **Triple architecture versions** — v2/v3 overlays are cheap clones today, but per-bar ×3 still multiplies wall time if enabled.
5. **RSS creep** — 83 → 166 MB over a short profile; multi-day loops may need explicit GC / process isolation strategy (not measured at scale here).

---

## PROPOSED OPTIMIZATIONS (recommend only — NOT implemented)

| # | Optimization | Expected speedup | Correctness risk | Basis |
|---|--------------|-----------------:|------------------|-------|
| 1 | **Wire `IncrementalMarketEngine.applyClosedBar` into research minute-replay** behind parity flag | **2.5–3×** per bar (measured 7.5 s → 2.45 s on 8 bars) | **Medium** — engine claims PIT parity; research uses different entrypoint today | Measured sequential probe |
| 2 | **Session-windowed m1 prefix** (pass only current + prior CME session bars to context builders) | **1.5–2×** at multi-week history (est.) | **High** — detectors use session-scoped lookbacks; must prove equivalence | Code inspection + readiness audit |
| 3 | **Structure rebuild gating** (skip `buildStructureFacts` when `lastBarAffectsTrackedPrices` false) | **1.2–1.5×** on quiet bars (live engine skips ticks; closed-bar probe still rebuilt 8/8) | **Medium** — trigger logic must match full rebuild | Engine stats + `structure-state.ts` |
| 4 | **REH/REL incremental pool maintenance** | **~10–15%** of context (~1.2 s → est. 0.2–0.4 s) | **High** — session boundaries | Sub-stage timing |
| 5 | **Sparse checkpoints + resume CLI for architecture traces** | **Nx** wall time reduction (Nx = bars/checkpoints) | **None** for semantics — changes sampling density only | Existing checkpoint samplers |

---

## RECOMMENDED FIRST OPTIMIZATION

**#1 — Incremental closed-bar engine in research replay with parity harness**

- **Why first:** Code already exists (`lib/incremental-market-engine.ts`); **measured 3×** speedup on sequential bars; no change to `architecture-v1` or decision math if parity holds.
- **How (future, after approval):** Add opt-in flag to `minute-replay.ts` / `evaluateArchitecturesAtCutoff`; run `test-live-replay-parity` style CURRENT vs OPTIMIZED diff on `nq-aug12-2026-cme` at ≥6 cutoffs + session boundaries; only then enable for incremental baseline chunks.
- **Expected impact:** 1-day architecture per-bar **3.9 h → ~1.3 h** (est.); week **19.5 h → ~6.5 h** (est.).
- **Do not ship without:** Parity tests passing on full context + v1 envelope fingerprint.

---

## RELATED ARTIFACTS

| File | Role |
|------|------|
| `data/research/karen-research-performance-profile.json` | Raw numbers from this audit |
| `scripts/profile-research-pipeline-audit.ts` | One-off profiler (audit tooling) |
| `data/research/live-pipeline-profile.md` | Live/tick profile; drawings + structure decomposition |
| `lib/incremental-market-engine.ts` | Incremental reuse reference implementation |
| `lib/research/replay/cutoff.ts` | `buildContextAtBarIndex` fast path |
| `data/research/karen-research-readiness-audit.md` | Scaling blockers + prior runtime estimates |

---

## SUMMARY

Research speed is dominated by **`buildMarketContextAt` (~9.8 s/checkpoint, ~96% of architecture eval)** — not decision logic (<100 ms), not I/O (<1 s load), not serialization. **`buildStructureFacts` + REH/REL (~3.9 s combined)** account for most of the context sub-cost. Prefix slicing (`buildContextAtBarIndex`) saves only **~3%** today; **`IncrementalMarketEngine` closed-bar updates measured ~3× faster** but is not wired into the research replay default. Full per-bar multi-month runs are **not viable** without incremental reuse or sparse checkpoints. **Any future optimization requires CURRENT vs OPTIMIZED parity tests** before changing production or research defaults.
