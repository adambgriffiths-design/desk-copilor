# Day Supervisor — KAREN Edge Validation FINAL

**TREE:** `.tmp/karen-final-integration/`  
**MODE:** MEASUREMENT / VALIDATION only  
**EDGE_CLAIM:** NONE  
**TIME:** 2026-08-15T14:26:00Z

---

## Verdict (measurement only — NOT an edge claim)

Honest coverage exists at **months→~years** scale. Machinery works (PIT 0). Actionable density is measurable on a ~12mo DV window. **Karen does not have a proven edge from this day.**

| Field | Value |
|-------|------:|
| Raw trading days (latest inventory) | **750** (2023-10-02 → 2026-08-14) |
| Latest normalized 1m | **950,405** bars / 750 days (DQ built by parallel expand) |
| Measured rebuild snapshot (this stretch) | **480** days · **233.1M** ticks · **623,456** bars (2024-04-01 → 2026-01-30) |
| Primary DV window | ~12mo Feb 2025 → Jan 2026 on archive 1m |
| **X** (trading days ≈) | **258** |
| **Y** (valid eval points) | **1500** (@15m cadence, limit 1500, baseline-v2) |
| **Z** (actionable) | **255** |
| LONG / SHORT / WAIT / NO_TRADE | **120 / 140 / 1032 / 208** |
| PIT / lookahead | **0** |
| lookAheadPass / smokePass | true / true |

**Coverage quote:**  
Primary denser window: **258 trading days, 1500 eval points, 255 actionable.** Fullspan even-span: **477 days, 2000 eval points, 188 actionable** (PIT 0). Coverage missing: VALIDATION + UNTOUCHED_HOLDOUT not carved.

---

## What landed today

1. **TickStream Archive confirmed** — GET `/v1/history/ticks` (Historical docs). `welcomePlan=delayed` is live-stream only. L3 403 — skipped for OHLC.
2. Multi-month expands completed in waves: Feb–Mar → Apr–Sep 2025 → Oct 2025–Jan 2026 → 2024 quarters → further backfill into 2023 (parallel agents; do not fight raw writers).
3. Safe parallel rebuild script: `scripts/karen-dv-rebuild-archive-1m-from-raw.ts` (immutable days only; does not touch expand progress lock).
4. Scaled DV reports under `acquisition/reports/nq-history-archive-dv-*.json`.
5. **v3 candidate** already measured (PD refuse lastPrice): Δ=0 on 214.
6. **v4 candidate implemented + measured** (empty-session HL refuse): FULL_REPLAY PASS; Δ=0 on 214; **not promoted**.
7. Holdout carve **scaffold** only: `holdout-carve-scaffold.md`.

---

## DV run table (completed)

| Label | X≈ | Y | Z | Notes |
|-------|---:|--:|--:|-------|
| Feb–Mar only (earlier) | 41 | 200 | 52 | Pre-expand |
| Partial through Jul | 115 | 500 | 95 | Mid-expand |
| **Primary ~12mo** | **258** | **1500** | **255** | **Use this** |
| ~12mo coarser | 258 | 3000 | 224 | cadence 30 |
| Fullspan prefix | 477 | 2000 | 0 | **Artifact** — samples series start only |
| **Fullspan even@2000** | **477** | **2000** | **188** | **Honest spread** · L/S/W/NT 110/83/1530/277 · PIT 0 |

`--sample=even` landed: even@2000 completed (~110m). Prefer this over prefix for multi-year coverage; primary denser 12mo window remains Y=1500 / Z=255.

---

## Baselines

| ID | Status | Result |
|----|--------|--------|
| v1 | FROZEN | — |
| v2 | FROZEN (HEAD) | Sweep one-sided credit |
| v3 | CANDIDATE | PD refuse lastPrice; Δ=0 on 214; **micro-fixture FIX proven** (verdict Δ2/3) — not promoted |
| v4 | CANDIDATE | Empty-session HL refuse; Δ=0 on 214; **path triggered on micro** (context invent/refuse; DV Δ0) — not promoted |

Artifacts:
- `data/karen-decision-validation/v3/reports/trading-brain-baseline-v3-latest.*`
- `data/karen-decision-validation/v4/reports/trading-brain-baseline-v4-latest.*`
- `data/karen-decision-validation/micro-fixtures/reports/micro-fixtures-v3-v4-latest.*`

