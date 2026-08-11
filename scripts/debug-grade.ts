import { fetchAllTimeframesForBacktest } from "../lib/market-data";
import {
  discoverNyAmMoments,
  getForwardWindow,
  gradeFromThesisEvents,
} from "../lib/backtest";
import { buildMarketContextAt } from "../lib/levels";
import { sliceBarsAt } from "../lib/market-data";

async function main() {
  const data = await fetchAllTimeframesForBacktest();
  const m = discoverNyAmMoments(data.m1).find(
    (x) => x.chartTimeEst === "09:35" && x.dateKey === "2026-08-04"
  );
  if (!m) {
    console.log("moment not found");
    return;
  }
  const m1At = sliceBarsAt(data.m1, m.asOf);
  const ctx = buildMarketContextAt(data, m.asOf, m.chartTimeEst);
  const { bars: forward } = getForwardWindow(data.m1, m.bar, m.dateKey);
  const g = gradeFromThesisEvents("", "buy", m.bar.close, forward, m1At.slice(-25), ctx);
  console.log(JSON.stringify(g, null, 2));
}

main().catch(console.error);
