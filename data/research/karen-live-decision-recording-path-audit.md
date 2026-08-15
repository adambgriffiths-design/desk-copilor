# KAREN — LIVE Decision Recording Path Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes, no mentor wording changes, no new DB/cache, no commit/push/deploy  
**Question:** Are live DecisionEnvelopes actually recorded, and can mentor retrieve them?  
**Chrome panel soft phrases** (“I don't track opinions over time…”, “I don't have specific data from that time…”): **SAFE** (no fabrication). Those strings are **not** in product code; they are LLM soft-refusals when the structured history path is not used. **Do not change wording.**

**Regression checked:** `npm run test:decision-history-time-travel` → **58 passed, 0 failed**  
**Fresh-process probe:** `getDecisionEnvelopeHistory("LIVE")` → **0 entries** (expected; ring is process-local)

---

## End-to-end live path (code)

```
market read
  → buildDeskMarketIntelligence / generateChartAnswer (live-verdict)
  → evaluateAnalysisQualityGate OR runDecisionPipeline
  → runDeskPipeline (lib/desk-pipeline.ts)
  → analysis_contract.decision = DecisionEnvelope
  → recordDecisionEnvelopeHistory({ dataMode: "LIVE", … })   // if not suppressed
  → in-memory LIVE ring (lib/decision-envelope-history.ts)
  → later: isDecisionHistoryTimeQuery(user)
  → answerLiveDecisionHistoryQuery (lib/decision-time-travel.ts)
  → mentor reply (LIVE — CURRENT SESSION HISTORY / NO DECISION AVAILABLE)
```

### Creation

| Step | Where | Notes |
|------|--------|--------|
| Live Analyse Market | `extension/content.js` → `/api/live-verdict` | `generateChartAnswer` → `runDecisionPipeline` → `runDeskPipeline` |
| Live chat chart read | `lib/chat-engine.ts` → `evaluateAnalysisQualityGate` | same `runDecisionPipeline` → records on first gate for that `stateHash` |
| Envelope object | `buildAnalysisContract` → `analysis_contract.decision` | stance, thesis, layers, conflictLog, invalidation, reasoningChain |
| LIVE record | `runDeskPipeline` after contract build | Skipped when `withDecisionHistorySuppressed` / historical PIT |

`lib/desk-pipeline.ts` (record site):

- `asOf` = `state.quality.lastBarTime` (sec→Date) else `state.updatedAt` / now  
- `dataMode: "LIVE"`  
- full `envelope`  
- `stateHash` + `marketState` including optional `snapshotId`  
- **does not pass `decisionKey`**

### Persistence

| Store | What | DecisionEnvelope history? |
|-------|------|---------------------------|
| `liveHistory[]` in `lib/decision-envelope-history.ts` | Full `DecisionEnvelopeHistoryEntry` (max 80) | **YES — authoritative LIVE history** |
| `data/session-log.jsonl` (`appendSessionLog`) | id, createdAt, verdict **text**, marketContext | **NO** — not envelope history; not used by time-travel |
| Disk / DB / Redis for LIVE ring | — | **NONE** |

Module state is **process-local**. Restart, cold start, or a different serverless isolate → empty LIVE ring (honest miss if query hits structured path).

### Retrieval / mentor

| Path | Entry | Behavior |
|------|--------|----------|
| LIVE | `app/api/chat/stream/route.ts` when `!isHistorical && isDecisionHistoryTimeQuery` | `answerLiveDecisionHistoryQuery` |
| HISTORICAL | `lib/research/replay/historical-ui.ts` | `answerHistoricalDecisionTimeTravel` + PIT rebuild |
| Non-matching phrasing | falls through to LLM / coaching | Soft “don’t track / don’t have specific data…” (not in repo) |

Empty LIVE ring + matching query → deterministic **`NO DECISION AVAILABLE`** / `live_decision_missing` (safe).  
Empty ring + **non**-matching query → LLM soft refuse (also safe; looks like “no history”).

`decisionKey` on replies is **synthesized** in `entryToSnapshot` as `{lane|fixture}@{barIndex}|{stance}|{verdict}|{asOf}`. Input `decisionKey` is accepted by the recorder but **never written** onto the entry object.

---

## Answers (1–14)