Confounder auto-detect for `empty_session_hl_fallback` remains inactive without provenance flags — micro context probe proves invent vs refuse; structural replay still shows no delta on the 214 Yahoo-week manifest (sessions populated).

---

## What this day does **not** claim

- No expectancy / “Karen has edge” / profitability
- No auto-promotion of v3 or v4
- No commit / push / deploy
- No PnL weight tuning / ICT lore into production

---

## BLOCKED_HUMAN

None for archive unlock (SKU works). Optional later: confirm whether further paid depth (L2 book history / L3) is desired — **not required for OHLC DV**.

---

## Next experiment (recommended) — *superseded by append below*

1. ~~Carve DEVELOPMENT / VALIDATION / UNTOUCHED_HOLDOUT~~ → **done** (`archive-carve-v1`)
2. ~~Chunked even-span DV~~ → **done** (see Append A)
3. ~~Micro-fixtures to force PD-missing + empty-session windows~~ → **done** (see Append B)
4. Keep **EDGE_CLAIM: NONE** until segment analysis / expectancy on sealed holdout (Adam unlock).

---

## FINAL REPORT fields (day stretch close)

| Field | Value |
|-------|-------|
| TIME | 2026-08-15T14:26:00Z |
| CURRENT_TASK | Day stretch closed — measurement package complete |
| STATUS | FINAL |
| DATASET_PROGRESS | Raw ≥750d / measured DV on ~12mo window Z=255 |
| EVALUATION_POINTS | 1500 primary |
| ACTIONABLE_DECISIONS | 255 primary |
| LONG/SHORT/WAIT/NO_TRADE | 120/140/1032/208 |
| PIT_VIOLATIONS | 0 |
| EDGE_CLAIM | **NONE** |
| NEXT_EXPERIMENT | Holdout carve + chunked even-span DV |

---

## Append A — Holdout carve + chunked even-span DV

**TIME:** 2026-08-15T15:24:44Z  
**SCRIPT:** `scripts/karen-dv-archive-carve-even-span.ts`  
**REPORT:** `acquisition/reports/nq-history-archive-carve-even-span-latest.json`  
**EDGE_CLAIM:** NONE  
**Baseline:** frozen v2 · cadence 15 · sample=even · no weight tuning

### Split definitions (`archive-carve-v1`)

| Split | Window | X trading days (UTC bar dates) | Sealed |
|-------|--------|-------------------------------:|:------:|
| DEVELOPMENT | 2023-10-02 → 2025-05-31 | **429** | No |
| VALIDATION | 2025-06-01 → 2025-12-31 | **152** | No |
| UNTOUCHED_HOLDOUT | 2026-01-01 → 2026-08-14 | **158** | **Yes** |

Archive inventory: **750** raw day dirs · **739** unique UTC dates in normalized 1m (partition 429+152+158). No further months from history-pull (already 2023-10→2026-08).

### Even-span DV — honest X/Y/Z per split (limit 500 each)

| Split | X | Y | Z | L / S / W / NT | PIT |
|-------|--:|--:|--:|----------------|----:|
| DEVELOPMENT | 429 | 500 | **26** | 14 / 12 / 404 / 70 | 0 |
| VALIDATION | 152 | 500 | **70** | 47 / 26 / 363 / 64 | 0 |
| UNTOUCHED_HOLDOUT | 158 | 500 | **79** | 48 / 39 / 347 / 66 | 0 |

Holdout XYZ is **measurement disclosure only** — not used for candidate selection/tuning.

### Chunked fullspan even-span (6 chunks × 250 = Y 1500)

| Chunk | Window | X | Y | Z | Notes |
|------:|--------|--:|--:|--:|-------|
| 1 | 2023-10-02 → 2024-03-26 | 124 | 250 | **0** | Early regime — matches prior prefix Z=0 |
| 2 | 2024-03-27 → 2024-09-18 | 124 | 250 | 5 | |
| 3 | 2024-09-19 → 2025-03-11 | 124 | 250 | 32 | |
| 4 | 2025-03-12 → 2025-09-02 | 124 | 250 | 29 | |
| 5 | 2025-09-03 → 2026-02-24 | 124 | 250 | 34 | |
| 6 | 2026-02-25 → 2026-08-14 | 119 | 250 | 29 | |
| **Σ** | full archive | **739** | **1500** | **129** | L/S/W/NT **67/68/1156/209** · PIT **0** |

