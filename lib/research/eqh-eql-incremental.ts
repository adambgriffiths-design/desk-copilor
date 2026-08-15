/**
 * Incremental EQH/EQL updates on top of lib/research/eqh-eql-liquidity.ts.
 * Production detectRelativeEqualPools / reh-rel.ts are not used here.
 *
 * New confirmed swing → rebuild candidates (full detect, same algorithm).
 * Same bar / no new swing → reuse pools unless the last bar can sweep/touch an area.
 * Never ranks by proximity. Never uses bars after asOfIndex.
 */
import type { Bar } from "../types";
import {
  detectEqhEqlLiquidity,
  type EqhEqlConfig,
  type EqhEqlLiquidity,
  type LiquidityArea,
} from "./eqh-eql-liquidity";

export type EqhEqlUpdateMode = "rebuild" | "reuse";

export type EqhEqlIncrementalResult = {
  liquidity: EqhEqlLiquidity;
  mode: EqhEqlUpdateMode;
  newSwingConfirmed: boolean;
};

function areaCouldInteract(bar: Bar, areas: LiquidityArea[]): boolean {
  for (const a of areas) {
    if (a.type === "BUY_SIDE") {
      if (bar.high + 1e-9 >= a.priceLow) return true;
      if (bar.close > a.representativeLevel + 1e-9) return true;
    } else {
      if (bar.low - 1e-9 <= a.priceHigh) return true;
      if (bar.close < a.representativeLevel - 1e-9) return true;
    }
  }
  return false;
}

/** True when a pending swing's confirmation bar is now in the series. */
export function pendingSwingConfirmsAt(
  prev: EqhEqlLiquidity | null,
  asOfIndex: number
): boolean {
  if (!prev?.pendingSwings.length) return false;
  return prev.pendingSwings.some((p) => p.confirmAtBarIndex === asOfIndex);
}

export function eqhEqlNeedsRebuild(input: {
  prev: EqhEqlLiquidity | null;
  bars: Bar[];
  asOfIndex: number;
  prevBarCount: number;
  lastBar?: Bar;
}): boolean {
  if (!input.prev || input.prev.status !== "known") return true;
  if (input.asOfIndex < 0) return true;
  if (input.asOfIndex + 1 < input.prevBarCount) return true;
  if (pendingSwingConfirmsAt(input.prev, input.asOfIndex)) return true;
  if (input.lastBar && areaCouldInteract(input.lastBar, input.prev.areas)) return true;
  return false;
}

/**
 * Incremental wrapper — identical to detectEqhEqlLiquidity when it rebuilds.
 * Reuse is only allowed when no new swing confirmed and last bar cannot
 * touch/sweep existing BUY_SIDE/SELL_SIDE areas (including close-through).
 */
export function updateEqhEqlLiquidity(
  prev: EqhEqlLiquidity | null,
  bars: Bar[],
  config: EqhEqlConfig = {},
  prevBarCount?: number
): EqhEqlIncrementalResult {
  const asOfIndex = Math.min(config.asOfIndex ?? bars.length - 1, bars.length - 1);
  const newSwingConfirmed = pendingSwingConfirmsAt(prev, asOfIndex);
  const lastBar = asOfIndex >= 0 ? bars[asOfIndex] : undefined;
  const needs = eqhEqlNeedsRebuild({
    prev,
    bars,
    asOfIndex,
    prevBarCount: prevBarCount ?? bars.length,
    lastBar,
  });

  if (!needs && prev) {
    return { liquidity: prev, mode: "reuse", newSwingConfirmed: false };
  }

  const liquidity = detectEqhEqlLiquidity(bars, { ...config, asOfIndex });
  return { liquidity, mode: "rebuild", newSwingConfirmed };
}
