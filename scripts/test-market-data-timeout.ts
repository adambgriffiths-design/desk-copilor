/**
 * Focused regression: Yahoo / Tickstream AbortSignal timeouts (A–G).
 * Run: npx tsx scripts/test-market-data-timeout.ts
 */
import {
  fetchBars,
  fetchAllTimeframesCached,
  resetYahooMarketCacheForTests,
  setYahooFetchForTests,
  setYahooFetchTimeoutForTests,
  isYahooMarketFetchInFlightForTests,
  YAHOO_FETCH_TIMEOUT_MS,
} from "../lib/market-data";
import {
  fetchTickstreamQuote,
  TICKSTREAM_QUOTE_TIMEOUT_MS,
} from "../lib/tickstream/quote";
import {
  MarketDataError,
  classifyMarketDataFailure,
  formatMarketDataWaitReply,
  mapFetchAbortToMarketDataError,
} from "../lib/market-data-errors";
import { marketDataFailureQualityGate } from "../lib/analysis-quality-gate";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function hangFetch(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return; // hang forever if no signal (BEFORE baseline)
    const onAbort = () => {
      const err = new DOMException(
        signal.reason instanceof Error
          ? signal.reason.message || "The operation was aborted due to timeout"
          : "The operation was aborted due to timeout",
        "TimeoutError"
      );
      reject(err);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function okYahooFetch(_url: string | URL | Request): Promise<Response> {
  const nowSec = Math.floor(Date.now() / 1000);
  const body = {
    chart: {
      result: [
        {
          meta: { regularMarketPrice: 25000, regularMarketTime: nowSec },
          timestamp: [nowSec - 60, nowSec],
          indicators: {
            quote: [
              {
                open: [24990, 24995],
                high: [25010, 25005],
                low: [24980, 24990],
                close: [24995, 25000],
              },
            ],
          },
        },
      ],
    },
  };
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

let passed = 0;
function pass(name: string) {
  passed += 1;
  console.log(`PASS ${name}`);
}

async function testA_yahooNormal() {
  resetYahooMarketCacheForTests();
  setYahooFetchForTests(okYahooFetch as typeof fetch);
  const bars = await fetchBars("1m", "1d", { timeoutMs: 2_000 });
  assert(bars.length === 2, "expected 2 bars");
  assert(bars[1].close === 25000, "close");
  assert(!isYahooMarketFetchInFlightForTests(), "inflight cleared after success");
  pass("A Yahoo responds normally");
}

async function testB_yahooHang() {
  resetYahooMarketCacheForTests();
  setYahooFetchForTests(hangFetch as typeof fetch);
  const budgetMs = 400;
  const t0 = Date.now();
  let err: unknown;
  try {
    await fetchBars("1m", "1d", { timeoutMs: budgetMs });
  } catch (e) {
    err = e;
  }
  const elapsed = Date.now() - t0;
  assert(err instanceof MarketDataError, "MarketDataError");
  assert(err.kind === "MARKET_DATA_TIMEOUT", `kind=${(err as MarketDataError).kind}`);
  assert(!/This operation was aborted$/i.test(err.message), "no bare abort text");
  assert(elapsed < budgetMs + 800, `elapsed ${elapsed}ms should be near ${budgetMs}ms`);
  assert(elapsed >= budgetMs - 50, `elapsed ${elapsed}ms should reach timeout`);
  assert(!isYahooMarketFetchInFlightForTests(), "inflight cleared after timeout");
  pass(`B Yahoo hang → timeout in ${elapsed}ms (budget ${budgetMs}ms)`);
}

async function testC_tickstreamHang() {
  const budgetMs = 300;
  const t0 = Date.now();
  let err: unknown;
  try {
    await fetchTickstreamQuote({
      apiKey: "test-key",
      timeoutMs: budgetMs,
      fetchFn: hangFetch as typeof fetch,
    });
  } catch (e) {
    err = e;
  }
  const elapsed = Date.now() - t0;
  assert(err instanceof MarketDataError, "MarketDataError");
  assert((err as MarketDataError).kind === "MARKET_DATA_TIMEOUT", "timeout kind");
  assert(elapsed < budgetMs + 800, `elapsed ${elapsed}`);
  pass(`C Tickstream hang → timeout in ${elapsed}ms`);
}

async function testD_yahooTimeoutTickstreamAvailable() {
  // No OHLC fallback from Tickstream exists — Yahoo timeout must still be WAIT,
  // even if Tickstream quote would succeed.
  resetYahooMarketCacheForTests();
  setYahooFetchTimeoutForTests(300);
  setYahooFetchForTests(hangFetch as typeof fetch);
  let yahooErr: unknown;
  try {
    await fetchAllTimeframesCached(true);
  } catch (e) {
    yahooErr = e;
  }
  assert(yahooErr instanceof MarketDataError, "yahoo MarketDataError");
  assert((yahooErr as MarketDataError).kind === "MARKET_DATA_TIMEOUT", "yahoo timeout");
  assert(!isYahooMarketFetchInFlightForTests(), "inflight clear");

  const quote = await fetchTickstreamQuote({
    apiKey: "k",
    timeoutMs: 1_000,
    fetchFn: (async () =>
      new Response(
        JSON.stringify({ symbol: "MNQ", price: 25000, bid: 24999, ask: 25001, ts: Date.now() / 1000 }),
        { status: 200 }
      )) as typeof fetch,
  });
  assert(quote.price === 25000, "tickstream still works");
  const wait = formatMarketDataWaitReply("MARKET_DATA_TIMEOUT");
  assert(/\bWAIT\b/.test(wait) && !/\bLONG\b|\bSHORT\b/.test(wait.replace(/No LONG\/SHORT/, "")), "WAIT only");
  pass("D Yahoo timeout; Tickstream available does not invent OHLC decision");
}

async function testE_allUnavailableWait() {
  const gate = marketDataFailureQualityGate("MARKET_DATA_UNAVAILABLE");
  assert(gate.canDeliverVerdict === false, "no verdict");
  assert(gate.dataQuality === "INSUFFICIENT", "insufficient");
  assert(gate.decisionEnvelope == null, "no invented envelope");
  assert(/WAIT/.test(gate.waitReason || ""), "wait reason");
  assert(!/\b(LONG|SHORT)\b/.test((gate.waitReason || "").replace(/No LONG\/SHORT/g, "")), "no directional call");

  const mapped = mapFetchAbortToMarketDataError(
    new DOMException("This operation was aborted due to timeout", "TimeoutError"),
    "yahoo"
  );
  assert(mapped.kind === "MARKET_DATA_TIMEOUT", "timeout map");
  assert(classifyMarketDataFailure(mapped) === "MARKET_DATA_TIMEOUT", "classify");
  assert(
    classifyMarketDataFailure(new DOMException("This operation was aborted", "AbortError")) ===
      "REQUEST_ABORTED",
    "abort ≠ timeout"
  );
  assert(classifyMarketDataFailure(new Error("USER_CANCELLED")) === "USER_CANCELLED", "user cancel");
  assert(
    classifyMarketDataFailure(new Error("Yahoo Finance error: 503")) === "MARKET_DATA_UNAVAILABLE",
    "unavailable"
  );
  pass("E All unavailable → explicit WAIT; kinds distinguished");
}

async function testF_timeoutThenNewRequest() {
  resetYahooMarketCacheForTests();
  setYahooFetchForTests(hangFetch as typeof fetch);
  try {
    await fetchBars("1m", "1d", { timeoutMs: 250 });
  } catch {
    /* expected */
  }
  assert(!isYahooMarketFetchInFlightForTests(), "cleared after hang");

  setYahooFetchForTests(okYahooFetch as typeof fetch);
  const bars = await fetchBars("1m", "1d", { timeoutMs: 2_000 });
  assert(bars.length === 2, "new request succeeds");
  assert(!isYahooMarketFetchInFlightForTests(), "cleared after success");
  pass("F Timeout then new request allowed (no poisoned inflight)");
}

async function testG_noFetchStorm() {
  resetYahooMarketCacheForTests();
  setYahooFetchTimeoutForTests(350);
  let calls = 0;
  setYahooFetchForTests(((url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    return hangFetch(url, init);
  }) as typeof fetch);

  const p1 = fetchAllTimeframesCached(true).catch((e) => e);
  // Coalesce second caller onto the same inflight promise
  await new Promise((r) => setTimeout(r, 20));
  const p2 = fetchAllTimeframesCached(false).catch((e) => e);
  const [e1, e2] = await Promise.all([p1, p2]);
  assert(e1 instanceof MarketDataError && e1.kind === "MARKET_DATA_TIMEOUT", "p1 timeout");
  assert(e2 instanceof MarketDataError && e2.kind === "MARKET_DATA_TIMEOUT", "p2 timeout");
  // 4 intervals × 1 coalesced flight
  assert(calls <= 8, `expected ≤8 Yahoo calls for one coalesced flight, got ${calls}`);
  assert(!isYahooMarketFetchInFlightForTests(), "inflight cleared");

  // Retry after timeout: one new flight only
  calls = 0;
  const p3 = fetchAllTimeframesCached(true).catch((e) => e);
  await new Promise((r) => setTimeout(r, 15));
  const p4 = fetchAllTimeframesCached(false).catch((e) => e);
  await Promise.all([p3, p4]);
  assert(calls <= 8, `retry storm check calls=${calls}`);
  assert(!isYahooMarketFetchInFlightForTests(), "cleared after retry");
  pass(`G Coalesce + retry after timeout (calls per flight ≤8, measured)`);
}

async function measureBeforeAfter() {
  // BEFORE: hang without AbortSignal → would wait indefinitely (simulate short race ceiling).
  const beforeBudget = 2_000;
  const tBefore = Date.now();
  let releaseHang: (() => void) | undefined;
  const orphanHang = new Promise<void>((resolve) => {
    releaseHang = resolve;
  });
  await Promise.race([
    orphanHang,
    new Promise<void>((r) => setTimeout(r, beforeBudget)),
  ]);
  releaseHang?.();
  const beforeMs = Date.now() - tBefore;

  // AFTER: hang with Yahoo timeout mapping
  resetYahooMarketCacheForTests();
  setYahooFetchForTests(hangFetch as typeof fetch);
  const afterBudget = 300;
  const tAfter = Date.now();
  try {
    await fetchBars("1m", "1d", { timeoutMs: afterBudget });
  } catch {
    /* expected */
  }
  const afterMs = Date.now() - tAfter;
  console.log(
    `MEASURE before hang-without-signal race=${beforeMs}ms | after deterministic timeout=${afterMs}ms (budget ${afterBudget}ms)`
  );
  assert(afterMs < beforeMs, "after fails faster than unbounded hang race");
  assert(afterMs < afterBudget + 800, "after within bound");
  pass("MEASURE before/after time-to-failure");
}

async function main() {
  console.log("=== market-data timeout A–G ===");
  console.log(
    `TIMEOUT VALUES: YAHOO_FETCH_TIMEOUT_MS=${YAHOO_FETCH_TIMEOUT_MS} TICKSTREAM_QUOTE_TIMEOUT_MS=${TICKSTREAM_QUOTE_TIMEOUT_MS}`
  );
  try {
    await testA_yahooNormal();
    await testB_yahooHang();
    await testC_tickstreamHang();
    await testD_yahooTimeoutTickstreamAvailable();
    await testE_allUnavailableWait();
    await testF_timeoutThenNewRequest();
    await testG_noFetchStorm();
    await measureBeforeAfter();
  } finally {
    setYahooFetchTimeoutForTests(null);
    setYahooFetchForTests(null);
    resetYahooMarketCacheForTests();
  }
  console.log(`\n${passed} passed`);
  // AbortController losers / coalesced hang mocks can leave microtasks; exit explicitly.
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL", err);
  setYahooFetchTimeoutForTests(null);
  setYahooFetchForTests(null);
  resetYahooMarketCacheForTests();
  process.exit(1);
});
