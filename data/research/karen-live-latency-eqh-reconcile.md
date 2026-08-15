# KAREN — Live latency EQH reconcile (gap-analysis vs current tree)

**When:** 2026-08-14 (audit only)  
**Mode:** READ-ONLY — no implementation, no commit/push/deploy, no large benchmark, no probe (existing reports + current code sufficient)  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`

---

## Verdict in one line

**Gap-analysis recommendation to do EQH force-off is STALE:** closed-bar `eqhForce=false` + `updateEqhEqlLiquidity` are already in the tree; the live **~28s** market-context median is from **before** HTF append-only and StructureFacts incremental; live post-opt wall remains **UNAVAILABLE**.

---

## Timeline (why numbers disagree)

| Time (Z) | Artifact | EQH / opts state |
|---|---|---|
| **17:21** | `karen-live-latency-audit.md` — live median context **27806 ms** | Pre StructureFacts inc, pre HTF append-only; EQH still forced on closed bars |
| **19:01** | `karen-cold-newbar-context-profile.md` | Still documents `eqhForce=true` on closed bar |
| **19:18** | `karen-eqh-force-off.md` + bench/walk JSON | **IMPLEMENTED** — `afterClosedBar` → `eqhForce: false` |
| **22:16** | `karen-htf-append-only.md` | HTF m5/m15 append-only landed |
| **22:06 / 22:35** | `karen-structure-facts-incremental.md` | StructureFacts incremental landed + re-verify |
| **22:46** | `karen-live-latency-remeasure-post-opts.md` | Fixture leaves only; **live E2E UNAVAILABLE** |
| same day | `karen-live-latency-gap-analysis.md` | Still recommends EQH force-off as next — **STALE vs tree** |

---

## Answers (exact)

### 1. Is `eqhForce=true` still used on any closed-bar path?

**No.**

| Path | File | Current behavior |
|---|---|---|
| Closed bar | `lib/incremental-market-engine.ts` `afterClosedBar` | `rebuildOneMinuteStructure({ eqhForce: false })` (line ~617) |
| Closed bar via sync | same → `applyClosedBar` → `afterClosedBar` | Same false path |
| Seek / OOO closed bar | `applyClosedBar` → `fullRebuild()` | Calls `detectEqhEqlLiquidity` directly — **not** `eqhForce=true` |
| Cold / HTF non-append | `fullRebuild` / `initialize` | Same direct detect — not the force flag |
| Forming-bar tick | `applyTick` | `eqhForce: hlChanged` — **not a closed-bar path** |

Repo grep of production `lib/`: no closed-bar site passes `eqhForce: true`. Scripts under `scripts/profile-cold-newbar-context.ts` still *describe* the old force path in strings — documentation of the pre-opt profile, not current engine wiring.

Evidence: `data/research/karen-eqh-force-off.md` §1–3; `scripts/test-incremental-market-engine.ts` case 14 asserts `afterClosedBar` must use `eqhForce: false`.

### 2. Is `updateEqhEqlLiquidity` now being used?

**Yes** on the non-force path.

`refreshEqhIfNeeded(force)` (`lib/incremental-market-engine.ts` ~681–711):

- `force === true` → `detectEqhEqlLiquidity` (tick HL expand only among incremental paths)
- `force === false` → `updateEqhEqlLiquidity(prev, bars, …)` → reuse **or** rebuild via same detect

Closed bars always enter with `force === false`, so they use `updateEqhEqlLiquidity`. Import is live at top of `incremental-market-engine.ts` from `lib/research/eqh-eql-incremental.ts`.

### 3. What is the CURRENT measured EQH/EQL cost after the optimization?

**Fixture / engine (authoritative post force-off).** Live post-opt EQH leaf: **UNAVAILABLE**.

| Source | Metric | ms | Mode |
|---|---|---:|---|
| `karen-eqh-force-off-bench.json` | leaf `updateEqhEqlLiquidity` median @ idx 601 | **174.5** | **rebuild** (Δ vs force **~0.5**) |
| same | engine `lastEqhMs` after `applyClosedBar` | **334** | rebuild (`eqhReusedΔ=0`) |
| `karen-eqh-force-off-walk.json` | NQ walk start=500 n=40 | **rebuildEqhMedMs 229** | **reuse=0 / rebuild=40** |
| `karen-structure-facts-incremental.md` re-verify | `lastEqhMs` on profile bar | **199.9** | residual after structure inc |
| `karen-live-latency-remeasure-post-opts.md` | EQH residual cited | **~200** | post StructureFacts+HTF fixture |

**Interpretation:** Force-off enables reuse, but on consecutive NQ bars measured so far the gate usually chooses **rebuild**, so EQH CPU ≈ pre-force-off detect (**~175–334 ms** class). Synthetic quiet bars: **38/40 reuse** (`karen-eqh-force-off.md` §5). Do not claim a large EQH wall reduction on active NQ from force-off alone.

### 4. What percentage of the ~28s market-context MISS is still attributable to EQH/EQL?

**Not meaningfully attributable as a live % — and EQH is not the driver of that number.**

- **~28s** = audit median MARKET CONTEXT **27806 ms** (`karen-live-latency-audit.md`, run 2 / summary) — live wall **before** StructureFacts + HTF opts (and before/alongside EQH force-off; audit is **17:21Z**, force-off **19:18Z**).
- Live post-opt context wall: **UNAVAILABLE** (`karen-live-latency-remeasure-post-opts.md`).
- Best **fixture** ratio vs that stale live denominator:  
  **~200 / 27806 ≈ 0.7%** (remeasure residual) · **~334 / 27806 ≈ 1.2%** (force-off bench engine) · walk med **~229 / 27806 ≈ 0.8%**.
- Pre-opt cold profile pure-1m EQH was **232–1262 ms** of a **2697 ms** shared miss (~9–47% of that *fixture engine* miss) — still only **~0.8–4.5%** of the live **27806** wall if naively divided.

**Do not** treat gap-analysis “do EQH force-off to close the historical↔live gap” as current priority: the ~28s figure was never mostly EQH.

### 5. What are the CURRENT top 5 contributors to market-context MISS?

Path-split. **Live MISS wall post-opts: UNAVAILABLE.** Ranking below uses **current-tree fixture + post-opt reports only**.

#### A. Pure new-1m MISS (HTF lengths unchanged) — post StructureFacts + EQH force-off

| Rank | Contributor | CURRENT measured | Source |
|---:|---|---:|---|
| 1 | StructureFacts incremental (`updateStructureFacts` / `lastStructureMs`) | **373–601** | `karen-structure-facts-incremental.md`, remeasure |
| 2 | EQH via `updateEqhEqlLiquidity` (usually rebuild on NQ) | **~175–334** (~**200** typical) | force-off bench + structure re-verify |
| 3 | Rest of `applyClosedBar` wall (price-derived + finish) | takes total to **~579–759** | structure re-verify / remeasure |
| 4 | HTF m5/m15 work | **0** (unchanged lengths) | remeasure |
| 5 | DecisionEnvelope / quality assemble | **~3–18** | cold profile / remeasure |

#### B. When m5/m15 also grow (append-only path — current tree)

| Rank | Contributor | CURRENT measured | Source |
|---:|---|---:|---|
| 1 | HTF **m5** append (`applyClosedBar` + m5 patch) | **2685** | `karen-htf-append-only.md` |
| 2 | HTF **m15** append | **1069** | same |
| 3 | Embedded 1m StructureFacts + EQH on the coincident 1m advance | inside m5 wall; pure-1m leaves **~0.4–0.6s** structure + **~0.2s** EQH | structure + force-off |
| 4 | Cold / daily / seek **`fullRebuild`** (fallback, not append-only) | cold init **~7.8–8.1s**; `buildMarketContextAt` leaf still **~11884** on cold/daily API path | cold profile + HTF report AFTER table |
| 5 | (Live-only, market_data not context) Tickstream `*_live` | **~8s** spikes | live audit — listed only so it is not confused with context |

Warm HIT is **not** a MISS: market-context **1–16 ms** (`karen-live-context-reuse.md` / remeasure).

### 6. Is the ~28s figure based on measurements taken before or after the latest HTF and StructureFacts optimizations?

**Before.**

- Live audit **2026-08-14T17:21Z** → median context **27806 ms**.
- HTF append-only **22:16Z**; StructureFacts re-verify **22:35Z**.
- Explicit statement: live post-opt end-to-end **UNAVAILABLE** (`karen-live-latency-remeasure-post-opts.md`, `karen-live-latency-gap-analysis.md` §STOP).

Gap-analysis correctly cites post-opt **fixture** leaves (**579–759** pure 1m; m5 **2685**) but still frames the live **~28s** as the MISS wall — that live number is **STALE relative to current engine**.

### 7. Re-rank remaining bottlenecks (current-tree evidence only)

| Priority | Bottleneck | Evidence | Notes |
|---:|---|---|---|
| 1 | **Cold / seek / daily / non-append HTF `fullRebuild`** | cold **~7.8–8.1s**; context leaf **~11.9s** still on cold/daily | Append-only does **not** cover these |
| 2 | **HTF m5 append residual** | **2685 ms** (was 11315) | Largest remaining *append* engine leaf |
| 3 | **HTF m15 append residual** | **1069 ms** | Smaller than m5 |
| 4 | **StructureFacts residual leaves** (FP / cheap full recompute MSS·FVG80·sweeps40) | **373–601 ms** | Dominates **pure 1m** after opts |
| 5 | **EQH rebuild-when-needed** | **~175–334 ms** | Force-off **done**; NQ walks still rebuild; not the ~28s story |
| — | Warm HIT **LLM ~3.8–5.5s** + SSE buffer ≈ final | reuse bench / remeasure | User-perceived on HIT — outside market-context MISS |
| — | Live Yahoo/Tickstream | audit | market_data; Tickstream live ~8s |

**Gap-analysis “safest next = EQH force-off” → STALE (already shipped).**  
**Cold-profile “largest new-bar CPU = full buildStructureFacts” → PARTIALLY STALE** (incremental landed; residual remains).  
**Pre-append “HTF coincident ~8–10s fullRebuild” → STALE for sequential m5/m15 growth**; still valid for daily/session/seek fallbacks.

---

## Deliverable block

### CURRENT EQH STATUS:
**DONE on closed-bar path.** `afterClosedBar` uses `eqhForce: false` → `updateEqhEqlLiquidity`. Tick HL may still force detect. `fullRebuild` still uses full `detectEqhEqlLiquidity`. Parity cases 14–16 + `test:eqh-eql-liquidity` reported pass in `karen-eqh-force-off.md`. Gap-analysis next-step wording is **STALE**.

### CURRENT EQH COST:
**~175–334 ms** when rebuild (typical post-opt cite **~200 ms** `lastEqhMs`). Force vs incremental leaf Δ **~0.5 ms** when rebuild required. NQ consecutive walk: **0 reuse / 40 rebuild**, med EQH **229 ms**. Live post-opt EQH: **UNAVAILABLE**.

### CURRENT MARKET-CONTEXT COST:
| Path | CURRENT | Freshness |
|---|---|---|
| Live MISS median | **27806 ms** | **STALE** (pre HTF + StructureFacts; audit 17:21Z) |
| Live post-opt E2E | **UNAVAILABLE** | remeasure 22:46Z |
| Fixture pure-1m `applyClosedBar` | **~579–759 ms** | post StructureFacts + EQH force-off |
| Fixture m5-coincident | **~2685 ms** | post HTF append-only |
| Fixture m15-coincident | **~1069 ms** | post HTF append-only |
| Warm HIT context | **1–16 ms** | still valid |

### TOP 5 REMAINING BOTTLENECKS:
1. Cold / seek / daily / non-append **`fullRebuild`** (~8–12 s class)  
2. **HTF m5 append** residual (~2.7 s)  
3. **HTF m15 append** residual (~1.1 s)  
4. **StructureFacts** residual (~0.4–0.6 s) on pure 1m  
5. **EQH rebuild** (~0.2 s) — already incremental-gated; often rebuilds on NQ  

*(HIT path separately: LLM ~4 s + SSE buffering — not market-context MISS.)*

### SINGLE BEST NEXT OPTIMIZATION:
**Do not re-do EQH force-off.**  
Next engine leaf with largest measured remaining MISS cost on the current tree:

- **If targeting coincident HTF growth:** further reduce **HTF m5 append (~2.7 s)** (largest remaining append leaf).  
- **If targeting pure new-1m only:** residual **StructureFacts** leaves (~373–601 ms) beat EQH (~200 ms).  
- **If targeting cold/daily misses:** **`fullRebuild` / `buildMarketContextAt`** (~8–12 s) — still the worst class when append-only does not apply.  
- **Before another large live claim:** RTH + healthy API + `LIVE_LATENCY_TRACE=1` remeasure (live post-opt still UNAVAILABLE).

### EXPECTED PAYOFF:
- EQH force-off already shipped: **workload-dependent**; measured NQ consecutive ≈ **no wall win** (rebuild every bar).  
- Further StructureFacts leaf work: order **~0.2–0.4 s** of pure-1m fixture if cheap leaves shrink (not invented beyond current residual size).  
- Further m5 append work: order **seconds** off coincident MISS (from **2.7 s** baseline).  
- Cold/fullRebuild work: order **seconds–tens** on that path only.  
- Replacing stale live **~28 s** with fixture **~0.6–2.7 s** engine leaves is **not proven on live wire** until remeasure.

### CORRECTNESS RISK:
- EQH force-off: **low** on tested paths — fingerprints matched force detect; rebuild uses same `detectEqhEqlLiquidity`; reuse gated by pending-swing + area interaction (`karen-eqh-force-off.md` §6).  
- Further StructureFacts / HTF / cold incrementalization: **higher** than EQH flag flip — touches pools, FP, HTF bias, session anchors; existing parity harnesses required.  
- Inventing a live post-opt **~28 s → X** number without RTH remeasure: **forbidden / high mis-steer risk**.

---

## STALE vs CURRENT map

| Claim from gap-analysis / older docs | Status vs current tree |
|---|---|
| “Safest next = EQH force-off / stop `eqhForce=true` every closed bar” | **STALE** — already implemented |
| Live market-context median **~28 s** as *current* MISS wall | **STALE as current-tree cost** — pre HTF + StructureFacts; live post-opt UNAVAILABLE |
| “EQH force every closed bar” in cold profile repeated-work list | **STALE** for closed-bar (still accurate for pre-19:18Z profile) |
| HTF coincident MISS = **fullRebuild ~8–10 s** | **STALE for sequential m5/m15 append**; **CURRENT** for daily/session/seek/cold fallbacks |
| StructureFacts new-1m **~1–2 s** full | **STALE** — now **~373–601 ms** incremental |
| Post-opt fixture pure-1m **~579–759**, m5 **2685**, EQH **~200** | **CURRENT** (fixture) |
| Warm HIT context **1–16 ms**, LLM-bound **~4 s** | **CURRENT** (reuse era; not invalidated by EQH/HTF/structure opts) |

---

## Sources cited

- Code: `lib/incremental-market-engine.ts`, `lib/research/eqh-eql-incremental.ts`  
- Reports: `karen-eqh-force-off.md`, `karen-eqh-force-off-bench.json`, `karen-eqh-force-off-walk.json`, `karen-eqh-force-off-reuse-sample.json`, `karen-structure-facts-incremental.md`, `karen-htf-append-only.md`, `karen-cold-newbar-context-profile.md`, `karen-live-latency-audit.md`, `karen-live-latency-gap-analysis.md`, `karen-live-latency-remeasure-post-opts.md`  
- Tests: `scripts/test-incremental-market-engine.ts` (cases 14–16), `scripts/test-eqh-eql-liquidity.ts`

---

## STOP

Audit only. No code changes. No probe run. No commit/push/deploy.
