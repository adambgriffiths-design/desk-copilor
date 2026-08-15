# Karen — QUALITY_GATE follow-up → “signal is aborted without reason”

**Date:** 2026-08-14  
**Mode:** READ-ONLY audit. No implementation. No trading-logic / DecisionEnvelope / quality-gate criteria / market-context changes. No commit / push / deploy. Avoided `lib/structure.ts` / `incremental-market-engine.ts`.

**Live sequence audited**

1. Initial read → `QUALITY_GATE` WAIT — OHLC / market state unavailable; current price unknown; market data missing; market structure not confirmed  
2. User: “why not long?”  
3. Response: “signal is aborted without reason”

---

## Report fields (exact)

```
INITIAL STATE:
  QualityGateResult { canDeliverVerdict:false, waitReason:"WAIT — OHLC / market state unavailable; …",
  missing:[OHLC/price/data/structure…], decisionEnvelope?: present-but-not-durable }
  Surfaced via throw Error("QUALITY_GATE:"+reply) → SSE done (responseSource=quality_gate).
  Class: A QUALITY_GATE WAIT + F MISSING MARKET DATA

FOLLOW-UP STATE:
  "why not long?" → parseWhyNotDirection("long") → mentor intent EXPLAIN_PREVIOUS_MARKET_READ
  → needsStructuredWaitFollowUp=true → tryDeterministicMentorFollowUp
  → no durable prior envelope / often no live intel cache → returns null
  → falls through to trading SSE / LLM (or hangs on MI if a refresh path is taken)
  → SW AbortController.abort() → Chromium AbortError message published as assistant reply
  Class: C REQUEST ABORT + D STREAM ABORT (visible); missing product branch for “no prior decision”

VALID ENVELOPE?:
  NO (for follow-up purposes). Gate may attach a process-local DecisionEnvelope from
  runDecisionPipeline even when canDeliverVerdict=false, but it is not a durable conversation
  decision, may be under-specified, and is not reliably available on the next serverless
  invocation. Conversation stores WAIT text only — not a valid prior LONG/SHORT/WAIT trade call.

ABORT SOURCE:
  extension/background.js desk-copilot-chat-stream:
    const ac = new AbortController(); setTimeout(() => ac.abort(), 90000);
    port.onDisconnect → ac.abort();
  Chromium AbortError.message = "signal is aborted without reason"
  (Node/other engines may say "This operation was aborted" — same class; see
  data/research/karen-sse-streaming-before.json).

ERROR SOURCE:
  Not a trading “signal”. AbortError.message leaked:
  SW catch → postMessage({ type:"error", error: e.message })
  → content streamChatFromPort reject
  → handleUserMessage catch → explainError(err,"chat") returns msg unchanged
  → publishAssistantReply(friendly)  // raw abort text becomes Karen’s answer
  Exception is NOT swallowed; it is mis-labeled as content.

ROUTING PATH:
  INITIAL READ
    → buildChatSystemPrompt / streamChatReply richPath
    → evaluateAnalysisQualityGate (intel built, canDeliverVerdict=false)
    → throw QUALITY_GATE:WAIT — …
    → app/api/chat/stream catch → sseDone(reply, responseSource=quality_gate)
    → chatHistory assistant = WAIT text (+ optional envelopeText)
  "why not long?"
    → mustUseTradingStream / tradingQ
    → POST /api/chat/stream
    → tryDeterministicMentorFollowUp (mentor_structured if spoken returned)
    → else streamChatReply (shouldSkipQualityGate true via isPriorReadFollowUpPhrase)
    → client SSE; on cancel/timeout → AbortError path above

WHY USER SEES "signal is aborted without reason":
  Chromium DOMException text for AbortController.abort() without reason, posted verbatim
  as chat/SSE error and then as the assistant bubble. Word “signal” = AbortSignal, not
  execution_signal / trade signal. Collides with trading vocabulary and looks like a
  decision abort.
```

---

## Trace (INITIAL READ → follow-up → final response)

