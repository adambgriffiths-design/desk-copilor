import type { Bar } from "../../types";
import type { ReplayMarketData } from "../replay/types";

/** Minimal deterministic dataset for fast backtest unit tests (~15 bars). */
export function buildTinyBacktestFixture(): ReplayMarketData & {
  id: string;
  label: string;
  sessionDate: string;
} {
  const base = new Date("2026-08-12T14:00:00.000Z");
  const m1: Bar[] = [];
  let price = 100;

  for (let i = 0; i < 15; i++) {
    const time = new Date(base.getTime() + i * 60_000);
    const open = price;
    const close = price + (i < 5 ? 0.5 : i === 5 ? 3 : -0.2);
    const high = Math.max(open, close) + (i === 8 ? 15 : 1);
    const low = Math.min(open, close) - (i === 8 ? 12 : 0.8);
    m1.push({ time, open, high, low, close });
    price = close;
  }

  m1[8] = {
    time: m1[8]!.time,
    open: 100,
    high: 115,
    low: 90,
    close: 105,
  };

  const daily: Bar[] = [
    {
      time: new Date("2026-08-11T00:00:00.000Z"),
      open: 95,
      high: 102,
      low: 94,
      close: 101,
    },
    {
      time: new Date("2026-08-12T00:00:00.000Z"),
      open: 101,
      high: 108,
      low: 99,
      close: 105,
    },
  ];

  return {
    id: "tiny-backtest",
    label: "Tiny backtest fixture",
    sessionDate: "2026-08-12",
    symbol: "TEST",
    daily,
    m15: m1.filter((_, i) => i % 5 === 0),
    m5: m1.filter((_, i) => i % 5 === 0),
    m1,
  };
}