1. **Is live DecisionEnvelope stored anywhere?** YES — in the process-local LIVE ring when `runDeskPipeline` records; not durably.
2. **Where?** `lib/decision-envelope-history.ts` → module `liveHistory` (max 80). Not `session-log.jsonl`.
3. **timestamp stored?** YES — `asOf` + `recordedAt`.
4. **decisionKey stored?** NO on entry (accepted but dropped). Synthesized at answer time only.
5. **market snapshot identity stored?** YES — `stateHash`; optional `marketState.snapshotId` (+ price/HTF/structure/…).
6. **stance stored?** YES.
7. **thesis stored?** YES (`thesis` + full `envelope.thesis`).
8. **evidence stored?** YES — full `envelope` (`layers.facts`, `reasoningChain`, etc.).
9. **invalidation stored?** YES (`invalidation` + `envelope.invalidation`).
10. **Retrievable after original request finishes?** YES **only in the same Node process**; NO across restart / typical multi-instance serverless hop.
11. **Can mentor query retrieve it?** YES **if** LIVE ring still has the entry **and** the question matches `isDecisionHistoryTimeQuery` on `/api/chat/stream`. Otherwise miss or LLM soft refuse.
12. **Historical fixture a different storage path?** YES — separate `historicalHistory` ring + PIT rebuild (`force: true`); lanes never mix.
13. **Live panel simply missing history retrieval wiring?** **NO.** Wiring exists in `chat/stream`. Gap is durability / isolate sharing / phrase→LLM bypass — not a missing import.
14. **Genuinely no live decision history yet?** **NO** as infrastructure — LIVE record + retrieve code exists and is tested. **YES** as durable product history — nothing survives process boundaries; no LIVE ring entry available to inspect in this audit.

---

## Test with one existing live/recorded DecisionEnvelope

| Candidate | Result |
|-----------|--------|
| Fresh-process LIVE ring | **0 entries** — none available |
| `data/session-log.jsonl` | **35** `source: "live"` rows (last `2026-08-14T19:04:49.288Z`) — verdict text + marketContext only; **no** DecisionEnvelope / stance / thesis / decisionKey / history API |
| HISTORICAL / fixture | Available via `synthetic-ny-am` + time-travel tests — **different path** |

**Verdict:** No existing LIVE DecisionEnvelope history entry available to retrieve. Do not fabricate. Session-log proves live chart reads occurred, but that store is **not** the mentor decision-history path.

In-process LIVE behavior is covered by `scripts/test-decision-history-time-travel.ts` §7 (synthetic LIVE insert + isolation) and prior integrity probe — not a production live tape.

---

## LIVE DECISION CREATED: YES
## STORED: YES
## STORAGE LOCATION: process-local in-memory LIVE ring (`lib/decision-envelope-history.ts` `liveHistory`, max 80); not durable; not `data/session-log.jsonl`
## TIMESTAMP: YES (`asOf`, `recordedAt`)
## DECISION KEY: NOT PERSISTED on entry; synthesized at reply (`{lane}@{barIndex}|{stance}|{verdict}|{asOf}`)
## SNAPSHOT ID: YES optional via `marketState.snapshotId` + always `stateHash`
## RETRIEVABLE: YES (same Node process only); NO across restart / other isolate
## MENTOR CAN RETRIEVE: YES when ring populated + history-query match on `/api/chat/stream`; else deterministic miss or LLM soft refuse
## FIXTURE PATH: HISTORICAL ring + PIT (`historical-ui` / `answerHistoricalDecisionTimeTravel` / `lookupHistoricalDecisionAtClock`, `force: true`)
## LIVE PATH: `runDeskPipeline` → `recordDecisionEnvelopeHistory(LIVE)` → `answerLiveDecisionHistoryQuery` via `chat/stream`
## FIRST MISSING LINK: LIVE history is process-RAM only — Analyse Market (`live-verdict`) and later mentor Q (`chat/stream`) often do not share the same isolate; ring empty after request/process boundary (secondary: unmatched phrasing skips structured path → LLM “don’t track opinions…”)
## SAFE NEXT FIX: Persist LIVE `DecisionEnvelopeHistoryEntry` in a store shared by live-verdict + chat/stream (or sticky single process); keep history intents on `answerLiveDecisionHistoryQuery` (empty → `NO DECISION AVAILABLE`, never invent). Do not change SAFE soft-refusal wording until structured retrieval is reliable.

---

## Stop

Audit complete. No remediation code, wording changes, commit, push, or deploy.
