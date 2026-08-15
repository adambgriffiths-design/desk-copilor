# KAREN — Clean Six-Feature Shipset Preparation

**Date:** 2026-08-15  
**Mode:** PREPARATION AUDIT ONLY — no product edits, no git add / commit / push / deploy  
**Branch:** `cursor/extension-v1.4.62-fixes`  
**HEAD:** `74183b24553757a22fd71d79d0f8954d7c72872f`  
**Inputs:** `karen-pre-commit-shipset-audit.md`, `git status`, import-graph greps  
(`continuous-decision-recorder`, `decision-memory-material`, `generatePipelineVerdict`, `recordDecisionEnvelopeHistory`)

**Approved features only:**
1. Redis decision memory  
2. QUALITY GATE envelope dedupe  
3. CURRENT_MARKET_READ instant LLM skip  
4. LIVE session-boundary fix  
5. Historical verdict + whyNow integrity  
6. Past-tense wait routing  

---

## Verdict: can features 1–6 ship WITHOUT recorder-modified `verdict-engine.ts`?

**YES.** Excluding worktree `lib/verdict-engine.ts` does **not** break any approved-feature dependency.

| Feature | Runtime authority (without WT `verdict-engine.ts`) | Needs recorder wrap? |
|---------|-----------------------------------------------------|----------------------|
| 1 Redis decision memory | `runDeskPipeline` → `recordDecisionEnvelopeHistory`; hydrate/flush via `chat/stream` + `chat-engine` | **No** |
| 2 QG envelope dedupe | `analysis-quality-gate.ts` → `formatCanonicalEnvelopeForPrompt` | **No** |
| 3 Instant LLM skip | `chat-engine` / `chat/stream` (`KAREN_INSTANT_READ_LLM_SKIP`, `tryCurrentMarketReadFastPath`) | **No** |
| 4 LIVE session-boundary | `decision-time-travel.ts` (`lookupLiveAtClock` / `cmeSessionDateKeyFromDate`) | **No** |
| 5 Historical verdict + whyNow | `decision-time-travel.ts` (`formatAtTimeReply` → recorded `whyNow`) | **No** |
| 6 Past-tense wait routing | `mentor-intent.ts` / `conversational-intent.ts` / `extension/casual-chat.js` | **No** |

**Analyse / envelope write path (feature 1):**  
`generatePipelineVerdict` → `runDecisionPipeline` → **`runDeskPipeline`** → **`recordDecisionEnvelopeHistory`**.  
History recording lives in `desk-pipeline.ts`, not in the continuous-recorder priority wrapper.

**WT `verdict-engine.ts` recorder coupling (excluded):**  
```
lib/verdict-engine.ts
  import { withManualAnalysePriority } from "@/lib/continuous-decision-recorder";
  generatePipelineVerdict → return withManualAnalysePriority(async () => { … })
```
That wrap exists only so continuous-recorder ticks yield to manual Analyse. HEAD `verdict-engine.ts` has **no** `continuous-decision-recorder` / `withManualAnalysePriority` / `flushDecisionMemoryWrites` / `decision-contract-output` imports.

**Collateral in WT `verdict-engine.ts` (also stay out with the file):**  
`flushDecisionMemoryWrites` after Analyse, `decision-contract-output` spoken helpers, structured-snapshot / chart-evidence churn. Feature 1 flush remains available on the chat path (`chat-engine.ts`); Analyse still records via `desk-pipeline` without the verdict-engine flush.

**STOP condition:** Not triggered — no approved feature requires shipping the recorder-modified `verdict-engine.ts`.

---

## APPROVED SHIP FILES

Feature-pure **new** libs (safe whole-file):

| path | feature(s) |
|------|------------|
| `lib/decision-memory-backend.ts` | 1 |
| `lib/decision-envelope-history.ts` | 1 (`recordDecisionEnvelopeHistory` / hydrate / flush) |
| `lib/decision-envelope.ts` | 1, 2, 5 (shared model) |
| `lib/decision-contract-output.ts` | 2 (+ used by 3, 5) |
| `lib/decision-time-travel.ts` | 4, 5 |
| `lib/decision-history-query.ts` | 4, 5 |
| `lib/mentor-intent.ts` | 6 |
| `lib/conversational-intent.ts` | 6 |

Wire-up / mixed (needed for runtime, **carve hunks** — do not whole-file commit without review):

| path | feature(s) |
|------|------------|
| `lib/desk-pipeline.ts` | 1 (LIVE `recordDecisionEnvelopeHistory`) |
| `lib/analysis-contract.ts` | 1, 2 |
| `lib/analysis-quality-gate.ts` | 2 |
| `lib/chat-engine.ts` | 1 flush, 3 instant skip |
| `app/api/chat/stream/route.ts` | 1 hydrate, 3, 4, 5 |
| `lib/market-data.ts` | 4 (`cmeSessionDateKey*` exports) |
| `extension/casual-chat.js` | 6 (client anaphora `(?:are\|were) you waiting for`) |

