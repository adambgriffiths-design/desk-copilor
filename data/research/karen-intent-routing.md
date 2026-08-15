# Karen — conversational routing / intent isolation

**Date:** 2026-08-14  
**Track:** Routing / intent only. No trading strategy, DecisionEnvelope, ICT, market-state, liquidity, or mentor-reasoning changes.  
**No commit / push / deploy** (per user: report first).

---

## ROOT CAUSE

Two independent routing bugs stacked. Neither is a connection failure.

### 1. Instant casual fallback treated a clear question as unintelligible

The live reply:

> Didn't quite catch that — still on this, or something else?

is `THREAD_CLARIFY_REPLY` in `lib/casual-chat-intent.ts` and `extension/casual-chat.js`.

It is **not** a connection string. Connection failures use `explainError` / `classifyExtensionMessagingFailure` (`receiving_end`, `invalidated`, backend offline).

`whats the capital of germany` (informal, no apostrophe, often no `?`) failed `isGeneralConversation`:

- The opener regex was `^(what|who|where|…)\b`
- In `whats`, `what` is **not** a whole word (`s` is still a word character), so `^what\b` does not match
- No trailing `?`, so the question-mark shortcut also missed
- `needsWebSearch` **explicitly returns false** for `capital of` (casual LLM, not Tavily)

Then `unresolvedCasualFallback` / `localCasualReply` returned `THREAD_CLARIFY_REPLY`.

On the extension, `replyCasual` → `/api/chat/stream` `tryCasualChatReplyInstant` returned that canned line **without ever calling the casual LLM**. That is the live screenshot path.

### 2. Previous market turn was sticky on the TypeScript follow-up classifier

`lib/pending-request.ts` `classifyTurn` had:

```ts
if (pending && isNonTradingConversation(q) && q.length < 64) {
  if (pending.intent !== "CURRENT_EXTERNAL") return "FOLLOW_UP";
}
```

After a market read (`MARKET_INTEL` / `VERDICT_EXPLAIN` pending), **any** short non-trading utterance — including a complete general-knowledge question — was labeled `FOLLOW_UP`. That deferred the casual route (`shouldDeferCasualRoute`) so `classifyDeskRoute` could fall through to **trading**.

The extension copy of `classifyTurn` did **not** have this length-64 trap (extension JS was already stricter). The live “still on this?” line is explained by bug 1; bug 2 is the TS/API sticky-context path and is what made market chips / pending intel override a new intent.

Ask chips (Why? / invalidate / waiting / why not short) are the static mentor hint in the panel. They are always visible; they are not themselves the classifier. Sticky pending + the clarification copy is what made the turn *feel* like a continuation.

---

## EXACT PATH (live “capital of germany”)

1. User types / STT: `whats the capital of germany` (or `what's the capital of germany` without `?`).
2. Previous assistant turn was a market read. Mentor hint chips remain in the panel.
3. Extension `handleUserMessage` → `shouldRouteCasual` true (extension `classifyTurn` did not sticky-follow-up).
4. `replyCasual` → streaming chat with `casualOnly: true`.
5. API `tryCasualChatReplyInstant` → `casualChatFallback`:
   - `isGeneralConversation` **false** (`whats` ≠ `what\b`)
   - `unresolvedCasualFallback` → **`THREAD_CLARIFY_REPLY`**
6. Instant SSE `done` with that string. Casual GPT never runs. Berlin is never produced.

Alternate TS/API path if pending market intel exists:

1. `classifyTurn` → `FOLLOW_UP` (length &lt; 64 + non-trading + pending ≠ weather).
2. `shouldDeferCasualRoute` true → `wouldRouteCasual` false.
3. `classifyDeskRoute` → `trading` (not live_web: `capital of` is not a web-search intent).
4. Trading stream / empty fallback can still land on the same clarification if the casual sanitizer runs.

Connection path is separate: `receiving end does not exist` / `Extension context invalidated` never emit `THREAD_CLARIFY_REPLY`.

---

## FIX

Intent isolation in the **routing layer only**. No Germany/capital keyword special-case.

1. **STT / informal repair before classification** (`lib/conversational-normalize.ts`): `whats` → `what's`, same for who/where/when/how. Applied in:
   - `normalizeMentorText`
   - `normalizeDeskQuestion`
   - `classifyDeskRoute` / `classifyTurn`
   - chat/stream last-user gate
   - voice `CANONICAL_RULE_FIXES` + `polishVoiceTranscript`
   - extension `handleUserMessage` `intentText`

