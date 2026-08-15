# KAREN — Casual Conversation P1

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** FIX + VERIFY — no prod deploy, no commit/push  
**Coordinate (not clobbered):** conversation-context-resolve `9bd9eb21`, continuity UX `528efca5`, joke instant-local `073f39f2`, market-intel latency P1 `5aa94967`

---

## ROOT_CAUSE

**First broken hop (pasta):** Chrome `canUseInstantLocal` treated `do you like pasta` as `isPersonaQuestion` → forced `localCasualReply` → `karenPreferenceReply` only answered when `FOOD_WORDS` matched → **pasta was missing** → `isGeneralConversation` returned **`CASUAL_LLM_FAILURE_REPLY`** as the bubble.

**Secondary hop (statements):** Declarative shares (`I'm trading on Monday`) were `isNonTradingConversation` / casual path but **not** `isCasualChat` / `isGeneralConversation` → `streamCasualChatReply` threw **`Not a casual question`** → soft-fallback only for `casualOnly` (not server `isCasual`) → leak / Ha filler.

**Design bug:** classifier miss was treated as a **reply**, not a **fallthrough** to GENERAL_CHAT.

---

## CASUAL_QUESTIONS — PASS

| Prompt | Route | Instant? | OpenAI? | MarketState? | Result |
|--------|-------|----------|---------|--------------|--------|
| do you like pasta | casual / GENERAL_CHAT | yes | no | no | PASS |
| do you like chinese food | casual | yes | no | no | PASS |
| Chinese food | casual | yes | no | no | PASS |

---

## CASUAL_STATEMENTS — PASS

| Prompt | Class | Route | Not a casual? | MarketState? |
|--------|-------|-------|---------------|--------------|
| I'm trading on Monday | DECLARATIVE / plan | casual | never | no |
| I'm tired | feeling | casual | never | no |
| pasta for dinner | personal | casual | never | no |
| prefer Chinese | preference | casual | never | no |
| markets are annoying | feeling | casual | never | no |
| hoping Nasdaq is clean | plan share | casual | never | no |

---

## FOLLOWUP_CONTEXT — PASS

Pasta → Chinese continuity stays GENERAL_CHAT; no market intel.

## PRONOUN_RESOLUTION — PASS

`do you like pasta` → `what do you like about it` resolves pasta referent via `conversation-context-resolve` (FOOD_TOPIC includes pasta).

## GENERAL_CHAT_FALLBACK — PASS

Local/classifier miss → empty / fallthrough to stream (not failure bubble). Soft-fallback covers `isCasual` + `casualOnly`; throw renamed to internal `CASUAL_GATE_MISS` (never user-visible).

## INTERNAL_TEXT_LEAK — PASS

Blocked: `Not a casual question`, `CASUAL_GATE_MISS`, route labels, null/empty as bubble. Extension `isInternalLeakText` + `acceptApiCasualReply` + `polishReply` + `explainError` guards.

## MARKET_BUILD_ON_CASUAL — PASS

Simple casual/statements: `mustUseTradingStream=false`, `needsMarketIntelligenceAnswer=false`, desk route `casual`. Sequence 2 turn 3 (`What would you watch for?`) remains a question — trading allowed when asked.

## RESPONSE_VARIABILITY — PASS

Uses existing `preferenceLikeReply` / casual fallback pools + conversation-context-resolve (no second system).

## CASUAL_LATENCY — PASS

`do you like pasta` instant path **1ms** (no OpenAI, no MarketState).

## TYPECHECK — PASS

`npx tsc --noEmit` exit 0.

## FOCUSED_TESTS — PASS

- `scripts/test-karen-casual-conversation-p1.ts` — ALL PASS  
- `scripts/test-karen-general-chat-pronoun-context.ts` — ALL PASS  

---

## FILES CHANGED

| File | Change |
|------|--------|
| `extension/casual-chat.js` | pasta in FOOD_WORDS; any `do you like X` reply; statementShareReply; declarative ≠ clearlyTrading; miss → `""` not failure |
| `extension/content.js` | canUseInstantLocal only if local usable; never publish failure/leak; soft fallthrough |
| `lib/casual-chat-intent.ts` | pasta FOOD_WORDS; `isDeclarativeShare`; preference without FOOD_WORDS gate; statement replies; isCasualChat includes shares |
| `lib/conversation-context-resolve.ts` | pasta in FOOD_TOPIC |
| `lib/chat-engine.ts` | gate includes declarative; throw `CASUAL_GATE_MISS` not user string |
| `app/api/chat/stream/route.ts` | soft-fallback for isCasual; polish strips leak text |
| `scripts/test-karen-casual-conversation-p1.ts` | new focused matrix |

**Not touched:** QG/market truth, decision history, EST memoize / intel cache, joke pools redesign.

---

## pasta BEFORE → AFTER

```
BEFORE:
USER: do you like pasta
KAREN: I'm having trouble responding right now — try that again.

AFTER:
USER: do you like pasta
KAREN: Yeah — that ranks high for me. Variety beats another bland desk lunch. What's your go-to?
USER: what do you like about it
KAREN: Pasta wins on variety — sauces, textures, and it beats another bland desk lunch. What do you usually order?
USER: what about Chinese
KAREN: Sweet and sour chicken, egg fried rice, and spring rolls — my usual Chinese order.
USER: why?
KAREN: On chinese: flavor range and convenience — that's the appeal. What's your order?
```

## Sequence 2 (ack then trading when asked)

```
USER: I'm trading Monday
KAREN: Monday — noted. Which session are you planning: New York, London, or Asia?
USER: hoping Nasdaq is clean
KAREN: Hoping for a clean Nasdaq session — fair. Want to talk what you'd watch for, or keep it light?
USER: What would you watch for?
KAREN: (question → trading/analysis path allowed — not auto-forced on prior statements)
```
