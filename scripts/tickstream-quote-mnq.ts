/**
 * TickStream MNQ REST quote POC — run: npm run tickstream:quote
 *
 * Requires TICKSTREAM_API_KEY in environment or .env.local (never logged or printed).
 */
import {
  fetchTickstreamQuote,
  loadTickstreamApiKey,
  QuoteApiError,
} from "../lib/tickstream/quote";

const apiKey = loadTickstreamApiKey();
if (!apiKey) {
  console.error(
    "TICKSTREAM_API_KEY is required. Set it in your environment or .env.local before running this script."
  );
  process.exit(1);
}

function safeErrorMessage(err: unknown): string {
  const msg =
    err instanceof QuoteApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  if (msg.includes(apiKey)) {
    return "tickstream quote failed (details suppressed — may contain key)";
  }
  return msg;
}

async function main() {
  const t0 = Date.now();
  const quote = await fetchTickstreamQuote({ apiKey, symbol: "MNQ" });
  const latencyMs = Date.now() - t0;
  console.log(JSON.stringify(quote));
  console.error(`latencyMs=${latencyMs}`);
}

main().catch((err) => {
  console.error(safeErrorMessage(err));
  process.exit(1);
});
