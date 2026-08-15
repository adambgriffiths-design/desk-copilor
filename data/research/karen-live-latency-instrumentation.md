# Karen live latency instrumentation

**Date:** 2026-08-14  
**Scope:** Measurement only. No trading-behaviour, freshness, DecisionEnvelope, quality-gate, or ICT changes. No new cache.

## Enable

```bash
LIVE_LATENCY_TRACE=1
```

When set, each trading live request logs one compact console line and includes `timings.liveLatency` on SSE `done` (alongside existing `timings.profile`).

Without the env flag, marks still record in-process (cheap); console emit is skipped. SSE may still include the structured `liveLatency` object in `done.timings` for trading paths.

## Stages (ms from request received)

| Stage | Mark |
|---|---|
| request_received | t1_backend |
| intent_classified | t2_intent |
| market_data_started | t3_market_data_begin |
| market_data_complete | t4_live_price |
| market_context_started | t5_context_begin |
| market_context_complete | t6_context_complete |
| decision_envelope_complete | t7_envelope |
| llm_request_started | t8_llm_begin |
| llm_first_token | t9_first_llm_token |
| sse_first_visible_token | t11_first_sse |
| final_response | t12_done |

## Per-request meta

- `requestType` — e.g. `trading:CURRENT_MARKET_READ`
- `cache` — `HIT` / `MISS` / `N/A`
- `missReason` — e.g. `bars`, `session`, `price`, `cold`
- `barIdentity` — compact reuse fingerprint (not OHLC)
- `new1mBarInvalidation` — true when miss reason is `bars`
- `tickstreamUsed` / `yahooFetched`
- `totalMs` — `final_response`

## Files

- `lib/live-latency-trace.ts` — structured report + env gate
- `lib/live-latency-profile.ts` — underlying marks (+ `clearLiveLatency`)
- Thin hooks: `app/api/chat/stream/route.ts`, `lib/chat-engine.ts`, `lib/market-intelligence.ts`, `lib/market-data.ts`
- Tests: `npm run test:live-latency-trace`

## Sample output

```text
[live-latency] req=mabc12-xy type=trading:CURRENT_MARKET_READ cache=MISS miss=bars bar=sym=MNQ=F|bars=…|session=…|px=25100.00|m1t=… new1m=true tickstream=true yahooFetched=false total=12840ms request_received=0ms intent_classified=8ms market_data_started=10ms market_data_complete=890ms market_context_started=891ms market_context_complete=7200ms decision_envelope_complete=7250ms llm_request_started=7300ms llm_first_token=9100ms sse_first_visible_token=9101ms final_response=12840ms
```

SSE `done.timings.liveLatency` mirrors the same object shape (`stages` + `meta`).
