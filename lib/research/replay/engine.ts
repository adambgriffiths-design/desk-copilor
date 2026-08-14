import { formatEst } from "../../market-data";
import type { Bar } from "../../types";
import type { MarketContext } from "../../types";
import { ReplayDataCutoff, structureOneLiner } from "./cutoff";
import { extractFeaturesAtCutoff } from "./features";
import { buildHtfIndexMaps, sliceBarsThroughIndex } from "./fast-slice";
import type { PointInTimeSnapshot, ReplayEngineConfig, ReplayMarketData } from "./types";

type CutoffCacheEntry = { m1: Bar[]; ctx: MarketContext };

/**
 * Isolated replay engine — steps through 1m candles with hard point-in-time cutoff.
 * Historical Dataset → Replay Engine → Point-in-Time Snapshot
 */
export class ReplayEngine {
  readonly datasetId: string;
  readonly symbol: string;
  readonly data: ReplayMarketData;
  readonly startIndex: number;
  readonly endIndex: number;
  private cursorIndex: number;
  /** Per-run cache — keyed by cursor index; cleared on reset(). */
  private cutoffCache = new Map<number, CutoffCacheEntry>();
  private htfIndexMaps: ReturnType<typeof buildHtfIndexMaps> | null = null;

  constructor(data: ReplayMarketData & { id?: string }, config?: ReplayEngineConfig) {
    this.data = data;
    this.datasetId = data.id ?? "unknown";
    this.symbol = data.symbol;
    const m1 = data.m1;
    if (!m1.length) throw new Error("ReplayEngine: empty m1 dataset");

    let startIndex = 0;
    if (config?.startTime) {
      const idx = m1.findIndex((b) => b.time.getTime() >= config.startTime!.getTime());
      startIndex = idx === -1 ? m1.length - 1 : idx;
    }
    if (config?.initialIndex != null) {
      startIndex = config.initialIndex;
    }

    let endIndex = m1.length - 1;
    if (config?.endTime) {
      let last = -1;
      for (let i = 0; i < m1.length; i++) {
        if (m1[i]!.time.getTime() <= config.endTime!.getTime()) last = i;
      }
      endIndex = last === -1 ? 0 : last;
    }

    this.startIndex = Math.max(0, Math.min(startIndex, endIndex));
    this.endIndex = Math.max(this.startIndex, endIndex);
    this.cursorIndex = this.startIndex;
    this.htfIndexMaps = buildHtfIndexMaps(this.data.m1, this.data.m5, this.data.m15);
  }

  get replayTimestamp(): Date {
    return this.data.m1[this.cursorIndex]!.time;
  }

  get cursor(): number {
    return this.cursorIndex;
  }

  reset(): PointInTimeSnapshot {
    this.cutoffCache.clear();
    this.htfIndexMaps = buildHtfIndexMaps(this.data.m1, this.data.m5, this.data.m15);
    this.cursorIndex = this.startIndex;
    return this.snapshot();
  }

  /** Cached context + m1 at cursor — for backtest hot path without full snapshot. */
  contextAtCursor(): CutoffCacheEntry {
    return this.cutoffEntryAtCursor();
  }

  /** Cached m1 slice at current cursor — same data as snapshot cutoff. */
  m1AtCutoff(): Bar[] {
    return this.cutoffEntryAtCursor().m1;
  }

  private cutoffEntryAtCursor(): CutoffCacheEntry {
    const idx = this.cursorIndex;
    const cached = this.cutoffCache.get(idx);
    if (cached) return cached;

    const asOf = this.replayTimestamp;
    const cutoff = new ReplayDataCutoff(this.data, asOf);
    cutoff.assertNoFutureLeak();
    const m1 = sliceBarsThroughIndex(this.data.m1, idx);
    const ctx = cutoff.buildContextAtBarIndex(idx, this.htfIndexMaps ?? undefined);
    const entry: CutoffCacheEntry = { m1, ctx };
    this.cutoffCache.set(idx, entry);
    return entry;
  }

  /** Step forward N candles (default 1). Clamps at end. */
  stepForward(n = 1): PointInTimeSnapshot {
    this.advance(n);
    return this.snapshot();
  }

  /** Advance cursor without building snapshot — caller snapshots when needed. */
  advance(n = 1): void {
    this.cursorIndex = Math.min(this.cursorIndex + n, this.endIndex);
  }

  /** Set cursor to bar index (for incremental backtest resume). Clamps to [startIndex, endIndex]. */
  setCursor(index: number): void {
    this.cursorIndex = Math.max(this.startIndex, Math.min(index, this.endIndex));
  }

  /** Step backward N candles (default 1). Clamps at start. */
  stepBackward(n = 1): PointInTimeSnapshot {
    this.cursorIndex = Math.max(this.cursorIndex - n, this.startIndex);
    return this.snapshot();
  }

  /** Point-in-time snapshot at current replay timestamp — no look-ahead. */
  snapshot(): PointInTimeSnapshot {
    const asOf = this.replayTimestamp;
    const { m1, ctx } = this.cutoffEntryAtCursor();

    return {
      datasetId: this.datasetId,
      symbol: this.symbol,
      asOf: asOf.toISOString(),
      currentPrice: m1.at(-1)?.close ?? ctx.daily.lastClose,
      barCountAtCutoff: m1.length,
      availableCandleRange: {
        start: this.data.m1[this.startIndex]!.time.toISOString(),
        end: asOf.toISOString(),
      },
      structureSummary: structureOneLiner(ctx),
      features: extractFeaturesAtCutoff(ctx, m1),
      marketContext: ctx,
    };
  }

  /** All m1 timestamps in the replay window (for UI stepping). */
  timestampsInWindow(): string[] {
    return this.data.m1.slice(this.startIndex, this.endIndex + 1).map((b) => b.time.toISOString());
  }

  chartTimeEst(): string {
    return formatEst(this.replayTimestamp);
  }

  /** Seek to exact ISO timestamp within window. */
  seekTo(iso: string): PointInTimeSnapshot {
    const t = new Date(iso).getTime();
    let best = this.startIndex;
    for (let i = this.startIndex; i <= this.endIndex; i++) {
      if (this.data.m1[i]!.time.getTime() <= t) best = i;
    }
    this.cursorIndex = best;
    return this.snapshot();
  }
}