Method fix: prefix fullspan Z=0 was a sampling artifact; monolithic even@2000 OOMed — chunked windows + 60d lookback completed cleanly.

### Relation to primary ~12mo package

Primary Feb 2025–Jan 2026 (X≈258 / Y=1500 / Z=255) remains the densest actionable window measured. Fullspan even-span Z=129 shows actionable density is **regime-dependent** (near-zero in late-2023/early-2024).

### Blockers

None. History ingest complete for current SKU span. Optional later: L2 depth (not required for OHLC DV); v3/v4 micro-fixtures; Adam unlock before any holdout-based selection.

### Updated FINAL fields (post-append)

| Field | Value |
|-------|-------|
| TIME | 2026-08-15T15:24:44Z |
| CURRENT_TASK | Carve + chunked even-span DV complete |
| STATUS | FINAL (appended) |
| DATASET_PROGRESS | 750 raw days / carve v1 / fullspan even Y=1500 Z=129 |
| EVALUATION_POINTS | 1500 fullspan-even · 500/split |
| ACTIONABLE_DECISIONS | 129 fullspan-even · split Z 26/70/79 |
| PIT_VIOLATIONS | 0 |
| EDGE_CLAIM | **NONE** |
| NEXT_EXPERIMENT | v3/v4 micro-fixtures for confounder deltas; holdout expectancy only after Adam unlock |

---

## Append B — Micro-fixtures v3/v4 + denser DEV-only DV

**TIME:** 2026-08-15T15:48:35Z  
**EDGE_CLAIM:** NONE  
**Scripts:**
- `scripts/karen-trading-brain-micro-fixtures-v3-v4.ts`
- `scripts/karen-dv-archive-carve-even-span.ts --only=DEVELOPMENT --limit-per-split=1500 --cadence=10 --skip-fullspan`

### Micro-fixtures (forced invent paths)

Prior 214 Yahoo-week Δ=0 because invent paths were **untriggered** (prior days + session windows populated). Synthetic fixtures force them:

| Path | Triggered? | DV result | Status |
|------|:----------:|-----------|--------|
| PD lastPrice invent (v2) vs refuse (v3) | **Yes** | Verdict Δ **2**/3 · structure Δ 2 · confounder active 3→0 | **FIX_PROVEN_ON_MICROFIXTURE** — still **CANDIDATE** |
| Empty-session HL invent (v2) vs refuse (v4) | **Yes** (context) | Verdict/structure Δ **0**/3 (all NO_TRADE) | **PATH_TRIGGERED_DELTA0** — still **CANDIDATE** |

Artifacts:
- `data/karen-decision-validation/micro-fixtures/fixtures/micro-pd-missing-lastprice-v0.json`
- `data/karen-decision-validation/micro-fixtures/fixtures/micro-empty-session-hl-v0.json`
- `data/karen-decision-validation/micro-fixtures/reports/micro-fixtures-v3-v4-latest.{json,md}`
- `data/research/karen-micro-fixtures-v3-v4.md`

`empty_session_hl_fallback` auto-tag remains inactive without provenance flags — context probe is the proof for v4 invent/refuse.

**Not promoted.** No stacking. No weight tuning.

### Denser DEVELOPMENT-only even-span DV

Holdout / VAL **not** densified for edge. DEV only, cadence **10**, limit **1500**, even sample, baseline-v2.

| Label | X | Y | Z | L / S / W / NT | PIT |
|-------|--:|--:|--:|----------------|----:|
| DEV prior even@500 c15 | 429 | 500 | **26** | 14 / 12 / 404 / 70 | 0 |
| **DEV dense even@1500 c10** | 429 | **1500** | **80** | **48 / 36 / 1168 / 248** | **0** |

Actionable rate ≈ **5.3%** of evals (80/1500) vs ≈5.2% at Y=500 — denser sample raises absolute Z without changing rate much. Early DEV regime still near-zero actionable (sub1 Z=0).

Report: `acquisition/reports/nq-history-archive-carve-even-span-dev-dense-c10-y1500-latest.json`

