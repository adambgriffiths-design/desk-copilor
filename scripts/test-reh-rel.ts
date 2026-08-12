/**
 * REH/REL observation-engine regression — run: npm run test:reh-rel
 */
import { detectRehRel, describeRehRelTolerance, findConfirmedSwings } from "../lib/reh-rel";
import { rehRelTolerance } from "../lib/structure";
import type { ChartCandle } from "../lib/chart-snapshot";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const mk = (t: number, o: number, h: number, l: number, c: number): ChartCandle => ({
  t,
  o,
  h,
  l,
  c,
});

function padPriceContext(bars: ChartCandle[], price: number): ChartCandle[] {
  const lastT = bars.at(-1)!.t + 60;
  return [...bars, mk(lastT, price, price + 1, price - 1, price)];
}

/** Build confirmed 3-bar swing highs at exact prices. */
function swingHighBars(highs: number[], baseT = 1_700_000_000): ChartCandle[] {
  const bars: ChartCandle[] = [];
  let t = baseT;
  for (const peak of highs) {
    bars.push(mk(t, peak - 10, peak - 3, peak - 12, peak - 8));
    t += 60;
    bars.push(mk(t, peak - 8, peak, peak - 10, peak - 4));
    t += 60;
    bars.push(mk(t, peak - 4, peak - 3, peak - 12, peak - 9));
    t += 60;
  }
  const last = highs[highs.length - 1];
  bars.push(mk(t, last - 20, last - 18, last - 22, last - 20));
  return bars;
}

/** Build confirmed 3-bar swing lows at exact prices. */
function swingLowBars(lows: number[], baseT = 1_700_100_000): ChartCandle[] {
  const bars: ChartCandle[] = [];
  let t = baseT;
  for (const trough of lows) {
    bars.push(mk(t, trough + 10, trough + 14, trough + 3, trough + 8));
    t += 60;
    bars.push(mk(t, trough + 8, trough + 12, trough, trough + 4));
    t += 60;
    bars.push(mk(t, trough + 4, trough + 14, trough + 3, trough + 10));
    t += 60;
  }
  const last = lows[lows.length - 1];
  bars.push(mk(t, last + 10, last + 14, last + 8, last + 12));
  return bars;
}

// --- tolerance documentation ---
const tol29807 = describeRehRelTolerance(29807.25);
assert(tol29807.formula === "max(2, min(4, referencePrice × 0.001))", "tolerance formula documented");
assert(tol29807.tolerance === 4, "29807 tolerance is 4 pts");
assert(
  Math.abs(29887.0 - 29886.25) <= rehRelTolerance((29887.0 + 29886.25) / 2),
  "user example highs 29887/29886.25 within tolerance"
);

// 1. Two equal-ish highs above price → REH ✓
{
  const currentPrice = 29807.25;
  const candles = swingHighBars([29887.0, 29886.25]);
  const result = detectRehRel({ candles, currentPrice });
  assert(result.status === "known", "REH test: status known");
  assert(result.nearest_reh_above != null, "REH detected from two equal-ish highs");
  assert(result.nearest_reh_above!.type === "reh", "type is reh");
  assert(result.nearest_reh_above!.sourceSwingPrices.length >= 2, "REH has ≥2 source swings");
  assert(result.nearest_reh_above!.level >= currentPrice + 0.25, "REH above current price");
  assert(result.nearest_reh_above!.level === 29887, "REH level is max high");
}

// 2. Two equal-ish lows below price → REL ✓
{
  const currentPrice = 29807.25;
  const candles = swingLowBars([29764.25, 29763.75]);
  const result = detectRehRel({ candles, currentPrice });
  assert(result.nearest_rel_below != null, "REL detected from two equal-ish lows");
  assert(result.nearest_rel_below!.type === "rel", "type is rel");
  assert(result.nearest_rel_below!.sourceSwingPrices.length >= 2, "REL has ≥2 source swings");
  assert(result.nearest_rel_below!.level <= currentPrice - 0.25, "REL below current price");
  assert(result.nearest_rel_below!.level === 29763.75, "REL level is min low");
}

// 3. One high only → NOT REH
{
  const currentPrice = 20990;
  const candles = swingHighBars([21000]);
  const result = detectRehRel({ candles, currentPrice });
  assert(result.reh_levels.length === 0, "single high is NOT REH");
  assert(result.nearest_reh_above == null, "no nearest REH for single swing");
}

