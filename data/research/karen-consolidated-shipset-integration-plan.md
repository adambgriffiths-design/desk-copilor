# KAREN — Consolidated Six-Feature + Red-Team Fix Integration Plan

**Date:** 2026-08-15  
**Mode:** PLAN / AUDIT ONLY — no code changes, no patch apply, no git add / commit / push / deploy  
**Baseline:** `74183b24553757a22fd71d79d0f8954d7c72872f`  
**Sources:**
- **A+B:** `.tmp/karen-six-feature-clean/` (six-feature shipset + red-team L1/last-decision fixes; F6 surgical wait wire present in WT)
- **C:** `.tmp/karen-interp-decision-fixes/` (claimed three interp/decision fixes; worktree is dirty-primary-shaped, not a minimal HEAD delta)

**Evidence read:** clean patch review, overnight verification, gaps-closed, red-team bugfixes, nightly red-team final, three-interp-decision fixes, observation-facts tsc diagnosis, F6 surgical wire report (partial), general-chat slowness (context), live market data stopping (context).

---

## Executive verdict (preview)

**CAN THESE WORKSTREAMS BE SAFELY CONSOLIDATED? → CONDITIONAL**

A+B can form one production carve from the **clean tree working set** (not the stale in-tree `.patch`). C must **not** be merged as a whole worktree. Only Fix 3 (label) is mechanically safe; Fix 2 needs a surgical port onto HEAD+`session-liquidity`; Fix 1 is a dirty-WT observation bug that does **not** exist on HEAD’s `buildLiquidityLevels` and must not pull `level-interaction` / widened `desk-schema`. Restore or drop the clean-tree `observation-facts.ts` overlay before calling typecheck green.

---

## STEP 1 — FILE OVERLAP

### Inventories (product-relevant)

#### A+B clean tree vs baseline (`74183b2`)

| Class | Paths |
|-------|--------|
| **Modified (tracked)** | `app/api/chat/stream/route.ts`, `extension/casual-chat.js`, `lib/analysis-contract.ts`, `lib/analysis-quality-gate.ts`, `lib/chat-engine.ts`, `lib/desk-pipeline.ts`, `lib/market-data.ts`, **`lib/observation-facts.ts` (overlay — not in official six-feature carve)** |
| **New (untracked libs)** | `lib/conversational-normalize.ts`, `lib/decision-contract-output.ts`, `lib/decision-envelope-history.ts`, `lib/decision-envelope.ts`, `lib/decision-history-query.ts`, `lib/decision-memory-backend.ts`, `lib/decision-time-travel.ts`, `lib/mentor-intent.ts`, `lib/mtf-horizons.ts`, `lib/session-liquidity.ts`, `lib/turn-category.ts` |
| **Absent (intentionally)** | `lib/conversational-intent.ts` (dropped from current clean WT; still listed in stale `karen-six-feature.patch`) |
| **Test-only (untracked scripts)** | `scripts/verify-feature*.ts`, `scripts/test-decision-*.ts`, `scripts/test-karen-*.ts`, `scripts/test-quality-gate-envelope-dedupe.ts`, `scripts/red-team-*.ts`, `scripts/verify-envelope-transitive-fields.ts` |

**Red-team B (present in clean WT libs):** `structuredClone` / `cloneHistoryEntry` in `decision-envelope-history.ts`; LIVE `last_recorded` in `decision-history-query.ts` + `decision-time-travel.ts`.

**F6 surgical wire (present in clean WT, not in stale patch file):** `tryStructuredWaitFollowUpFromLastPipeline` in `chat-engine.ts`; stream route short-circuit on `WAIT_EXPLANATION`.

**Stale artifact:** `.tmp/karen-six-feature-clean/karen-six-feature.patch` still contains `conversational-intent.ts` and **lacks** `structuredClone` / F6 wire — **do not treat that patch file as the ship source of truth**.

#### C interp tree vs baseline

| Class | Paths |
|-------|--------|
| **Claimed C ship files** | `lib/observation-engine.ts`, `lib/interpretation-engine.ts`, `data/labeled-setups/examples/ny-open-long-a-plus.json` |
| **Actual worktree shape** | Near-full dirty primary: hundreds of modified/untracked libs (including recorder, latency, conversational-intent, level-interaction, widened schemas, etc.) |
| **C report’s “no decision-layer edit”** | Interp WT **does** modify `lib/decision-layer.ts` (+ session-liquidity WAIT branch) — **collateral dirty WT, not part of verified C trio** |

