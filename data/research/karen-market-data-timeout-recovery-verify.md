# Karen — Market-data timeout recovery VERIFY

**Date:** 2026-08-14  
**Mode:** Audit / verify only. No trading-logic changes. No commit / push / deploy.  
**Prior work:** `data/research/karen-market-data-timeout-fix.md`  
**Audit source:** `data/research/karen-indefinite-wait-audit.md`  
**Test run:** `npm run test:market-data-timeout` → `scripts/test-market-data-timeout.ts`  
**Code change needed:** **None**

---

## TIMEOUT DURATIONS (from code)

| Source | Constant / path | Value |
|--------|-----------------|-------|
| Yahoo OHLC (per chart HTTP call; 1d/15m/5m/1m parallel) | `YAHOO_FETCH_TIMEOUT_MS` (`lib/market-data-errors.ts`) | **15_000 ms** |
| Yahoo race backup | `yahooFetch` Promise.race (`timeoutMs + 25`) | **15_025 ms** |
| Tickstream REST `/quote` | `TICKSTREAM_QUOTE_TIMEOUT_MS` | **8_000 ms** |
| Tickstream race backup | `fetchTickstreamQuote` Promise.race (`timeoutMs + 25`) | **8_025 ms** |
| Chat soft race (upper bound) | `buildChatSystemPrompt` Promise.race | **25_000 ms** → `MarketDataError` / `MARKET_DATA_TIMEOUT` |
| Tickstream WS stream wait (unchanged) | `DEFAULT_STREAM_WAIT_MS` | **8_000 ms** |

Production wall-clock for a hung multi-TF Yahoo fetch ≈ **15s** (not ~90s). Client SSE ~90s remains an outer bound only.

---

## MEASURED (this verify run)

```
TIMEOUT VALUES: YAHOO_FETCH_TIMEOUT_MS=15000 TICKSTREAM_QUOTE_TIMEOUT_MS=8000
PASS A Yahoo responds normally
PASS B Yahoo hang → timeout in 404ms (budget 400ms)
PASS C Tickstream hang → timeout in 310ms
PASS D Yahoo timeout; Tickstream available does not invent OHLC decision
PASS E All unavailable → explicit WAIT; kinds distinguished
PASS F Timeout then new request allowed (no poisoned inflight)
PASS G Coalesce + retry after timeout (calls per flight ≤8, measured)
MEASURE before hang-without-signal race=2011ms | after deterministic timeout=314ms (budget 300ms)
PASS MEASURE before/after time-to-failure
8 passed
exit_code=0
```

| Scenario | Budget in test | Measured | Bound vs ~90s |
|----------|----------------|----------|---------------|
| Yahoo hang | 400 ms | **404 ms** | PASS — ≪ 90s |
| Tickstream hang | 300 ms | **310 ms** | PASS — ≪ 90s |
| After deterministic timeout | 300 ms | **314 ms** | PASS |
| Before (unbounded hang race ceiling) | 2000 ms | **2011 ms** | Artificial stand-in for old hang |

---

## TEST MATRIX → RECOVERY BEHAVIOUR

| # | Case | How covered | Recovery behaviour | Result |
|---|------|-------------|--------------------|--------|
| 1 | Yahoo responds | **A** | Bars returned; `marketFetchInFlight` cleared | **PASS** |
| 2 | Yahoo hangs | **B** | `MarketDataError(MARKET_DATA_TIMEOUT)` near budget; inflight cleared; no bare `"This operation was aborted"` | **PASS** |
| 3 | Tickstream responds | **D** (quote success after Yahoo timeout) | REST quote still works independently; **not** used as OHLC substitute | **PASS** |
| 4 | Tickstream hangs | **C** | Bounded `MARKET_DATA_TIMEOUT`; no 90s wait | **PASS** |
| 5 | Both unavailable | **E** | `marketDataFailureQualityGate` → WAIT; `canDeliverVerdict=false`; **no** DecisionEnvelope; kinds distinguished (timeout ≠ abort ≠ unavailable ≠ cancel) | **PASS** |
| 6 | Timeout → successful retry | **F** (+ **G** coalesce/retry) | Inflight cleared after hang; next `fetchBars` / coalesced flight succeeds or times out cleanly; ≤8 Yahoo HTTP calls per coalesced multi-TF flight | **PASS** |

---

## VERIFY CHECKLIST

| Check | Evidence | Result |
|-------|----------|--------|
| No ~90s wait on market-data hang | Measured hang failures ~300–450 ms under test budgets; prod Yahoo **15s** / Tickstream **8s** | **PASS** |
| `marketFetchInFlight` clears on failure | `.catch` sets `marketFetchInFlight = null` (`lib/market-data.ts`); asserted in B/D/F/G | **PASS** |
| Next request can proceed | **F** hang then ok fetch returns 2 bars | **PASS** |
| No duplicate / storm fetches | **G** coalesced callers share one flight; ≤8 Yahoo calls (4 intervals × 1 flight) | **PASS** |
| Explicit WAIT / data-unavailable | `formatMarketDataWaitReply` + synthetic QUALITY_GATE; stream/chat map abort → WAIT (not raw abort text) | **PASS** |
| No stale data presented as current | Failure path does **not** write `marketCache`; only success `.then` caches | **PASS** |
| No LONG/SHORT without valid market state | Gate has `decisionEnvelope == null`; WAIT copy says `No LONG/SHORT`; timeout path does not invent envelope | **PASS** |

---

## CODE PATH SPOT-CHECK (read-only)

| File | Role | Status |
|------|------|--------|
| `lib/market-data-errors.ts` | Constants, classify/format, `MarketDataError` | Present; timeouts 15s / 8s |
| `lib/market-data.ts` | AbortController + race; clear inflight on catch | Present |
| `lib/tickstream/quote.ts` | AbortController + race on REST quote | Present |
| `lib/analysis-quality-gate.ts` | `marketDataFailureQualityGate()` — WAIT, no envelope | Present |
| `lib/chat-engine.ts` | Catch → warning + synthetic gate; 25s race → timeout error | Present |
| `app/api/chat/stream/route.ts` | Maps market-data failures to SSE WAIT / JSON `{ failureKind }` | Present (not re-edited this verify) |
| `scripts/test-market-data-timeout.ts` | A–G + MEASURE | All PASS |

---

## FALLBACK SUMMARY (unchanged from fix)

1. Yahoo OHLC timeout → `MARKET_DATA_TIMEOUT` → inflight cleared → synthetic QUALITY_GATE WAIT (no LONG/SHORT).  
2. Tickstream quote timeout → same kind mapping; WS stream path still 8s (unchanged).  
3. Yahoo timeout does **not** fall back to Tickstream for OHLC.  
4. Successful intel path: QUALITY_GATE / PIT / DecisionEnvelope unchanged.  
5. Failure kinds stay distinct: `MARKET_DATA_TIMEOUT` | `MARKET_DATA_UNAVAILABLE` | `REQUEST_ABORTED` | `USER_CANCELLED` | `INTERNAL_ERROR`.

---

## CODE CHANGE

**None.** Existing tests all passed; no trading logic / DecisionEnvelope / ICT / PIT edits; no shared-file conflicts introduced.

---

## VERDICT

**PASS** — timeout recovery is implemented and verified. Production bounds are Yahoo **15s** and Tickstream **8s**; measured hang recovery under test budgets is ~**300–450 ms**; inflight clears; retry works; WAIT is explicit; no directional call without market state.