// 4. One low only → NOT REL
{
  const currentPrice = 20990;
  const candles = swingLowBars([20978]);
  const result = detectRehRel({ candles, currentPrice });
  assert(result.rel_levels.length === 0, "single low is NOT REL");
  assert(result.nearest_rel_below == null, "no nearest REL for single swing");
}

// 5. Highs too far apart → NOT REH
{
  const currentPrice = 20990;
  const candles = swingHighBars([21000, 21010]);
  const result = detectRehRel({ candles, currentPrice });
  assert(result.reh_levels.length === 0, "highs 10 pts apart are NOT REH");
}

// 6. Lows too far apart → NOT REL
{
  const currentPrice = 20990;
  const candles = swingLowBars([20978, 20968]);
  const result = detectRehRel({ candles, currentPrice });
  assert(result.rel_levels.length === 0, "lows 10 pts apart are NOT REL");
}

// 7. Price above old REH → state transition (swept)
{
  const rehLevel = 21000;
  const candles = swingHighBars([rehLevel, rehLevel - 0.5]);
  const last = candles.at(-1)!;
  candles[candles.length - 1] = { ...last, c: rehLevel + 2, h: rehLevel + 2 };
  const currentPrice = rehLevel + 2;
  const result = detectRehRel({ candles, currentPrice });
  const swept = result.all_levels.find((l) => l.type === "reh");
  assert(swept != null, "REH pool still present after cross");
  assert(swept!.status === "swept", "REH reclassified swept when price above");
  assert(result.nearest_reh_above == null, "swept REH not in active nearest");
}

// 8. Price below old REL → state transition (swept)
{
  const relLevel = 20978;
  const candles = swingLowBars([relLevel, relLevel + 0.5]);
  const last = candles.at(-1)!;
  candles[candles.length - 1] = { ...last, c: relLevel - 2, l: relLevel - 2 };
  const currentPrice = relLevel - 2;
  const result = detectRehRel({ candles, currentPrice });
  const swept = result.all_levels.find((l) => l.type === "rel");
  assert(swept != null, "REL pool still present after cross");
  assert(swept!.status === "swept", "REL reclassified swept when price below");
  assert(result.nearest_rel_below == null, "swept REL not in active nearest");
}

// 9. Multiple REHs → nearest ranked first
{
  const currentPrice = 20990;
  const nearHighs = [21005, 21005.5];
  const farHighs = [21020, 21020.5];
  const candles = padPriceContext(
    [...swingHighBars(nearHighs, 1_700_200_000), ...swingHighBars(farHighs, 1_700_300_000)],
    currentPrice
  );
  const result = detectRehRel({ candles, currentPrice });
  assert(result.reh_levels.length >= 2, "multiple REH pools detected");
  assert(
    result.reh_levels[0].distanceFromCurrentPrice <= result.reh_levels[1].distanceFromCurrentPrice,
    "REH levels ranked nearest first"
  );
  assert(result.nearest_reh_above!.level <= 21006, "nearest REH is the closer pool");
}

// 10. Multiple RELs → nearest ranked first
{
  const currentPrice = 20990;
  const nearLows = [20985, 20984.75];
  const farLows = [20970, 20969.75];
  const candles = padPriceContext(
    [...swingLowBars(nearLows, 1_700_400_000), ...swingLowBars(farLows, 1_700_500_000)],
    currentPrice
  );
  const result = detectRehRel({ candles, currentPrice });
  assert(result.rel_levels.length >= 2, "multiple REL pools detected");
  assert(
    result.rel_levels[0].distanceFromCurrentPrice <= result.rel_levels[1].distanceFromCurrentPrice,
    "REL levels ranked nearest first"
  );
  assert(result.nearest_rel_below!.level >= 20984, "nearest REL is the closer pool");
}

// Swing confirmation uses 3-bar pattern
{
  const candles = swingHighBars([21000, 20999]);
  const swings = findConfirmedSwings(candles);
  assert(swings.filter((s) => s.type === "high").length >= 2, "3-bar swing highs confirmed");
}

console.log("test-reh-rel: ok (10 cases)");