`observation-engine` / `interpretation-engine` in **clean** tree: **identical to HEAD** (`git diff` exit 0).

### Overlap matrix

| File | A+B clean | C intentional | Overlap type |
|------|-----------|---------------|--------------|
| `lib/decision-envelope-history.ts` | NEW + red-team clone | Dirty copy **without** `structuredClone` | Same path both trees; **content conflict if taken from C** |
| `lib/decision-history-query.ts` | NEW + last-decision parse | Dirty copy (partial last_recorded hist only) | Prefer A+B |
| `lib/decision-time-travel.ts` | NEW + LIVE last_recorded | Dirty older copy | Prefer A+B |
| `lib/observation-engine.ts` | HEAD (unchanged) | Dirty + Fix1 provenance/`makeLevel` | **No dual edit on clean**; wholesale C file **blocked** |
| `lib/interpretation-engine.ts` | HEAD (unchanged) | Dirty + session-liquidity + Fix2 skip | **Manual surgical port** of Fix2 |
| `lib/decision-layer.ts` | HEAD | Dirty + session-liquidity branch | **Exclude** from C ship (not in verified trio) |
| `data/labeled-setups/examples/ny-open-long-a-plus.json` | Absent in clean tree | Present (adam_verdict WAIT) | **C-only — mechanical add** |
| `lib/session-liquidity.ts` | NEW (identical hash both trees) | Also present | **Mechanical / identical** |
| `lib/mtf-horizons.ts` | NEW (identical) | Also present | **Mechanical / identical** |
| `lib/decision-contract-output.ts` / `decision-memory-backend.ts` / `conversational-normalize.ts` / `turn-category.ts` | NEW (identical hashes) | Also present | **Mechanical / identical** |
| `lib/chat-engine.ts`, `stream/route.ts`, `analysis-*`, `desk-pipeline.ts`, `market-data.ts`, `mentor-intent.ts`, `casual-chat.js` | Six-feature surgical | Dirty supersets | **Prefer A+B; never take C copies** |
| `lib/observation-facts.ts` | Dirty overlay (tsc break) | Same LF content as clean overlay | **Neither is official A+B; restore HEAD** |

### Critical-file classification

| File | Conflicting? | Mechanical? | Manual hunk? |
|------|--------------|-------------|--------------|
| `decision-envelope-history.ts` | Yes if C copy chosen | Take **entire A+B file** | No merge needed if A+B wins |
| `decision-history-query.ts` | Same | Take A+B | — |
| `decision-time-travel.ts` | Same | Take A+B | — |
| `observation-engine.ts` | Only if importing C wholesale | **No** — HEAD already maps `taken` from sweeps | Fix1 port to HEAD = **N/A**; dirty C file = **BLOCKED** |
| `interpretation-engine.ts` | Intentional Fix2 vs HEAD | No | **Yes** — extract `reversalLookalikeWithoutSslSweep` (+ minimal `sslRaid` detection) onto HEAD; optionally align session-liquidity gates already mirrored in envelope |
| `decision-layer.ts` | Collateral in C WT | Leave HEAD / A+B | Do not import C hunk |
| `ny-open-long-a-plus.json` | No | **Yes** — copy C label | — |

### Files changed only by six-feature / red-team (A+B)

All A+B product paths listed above **except** C’s three claimed files. Plus test/red-team scripts under clean `scripts/`.

### Files changed only by interpretation/decision fixes (C intentional)

1. `lib/observation-engine.ts` (dirty-relative Fix1 — **not HEAD-relative**)  
2. `lib/interpretation-engine.ts` (Fix2 + larger session-liquidity interpretation rewrite)  
3. `data/labeled-setups/examples/ny-open-long-a-plus.json` (Fix3)

### Files both trees touch (path overlap) but must resolve as “A+B wins”

Every shared decision-memory / chat / QG / mentor file that exists in both trees with **different hashes** — treat C’s copies as dirty primary noise.

---

## STEP 2 — DEPENDENCY GRAPH

### Graph 1 — Six-feature / memory / chat / QG / intent (A+B)

