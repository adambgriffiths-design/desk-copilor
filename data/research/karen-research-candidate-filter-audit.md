# Karen research replay — candidate-filter audit

**Date:** 2026-08-14  
**Scope:** Analysis + small benchmark only. No optimizations implemented. No trading-semantics changes. No commit/push/deploy.  
**Coordinates with:** in-flight performance audit (`cursor-performance-audit.md`, `live-pipeline-profile.md`, `scripts/profile-research-pipeline-audit.ts` fixture `nq-aug12-2026-cme`).  
**Benchmark artifacts:** `data/research/karen-candidate-filter-benchmark.json`, `data/research/karen-candidate-scan-only.json`, `scripts/bench-candidate-filter-audit.ts`, `scripts/bench-candidate-scan-only.ts`.

**Question:** Can research replay skip expensive `buildMarketContextAt` + `DecisionEnvelope` on non-candidate minutes without missing architecture-v1 actionable states?

**Short answer:** **Not safe to enable yet.** On the measured Aug 12 NY AM window, every tested cheap filter either fires on **100%** of bars (no speedup) or fires on **0%** (would miss if proximity were the only gate). Recall was 100% on a 12-checkpoint sparse sample only because filters never skipped anything. WAIT compression is PIT-feasible for ~9% of consecutive wait/flat bars but cannot fire when bar-anatomy deltas exist every minute.

---

## CURRENT FULL REPLAY COST

Source stack (frozen semantics, architecture-v1 identity):

```
ReplayDataCutoff.buildContextAtBarIndex  →  buildMarketContextAt
  → buildKarenReplayResponse             →  runDeskPipeline
  → buildDecisionEnvelope                →  architecture-v1 trace
```

| Metric | Source | Value |
|--------|--------|-------|
| NQ Aug 12 dataset | `2562961408b256ac94f1` | 1381 × 1m bars |
| `buildMarketContextAt` (profile, less loaded) | `live-pipeline-profile.md` | **~8.6 s** / snapshot |
| Observation → envelope (same profile) | same | **< 4 ms** each stage |
| **Dominant cost** | same | context rebuild (~95%+ of checkpoint time) |
| Full-day extrapolation (profile rate) | 1381 × ~10 s | **~3.8 h** / day |
| Full-day extrapolation (this benchmark, loaded box) | 1381 × ~17 s | **~6.5 h** / day |
| NY AM 90 min window (this benchmark) | 90 checkpoints | **~26 min** baseline if every minute evaluated |
| Memory (90-min eval pass) | benchmark | RSS 86 → 758 MB |

**Bottleneck 1:** `buildMarketContextAt` (~15.8 s avg ctx in sparse benchmark vs ~8.6 s in earlier profile — machine was CPU/RAM saturated per `cursor-performance-audit.md`).

**Bottleneck 2:** On Aug 12 NY AM, architecture-v1 stance mix was **100% wait/flat** (10 flat, 2 wait on 12 sparse checkpoints; no long/short/monitor). Large inactive-WAIT/FLAT regions dominate calendar time even when compute is spent every minute.

---

## CANDIDATE FILTER OPTIONS

Two-stage model investigated (not implemented):

| Stage | Purpose | Candidate implementations tested |
|-------|---------|----------------------------------|
| **Stage 1 — cheap PIT scan** | Decide whether Stage 2 runs | Incremental-engine structure events; daily PDH/PDL/PDC proximity; bar displacement; price crossing daily levels; composite OR; PIT wait-compression skip |
| **Stage 2 — expensive** | Full checkpoint | `buildContextAtBarIndex` + desk pipeline + `buildDecisionEnvelope` (architecture-v1) |

**Important:** Stage 1 using `createIncrementalMarketEngine().applyClosedBar()` is **not cheap on NQ** — it still calls `buildStructureFacts`, EQH 720, and often full context paths. Measured **~2.4 s/bar** on the 90-bar NY AM scan (216 s total). That is ~14% of full checkpoint cost, not a 100× reduction.

### Filter selectivity — full 90-bar NY AM scan (`karen-candidate-scan-only.json`)

