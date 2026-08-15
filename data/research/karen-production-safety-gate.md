# KAREN — Production Safety Gate

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no product code changes, no commit / push / deploy  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`  
**Proposed shipment:** 6 features (Redis decision memory, QG envelope dedupe, instant LLM skip, LIVE session-boundary, historical verdict+whyNow, past-tense wait routing)  
**Explicitly excluded:** continuous decision recorder (code may exist in worktree; must not ship)

**Evidence corpus:** code inspection + `karen-recorded-vs-pit-fix.md`, `karen-live-decision-history-session-boundary-fix.md`, `karen-live-decision-history-integrity-audit.md`, `karen-redis-production-readiness-audit.md` / `karen-real-redis-integration-audit.md`, `karen-instant-read-llm-skip-implementation.md` + `scripts/test-karen-instant-read-llm-skip.ts`, `scripts/test-karen-intent-routing.ts` (sky-blue / GENERAL), `karen-continuous-recorder-adversarial-audit.md` / `karen-continuous-decision-memory-implementation.md`, `karen-pre-commit-shipset-audit.md`.

---

## Gate matrix (1–12)

| # | Invariant | Result | One-line evidence |
|---|-----------|--------|-------------------|
| 1 | Recalculate historical decisions from later market data | **PASS** | NL at_time is recorded-ring only (`lookupRecordedHistoricalAtClock` / LIVE ring); `karen-recorded-vs-pit-fix.md` — later 09:41 does not manufacture 09:30; suite proves future data cannot alter earlier recorded status. |
| 2 | Cross-contaminate LIVE and HISTORICAL memory | **PASS** | Separate L1 arrays + Redis keys `karen:decision:LIVE` vs `karen:decision:HISTORICAL:{fixtureId}`; Chat history hydrate is `lane: "LIVE"` only; time-travel suite §7/§11 isolation green. |
| 3 | Cross-contaminate different historical fixtures | **PASS** | Per-fixture Redis keys + `findDecisionAtOrBefore(..., { fixtureId })`; adapter test §7 fixture-A hydrate does not surface fixture-B until B hydrated. |
| 4 | Return a prior CME session for a current-session clock query | **PASS** | `lookupLiveAtClock` filters by `cmeSessionDateKeyFromDate(latest.asOf)` before HH:MM / nearest-previous; `karen-live-decision-history-session-boundary-fix.md` — 127/0 including previous-session / weekend / holiday honest miss. |
| 5 | Invent a decision when Redis is unavailable | **PASS** | Missing Upstash → ram-only (no throw); hydrate failure clears lane L1 → honest empty / miss (`hydrateDecisionMemoryFromStore` comment + adapter test 14); never fabricates an envelope. |
| 6 | Use the LLM to reconstruct missing recorded history | **PASS** | LIVE/HIST clock queries short-circuit in `chat/stream` via `answerLiveDecisionHistoryQuery` / historical fixture turn with recorded miss wording; no PIT rebuild on NL at_time (`recorded-vs-pit-fix`). |
| 7 | Ordinary GENERAL_CHAT inherit trading mode | **PASS** | `mustUseTradingStream` false for sky-blue / capital-of-Germany; `scripts/test-karen-intent-routing.ts` §1c asserts casual route even after a market-read context. |
| 8 | Historical queries enter CURRENT_MARKET_READ | **PASS** | `isDecisionHistoryTimeQuery` handled before trading/instant paths; clock “what was your decision…” classified as CHANGE_ANALYSIS / history, not `isCurrentMarketRead`. |
| 9 | CURRENT_MARKET_READ use historical data | **PASS** | Instant path returns null when `historicalFixture` set; historical requests take `answerHistoricalFixtureTurn` first; live fast path builds same-request LIVE quality-gate envelope only. |
| 10 | Instant-read path call OpenAI on successful deterministic read | **PASS** | `tryInstantReadFromQualityGate` / `tryCurrentMarketReadFastPath` → `formatMentorTradeSpoken` with `openaiCalls: 0` / `responseSource=envelope_instant`; test 1/16 asserts no OpenAI on hit (`test-karen-instant-read-llm-skip`). |
| 11 | Start a continuous background timer on Vercel | **PASS** | Proposed ship excludes recorder; even WT recorder is event-driven only (no `setInterval`); `vercel.json` has no cron; no app route calls `runContinuousDecisionRecorderTick`. |
| 12 | Ship the continuous recorder accidentally | **PASS** | `karen-pre-commit-shipset-audit.md`: `CONTINUOUS RECORDER EXCLUDED: YES` — omits `continuous-decision-recorder.ts`, `decision-memory-material.ts`, recorder test script, and `verdict-engine.ts` (pulls recorder via `withManualAnalysePriority`). |

---

## BLOCKER

**None against invariants 1–12**, provided the proposed ship follows the shipset carve (exclude continuous recorder + `verdict-engine.ts` recorder wrap).

**Process risk (not an invariant FAIL if carve is followed):** a wholesale dirty-tree commit would **FAIL #12** because WT `lib/verdict-engine.ts` imports `@/lib/continuous-decision-recorder` and `lib/continuous-decision-recorder.ts` / `lib/decision-memory-material.ts` exist as untracked files. Shipset audit already flags this: carve only; do not whole-tree commit.

---

## Shipset coupling note (item 12)

| Fact | Detail |
|------|--------|
| Recorder exists in WT | YES — must be excluded from ship (existence ≠ ship) |
| Accidental pull path | Modified `lib/verdict-engine.ts` → `withManualAnalysePriority` from recorder |
| Proposed shipset stance | Exclude recorder modules **and** `verdict-engine.ts` wholesale |
| Item 12 meaning | Accidental **include in shipment**, not “code absent from disk” |

---

## Residual (non-blocking for this gate)

| Note | Severity |
|------|----------|
| LIVE `answerLiveDecisionHistoryQuery` does not handle `last_recorded` / `immediately_before` (falls through to `null`) — primary at_time / since / between miss paths still honest-miss without LLM | Low / out of core #6 wording |
| Redis cross-isolate **runtime** still UNVERIFIED in workspace (Sensitive env pull) — does not invent decisions; softens production confidence only | Ops readiness, not gate FAIL |
| Instant-read flag defaults OFF — when ON, successful path still 0 OpenAI | N/A for #10 |

---

## Overall

| Field | Value |
|-------|--------|
| **OVERALL** | **PASS** (12/12) |
| **BLOCKER** | **None** (carve required to keep #12 true) |
| **Ship continuous recorder?** | **NO** — excluded by design |

---

## STOP

Audit complete. No product code changes. No commit. No push. No deploy.
