import type { BacktestSetupResult, BacktestStatistics } from "./types";

export function computeBacktestStatistics(setups: BacktestSetupResult[]): BacktestStatistics {
  const closed = setups.filter((s) => !["OPEN"].includes(s.outcome));
  const wins = setups.filter((s) => s.outcome === "WIN").length;
  const losses = setups.filter((s) => s.outcome === "LOSS").length;
  const ambiguous = setups.filter((s) => s.outcome === "AMBIGUOUS").length;
  const cancelled = setups.filter((s) => s.outcome === "CANCELLED").length;
  const expired = setups.filter((s) => s.outcome === "EXPIRED").length;
  const neutral = setups.filter((s) => s.outcome === "NEUTRAL").length;
  const open = setups.filter((s) => s.outcome === "OPEN").length;

  const decisive = wins + losses;
  const winRate = decisive > 0 ? wins / decisive : 0;

  const rValues = closed.map((s) => s.result_R);
  const avgR = rValues.length ? mean(rValues) : 0;
  const expectancy = avgR;

  const grossWin = setups.filter((s) => s.result_R > 0).reduce((a, s) => a + s.result_R, 0);
  const grossLoss = Math.abs(setups.filter((s) => s.result_R < 0).reduce((a, s) => a + s.result_R, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const maxDrawdownR = computeMaxDrawdownR(rValues);

  const withExcursion = setups.filter((s) => s.bars_held > 0 || s.MFE > 0 || s.MAE > 0);
  const avgMfe = withExcursion.length ? mean(withExcursion.map((s) => s.MFE)) : 0;
  const avgMae = withExcursion.length ? mean(withExcursion.map((s) => s.MAE)) : 0;
  const avgBarsHeld = closed.length ? mean(closed.map((s) => s.bars_held)) : 0;
  const avgTimeHeldMs = closed.length ? mean(closed.map((s) => s.time_held_ms)) : 0;

  const { maxWins, maxLosses } = consecutiveStreaks(
    setups.map((s) => s.outcome)
  );

  return {
    totalSetups: setups.length,
    wins,
    losses,
    ambiguous,
    cancelled,
    expired,
    neutral,
    open,
    winRate: round4(winRate),
    avgR: round4(avgR),
    expectancy: round4(expectancy),
    profitFactor: round4(Number.isFinite(profitFactor) ? profitFactor : grossWin),
    maxDrawdownR: round4(maxDrawdownR),
    avgMfe: round4(avgMfe),
    avgMae: round4(avgMae),
    avgBarsHeld: round4(avgBarsHeld),
    avgTimeHeldMs: round4(avgTimeHeldMs),
    maxConsecutiveWins: maxWins,
    maxConsecutiveLosses: maxLosses,
  };
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function computeMaxDrawdownR(rValues: number[]): number {
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const r of rValues) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }
  return maxDd;
}

function consecutiveStreaks(outcomes: BacktestSetupResult["outcome"][]): {
  maxWins: number;
  maxLosses: number;
} {
  let maxWins = 0;
  let maxLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  for (const o of outcomes) {
    if (o === "WIN") {
      curWins++;
      curLosses = 0;
      maxWins = Math.max(maxWins, curWins);
    } else if (o === "LOSS") {
      curLosses++;
      curWins = 0;
      maxLosses = Math.max(maxLosses, curLosses);
    } else {
      curWins = 0;
      curLosses = 0;
    }
  }
  return { maxWins, maxLosses };
}
