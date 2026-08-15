# KAREN — Observation-facts pre-ship blocker cleared

**Date:** 2026-08-15  
**Tree:** `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-six-feature-clean`  
**Baseline HEAD:** `74183b24553757a22fd71d79d0f8954d7c72872f`  
**Mode:** CLEAN WT ONLY — no primary apply / commit / push / deploy  
**SoT:** current clean WT files (not stale `karen-six-feature.patch`)

---

## STEP 1 — observation-facts restore

**Action:** Restored `lib/observation-facts.ts` from HEAD via `git checkout HEAD -- lib/observation-facts.ts`.

**Removed dirty overlay that depended on:**
- `./session-liquidity` (`classifyLevelSide`, `describeSweepFact`, `sweptStatusNote`)
- richer liquidity fields `level.side` / `level.status` / `level.id` (not in clean `desk-schema`)
- session-level swept annotation via `liquiditySweeps` levelId/label sets
- PDH/PDL/PDC sweep gate against `obsLevel.id`

**HEAD-compatible adaptation:** none required — exact HEAD blob restored.

**Verify:** working tree `lib/observation-facts.ts` hash matches `HEAD:lib/observation-facts.ts`; zero matches for `session-liquidity|level.side|level.status|level.id`.

---

## STEP 2 — typecheck

```text
npx tsc --noEmit
```

**Result:** **0 errors** (exit 0).

---

## STEP 3 — clean-tree regression matrix

| # | Script | Result | Pass/Fail |
|---|--------|--------|-----------|
| 1 | `scripts/test-decision-memory-adapter.ts` | PASS | **49 / 0** |
| 2 | `scripts/red-team-E-mutability-repro.ts` | PASS | **3 / 0** (ALL PASS) |
| 3 | `scripts/red-team-B-last-decision-repro.ts` | PASS | **12 / 0** (ALL PASS) |
| 4 | `scripts/test-decision-history-time-travel.ts` | PASS | **127 / 0** |
| 5 | `scripts/verify-feature2-qg-envelope-dedupe.ts` | PASS | **24 / 0** |
| 6 | `scripts/verify-feature3-instant-read.ts` | PASS | **20 / 0** |
| 7 | `scripts/verify-feature4-session-boundary.ts` | PASS | **13 / 0** |
| 8 | `scripts/verify-feature5-historical-why-now.ts` | PASS | **27 / 0** |
| 9 | `scripts/verify-feature6-wait-routing.ts` | PASS | **25 / 0** |
| 10 | `scripts/verify-envelope-transitive-fields.ts` | PASS | **14 / 0** |

**Scripts:** **10 PASS / 0 FAIL**  
**Asserts:** **314 passed / 0 failed**

---

## STEP 4 — forbidden dependency scan (product paths)

Scanned `lib/`, `app/`, `extension/` for:

- `continuous-decision-recorder`
- `decision-memory-material`
- `withManualAnalysePriority`
- `live-latency-profile`
- `market-data-errors`

**Product hits:** **ZERO**

Note: `scripts/test-karen-instant-read-llm-skip.ts` has an optional `require("../lib/live-latency-profile")` with catch stub; `verify-feature3` mentions it in a comment only. Neither is a product import.

---

## STEP 5 — `git diff --name-only` vs `74183b2` classification

### Modified (tracked)

| Path | Class |
|------|--------|
| `app/api/chat/stream/route.ts` | **F6 SURGICAL WIRE** / APPROVED SIX-FEATURE |
| `extension/casual-chat.js` | **APPROVED SIX-FEATURE** (F6 anaphora) |
| `lib/analysis-contract.ts` | **APPROVED SIX-FEATURE** |
| `lib/analysis-quality-gate.ts` | **APPROVED SIX-FEATURE** (F2) |
| `lib/chat-engine.ts` | **APPROVED SIX-FEATURE** + **F6 SURGICAL WIRE** |
| `lib/desk-pipeline.ts` | **APPROVED SIX-FEATURE** |
| `lib/market-data.ts` | **APPROVED SIX-FEATURE** |
| `tsconfig.tsbuildinfo` | build artifact (ignore; not product shipset) |

`lib/observation-facts.ts` — **no longer differs from HEAD** (blocker cleared).

### Untracked — product libs

| Path | Class |
|------|--------|
| `lib/conversational-normalize.ts` | APPROVED SIX-FEATURE |
| `lib/decision-contract-output.ts` | APPROVED SIX-FEATURE |
| `lib/decision-envelope.ts` | APPROVED SIX-FEATURE |
| `lib/decision-envelope-history.ts` | APPROVED SIX-FEATURE + **RED-TEAM BUGFIX** (L1 clone) |
| `lib/decision-history-query.ts` | APPROVED SIX-FEATURE + **RED-TEAM BUGFIX** (last_recorded) |
| `lib/decision-memory-backend.ts` | APPROVED SIX-FEATURE |
| `lib/decision-time-travel.ts` | APPROVED SIX-FEATURE + **RED-TEAM BUGFIX** (LIVE last decision) |
| `lib/mentor-intent.ts` | APPROVED SIX-FEATURE |
| `lib/mtf-horizons.ts` | APPROVED SIX-FEATURE |
| `lib/session-liquidity.ts` | APPROVED SIX-FEATURE |
| `lib/turn-category.ts` | APPROVED SIX-FEATURE |

### Untracked — harness / meta

| Path | Class |
|------|--------|
| `scripts/verify-feature*.ts`, `verify-envelope-transitive-fields.ts` | APPROVED SIX-FEATURE harness |
| `scripts/test-decision-*.ts`, `test-karen-*.ts`, `test-quality-gate-envelope-dedupe.ts` | APPROVED SIX-FEATURE harness |
| `scripts/red-team-*.ts` | **RED-TEAM BUGFIX** harness |
| `karen-six-feature.patch` | STALE — not SoT |
| `data/supervisor/overnight-karen-progress.md` | meta |

**UNEXPECTED product files:** **NO**

---

## Exact final fields

```text
OBSERVATION-FACTS BLOCKER: FIXED
TYPECHECK: PASS
REGRESSION MATRIX: PASS
FORBIDDEN IMPORTS: PASS
UNEXPECTED FILES: NO
SIX-FEATURE TREE STATUS: READY FOR INTEGRATION
```

**STOP.** No commit / push / deploy. No primary apply.