```
desk-pipeline
  └─ recordDecisionEnvelopeHistory ──► decision-envelope-history
         ├─ structuredClone on write/read (red-team E)
         └─ decision-memory-backend (Redis + RAM)

decision-envelope
  ├─ mtf-horizons          (horizon prose)
  └─ session-liquidity     (stance/conflict stay-flat policy)

analysis-quality-gate
  └─ decision-contract-output.formatCanonicalEnvelopeForPrompt
       └─ decision-envelope

chat-engine / app/api/chat/stream
  ├─ hydrate/flush envelope history (F1)
  ├─ tryInstantRead / CURRENT_MARKET_READ skip (F3)
  ├─ decision-time-travel + decision-history-query (F4/F5 + LIVE last_recorded)
  ├─ mentor-intent (F6 classify; past-tense WAIT_EXPLANATION)
  │    └─ conversational-normalize (+ turn-category via mentor graph)
  └─ tryStructuredWaitFollowUpFromLastPipeline (F6 surgical)
       └─ getLastPipelineResult → formatStructuredWaitFollowUp

extension/casual-chat.js
  └─ (?:are|were) you waiting for  (client anaphora)

market-data
  └─ cmeSessionDateKey* exports (F4 session bind)
```

### Graph 2 — Observation → interpretation → decision (C + HEAD pipeline)

```
observation-engine.buildLiquidityLevels
  └─ liquidity.levels[].taken ──► liquidity_swept = some(taken===true)

interpretation-engine.buildMarketInterpretation
  └─ long/short supported, entry_model, skip/contradictions

decision-layer.buildTradingDecision
  └─ WAIT | LONG/SHORT | NO_TRADE from interp + entryStatus
```

**HEAD observation path (clean baseline):** `taken: swept.has("pdh"|"pdl"|"pdc")` plus label match — **no** `level-interaction`, **no** provenance demotion to `"unknown"` on missing `pdhSource`.

**C dirty observation path:** `makeLevel` + `canProvePdhTaken` / `level-interaction` + richer level fields (`id`/`side`/`status`) — **requires modules absent from clean/HEAD**.

### Cross-dependencies

| Edge | Nature |
|------|--------|
| `decision-envelope` → `session-liquidity` | A+B already ships; presentation/stance in envelope |
| C Fix2 `interpretation-engine` → `session-liquidity` | Cross-graph; clean already has the lib — Fix2 can use it **without** new forbidden modules |
| C dirty `observation-engine` → `level-interaction` + widened `desk-schema` | **Forbidden for this carve** (not in A+B; expands observation provenance ship) |
| `desk-pipeline` → observation → interpretation → decision-layer → envelope record | Natural pipeline; A+B records envelope after Analyse without continuous recorder |

### Forbidden-module proof (product paths)

Scanned clean `lib/` / `app/` / `extension/` for:

| Module / symbol | Clean product |
|-----------------|---------------|
| `continuous-decision-recorder` | **ZERO** |
| `decision-memory-material` | **ZERO** |
| `withManualAnalysePriority` | **ZERO** |
| recorder-modified `verdict-engine.ts` | **Not shipped** (HEAD verdict-engine unchanged) |
| `live-latency-profile` | **ZERO** |
| `market-data-errors` | **ZERO** |

C claimed fix files (`observation-engine` / `interpretation-engine`) also have **no** imports of those forbidden recorder/latency modules. Dirty C observation path **does** require `level-interaction` (not in forbidden list above, but **out of approved six-feature carve** and absent from HEAD/clean).

---

## STEP 3 — CONFLICT ANALYSIS

| File / concern | Verdict | Why |
|----------------|---------|-----|
| A+B decision-memory trio (history / query / time-travel) | **SAFE** | Use clean WT versions only; C copies lack red-team E and/or LIVE last_recorded completeness |
| A+B chat / stream / QG / mentor / casual-chat / market-data / desk-pipeline / analysis-* | **SAFE** | Prefer clean WT; C versions are dirty supersets |
| `session-liquidity` / `mtf-horizons` / identical shared new libs | **SAFE** | Byte-identical (LF) across trees |
| `ny-open-long-a-plus.json` | **SAFE** | C-only label reconcile; no A+B edit |
| `interpretation-engine.ts` Fix2 | **MANUAL MERGE REQUIRED** | Do not copy whole C file (bundled session-liquidity rewrite). Port surgical `reversalLookalikeWithoutSslSweep` (+ sslRaid sensing needed for the predicate) onto HEAD clean file |
| `observation-engine.ts` Fix1 wholesale | **BLOCKED** | C file pulls `level-interaction`, richer level shape, dirty provenance stack. Clean/HEAD already sets `taken` from `liquiditySweeps` — Fix1’s FN is a **dirty-WT** bug |
| `decision-layer.ts` C hunk | **BLOCKED** (for this consolidation) | Not in verified C trio; collateral dirty |
| `observation-facts.ts` overlay | **BLOCKED** until restored/fixed | 5× TS2339 on `side`/`status`/`id`; not in official six-feature patch; diagnosis: restore HEAD or HEAD-compat rewrite |
| Stale `karen-six-feature.patch` apply | **BLOCKED** as SoT | Missing red-team E + F6 wire; still adds orphaned `conversational-intent.ts` |
| Entire C worktree merge | **BLOCKED** | Imports recorder/latency/unrelated dirty APIs |

