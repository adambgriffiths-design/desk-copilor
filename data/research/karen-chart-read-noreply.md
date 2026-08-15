# Karen chart_read no-reply after v1.4.118

**Date:** 2026-08-14  
**Extension:** **v1.4.119** (reload unpacked `extension/` + hard-refresh TradingView).  
**Do not treat live TV as verified.** This pass did not drive the Chrome unpacked extension on a chart.  
**No commit / push / deploy.** PDH / liquidity / REH / mentor-reasoning files untouched.

---

## Classification (A–I)

Live symptom: user bubble appears, then `Desk returned no reply (chart_read)`.

That string is **not a hang timeout**. It is emitted by `runChartReadGuarded` when the screenshot/pipeline path **returns without a visible assistant bubble**.

| Code | Meaning | This bug |
|---|---|---|
| A | never dispatched | **No** — user message is recorded |
| B | dispatched, SW doesn't receive | **No** for TEXT stream (local SSE proven). Possible for screenshot `VERDICT_ASYNC` if SW sleeps mid-fetch |
| C | SW receives, doesn't answer | **No** as the primary path |
| D | backend never starts | **No** |
| E | backend starts but hangs | **No** — hang would be the 90s timeout copy, not `(chart_read)` |
| F | market snapshot hangs | **No** as the primary path (15s snapshot race → different error) |
| G | Karen analysis fails | **Partial** — prod snapshot often returns “live data unavailable” |
| H | response generated but lost | **Yes** — chat swallow |
| I | response reaches extension but isn't rendered | **Yes** — `absorbMarketDataMessage` ate the spoken line |
| **Routing** | wrong path | **Yes — primary** |

**Primary class: REQUEST ROUTING**, then **I/H** on the obsolete screenshot path.

Two live phrases, two entry points, same user-facing string:

1. **`give me market read`**  
   `isChartReadCommand` matched substring `\bmarket read\b` → frontend **stole to screenshot** `kickOffChartRead` / `runChartReadGuarded` **before** `/api/chat/stream`.  
   Route was `chart_read`, not TEXT. Category: **CHART_READ_REQUEST_ROUTING**.

2. **`Give me a read on the chart.`**  
   v1.4.116 already classified this as `CURRENT_MARKET_READ` / trading **stream** (72/72). Frontend 1.4.118 does **not** intercept it as a screenshot command.  
   Live extension talks to **prod `https://desk-copilor.vercel.app` v1.4.64** (local `:3000`/`:3001` were down). Prod `/api/chat/stream` returns JSON `{ needsChartRead: true }` in **371ms**. Panel then calls `runChartReadGuarded` → same empty `(chart_read)` error.  
   Category: **CHART_READ_REQUEST_ROUTING** (stale API bounce).

---

## Why chart_read exists (do not delete the shortcut)

`chart_read` is the **ANALYSE MARKET / exact-command** pipeline:

`ANALYSE MARKET` / `"get the read"` / exact `"give me a read"` / exact `"market read"`  
→ OHLC export (or screenshot) → service worker `VERDICT_ASYNC` → `/api/live-verdict` → `applyVerdict`.

It is **not** the conversational mentor read. v1.4.116 made `"Give me a read on the chart."` a TEXT `/api/chat/stream` turn (`forceMarket`) because that path already works. The leftover bug was:

- substring `market read` still stole `"give me market read"`
- prod 1.4.64 still **bounced** conversational stream turns into `needsChartRead`
- screenshot completion with no chat bubble was reported as generic `(chart_read)`

---

## TEXT vs CHART_READ (why 72/72 didn't match live)

| | TEXT stream | Screenshot chart_read |
|---|---|---|
| Phrase | `Give me a read on the chart.` | `give me market read`, exact `get the read`, ANALYSE MARKET |
| API | `/api/chat/stream` SSE | `/api/live-verdict` via SW |
| Local 1.4.84 @ `:3010` | **PASS** SSE 200, delta+done, spoken market read | N/A for conversational |
| Prod 1.4.64 | **FAIL** JSON `needsChartRead` bounce (371ms / 133ms) | then empty chat |
| Unit (this pass) | **80/80** `test:karen-text-read` | exact shortcuts still screenshot |

