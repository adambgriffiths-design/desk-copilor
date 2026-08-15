# KAREN — History Response Variability Gap

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** FIX + VERIFY — no prod deploy, no commit/push  
**Coordinate:** latency triage agent `5aa94967` — history stays deterministic (0 OpenAI; no heavy work)

---

## Exact report fields

```text
BYPASS ROOT CAUSE: PASS (identified + fixed)
LAST DECISION ×10: unique 4/10 · adjDup 0 · semantic 100% · ~62ms · OpenAI 0
LAST RECORDED ×10: unique 7/10 · adjDup 0 · semantic 100% · ~36ms · OpenAI 0
CURRENT STANCE ×10 (CMR spoken): unique 5/10 · adjDup ≤1 · semantic 100% · ~19ms · OpenAI 0
LAST LONG ×10: unique 6/10 · adjDup 0 · semantic 100% · ~57ms · OpenAI 0
NO DIRECTIONAL ×10: unique 4/10 · adjDup 0 · semantic 100% · ~17ms · OpenAI 0
PLAIN BANNER: PASS (no `LIVE — CURRENT SESSION HISTORY` in plain)
FOCUSED TEST: PASS (192)
TYPECHECK: PASS
```

---

## Extension repro

Ask “What was your last decision?” twice with the same history state → **identical** wording/structure.

In-process (warm ring) already varied leads. Extension hits **cold isolate** each request: ring empty → `pickDiverseIndex` always returns 0.

---

## Bypass map

| Path | Used renderer? | Used repetition memory? | Gap |
|------|----------------|-------------------------|-----|
| `formatAmbiguousLastDecisionReply` leads | Yes (`renderHistory*Lead`) | Ring only | **No chat `messages` passed** → serverless always variant 0 |
| `formatAtTimeReply` / last recorded | **Hardcoded** lead | Spoken only | Bypassed history lead pool |
| `formatDirectionalDecisionReply` | Yes | Ring only | Same messages gap |
| Miss / no-directional copy | Fixed strings | No | Stock identical miss lines |
| `labelLane` | N/A | N/A | Always prepended `LIVE — CURRENT SESSION HISTORY` in plain |
| History SSE (`stream/route.ts`) | N/A | N/A | Called `answerLiveDecisionHistoryQuery(q)` **without messages** |
| Extension rendering | Passthrough | N/A | Not the wording source |

Message mining was also ineffective: candidate fingerprints are **leads**, while assistant turns are **full replies** (often with lane banner). Exact fingerprint match never hit → avoid-list empty across requests.

**Not a second variability system** — same `conversational-renderer` + `response-repetition-memory`.

---

## Fix

1. **`answerLiveDecisionHistoryQuery(q, { messages })`** — thread chat turns into history leads / misses.
2. **Stream + chat-engine** — pass `working` / `input.messages`.
3. **`pickDiverseIndex`** — substring match against chrome-stripped assistant bodies; soft penalty on immediate prior reply; stop seeding `avoidOpen` with current candidate openings.
4. **`stripPresentationChrome`** — so openings/fingerprints ignore lane banners.
5. **`labelLane`** — omit LIVE/HISTORICAL banners in **plain** (keep in debug/structured).
6. **New/extended history renders** — `renderHistoryLastRecordedLead`, `renderHistoryEmptyMiss`, `renderHistoryNoDirectionalMiss`; wire last-recorded + miss paths.

Semantic facts unchanged: recorded stance, whether LONG/SHORT exists, timestamps, thesis/reason (DecisionKey still omitted in plain per prior UX).

---

## Files

| File | Change |
|------|--------|
| `lib/response-repetition-memory.ts` | Chrome strip; body substring avoid; adjacent soft penalty |
| `lib/conversational-renderer.ts` | Last-recorded + miss renders |
| `lib/decision-time-travel.ts` | Messages opts; plain no banner; wire renders |
| `app/api/chat/stream/route.ts` | Pass `working` messages |
| `lib/chat-engine.ts` | Pass `input.messages` |
| `scripts/test-karen-history-response-variability.ts` | **New** ×10 cold-isolate series |

---

## Verification

```bash
npx tsx scripts/test-karen-history-response-variability.ts   # 192 passed
npx tsc --noEmit -p tsconfig.json                            # PASS
```

Regression assertion kept: cold isolate **without** messages still collapses to identical wording (documents the prior bypass).

---

## Latency note (agent 5aa94967)

History path remains local pool selection only — **0 OpenAI**, no extra I/O. Series ×10 stays well under 100ms wall for the query path itself.
