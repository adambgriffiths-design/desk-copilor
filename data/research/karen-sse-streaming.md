# Karen SSE streaming (first buffering layer)

**ABORT 2026-08-14 19:34:** Stopped immediately — machine frozen (disk 100% / RAM 92%). This session started no tsx profile, no extra next-dev, no OpenAI; did not kill Cursor/Chrome/:3000.
**BEFORE only:** first visible **83424ms** ≈ total **83436ms**, deltaCount=**1**, first delta **9397** chars (LLM token 40985ms). Route still “flush on token, validate on done”; AFTER 5-read not measured.
**Do not resume HTTP/in-process marathon on 8GB RAM.**

**Date:** 2026-08-14  
**Scope:** PROFILE → IDENTIFY FIRST BUFFERING LAYER → FIX ONLY THAT LAYER. Market-context reuse left untouched. No commit/push/deploy. No extra next-dev. After-fix 5-read HTTP marathon **not completed** (hung/interrupted).

## First buffering layer

**`app/api/chat/stream/route.ts` `trading_stream` path.**

Before the fix it drained the OpenAI iterator fully, then `polishReply` + `enforceVisibleDecisionContract`, then enqueued **one** `delta` with the complete reply. First SSE byte to the UI was after LLM complete.

Not the first layer (checked, not rewritten):

- `extension/content.js` `runStreamingChat` already paints `type: "delta"` via `updateStreamingAssistant` and only uses `done.reply` as FINAL.
- `extension/background.js` already forwards SSE frames as the fetch reader yields them.
- `lib/chat-engine.ts` `streamChatReply` already returns a live OpenAI `stream: true` iterator.
- Casual `/api/chat/stream` already flushed per-token deltas.

## Fix (applied)

Split STREAMING DISPLAY vs FINAL VALIDATED RESPONSE:

- Flush each non-empty LLM token as `type: "delta"` immediately (`lib/sse-trading-flush.ts` `flushTradingLlmDeltas`).
- Open the body with `: stream-open` so Next/proxies do not hold headers until first data.
- After the iterator finishes: `polishReply` + `enforceVisibleDecisionContract` on the **complete** text; emit `type: "done"` with the validated `reply` (client replaces on done). Do **not** enqueue the full reply as a trailing delta (that would concatenate).
- SSE headers: `X-Accel-Buffering: no`, `Content-Encoding: identity`, `Cache-Control: no-cache, no-transform`, `dynamic = "force-dynamic"`.

Files changed:

- `app/api/chat/stream/route.ts`
- `lib/sse-trading-flush.ts` (new)
- `scripts/test-sse-trading-flush.ts` (new)
- `scripts/profile-sse-streaming.ts` (measurement only)
- `package.json` (`test:sse-trading-flush`)

## Before (HTTP `:3001`, existing next-dev)

Phrase: `Give me the read`. Five attempts; `:3000` hung; three reads aborted at 120s; one HTML 404 during compile.

**Only complete `trading_stream` sample (run 4):**

| Clock | ms |
|---|---:|
| TIME TO FIRST LLM TOKEN (`timings.firstTokenMs`, from prompt start) | **40985** |
| TIME TO FIRST VISIBLE TEXT (first SSE `delta` at the client) | **83424** |
| TOTAL (`done`) | **83436** |
| `deltaCount` | **1** |
| first delta chars / reply chars | **9397 / 9397** |

First visible ≈ total (12ms gap). The one delta **was** the entire reply. Server had the first LLM token ~42s earlier (`completeMs` 44279 vs `firstTokenMs` 40985 → ~3.3s remaining generation hidden). HTTP headers also arrived at 83415ms — Next held the body until that single enqueue.

Follow-ups (same conversation, after the successful read):

| Phrase | source | TOTAL |
|---|---|---:|
| Why not short? | `mentor_structured` | 24952ms |
| Why? | `mentor_structured` | **154ms** |
| What are you waiting for? | `mentor_structured` | **83ms** |

Follow-ups did **not** go through the trading LLM buffer. `intelBuilds=0` on those done events (structured path). No market-context reuse files were modified.

## After

Code-level proof (unit): `scripts/test-sse-trading-flush.ts` — first delta is flushed **before** the stream iterator continues; first delta is not the full reply; concatenated deltas + `done.reply` still parse.

HTTP after-fix 5-read profile **was not finished** (command interrupted / next-dev compile storms). Expected if the flush is live: `deltaCount` ≫ 1, `firstDeltaChars` ≪ `replyChars`, first visible ≈ first LLM token, total unchanged.

## Tests

| Test | Result |
|---|---|
| `test-sse-trading-flush` | PASS (flush-before-iterator-done + SSE done/delta parse) |
| `test-karen-text-read-stability` | 85 passed |
| `test-karen-text-read-live-stream` | bounce gate PASS; live HTTP skipped (`:3000` abort, `:3010` down) |
| `test-karen-redteam-conversation` | 98 passed (SSE done still finishes the panel reader) |
| `test-voice-bottleneck` | 52 passed, **3 failed** on pre-existing “still refreshes” assertions — not this layer |

## Remaining layers (not fixed)

- Market-context / Yahoo / Tickstream cost before the first LLM token (still dominates TOTAL).
- `:3000` hung health; `:3001` next-dev slow compiles (first request can 404/abort).
- HTTP after-fix TTFT/first-visible/total on 5 fresh reads — not measured.
- Gzip/proxy buffering in production (headers set; not proven on Vercel).
- `simulatePanelStreamReader` still keys deltas on `data.reply` (legacy mock); live extension uses `data.text`. Not rewritten.
