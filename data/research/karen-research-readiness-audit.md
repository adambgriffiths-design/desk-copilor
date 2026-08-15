# Karen research-readiness audit (weeks/months of NQ)

**Date:** 2026-08-14  
**Scope:** Inspect existing research/backtest pipeline. Trading logic frozen. No duplicate expensive NQ runs. No commit/push/deploy.  
**Question:** What is required to evaluate Karen across weeks/months of NQ — and what would prevent a serious multi-month experiment?

Single-day / one-week numbers below are **INFRASTRUCTURE EVIDENCE**, not EDGE EVIDENCE.

---

## CURRENTLY READY

| Layer | What exists | Paths |
|-------|-------------|--------|
| **Dataset ingestion** | TickStream ticks → 1m OHLC → validate → hashed dataset + fixture bundle. Raw NQ, no /4 scale. Chunked fetch (`chunkSeconds` default 300). | `lib/research/dataset/loader.ts`, `build.ts`, `validate.ts`, `store.ts`, `scripts/research-dataset.ts` |
| **On-disk NQ** | **1 CME day** (1381 bars, 167 KB) + **1 week** (6880 bars, 830 KB). Cheap I/O: parse week JSON **4 ms**. | `data/research-fixtures/nq-aug12-2026-cme/`, `nq-week-aug05-aug12-2026-cme/`, `data/research/datasets/2562961408b256ac94f1/`, `229d1bea359bcc6777ff/` |
| **Session handling** | CME Globex 18:00 ET session keys; `SESSION_BOUNDARY_GAP` warnings (60 min roll; weekend ~2950 min). Week fixture `integrityStatus` WARNING, not INVALID. | `lib/tickstream/htf-aggregate.ts`, `lib/research/dataset/validate.ts` |
| **Point-in-time** | `ReplayDataCutoff` slices ≤ T; `assertNoFutureLeak`; poison tests (features + architecture harness). Historical quality scored at `asOf`, not wall clock (`research_bars`). | `lib/research/replay/cutoff.ts`, `lib/research/chart-snapshot-from-bars.ts`, `scripts/test-research-replay.ts` |
| **Replay** | Isolated engine + HTF index maps + prefix slice fast path. Synthetic + NQ fixtures. | `lib/research/replay/engine.ts`, `fast-slice.ts`, `fixtures.ts` |
| **Feature construction** | PIT features from context (bias, PDH/PDL, MSS, FVG count, session H/L). Detectors use **bounded lookbacks** (MSS 80, FVG 80, sweeps 40, REH/REL session+120). | `lib/research/replay/features.ts`, `lib/structure.ts` |
| **Market-state reconstruction** | `buildMarketContextAt` + `buildMarketState` + `research_bars` snapshot. Live incremental engine exists (not the historical backtest default). | `lib/levels.ts`, `lib/market-state-build.ts`, `lib/incremental-market-engine.ts` |
| **Decision evaluation** | Production `runDeskPipeline` via `buildKarenReplayResponse`. Phase-1 baseline strategy plugin. Mentor checkpoint sampler (~12/session). | `lib/research/replay/karen.ts`, `lib/research/backtest/strategies/phase1-decision-pipeline.ts`, `lib/research/mentor/checkpoint-selection.ts` |
| **Decision traces (new)** | Research-only traces: DETECTED/USED/INFLUENTIAL, labeled HTF/tactical/execution, conflict log, visual template, fingerprints. v1 = production envelope identity. | `lib/research/architecture/*` |
| **Concept provenance** | Envelope playbook chain + PDH `CLOSED_BEYOND` + candle/tick fields. UNPROVEN ≠ taken. | `lib/decision-envelope.ts`, `lib/level-interaction.ts` |
| **Outcome labeling** | Post-lock MFE/MAE/target/invalidation; research-rich labels add liquidity reached, structure invalidation, direction-after, future vol. WAIT = counterfactual flag. | `lib/research/replay/outcome.ts`, `lib/research/architecture/outcomes.ts` |
| **TRAIN / VAL / OOS** | Chronological walk-forward (no shuffle). Architecture harness maps TEST → OOS and **forbids selecting an architecture on VAL/OOS**. | `lib/research/backtest/walkforward.ts`, `lib/research/architecture/splits.ts` |
| **Architecture versioning** | Frozen `architecture-v1` (production). v2/v3 research overlays only, `weights: none`. | `lib/research/architecture/versions.ts`, `freeze.ts`, `data/research/architecture/versions.json` |
| **Reproducibility** | Dataset `data_version` hash; baseline fingerprints; trace SHA-256 excluding clocks. | `lib/research/dataset/version.ts`, `lib/research/architecture/fingerprint.ts` |
| **Checkpoint / resume** | Incremental baseline chunks (default 100 bars) under `data/research/baseline-runs/<runId>/checkpoints`. Resume skips completed full_backtest. | `lib/research/backtest/incremental.ts` |
| **Result storage** | Datasets, fixture bundles, replay runs, baseline-runs, mentor-eval-runs. | `lib/research/paths.ts`, `store.ts`, `replay/store.ts` |
| **Mentor eval (not P&L)** | 10-criterion rubric, falsification flags, minute replay. | `lib/research/mentor/` |