2. **`classifyConversationalIntent`** (`lib/conversational-intent.ts`) distinguishes:
   - `MARKET_ANALYSIS` / `MARKET_FOLLOWUP`
   - `GENERAL_KNOWLEDGE` / `GENERAL_CHAT`
   - `VOICE_DESK_CONTROL` / `SYSTEM_CONNECTION`
   - `AMBIGUOUS` (unintelligible only)

   A **standalone** interrogative (3+ words, own topic) wins over sticky market context. Inherent desk phrases (`what are you seeing?`, `give me a read on the chart`) stay market because isolated mentor classification (no ctx) already marks them market. Linguistic follow-ups (`Why?`, `What would invalidate that?`, `Has it been invalidated?`, `what about NDOG?`) stay follow-ups.

3. **`classifyTurn`**: standalone general → `NEW_REQUEST` first. Removed the “any short non-trading line after market pending is a follow-up” trap. Tightened why-follow-up to anaphora / market why (`why are you…`, bare `Why?`), not “any sentence under 40 chars that contains why”.

4. **`THREAD_CLARIFY_REPLY` only for unintelligible input** (`random xyz`, `huh`, …). Clear general questions force the casual LLM (`CASUAL_LLM_FAILURE_REPLY` on empty stream — same as “what is 2 plus 2?”). Instant path must not return “still on this?” for a readable request.

5. **Extension parity** in `casual-chat.js`, `pending-request.js`, `desk-route-intent.js`, `mentor-intent.js`, `content.js`, `voice-interpret.js`. Extension version **1.4.120 → 1.4.121**.

Context remains available for genuine follow-ups. It does not override an unambiguous new intent.

---

## TESTS

```bash
npm run test:karen-intent-routing
```

**91 passed, 0 failed** — the 10 user-listed cases plus extras:

| # | Input | Expected | Result |
|---|--------|----------|--------|
| 1 | `what's the capital of germany?` | `GENERAL_KNOWLEDGE` → casual LLM (Berlin from the model, not a table) | pass |
| 2 | market history + `whats the capital of germany` | still `GENERAL_KNOWLEDGE` / casual / `NEW_REQUEST` | pass |
| 3 | market history + `Why?` | `MARKET_FOLLOWUP` / trading stream | pass |
| 4 | market history + `why are you bullish?` | `MARKET_FOLLOWUP` | pass |
| 5 | `tell me a joke` | `GENERAL_CHAT` (also after market) | pass |
| 6 | `what is 2+2?` / `What's 17 times 23?` | `GENERAL_KNOWLEDGE` | pass |
| 7 | `give me a read on the chart` | `MARKET_ANALYSIS` | pass |
| 8 | `what are you seeing?` | `MARKET_ANALYSIS` with or without market ctx | pass |
| 9 | `random xyz` | `AMBIGUOUS` → still-on-this clarification | pass |
| 10 | connection errors vs capital question | messaging failure ≠ intent miss; capital ≠ `SYSTEM_CONNECTION` | pass |

Also: Napoleon, photosynthesis, weather, `stop talking` after a market turn — new intent, not sticky market.

Related suites (this change):

| Suite | Result |
|-------|--------|
| `test:karen-intent-routing` | **91/91 pass** |
| `test:conversation-chains` | **42/42 pass** (weather Berlin/Paris, MSS invalidation, NDOG what-about, verdict Why?, teaching → chart) |
| `test:voice-mentor-intent` | **pass** |
| `test:karen-redteam-conversation` | **98/98 pass** (France after market now `casual`) |

`test:casual-fallback` / other scripts that import `lib/chat-engine.ts` **could not load** in this session: another agent’s `lib/chat-prompt.ts` has a template-literal syntax error at line 16 (nested `` `WAIT FOR:` ``). That file is DecisionEnvelope prompt copy — left untouched.

---

## Phase 1 follow-up routing — “why is it” after general knowledge (2026-08-14)

**Symptom:** User gets Berlin for “capital of Germany” (fixed), then “why is it” → `QUALITY_GATE:waiting — OHLC / market state unavailable…`

**Root cause:** Sticky `lastMentorIntent: CURRENT_MARKET_READ` from an earlier market turn overrode the Berlin reply. Bare anaphora (`Why?`, `why is it`) was classified as `EXPLAIN_PREVIOUS_MARKET_READ` / trading stream even though the **last assistant turn** was general knowledge. Ask chips stay visible but were not the primary bug — stale intent + context-free anaphora → market path → quality gate.

### Fix (routing layer only)

1. **`lib/turn-category.ts`** — infer `lastTurnCategory` (`MARKET` | `GENERAL_KNOWLEDGE` | `GENERAL_CHAT`) from the last assistant reply + prior user question. `assistantLooksLikeMarket()` gates on envelope markers, not stale intent alone.

2. **`mentorContextFromMessages`** — attaches `lastTurnCategory`. **`lastTurnWasMarket`** returns false when category is general, even if `lastMentorIntent` is still `CURRENT_MARKET_READ`.