### Ready for Adam review — X / Y / Z by split

| Split | X | Y | Z | Sealed |
|-------|--:|--:|--:|:------:|
| DEVELOPMENT | 429 | 1500 dense (also 500 prior) | **80** (26 prior) | No |
| VALIDATION | 152 | 500 | **70** | No |
| UNTOUCHED_HOLDOUT | 158 | 500 | **79** | **Yes** |

Primary ~12mo package unchanged: X≈258 / Y=1500 / Z=255.

### Next unlock

**Holdout expectancy / selection only when Adam says.** Do not densify holdout for edge. Do not promote v3/v4 without Adam.

### Updated FINAL fields (post-append B)

| Field | Value |
|-------|-------|
| TIME | 2026-08-15T15:48:35Z |
| CURRENT_TASK | Safe stretch closed — ready for Adam review |
| STATUS | FINAL (appended B) · **READY FOR ADAM REVIEW** |
| DATASET_PROGRESS | 750 raw / carve v1 / DEV dense Y=1500 Z=80 |
| EVALUATION_POINTS | DEV dense 1500 · split prior 500 · fullspan 1500 |
| ACTIONABLE_DECISIONS | DEV dense **80** · VAL 70 · HO 79 (sealed) · fullspan 129 · primary 255 |
| PIT_VIOLATIONS | 0 |
| EDGE_CLAIM | **NONE** |
| NEXT_EXPERIMENT | Holdout expectancy **only after Adam unlock**; optional v4 provenance tagging |

**EDGE_CLAIM: NONE**

**EDGE_CLAIM: NONE**

---

## Append C — Dense DEV dual audit (WAIT overcaution + actionable performance)

**TIME:** 2026-08-15T18:06:38Z  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** **PROTECTED** — do not unlock; not accessed  
**LOGIC:** unchanged (no weights/thresholds/baseline edits)  
**SCRIPT:** `scripts/karen-dv-dev-dual-audit.ts`  
**JSON:** `acquisition/reports/nq-history-archive-dev-dual-audit-latest.json`

### Counts (actual this run)

| TOTAL_STATES | WAIT | NO_TRADE | ACTIONABLE | LONG | SHORT | PIT |
|------------:|-----:|---------:|-----------:|-----:|------:|----:|
| **1500** | **1188** | **239** | **71** | 39 | 32 | 0 |

(Prior denser DEV aggregate had Z≈80; this full outcome replay measured **Z=71** on the same carve-v1 DEV window / even@1500 c10 method.)

### WAIT overcaution

- QG-blocked WAITs (`canDeliver=false`): **0** · Engine-restraint WAITs (`canDeliver=true`): **1188** (100%)
- Heuristic: GOOD_WAIT **0.3%** · MISSED_OPPORTUNITY **75.7%** · INCONCLUSIVE **24.1%**
- TOP drivers: engine restraint; FVG present; displacement present; contradictions
- VERDICT: **structurally_overcautious** (heuristic evidence — not edge)
- Note: `data/research/karen-dev-wait-overcaution-audit.md`

### Actionable LONG/SHORT performance

- T-before-inv / Inv-before: **19.5% / 80.5%** (scored 41/71)
- med MFE / MAE: **12.0 / 9.5** · mean proxyR (heuristic): **-0.330**
- Note: `data/research/karen-dev-actionable-performance-audit.md`

### Updated FINAL fields (post-append C)

| Field | Value |
|-------|-------|
| TIME | 2026-08-15T18:06:38Z |
| CURRENT_TASK | Dense DEV dual audits complete |
| STATUS | FINAL (appended C) · holdout PROTECTED |
| ACTIONABLE_DECISIONS | DEV dense outcome-scored **71** (prior aggregate Z≈80) |
| WAIT | 1188 · missed-opp heuristic 75.7% |
| EDGE_CLAIM | **NONE** |
| NEXT_EXPERIMENT | Finish v2–v4 semantic baseline; DEV threshold/weight candidates allowed only given overcaution support; VAL once if DEV winner; **never unlock holdout** |

**EDGE_CLAIM: NONE**

---

## Append D — CURRENT_STATE_MAP + semantic/WAIT taxonomy (2026-08-15T19:30Z)

