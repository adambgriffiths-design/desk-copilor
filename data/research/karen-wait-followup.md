# Karen — WAIT follow-up must be concrete

**Date:** 2026-08-14  
**Track:** Market follow-up presentation only. No trading strategy, entry model, PDH/PDC/sweep/liquidity formula changes.

---

## LIVE BUG

Karen: *"Not calling a long or short. Stay flat until the next clean one-minute displacement."*  
User: *"What are you waiting for?"*  
Karen: *"Just waiting for the market to give us that clear signal!"* — **INSUFFICIENT**

Decision state already contained a structured envelope; follow-up fell through to conversational LLM language.

---

## ROOT CAUSE (trace)

| Step | What happened |
|------|----------------|
| 1 | User turn matched `MARKET_ANAPHORA` in `conversational-intent.ts` (`what are you waiting for`) → **trading stream** |
| 2 | `classifyMentorIntent` did **not** include that phrase in `isWaitExplanation` → intent **`GENERAL_CHAT`** |
| 3 | `trySnapshotChatReply` returned **`null`** early when `shouldRefreshMarketState(WAIT_EXPLANATION)` is false — even for intents that have deterministic handlers |
| 4 | Trading stream skipped snapshot (`!tradingStream` guard) and entered `streamChatReply` |
| 5 | `buildChatPrompt` used **PREVIOUS READ (conversation)** block without fresh envelope when `shouldRefreshMarketState` is false |
| 6 | GPT paraphrased → vague *"clear signal"* copy; quality gate did not replace it (no envelope attached on that path) |

`answerMentorCoaching` / `answerWait` existed but were never reached for this phrase on the stream path.

---

## FIX

1. **`lib/mentor-intent.ts`** — `isWaitExplanation` now includes `what are you waiting for`; `parseWhyNotDirection` for why-not-short/long.
2. **`lib/decision-contract-output.ts`** — deterministic formatters:
   - `formatStructuredWaitFollowUp`
   - `formatStructuredInvalidationFollowUp`
   - `formatWhyNotDirectionFollowUp`
   - `missingWaitEnvelopeFields` / `VAGUE_WAIT_FOLLOWUP` guard constant
3. **`lib/mentor-coaching.ts`** — `answerWait`, `answerInvalidation`, `answerWhyNotDirection` render from envelope/interpretation; no `speakEnvelope` paraphrase for WAIT follow-ups.
4. **`lib/chat-engine.ts`** — `tryDeterministicMentorFollowUp` + removed early `null` return in `trySnapshotChatReply` for no-refresh intents.
5. **`app/api/chat/stream/route.ts`** — intercept trading-stream WAIT / invalidation / why-not before LLM (`responseSource: mentor_structured`).

Output template when complete:

```
WAITING FOR: …
LONG CONDITION: …
SHORT CONDITION: …
CURRENT STATE: …
INVALIDATION: …
Until then: WAIT/FLAT
```

When envelope lacks fields → `WAIT CONDITION IS UNDER-SPECIFIED` + missing field list (no fabrication).

---

## REGRESSION TESTS

`npm run test:karen-wait-followup`

1. WAIT + concrete trigger → names trigger  
2. WAIT + long/short conditions → distinguishes both  
3. WAIT + incomplete → under-specified message, no invention  
4. "What are you waiting for?" → no generic clear-signal copy  
5. "What would invalidate this?" → structured invalidation  
6. "Why not short?" → conflict / short-side evidence from envelope  

---

## OUT OF SCOPE

- General-knowledge follow-ups (other agent)
- Trading strategy / entry model
- Extension version bump (routing change is server-side only)

---

## LIVE BUG — quality gate on market follow-up after successful read (2026-08-14)

**Symptom:** Market read at 30237.50 / bullish bias works. User: *"why not short"* → `QUALITY_GATE:waiting — OHLC / market state unavailable; current price unknown; market data missing; market structure not confirmed`.

**Not Berlin/general** — this is a **market follow-up** on a turn that already had live data.

### Root cause

