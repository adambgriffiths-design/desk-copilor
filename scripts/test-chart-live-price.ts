/**
 * Tick-aware market context — run: npx tsx scripts/test-chart-live-price.ts
 */
import {
  resolveLiveLastPrice,
  isMnqChartPrice,
  parseChartPriceInput,
} from "../lib/chart-live-price";
import { buildMarketContextAt } from "../lib/levels";
import type { Bar } from "../lib/types";

function bar(iso: string, o: number, h: number, l: number, c: number): Bar {
  return { time: new Date(iso), open: o, high: h, low: l, close: c };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// resolveLiveLastPrice unit checks
assert(
  resolveLiveLastPrice(25000, 25012.5, { source: "tradingview_live" }) === 25012.5,
  "prefers chart tick"
);
assert(resolveLiveLastPrice(25000, null) === 25000, "falls back to bar close");
assert(resolveLiveLastPrice(undefined, 15000) === 0, "rejects non-MNQ tick");
assert(isMnqChartPrice(25000), "MNQ range valid");

assert(parseChartPriceInput("30,185.00") === 30185, "comma thousands MNQ");
assert(parseChartPriceInput("MNQU2026 30,185.00") === 30185, "symbol+year before price");
assert(parseChartPriceInput("MNQU202630185.00") === 30185, "symbol glued to price");
assert(parseChartPriceInput("2026") === null, "contract year alone rejected");
assert(parseChartPriceInput("20263") === null, "year fragment rejected");
assert(parseChartPriceInput("20185") === 20185, "legacy 20k range still parses");
assert(parseChartPriceInput("30185.00") === 30185, "plain 30k tick");

// Bias stack should follow live tick, not stale 1m close
const asOf = new Date("2026-08-12T15:30:00-04:00");
const today = "2026-08-12";
const m1: Bar[] = [];
for (let m = 9; m <= 15; m++) {
  for (let min = 0; min < 60; min += 1) {
    const t = `${today}T${String(m).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-04:00`;
    m1.push(bar(t, 25045, 25055, 25040, 25050));
  }
}

const m15 = [bar(`${today}T09:00:00-04:00`, 25000, 25100, 24990, 25050)];
const m5 = m15;
const daily = [bar("2026-08-11T00:00:00-04:00", 24900, 25100, 24850, 25000)];

const data = { daily, m15, m5, m1, symbol: "MNQ=F" };
const stale = buildMarketContextAt(data, asOf);
const liveBull = buildMarketContextAt(data, asOf, undefined, 25065);
const liveBear = buildMarketContextAt(data, asOf, undefined, 25030);

assert(stale.daily.lastClose === 25050, "stale lastClose from 1m bar");
assert(liveBull.daily.lastClose === 25065, "live lastClose from chart tick");
assert(liveBear.daily.lastClose === 25030, "live bear lastClose");

assert(stale.timeframe15m.biasHint === "neutral", "stale m15 bias neutral at mid");
assert(liveBull.timeframe15m.biasHint === "bullish", "live tick shifts m15 bias bullish");
assert(liveBear.timeframe15m.biasHint === "bearish", "live tick shifts m15 bias bearish");

assert(
  stale.premiumDiscount?.vsCurrentDayRange !== liveBull.premiumDiscount?.vsCurrentDayRange ||
    stale.biasStack.tradeableBias !== liveBull.biasStack.tradeableBias,
  "premium/discount or bias stack reacts to live tick"
);

console.log("test-chart-live-price: all checks passed");
