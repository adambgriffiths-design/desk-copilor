# KAREN — Contextual “Why?” / Explanation Follow-up + Infrastructure Error Leak P1

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** diagnose first broken hop → smallest fix → verify  
**Coordinate (not clobbered):** level proximity / weekend UX `8fd5927e`; continuity UX / casual P1 / history variability already landed  
**Deploy / commit / push:** none

---

## ROOT_CAUSE

**First broken hop:** Stream route short-circuited `WAIT_EXPLANATION` and why-not, but **not** `EXPLAIN_PREVIOUS_MARKET_READ`.

Chrome repro path:
1. Prior reply: `Tradeable bias: bullish…` (snapshot / locked text — often **no** last-pipeline envelope)
2. User: `Why is that?`
3. Mentor correctly → `EXPLAIN_PREVIOUS_MARKET_READ`
4. No deterministic wire → `isNonTradingConversation` / `casualOnly` → `streamCasualChatReply`
5. Throws `OPENAI_API_KEY not set`
6. Extension `explainError` mapped that to: **“Server missing OPENAI_API_KEY — add it in Vercel env vars and redeploy.”**

**Secondary hops:**
- `isFollowUpInvalidation` false-positive: `\bis that\b` matched inside **why is that**
- `isCasualChat` treated market why as casual (GENERAL_CHAT path)
- Infra/config strings had no central user-facing sanitisation boundary

---

## FIRST_BROKEN_HOP

```
classifyMentorIntent("Why is that?", marketCtx) = EXPLAIN_PREVIOUS_MARKET_READ  ✓
stream: WAIT wire / why-not wire only
→ trySnapshotChatReply early-outs (isCasualChat true)
→ isCasual / casualOnly → streamCasualChatReply
→ throw OPENAI_API_KEY not set                          ← FIRST BROKEN HOP (no explain wire)
→ extension explainError → infra bubble                 ← SECOND (leak)
```

---

## WHY_FAMILY_ROUTING — PASS

| Prompt | After market prior | Route | Casual? |
|--------|--------------------|-------|---------|
| why? / why is that? | EXPLAIN_PREVIOUS | contextual explain | no |
| why bullish? | EXPLAIN_PREVIOUS | contextual explain | no |
| what makes you say that? | EXPLAIN_PREVIOUS | contextual explain | no |
| explain that / talk me through that | EXPLAIN_PREVIOUS | contextual explain | no |
| strongest / weakest evidence | EXPLAIN_PREVIOUS | contextual explain | no |
| how confident? | EXPLAIN_PREVIOUS | contextual explain | no |
| what would invalidate / change mind | INVALIDATION | contextual explain | no |
| why not short? | EXPLAIN_PREVIOUS + why-not wire | why_not_structured | no |
| why are you waiting? | WAIT_EXPLANATION | wait_structured | no |
| bare why after pasta/chinese | GENERAL_CHAT | casual continuity | yes (unchanged) |

Bare why ≠ GENERAL_CHAT when prior turn is market.

---

## DETERMINISTIC_EXPLAIN — PASS

Prefer: **previous semantic → contextual deterministic renderer**.

1. Last pipeline envelope → `formatExplainPreviousFollowUp` / invalidation / wait helpers (`openaiCalls: 0`)
2. Else prior assistant locked text → `explainFromPriorAssistantText` (reuses bias + because / em-dash clause only)
3. Else honest miss: `INSUFFICIENT_EXPLAIN_EVIDENCE_REPLY` (no invention)

Does **not** recalculate live market / Yahoo / intel rebuild for explanation family.

Chrome case (bias line, no pipeline):

```
USER: Why is that?
KAREN: About my previous read (not a new snapshot):
I'm calling tradeable bias bullish because buyers retain control while price holds above structure.
```

---

## ANTI_HALLUCINATION — PASS

Verdict/conclusion without traceable because on prior text → say so; do not manufacture reasons.

```
Prior: "Tradeable bias: bullish."
→ "…didn't lock a traceable evidence trail I can unpack further."
```

---

## INFRA_ERROR_LEAK — PASS

**Never user-visible:** `OPENAI_API_KEY`, missing env, Vercel, stack traces, route names, `responseSource`, Redis, `CASUAL_GATE_MISS`.

| Layer | Fix |
|-------|-----|
| `lib/user-facing-error.ts` | central `toUserFacingChatError` / `sanitizeUserFacingReply` / `isInfraOrConfigLeak` |
| `app/api/chat/stream/route.ts` | SSE + JSON 500 errors sanitised; `polishReply` sanitises |
| `extension/content.js` | `explainError` no longer maps API key → Vercel instructions; `isInternalLeakText` blocks infra strings |

LLM fail + evidence exists → deterministic fallback. Else: **“I couldn't complete that explanation just now.”**

---

## LATENCY_TARGETS — PASS (by construction)

Explanation family short-circuit: **OpenAI 0, Yahoo 0, intel rebuild 0**; sync render from locked payload (warm ≪ 500ms).

---

## MULTI_TURN_FAMILY — PASS (routing + render kinds)

Supported interrogation kinds on locked prior: why, strongest, weakest, confidence, waiting_for, confirms, invalidates, change_mind, which_level (+ existing why-not / wait wires).

“Has that changed now?” remains CHANGE_ANALYSIS / refresh path (not explain-previous).

---

## SEMANTIC_CONSISTENCY — PASS

Direction / prices / levels / trigger / invalidation stay on envelope or prior locked clauses; wording may vary via existing renderers.

---

## TYPECHECK — PASS

`npx tsc --noEmit -p tsconfig.json` exit 0.

## FOCUSED_TESTS — PASS

- `scripts/test-karen-contextual-why-explanation-p1.ts` — **53 passed**
- `scripts/test-karen-pre-launch-behaviour.ts` — **51 passed**
- `scripts/test-karen-casual-conversation-p1.ts` — **ALL PASS** (food `why?` still GENERAL_CHAT)

---

## FILES CHANGED

| File | Change |
|------|--------|
| `lib/user-facing-error.ts` | **new** central sanitisation boundary |
| `lib/decision-contract-output.ts` | `formatExplainPreviousFollowUp`, `explainFromPriorAssistantText`, interrogation kinds |
| `lib/chat-engine.ts` | `tryContextualExplainFollowUp` (pipeline → prior text → insufficient) |
| `app/api/chat/stream/route.ts` | wire explain before casual/LLM; sanitise stream/500 errors |
| `lib/mentor-intent.ts` | phrase coverage (say that / talk me through / strongest / confident / …) |
| `lib/casual-chat-intent.ts` | market why family not casual after market prior |
| `lib/conversational-query.ts` | fix `isFollowUpInvalidation` false positive on “why is that” |
| `lib/conversation-context-resolve.ts` | anaphora detects why-is-that family |
| `extension/content.js` | explainError + isInternalLeakText — no infra bubble |
| `scripts/test-karen-contextual-why-explanation-p1.ts` | focused matrix |

**Not touched:** trading logic, DecisionEnvelope semantics, QG, freshness, market intelligence redesign, production deploy.

---

## Chrome BEFORE → AFTER

```
BEFORE:
KAREN: Tradeable bias: bullish…
USER: Why is that?
KAREN: Server missing OPENAI_API_KEY — add it in Vercel env vars and redeploy.

AFTER:
KAREN: Tradeable bias: bullish — buyers retain control while price holds above structure.
USER: Why is that?
KAREN: About my previous read (not a new snapshot):
I'm calling tradeable bias bullish because buyers retain control while price holds above structure.
```
