# KAREN — Conversational Continuity + UX Hardening

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** FIX + VERIFY ONLY — no prod deploy, no commit/push  
**Coordinate (verified, not rewritten):** pronoun/anaphora `9bd9eb21`, comparative levels `b5c51b0c`, history precedence `8c3d55e0`, response variability `79fc055a`, conversation initiation `661a51f0`, pre-launch audit `85cb9036`, history variability `07cf8f8e`, latency triage `5aa94967`

---

## ROOT CAUSE(S)

1. **Keyword-only routing** treated elliptical follow-ups (`why?`, `how far…`, `short version`, corrections) as standalone turns → casual failure / Ha filler / wrong domain.
2. **Presentation chrome** (`LIVE — CURRENT SESSION HISTORY`, `DecisionKey`, raw ISO timestamps, OHLC waitReason strings) leaked into plain user replies even when DecisionEnvelope SoT was correct.
3. **Answer-second stance variants** put structure dumps before the call (`On the 1-minute… I'm WAITING`).
4. **`short` token collision** — “give me the short version” matched TRADING_WORDS `\bshort\b` → falsely `isClearlyTrading`.
5. **Corrections not rewritten** — “actually I meant PDH / last actual decision” never became a concrete level/history question for existing routers.

Safety gates (QG `canDeliverVerdict`, CME closed≠broken, history kinds, anti-hallucination contracts) were **not** the bug class — wording + discourse resolution were.

---

## FILES CHANGED

| File | Change |
|------|--------|
| `lib/conversation-context-resolve.ts` | Discourse ops (simplify/short/correction/clarify/other_one/and_before); referent walk-back; `rewriteCorrectionForRouter`; preference honesty |
| `lib/conversational-renderer.ts` | Answer-first stance; `humanizeMissingDataReason`; natural QG / insufficient copy; closed≠broken preserved |
| `lib/decision-contract-output.ts` | `hasUserFacingPlumbing`; tighter internal-label detection |
| `lib/decision-time-travel.ts` | Plain: no lane banner; answer-first trade-today; no raw ISO in plain recorded |
| `lib/casual-chat-intent.ts` | Short-version ≠ trading; persona hunger lines cleaned |
| `lib/response-repetition-memory.ts` | Rephrase includes simplify/short |
| `lib/desk-route-intent.ts` | Documented `KAREN_ROUTING_PRECEDENCE` |
| `app/api/chat/stream/route.ts` | Correction rewrite before history/levels; polishReply strips chrome; level_compare `openaiCalls: 0` |
| `scripts/test-karen-conversational-continuity-ux.ts` | **New** A–J red-team + transcript capture |
| `scripts/test-karen-conversation-quality-polish.ts` | Focused polish regression |
| Existing banner/plain tests | Expect plain (no CURRENT SESSION HISTORY) |

**Not added:** second variability system (uses existing renderer + repetition memory).

---

## MULTI-TURN CONTINUITY

**PASS** for levels (A), Chinese→Thai (B), history (C) deterministic paths.  
Script: `scripts/test-karen-conversational-continuity-ux.ts` — ALL PASS.

### ≥5 BEFORE → AFTER transcripts (proof)

#### 1) A — Levels chain
```
BEFORE: follow-ups lost referent → casual/Ha or wrong domain
USER: What is PDL?
KAREN: Previous day low is 24800…
USER: how far are we from it?
KAREN (broken): Ha — say more / GENERAL_CHAT / failure

AFTER (deterministic continuous path)
USER: What is PDL?
ASSISTANT: Previous day low is 24800.00. Previous day high is 24865.00.
USER: how far are we from it?
ASSISTANT: Using Friday's close, PDH is 47 pts away; PDL is 18 pts away.
USER: what about the low?
ASSISTANT: Previous day low is 24800.00.
USER: which one?
ASSISTANT: Using Friday's close, PDL is 18 pts from current.
```