---

## STEP 4 — PRODUCTION SHIPSET

### A. NEW FILES (production)

| Path | Source |
|------|--------|
| `lib/decision-memory-backend.ts` | A+B clean |
| `lib/decision-envelope-history.ts` | A+B clean (**with** deep clone) |
| `lib/decision-envelope.ts` | A+B clean |
| `lib/decision-contract-output.ts` | A+B clean |
| `lib/decision-time-travel.ts` | A+B clean (**with** LIVE last_recorded) |
| `lib/decision-history-query.ts` | A+B clean |
| `lib/mentor-intent.ts` | A+B clean |
| `lib/conversational-normalize.ts` | A+B clean |
| `lib/turn-category.ts` | A+B clean |
| `lib/mtf-horizons.ts` | A+B clean |
| `lib/session-liquidity.ts` | A+B clean |

**Not new in shipset:** `lib/conversational-intent.ts` (exclude / do not re-add).

### B. MODIFIED FILES (production)

| Path | Source / note |
|------|----------------|
| `lib/desk-pipeline.ts` | A+B — LIVE `recordDecisionEnvelopeHistory` + HEAD `snapshotId` cast |
| `lib/analysis-contract.ts` | A+B surgical |
| `lib/analysis-quality-gate.ts` | A+B envelope dedupe |
| `lib/chat-engine.ts` | A+B — F1 flush, F3 instant skip, **F6** `tryStructuredWaitFollowUpFromLastPipeline` |
| `app/api/chat/stream/route.ts` | A+B — hydrate, instant read, history, **F6** WAIT short-circuit |
| `lib/market-data.ts` | A+B — `cmeSessionDateKey*` only |
| `extension/casual-chat.js` | A+B — `(?:are\|were) you waiting for` |
| `lib/interpretation-engine.ts` | **Optional follow-on:** surgical Fix2 port (MANUAL) — not byte-copy from C |
| `data/labeled-setups/examples/ny-open-long-a-plus.json` | C Fix3 label (`adam_verdict: WAIT`) when shipping labeled fixtures |

**Do not modify for this shipset:** `lib/observation-engine.ts` (keep HEAD), `lib/decision-layer.ts` (keep HEAD), `lib/verdict-engine.ts` (keep HEAD).

**Must revert before ship:** `lib/observation-facts.ts` → HEAD (or HEAD-compat only).

### C. TEST-ONLY FILES

Promote as verification harnesses (not required for runtime):

- `scripts/test-decision-memory-adapter.ts`
- `scripts/test-decision-history-time-travel.ts`
- `scripts/test-quality-gate-envelope-dedupe.ts` / `verify-feature2-qg-envelope-dedupe.ts`
- `scripts/test-karen-instant-read-llm-skip.ts` / `verify-feature3-instant-read.ts`
- `scripts/verify-feature4-session-boundary.ts`
- `scripts/verify-feature5-historical-why-now.ts`
- `scripts/verify-feature6-wait-routing.ts` / `test-karen-past-tense-wait-routing.ts`
- `scripts/verify-envelope-transitive-fields.ts`
- `scripts/red-team-E-mutability-repro.ts`
- `scripts/red-team-B-last-decision-repro.ts`
- (+ optional `red-team-A-E-F-memory.ts`, `red-team-B-G-time-session.ts`, `red-team-C-D-mode-instant.ts`, `red-team-shared.ts`)
- C verify probe (if retained): `.tmp-three-fix-verify.ts` — keep out of production package