| Step | Where | What happens |
|------|--------|----------------|
| 1 | `lib/analysis-quality-gate.ts` `evaluateAnalysisQualityGate` | Missing OHLC/price/data/structure → `canDeliverVerdict=false`, `waitReason` built; pipeline still runs; `decisionEnvelope` may be set on the gate object |
| 2 | `lib/chat-engine.ts` `streamChatReply` | Rich path + gate fail + `!shouldSkipQualityGate` → `throw new Error("QUALITY_GATE:"+reply)` |
| 3 | `app/api/chat/stream/route.ts` | Catch prefix → SSE **done** with WAIT body (`responseSource=quality_gate`). **Not** an abort |
| 4 | Extension chat history | Stores WAIT assistant text. No durable envelope store / no cross-instance `getLastPipelineResult` |
| 5 | User “why not long?” | `lib/mentor-intent.ts` `parseWhyNotDirection` → `"long"`; intent `EXPLAIN_PREVIOUS_MARKET_READ` |
| 6 | Stream route | `tryDeterministicMentorFollowUp` (`lib/chat-engine.ts`) because tradingStream / prior-read follow-up |
| 7 | Structured follow-up | Expects last pipeline envelope or reusable intel. After QUALITY_GATE / cold isolate: both often missing → **null** |
| 8a | Happy structured miss | Falls through; `shouldSkipQualityGate("why not long?")` true via `isPriorReadFollowUpPhrase` → LLM explain-prior path (no second QUALITY_GATE) |
| 8b | Slow / cancelled path | Client SW 90s `ac.abort()`, barge-in / new-turn `cancelActiveChatStream` → port disconnect → `ac.abort()` |
| 9 | Error UX | Raw AbortError string published as Karen reply |

Cross-check: `data/research/karen-indefinite-wait-audit.md` (abort UX + MI hang); `karen-sse-streaming-before.json` (`"This operation was aborted"`).

---

## Answers (1–10)

1. **What object/state represents the failed initial read?**  
   `QualityGateResult` (`canDeliverVerdict: false`, `missing[]`, `waitReason`). Transport: `Error("QUALITY_GATE:…")` → SSE done. Not an AbortSignal failure.

2. **Is there a valid DecisionEnvelope?**  
   **No** for follow-up. Gate may include `decisionEnvelope` in-process, but it is not a durable prior trade decision and must not be treated as a valid LONG/SHORT/WAIT call when the gate failed for missing market state.

3. **Does follow-up expect a valid previous decision?**  
   **Yes.** `answerStructuredFollowUpFromLastPipeline` / `formatWhyNotDirectionFollowUp` need `pipe.analysis_contract.decision` (or intel → envelope). Without that, structured path returns null.

4. **Does follow-up incorrectly enter execution/signal path?**  
   **Not the trading execution_signal path.** It enters trading chat stream + mentor why-not / LLM. The user-visible “signal” is **AbortSignal**. Secondary risk: if bad intel is reused with `allowStaleForFollowUp`, why-not formatter can still speak stance/“Until then” from a weak envelope — separate from this abort string.

5. **AbortController/AbortSignal involved?**  
   **Yes** — `extension/background.js` chat-stream `AbortController` (90s + port disconnect).

6. **Is request actually cancelled?**  
   **Yes** — `fetch(..., { signal: ac.signal })` is aborted; stream ends with error, not a completed mentor answer.

7. **Exception swallowed?**  
   **No** — posted and spoken/shown. Mapping is wrong (`explainError` does not remap `/aborted/i`).

8. **UI empty/aborted stream?**  
   Not an empty bubble: error text is published as the assistant reply. Stream aborted/cancelled, not silently blank.

9. **Quality gate treated as signal rather than WAIT/UNAVAILABLE?**  
   Initial gate is correct WAIT/UNAVAILABLE. Follow-up failure is **mislabeled** as abort “signal” text; gate is not re-thrown as AbortError. Product gap: unavailable prior read is not converted into a structured why-not WAIT/UNAVAILABLE answer.

10. **Missing branch for “previous read did not produce a decision”?**  
   **Yes.** No deterministic path: prior assistant was QUALITY_GATE / data-unavailable → “why not long?” → explain that **no long was rejected because no directional decision was made**.

---

## Distinction (A–F)

