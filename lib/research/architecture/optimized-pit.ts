/**
 * OPTIMIZED-path PIT poison tests — future bars must not change state at T.
 */

import { ResearchContextSession } from "../replay/incremental-context";
import { marketContextParityFields } from "../replay/parity";
import type { ReplayMarketData } from "../replay/types";
import { poisonFuture, type PoisonKind } from "./pit";

export type OptimizedPitResult = {
  checkpoint: string;
  barIndex: number;
  poisonsPassed: number;
  poisonsTotal: number;
  passed: boolean;
};

const POISON_KINDS: PoisonKind[] = ["price", "swing", "sweep", "mss", "fvg", "liquidity"];

export function runOptimizedPathLeakageTest(
  data: ReplayMarketData,
  barIndex: number
): OptimizedPitResult {
  const asOf = data.m1[barIndex]!.time;
  const baselineSession = new ResearchContextSession();
  baselineSession.reset(data);
  const baselineCtx = baselineSession.buildAtBarIndex(barIndex, "OPTIMIZED");
  const baseline = marketContextParityFields(baselineCtx, data, asOf);

  let passed = 0;
  for (const kind of POISON_KINDS) {
    const poisoned = poisonFuture(data, asOf, kind);
    const session = new ResearchContextSession();
    session.reset(poisoned);
    const ctx = session.buildAtBarIndex(barIndex, "OPTIMIZED");
    const after = marketContextParityFields(ctx, poisoned, asOf);
    if (JSON.stringify(baseline) === JSON.stringify(after)) passed++;
  }

  return {
    checkpoint: asOf.toISOString(),
    barIndex,
    poisonsPassed: passed,
    poisonsTotal: POISON_KINDS.length,
    passed: passed === POISON_KINDS.length,
  };
}
