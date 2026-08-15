# KAREN — Overnight Clean Six-Feature Verification

**Date:** 2026-08-15  
**Mode:** CLEAN-TREE behavioral verification (STOP checkpoint — Adam)  
**Clean tree:** `.tmp/karen-six-feature-clean/` @ HEAD `74183b24553757a22fd71d79d0f8954d7c72872f`  
**Patch:** `.tmp/karen-six-feature-clean.patch`  
**Constraints honored:** no primary patch apply; no primary product edits; no git add / commit / push / deploy; continuous recorder excluded  

**STOP note:** Hardening of additional behavioral probes was interrupted by STOP. Checkpoint uses completed re-runs + integrity scans only. Unfinished deepenings marked UNVERIFIED below.

---

## 1. Executive verdict

**CONDITIONAL HOLD**

Features 1–5 re-verified green in the clean tree (focused + fuller harnesses). Feature 6 past-tense **classification / casual anaphora** is green, but the clean shipset does **not** wire `formatStructuredWaitFollowUp` into `chat-engine` (dirty WT does via `tryDeterministicMentorFollowUp`). Deterministic wait **answer** UX is therefore not end-to-end production-verified for the clean carve. `conversational-intent.ts` already **DROP**ped from clean patch (0 matches). Do **not** apply to primary WT without accepting that residual F6 carve and transitive envelope libs (`session-liquidity` / `mtf-horizons`).

---

## 2. Feature matrix

| # | Feature | Result | Evidence |
|---|---------|--------|----------|
| 1 | Redis decision memory | **PASS** | `test-decision-memory-adapter.ts` 49/0 — adapter green; LIVE/HISTORICAL + fixture isolation; honest miss / no-Redis RAM fallback covered by suite |
| 2 | QUALITY GATE envelope dedupe | **PASS** | `verify-feature2` 24/0; fuller `test-quality-gate-envelope-dedupe` 34/0 — canonical once; no MENTOR/TRADE wrappers in QG; §7 historical-ui **skipped** (harness-only, not product FAIL) |
| 3 | CURRENT_MARKET_READ instant LLM skip | **PASS** | `verify-feature3` 20/0; fuller instant-read 49/0 — flag gate; `envelope_instant`; fixture timing JSON `openaiCalls: 0`; historicalFixture short-circuit present in product |
| 4 | LIVE session-boundary | **PASS** | `verify-feature4` 13/0; fuller time-travel **127/0** includes weekend / holiday / DST honest miss + no prior-session HH:MM leak |
| 5 | Historical verdict + whyNow integrity | **PASS** | `verify-feature5` 27/0; fuller time-travel historical cells — PIT lookup preserves whyNow; LIVE empty during hist; honest miss; no LLM reconstruction path in lookup |
| 6 | Past-tense wait routing | **CONDITIONAL / partial** | Classification **PASS** (`verify-feature6` 11/0; past-tense suite 22/0; casual `(?:are\|were)`). Deterministic structured wait **answer** path **UNVERIFIED as production-wired** — clean `chat-engine.ts` has **0** `formatStructuredWaitFollowUp` refs; stream only short-circuits `CURRENT_MARKET_READ` |

---

## 3. Test counts and exact results

| Suite | Passed | Failed | Notes |
|-------|--------|--------|-------|
| `scripts/test-decision-memory-adapter.ts` | 49 | 0 | F1 |
| `scripts/verify-feature2-qg-envelope-dedupe.ts` | 24 | 0 | F2 focused |
| `scripts/test-quality-gate-envelope-dedupe.ts` | 34 | 0 | F2 fuller; §7 harness skip |
| `scripts/verify-feature3-instant-read.ts` | 20 | 0 | F3 focused |
| `scripts/test-karen-instant-read-llm-skip.ts` | 49 | 0 | F3 fuller |
| `scripts/verify-feature4-session-boundary.ts` | 13 | 0 | F4 focused |
| `scripts/verify-feature5-historical-why-now.ts` | 27 | 0 | F5 focused |
| `scripts/test-decision-history-time-travel.ts` | 127 | 0 | F4+F5 fuller |
| `scripts/verify-feature6-wait-routing.ts` | 11 | 0 | F6 focused (intent + formatter unit + orphan absent) |
| `scripts/test-karen-past-tense-wait-routing.ts` | 22 | 0 | F6 classification |
| `scripts/verify-envelope-transitive-fields.ts` | 14 | 0 | Extra deps |
| **Total this checkpoint** | **390** | **0** | Clean-tree only |

**Not completed this stop (UNVERIFIED deepenings):** extra source-level OpenAI-call instrumentation beyond fuller F3 fixture JSON; further stream-route end-to-end wait answer probe as a dedicated failing/positive assert suite; primary-WT dirty suite cross-compare.

`npx tsc --noEmit` this stop: **UNVERIFIED** (interrupted before re-run; prior overnight reported exit 0).

---

## 4. Extra dependency assessment

