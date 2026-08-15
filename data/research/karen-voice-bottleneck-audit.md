# Karen voice — priority bottleneck audit

**Date:** 2026-08-14  
**Primary work:** Rank what actually limits spoken Karen. Fix the single highest-value bottleneck. No new voice features, no canned phrases, no fake market state, no PDH / Aug 12 liquidity edits, no commit/push/deploy.

**Method:** Instrument the real pipeline. Run the exact conversation as **TEXT routing + state machine**. Compare TEXT vs VOICE **dispatch** (same questions). Mentor loop QUESTION → WHY → FOLLOW-UP → CHALLENGE.

**Not done this session (honest):** No live microphone. No TradingView panel. No `__dcVoiceLatencyTrace` from a spoken turn. No localhost `/api/chat/stream` (Next was not running). **Do not treat the scorecard as live STT/TTS milliseconds.**

**Tests:** `npm run test:karen-redteam-conversation` 98/98 PASS · `npm run test:voice-bottleneck` 55/55 PASS · `test:voice-mentor-intent` PASS · `test:karen-text-read` 72/72 PASS.

---

## How voice actually runs

Realtime is **STT only**. Karen’s brain is the extension + `/api/chat/stream`. Mouth is browser TTS or `/api/voice/tts`.

1. Mic → OpenAI Realtime (Whisper, server VAD).  
2. `handleRealtimeTranscript` → same `handleUserMessage` as typed chat.  
3. Intent / desk route / mentor context.  
4. Stream GPT-4o (after optional market intel).  
5. Speak first complete sentence when ≥16 characters + punctuation.

TEXT and VOICE share dispatch. A TEXT silent-void is a VOICE silent-void.

---

## Exact conversation (TEXT = VOICE routing)

| Turn | Utterance | Intent | TEXT path | VOICE route | Fresh intel? |
|---|---|---|---|---|---|
| 1 | Give me a read on the chart. | `CURRENT_MARKET_READ` | stream | trading | **yes** |
| 2 | why are you leaning that way | `EXPLAIN_PREVIOUS_MARKET_READ` | stream | trading | **no (fix)** |
| 3 | What would change your mind? | `INVALIDATION` | stream | trading | yes |
| 4 | What changed? | `CHANGE_ANALYSIS` | stream | trading | yes |
| 5 | Which liquidity matters most right now? | `LIQUIDITY_EXPLANATION` | stream | trading | yes |

Mentor loop (same dispatch, not live speech):

| Role | Utterance | Intent | Fresh intel? |
|---|---|---|---|
| QUESTION | Give me a read on the chart. | `CURRENT_MARKET_READ` | yes |
| WHY | Why? | `WAIT_EXPLANATION` after a wait-worded read; `EXPLAIN_PREVIOUS_MARKET_READ` after a non-wait read | **no** |
| FOLLOW-UP | What would change your mind? | `INVALIDATION` | yes |
| CHALLENGE | Are you sure that still holds? | `EXPLAIN_PREVIOUS_MARKET_READ` | **no** |

Bare `Why?` after *“Right now I'm seeing a wait…”* is `WAIT_EXPLANATION`. That is correct coaching routing, not a silent fail. `why are you leaning that way` is always `EXPLAIN_PREVIOUS_MARKET_READ`.

---

## Per-turn measurement log

Stages requested: speech start/end, STT, intent, snapshot ts, reasoning start, first token, response complete, TTS start/complete.

| Stage | Live mic | What we actually have |
|---|---|---|
| speech start / end | **not measured** | Marks exist: `speech_start`, `vad_speech_end`, `last_audio_chunk` |
| STT | **not measured** | Marks: `first_partial`, `final_transcript`, `transcript_handoff` |
| intent | **0.08 ms** classify for Turn 2 (this process) | Mark `intent` in `content.js`. Classifier is not the delay. |
| snapshot ts | **not live** | Turn 2/WHY/CHALLENGE set `timings.marketStateRefresh=false` on SSE `done`. Turns 1/3/4/5 still refresh (Yahoo cache 45s, worst-case intel race **25s**). |
| reasoning start | **not live** | Mark `reasoning_start` immediately before `runStreamingChat` |
| first token | **not live** | Mark `first_sse_token`; SSE `done.timings.firstTokenMs` (from prompt start, includes intel if refreshed) |
| response complete | **not live** | `done.timings.completeMs`; client `STREAM_END` |
| TTS start / complete | **not live** | Marks `tts_start`, `first_audible`. Early TTS waits for `extractFirstCompleteSentence` (min **16 chars** + `.!?`) |

### Configured voice floor (code constants, not a stopwatch)

