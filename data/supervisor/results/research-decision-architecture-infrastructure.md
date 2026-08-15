# Research decision-architecture infrastructure

**Date:** 2026-08-14  
**Status:** COMPLETE for infrastructure (harness + audit). Production Karen **frozen**. No commit / push / deploy.  
**Evidence class of all numeric smoke findings:** **INFRASTRUCTURE / DEBUGGING** — not **EDGE EVIDENCE**.

Trading logic, prompts, analysis-contract behavior, live-verdict, chat stream, voice, and production detectors were **not** modified. Envelope in `lib/decision-envelope.ts` is the production source of truth (`architecture-v1`).

---

## CURRENT ARCHITECTURE

Mapped from code, not redesigned.

| Piece | Implementation |
|-------|----------------|
| Seven layers | `read.htfContext`, `currentStructure`, `tradeableOpportunity`, `tradeDirection`, `target`, `invalidation`, `overallStance` |
| Thesis | `what / whyNow / timeframe / toward / fromWhere / invalidates / complete` |
| Concepts | Playbook checklist always emitted; `detected`, `usedInDecision`, `role` PRIMARY\|SUPPORTING\|NONE |
| Conflict | `conflictLog` + stay-flat on HTF vs structure (`ltfAgainstHtfAllowed=false` unless pipeline already LONG/SHORT against HTF) |
| Weights | **none** — no ICT rollup |
| Verdict | `buildTradingDecision`: LONG\|SHORT\|WAIT\|NO_TRADE from one-sided interpretation + entry WAIT/EXTENDED + session stay-out + both-sides |
| Entry | Existing FVG / `getExecutionScaffold` — not a new model |
| Invalidation | Swept level ±5 or MSS ±5 — not invented |

**DETECTED → ARCHITECTURE → DECISION:** `lib/research/architecture/map.ts`. Notable: **EQH/EQL** are recorded on the chain but are **not** interpretation long/short reasons — usually DETECTED with role NONE.

**Freeze:** `architecture-v1` overlay = identity, `production: true`. v2/v3 cannot silently replace it (`lib/research/architecture/freeze.ts`, `data/research/architecture/versions.json`).

---

## CONCEPTS AVAILABLE / USED / PROVENANCE

Available (playbook): `htf_bias`, `premium_discount`, `liquidity_sweep_pdh`, `liquidity_sweep_pdl`, `session_liquidity`, `eqh`, `eql`, `mss`, `displacement`, `fvg`.

Provenance: PDH/PDL `CLOSED_BEYOND` + candle + tick; UNPROVEN ≠ taken (`lib/level-interaction.ts`). Envelope refuses sweep `outcome: true` without candle+time.

Harness distinguishes **DETECTED / USED / INFLUENTIAL** (`trace.ts`). Ablation of channels is research-clone only (`ablation.ts`).

---

## MARKET CONTEXT

Per decision: session, TOD, HTF/LTF trend, trend/range, vol proxy (displacement), premium/discount, distance to nearest liquidity, recent sweep/MSS, active FVG/EQH/EQL, PDH/PDL, session liquidity taken (`context.ts`). Enables “when is PDH useful?” counting later — **not** auto-discovered weights.

---

## MULTI-HORIZON

Every trace labels **HTF_CONTEXT**, **TACTICAL_TF**, **EXECUTION_TF** with timeframe + lean. Unlabeled bullish/bearish is invalid (`assertLabeledHorizons`). Market HTF lean is taken from the **original** observation so v2/v3 overlays cannot erase context.

---

## COMBINATION

Bounded: named templates (PDH+FVG, PDH+MSS, EQH+sweep+displacement, EQL+discount, HTF bearish + LTF bullish, session + structure) plus at most 15 co-detected pairs. No C(n,k) explosion (`relationships.ts`).

---

## ABLATION

