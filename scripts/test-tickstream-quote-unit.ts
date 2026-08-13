/**
 * Offline unit tests for TickStream REST quote normalization & fetch mock.
 * Run: npm run test:tickstream-quote-unit
 */
import {
  fetchTickstreamQuote,
  normalizeQuoteResponse,
  QuoteApiError,
} from "../lib/tickstream/quote";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("=== normalizeQuoteResponse ===");

{
  const q = normalizeQuoteResponse(
    { symbol: "mnq", price: 21000.25, bid: 21000, ask: 21000.5, ts: 1_700_000_000 },
    () => 1_700_000_010
  );
  assert(q.symbol === "MNQ", "symbol uppercased");
  assert(q.price === 21000.25 && q.bid === 21000 && q.ask === 21000.5, "price bid ask preserved");
  assert(q.lagSec === 10, "lagSec computed from nowSec");
  assert(q.source === "tickstream_quote", "source tag set");
  assert(q.exchangeTimestampIso === "2023-11-14T22:13:20.000Z", "exchangeTimestampIso from ts");
}

{
  let threw = false;
  try {
    normalizeQuoteResponse({ symbol: "MNQ", price: NaN, ts: 100 });
  } catch (e) {
    threw = e instanceof QuoteApiError;
  }
  assert(threw, "invalid price rejected");
}

console.log("\n=== fetchTickstreamQuote (mocked fetch) ===");

async function runFetchTests() {
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    assert(url.includes("/quote?symbol=MNQ"), "requests MNQ quote URL");
    assert(
      (init?.headers as Record<string, string>)?.Authorization === "Bearer test-key",
      "sends Bearer auth"
    );
    return new Response(
      JSON.stringify({
        symbol: "MNQ",
        price: 24901.5,
        bid: 24901.25,
        ask: 24901.75,
        ts: 1_700_000_000,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const quote = await fetchTickstreamQuote({
    apiKey: "test-key",
    symbol: "MNQ",
    baseUrl: "https://api.example.test/v1",
    fetchFn: mockFetch,
    nowSec: () => 1_700_000_005,
  });
  assert(quote.price === 24901.5 && quote.lagSec === 5, "mock fetch returns normalized quote");

  const errFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ error: { message: "unauthorized" } }), { status: 401 });

  let httpErr = false;
  try {
    await fetchTickstreamQuote({
      apiKey: "test-key",
      fetchFn: errFetch,
    });
  } catch (e) {
    httpErr = e instanceof QuoteApiError && e.status === 401;
  }
  assert(httpErr, "HTTP error throws QuoteApiError");
}

runFetchTests()
  .then(() => {
    console.log(`\n=== ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