| Constant | Value |
|---|---|
| `VAD_SILENCE_MS` | 500 |
| `TRANSCRIPT_SETTLE_MS` | 100 |
| **Post-speech floor** | **600 ms** before the turn is even handed to intent |
| `UTTERANCE_MERGE_MS` | 1100 |
| Echo tail | 350–1800 ms after Karen finishes |
| Intel timeout (refresh path) | 25 000 ms |
| Chat stream abort | 90 000 ms (not increased) |

### Derived latencies (formula — fill from `__dcVoiceLatencyTrace` on a live turn)

- STT = `final_transcript − vad_speech_end`  
- Intent = `intent − turn_process` (measured **0.08 ms** in-process for Turn 2)  
- Market-state = `reasoning_start − intent` client-side; server `promptBuildMs` is the real wait when `marketStateRefresh=true`  
- Reasoning + first token = `first_sse_token − reasoning_start`  
- Generation = `completeMs − firstTokenMs`  
- TTS = `first_audible − tts_start`  
- Interruption / turn-taking / recovery: state-machine tests, not live barge-in timings  

---

## Ranking: what limits Karen (1–10)

| # | Limit | Verdict | Evidence |
|---|---|---|---|
| 1 | STT | Unknown live. Architecture is not the Turn 2 void. | Realtime STT-only; WER/partials unmeasured. 600 ms VAD+settle is a **fixed tax** after every utterance. |
| 2 | Intent | Not the silent fail. | Turn 2 already classified `EXPLAIN_PREVIOUS_MARKET_READ` without history. `Why?` after wait → `WAIT_EXPLANATION`. Challenge now stays on previous read. Classify **0.08 ms**. |
| 3 | Context | Was a voice-casual risk; mostly wired. | Mentor ctx on stream route, `mustUseTradingStream`, voice early path. History last 24 panel / 16 GPT. |
| 4 | Market-state retrieval | **Largest first-token wait on a new read.** Must not block “why did you say that.” | `buildChatSystemPrompt` raced intel up to **25s** before OpenAI. Yahoo cache 45s; full NQ context was ~8.6s in `live-pipeline-profile.md`. **Turn 2 / WHY / CHALLENGE now skip a new snapshot** and explain the last assistant read. Turns 1, 3, 4, 5 still refresh. PDH math untouched. |
| 5 | Reasoning latency | After prompt is built. Unmeasured live. | GPT-4o TTFB. Next live number to capture on Turn 2 after the skip. |
| 6 | Response generation | Same stream. Unmeasured live. | First-sentence TTS can start before the stream finishes (helps perceived latency; can truncate coaching). |
| 7 | TTS | Secondary. Unmeasured live. | Waits for a 16-char punctuated sentence. Spoken cap (2 sentences / 320 chars default) still fights mentor length on the ear. |
| 8 | Interruption | Implemented, not live-scored. | `speech_started` → barge-in, cancel stream, new `requestId`. Cancelled turns must not `settleIdle()` if they no longer own the session. |
| 9 | Turn-taking | **Was the conversation killer. Fixed.** | SSE `type:done` rendered Turn 1 but `streamChatFromPort` only `finish()`ed on a later port `done`. Promise hung → `processingQueue` true → Turn 2 user bubble, **never dispatched**. Repro: `simulatePanelStreamReader(..., { finishOnSseDone: false })` → `blockedFollowUp`. |
| 10 | Recovery | Improved in code, not live-scored. | ERROR → IDLE; 20 consecutive simulated text turns, 0 silent voids. Visible error, not a blank assistant. |

---

## Highest-value bottleneck → fix → reassess

### MOST IMPORTANT FIX (conversation): #9 turn-taking

**Bug:** USER MESSAGE → NOTHING on Turn 2. First differing stage vs Turn 1 was **STREAM END / CLEANUP**, not intent.

**Fix (already in extension):** `streamChatFromPort` `finish()` on SSE `done` (and SSE error). Cancelled voice turns do not wipe a newer session’s IDLE. Always emit port `done` on error.

**Regression:** unfixed reader blocks Turn 2; `finishOnSseDone: true` unlocks send. Golden 5-turn + 20-turn loop: 0 silent failures.

Until this lands in the loaded Chrome extension (**reload v1.4.117+**), live voice will still look like a void after a successful first read.

### Highest-value **latency** fix after Turn 2 can send: #4 on explain-previous

Waiting on a new market book to answer “why are you leaning that way” is wasted and can contradict the sentence she just spoke.

**Fix this session (no PDH / levels edits):**

- `shouldRefreshMarketState(intent, ctx)` is false for `EXPLAIN_PREVIOUS_MARKET_READ`, and for `WAIT_EXPLANATION` / `BIAS_EXPLANATION` when a prior assistant read exists.  
- `buildChatSystemPrompt` skips `buildDeskMarketIntelligence` on that path. Prompt says: explain the last assistant read; do not invent a new LONG/SHORT/WAIT.  
- `trySnapshotChatReply` returns null on that path so TEXT `generateChatReply` cannot sneak a blocking intel fetch.  
- SSE `done.timings.marketStateRefresh` records the choice.  
- Challenge *“Are you sure that still holds?”* after a market turn → `EXPLAIN_PREVIOUS_MARKET_READ` (stream, not GENERAL_CHAT).

