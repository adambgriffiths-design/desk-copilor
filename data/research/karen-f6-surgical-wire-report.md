# KAREN — F6 FINAL SURGICAL WIRE ONLY

**Date:** 2026-08-15  
**Mode:** CLEAN-TREE SURGICAL WIRE (isolated)  
**Clean tree:** `.tmp/karen-six-feature-clean/`  
**Constraints:** no primary product edits; no commit / push / deploy / patch apply; no forbidden imports; no conversational-intent re-add; no mentor-coaching / historical-ui graph; no routing redesign / trade-math changes  

**Prior refs:** `data/research/karen-overnight-clean-six-feature-verification.md`, `data/research/karen-clean-patch-verification-gaps-closed.md`

---

## 0. Investigation FIRST (proposed wire — before implement)

### Gap (verified)

| Surface | Status before wire |
|---------|--------------------|
| `mentor-intent` past-tense → `WAIT_EXPLANATION` | PASS |
| `extension/casual-chat.js` `(?:are\|were) you waiting for` | PASS |
| `formatStructuredWaitFollowUp` in `decision-contract-output` | Present, unit-tested |
| Clean `chat-engine` refs to `formatStructuredWaitFollowUp` | **0** |
| Deterministic WAIT answer E2E | **NOT WIRED** — falls through to casual/LLM |

Probe (clean tree):

```text
"What were you waiting for?"
  classifyMentorIntent → WAIT_EXPLANATION
  mustUseTradingStream → false
  isClearlyTrading (lib) → false
  isCasualChat → true
```

So stream route currently treats the question as **casual** and never reaches a structured formatter. Extension already marks wait anaphora as trading; server `lib/casual-chat-intent` does **not**. Wire must short-circuit on **mentor intent**, not redesign casual/trading gates.

### Dirty WT reference (do NOT copy whole graph)

Dirty `lib/chat-engine.ts` path (reference only):

1. `tryDeterministicMentorFollowUp` (pulls live-latency-profile, market-data-errors, historical-ui, conversational-intent — **FORBIDDEN**)
2. → `answerStructuredFollowUpFromLastPipeline`
3. → `getLastPipelineResult()` / hist fixture pipeline
4. → `classifyMentorIntent` === `WAIT_EXPLANATION`
5. → `formatStructuredWaitFollowUp(env, { long_case, short_case, entry_model, rejected_alternative })`

**Smallest surgical subset to copy:** steps 2–5 only (sync, last-pipeline RAM, no refresh / latency / historical-ui).

### Proposed dependency path (exact)

```text
POST /api/chat/stream
  → classifyMentorIntent(lastUser, mentorCtx) === "WAIT_EXPLANATION"
  → tryStructuredWaitFollowUpFromLastPipeline(lastUser, mentorCtx)
       → getLastPipelineResult()                    [lib/desk-pipeline]
       → env = pipe.analysis_contract.decision
       → formatStructuredWaitFollowUp(env, ctx)     [lib/decision-contract-output]
  → sseDone({ reply, responseSource: "wait_structured" })  // no OpenAI
  // else fall through existing paths unchanged
```

`lastPipeline` is already populated when a prior deep read ran `evaluateAnalysisQualityGate` → `runDecisionPipeline` → `runDeskPipeline` (sets `lastPipeline`). No new pipeline math.

### Exact files / hunks that would change

| File | Change |
|------|--------|
| `.tmp/karen-six-feature-clean/lib/chat-engine.ts` | Import `formatStructuredWaitFollowUp` + `getLastPipelineResult`; add exported `tryStructuredWaitFollowUpFromLastPipeline` (WAIT_EXPLANATION-only; optional PREVIOUS DECISION banner matching dirty label helper — banner text only, no latency). |
| `.tmp/karen-six-feature-clean/app/api/chat/stream/route.ts` | After mentor intent classify, **before** casual/snapshot/LLM: if `WAIT_EXPLANATION`, call helper; on hit return `sseDone`. |
| `.tmp/karen-six-feature-clean/scripts/verify-feature6-wait-routing.ts` | E2E: seed last pipeline via `runDeskPipeline(bullish-wait)` → `"What were you waiting for?"` → deterministic WAITING FOR output + `responseSource` contract; assert ordinary GENERAL_CHAT stays GENERAL_CHAT; assert chat-engine + stream route contain wire symbols. |

**Not changing:** `mentor-intent` classification, casual-chat-intent trading gates, decision envelope math, `conversational-intent.ts` (remains absent).

### Risk / non-goals

- No last pipeline → helper returns `null` → existing LLM/casual path (honest miss; not invented).
- Does not pull dirty `tryDeterministicMentorFollowUp` / INVALIDATION / why-not / prior-read spoken reuse.
- Does not add WAIT_ANAPHORA to server `isClearlyTrading` (routing redesign avoided); intent short-circuit is sufficient for API E2E.

---

## 1. Implementation status

*(filled after wire)*

---

## 2. Exact files changed

*(filled after wire)*

---

## 3. Exact dependency path (as shipped)

*(filled after wire)*

---

## 4. F6 results

*(filled after wire)*

---

## 5. Typecheck

*(filled after wire)*

---

## 6. Forbidden-import scan

*(filled after wire)*

---

## 7. SHIP-READY verdict

*(filled after wire)*