### D. EXCLUDED FILES (required)

| Path / class | Reason |
|--------------|--------|
| `lib/continuous-decision-recorder.ts` | Continuous recorder |
| `lib/decision-memory-material.ts` | Recorder material gate |
| `lib/verdict-engine.ts` recorder changes / WT wrap | `withManualAnalysePriority` leak |
| Recorder tests/probes (`test-continuous-decision-memory`, `.tmp-continuous-*`) | Recorder-only |
| `lib/live-latency-profile.ts` | Latency / excluded graph |
| `lib/market-data-errors.ts` | Excluded graph |
| `lib/conversational-intent.ts` | Orphan / out of current clean carve |
| `lib/level-interaction.ts` + dirty observation provenance stack | Required only by blocked C observation wholesale |
| `lib/mentor-coaching.ts`, `lib/research/replay/historical-ui` | Out of carve |
| Unrelated dirty APIs (`app/api/verdict`, voice routes, desk-tracker, etc.) | Dirty primary |
| Credentials / `.env*` | Secrets |
| `data/research/**` reports | Docs only |
| Entire `.tmp/karen-interp-decision-fixes/` dirty tree as a unit | Accidental unrelated import risk |
| Stale `karen-six-feature.patch` as apply source | Behind clean WT |

---

## STEP 5 — BEHAVIORAL CONTRACTS

Verified contracts only (no invented behavior):

1. **LIVE decision recording** — After LIVE Analyse/`runDeskPipeline`, envelopes persist via `recordDecisionEnvelopeHistory` (RAM + Redis backend when configured); no continuous recorder / no WT verdict-engine wrap required.
2. **LIVE “What was your last decision?”** — Parses to `last_recorded`; `answerLiveDecisionHistoryQuery` returns latest LIVE envelope (`responseSource=live_decision_last_recorded`) or honest miss; no PIT reconstruction.
3. **Historical at-time lookup** — PIT `findDecisionAtOrBefore` / time-travel replies preserve recorded `whyNow`; no LLM reconstruction of past stance.
4. **LIVE/HISTORICAL isolation** — Fixture/HISTORICAL lanes do not leak into LIVE answers; hydrate is lane-scoped.
5. **Same-isolate L1 immutability** — Record and public getters deep-clone envelopes; caller/retrieved mutation cannot rewrite stored L1 (Redis JSON SoT already intact).
6. **Redis failure** — Missing/failing Redis → honest RAM-only or clear/miss behavior; no invented history (red-team F).
7. **Instant market read** — Flag-gated `CURRENT_MARKET_READ` may return deterministic `envelope_instant` with zero OpenAI on the skip path; blocked for WAIT/history/invalid cases.
8. **GENERAL_CHAT** — Non-trading turns stay off trading stream; separate latency/failure issues (localhost/`Not a casual question`) are **out of this shipset** (context diagnosis only).
9. **Past-tense WAIT questions** — `were you waiting` → `WAIT_EXPLANATION` (mentor-intent) + casual `(?:are|were)`; with F6 wire, last-pipeline hit → `formatStructuredWaitFollowUp` / `wait_structured`; miss → existing fallthrough (no invented wait).
10. **`liquidity_swept`** — `any level.taken === true`; on **HEAD/clean**, sweeps in `structureFacts.liquiditySweeps` already set `taken`; dirty-WT provenance FN is **not** the HEAD contract to re-import.
11. **`similar-but-skip`** — NY + bullish MSS + bullish FVG + displacement **without** sell-side sweep → not long-supported / NO_TRADE skip (`present_not_tradeable`) when Fix2 ported.
12. **`ny-open-long-a-plus`** — Label `adam_verdict: WAIT` with would-take-on-retrace notes; engine WAIT when entry not active.
13. **Executable LONG vs WAIT** — Layer-3: one-sided + entry not ready → **WAIT**; LONG/SHORT only when entry active — do not force WAIT→LONG to match old labels.

---

## STEP 6 — REGRESSION MATRIX