Research-only masks: PDH, EQH-EQL, FVG, MSS, session, HTF. Re-runs interpretation+decision on clones. Staged information-order helper exists for H-ORDER-1 (UNTESTED). **Milestone 5** — do not treat fixture ablation as edge.

---

## VERSIONING

| ID | Role | Overlay |
|----|------|---------|
| **architecture-v1** | Production baseline (frozen) | identity |
| **architecture-v2** | H-B: LTF override on **proven** PDH/PDL | clone: align `tradeable_bias` to structure only then |
| **architecture-v3** | H-C: HTF context does not block tactical | clone: `tradeable_bias=neutral` |

Weights remain `"none"`. Production path unchanged.

---

## HYPOTHESIS REGISTRY

| ID | Claim | Arch | Status |
|----|--------|------|--------|
| H-A | HTF dominates LTF | (no version this pass) | **UNTESTED** |
| H-B | LTF can override HTF on proven liquidity | v2 | **UNTESTED** |
| H-C | HTF is context, does not block tactical | v3 | **UNTESTED** |
| H-ORDER-1 | Information order interchangeable | v1 staged ablation | **UNTESTED** |

Required evidence: n≥30 conflict rows, temporal OOS, no select-on-eval. Single-day cannot flip status to SUPPORTED.

---

## TRAIN / VAL / OOS

Chronological 60/20/20 (`planWalkForward`). TEST labeled **OOS**. Selecting an architecture from VALIDATION or OOS is a harness error. Low-n: insufficient <10, minimum <30, adequate ≥30. Unique session days ≤1 ⇒ **INFRASTRUCTURE** even if n is large.

**On disk today:** 1 session-day + 1 week (5-ish CME days). OOS on that week is still **not** EDGE.

---

## PIT

`ReplayDataCutoff` + poison of future price/swing/sweep/MSS/FVG/liquidity. Architecture tests: six poisons leave cutoff fingerprint at T unchanged. Outcomes use bars **strictly after** T. Historical `research_bars` scored at `asOf` (not wall clock) — see `research-historical-data-quality.md`.

---

## DETERMINISM

Same dataset id + timestamp + architecture version → SHA-256 trace fingerprint (clocks excluded). Dataset `data_version` already hashes candles+pins. `npm run test:research-decision-architecture`: **40 passed, 0 failed**. `test:research-replay`: **26 passed**.

---

## BACKTEST SCALABILITY

**Dominant cost:** `buildMarketContextAt` (~8.6 s/snapshot on 1381-bar NQ; drawings ~4.8 s, structure ~3.0 s). Decision layer **< 4 ms**. Dataset JSON parse for the **week** fixture: **4 ms**.

**Tiny safe optimization implemented:** architecture evaluator uses `buildContextAtBarIndex` (no scan of bars after T). Does not change lookbacks or verdict math.

**Do not** run per-bar baseline on months (1-day incremental already ~105 min full pass; poison/repro killed ~5.6 h).

| Horizon | Wall time estimate | Memory estimate | Bottleneck | What breaks |
|---------|-------------------|-----------------|------------|-------------|
| 1 day | Checkpoints ~2 min (measured order). Per-bar ~1.5–4 h / 105 min incremental | RSS ~0.3 GB in context profile | Context rebuild | Per-bar + poison + repro killed historically |
| 1 week | Checkpoints ~12 min if session-scoped. Per-bar ~7–20 h | JSON 0.8 MB | Context + prefix filters | Per-bar not viable |
| 1 month | Checkpoints ~50 min. Per-bar tens of hours | JSON ~3.6 MB | Context × ~286 T | No month fixture on disk; API/NT export required |
| 3 months | Checkpoints ~2.5 h session-scoped | JSON ~11 MB | Unbounded prefix O(n) if full history passed | Architecture runner has no resume |
| 6 months | Checkpoints ~5 h **estimate only** (not run). Per-bar **not a plan** | JSON ~22 MB | Same | Kill, quota, no EDGE without data |

Full write-up: `data/research/karen-research-readiness-audit.md`.

