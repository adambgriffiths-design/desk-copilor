# Karen stability — silent TEXT chart-read (2026-08-14)

**Mode:** stabilize the core. No commit / push / deploy. No REH/EQL, mentor methodology, or production-trading changes.  
**Extension:** **v1.4.116** (reload unpacked + hard-refresh TV).  
**Live TV/mic:** not in this loop.

## BUG-KAREN-TEXT-SILENT-READ

**SYMPTOM:** TEXT `Give me a read on the chart.` appears in chat. No loading, no stream, no error. Request vanishes. Mic/Whisper/Realtime off.

**STAGE:** SEND succeeds (user bubble). `handleUserMessage` intercepts via `isChartReadCommand` / `needsFullChartRead` and `kickOffChartRead()` (void). `/api/chat/stream` never called. If the stream were used, backend also returned `{ needsChartRead: true }` JSON. Loading never armed; `finally` on the stream path was never entered. Voice subsystem not involved.

**ROOT CAUSES**
1. `\bgive me a read\b` treated conversational “on the chart” as a screenshot command.
2. Phrase classified `GENERAL_CHAT`, so desk route was `chart_read` not `trading`.
3. Fire-and-forget `kickOffChartRead` + no `armChatUiLoading` → user message, then nothing.
4. Stream bounce `needsFullChartRead` would have sent the same phrase back to screenshot even after a frontend send.
5. Follow-ups `Why are you leaning that way?` / `Which liquidity matters most right now?` were not mentor-market turns (would drop context / snapshot).

**FIXES**
- Conversational “give me a read on the chart” → `CURRENT_MARKET_READ` + trading **stream** (`voiceInput: false`). Exact `give me a read` stays screenshot shortcut.
- Backend bounce gate closed for that phrase (SSE, not `needsChartRead` JSON).
- Chart-read leftovers **awaited** with loading; empty result → visible chat error + requestId log. No fake fallback read.
- Follow-up intents: leaning → `BIAS_EXPLANATION`; which liquidity → `LIQUIDITY_EXPLANATION`.

## Pipeline (TEXT, mic off)

| Stage | Result |
|---|---|
| REQUEST START | PASS — send/enqueue logs + user bubble |
| API CALLED | PASS — dispatch-stream, not screenshot-void |
| BACKEND RECEIVED | PASS — local `/api/chat/stream` 200 SSE |
| MARKET STATE | PASS — stream `forceMarket`; reply cited session/bias (quality noted degraded) |
| KAREN | PASS — spoken market read, not empty |
| STREAM | PASS — `delta=true` `done=true` `error=false` |
| FRONTEND RENDER | PASS locally (SSE reply). On TV: reload **v1.4.116**. Stream bubble + loading cleanup in content.js |

## Tests

| Run | Result |
|---|---|
| `test:karen-text-read` | **72/72 PASS** (was 35 FAIL before fix) |
| Local TEXT POST `/api/chat/stream` | **PASS** — rendered reply |
| `test-voice-mentor-intent` | PASS |
| `test-conversation-chains` | PASS |
| `test-conversation-routing` | PASS |
| `test-casual-fallback` | PASS |
| `npm run build` | PASS |
| `test-scoped-chart-qa` | FAIL pre-existing (`chart doing` snapshot vs rich LLM) — **not this bug** |
| Live TradingView + mic | **not run** |

## END-TO-END SUCCESS RATE

- **TEXT (this phrase, local API, mic off):** 1/1 stream render **SUCCESS**. Routing+follow-up sequence unit: 5/5 **SUCCESS**.
- **VOICE (same phrase):** classifier/route **PASS** (same stream path, `voiceInput` independent). Live mic/Realtime **not exercised**.
- **Do not treat as 20× live TV stable.** Prod API not deployed; TV must reload 1.4.116.

## TEXT RESULT

**PASS (local).** `Give me a read on the chart.` with `voiceInput: false` starts SSE and returns a market read. Follow-ups route `FOLLOW_UP` / trading, not casual, not screenshot-void.

## VOICE RESULT

**PASS (routing only).** Same phrase is `CURRENT_MARKET_READ` / trading stream. Live listen/speak not in this loop.

## REMAINING BLOCKERS

1. Reload extension **v1.4.116** + hard-refresh TV before the panel will send this path.
2. **No deploy** — production `/api/chat/stream` still has the old bounce until the API is shipped. Until then, 1.4.116 still shows loading/error instead of a silent void if prod bounces to chart-read.
3. Live TV connect → price → 5-question TEXT then VOICE not run here.
4. Pre-existing `test-scoped-chart-qa` failure on “chart doing” snapshot vs LLM (untouched).