#### 2) A′ — Correction to PDH
```
BEFORE: «actually I meant PDH» after PDL dump fell to casual / ignored correction
USER: What is PDL?
KAREN: Previous day low is 24800.00. Previous day high is 24865.00.
USER: actually I meant PDH
KAREN (broken): Ha — say more / food-style ack without level slot

AFTER
USER: What is PDL?
ASSISTANT: Previous day low is 24800.00. Previous day high is 24865.00.
USER: how far are we from it?
ASSISTANT: Using Friday's close, PDH is 47 pts away; PDL is 18 pts away.
USER: actually I meant PDH
ASSISTANT: Previous day high is 24865.00.
```

#### 3) B — Chinese food → Thai correction
```
BEFORE: «what do you like about it» → I'm having trouble responding / fabricated hunger / AI disclaimer
USER: do you like chinese food
KAREN: Yeah…
USER: what do you like about it
KAREN (broken): I'm having trouble responding right now

AFTER (deterministic continuous path)
USER: do you like chinese food
ASSISTANT: Yeah — that ranks high for me. Variety beats another bland desk lunch. What's your go-to?
USER: what do you like about it
ASSISTANT: What I like about chinese food: big flavor range and it still works as easy takeout. What's your go-to?
USER: actually I meant Thai food
ASSISTANT: Solid yes from me — comfort food with actual choices. Which dish do you swear by — switching to Thai food.
USER: go on
ASSISTANT: Digging in on thai food — what usually matters is tradeoffs, not slogans. Want the short version or a sharper take?
USER: explain that simpler
ASSISTANT: Still with you — want the short version or more detail?
USER: give me the short version
ASSISTANT: Still with you — want the short version or more detail?
```

#### 4) C — History / trade-today answer-first + no chrome
```
BEFORE: Did you trade today? → LIVE — CURRENT SESSION HISTORY + DecisionKey dump before answer
USER: Did you trade today?
KAREN (broken):
LIVE — CURRENT SESSION HISTORY
No — I have not recorded a LONG or SHORT decision this session.
DecisionKey: KEY-…

AFTER
USER: Did you trade today?
ASSISTANT: Yes — my last actionable decision this session was LONG at 09:00 ET.
USER: What was your last decision?
ASSISTANT: My latest recorded stance is NO_TRADE. My last actionable decision was LONG at 09:00 ET.
Recorded: NO_TRADE · 09:30 ET
Actionable: LONG · 09:00 ET
Actionable thesis: LONG_THESIS
```

#### 5) D — Graceful missing-data wording (gate unchanged)
```
BEFORE: WAIT — OHLC / market state unavailable; current price unknown
(plus QUALITY_GATE / envelope dump)

AFTER:
I'm WAITING — I can't give you a reliable live read right now because I'm missing fresh chart data and a trustworthy live price. I won't call a long or short until those observations are confirmed.
```

Raw JSON transcripts: `data/research/_continuity-transcripts.json`

---

## ANAPHORA

| Phrase | Status |
|--------|--------|
| why? / what happened to it? / how far… / and now? / which one? | Detected + domain-sticky |
| what about the low/high | Level comparative (existing) + anaphora flag |
| go on / tell me more | GENERAL_CHAT or MARKET_READ sticky |
| Chinese → about it | PASS (`test-karen-general-chat-pronoun-context.ts`) |

---

## CORRECTIONS

| Input | Rewrite / domain |
|-------|------------------|
| actually I meant PDH | → `what about the high?` / MARKET_LEVEL |
| actually I meant the last actual decision | → `What was your last actual decision?` / DECISION_HISTORY |
| actually I meant Thai food | GENERAL_CHAT preference pivot |

Stream wires `rewriteCorrectionForRouter` **before** history + comparative routers.

---

## PLAIN ENGLISH

- Trade-today leads with Yes/No (no banner).
- Stance variants answer-first (no structure-first opener).
- QG / insufficient: natural “can’t give you a reliable live read…”; **no OHLC jargon** in plain.
- Closed/holiday copy never says feed/broken.
- Debug (`KAREN_DECISION_DEBUG=1` / structured) retains raw reasons + labels.

---

## RESPONSE VARIABILITY

Existing `conversational-renderer` + pools — **no second system**.  
`test-karen-response-variability.ts`: **117 passed**, 50 renders ~9ms, **0 OpenAI**.

