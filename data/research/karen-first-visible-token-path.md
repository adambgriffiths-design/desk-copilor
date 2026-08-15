# KAREN — First-visible-token path (AUDIT ONLY)

**Date:** 2026-08-15  
**Mode:** Code + prior docs only. No live HTTP sample. No code changes. No marathon.  
**Phrase:** warm `Give me the read` → `trading_stream` / `CURRENT_MARKET_READ`  
**Market:** Weekend / CME closed — live wall-clock timings **UNAVAILABLE** (not fabricated).

---

## Verdict (exact fields)

```
LLM TTFT:     UNAVAILABLE (live warm). Historical wire BEFORE flush: 40985ms from prompt start (1 sample). Historical in-process warm HIT after prompt ready: ~0.6–1.2s
SSE DELAY:    UNAVAILABLE (live after flush). Historical wire BEFORE flush: ~42439ms (firstVisible 83424 − firstToken 40985) — final-response-only buffer. Code AFTER flush: enqueue on each token (unit-proven); wire after UNAVAILABLE
UI DELAY:     UNAVAILABLE (Chrome paint never timed). Code: delta → port → updateStreamingAssistant sync DOM; done replaces with validated reply. Expected paint ≈ first SSE delta if flush reaches the wire
TOTAL:        UNAVAILABLE (live warm). Historical wire BEFORE flush: 83436ms (1 sample). Historical warm HIT in-process: ~3.7–4.8s typical
SINGLE BOTTLENECK: Proven on wire (BEFORE): trading SSE final-response-only buffering (deltaCount=1, first visible ≈ total). Current tree: that layer is coded away (`flushTradingLlmDeltas`); HTTP/Chrome first-visible AFTER flush still UNAVAILABLE — remaining expected warm-HIT wait is LLM (TTFT then rest of generation), not DOM
```

---

## Path trace (code-verified)

```
OpenAI stream:true chunk
  → lib/chat-engine.ts streamChatReply
  → app/api/chat/stream/route.ts trading ReadableStream
       enqueue ": stream-open"
       flushTradingLlmDeltas → enqueue {type:"delta", text} per non-empty token
       (after iterator) polishReply + enforceVisibleDecisionContract
       enqueue {type:"done", reply: validated}
  → Response headers: SSE_NO_BUFFER_HEADERS (no-cache, X-Accel-Buffering:no, identity)
  → extension/background.js fetch body.getReader → split \\n\\n → port.postMessage({type:"sse", data})
  → extension/content.js runStreamingChat
       delta: full += text; updateStreamingAssistant(full)  // first visible UI token
       done:  full = data.reply; updateStreamingAssistant(..., final); finalizeStreamingAssistant
```

| Hop | Role | Buffering? |
|---|---|---|
| `streamChatReply` | Live OpenAI iterator | No — `stream: true` |
| `flushTradingLlmDeltas` | Calls `onDelta` before next chunk | No — unit: first delta before iterator continues |
| `route.ts` trading path | Enqueues each delta; validates only on `done` | **Intended:** no. **Wire AFTER:** unproven |
| SSE headers / `: stream-open` | Discourage proxy/Next header hold | Set; prod gzip/proxy **not proven** |
| `background.js` | Forwards frames as reader yields | No intentional hold |
| `content.js` | Sync bubble update on each delta | No intentional hold; `done.reply` is FINAL |

---

## Checks requested

| Check | Result |
|---|---|
| **delta count** | BEFORE wire: **1**. AFTER HTTP: **UNAVAILABLE**. Unit expects ≫1 |
| **first delta size** | BEFORE wire: **9397** chars = full reply. AFTER HTTP: **UNAVAILABLE**. Unit: first delta ≠ full raw |
| **buffering** | BEFORE: drain LLM → one delta. AFTER code: per-token flush. Wire AFTER: **UNAVAILABLE** |
| **flush timing** | Code: immediate `controller.enqueue` in `onDelta`. Server mark `sse_first_visible_token` == enqueue (same tick as `llm_first_token`) — **not** Chrome paint |
| **frontend render delay** | **UNAVAILABLE** (no paint timer). Code path is sync DOM on delta |
| **final-response-only behaviour** | BEFORE wire: **yes** (first visible ≈ total, 12ms gap). AFTER code: **display deltas unvalidated; final = done.reply only**. Wire AFTER: **UNAVAILABLE** |

---

## Evidence sources

| Source | What it proves |
|---|---|
| `data/research/karen-sse-streaming.md` + `karen-sse-streaming-before.json` | Only complete HTTP trading sample **BEFORE** flush: firstToken **40985**, firstVisible **83424**, total **83436**, deltaCount **1**, firstDeltaChars **9397**. AFTER 5-read **ABORT** |
| `lib/sse-trading-flush.ts` + `scripts/test-sse-trading-flush.ts` | Flush-before-iterator-done; first delta not full reply |
| `app/api/chat/stream/route.ts` | Live use of `flushTradingLlmDeltas` + `: stream-open` + polish/enforce on `done` only |
| `extension/content.js` / `background.js` | Already paint/forward deltas; not the historical buffer |
| Warm HIT in-process audits (`karen-live-context-reuse.md`, `karen-latency-by-request-type.md`, `karen-speed-connection-priority-audit.md`) | Context ~1–21ms; LLM TTFT ~0.6–1.2s after prompt; TOTAL ~3.7–4.8s — **in-process**, not Chrome first-paint |
| `karen-post-opt-live-latency-measurement.md` (2026-08-15) | Live sample **UNAVAILABLE** (weekend + health) |
| Instrumentation sample in `karen-live-latency-instrumentation.md` | `llm_first_token=9100` / `sse_first_visible_token=9101` = **server enqueue** proximity, not UI |

---

## Where delay occurs (interpretation)

1. **Historically proven (1 wire sample, pre-flush):** delay was **SSE** — UI saw nothing until generation finished; first visible ≈ TOTAL. LLM already had a token ~42s earlier on that cold/miss-ish run.
2. **Code today:** that SSE layer should no longer hold; first enqueue should track first LLM token.
3. **Not yet proven on wire/Chrome:** whether Next/dev/proxy still coalesces chunks; Chrome paint lag; warm-HIT first-visible ≈ TTFT.
4. **If flush works on warm HIT:** bottleneck shifts to **LLM TTFT** (~0.6–1.2s after prompt) for first paint; TOTAL still LLM-bound (~3.5–11s). Pre-prompt market context is already cheap on HIT.
5. **Do not** use weekend live reads to fill these clocks.

---

## Stop

Audit complete. No code changes. No commit/push/deploy. No live marathon.