**Import-graph note (approved set):** `rg` over the approved paths above for `continuous-decision-recorder|decision-memory-material|withManualAnalysePriority` → **no matches**.

---

## EXCLUDED RECORDER FILES

| path | why |
|------|-----|
| `lib/continuous-decision-recorder.ts` | Continuous live recorder (untracked) |
| `lib/decision-memory-material.ts` | Material-change gate for recorder (untracked) |
| `scripts/test-continuous-decision-memory.ts` | Recorder test harness (untracked) |
| `.tmp-continuous-recorder-adversarial-probe.ts` | Recorder probe (untracked) |
| `lib/verdict-engine.ts` | **WT only** imports `withManualAnalysePriority` from recorder and wraps `generatePipelineVerdict`; also mixed non-ship churn — **exclude entirely** |
| `package.json` → `test:continuous-decision-memory` | Recorder-only script (omit if any scripts carved) |
| Recorder docs under `data/research/karen-continuous-*` | Audit/docs only |

---

## EXCLUDED UNRELATED FILES

**~234** dirty paths outside the approved six-feature set and exclude buckets (total dirty ≈ **645**; research/supervisor/tmp/cursor/recorder buckets ≈ **388**).

Examples:

- `DEPLOY.md`, `STABILIZATION_CHECKLIST.md`
- `app/api/chat/route.ts`, `app/api/desk-tracker/route.ts`, `app/api/levels/route.ts`, `app/api/market-intelligence/route.ts`, `app/api/market-snapshot/route.ts`, `app/api/verdict/route.ts`, voice API routes
- Extension surface beyond casual-chat wait fix: `extension/background.js`, `extension/content.js`, `extension/manifest.json`, voice/*, desk-tracker/*, chart-*
- Unrelated libs: `lib/analysis-depth.ts`, `lib/chart-live-price.ts`, `lib/tickstream/*`, research replay helpers, etc.
- Probes/tmp: `.tmp-market-snapshot*.json`, `.tmp-why-not-integrity-probe.*`, `.tmp-session-boundary-audit-probe.ts`, …
- `data/research/**` audits (including this file), `data/supervisor/**`, `reports/**`, `.cursor/**`
- Secrets: no `.env` / credential files in dirty tree for this audit

---

## Flags

```
APPROVED SHIP FILES:          8 new feature-pure libs + 7 mixed wire-ups (carve)
EXCLUDED RECORDER FILES:      continuous-decision-recorder, decision-memory-material,
                              recorder test/probe, WT verdict-engine, continuous test script
EXCLUDED UNRELATED FILES:     ~234 (examples above)
DEPENDENCY CHECK:             PASS
RECORDER DEPENDENCY LEAK INTO APPROVED SHIP: NO
BROKEN IMPORT RISK:           NO   (for the carve that omits WT verdict-engine + recorder)
CLEAN SHIPSET:                PASS
```

### Latent worktree hazard (not a clean-shipset FAIL)

If WT `lib/verdict-engine.ts` is committed **without** `lib/continuous-decision-recorder.ts`, TypeScript/build breaks:

`verdict-engine.ts` → `@/lib/continuous-decision-recorder` → `withManualAnalysePriority`.

That is exactly why `verdict-engine.ts` stays in **EXCLUDED RECORDER FILES**. Wholesale dirty-tree commit would reintroduce the leak; carve-only shipset does not.

---

## Import graph (summary)

```
APPROVED (no recorder):
  desk-pipeline ──► decision-envelope-history ──► decision-memory-backend
  analysis-quality-gate ──► decision-contract-output (formatCanonicalEnvelopeForPrompt)
  chat-engine / chat/stream ──► decision-envelope-history + decision-contract-output (+ fast paths)
  decision-time-travel ──► decision-envelope-history + decision-history-query + market-data
  mentor-intent / conversational-intent / casual-chat ──► past-tense wait markers

EXCLUDED LEAK (do not ship):
  verdict-engine (WT) ──► continuous-decision-recorder ──► decision-memory-material
                       └─► decision-envelope-history (flush only; redundant w/ chat flush)
  continuous-decision-recorder ──► recordDecisionEnvelopeHistory (recorder path only)
```

`generatePipelineVerdict` remains the structured Analyse entry on HEAD **without** `withManualAnalysePriority`. Envelope persistence for feature 1 is still `recordDecisionEnvelopeHistory` inside `runDeskPipeline`.

---

## STOP

Audit complete. No source changes beyond this report. No commit / push / deploy.  
**No verdict-engine coupling FAIL** — six-feature clean shipset is **PASS** when WT `verdict-engine.ts` and all recorder files stay excluded.