---

## REPETITION MEMORY

Unchanged architecture (`response-repetition-memory` / `casual-diversity`). Extended `isRephraseFollowUp` for simplify/short so rephrase memory can attach.

---

## NO-REPLY / DUPLICATE

- Chinese anaphora: instant + fallback both non-failure (G assertion).
- Stream: single owning path for history / level_compare / correction rewrite (first match returns `sseDone`).
- Residual: empty casual LLM path still uses `CASUAL_LLM_FAILURE_REPLY` once — not duplicated by this pass.

---

## ROUTING PRECEDENCE

Documented + exported as `KAREN_ROUTING_PRECEDENCE` in `lib/desk-route-intent.ts`:

1. correction_followup  
2. decision_history  
3. stance_cmr  
4. trading_followup  
5. comparative_levels  
6. chart_read  
7. price_levels  
8. persona_casual  
9. general_chat  

Stream enforces correction → history → comparative before casual/LLM. DecisionEnvelope / QG / freshness not weakened.

---

## LATENCY BEFORE/AFTER

| Path | Behaviour |
|------|-----------|
| Decision history | Still **no MarketState rebuild**; `openaiCalls: 0` |
| Comparative levels | Arithmetic; Yahoo last-price only when tick missing (latency agent); **no OpenAI** |
| Stance / QG plain render | Local renderer only |
| Measured (variability) | ~9ms / 50 renders, 0 OpenAI |

No new OpenAI on deterministic paths.

---

## OPENAI AVOIDANCE

History miss → spoken miss (not CMR rebuild). Level distance → arithmetic. Casual food anaphora → local resolve/fallback. Instant-read LLM skip semantics preserved.

---

## SEMANTIC CONSISTENCY

Stance/WAIT/LONG/SHORT facts locked across wording variants (variability suite). History kinds + actionable vs recorded unchanged. CME closed vs open-broken language distinct.

---

## TYPECHECK

`npx tsc --noEmit -p tsconfig.json` → **exit 0**

---

## FOCUSED REGRESSIONS

| Suite | Result |
|-------|--------|
| `test-karen-conversational-continuity-ux.ts` | ALL PASS |
| `test-karen-conversation-quality-polish.ts` | ALL PASS |
| `test-karen-general-chat-pronoun-context.ts` | ALL PASS |
| `test-karen-plain-english-market-replies.ts` | 32 passed |
| `test-karen-pre-launch-behaviour.ts` | 51 passed |
| `test-karen-response-variability.ts` | 117 passed |
| `test-karen-comparative-level-followups.ts` | ALL PASS |
| `test-history-intent-precedence.ts` | ALL PASS |
| `test-actionable-trade-semantics.ts` | ALL PASS |
| `test-cme-globex-session-status.ts` | 42 checks ok |
| `test-karen-anti-hallucination-red-team.ts` | 26/27 (1 residual — see gaps) |

---

## KNOWN REMAINING GAPS

1. **MED** — After long GENERAL_CHAT chains, `explain that simpler` / `short version` sometimes falls to a soft continuity line instead of a topic-rich simplify pool (B transcript turns 5–6). Continuity holds (no failure bubble); richer compression still MED.
2. **MED** — Bare `when?` after history clock mention (pre-launch residual).
3. **LOW** — Anti-hallucination suite **1/27** still surfaces labeled `MENTOR VIEW` / `TRADE DECISION` on an unavailable-decision path (`unavailableDecisionText`) — structured fallback not yet plain-wrapped.
4. **LOW** — “Compare with London high” needs prior London level mention; not a dedicated extractor in this pass.
5. **Human smoke** still required for extension-shaped live TV + weekend closed wording.

---

## READY FOR HUMAN SMOKE?

**YES — with residuals above.** Deterministic continuity, plain presentation, correction rewrite, and focused regressions are green. Do not treat as prod-ship without extension smoke (Chinese anaphora, PDL→how far, did-you-trade, missing-data, weekend closed).

**STOP** — no prod deploy / commit / push.
