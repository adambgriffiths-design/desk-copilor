# KAREN — Clean Patch Verification Gaps Closed

**Date:** 2026-08-15  
**Mode:** CLEAN-TREE VERIFICATION ONLY  
**Scope:** `.tmp/karen-six-feature-clean/` (+ this report under primary `data/research/`)  
**Constraints honored:** no patch apply to primary WT; no primary product source edits; no git add / commit / push / deploy on primary  

---

## What was closed

Focused **clean-tree-only** verification scripts for features **2–6** (no `historical-ui`, `live-latency-profile`, or `mentor-coaching`). Feature **1** re-ran existing adapter suite. Transitive libs `session-liquidity` / `mtf-horizons` documented + asserted (behavior unchanged). Orphan `conversational-intent.ts` analyzed (no call sites added).

### Verification scripts (clean tree only — **not** primary WT shipset unless separately promoted)

| Script | Feature |
|--------|---------|
| `scripts/test-decision-memory-adapter.ts` | 1 Redis / memory (copied for re-run; verification-only) |
| `scripts/verify-feature2-qg-envelope-dedupe.ts` | 2 QG envelope dedupe |
| `scripts/verify-feature3-instant-read.ts` | 3 Instant LLM skip |
| `scripts/verify-feature4-session-boundary.ts` | 4 LIVE session boundary |
| `scripts/verify-feature5-historical-why-now.ts` | 5 Historical whyNow / time-travel |
| `scripts/verify-feature6-wait-routing.ts` | 6 Past-tense wait routing |
| `scripts/verify-envelope-transitive-fields.ts` | session-liquidity / mtf-horizons field influence |

Production patch artifact **not** rewritten; tests live as separate verification scripts under the clean tree.

---

## Feature results (runs in clean tree)

| Feature | Result | Notes |
|---------|--------|-------|
| 1 Redis / memory | **PASS** | 49/0 adapter suite |
| 2 QG | **PASS** | 24/0 — canonical once; no MENTOR/TRADE wrappers in QG |
| 3 Instant read | **PASS** | 20/0 — flag gate + `envelope_instant`; no latency dep |
| 4 Session boundary | **PASS** | 13/0 — CME session bind; prior-session miss; no cross-session nearest |
| 5 Historical whyNow | **PASS** | 27/0 — PIT lookup + reply preserves `whyNow`; LIVE empty |
| 6 Wait routing | **PASS** | 11/0 — mentor-intent were-forms + casual `(?:are\|were)` + structured formatter |

`npx tsc --noEmit -p .` in clean tree → **exit 0**.

---

## Orphan: `lib/conversational-intent.ts`

**Recommendation: KEEP**

**Reason:** Plan feature-6 isolation lib; compiles with HEAD stubs; **zero** product importers in the clean shipset (`chat-engine` / routing / stream route never import it). Feature-6 past-tense wait **as carved** already works via `mentor-intent` + `extension/casual-chat.js`. **Do not REMOVE** (would discard ready isolation for a follow-up surgical wire matching dirty WT). **Do not WIRE now** (would expand mixed edits beyond the six-feature carve). Follow-up: optional surgical call sites — out of this verification task.

---

## Session-liquidity → DecisionEnvelope (behavior unchanged; documented)

| Influence | Field / path |
|-----------|----------------|
| Blocks long on BSL-only / London–Asia high raid | `shouldBlockLongFromSessionLiquidity(obs)` |
| Forces WAIT away from wait-for-trigger | `isWaitForTrigger` → false when blocked → `resolveStance` **flat** (not wait) |
| Conflict policy | `conflictResolution.between = "session_stay_out"`; sentence cites stay-out / swept high |
| Copy / citations | `sessionLiquidityStayFlatReason` feeds reasoning chain; may cite `session_liquidity` |

Focused asserts: BSL-only PDH sweep → block long, stay-flat reason, stance ≠ long, `session_stay_out` sentence. **No product code changed.**

**SESSION-LIQUIDITY BEHAVIOR: ACCEPT** — intentional ICT stay-flat policy in envelope used by QG / history / spoken formatters; verified, not stubbed.

---

## MTF-horizons → DecisionEnvelope (behavior unchanged; documented)

| Influence | Field / path |
|-----------|----------------|
| Primary horizon label/prose | `primaryHorizon.timeframe` ← `mtf.short_label`; `primaryHorizon.summary` ← `mtf.short` |
| HTF context | `htfContext.summary` ← `mtf.long`; timeframe mapped from long label (daily) |
| Downstream | Horizon text appears in QG canonical envelope / history / spoken paths |

Focused asserts: bullish-wait envelope horizons match `buildMtfHorizonSummaries` outputs. **No product code changed.**

**MTF-HORIZONS BEHAVIOR: ACCEPT** — presentation-only enrichment required by envelope; verified.

---

## Leak checks

```text
rg continuous-decision-recorder|decision-memory-material|withManualAnalysePriority|live-latency-profile|market-data-errors|historical-ui|mentor-coaching
  → lib/ app/ extension/ : no matches

verify scripts: excluded names appear only in file-header comments (no imports)
git status product paths: only the known 7 mixed + 12 feature/transitive adds
```

**RECORDER LEAK: PASS**  
**UNRELATED DEPENDENCY LEAK: PASS**

---

## FINAL

```
FEATURE 1 REDIS: PASS
FEATURE 2 QG: PASS
FEATURE 3 INSTANT READ: PASS
FEATURE 4 SESSION BOUNDARY: PASS
FEATURE 5 HISTORICAL WHY-NOW: PASS
FEATURE 6 WAIT ROUTING: PASS
ORPHAN conversational-intent.ts: KEEP — plan feature-6 isolation lib; zero clean-tree product importers; wait routing already covered by mentor-intent + casual-chat; do not REMOVE; WIRE deferred (out of carve)
SESSION-LIQUIDITY BEHAVIOR: ACCEPT
MTF-HORIZONS BEHAVIOR: ACCEPT
TYPECHECK: PASS
RECORDER LEAK: PASS
UNRELATED DEPENDENCY LEAK: PASS
FINAL CLEAN PATCH STATUS: CONDITIONAL
```

**CONDITIONAL why:** Verification gaps for features 2–6 are closed green and transitive envelope influence is accepted with asserts, but the shipset still carries **orphaned** `conversational-intent.ts` (KEEP, unwired) and feature 6 still lacks dirty-WT `tryDeterministicMentorFollowUp` / structured-wait **chat-engine** helpers. Apply to primary only if that residual carve surface is explicitly accepted.

---

## Confirmation

- Primary worktree product sources: **not modified**  
- Clean tree: verification scripts added; product libs / patch behavior **not** altered for this task  
- Only primary write: `data/research/karen-clean-patch-verification-gaps-closed.md`  
- **STOP.**