| Filter | Candidate rate | Would skip full eval? |
|--------|----------------|------------------------|
| `engine_events` (`shouldRunKarenAnalysis`) | **100%** | No |
| `bar_anatomy` (range/close delta thresholds) | **100%** | No |
| `daily_proximity` (±8 pt of PDH/PDL/PDC) | **0%** | Yes — but price never near those levels in this window |
| `price_cross_levels` (`majorLevelInteraction`) | **0%** | Yes — same reason |
| `composite_safe` (OR of above) | **100%** | No |
| `wait_compression_pit` (skip stable wait + no input delta) | **0% skips** | No — bar_anatomy / engine events fire every bar |

**Why `engine_events` is always true:** `afterClosedBar` runs `rebuildOneMinuteStructure({ eqhForce: true })` and `finishUpdate` diffs structure state. On active NQ minutes, `level_interaction`, `bias_change`, or pool/FVG diffs emit events in `ANALYSIS_KINDS` (`lib/analysis-triggers.ts`) nearly every bar.

---

## SAFE CANDIDATE SIGNALS (PIT-only, existing code)

These can be computed without future bars or outcome labels:

| Signal | Source | PIT-safe? | Selectivity on Aug 12 NY AM |
|--------|--------|-----------|------------------------------|
| Structure event diff | `incremental-market-engine` → `shouldRunKarenAnalysis` | **Yes** — same policy as live | **Poor** (100% fire) |
| `majorLevelInteraction` | `lib/analysis-triggers.ts` vs tracked level prices | **Yes** — uses only prev/curr close | **Poor** here (0% — price away from daily PD) |
| Session / hour boundary | `getEstMinutes` on consecutive bars | **Yes** | Fires every minute (minute change) — not selective alone |
| Bar displacement proxy | Current bar range / close delta vs prior | **Yes** | **Poor** (100% on NQ 1m) |
| Daily PDH/PDL/PDC proximity | `daily` slice ≤ T, previous day H/L/C | **Yes** | **Context-dependent** (0% NY AM; would fire near PD arrays) |
| MSS / FVG / sweep **formation** events | `structure-state` diff kinds: `mss`, `fvg_formed`, `liquidity_swept`, etc. | **Yes** if from incremental diff, not relabeled outcomes | Not selective when bundled with per-bar structure rebuild |
| Entry-prerequisite **detection** (not verdict) | e.g. FVG present, displacement flag in `structureFacts` | **Yes** at T | Requires Stage 2 context to compute — not cheaper than Stage 2 today |
| HTF/LTF **change** | `bias_change` event | **Yes** | Subsumed by engine events (already 100%) |

**Live parity note:** Production already gates Karen analysis on structure events (`shouldRunKarenAnalysis`) while ticks update state continuously. Research replay evaluating every minute **does strictly more work** than the live event-gated path.

---

## UNSAFE FILTERS (must never gate Stage 2)

| Filter | Why unsafe |
|--------|------------|
| Swing confirmed **before** confirmation delay elapsed | Uses future bars inside confirmation window |
| Liquidity **swept** / target **reached** / invalidation **hit** | Outcome labels — post-T |
| Verdict or stance from **forward** bars | Hindsight |
| “Setup missed” inferred from later fill | Future information |
| Skipping because later checkpoint stayed WAIT | Future envelope |
| EQH/EQL 720 full scan as “cheap” Stage 1 without incremental proof | Same cost as context rebuild (~0.8 s+ in profile) |
| Session liquidity **outcome** (raid succeeded) | Outcome, not observation-at-T |
| Any filter using `forwardBarsAfter` / rich outcome labels | Explicitly post-lock |

---

## Actionable definition (architecture-v1, research recall)

Per `karen-decision-architecture.md` + `buildDecisionEnvelope` / `resolveStance`:

| Baseline classification | Rule used in benchmark |
|-------------------------|------------------------|
| **Actionable directional** | `stance ∈ {long, short}` **and** `thesis.complete === true` |
| **Actionable wait** | `stance === wait` **and** named trigger (`entry_zone` **or** pipeline `LONG`/`SHORT` with wait mapping) |
| **Actionable monitor** | `stance === monitor` |
| **Not actionable (NO SETUP YET)** | `flat` stay-out; `wait` without trigger; incomplete thesis demoted to wait/monitor |

**Recall requirement:** 100% of baseline-**actionable** checkpoints must remain Stage-2 candidates. Skipping non-actionable flat/wait-without-trigger is **OK** and is the intended compute win.

**NO SETUP YET vs SETUP WAS MISSED**

| Case | Meaning | Filter error? |
|------|---------|---------------|
| **NO SETUP YET** | Baseline `flat` or untriggered `wait`; no complete thesis | Safe to skip if recall metric excludes these |
| **SETUP WAS MISSED** | Baseline actionable but Stage 1 skipped | **Recall failure** — blocks research use |