Local `:3010` (`next start`, **old build**) already streams the dotted phrase. Extension **did not use :3010** (only `:3000`/`:3001` then Vercel). Live panel therefore hit prod bounce.

---

## Timeout (not increased)

The live copy is **empty completion**, not the 90s timer.

| Stage | Limit | Role |
|---|---|---|
| `CHAT_STREAM_TIMEOUT_MS` | 90s | TEXT SSE |
| `waitForVerdict` | 90s | screenshot waiting for SW `VERDICT_RESULT` |
| `VERDICT_ASYNC` ack `bgSend` | 15s | SW `sendResponse({ ok: true })` is immediate |
| `/api/live-verdict` in SW | 120s | longer than panel wait — panel times out first |
| `MARKET_SNAPSHOT` `bgSend` | 15s | scoped snapshot |
| export fallback snapshot race | 15s | `snapshot_timeout` |
| SW stream abort | 90s | port `AbortController` |

**Blocking op on the live conversational path:** prod bounce (sub-second), then screenshot/snapshot. Spoken `"Live market data is unavailable"` matched `/live data unavailable/i` and was **absorbed into the market-data card**, so `recordAssistantReply` returned false → `(chart_read)` with no bubble.

No timeout values were raised.

---

## Fixes in v1.4.119

1. **Routing** (`lib/chart-read-intent.ts` + `extension/chart-intent.js`)  
   Remove substring `\bmarket read\b`. Exact `"market read"` stays the screenshot shortcut. `"give me market read"` is TEXT.

2. **Mentor** (`lib/mentor-intent.ts` + `extension/mentor-intent.js`)  
   `"give me market read"` / `"give me a market read"` → `CURRENT_MARKET_READ`.

3. **Frontend intercept** (`content.js`)  
   Screenshot only if `isChartReadCommand` **or** (`needsFullChartRead` **and not** trading stream). Conversational reads go to `/api/chat/stream`.

4. **Backend bounce** (`app/api/chat/stream` + `app/api/chat`)  
   Never bounce when `tradingStream` is true. Local source will SSE; **prod 1.4.64 still bounces until someone deploys** (not this pass).

5. **Bounce handler**  
   Conversational `needsChartRead` JSON is **not** sent to screenshot. Visible `CHART_READ_REQUEST_ROUTING` + `req=`.

6. **No silent swallow**  
   `recordAssistantReply` still updates the market-data card but **always** keeps the chat bubble. Empty verdict → `CHART_READ_EMPTY_RESPONSE`.

7. **Categories** (shown in the no-reply line):  
   `CHART_READ_EXTENSION_TIMEOUT` · `CHART_READ_API_TIMEOUT` · `CHART_READ_MARKET_STATE_TIMEOUT` · `CHART_READ_WORKER_DISCONNECTED` · `CHART_READ_EMPTY_RESPONSE` · `CHART_READ_REQUEST_ROUTING`  
   `requestId` logged at dispatch, SW receive, API start, verdict send/ack/complete.

8. **Local API discovery**  
   Extension now probes `:3010` as well as `:3000`/`:3001` (the running `next start` was on 3010). `npm run dev` was started on **:3000** this pass so unpacked reload can hit the new bounce gate.

---

## Service worker / RECONNECT / TV refresh

v1.4.118 latch fix kept:

- `receiving_end` → bounded wake (300–2400ms ×4), **no tab reload**
- `invalidated` → at most one reload per version per 60s; latch is `{version,at}` JSON
- successful `bgSend` / PING clears `dc-stale-reload`

`test:connection-reliability` **PASS**. Live SW sleep → wake → chart_read on TradingView **not run**.

---

## Acceptance matrix