| Step | What happened |
|------|----------------|
| 1 | `tryDeterministicMentorFollowUp` ran but `answerWhyNotDirection` hit **`dataUnusable(intel)`** when follow-up turn rebuilt intel with stale/missing OHLC — returned generic stale copy or `null` |
| 2 | Stream fell through to `streamChatReply` → `buildChatSystemPrompt` rebuilt fresh intel because **`shouldRefreshMarketState` returned `true`** for `INVALIDATION` / bare `Why?` even when `lastAssistant` was a market read |
| 3 | Fresh rebuild failed quality gate → **`QUALITY_GATE:`** thrown **before** any structured envelope answer |
| 4 | **`explainPriorRead`** only skipped refresh for `EXPLAIN_PREVIOUS` / `WAIT` / `BIAS` — not **`INVALIDATION`** or **`why not short`** consistently when `lastTurnWasMarket` |
| 5 | Extension never called **`conversation.setMarketSnapshotId`** from stream `done` — snapshot id not carried on follow-ups (secondary) |

Deterministic handlers existed; **ordering + refresh policy + stale-data block** prevented them from winning.

### Fix (routing / snapshot reuse only)

1. **`shouldRefreshMarketState`** — after a prior **market** read (`hasPriorMarketRead`), do not refresh for `WAIT`, `BIAS`, `INVALIDATION`, `EQH`, `LIQUIDITY`, `CHANGE_ANALYSIS`, or `EXPLAIN_PREVIOUS`.
2. **`hasPriorMarketRead` / `isMentorFollowUpOnPriorRead`** — shared helpers for prompt build, stream intercept, and gate bypass.
3. **`tryDeterministicMentorFollowUp`** — broader `needsStructuredWaitFollowUp` (incl. bare `Why?` after market); **`buildIntelForMentorFollowUp`** retries with `forceFresh: false` on fetch failure.
4. **`mentor-coaching`** — structured follow-ups (`why not`, `wait`, `invalidation`) **allow stale intel** when prior market read exists; fix **`mentorContextFromConversation`** to merge `ctx.lastAssistant`.
5. **`streamChatReply`** — quality gate bypass when **`isMentorFollowUpOnPriorRead`**.
6. **`app/api/chat/stream/route.ts`** — run deterministic intercept for **`isMentorFollowUpOnPriorRead`** even if `tradingStream` false.
7. **Extension 1.4.124** — wire **`setMarketSnapshotId`** / intent / responseSource from stream `done`.

### Regression tests (§7–8 in `test:karen-wait-followup`)

| Case | Expected |
|------|----------|
| Bullish read → `Why not short?` | Structured WHY NOT SHORT, not quality gate |
| Bullish read → `Why?` | Reuses prior read, no OHLC refresh |
| Bullish read → `What are you waiting for?` | Structured WAIT |
| Bullish read → `What would invalidate this?` | Structured INVALIDATION |
| Stale intel + prior read → `Why not short?` | Still structured (not stale-blocked) |

No commit / push / deploy.

---

## Two-intent follow-up rule (2026-08-14)

Live miss-tail: EXPLAIN LAST was still calling `buildDeskMarketIntelligence` when the 1-minute reuse clock missed (`miss:bars`). That rebuilt Yahoo/OHLC (7–101s) and could throw `QUALITY_GATE:waiting` for missing price — including after a successful SHORT/LONG-rejected read (`why not long`, `why are you short`).

### Intent 1 — EXPLAIN LAST DECISION

Reuse the last valid `DecisionEnvelope` / cached intel / last pipeline. Do **not** rebuild because a new bar arrived. Label: `PREVIOUS DECISION — explaining the last spoken call, not a new snapshot.`

| Phrase | Intent | Refresh |
|--------|--------|---------|
| Why? | EXPLAIN_PREVIOUS / WAIT | no |
| Why not short? / Why not long? | EXPLAIN_PREVIOUS | no |
| Why are you short? / Why are you long? | EXPLAIN_PREVIOUS | no |
| What are you waiting for? / Why did you stay flat? | WAIT_EXPLANATION | no |
| What would invalidate this? | INVALIDATION | no |

Same-bar: `tryReuseLiveDeskIntelligence` HIT. New-bar clock MISS: `peekLiveDeskIntelligenceCache` or `getLastPipelineResult()` — still no Yahoo.

### Intent 2 — WHAT CHANGED / NEW READ

Explicit current-state request. Refresh **allowed**.

| Phrase | Intent | Refresh |
|--------|--------|---------|
| What changed? / Has anything changed? | CHANGE_ANALYSIS | yes |
| Give me a new read / Give me the read | CURRENT_MARKET_READ | yes |

`CHANGE_ANALYSIS` was incorrectly in the no-refresh list; it now always may refresh.

### QUALITY_GATE

`shouldSkipQualityGate` is true for EXPLAIN LAST when a prior envelope/read exists. It is **false** for NEW READ so a fresh snapshot can still gate.

`npm run test:karen-wait-followup` — §§7–13.

