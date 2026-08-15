/**
 * OPTIMIZED research replay context — IncrementalMarketEngine.syncSeries / applyClosedBar.
 * CURRENT path remains ReplayDataCutoff.buildContextAtBarIndex (full rebuild per checkpoint).
 *
 * OPTIMIZED uses the same HTF prefix slices as buildContextAtBarIndex (m5EndByM1 / m15EndByM1)
 * so parity is against the research fast path, not live sliceFeedAt.
 */

import { formatEst } from "../../market-data";
import type { Bar } from "../../types";
import type { MarketContext } from "../../types";
import {
  createIncrementalMarketEngine,
  type IncrementalMarketEngine,
  type MarketFeed,
} from "../../incremental-market-engine";
import { ReplayDataCutoff } from "./cutoff";
import { buildHtfIndexMaps, sliceBarsThroughIndex } from "./fast-slice";
import type { ResearchReplayMode } from "./mode";
import type { ReplayMarketData } from "./types";

export type ResearchContextSessionOptions = {
  warmupBarIndex?: number;
};

function cloneBar(b: Bar): Bar {
  return { time: new Date(b.time.getTime()), open: b.open, high: b.high, low: b.low, close: b.close };
}

/** Same prefix inputs as ReplayDataCutoff.buildContextAtBarIndex. */
export function prefixFeedAtBarIndex(
  data: ReplayMarketData,
  barIndex: number,
  htfMaps: ReturnType<typeof buildHtfIndexMaps>
): MarketFeed {
  const m1Prefix = sliceBarsThroughIndex(data.m1, barIndex).map(cloneBar);
  const m5End = htfMaps.m5EndByM1[barIndex] ?? -1;
  const m15End = htfMaps.m15EndByM1[barIndex] ?? -1;
  return {
    symbol: data.symbol,
    daily: data.daily,
    m1: m1Prefix,
    m5: m5End >= 0 ? sliceBarsThroughIndex(data.m5, m5End).map(cloneBar) : [],
    m15: m15End >= 0 ? sliceBarsThroughIndex(data.m15, m15End).map(cloneBar) : [],
  };
}

/** Stateful builder for sequential OPTIMIZED replay; fresh CURRENT builds ignore session state. */
export class ResearchContextSession {
  private data: ReplayMarketData | null = null;
  private engine: IncrementalMarketEngine | null = null;
  private lastBarIndex = -1;
  private warmupBarIndex = 0;
  private htfMaps: ReturnType<typeof buildHtfIndexMaps> | null = null;

  reset(data: ReplayMarketData, opts?: ResearchContextSessionOptions): void {
    this.data = data;
    this.warmupBarIndex = Math.max(0, opts?.warmupBarIndex ?? 60);
    this.lastBarIndex = -1;
    this.engine = null;
    this.htfMaps = buildHtfIndexMaps(data.m1, data.m5, data.m15);
  }

  /** Build PIT market context at bar index using the selected mode. */
  buildAtBarIndex(barIndex: number, mode: ResearchReplayMode): MarketContext {
    if (!this.data) throw new Error("ResearchContextSession: call reset() first");
    if (barIndex < 0 || barIndex >= this.data.m1.length) {
      throw new Error(`ResearchContextSession: barIndex ${barIndex} out of range`);
    }

    if (mode === "CURRENT") {
      const asOf = this.data.m1[barIndex]!.time;
      const cutoff = new ReplayDataCutoff(this.data, asOf);
      cutoff.assertNoFutureLeak();
      const last = this.data.m1[barIndex]!.close;
      return cutoff.buildContextAtBarIndex(barIndex, this.htfMaps ?? undefined, last);
    }

    return this.buildOptimizedAtBarIndex(barIndex);
  }

  private buildOptimizedAtBarIndex(barIndex: number): MarketContext {
    const data = this.data!;
    const maps = this.htfMaps!;
    const target = data.m1[barIndex]!;

    if (barIndex < this.lastBarIndex) {
      this.engine = null;
      this.lastBarIndex = -1;
    }

    if (!this.engine) {
      this.engine = createIncrementalMarketEngine();
      const initIdx = Math.min(this.warmupBarIndex, barIndex);
      const initBar = data.m1[initIdx]!;
      this.engine.initialize({
        data: prefixFeedAtBarIndex(data, initIdx, maps),
        asOf: initBar.time,
        lastPrice: initBar.close,
        chartTimeEst: formatEst(initBar.time),
      });
      this.lastBarIndex = initIdx;
    }

    if (barIndex !== this.lastBarIndex) {
      this.engine.syncSeries({
        data: prefixFeedAtBarIndex(data, barIndex, maps),
        asOf: target.time,
        lastPrice: target.close,
        chartTimeEst: formatEst(target.time),
      });
      this.lastBarIndex = barIndex;
    }

    return this.engine.getContext();
  }

  optimizedStats() {
    return this.engine?.stats() ?? null;
  }
}

/** One-shot context at bar index (no session reuse). */
export function buildResearchContextAtBarIndex(
  data: ReplayMarketData,
  barIndex: number,
  mode: ResearchReplayMode,
  opts?: ResearchContextSessionOptions
): MarketContext {
  const session = new ResearchContextSession();
  session.reset(data, opts);
  return session.buildAtBarIndex(barIndex, mode);
}