3. **`isBareAnaphoraFollowUp`** — includes `why is it`. **`isLinguisticMarketFollowUp(text, ctx)`** — bare why/why-is-it only market when `contextLooksLikeMarket(ctx)`.

4. **`wouldRouteCasual` / `mustUseTradingStream`** — general anaphora after general turn → casual, not trading (no quality gate).

5. **Ambiguous anaphora with no market in last turn** → `GENERAL_KNOWLEDGE` (casual LLM explains), not `AMBIGUOUS` / quality gate.

6. **Extension parity** — `mentor-intent.js`, `casual-chat.js`, `pending-request.js`, `desk-route-intent.js`. Version **1.4.121 → 1.4.122**.

### Regression tests (added §11–13)

| Case | Expected | Result |
|------|----------|--------|
| market → Germany → Berlin → `why is it` | casual general follow-up | pass |
| market → Germany → Berlin → `Why?` | casual general follow-up | pass |
| market read → `Why?` | MARKET_FOLLOWUP / trading stream | pass |
| market read → `what's the capital of france` | GENERAL_KNOWLEDGE / casual | pass |

### Test runs

| Suite | Result |
|-------|--------|
| `test:karen-intent-routing` | **123/123 pass** |
| `test:conversation-chains` | **42/42 pass** |
| `test:voice-mentor` | **pass** |
| `test:karen-redteam-conversation` | **98/98 pass** |

No commit / push / deploy.

---

## LIVE FAIL ROOT CAUSE — extension 1.4.122 still broken (2026-08-14)

**Symptom (live retest):** Germany → Berlin works; `why is it` / `Why?` still → `QUALITY_GATE:waiting — OHLC / market state unavailable…`

**Verified:** `extension/manifest.json` **was** `1.4.122`. Server/lib regressions (`test:karen-intent-routing` §11) **all pass** — the fix landed in shared classifiers but **not in the extension dispatch hot path**.

### Actual root cause (two extension-only gaps)

1. **`extension/content.js` `handleUserMessage` built a hand-rolled `mentorCtx`** with `lastMentorIntent`, `lastAssistant`, `lastUser` — **no `lastTurnCategory`**. It never called `mentorContextFromMessages(chatHistory, …)` even though `mentor-intent.js` already exposes that helper with `inferLastTurnCategory`.

   With stale `conversation.lastIntent === CURRENT_MARKET_READ` from an earlier chart read, `lastTurnWasMarket(ctx)` fell through to `isMentorMarketIntent(lastMentorIntent)` → **true**, so `tradingQ` was set **before** `shouldRouteCasual` ran. Stream path → quality gate.

2. **`content.js` `mustUseTradingStream` was missing the guard from `lib/routing.ts`:** bare anaphora + general `lastTurnCategory` → return false. Extension copy only checked `isMentorMarketTurn` first.

3. **`extension/pending-request.js` `isFollowUpWhyQuestion` still had a stale unconditional regex** (`/^(why|…|why is it)$/` → true) instead of mirroring TS (`isLinguisticMarketFollowUp` only). Secondary — `shouldDeferCasualRoute` already had the general-anaphora escape, but `classifyTurn` could still mark FOLLOW_UP for pending `MARKET_INTEL`.

**Prod vs local:** Either hits the same bug — routing is extension-side before `/api/chat/stream`. Server `classifyTurn` / `turn-category.ts` were already correct.

### Fix (extension 1.4.123 — routing only)

| File | Change |
|------|--------|
| `extension/content.js` | Add `mentorContextForTurn()` → `mentorContextFromMessages(chatHistory, conversation.lastIntent)`. Use everywhere `mustUseTradingStream` / `handleUserMessage` / `replyCasual` / voice pre-route / `inCasualThread`. Add bare-anaphora + general-category guard to `mustUseTradingStream`. |
| `extension/pending-request.js` | `isFollowUpWhyQuestion` → `isLinguisticMarketFollowUp` only (TS parity). |
| `extension/manifest.json` | **1.4.122 → 1.4.123** |
| `scripts/test-karen-intent-routing.ts` | §14 — documents stale ctx-without-category vs full ctx |

### Expected after reload extension 1.4.123

| Turn | Path |
|------|------|
| capital of Germany | casual LLM → Berlin |
| why is it / Why? | casual LLM general explanation (NOT quality gate) |
| market read → Why? | trading stream (unchanged) |

No commit / push / deploy.

---

## What we did not change

- DecisionEnvelope / thesis completeness / vision-text unification
- ICT detectors, market-state, liquidity, PDH/PDL
- Mentor coaching prose / wait-vs-long policy
- No commit, push, or deploy