| Suite | Role | Gate |
|-------|------|------|
| `scripts/test-decision-memory-adapter.ts` | F1 Redis/memory | **Must PASS** |
| `scripts/red-team-E-mutability-repro.ts` | L1 immutability | **Must PASS** |
| `scripts/red-team-B-last-decision-repro.ts` | LIVE last decision | **Must PASS** |
| `scripts/test-decision-history-time-travel.ts` | F4/F5 fuller | **Must PASS** |
| `verify-feature2` / `test-quality-gate-envelope-dedupe` | F2 QG dedupe | **Must PASS** (§7 historical-ui skip OK) |
| `verify-feature3` / `test-karen-instant-read-llm-skip` | F3 instant read | **Must PASS** |
| `verify-feature4-session-boundary` | F4 session bind | **Must PASS** |
| `verify-feature5-historical-why-now` | F5 whyNow | **Must PASS** |
| `verify-feature6-wait-routing` (+ past-tense suite) | F6 routing + surgical wire | **Must PASS** |
| `verify-envelope-transitive-fields` | session-liquidity / mtf | **Must PASS** |
| `npm run test:observation` (+ chart-proof) | Observation | **Must PASS** on HEAD carve |
| interpretation / decision unit suites | C Fix2/3 when ported | **Must PASS** if Fix2/3 included |
| `test:session-liquidity` | Stay-flat policy | **Must PASS** |
| `npm run test:replay` | Observation/decision agreement | **Must PASS** when C fixtures in play |
| `test:analysis-contract` | Contract | **Must PASS** |
| `npx tsc --noEmit` | Typecheck | **Must PASS** (requires facts overlay fix) |

### Unrelated — must NOT block this patch

| Item | Why non-blocking |
|------|------------------|
| `test:regression` Telford / weather routing | Documented unrelated in C report |
| GENERAL_CHAT slowness / localhost `:3020` / casual classifier prod lag | Separate diagnosis |
| Live market weekend STALE / CME closed | Environmental source freshness |
| Real Upstash cross-isolate with production secrets | Environmental / deferred proof |
| Residual interpretation %-gap after Fix2 | Non-blocking for decision 100% claims |
| Continuous recorder adversarial suites | Excluded product |

---

## STEP 7 — BLOCKERS

| Issue | Classification | Notes |
|-------|----------------|-------|
| `observation-facts.ts` TypeScript errors | **PRE-SHIP REQUIRED** | Restore HEAD or HEAD-compat; not pre-existing baseline; not official six-feature patch |
| F6 deterministic WAIT answer wiring | **NON-BLOCKING** *(updated)* | Clean WT now has surgical wire + verify asserts; stale reports/patch still lag — treat **current WT** as source |
| Live market data stopping | **ENVIRONMENTAL** | Weekend/CME halt + local `:3020` down; not six-feature defect |
| Real Redis cross-isolate verification | **ENVIRONMENTAL** / **FUTURE WORK** | Adapter + injected failure probes done; live Upstash multi-isolate not proven |
| CME closed / live A/B | **ENVIRONMENTAL** | Wait for open market |
| Remaining interpretation % gap | **NON-BLOCKING** | Decision agreement was the C gate |
| Unrelated Telford regression | **NON-BLOCKING** | Weather routing |
| Continuous recorder | **EXCLUDED / FUTURE WORK** | Hard exclude from shipset |
| Wholesale C observation-engine | **SHIP BLOCKER** if attempted | Pulls dirty provenance stack |
| Using stale `.patch` file as SoT | **SHIP BLOCKER** if attempted | Missing B+F6; re-adds conversational-intent |
| Merging entire interp dirty WT | **SHIP BLOCKER** | Accidental recorder/latency/API import |

---

## STEP 8 — MERGE ORDER

*(Plan only — do not perform.)*

1. **Start from** baseline `74183b24553757a22fd71d79d0f8954d7c72872f` in an isolated integration worktree.  
2. **Apply A+B from clean WT file inventory** (new libs + surgical mixed edits), **including** red-team history/query/time-travel and F6 chat/stream wire — **not** the stale patch file.  
3. **Revert** `lib/observation-facts.ts` to HEAD (or apply HEAD-compat-only fix). Confirm `conversational-intent.ts` absent.  
4. **Integrate C Fix3** — copy `ny-open-long-a-plus.json` label reconcile.  
5. **Optionally integrate C Fix2** — manual surgical port onto HEAD `interpretation-engine.ts` (do not copy C file wholesale).  
6. **Do not integrate C Fix1 wholesale** — keep HEAD `observation-engine`; re-run observation/replay to confirm `liquidity_swept` on HEAD carve.  
7. **Run** regression matrix (Step 6): memory, mutability, last-decision, time-travel, F2–F6 verifies, observation/decision/replay, `tsc`.  
8. **Stop if** any must-pass suite fails, forbidden import appears, or `tsc` unclean.  
9. **Only then prepare** a fresh production patch / PR from the integration tree (human-gated apply to primary; still no deploy until accepted).

