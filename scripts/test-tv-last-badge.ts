/**
 * TV Last badge + tick-mode overwrite policy.
 * Run: npx tsx scripts/test-tv-last-badge.ts
 */
import { classifyNasdaqRoot } from "../lib/nasdaq-symbol";
import { parseChartPriceInput } from "../lib/chart-live-price";
import {
  isBarCountdownLeaf,
  parseTvAxisLastBadge,
  resolveMarketHeaderStatus,
  resolveMinuteModeDisplay,
  resolveTickModeDisplay,
  MINUTE_LIVE_MAX_AGE_MS,
  TICK_LIVE_MAX_AGE_MS,
  TICK_STALE_MAX_AGE_MS,
} from "../lib/tv-last-badge";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(classifyNasdaqRoot("CME_MINI:MNQ1!") === "MNQ", "continuous MNQ1! is MNQ");
assert(classifyNasdaqRoot("MNQU2026") === "MNQ", "front-month MNQU2026 is MNQ not NQ");
assert(classifyNasdaqRoot("NQ1!") === "NQ", "NQ1! is NQ");
assert(classifyNasdaqRoot("MNQ1!") === "MNQ", "MNQ1! checked before NQ");
assert(parseTvAxisLastBadge("20,188.00 00:33") === 20188, "screenshot-style last + 00:33");
assert(parseTvAxisLastBadge("20,188 00:33") === 20188, "whole-number last before countdown");
assert(parseTvAxisLastBadge("20,188.00 00\u223633") === 20188, "unicode ratio colon 00∶33");
assert(parseTvAxisLastBadge("MNQU2026 30,179.25 00:16") === 30179.25, "MNQU2026 prefix is not price");
assert(parseTvAxisLastBadge("MNQU202630,179.2500:16") === 30179.25, "glued contract+last+timer");
assert(
  parseTvAxisLastBadge("30,206.50 High 30,150.00 30,179.25 00:16") === 30179.25,
  "last-before-countdown, not first comma-price"
);
assert(parseTvAxisLastBadge("30179.25 00:16") === 30179.25, "no-comma last before countdown");
assert(parseTvAxisLastBadge("30,179.25 04:59") === 30179.25, "5m remaining still last");
assert(parseTvAxisLastBadge("30,179.25 08:14") === null, "clock 08:14 is not bar remaining");
assert(parseTvAxisLastBadge("30,206.50 08:14") === null, "scale+clock must not parse as last");
assert(parseTvAxisLastBadge("30,179.25 0:16") === null, "unpadded 0:16 not guessed without live innerText");
assert(parseTvAxisLastBadge("30,179.25") === null, "price without countdown is not the last box");
assert(parseTvAxisLastBadge("00:16") === null, "timer alone is not a price");

assert(
  parseChartPriceInput("30,206.50 High 30,179.25 00:16") === 30206.5,
  "first-comma scrape (the bug tick mode must not use)"
);

assert(isBarCountdownLeaf("00:16") === true, "1m leaf timer");
assert(isBarCountdownLeaf("00\u223616") === true, "unicode colon leaf timer");
assert(isBarCountdownLeaf("04:01") === true, "5m leaf timer");
assert(isBarCountdownLeaf("08:14") === false, "clock leaf rejected");
assert(isBarCountdownLeaf("15:00") === false, "session clock rejected");
assert(isBarCountdownLeaf("30,179.25 00:16") === false, "combined text is not a leaf");

const now = 1_000_000;
const lastTick = { value: 30179.25, source: "tradingview_live", timestamp: now - 3 };
const scrape = 30206.5;

const live = resolveTickModeDisplay({ lastTick, isolatedScrape: scrape, now });
assert(live.value === 30179.25, "tick mode ignores isolated first-comma scrape");
assert(live.dataStatus === "LIVE", "fresh tick is LIVE");
assert(live.ageMs === 3, "freshness is tick timestamp, not Date.now() restamp");
assert(live.freshnessTs === lastTick.timestamp, "do not restamp freshness");

const stale = resolveTickModeDisplay({
  lastTick: { ...lastTick, timestamp: now - 5000 },
  isolatedScrape: scrape,
  now,
});
assert(stale.value === 30179.25, "stale tick still shows last, not scrape");
assert(stale.dataStatus === "STALE", "age > 2s is STALE not LIVE");
assert(stale.ageMs === 5000, "stale age from tick ts");

const dead = resolveTickModeDisplay({
  lastTick: { ...lastTick, timestamp: now - TICK_STALE_MAX_AGE_MS - 1 },
  isolatedScrape: scrape,
  now,
});
assert(dead.value === null, "expired tick is unavailable, not scrape");
assert(dead.dataStatus === "UNAVAILABLE", "expired tick unavailable");