| Stage | Result |
|---|---|
| CHART_READ DISPATCH | **PASS (unit)** conversational → TEXT stream. Exact `get the read` / `give me a read` / `market read` stay screenshot. Live TV dispatch **UNVERIFIED** |
| SERVICE WORKER | **PASS (unit)** receiving-end wake, no stale latch. Live sleep **UNVERIFIED** |
| API | **PASS local** `:3010` SSE for dotted phrase. **FAIL prod 1.4.64** bounce. New bounce gate **unit PASS**; live `:3000` compile **not HTTP-probed this pass** |
| MARKET SNAPSHOT | **DEGRADED** on prod HTTP (no TV last). Not the conversational TEXT path |
| KAREN | **PASS local SSE** spoken read on `:3010`. Screenshot `/api/live-verdict` **UNVERIFIED** live |
| RESPONSE RETURN | **PASS local SSE**. Prod bounce returned empty `needsChartRead` JSON |
| UI RENDER | **FIXED in code** (absorb no longer swallows chat). Live TV render **UNVERIFIED** |
| WORKER SLEEP RECOVERY | **PASS unit**. Live **UNVERIFIED** |
| TRADINGVIEW REFRESH | **UNVERIFIED** (no TV tab in this runner) |

---

## ROOT CAUSE

Conversational “give me a read…” still landed on screenshot `chart_read` (substring `market read`, or prod `needsChartRead` bounce). That path completed without a chat bubble because unavailable-data copy was absorbed as a status card. TEXT `/api/chat/stream` already produced a market read locally (72/72, then live `:3010` SSE).

## FIX

Route conversational reads to TEXT stream; keep screenshot for ANALYSE / exact shortcuts; stop bouncing trading-stream turns; never swallow the assistant bubble; name the failure category + `requestId`. Extension **1.4.119**.

## END-TO-END SUCCESS RATE

- **Unit routing / bounce / mentor / bottleneck / connection:** PASS (80/80 text-read; mentor; 55/55 bottleneck; connection-reliability).
- **Local TEXT `Give me a read on the chart.` @ `:3010`:** **1/1 SSE SUCCESS** (delta+done, spoken read).
- **Live TradingView + unpacked extension + mic + RECONNECT/TV refresh loop:** **0/N — not run.** Reload **v1.4.119**. Prefer local `npm run dev` (`:3000`, now running) over prod 1.4.64 until deploy.
- **Do not claim live connection reliability is verified.**

---

## 2026-08-14 live reliability — Berlin fallback + get-the-read empty

**Extension:** **v1.4.128** (reload unpacked `extension/` + hard-refresh TradingView).  
**No commit / push / deploy.** Replay / incremental replay / architecture-v1 / ICT semantics untouched.

### Berlin — “I'm having trouble responding right now”

That exact line is `CASUAL_LLM_FAILURE_REPLY` (`lib/casual-chat-intent.ts`, mirrored in `extension/casual-chat.js` / `content.js` `localCasualReply`). It is **not** intent misrouting.

| Check | Result |
|---|---|
| Intent | `what is the capital of berlin` → `GENERAL_KNOWLEDGE`, desk route **casual**, standalone general |
| API key | Present in `.env.local`. Not the failure. |
| QUALITY_GATE | Does not run on this casual path |
| Local `:3000` casual SSE | **PASS** (before hang): 200 SSE in ~7s, reply named Berlin |
| TV panel | Showed the canned failure copy |

**Root cause:** the casual LLM path failed or was skipped, then the extension **published the failure template as a successful chat line**. Two execution bugs:

1. `tryCasualChatReplyInstant` could return `CASUAL_LLM_FAILURE_REPLY` as an instant “success” whenever `isGeneralConversation` was false (e.g. “Give me the read” on the old gate). That **never called gpt-4o-mini**.
2. `replyCasual` on empty/error immediately called `localCasualReply`, which for any general question **is** that canned line. No retry.

Routing was already correct. Curl on a clean `:3000` already answered Berlin. The panel did not keep that stream.

### Chart-read empty — related, not the same