On Aug 12 NY AM sparse sample: **2 / 12** checkpoints actionable (both `wait` with triggers). All filters retained them (0 missed). **No SETUP WAS MISSED** events — but only because nothing was skipped.

---

## BASELINE RUNTIME (measured)

**Fixture:** `nq-aug12-2026-cme` (`2562961408b256ac94f1`)  
**Window:** Aug 12 2026, NY AM 09:30–11:00 EST (90 × 1m bars)  
**Eval mode:** 12 sparse checkpoints evenly spaced across the 90-bar window (full engine walk on all 90 bars for Stage-1 probe)

| Mode | Checkpoints evaluated | Total ms | Avg ms / checkpoint |
|------|----------------------|----------|---------------------|
| Baseline (Stage 2 every sparse checkpoint) | 12 | 207,010 | **17,251** (15,803 ctx + 1,448 pipeline) |
| Engine Stage-1 pass (90 bars, no envelope) | 90 bars walked | 216,912 | **2,410** / bar |

Extrapolation to **every-minute baseline** on this 90-bar window:  
90 × 17.3 s ≈ **26 min** (consistent with partial 90/90 run averaging ~14 s ctx before OOM/time limit).

Cross-check with `live-pipeline-profile.md` (less contended machine): 8575 ms ctx → 90 × ~10 s ≈ **15 min** for same window.

---

## ESTIMATED CANDIDATE RUNTIME

Using measured rates and full-window selectivity:

| Strategy | Full-eval count (of 90) | Est. total time (90 min window) | Speedup vs baseline |
|----------|---------------------------|----------------------------------|---------------------|
| Every minute (baseline) | 90 | **~26 min** (loaded) / **~15 min** (profile rate) | 1× |
| `composite_safe` | 90 (100% candidate) | baseline + 216 s engine pass ≈ **29 min** | **0.9× (slower)** |
| `daily_proximity` only | 0 | 0 + engine pass ≈ **3.6 min** | **~7×** — **unsafe**: 0% recall not tested; would skip all 90 including 2 actionable waits |
| `wait_compression_pit` | 90 (0 skips observed) | same as composite | 1× |
| Hypothetical 30% candidate rate at profile ctx cost | 27 | 27×10 s + 90×0.05 s ≈ **4.5 min** | **~3.3×** — **not demonstrated** on this day |

Full CME day (1381 bars): baseline **~3.8–6.5 h** depending on load. With **0% demonstrated skip rate**, candidate mode saves **nothing** today.

---

## DECISION RECALL

| Sample | Actionable baseline | Filters tested | Missed actionable | Recall |
|--------|--------------------:|----------------|------------------:|-------:|
| 12 sparse checkpoints, NY AM 90 window | 2 (wait + trigger) | 8 | **0** | **100%** |

**Caveat:** 100% recall here is **vacuous** — every filter selected all 12 sparse checkpoints. This does **not** prove safe filtering; it proves filters were not selective on this sample.

**Not proven (blocking):**

- Recall on minutes where baseline transitions into/out of actionable wait/monitor/long/short
- Recall on days with active long/short episodes (Aug 12 baseline had **0** directional envelopes in NY AM)
- Recall when `daily_proximity`-only or aggressive wait compression **does** skip minutes
- Envelope identity at skipped minutes (WAIT compression must reuse prior envelope exactly — not verified at scale)

---

## MISSED STATES

### Observed in benchmark

| Type | Count | Detail |
|------|------:|--------|
| SETUP WAS MISSED (actionable skipped) | **0** | No filter skipped any sparse checkpoint |
| NO SETUP YET (non-actionable flat/wait) | 10 / 12 sparse | Dominated session; safe to skip **if** filter selectivity > 0 and recall golden tests pass |

### Structural miss risk (analysis, not observed)

| Scenario | Risk if filtered |
|----------|------------------|
| First minute of actionable `wait` with trigger after long flat run | High for `wait_compression_pit` if input delta thresholds too coarse |
| `monitor` stance when setup forming but bar_anatomy quiet | Medium — displacement thresholds may not fire on inside bars |
| Long/short with complete thesis near EQH/EQL not in daily proximity set | High for PD-only Stage 1 |
| Session liquidity approach without daily PD proximity | High for `daily_proximity`-only |