**Still refreshes:** current read, invalidation, what changed, liquidity now.

### Reassess (what limits voice **now**, in order)

1. **Live first-token on a fresh read** (Turn 1 / What changed / liquidity) — still intel + GPT. Out of scope to rewrite PDH.  
2. **GPT-4o TTFB** on skipped-intel follow-ups — now the remaining Turn 2 wait; **not live-measured**.  
3. **Post-speech 600 ms + TTS sentence gate + spoken cap** — configured, not live-measured.  
4. **STT quality** — unknown until a mic pass.

Do not add filler acks or arbitrary delays to hide (2).

---

## TEXT vs VOICE

Same five questions, same intents, same `trading` stream. Voice does not take a different brain. Voice adds: VAD, STT, 600 ms floor, echo tail, TTS. TEXT does not.

If TEXT Turn 2 is silent in the panel, VOICE Turn 2 is silent. That was #9, not Whisper.

---

## Natural language / interruption / recovery

| Test | Result | Live? |
|---|---|---|
| why leaning / Why? / Why bullish / what makes you think that / what’s supporting that / better side | stream, not screenshot-void | routing only |
| Mentor loop Q→WHY→FOLLOW-UP→CHALLENGE | never silent; challenge on previous read | routing only |
| FVG teaching then back to chart | routes, not void | routing only |
| France then back to chart | not Ha-say-more; back to trading | routing only |
| Barge-in starts turn 2, owns `requestId`, ERROR→IDLE, ask again | PASS | state machine |
| 20 consecutive text turns | 20 IDLE+reply, 0 silent | simulated |

---

## Scorecard /100

Scores are **pipeline / routing quality**. Live columns would move STT, TTS, RESPONSE LATENCY, INTERRUPTION. They were **not measured**.

| Axis | Score | Notes |
|---|---|---|
| STT | **40** | Path exists. No WER, no partial/final timings. 600 ms silence tax. |
| INTENT | **82** | Golden 5 + challenge. Bare Why? after wait is WAIT_EXPLANATION (correct). Classifier ≪1 ms. |
| CONTEXT | **78** | History + mentor ctx on stream. Spoken cap still drops coaching on the ear. |
| MARKET GROUNDING | **58** | Explain-previous no longer invents a second book. Fresh-read grounding owned by intel/PDH (other agents). Unscored live truth. |
| RESPONSE LATENCY | **48** | Turn 2 no longer queued forever (#9) and no longer waits 25s intel (#4 skip). GPT TTFB + Turn 1 intel **unmeasured**. |
| TTS | **55** | Early sentence speak is real. 16-char gate + 2-sentence cap vs mentor 3–5 sentences. No live time-to-first-audio. |
| INTERRUPTION | **62** | Barge-in + cancel in code. Not live-scored. Echo tail can feel deaf. |
| RECOVERY | **76** | ERROR→IDLE, cancelled turn must not steal the new session, visible error. |
| NATURAL CONVERSATION | **70** | Turn 2 can send; follow-ups stay market. Merge window 1100 ms can glue two shorts. |
| MENTOR QUALITY | **68** | Routing for Q/WHY/FOLLOW-UP/CHALLENGE. Coaching copy / WAIT-vs-lean wording is market-state (other agent). |
| **OVERALL** | **64** | Conversation can continue. Spoken latency still unproven on a mic. |

---

## TOP 3 bottlenecks

1. **Turn-taking (#9)** — SSE `done` did not finish the client Promise → Turn 2 never sent. **Fixed in extension. Reload required.**  
2. **Market-state blocking explain-previous (#4)** — 25s intel race before “why are you leaning.” **Fixed for that intent family. Fresh reads still pay it.**  
3. **Remaining: GPT first token + TTS sentence gate + 600 ms VAD** (#5/#6/#7/#1) — next live measurement. Do not pad with fake replies.

---

## Instrumentation to use on a live pass

Extension: `window.__dcVoiceLatencyTrace` (marks + breakdown).  
SSE `done`: `conversationTurn`, `intent`, `responseSource`, `marketSnapshotId`, `timings.{promptBuildMs,firstTokenMs,completeMs,marketStateRefresh}`.

Reload the unpacked extension after this change. Speak the five turns. Paste the trace. Then the live columns can replace the 40/48/55 guesses.

---

## Out of scope (respected)

- No commit / push / deploy  
- No production trading detector changes  
- No PDH market-truth (`43ca7cc4`)  
- No Aug 12 liquidity audit (`2c054977`)  
- No canned phrases, unmeasured timeout bumps, or fabricated snapshot facts  