**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED

- Perf/hash: DONE (QG 53% stop; hash PASS)
- A3 EST vs CME PD: MEASURED MATERIAL_LABELING_CONFOUNDER (hlcDisagree 95.8%) — no swap
- A4 dual REH: MEASURED MATERIAL_DUAL_ALGORITHM_NOISE (price-agree 13.9%) — no unify
- WAIT PRIMARY: ENTRY_STATUS_FORCE_WAIT 89.6% · BOTH_SIDES 10.4% · QG 0
- Formal freeze IDs refreshed in `karen-semantic-baseline-freeze.md`
- Peer overcaution candidates still IN_FLIGHT (c2+)
- Registry: exp-a3 / exp-a4 / exp-wait-driver-taxonomy registered as `research`

**NEXT_SAFE_TASK:** quiet-vs-active causal features OR await peer → protocol decision
**READY_FOR_ADAM:** HOLDOUT stays sealed; optional later A3/A4 candidate design (not now)

---

## Append E — Quiet vs active causal features (2026-08-15T20:35Z)

**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **TUNING:** none

- Panel: 40-day dense STRICT · QUIET_RATE **62.5%** · ACTIVE_MEDIAN_OPP **28**
- Prior-day range median-split accuracy **32.5%** (quiet prior/overnight range *higher* than active)
- Same-day PIT @30m: quiet retains mss/fvg/disp ~0.94/0.89/0.74; ENTRY_STATUS_FORCE_WAIT ~91.7%
- Chronological: **17** consecutive early-panel quiet days before first active **2024-06-24**
- **VERDICT: gating_defect** (not intelligent_filter)
- Registry: `exp-quiet-vs-active-day-analysis-2026-08-15` · `research` · PIT=0
- Peer smoke candidates noted on disk (`c1` promising) — not blocking
- Note: `data/research/karen-quiet-vs-active-day-analysis.md`

**NEXT_SAFE_TASK:** Era-split ENTRY_STATUS_FORCE_WAIT / actionable density pre vs post 2024-06-24 (measure-only) **or** consume peer overcaution candidates → protocol gates only  
**READY_FOR_ADAM:** HOLDOUT stays sealed

---

## Append F — Era-split ENTRY_STATUS_FORCE_WAIT (2026-08-15T20:50Z)

**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **TUNING:** none

- Split at first active panel day **2024-06-24** (POST inclusive)
- PRE 17d: quiet **100%** · opp/day **0** · ENTRY_FORCE **90.9%** of WAIT · structure mss/fvg/disp ~0.91/0.81/0.74
- POST 23d: quiet **34.8%** · opp/day **17.83** (410 STRICT) · ENTRY_FORCE **89.1%** · actionable rate **9.0%**
- POST quality (all STRICT): T-before **31.8%** · mean proxyR **−1.860**
- **VERDICT: era_regime_change_mixed** — early era zero-delivery under same force-wait-dominated gate that still dominates POST
- Registry: `exp-era-split-entry-force-wait-2026-08-15` · `research` · PIT=0
- Peer smoke `c1_wait_entry_actionable` noted non-blocking
- Note: `data/research/karen-era-split-entry-force-wait.md`

**NEXT_SAFE_TASK:** Consume peer overcaution **c1_wait_entry_actionable** → DEV protocol gates only  
**READY_FOR_ADAM:** HOLDOUT stays sealed

---

## Append G — c1_wait_entry_actionable DEV protocol decision (2026-08-15T21:00Z)

**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **TUNING:** none · **VAL:** not run (protocol)

- Consumed peer smoke package only (Y=**48**); full Y=1500 peer run still in-flight / unpublished
- Smoke c1: WAIT 45→2 · ACT 0→43 · T-before **82.1%** · proxyR **0.214** · PIT **0** · ACT rate ~**89.6%**
- Vs frozen dual-audit refs (T-before 19.5%, proxyR −0.330, Z=71): **not paired** on smoke (smoke baseline Z=0)
- Gates: 1 FAIL (underpowered) · 3 PASS · 4/6/8 INCONCLUSIVE · 10 would FAIL if scored on smoke rate · §3 package incomplete
- **DECISION: RESEARCH_MORE** (not REJECT; not PROMOTE)
- Registry: `exp-c1-wait-entry-actionable-dev-protocol-2026-08-15` · `research` · PIT=0
- Note: `data/research/karen-dev-candidate-c1-protocol-decision.md`