| Code | Applies? | Role in this bug |
|------|----------|------------------|
| **A QUALITY_GATE WAIT** | Yes | Initial read state |
| **B VALID WAIT DECISION** | No | Gate WAIT ≠ named wait-trigger trade decision |
| **C REQUEST ABORT** | Yes | Visible user string |
| **D STREAM ABORT** | Yes | Same abort cancels SSE/fetch |
| **E INTERNAL ERROR** | Partial | Error handled but unmapped |
| **F MISSING MARKET DATA** | Yes | Cause of initial gate |

**Primary visible class:** **C + D**  
**Primary product class for the sequence:** **A + F** then missing branch, with abort UX on the follow-up request.

---

## Smallest fix (do not implement)

**P0 — abort UX (extension only, no trading logic):**  
1. In `extension/background.js` chat-stream catch: if `e.name === "AbortError"` or `/aborted/i`, post a friendly error (e.g. “Request cancelled or timed out — market data was still unavailable; not a trade signal.”).  
2. In `extension/content.js` `explainError`: map `/aborted|aborterror|signal is aborted/i` the same way (do not `return msg` raw).

**P1 — missing follow-up branch (chat-engine / stream route, still no gate criteria change):**  
When `parseWhyNotDirection(q)` and last assistant matches QUALITY_GATE / `WAIT —` + unavailable/missing OHLC (or no `getLastPipelineResult` envelope), return a deterministic spoken reply:

- No LONG/SHORT claim  
- State that the prior read did not produce a decision because market state was unavailable  
- Optionally echo the prior missing reasons  

Prefer this over LLM / MI refresh for that case.

Do **not** change quality-gate criteria, DecisionEnvelope builders, or structure/incremental engines for this fix.

---

## Regression test design (prefer plan only — no production change)

**Goal:** quality-gate waiting → “why not long?” → deterministic structured response that does **not** claim LONG/SHORT when initial market state was unavailable; must **not** surface AbortError copy.

**Suggested file (when implementing):** `scripts/test-karen-quality-gate-why-not-followup.ts` (or extend `scripts/test-karen-wait-followup.ts` with a dedicated section).

**Setup (unit, no live Yahoo):**

1. Build a stub `DeskMarketIntelligence` / gate input that yields `evaluateAnalysisQualityGate(...).canDeliverVerdict === false` with missing including `OHLC / market state unavailable` (fixture empty/zero price / unknown structure — whatever the current gate already keys on; do not change gate).  
2. Simulate conversation: assistant last turn = quality-gate WAIT text (same shape as `QUALITY_GATE:` stripped reply).  
3. Call `tryDeterministicMentorFollowUp("why not long?", messages)` **or** the new helper once added.  
4. Assert:
   - Intent/routing: `parseWhyNotDirection` → `"long"`; `shouldSkipQualityGate` true  
   - Reply matches `/unavailable|no (directional )?decision|did not (make|produce)|WAIT|missing/i`  
   - Reply does **not** match `/\b(LONG|SHORT)\b/` as an active call (allow “why not LONG” label only if clearly non-claiming; prefer forbidding stance LONG/SHORT)  
   - Reply does **not** match `/signal is aborted|This operation was aborted|AbortError/i`  
5. Optional client unit: `explainError(new DOMException("signal is aborted without reason","AbortError"), "chat")` must not equal the raw Chromium string once P0 lands.

**Status this audit:** test **not** added (user: do not implement until root cause identified; prefer report + test design).

---

## File index

| Path | Relevance |
|------|-----------|
| `lib/analysis-quality-gate.ts` | Initial WAIT object |
| `lib/chat-engine.ts` | QUALITY_GATE throw; `tryDeterministicMentorFollowUp`; `shouldSkipQualityGate` |
| `lib/mentor-intent.ts` | `parseWhyNotDirection`, prior-read routing |
| `lib/decision-contract-output.ts` | `formatWhyNotDirectionFollowUp` (expects envelope) |
| `app/api/chat/stream/route.ts` | QUALITY_GATE → SSE done; mentor_structured attempt |
| `extension/background.js` | AbortController → raw AbortError |
| `extension/content.js` | `explainError` passthrough; `publishAssistantReply` |
| `data/research/karen-sse-streaming-before.json` | Prior `"This operation was aborted"` |
| `data/research/karen-indefinite-wait-audit.md` | Sister wait/abort inventory |
