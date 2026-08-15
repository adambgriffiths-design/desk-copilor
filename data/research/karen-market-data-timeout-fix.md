# Karen — Market-data timeout fix

**Date:** 2026-08-14  
**Mode:** Implementation only. No commit / push / deploy.  
**Audit:** `data/research/karen-indefinite-wait-audit.md`

---

## TIMEOUT VALUES

| Source | Constant | Value |
|--------|----------|-------|
| Yahoo OHLC (per chart HTTP call; 1d/15m/5m/1m parallel) | `YAHOO_FETCH_TIMEOUT_MS` | **15_000 ms** |
| Tickstream REST `/quote` | `TICKSTREAM_QUOTE_TIMEOUT_MS` | **8_000 ms** |
| Chat soft race (unchanged upper bound) | `buildChatSystemPrompt` Promise.race | **25_000 ms** (now throws `MarketDataError` / `MARKET_DATA_TIMEOUT`) |
| Tickstream WS stream wait (unchanged) | `DEFAULT_STREAM_WAIT_MS` | **8_000 ms** |

Yahoo wall-clock for a full multi-TF fetch ≈ **15s** (parallel intervals share one budget each).

---

## FILES CHANGED

| File | Change |
|------|--------|
| `lib/market-data-errors.ts` | **New** — `MarketDataError`, kinds, classify/format/wait helpers |
| `lib/market-data.ts` | AbortController + timeout on Yahoo fetch; clear `marketFetchInFlight` on failure (existing catch); test seams |
| `lib/tickstream/quote.ts` | AbortController + timeout on REST quote |
| `lib/analysis-quality-gate.ts` | `marketDataFailureQualityGate()` — WAIT gate without invented envelope |
| `lib/chat-engine.ts` | Map market failures → warning + synthetic QUALITY_GATE WAIT; no mentor double-retry on timeout |
| `app/api/chat/stream/route.ts` | Map market-data failures to SSE WAIT / explicit JSON error (not bare abort text) |
| `scripts/test-market-data-timeout.ts` | **New** — focused A–G + before/after measure |
| `package.json` | `test:market-data-timeout` script |

**Not edited:** extension ONLINE UI / `content.js` (owned elsewhere).

---

## TESTS

```bash
npx tsx scripts/test-market-data-timeout.ts
# or: npm run test:market-data-timeout
```

| ID | Case | Result |
|----|------|--------|
| A | Yahoo responds normally | PASS — bars returned; inflight cleared |
| B | Yahoo hangs | PASS — timeout ~400ms under test budget; `MARKET_DATA_TIMEOUT`; inflight cleared |
| C | Tickstream hangs | PASS — bounded timeout |
| D | Yahoo timeout + Tickstream available | PASS — Tickstream quote still works; **no OHLC fallback** → WAIT only (existing behaviour: Tickstream is price overlay after Yahoo bars) |
| E | All market data unavailable | PASS — synthetic gate WAIT; no LONG/SHORT; kinds distinguished |
| F | Timeout then new request | PASS — no poisoned inflight |
| G | Reconnect/retry after timeout | PASS — coalesced callers ≤8 Yahoo HTTP calls per flight; retry allowed |
| MEASURE | before/after hang | PASS — see below |

---

## BEFORE / AFTER

Mock hang (no network):

| | Time to failure | User-facing |
|--|-----------------|-------------|
| **BEFORE** | Unbounded until client SSE ~90s abort | Often `"This operation was aborted"` |
| **AFTER** (measured) | ~**300–450 ms** under test budgets; production Yahoo bound **15s** | `WAIT — MARKET_DATA_TIMEOUT — current market data could not be confirmed in time. No LONG/SHORT…` |

Sample measure from test run:

```
MEASURE before hang-without-signal race=2008ms | after deterministic timeout=318ms (budget 300ms)
```

(Before race is an artificial 2s ceiling standing in for the old unbounded hang; real prod before was ~90s client abort.)

---

## FALLBACK BEHAVIOUR

1. **Yahoo OHLC timeout** → `MarketDataError(MARKET_DATA_TIMEOUT)` → `marketFetchInFlight = null` → rich trading path gets **synthetic QUALITY_GATE WAIT** (no DecisionEnvelope LONG/SHORT invented).  
2. **Tickstream quote timeout** → same kind mapping; stream path still falls back to WS (8s) when REST fails (unchanged).  
3. **Yahoo timeout does not use Tickstream as OHLC substitute** — Tickstream remains live-price overlay only after bars exist (preserved).  
4. **Mentor follow-up** no longer retries `buildDeskMarketIntelligence` after timeout/unavailable (avoids double-wait).  
5. **Stream route** maps market-data failures to SSE `done` WAIT or JSON `{ failureKind }` — not raw abort text.  
6. **QUALITY_GATE / PIT / DecisionEnvelope** unchanged when intel builds successfully; failure path does not invent a directional envelope.

### Failure kinds (do not collapse)

| Kind | Meaning |
|------|---------|
| `MARKET_DATA_TIMEOUT` | Yahoo/Tickstream budget exceeded |
| `MARKET_DATA_UNAVAILABLE` | Upstream error / empty quote |
| `REQUEST_ABORTED` | Non-timeout abort |
| `USER_CANCELLED` | Explicit user cancel |
| `INTERNAL_ERROR` | Other |

---

## REMAINING WAIT PATHS

Still bounded by outer client / other layers (not fixed in this change):

| Path | Bound |
|------|-------|
| Chat SSE client / SW | ~90s |
| OpenAI LLM stream (server) | no AbortSignal (client abort only) |
| Tickstream WS stream | 8s (already) |
| Chart live-verdict client | 120s |
| `getTurnExtras` | 8s |
| Valid QUALITY_GATE WAIT after successful intel | sync (honest WAIT) |

Highest residual risk after this fix: **LLM stream without server abort** can still burn remaining budget after a fast Yahoo success — separate from market-data hang.

---

## Notes

- Preserved: QUALITY_GATE thresholds, PIT, DecisionEnvelope construction on successful intel.  
- No trading-logic / ICT / freshness / SSE rewrite / cache / structure changes.  
- No commit / push / deploy.