const empty = resolveTickModeDisplay({ lastTick: null, isolatedScrape: scrape, now });
assert(empty.value === null, "no tick + first-comma scrape still unavailable");
assert(empty.dataStatus === "UNAVAILABLE", "scrape must not fill the bar");

const recovered = resolveTickModeDisplay({
  lastTick: null,
  isolatedScrape: scrape,
  axisBadge: { value: 20188, source: "tradingview_live", timestamp: now - 10 },
  now,
});
assert(recovered.value === 20188, "axis Last-badge recovers when ticks miss");
assert(recovered.dataStatus === "LIVE", "fresh axis badge is LIVE");
assert(recovered.source === "tradingview_live", "recovery is TV Last not backend");

assert(TICK_LIVE_MAX_AGE_MS === 2000, "live window");
assert(TICK_STALE_MAX_AGE_MS === 60_000, "stale window");
assert(MINUTE_LIVE_MAX_AGE_MS === 90_000, "1m live window is the forming minute plus buffer");

const minuteOk = resolveMinuteModeDisplay({
  lastClose: { value: 30211.25, source: "tv_1m_close", timestamp: now - 15_000 },
  now,
});
assert(minuteOk.dataStatus === "LIVE", "fresh previous 1m close is LIVE not DELAYED/STALE");
assert(minuteOk.value === 30211.25, "1m mode keeps completed close");

const minuteHeld = resolveMinuteModeDisplay({
  lastClose: { value: 30211.25, source: "tv_1m_close", timestamp: now - 59_000 },
  now,
});
assert(minuteHeld.dataStatus === "LIVE", "close held during the forming minute stays LIVE");
assert(minuteHeld.value === 30211.25, "forming-minute hold is still the completed close");

const minuteOld = resolveMinuteModeDisplay({
  lastClose: { value: 30211.25, source: "tv_1m_close", timestamp: now - 91_000 },
  now,
});
assert(minuteOld.dataStatus === "STALE", "no new completed bar for well over a minute is STALE");
assert(minuteOld.value === 30211.25, "stale 1m still shows the last completed close");

const minuteYahoo = resolveMinuteModeDisplay({
  lastClose: { value: 30226, source: "tradingview_live", timestamp: now - 100 },
  yahooOrBackend: { value: 30100, source: "yahoo_bar_close", timestamp: now - 400 },
  now,
});
assert(minuteYahoo.dataStatus === "STALE", "Yahoo is STALE, not a 1m close");
assert(minuteYahoo.value === 30100, "live Last must not substitute for 1m close");

const minuteEmpty = resolveMinuteModeDisplay({ lastClose: null, now });
assert(minuteEmpty.dataStatus === "UNAVAILABLE", "no completed close is unavailable");
assert(minuteEmpty.value === null, "do not keep cached Last as 1m close");

const headerMinute = resolveMarketHeaderStatus({
  mode: "minute",
  dataStatus: "LIVE",
  hasPrice: true,
});
assert(headerMinute === "LIVE", "MARKET header in 1m mode is LIVE when the close is current");

const headerMinuteLegacy = resolveMarketHeaderStatus({
  mode: "minute",
  dataStatus: "DELAYED",
  hasPrice: true,
});
assert(headerMinuteLegacy === "LIVE", "legacy DELAYED 1m happy path maps to LIVE");

const headerMinuteBug = resolveMarketHeaderStatus({
  mode: "minute",
  dataStatus: "LIVE",
  hasPrice: true,
});
assert(headerMinuteBug === "LIVE", "1m + hasPrice must not map to STALE via tvLive=false");

const headerMinuteStale = resolveMarketHeaderStatus({
  mode: "minute",
  dataStatus: "STALE",
  hasPrice: true,
});
assert(headerMinuteStale === "STALE", "old 1m close is MARKET STALE");

const headerTickLive = resolveMarketHeaderStatus({
  mode: "tick",
  dataStatus: "LIVE",
  hasPrice: true,
});
assert(headerTickLive === "LIVE", "tick LIVE is MARKET LIVE");

const headerTickStale = resolveMarketHeaderStatus({
  mode: "tick",
  dataStatus: "STALE",
  hasPrice: true,
});
assert(headerTickStale === "STALE", "tick STALE is MARKET STALE");

const headerTickGone = resolveMarketHeaderStatus({
  mode: "tick",
  dataStatus: "UNAVAILABLE",
  hasPrice: false,
});
assert(headerTickGone === "UNAVAILABLE", "no Last is UNAVAILABLE not cached STALE");

console.log("test-tv-last-badge: all checks passed");