Aug 12 NY AM had **no long/short/monitor** checkpoints — the highest-risk episodes were **not exercised**.

---

## WAIT COMPRESSION (PIT feasibility)

**Proposal:** Reuse prior `DecisionEnvelope` when consecutive checkpoints share market-state input fingerprint and envelope fingerprint, until cheap input changes.

| Metric | Value | Source |
|--------|-------|--------|
| Wait/flat/monitor bars (sparse 12-ckpt chain) | 11 | benchmark |
| Consecutive identical envelope fingerprint | 1 pair (**9.1%**) | benchmark |
| PIT skips with cheap fingerprint unchanged (90-bar scan) | **0%** | scan-only — bar_anatomy / engine events every bar |
| Pipeline stages safe to reuse | Envelope + trace only if ctx/observation hash unchanged | analysis |
| Must re-eval when | Any `ANALYSIS_KINDS` event, level cross, session change, displacement, price-derived bias/session extreme update | `analysis-triggers.ts`, incremental engine |

**Verdict:** PIT wait compression is **theoretically sound** but **not materially helpful** on Aug 12 NY AM because cheap input fingerprints change every minute. Could help in quiet inside-bar stretches (~9% envelope-stable pairs) **only if** bar-anatomy threshold is tightened — tightening risks SETUP WAS MISSED.

**Unsafe:** Reusing envelope when only stance text matches but observation liquidity status changed (e.g. level moved TESTED → SWEPT) without diffing observation hash.

---

## RECOMMENDED APPROACH

**Do not implement two-stage candidate filtering for research replay yet.** Wait for explicit approval after stronger evidence.

### Phase A — Evidence before filtering (required)

1. **Recall golden harness** on days with known actionable windows (long/short/monitor + triggered wait), not Aug-12-flat-only. Use `minute-replay` actionable windows as oracle labels.
2. **Prove envelope identity:** at skipped minutes, reused envelope must byte-match recomputed baseline (fingerprint gate).
3. **Measure selectivity on volatile days** — candidate rate must be ≪ 100% on at least one held-out session before estimating multi-month savings.

### Phase B — If recall passes (implementation order)

1. **Reuse context, not skip logic first:** Wire research replay to incremental engine snapshots where PIT parity is already proven (`test-live-replay-parity.ts`). That attacks bottleneck 1 without skipping minutes.
2. **Stage 1 must be ≪ 50 ms/bar:** Raw bar + daily slice + session clock + debounced level-cross bitmap — **not** full incremental EQH 720 rebuild per bar.
3. **Stage 1 trigger set:** Start from `ANALYSIS_KINDS` **minus** always-on noise; require debounce (e.g. don’t treat every `level_interaction` tick as unique if price unchanged). Add session-liquidity proximity from **cached** level prices at T.
4. **Stage 2 unchanged:** Full `buildKarenReplayResponse` + architecture-v1 envelope at candidates only.
5. **WAIT compression as optional layer** after candidate gating works — reuse envelope only when `fingerprintEnvelope(prev) === computed` would match and cheap input hash unchanged.

### Phase C — Multi-month research policy (orthogonal win)

Continue **checkpoint sampling** (`lib/research/mentor/checkpoint-selection.ts`, sparse architecture eval) for months-scale studies. Do **not** run per-minute full eval across months regardless of filtering.

### Smallest immediate operational win (no code)

Per `cursor-performance-audit.md`: run **at most one** heavy replay/parity job on the 8 GB machine. Duplicate workers were consuming ~30% CPU and forcing hard paging — inflating the ~17 s/checkpoint numbers in this audit.

---

## Scripts (analysis-only, not production)

```bash
# Sparse baseline + recall (12 eval / 90 engine bars)
npx tsx scripts/bench-candidate-filter-audit.ts --window ny-am-90 --sparse 12 --warmup 60

# Full-window Stage-1 selectivity only (~3.6 min)
npx tsx scripts/bench-candidate-scan-only.ts
```

---

## Related docs

- `data/research/karen-decision-architecture.md` — stance, thesis, actionable naming  
- `data/research/live-pipeline-profile.md` — `buildMarketContextAt` ~8.6 s  
- `data/research/cursor-performance-audit.md` — machine contention, duplicate replay workers  
- `lib/analysis-triggers.ts` — live Karen gating policy  
- `lib/research/mentor/minute-replay.ts` — actionable window oracle for future recall tests
