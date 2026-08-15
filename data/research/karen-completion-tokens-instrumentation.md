# Overnight — completion_tokens latency instrumentation

**Date:** 2026-08-15  
**Mode:** MINIMAL SAFE HOOK — measurement only; no ICT / DecisionEnvelope / trading logic change  
**Priority:** performance and latency (#1)  
**Live A/B tonight:** NOT RUN (CME closed). No fabricated token counts.

## Gap (prior audits)

`streamChatReply` / casual streams never set `stream_options.include_usage`, so `usage.completion_tokens` was never available on warm HIT benches (`karen-llm-generation-latency-audit.md`, `karen-llm-output-compaction-audit.md`).

## What changed

| File | Change |
|------|--------|
| `lib/live-latency-profile.ts` | `noteLlmUsage()` → counters + notes (`completion_tokens`, `prompt_tokens`, `total_tokens`) |
| `lib/sse-trading-flush.ts` | Read final-chunk `usage` during `flushTradingLlmDeltas` |
| `lib/chat-engine.ts` | `stream_options: { include_usage: true }` on trading + casual streams; `noteLlmUsage(response.usage)` on non-stream `generateChatReply`; casual non-SSE loop also records usage |
| `app/api/chat/stream/route.ts` | Casual SSE loop records `chunk.usage` |
| `scripts/test-sse-trading-flush.ts` | Usage-chunk unit case |
| `scripts/test-live-latency-trace.ts` | `noteLlmUsage` unit cases |

Values surface on `timings.profile.counters` / `notes` via existing `liveLatencyTimingsPayload()` — no new Vercel timers, no recorder ship.

## Tests

| Suite | Result |
|-------|--------|
| `npm run test:sse-trading-flush` | **PASS** (incl. usage recording) |
| `npm run test:live-latency-trace` | **PASS** |

## Risks

- OpenAI may omit usage on some stream edge cases → counters stay unset (honest UNKNOWN), never invents tokens.
- Slightly larger final stream chunk; no decision-path impact.
- Dirty WT has unrelated files — this change is isolated and reversible.

## Still UNKNOWN until live warm HIT

Actual `completion_tokens` for `"Give me the read"` with/without `KAREN_INSTANT_READ_LLM_SKIP` and with/without `replyReplaced`.

## Next

- When CME opens: warm HIT A/B with `LIVE_LATENCY_TRACE=1` and read `profile.counters.completion_tokens`.
- Continue overnight: mode/intent edge regressions + clean-patch apply recommendations (no apply).