**Cheap I/O probe (this audit, not a replay):** Aug 12 candles 166,734 bytes / 1381 rows / read 1 ms / parse 2 ms. Week 830,417 bytes / 6880 rows / read 3 ms / parse 4 ms. Loading is **not** the bottleneck.

---

## BLOCKERS (would prevent a serious multi-month experiment)

1. **Not enough calendar NQ on disk.** One day + one week (Aug 5–12 2026). Cannot form a later-month OOS. EDGE claims are blocked regardless of harness quality.  
   NT 1m Last cache on this machine ends **2026-05-12** and has **no `NQ 09-26`**; TickStream fixtures are Aug 2026 — gap documented in `data/research/ninjatrader-historical-investigation.md`. NT `.ncd` must not be parsed; GUI export is the path.

2. **Per-bar Phase-1 baseline does not scale.** Measured ~3.8 s/bar (scaling plan) / ~8.6 s `buildMarketContextAt` per snapshot on 1381-bar NQ (`data/research/live-pipeline-profile.md`). One-day incremental full pass **~105 min**; poison+train+test pushed **~5.6 h then killed** (`research-nq-baseline-incremental-pilot.md`). A 6-month per-bar run is not a research plan.

3. **Passing a multi-month m1 array into every snapshot.** `sliceBarsAt` is `bars.filter` (scans **future** too). `barsInCmeSession` is `m1.filter` + TZ key per bar on the **full prefix**. Detectors themselves are lookback-bounded, but session classification and prefix copies grow with history. Unbounded prefix is a latent blocker at 3–6 months even for checkpoints.

4. **TickStream tick archive for months.** Default 5-minute historical chunks. Scaling plan estimate 5–15 min fetch **per session-day** (order-of-magnitude, not re-measured). 6 months ≈ 130 sessions → hours–days of API time and quota risk. No in-repo proof of TickStream depth beyond the cached week.

5. **Architecture comparison has no durable runner + checkpoint.** Unit harness exists; there is no chunked “evaluate v1/v2/v3 × checkpoints × resume” CLI analogous to `research:baseline --incremental`. Killing a 2–5 h checkpoint batch would lose work.

6. **0 setups on Aug 12 baseline** is a methodology fact (WAIT), not a data bug — but a P&L-style backtest of “trades” will stay empty until the question is decision quality, not fill count.

---

## RISKS

| Risk | Why it matters at N days/weeks |
|------|--------------------------------|
| **Context rebuild dominates** | Observation/interpretation/decision **< 4 ms**; `buildMarketContextAt` **~8.6 s** on 1-day NQ (drawings ~4.8 s, structure ~3.0 s, EQH 720 ~0.8 s). Linear in checkpoints × that cost. |
| **Prefix-length creep** | If 6-month m1 (~182k bars) is passed whole, O(n) session filters can inflate the 8.6 s baseline. Not measured (no 6-month run). |
| **Memory copies** | Profile 1-day: RSS 165 → 337 MB during context work. Each snapshot copies prefix slices. 6-month JSON ~22 MB; object copies × checkpoints can spike RSS. |
| **Serialization** | Pretty-printed full envelopes per checkpoint × 3 architectures × 1700 checkpoints would be GBs of JSON if naively stored. Fingerprints + compact traces required. |
| **Yahoo 1m ~7 days** | Screening only. Must not become the month-scale source. |
| **Weekend/session gaps** | Week fixture: 3201 missing minutes mostly `SESSION_BOUNDARY_GAP`. Fine if labeled; dangerous if treated as holes inside RTH. |
| **`lastPipeline` global** | `runDeskPipeline` mutates module state. Traces must exclude `generated_at` / delta clocks (they do). |
| **test-analysis-contract “both sides taken”** | May fail independently. Do **not** “fix” by changing production liquidity strategy. Does not block this harness. |
| **Incremental live engine ≠ historical default** | `lib/incremental-market-engine.ts` is the live path (0.73 ms/tick synthetic). Research replay still full-rebuilds unless wired + PIT-equivalence proven. |

---

## SMALLEST FIXES (research-only)

**Implemented this pass (tiny, PIT-preserving):** `evaluateArchitecturesAtCutoff` uses `buildContextAtBarIndex` (prefix by index) instead of `sliceBarsAt` filter that scans bars **after** T. Same bars ≤ T; no detector/lookback change. File: `lib/research/architecture/evaluate.ts`.

**Designed, not implemented (needs equivalence proof — would change which history is visible if wrong):**