---

## STEP 9 — FINAL VERDICT

### CAN THESE WORKSTREAMS BE SAFELY CONSOLIDATED?

**CONDITIONAL**

#### Conditions

1. **Source of truth = current `.tmp/karen-six-feature-clean/` working tree**, not `karen-six-feature.patch`.  
2. **Never merge** `.tmp/karen-interp-decision-fixes/` as a whole dirty tree.  
3. **A+B files win** on all overlapping decision-memory / chat / QG paths.  
4. **`observation-facts.ts` restored/fixed** so `tsc --noEmit` is green before ship.  
5. **C Fix1** not imported as dirty `observation-engine` (HEAD path already sweep→taken; dirty path blocked).  
6. **C Fix2** only via surgical manual port (optional but recommended if similar-but-skip is in scope).  
7. **C Fix3** label file allowed.  
8. **Exclusions honored:** recorder, decision-memory-material, WT verdict-engine, latency, market-data-errors, conversational-intent, credentials, research-only noise.  
9. **Regression matrix green** (Step 6) in the integration tree before primary apply.  
10. **Human gate** still required for primary apply / deploy; Redis live A/B and CME-open checks remain environmental follow-ups.

---

### FINAL PROPOSED SHIPSET

**NEW:** decision-memory-backend, decision-envelope-history (cloned), decision-envelope, decision-contract-output, decision-time-travel (LIVE last_recorded), decision-history-query, mentor-intent, conversational-normalize, turn-category, mtf-horizons, session-liquidity  

**MODIFIED:** desk-pipeline, analysis-contract, analysis-quality-gate, chat-engine (incl. F6 wire), chat/stream route, market-data (`cmeSessionDateKey*`), extension/casual-chat.js; optional surgical interpretation-engine Fix2; ny-open label JSON  

**REVERT:** observation-facts → HEAD  

**KEEP HEAD:** observation-engine, decision-layer, verdict-engine  

### EXCLUDED FILES

continuous-decision-recorder, decision-memory-material, verdict-engine recorder WT, recorder tests/probes, live-latency-profile, market-data-errors, conversational-intent, level-interaction / dirty observation stack, unrelated dirty APIs, credentials/.env, research reports, entire dirty interp WT, stale patch-as-SoT  

### CONFLICTS

| Item | Resolution |
|------|------------|
| Shared memory/chat libs both trees | **A+B wins** |
| interpretation-engine Fix2 | **MANUAL** surgical port |
| observation-engine Fix1 dirty file | **BLOCKED** / N/A on HEAD |
| observation-facts overlay | **PRE-SHIP** restore HEAD |
| Stale patch vs clean WT | **WT wins** |

### BLOCKERS

- **PRE-SHIP:** observation-facts tsc  
- **SHIP BLOCKER if attempted:** wholesale C / dirty observation / stale patch / recorder  
- **ENVIRONMENTAL:** live Redis cross-isolate, CME open A/B, weekend market STALE  
- **NON-BLOCKING:** Telford, interpretation residual %, GENERAL_CHAT latency track  
- **F6 wire:** no longer a carve gap in current clean WT (verify still required post-integration)

### TEST PLAN

1. `tsc --noEmit`  
2. Memory adapter + red-team E + red-team B last-decision  
3. Time-travel + F2–F6 focused verifies (+ fuller harnesses where clean)  
4. Envelope transitive fields  
5. observation / observation-proof / session-liquidity / analysis-contract  
6. If Fix2/3 included: replay + decision agreement on labeled fixtures  
7. Forbidden-import rg on product paths  
8. Do **not** gate on Telford weather regression or live CME

### MERGE ORDER

Baseline → A+B clean WT carve → fix/revert observation-facts → C Fix3 → optional Fix2 surgical → **skip** dirty Fix1 → full regression → stop on fail → only then human-prepare primary patch.

---

## Confirmation

- Primary worktree product sources: **unchanged** by this plan.  
- No patch apply, commit, push, or deploy.  
- Only artifact: `data/research/karen-consolidated-shipset-integration-plan.md`.  

**STOP.**