`CHART_READ_EMPTY_RESPONSE` is the screenshot/vision path (`stealScreenshot` → `runChartReadGuarded`) completing with no spoken decision. `"get the read"` matched `CHART_READ_EXACT` and never reached `/api/chat/stream`. `"Give me the read"` did **not** match `CHART_READ_EXACT` (`give me a read` / `get the read` only) and was not `CURRENT_MARKET_READ` either (that regex required chart/market/this/here/now).

Same user-visible class: first bubble is a failure template instead of the working DecisionEnvelope / casual stream. Different handler.

### Fix (1.4.128)

- Never return the canned LLM-failure copy from instant casual; stream gpt-4o-mini instead.
- Stream route: ignore instant failure copy; treat general-knowledge as casual; do not `needsChartRead`-bounce it; QUALITY_GATE does not steal general chat.
- Typed `"get the read"` / `"Give me the read"` / `"give me a read"` / `"market read"` are `CURRENT_MARKET_READ` → trading **TEXT** stream. Screenshot steal skipped when `tradingQ`. ANALYSE MARKET still `kickOffChartRead`.
- If screenshot still runs and comes back empty, fall through to TEXT stream (no RECONNECT line).
- Casual stream: one retry; drop failure bubbles before retry. SW uses the panel’s `apiBase` when allowed.

### Verify on TradingView

1. If `:3000` health hangs, that next-dev is stuck — restart `npm run dev`. `:3001` was still healthy **1.4.84** after the hung probe. Do not start a second dev if one is Ready.
2. Reload unpacked extension **1.4.128**, hard-refresh the chart tab.
3. `"what is the capital of berlin"` / `"what's the capital of germany"` → a real answer that names **Berlin**, not the trouble-responding line.
4. `"get the read"` / `"Give me the read"` → **one** TRADE DECISION / spoken read. No `CHART_READ_EMPTY_RESPONSE`.

Live TV + mic **not driven this pass.** Unit: `test:karen-text-read` **85/85**, `test:karen-intent-routing` **135/135**, `test:casual-fallback` PASS, `test:voice-mentor-intent` PASS. Berlin casual SSE **1/1** on `:3000` before the later trading-stream probe blocked that process. `Give me the read` live POST on that hung `:3000` **did not complete** (abort). After restart, that phrase must not JSON-bounce `needsChartRead`.

---

## Live bug 2026-08-14 ~20:00 — CHART_READ_API_TIMEOUT (1.4.129)

**Symptom:** Typed `"get the read"` → chat showed raw `CHART_READ_API_TIMEOUT — live-verdict did not return`.

**Root cause (fallthrough poison):** Even when `streamFallback: true`, `runChartRead` catch always `reportIssue(..., { chat: true })`. `explainError` did not rewrite `CHART_READ_API_TIMEOUT` (no `"timed out"` substring), so the raw line landed in chat. `isDeskFailureCopy` only matched `EMPTY_RESPONSE` / `REQUEST_ROUTING`, so handleUserMessage treated it as a real reply and **skipped TEXT stream fallthrough**.

**Routing note:** 1.4.128 already set `stealScreenshot = !tradingQ && …` for these phrases. Live hit still reached `waitForVerdict` (stale injected scripts and/or screenshot path). Fallthrough was broken either way.

**Fix (extension 1.4.129):**
- `runChartRead`: skip chat `reportIssue` when `opts.streamFallback`.
- `isDeskFailureCopy`: treat all `CHART_READ_*` / live-verdict timeout copy as failure → fall through.
- `mustUseTradingStream` / `isTextMarketReadPhrase`: hard-route `"get the read"` / `"Give me the read"` to TEXT.
- `CHART_READ_COMMANDS`: include `give me the read`.
- ANALYSE MARKET still screenshot; timeout there stays a chart error (friendlier copy).

**Verify:** Reload unpacked **1.4.129**, hard-refresh TradingView. Unit `test:karen-text-read` **85/85**. Local `:3000` (restarted after hung health) logged `Give me the read` → `trading · current_market_read` / `tradingStream: true` (no `needsChartRead` bounce). Do not show `CHART_READ_API_TIMEOUT` for typed get-the-read when stream can answer.