1. **Session-windowed PIT feed** — for checkpoint T, pass last ~5–10 CME sessions of m1 + daily HTF, not the entire multi-month prefix. Must match full-prefix PDH/NWOG/FVG on a held-out day before use.
2. **Architecture-eval checkpoint/resume** — write compact traces (fingerprint + stance + concept roles, not full envelope pretty-print) per checkpoint; resume by timestamp.
3. **Do not run per-bar baseline on months** — already policy in `research-nq-data-scaling-plan.md`. Keep it.

**Do not do:** rewrite `buildMarketContextAt`, tune weights, wire incremental engine into historical eval without PIT golden tests, parse NT `.ncd`.

---

## NEXT RESEARCH REQUIREMENT

**Acquire ≥1 month of PIT 1m NQ as a research fixture** (TickStream batched by week, **or** NinjaTrader GUI export of Minute/Last `.txt` into the existing candle loader). Then run **checkpoint-based `architecture-v1` traces on TRAIN only**.

Do **not**: pick v2/v3 from VAL/OOS, run a 6-month per-bar baseline, or change production Karen.

---

## BACKTEST SCALABILITY

**Dominant scaling cost:** `buildMarketContextAt` / structure+drawings per snapshot (~8.6 s avg on 1381-bar NQ; mentor checkpoint p50 **10,793 ms** including pipeline+rubric). **Not** dataset load (ms), **not** decision math (<4 ms), **not** outcome on a 30-bar forward window.

**Tiny safe optimization (done):** index-prefix PIT in the architecture evaluator (no future scan). **Next safe design:** session-windowed prefix after equivalence; checkpoint sampling already required.

Sources: `data/research/live-pipeline-profile.md`, `data/supervisor/results/research-nq-data-scaling-plan.md`, `research-baseline-runtime-bottleneck.md`, `research-nq-baseline-incremental-pilot.md`, this audit’s JSON parse probe. **No 6-month replay was run.**

### Horizon table (extrapolated — not fabricated 6-month timings)

Assumptions: ~1,381 1m bars/session; ~12 checkpoints/session; ~11 s/checkpoint if prefix stays ~1-day sized; per-bar baseline ~3.8–8.6 s/bar. Memory: candles JSON ~163 KB/day; 1-day context profile RSS ~337 MB peak.

| Horizon | Bars (est.) | Wall time — **checkpoints** (~12/session) | Wall time — **per-bar baseline** | Memory (est.) | Bottleneck | What breaks |
|---------|-------------|-------------------------------------------|----------------------------------|---------------|------------|-------------|
| **1 day** | 1,381 | **~2 min** (measured order: Aug 12 mentor ~2.2 min) | **~1.5–4 h** estimated; incremental full **105 min** measured; longer runs **killed** | RSS ~0.3 GB during context | `buildMarketContextAt` | Per-bar + poison + repro exceeds kill window |
| **1 week** | 6,880 (on disk) | **~12 min** if session-scoped; longer if one 6880-bar prefix | **~7–20 h** | JSON 0.8 MB; RSS grows with prefix copies | Same + prefix filters | Per-bar not viable; week-as-one-array may slow each snapshot |
| **1 month** | ~30k | **~50 min** session-scoped checkpoints | **~30–70 h** | JSON ~3.6 MB | Context rebuild × ~286 checkpoints | TickStream fetch time/quota; no OOS month on disk today |
| **3 months** | ~91k | **~2.5 h** session-scoped | **days of CPU** | JSON ~11 MB; RSS if unbounded prefix | Prefix O(n) session scans **if** full history passed | Unbounded prefix; no resume on architecture runner |
| **6 months** | ~182k | **~5 h** session-scoped (**estimate**, not measured) | **not a plan** (~100+ CPU-hours) | JSON ~22 MB; copy storms | Same | Process kill; API depth unknown; cannot claim EDGE without this data **and** session-scoped PIT |

**I/O / serialization / caching:** Dataset load is negligible vs context. ReplayEngine has per-run cutoff cache (index-keyed) — helps sequential step, not random month-scale checkpoints unless session-sliced. Incremental market engine caches live ticks — **not** wired as default historical eval.

**Outcome calculation:** O(forward bars) after lock — cheap if forward window is tens–hundreds of minutes, not the full remainder of 6 months per row.

---

## Pipeline map (what a week/month eval actually calls)

```
TickStream or NT 1m Last export
  → validateCandles (SESSION_BOUNDARY_GAP = WARNING)
  → researchDatasetToReplayMarketData (derive m5/m15/daily from 1m)
  → per checkpoint T (not per bar):
       ReplayDataCutoff / buildContextAtBarIndex   // PIT prefix
       buildMarketContextAt                        // DOMINANT COST
       buildResearchChartSnapshotFromBars(asOf)
       buildMarketState → runDeskPipeline          // <4 ms decision
       architecture-v1 envelope (identity)
       optional v2/v3 overlay on cloned observation
       fingerprint + compact trace
       outcomes on forward bars AFTER T only
  → aggregate by TRAIN / VALIDATION / OOS (no select-on-eval)
```
