import { NextResponse } from "next/server";
import { fetchYahooLastPrice } from "@/lib/market-data";
import { isMnqChartPrice } from "@/lib/chart-live-price";
import { resolveQuoteInstrument, yahooSymbolForRoot } from "@/lib/nasdaq-symbol";
import { resolveTickstreamAuthoritativePrice } from "@/lib/tickstream/stream-snapshot";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

/** Fast last print for the extension bar — TickStream REST, then Yahoo. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const instrument = resolveQuoteInstrument(url.searchParams.get("symbol"));
    const tick = await resolveTickstreamAuthoritativePrice({ symbol: instrument });
    if (tick && isMnqChartPrice(tick.value)) {
      return NextResponse.json(
        {
          lastPrice: tick.value,
          source: tick.source,
          timestamp: tick.timestamp,
          symbol: instrument,
        },
        { headers: cors }
      );
    }

    const yahoo = await fetchYahooLastPrice(yahooSymbolForRoot(instrument));
    if (yahoo && isMnqChartPrice(yahoo.price)) {
      return NextResponse.json(
        {
          lastPrice: yahoo.price,
          source: yahoo.source,
          timestamp: yahoo.timestamp,
          symbol: instrument,
        },
        { headers: cors }
      );
    }

    return NextResponse.json(
      { error: "quote unavailable", lastPrice: null },
      { status: 503, headers: cors }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "quote failed";
    return NextResponse.json({ error: message, lastPrice: null }, { status: 500, headers: cors });
  }
}
