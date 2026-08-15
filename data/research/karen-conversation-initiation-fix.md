# KAREN — Conversation Initiation Fix

**Date:** 2026-08-15  
**Trees:** `.tmp/karen-final-integration/`, `extension/` (+ mirrored `lib/` for primary API)  
**Mode:** FIX + VERIFY — no prod deploy, no commit/push  
**Scope:** GENERAL_CHAT proactivity — “make conversation with me” / keep-me-company phrases

---

## Exact report fields

```text
ROOT CAUSE: PASS (identified + fixed)
FIRST BROKEN HOP: casualOnly soft-fallback / CLARIFY_MORE
EXTENSION-SHAPED PATH: PASS
INITIATOR (not empty prompt): PASS
NO CHART/HISTORY/MARKETSTATE/QG: PASS
TYPECHECK (integration): PASS
FOCUSED REGRESSION: PASS
```

---

## ROOT CAUSE

Initiation phrases (`make conversation with me`, `talk to me`, `I'm bored`, …) correctly route as **non-trading / GENERAL_CHAT / casualOnly**, but:

1. **`isCasualChat` / `isGeneralConversation` returned false** (no `?`, no interrogative opener, not persona).
2. Instant path: `casualChatFallback` → **`CLARIFY_MORE_REPLY`** = `"Ha — say more, I'm listening."`
3. `tryCasualChatReplyInstant` correctly **rejects Ha** → `null` (tries LLM).
4. `streamCasualChatReply` throws **`Not a casual question`** (same false gates).
5. **First broken hop (product-visible):** `casualOnly` soft-fallback in `app/api/chat/stream/route.ts` treated Ha as a “valid” canned reply and **SSE-done’d it** instead of forcing LLM.

Extension offline / empty-stream paths also landed on the same Ha / clarify local reply.

**Not** a classifier-only miss: mentor already said `GENERAL_CHAT`; the break was **casual gate + clarify fallback + soft-fallback**.

### Before (probe)

| Phrase | isCasualChat | isGeneral | route | fallback |
|--------|--------------|-----------|-------|----------|
| make conversation with me | false | false | casual · stream | Ha — say more, I'm listening. |
| talk to me | false | false | casual · stream | Ha — say more… |
| tell me something interesting | true | true | casual · stream | LLM failure stub (no initiator) |

### After

| Phrase | isCasualChat | isGeneral | route | instant |
|--------|--------------|-----------|-------|---------|
| make conversation with me | true | true | casual | Rotating initiator question |
| talk to me / I'm bored / … | true | true | casual | Rotating initiator question |

---

## Prompt audit (nearby)

| Prompt / surface | Finding | Change |
|------------------|---------|--------|
| `lib/desk-persona.ts` `CASUAL_CHAT_SYSTEM_PROMPT` | No initiation guidance; empty listening not banned | Added initiate rule + Do-NOT empty prompts + example |
| `lib/casual-chat-prompt.ts` | Re-export only | None |
| `lib/chat-prompt.ts` | Trading stream; off-topic deferred | None (correct) |
| Soft-fallback `stream/route.ts` | Served Ha as success | Refuse Ha/dead-end fillers; force LLM or initiator |

---

## Fix (smallest)

1. **`isConversationInitiation` + rotating `conversationInitiationReply` pool** in `casual-chat-intent` (server) and mirrored extension `casual-chat.js`.
2. Wire into **`isCasualChat` / `isGeneralConversation` / `casualChatFallback` / `localCasualReply`**.
3. Extension **`canUseInstantLocal`** → instant local initiator (fast path, no trading analysis).
4. Soft-fallback: never return Ha / “I'm listening” fillers.
5. Prompt: instruct LLM to initiate when these phrases reach stream.

---

## Files touched

**Integration**
- `.tmp/karen-final-integration/lib/casual-chat-intent.ts`
- `.tmp/karen-final-integration/lib/desk-persona.ts`
- `.tmp/karen-final-integration/app/api/chat/stream/route.ts`
- `.tmp/karen-final-integration/extension/casual-chat.js`
- `.tmp/karen-final-integration/extension/content.js`
- `.tmp/karen-final-integration/scripts/test-conversation-initiation.ts`

**Primary extension**
- `extension/casual-chat.js`
- `extension/content.js`

**Mirrored for primary API consistency**
- `lib/casual-chat-intent.ts`
- `lib/desk-persona.ts`
- `lib/conversational-intent.ts` (`isGeneralChatTurn`)

---

## Tests

```text
npx tsx scripts/test-conversation-initiation.ts  → PASS
npx tsx scripts/test-casual-fallback.ts          → PASS
npx tsc --noEmit -p tsconfig.json                → PASS (integration tree)
```

Main-repo `tsc` still has unrelated pre-existing errors (`continuous-decision-recorder`, `incremental-market-engine`, `replay-fixtures`) — not introduced by this fix.

---

## Example after

User: `make conversation with me`  

Karen (instant pool): `Alright — random one: if you could become ridiculously good at one skill overnight, what would you pick?`