---

## RESEARCH READINESS

### CURRENTLY READY
Ingestion, validation, PIT replay, checkpoint mentor eval, walk-forward splits, traces, frozen v1, v2/v3 overlays, poison tests, incremental **baseline** checkpoints, 1-day + 1-week NQ on disk.

### BLOCKERS
1. Calendar depth (need ≥1 month later OOS).  
2. Per-bar baseline cost.  
3. Unbounded multi-month prefix into `barsInCmeSession` / `sliceBarsAt`.  
4. TickStream/NT acquisition for months not in-repo.  
5. No resume CLI for architecture traces.  
6. P&L setup count on Aug 12 was 0 (WAIT) — wrong success metric.

### RISKS
Prefix-length creep; RSS copies; naive full-envelope JSON; Yahoo used as month source; `lastPipeline` clocks; live incremental engine ≠ historical default.

### SMALLEST FIXES
Index-prefix PIT in evaluator (**done**). Next designs: session-windowed prefix after equivalence; compact trace resume. Do not parse `.ncd` or retune Karen.

### NEXT RESEARCH REQUIREMENT
**Load ≥1 month PIT 1m NQ** (TickStream week batches or NT Minute/Last GUI export). Then **v1 checkpoint traces on TRAIN only**.

---

## ROADMAP (proven / assumed / next)

See `data/research/karen-decision-architecture-roadmap.md`.

| Milestone | Status TODAY |
|-----------|----------------|
| 1 Freeze + map | Complete |
| 2 Traces + PIT + fingerprints | Complete (infra) |
| 3 TRAIN/VAL/OOS harness | Complete (data too small for EDGE) |
| 4 Versioned comparison | Harness only; H-A/B/C UNTESTED |
| 5 Ablation / “when is PDH useful?” | Code ready; **not next** |
| 6 Change production | **Not this pass** |

**Proven TODAY:** Production envelope is mappable and frozen as v1; PIT poison holds on synthetic; splits exist; context rebuild is the scale limit; 1 week of NQ is loadable in milliseconds.

**Still assumed TODAY:** Stay-flat is the right conflict rule; v2/v3 would help; EQH/EQL matter to verdicts; one week generalizes.

**Single next experiment:** Acquire multi-week/month PIT NQ. Do not optimize everything. Do not change production.

---

## Architecture comparison table (smoke)

No NQ architecture bake-off was run (would duplicate expensive context rebuilds; sample too small for EDGE). Empty-harness contract:

- `selectedArchitectureFrom = null` (no winner from eval).
- Columns: n, dir, wait/flat, dir%, wait%, avoid%, target%, inv%, mean R:R, conflicts, false conf, adequacy, class.
- Sample gap copy requires INFRASTRUCTURE labeling when days≤1 or n<30.

Any future filled table on Aug 12 or the Aug 5–12 week **must** stay labeled INFRASTRUCTURE.

---

## BIGGEST GAP

**Calendar NQ depth + refusing per-bar evaluation**, not “Karen isn’t smart enough” and not missing trace schema. Without a later month of PIT 1m data, H-B/H-C cannot leave UNTESTED.

---

## NEXT QUESTION

Can we ingest **≥1 month of CME 1m NQ** (TickStream or NT export) as a validated research fixture **without** running a per-bar 6-month baseline?

---

## Tests run this pass

| Suite | Result |
|-------|--------|
| `npm run test:research-decision-architecture` | **40 passed, 0 failed** |
| `npm run test:research-replay` | **26 passed, 0 failed** |

`test-analysis-contract` “both sides taken” assertion was **not** changed. If it fails, document — do not alter production liquidity semantics.

## Code added (research-only)

`lib/research/architecture/*`, `scripts/test-research-decision-architecture.ts`, `data/research/architecture/versions.json`, `hypotheses.json`, this report, `data/research/karen-research-readiness-audit.md`, `data/research/karen-decision-architecture-roadmap.md`.