| Lib | Role | Assessment |
|-----|------|------------|
| `lib/mtf-horizons.ts` | Feeds `DecisionEnvelope` primary/HTF horizon prose | **ACCEPT — not inert.** Verified via `verify-envelope-transitive-fields` (horizons match builder outputs). |
| `lib/session-liquidity.ts` | Can force flat / `session_stay_out` on BSL-only / London–Asia raid | **ACCEPT — behavioral.** Changes stance/conflict; verified; do not stub if envelope parity required. |
| `lib/conversational-normalize.ts` | STT/contraction repair for mentor/turn | **KEEP** — used by `mentor-intent` / `turn-category`; routing text only. |
| `lib/turn-category.ts` | Sticky mentor vs general turn heuristics | **KEEP** — feature-6 graph via mentor-intent; not trade math. |

---

## 5. Feature-6 wiring verdict

| Surface | Status |
|---------|--------|
| `mentor-intent` past-tense (`were you waiting` → `WAIT_EXPLANATION`) | **WIRED / PASS** |
| `extension/casual-chat.js` `(?:are\|were) you waiting for` | **WIRED / PASS** |
| `conversational-intent.ts` | **DROP** — absent from clean tree; **0** patch matches |
| `formatStructuredWaitFollowUp` in `decision-contract-output` | Present in shipset |
| Call from clean `chat-engine` / stream wait short-circuit | **NOT WIRED** (0 chat-engine refs) |
| Dirty WT `tryDeterministicMentorFollowUp` | **Out of clean carve** (pulls excluded latency / historical-ui / market-data-errors graph) |

**Recommendation:** Keep past-tense routing carve as shipped. Either (a) accept CONDITIONAL HOLD without deterministic wait answers, or (b) follow-up **smallest surgical wire** of WAIT_EXPLANATION → `formatStructuredWaitFollowUp` from last pipeline **without** forbidden modules — **not done this STOP**. Do not re-add `conversational-intent` without call sites.

---

## 6. Forbidden-import scan

Scanned clean `lib/` `app/` `extension/` (product paths):

| Symbol | Result |
|--------|--------|
| `continuous-decision-recorder` | **ZERO** |
| `decision-memory-material` | **ZERO** |
| `withManualAnalysePriority` | **ZERO** |
| `live-latency-profile` | **ZERO** |
| `market-data-errors` | **ZERO** |

Expect **ZERO** in clean shipset — **met** for product paths this checkpoint.

---

## 7. Patch path inventory

`.tmp/karen-six-feature-clean.patch` paths:

```
app/api/chat/stream/route.ts
extension/casual-chat.js
lib/analysis-contract.ts
lib/analysis-quality-gate.ts
lib/chat-engine.ts
lib/conversational-normalize.ts
lib/decision-contract-output.ts
lib/decision-envelope-history.ts
lib/decision-envelope.ts
lib/decision-history-query.ts
lib/decision-memory-backend.ts
lib/decision-time-travel.ts
lib/desk-pipeline.ts
lib/market-data.ts
lib/mentor-intent.ts
lib/mtf-horizons.ts
lib/session-liquidity.ts
lib/turn-category.ts
```

No `conversational-intent.ts`. No continuous-recorder / verdict-engine recorder / live-latency-profile / market-data-errors paths in inventory.

Harness/verify scripts live under clean tree `scripts/` as verification-only (with-harness patch separate); not required as production shipset.

---

## 8. Remaining risks

1. **F6 deterministic wait answer unwired** in clean carve — wait questions can fall through to LLM on stream after intent classify.  
2. **`session-liquidity` / `mtf-horizons`** change DecisionEnvelope presentation/stance policy — accepted with asserts, but still product behavior beyond “plumbing.”  
3. Fuller QG §7 historical-ui path remains harness-skipped (not a product defect).  
4. Redis **live** credentials / CME open A/B — not exercised (environment); adapter suite used mocks.  
5. Patch apply to primary still **HUMAN-BLOCKED** by design.  
6. `tsc` reconfirm **UNVERIFIED** this stop.

---

## 9. Exact recommended next step

**Do not apply.** Human review: accept CONDITIONAL HOLD (F6 intent+casual only; orphaned structured-wait formatter) **or** authorize a clean-tree-only surgical WAIT_EXPLANATION → `formatStructuredWaitFollowUp` wire (no forbidden deps), re-run F6 production-surface asserts, then reconsider apply.

---

## 10. Explicit confirmation

- Primary worktree product sources: **unchanged** by this verification session (report write under `data/research/` only).  
- **No** git add / commit / push / deploy.  
- **No** patch apply to primary WT.  
- Continuous recorder / `lib/continuous-decision-recorder.ts` / `decision-memory-material` / WT `verdict-engine` recorder path: **excluded**.  
- Clean-tree product libs: **not modified** this STOP checkpoint (tests re-run only; hardening edits aborted).  

**STOP.**