**NEXT_SAFE_TASK:** Re-gate c1 when peer publishes non-smoke Y=1500 overcaution report → REJECT/RESEARCH_MORE/PROMOTE; if PROMOTE set READY_FOR_ADAM before VAL  
**READY_FOR_ADAM:** **N** (HOLDOUT stays sealed)

---

## Append H — Semantic freeze + DEV overcaution Y=1500 + VAL once (2026-08-15T20:40Z)

**EDGE_CLAIM:** NONE · **HOLDOUT:** PROTECTED · **TUNING:** none (ALS default `none`)  
**BASELINE_FROZEN_ID:** `baseline-v2`  
**SCRIPT:** `scripts/karen-dv-dev-overcaution-candidates.ts`  
**JSON:** `acquisition/reports/nq-history-archive-dev-overcaution-candidates-latest.json`  
**Note:** `data/research/karen-dev-overcaution-candidates.md` · freeze `karen-semantic-baseline-freeze.md`

### Semantic baseline (step 1 — complete)

| ID | Status |
|----|--------|
| **baseline-v2** | **FROZEN** — experiment + production HEAD |
| v3 | CANDIDATE — FIX_PROVEN_ON_MICROFIXTURE · natural 214 Δ0 · **not promoted** |
| v4 | CANDIDATE — PATH_TRIGGERED_DELTA0 · **not promoted** |

### DEV candidates (identical Y=1500 asOfs · one change each)

| ID | WAIT | ACT | WAIT→ACT | T-before | mean proxyR | Bar |
|----|-----:|----:|---------:|---------:|------------:|-----|
| none | 1188 | 73 | — | 21.4% | −0.330 | frozen |
| **c1_wait_entry_actionable** | 114 | **1147** | **1074** | **58.1%** | **0.314** | structural winner |
| c2_min_reasons_1 | 1404 | 46 | 0 (−30 ACT→WAIT) | 30.4% | −0.303 | fail |
| c3_widen_entry_band | 1188 | 73 | 0 | 21.4% | −0.330 | null |

### VAL (one test only — c1)

| ID | WAIT | ACT | T-before | mean proxyR |
|----|-----:|----:|---------:|------------:|
| none | 359 | 74 | 32.5% | −0.561 |
| c1 | 41 | 392 | 50.2% | **−1.053** |

- Structural lift replicates on VAL.
- **Quality fail:** proxyR worsened (−0.561 → −1.053) → **back to DEV** (programme rule).
- DEV ACT rate ~76% also fails frequency/spam promote gate — do **not** ship binary c1.
- Experiment ALS remains opt-in; production path unchanged.

### Updated FINAL fields (post-append H)

| Field | Value |
|-------|-------|
| TIME | 2026-08-15T20:40:12Z |
| CURRENT_TASK | Freeze + DEV candidates + VAL once complete |
| STATUS | FINAL (appended H) · holdout PROTECTED |
| BASELINE_FROZEN_ID | **baseline-v2** |
| DEV_CANDIDATES | c1 / c2 / c3 |
| VAL | c1 structural pass · **proxyR fail → back to DEV** |
| EDGE_CLAIM | **NONE** |
| NEXT_EXPERIMENT | **`c4_shadow_quality_gated_wait`** on DEV only; binary c1 **REJECT**; never unlock holdout |

**EDGE_CLAIM: NONE**

---

## Append I — A/B vs VAL reconcile (2026-08-15T21:55Z)

**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL re-run:** forbidden · **commit/push:** none

- Prior A/B ONE_NEXT (binary `c1_wait_entry_actionable`) **superseded**
- Protocol: **REJECT** promote binary c1 · **RESEARCH_MORE** → **`c4_shadow_quality_gated_wait`**
- Production ALS remains **`none`** — binary c1 is **not** implement-next
- Docs: `karen-next-single-change-dev-candidate.md` · `karen-dev-candidate-c1-protocol-decision.md`

**NEXT_SAFE_TASK:** Pre-declare/DEV-measure `c4_shadow_quality_gated_wait` only  
**READY_FOR_ADAM:** **N**

