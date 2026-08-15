/**
 * Incremental market-state engine — shared live + replay.
 *
 * INITIAL LOAD: full buildMarketContextAt + research EQH/EQL.
 * NEW TICK: mutate forming 1m candle; rebuild 1m structure only when high/low
 *   expand or close interacts with tracked levels/FVGs/liquidity.
 * NEW CLOSED BAR: append, then 1m structure + incremental EQH/EQL.
 *
 * Production detectors (structure.ts, reh-rel.ts) are called, not rewritten.
 * Outputs of rebuild() match initialize + incremental updates on the same bars.
 */
import type { Bar, MarketContext } from "./types";
import { buildMarketContextAt, biasFromPrice, liquidityLevelsFromContext, buildIntradayTimeframeState } from "./levels";
import {
  updateStructureFacts,
  type StructureFactsIncState,
} from "./structure";
import { computeBiasStack } from "./bias-analysis";
import { computePremiumDiscount, pdArrayDirectionHint } from "./pd-arrays";
import { detectEqhEqlLiquidity, toEqhEqlTrackRows, type EqhEqlLiquidity } from "./research/eqh-eql-liquidity";
import { updateEqhEqlLiquidity } from "./research/eqh-eql-incremental";
import { getEstMinutes } from "./market-data";
import { resolveSessionContext } from "./sessions";
import { resolveLiveLastPrice } from "./chart-live-price";
import {
  diffStructureEvents,
  lastBarAffectsTrackedPrices,
  snapshotStructureState,
  type StructureEvent,
  type StructureStateBundle,
} from "./structure-state";
import { majorLevelInteraction, shouldRunKarenAnalysis, type AnalysisTrigger } from "./analysis-triggers";
import { structureDrawingFingerprint, shouldRedrawDrawings } from "./drawing-state";

export type MarketFeed = {
  daily: Bar[];
  m15: Bar[];
  m5: Bar[];
  m1: Bar[];
  symbol: string;
};

export type EngineStats = {
  fullRebuilds: number;
  tickUpdates: number;
  tickSkippedDupes: number;
  barUpdates: number;
  structureRebuilds: number;
  eqhEqlRebuilds: number;
  eqhEqlReused: number;
  analysisRuns: number;
  analysisSkipped: number;
  drawingRebuilds: number;
  drawingSkipped: number;
  lastTickMs: number;
  lastBarMs: number;
  lastFullMs: number;
  lastStructureMs: number;
  lastEqhMs: number;
};

export type EngineSnapshot = {
  ctx: MarketContext;
  eqhEql: EqhEqlLiquidity;
  structure: StructureStateBundle;
  events: StructureEvent[];
  drawingFingerprint: string;
  barFingerprint: string;
  shouldAnalyze: boolean;
  shouldRedraw: boolean;
  /** Present on shared live sync — skip full context rebuild when inputs match. */
  contextReuse?: "hit" | "miss";
  contextReuseReason?: LiveMarketReuseReason;
};

/** 1 MNQ tick. Last-print moves inside this epsilon do not invalidate the snapshot. */
export const LIVE_CONTEXT_PRICE_EPS = 0.25;

export type LiveMarketReuseReason = "hit" | "cold" | "bars" | "session" | "price" | "forced";

export type LiveMarketReuseKey = {
  symbol: string;
  /** m1 || m5 || m15 || daily series fingerprints (count + first/last time + last OHLC). */
  barFingerprint: string;
  /** session id + AMD phase + macro window from EST clock. */
  sessionKey: string;
  lastPrice: number;
  lastM1Time: number;
};

export type LiveMarketReuseDecision = {
  hit: boolean;
  reason: LiveMarketReuseReason;
};

function cloneBar(b: Bar): Bar {
  return { time: new Date(b.time.getTime()), open: b.open, high: b.high, low: b.low, close: b.close };
}

/** Time-only prefix (1m may have tick-mutated last OHLC before the next closed bar arrives). */
function barsTimePrefix(prev: Bar[], next: Bar[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i]!.time.getTime() !== next[i]!.time.getTime()) return false;
  }
  return true;
}

/**
 * HTF append-safe: times match for prev length; solid historical OHLC unchanged.
 * When length is unchanged, the last bar may still be forming (OHLC drift allowed).
 */
function htfSeriesAppendSafe(prev: Bar[], next: Bar[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i]!.time.getTime() !== next[i]!.time.getTime()) return false;
  }
  const solidEnd = next.length === prev.length ? Math.max(0, prev.length - 1) : prev.length;
  for (let i = 0; i < solidEnd; i++) {
    const a = prev[i]!;
    const b = next[i]!;
    if (a.open !== b.open || a.high !== b.high || a.low !== b.low || a.close !== b.close) return false;
  }
  return true;
}

function sliceFeedAt(data: MarketFeed, asOf: Date): MarketFeed {
  const t = asOf.getTime();
  const cut = (bars: Bar[]) => bars.filter((b) => b.time.getTime() <= t).map(cloneBar);
  return {
    symbol: data.symbol,
    daily: cut(data.daily),
    m15: cut(data.m15),
    m5: cut(data.m5),
    m1: cut(data.m1),
  };
}

export function barSeriesFingerprint(bars: Bar[]): string {
  if (!bars.length) return "empty";
  const a = bars[0]!;
  const b = bars[bars.length - 1]!;
  return `${bars.length}|${a.time.getTime()}|${b.time.getTime()}|${b.open.toFixed(2)}|${b.high.toFixed(2)}|${b.low.toFixed(2)}|${b.close.toFixed(2)}`;
}

export function liveMarketSessionKey(asOf: Date): string {
  const s = resolveSessionContext(asOf);
  return `${s.id}|${s.amdPhase}|${s.macroWindow ?? ""}`;
}

export function liveMarketBarFingerprint(data: MarketFeed): string {
  /** Identity only — forming-bar OHLC is covered by last-print epsilon, not exact close. */
  const id = (bars: Bar[]) => {
    if (!bars.length) return "empty";
    const a = bars[0]!;
    const b = bars[bars.length - 1]!;
    return `${bars.length}|${a.time.getTime()}|${b.time.getTime()}`;
  };
  return [id(data.m1), id(data.m5), id(data.m15), id(data.daily)].join("||");
}

export function buildLiveMarketReuseKey(
  data: MarketFeed,
  asOf: Date,
  lastPrice?: number | null
): LiveMarketReuseKey {
  const sliced = sliceFeedAt(data, asOf);
  const last = sliced.m1.at(-1);
  const px = lastPrice ?? last?.close ?? 0;
  return {
    symbol: sliced.symbol,
    barFingerprint: liveMarketBarFingerprint(sliced),
    sessionKey: liveMarketSessionKey(asOf),
    lastPrice: Number.isFinite(px) ? px : 0,
    lastM1Time: last?.time.getTime() ?? 0,
  };
}

export function formatLiveMarketReuseFingerprint(key: LiveMarketReuseKey): string {
  return [
    `sym=${key.symbol}`,
    `bars=${key.barFingerprint}`,
    `session=${key.sessionKey}`,
    `px=${key.lastPrice.toFixed(2)}`,
    `m1t=${key.lastM1Time}`,
  ].join("|");
}

export function decideLiveMarketReuse(
  prev: LiveMarketReuseKey | null,
  next: LiveMarketReuseKey
): LiveMarketReuseDecision {
  if (!prev) return { hit: false, reason: "cold" };
  if (prev.symbol !== next.symbol) return { hit: false, reason: "cold" };
  if (prev.barFingerprint !== next.barFingerprint) return { hit: false, reason: "bars" };
  if (prev.sessionKey !== next.sessionKey) return { hit: false, reason: "session" };
  if (Math.abs(prev.lastPrice - next.lastPrice) >= LIVE_CONTEXT_PRICE_EPS) {
    return { hit: false, reason: "price" };
  }
  return { hit: true, reason: "hit" };
}

/** Follow-up clock check: same session and same wall-clock 1m as the snapshot asOf. */
export function followUpClockAllowsReuse(sessionKey: string, asOfMs: number, now = new Date()): boolean {
  if (liveMarketSessionKey(now) !== sessionKey) return false;
  return Math.floor(now.getTime() / 60_000) === Math.floor(asOfMs / 60_000);
}

function minuteFloor(t: Date): Date {
  const d = new Date(t.getTime());
  d.setUTCSeconds(0, 0);
  return d;
}

function eq(a: number, b: number): number {
  return (a + b) / 2;
}

function emptyStats(): EngineStats {
  return {
    fullRebuilds: 0,
    tickUpdates: 0,
    tickSkippedDupes: 0,
    barUpdates: 0,
    structureRebuilds: 0,
    eqhEqlRebuilds: 0,
    eqhEqlReused: 0,
    analysisRuns: 0,
    analysisSkipped: 0,
    drawingRebuilds: 0,
    drawingSkipped: 0,
    lastTickMs: 0,
    lastBarMs: 0,
    lastFullMs: 0,
    lastStructureMs: 0,
    lastEqhMs: 0,
  };
}

export class IncrementalMarketEngine {
  symbol = "";
  private feed: MarketFeed = { daily: [], m15: [], m5: [], m1: [], symbol: "" };
  private asOf = new Date(0);
  private lastPrice = 0;
  private ctx: MarketContext | null = null;
  private eqh: EqhEqlLiquidity | null = null;
  private structure: StructureStateBundle | null = null;
  private events: StructureEvent[] = [];
  private drawingFp = "";
  private prevDrawingFp: string | null = null;
  private s = emptyStats();
  private eqhBarCount = 0;
  /** Closed-bar structure incremental state (REH scope + sessionM1). Reset on fullRebuild. */
  private structureInc: StructureFactsIncState | null = null;
  private pendingBias: StructureEvent[] = [];
  private chartTimeEst?: string;

  stats(): EngineStats {
    return { ...this.s };
  }

  barFingerprint(): string {
    return barSeriesFingerprint(this.feed.m1);
  }

  getContext(): MarketContext {
    if (!this.ctx) throw new Error("engine not initialized");
    return this.ctx;
  }

  getEqhEql(): EqhEqlLiquidity | null {
    return this.eqh;
  }

  getStructure(): StructureStateBundle | null {
    return this.structure;
  }

  consumeEvents(): StructureEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot(trigger: AnalysisTrigger = "tick"): EngineSnapshot {
    if (!this.ctx || !this.eqh || !this.structure) throw new Error("engine not initialized");
    const events = [...this.events];
    const shouldAnalyze = shouldRunKarenAnalysis(trigger, events);
    const shouldRedraw = shouldRedrawDrawings({
      prevFingerprint: this.prevDrawingFp,
      nextFingerprint: this.drawingFp,
      reason: trigger === "user" ? "user" : trigger === "reconnect" ? "reconnect" : trigger === "tick" ? "tick" : "structure_event",
    });
    if (shouldAnalyze) this.s.analysisRuns += 1;
    else this.s.analysisSkipped += 1;
    if (shouldRedraw) this.s.drawingRebuilds += 1;
    else this.s.drawingSkipped += 1;
    return {
      ctx: this.ctx,
      eqhEql: this.eqh,
      structure: this.structure,
      events,
      drawingFingerprint: this.drawingFp,
      barFingerprint: this.barFingerprint(),
      shouldAnalyze,
      shouldRedraw,
    };
  }

  initialize(input: {
    data: MarketFeed;
    asOf: Date;
    lastPrice?: number | null;
    chartTimeEst?: string;
  }): EngineSnapshot {
    const t0 = performance.now();
    this.feed = sliceFeedAt(input.data, input.asOf);
    this.symbol = input.data.symbol;
    this.asOf = new Date(input.asOf.getTime());
    this.chartTimeEst = input.chartTimeEst;
    const last = this.feed.m1.at(-1);
    this.lastPrice = input.lastPrice ?? last?.close ?? 0;
    this.fullRebuild();
    this.s.fullRebuilds += 1;
    this.s.lastFullMs = performance.now() - t0;
    this.events = [{ kind: "bar_close", at: Math.floor(this.asOf.getTime() / 1000), label: "initial load" }];
    return this.snapshot("reconnect");
  }

  /** Full rebuild from current feed — reference for equivalence tests. */
  rebuild(): EngineSnapshot {
    const t0 = performance.now();
    this.fullRebuild();
    this.s.fullRebuilds += 1;
    this.s.lastFullMs = performance.now() - t0;
    return this.snapshot("bar_close");
  }

  applyTick(input: { price: number; time?: Date | number }): EngineSnapshot {
    const t0 = performance.now();
    if (!this.ctx) throw new Error("engine not initialized");
    const price = input.price;
    if (!Number.isFinite(price)) return this.snapshot("tick");
    const time =
      input.time instanceof Date
        ? input.time
        : typeof input.time === "number"
          ? new Date(input.time > 1e12 ? input.time : input.time * 1000)
          : this.asOf;

    const last = this.feed.m1.at(-1);
    if (!last) {
      this.lastPrice = price;
      this.s.tickUpdates += 1;
      this.s.lastTickMs = performance.now() - t0;
      return this.snapshot("tick");
    }

    const gap = time.getTime() - last.time.getTime();
    if (gap >= 60_000) {
      const closed = cloneBar(last);
      const forming: Bar = {
        time: minuteFloor(time),
        open: price,
        high: price,
        low: price,
        close: price,
      };
      this.feed.m1.push(forming);
      this.asOf = forming.time;
      this.lastPrice = price;
      this.afterClosedBar(closed);
      this.s.tickUpdates += 1;
      this.s.lastTickMs = performance.now() - t0;
      return this.snapshot("bar_close");
    }

    if (Math.abs(price - last.close) < 1e-9 && Math.abs(price - this.lastPrice) < 1e-9) {
      this.s.tickSkippedDupes += 1;
      this.s.lastTickMs = performance.now() - t0;
      return this.snapshot("tick");
    }

    const prevBar = { high: last.high, low: last.low, close: last.close };
    const prevPrice = this.lastPrice;
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    this.lastPrice = price;
    this.asOf = last.time.getTime() > this.asOf.getTime() ? last.time : this.asOf;

    const hlChanged = last.high > prevBar.high + 1e-9 || last.low < prevBar.low - 1e-9;
    const tracked = this.structure?.trackedPrices ?? [];
    const affects = hlChanged || lastBarAffectsTrackedPrices(prevBar, last, tracked);
    const levelHit = majorLevelInteraction(prevPrice, price, tracked);

    this.applyPriceDerived(price, last);
    const biasEvents = this.drainBiasEvents();
    if (affects) {
      this.rebuildOneMinuteStructure({ eqhForce: hlChanged });
    } else {
      this.refreshEqhIfNeeded(false);
    }

    const events: StructureEvent[] = [...biasEvents];
    if (levelHit) {
      events.push({
        kind: "level_interaction",
        at: Math.floor(this.asOf.getTime() / 1000),
        label: `price ${price.toFixed(2)} tagged a major level`,
        price,
      });
    }
    this.finishUpdate(events);
    this.s.tickUpdates += 1;
    this.s.lastTickMs = performance.now() - t0;
    return this.snapshot("tick");
  }

  applyClosedBar(bar: Bar): EngineSnapshot {
    const t0 = performance.now();
    if (!this.ctx) throw new Error("engine not initialized");
    const last = this.feed.m1.at(-1);
    if (last && last.time.getTime() === bar.time.getTime()) {
      last.open = bar.open;
      last.high = bar.high;
      last.low = bar.low;
      last.close = bar.close;
    } else if (last && bar.time.getTime() < last.time.getTime()) {
      this.feed.m1 = this.feed.m1.filter((b) => b.time.getTime() <= bar.time.getTime());
      const tail = this.feed.m1.at(-1);
      if (tail && tail.time.getTime() === bar.time.getTime()) {
        tail.open = bar.open;
        tail.high = bar.high;
        tail.low = bar.low;
        tail.close = bar.close;
      } else {
        this.feed.m1.push(cloneBar(bar));
      }
      this.asOf = bar.time;
      this.lastPrice = bar.close;
      this.fullRebuild();
      this.s.fullRebuilds += 1;
      this.s.lastFullMs = performance.now() - t0;
      this.events = [{ kind: "bar_close", at: Math.floor(bar.time.getTime() / 1000), label: "seek/recovery rebuild" }];
      this.s.barUpdates += 1;
      this.s.lastBarMs = performance.now() - t0;
      return this.snapshot("reconnect");
    } else {
      this.feed.m1.push(cloneBar(bar));
    }
    this.asOf = bar.time;
    this.lastPrice = bar.close;
    this.afterClosedBar(bar);
    this.s.barUpdates += 1;
    this.s.lastBarMs = performance.now() - t0;
    return this.snapshot("bar_close");
  }

  /**
   * Align engine to a feed snapshot. Appends new 1m bars incrementally;
   * rebuilds on seek-back / first-bar mismatch (reconnect, PIT rewind).
   * Append-only m5/m15 length growth patches those TF windows without fullRebuild;
   * daily length change and any non-append HTF rewrite still fullRebuild.
   */
  syncSeries(input: { data: MarketFeed; asOf: Date; lastPrice?: number | null; chartTimeEst?: string }): EngineSnapshot {
    const sliced = sliceFeedAt(input.data, input.asOf);
    const next = sliced.m1;
    const prev = this.feed.m1;
    const firstMatch =
      prev.length > 0 &&
      next.length > 0 &&
      prev[0]!.time.getTime() === next[0]!.time.getTime();
    if (!this.ctx || !firstMatch || next.length + 1 < prev.length) {
      return this.initialize(input);
    }

    const prevM5Len = this.feed.m5.length;
    const prevM15Len = this.feed.m15.length;
    const prevDailyLen = this.feed.daily.length;
    const m5Delta = sliced.m5.length - prevM5Len;
    const m15Delta = sliced.m15.length - prevM15Len;
    const dailyDelta = sliced.daily.length - prevDailyLen;
    const htfChanged = m5Delta !== 0 || m15Delta !== 0 || dailyDelta !== 0;

    const sessionChanged = liveMarketSessionKey(input.asOf) !== liveMarketSessionKey(this.asOf);
    const m1AppendOk = next.length > prev.length && barsTimePrefix(prev, next);
    /** PDH/PDL collapsed to lastPrice — previous day not yet formed; fullRebuild required for PIT parity. */
    const previousDayAnchorsOk =
      !!this.ctx &&
      Number.isFinite(this.ctx.daily.previousDayHigh) &&
      Number.isFinite(this.ctx.daily.previousDayLow) &&
      !(
        this.ctx.daily.previousDayHigh === this.ctx.daily.previousDayLow &&
        Math.abs(this.ctx.daily.previousDayHigh - this.ctx.daily.lastClose) < 0.01
      );
    const htfAppendOnly =
      htfChanged &&
      dailyDelta === 0 &&
      m5Delta >= 0 &&
      m15Delta >= 0 &&
      (m5Delta > 0 || m15Delta > 0) &&
      m1AppendOk &&
      !sessionChanged &&
      previousDayAnchorsOk &&
      htfSeriesAppendSafe(this.feed.m5, sliced.m5) &&
      htfSeriesAppendSafe(this.feed.m15, sliced.m15) &&
      htfSeriesAppendSafe(this.feed.daily, sliced.daily);

    this.feed.daily = sliced.daily;
    this.feed.m15 = sliced.m15;
    this.feed.m5 = sliced.m5;
    this.feed.symbol = sliced.symbol;
    this.chartTimeEst = input.chartTimeEst;

    if (htfChanged && !htfAppendOnly) {
      this.feed.m1 = sliced.m1;
      this.asOf = input.asOf;
      this.lastPrice = input.lastPrice ?? next.at(-1)?.close ?? this.lastPrice;
      this.fullRebuild();
      this.s.fullRebuilds += 1;
      this.events = [{ kind: "bar_close", at: Math.floor(input.asOf.getTime() / 1000), label: "htf sync rebuild" }];
      return this.snapshot("bar_close");
    }

    if (next.length === prev.length) {
      const nLast = next[next.length - 1]!;
      const pLast = prev[prev.length - 1]!;
      if (nLast.time.getTime() !== pLast.time.getTime()) {
        return this.initialize(input);
      }
      pLast.open = nLast.open;
      pLast.high = nLast.high;
      pLast.low = nLast.low;
      pLast.close = nLast.close;
      this.asOf = input.asOf;
      return this.applyTick({ price: input.lastPrice ?? nLast.close, time: input.asOf });
    }
    for (let i = prev.length; i < next.length; i++) {
      this.applyClosedBar(next[i]!);
    }
    if (htfAppendOnly) {
      this.patchGrownIntradayHtf({ m5: m5Delta > 0, m15: m15Delta > 0 });
    }
    const lastClose = this.feed.m1.at(-1)?.close;
    if (input.lastPrice != null && lastClose != null && Math.abs(input.lastPrice - lastClose) >= 0.01) {
      this.applyTick({ price: input.lastPrice, time: input.asOf });
    }
    return this.snapshot("bar_close");
  }

  /** Patch only grown 5m/15m HL+FVG + bias stack after append-only HTF sync. */
  private patchGrownIntradayHtf(grown: { m5: boolean; m15: boolean }) {
    if (!this.ctx) return;
    const price = this.lastPrice;
    const prevBias = this.ctx.biasStack.tradeableBias;
    if (grown.m15) {
      this.ctx.timeframe15m = buildIntradayTimeframeState(this.feed.m15, "15m", price);
    }
    if (grown.m5) {
      this.ctx.timeframe5m = buildIntradayTimeframeState(this.feed.m5, "5m", price);
    }
    const dailyBias = pdArrayDirectionHint(price, this.ctx.htfPdArrays).bias;
    this.ctx.daily.biasHint = dailyBias;
    this.ctx.biasStack = computeBiasStack(
      dailyBias,
      this.ctx.timeframe15m.biasHint,
      this.ctx.timeframe5m.biasHint
    );
    this.ctx.daily.m1BarClose = this.feed.m1.at(-1)?.close;
    this.ctx.fetchedAt = this.asOf.toISOString();
    this.alignInactiveSessionPlaceholderTimes();
    const extra: StructureEvent[] = [...this.events];
    if (prevBias !== this.ctx.biasStack.tradeableBias) {
      extra.push({
        kind: "bias_change",
        at: Math.floor(this.asOf.getTime() / 1000),
        label: `${prevBias}→${this.ctx.biasStack.tradeableBias}`,
      });
    }
    extra.push({
      kind: "bar_close",
      at: Math.floor(this.asOf.getTime() / 1000),
      label: grown.m5 && grown.m15 ? "htf m5+m15 patch" : grown.m15 ? "htf m15 patch" : "htf m5 patch",
    });
    this.finishUpdate(extra);
  }

  /**
   * buildMarketContextAt fills not-yet-started session windows with current-day HL and asOf times.
   * Completed windows keep real extreme times from incremental bumps — do not overwrite those.
   */
  private alignInactiveSessionPlaceholderTimes() {
    if (!this.ctx) return;
    const t = Math.floor(this.asOf.getTime() / 1000);
    const mins = getEstMinutes(this.asOf);
    const setIfNotStarted = (
      highTime: "asiaHighTime" | "londonHighTime" | "nyPreHighTime" | "nyRthHighTime" | "nyPmHighTime",
      lowTime: "asiaLowTime" | "londonLowTime" | "nyPreLowTime" | "nyRthLowTime" | "nyPmLowTime",
      notStarted: boolean
    ) => {
      if (!notStarted) return;
      this.ctx!.sessions[highTime] = t;
      this.ctx!.sessions[lowTime] = t;
    };
    // Asia (18:00–01:00): only touch before the Globex open; after 01:00 Asia has completed.
    setIfNotStarted("asiaHighTime", "asiaLowTime", mins >= 16 * 60 && mins < 18 * 60);
    setIfNotStarted("londonHighTime", "londonLowTime", mins < 2 * 60);
    setIfNotStarted("nyPreHighTime", "nyPreLowTime", mins < 7 * 60);
    setIfNotStarted("nyRthHighTime", "nyRthLowTime", mins < 9 * 60 + 30);
    setIfNotStarted("nyPmHighTime", "nyPmLowTime", mins < 13 * 60 + 30);
  }

  private afterClosedBar(bar: Bar) {
    this.applyPriceDerived(bar.close, bar);
    const biasEvents = this.drainBiasEvents();
    this.rebuildOneMinuteStructure({ eqhForce: false });
    this.finishUpdate([
      ...biasEvents,
      { kind: "bar_close", at: Math.floor(bar.time.getTime() / 1000), label: "1m close" },
    ]);
  }

  private fullRebuild() {
    const last = this.feed.m1.at(-1);
    const px = this.lastPrice || last?.close || 0;
    this.ctx = buildMarketContextAt(this.feed, this.asOf, this.chartTimeEst, px);
    // Seed REH/session incremental state so the next closed-bar update can advance
    // without a full-history EST window rescan. Does not replace context facts.
    const levels = liquidityLevelsFromContext({
      pdLevels: this.ctx.htfPdArrays.levels,
      sessions: this.ctx.sessions,
      org: this.ctx.org,
    });
    this.structureInc = updateStructureFacts(
      null,
      null,
      this.feed.m1,
      levels,
      this.asOf,
      this.ctx.activeSession.id
    ).state;
    const tEqh = performance.now();
    this.eqh = detectEqhEqlLiquidity(this.feed.m1, {
      symbol: this.feed.symbol,
      currentPrice: px,
      lookback: 720,
      asOfIndex: this.feed.m1.length - 1,
    });
    this.s.lastEqhMs = performance.now() - tEqh;
    this.s.eqhEqlRebuilds += 1;
    this.structure = snapshotStructureState(this.ctx, this.eqh, this.asOf);
    this.eqhBarCount = this.feed.m1.length;
    this.prevDrawingFp = this.drawingFp || null;
    this.drawingFp = structureDrawingFingerprint(this.ctx, this.eqh.areas);
  }

  private rebuildOneMinuteStructure(opts: { eqhForce: boolean }) {
    if (!this.ctx) return;
    const t0 = performance.now();
    const levels = liquidityLevelsFromContext({
      pdLevels: this.ctx.htfPdArrays.levels,
      sessions: this.ctx.sessions,
      org: this.ctx.org,
    });
    const updated = updateStructureFacts(
      this.ctx.structureFacts,
      this.structureInc,
      this.feed.m1,
      levels,
      this.asOf,
      this.ctx.activeSession.id
    );
    this.ctx.structureFacts = updated.facts;
    this.structureInc = updated.state;
    this.s.structureRebuilds += 1;
    this.s.lastStructureMs = performance.now() - t0;
    this.refreshEqhIfNeeded(opts.eqhForce);
  }

  private refreshEqhIfNeeded(force: boolean) {
    const t0 = performance.now();
    const prevCount = this.eqhBarCount;
    if (force) {
      this.eqh = detectEqhEqlLiquidity(this.feed.m1, {
        symbol: this.feed.symbol,
        currentPrice: this.lastPrice,
        lookback: 720,
        asOfIndex: this.feed.m1.length - 1,
      });
      this.s.eqhEqlRebuilds += 1;
      this.s.lastEqhMs = performance.now() - t0;
      this.eqhBarCount = this.feed.m1.length;
      return;
    }
    const upd = updateEqhEqlLiquidity(
      this.eqh,
      this.feed.m1,
      {
        symbol: this.feed.symbol,
        currentPrice: this.lastPrice,
        lookback: 720,
        asOfIndex: this.feed.m1.length - 1,
      },
      prevCount
    );
    this.eqh = upd.liquidity;
    this.eqhBarCount = this.feed.m1.length;
    if (upd.mode === "rebuild") this.s.eqhEqlRebuilds += 1;
    else this.s.eqhEqlReused += 1;
    this.s.lastEqhMs = performance.now() - t0;
  }

  private applyPriceDerived(rawPrice: number, lastBar: Bar) {
    if (!this.ctx) return;
    const price = resolveLiveLastPrice(lastBar.close, rawPrice);
    const prevBias = this.ctx.biasStack.tradeableBias;
    this.lastPrice = price;
    this.ctx.daily.lastClose = price;

    if (lastBar.high > this.ctx.daily.currentDayHigh) this.ctx.daily.currentDayHigh = lastBar.high;
    if (lastBar.low < this.ctx.daily.currentDayLow) this.ctx.daily.currentDayLow = lastBar.low;
    this.ctx.daily.equilibrium = eq(this.ctx.daily.currentDayLow, this.ctx.daily.currentDayHigh);

    this.ctx.htfPdArrays.currentDay.high = this.ctx.daily.currentDayHigh;
    this.ctx.htfPdArrays.currentDay.low = this.ctx.daily.currentDayLow;
    this.ctx.htfPdArrays.currentDay.equilibrium = this.ctx.daily.equilibrium;
    const cdeq = this.ctx.htfPdArrays.levels.find((l) => l.id === "cdeq");
    if (cdeq) cdeq.price = this.ctx.daily.equilibrium;

    this.updateSessionExtremes(lastBar);

    const dailyBias = pdArrayDirectionHint(price, this.ctx.htfPdArrays).bias;
    this.ctx.daily.biasHint = dailyBias;
    this.ctx.timeframe15m.biasHint = biasFromPrice(price, this.ctx.timeframe15m.low, this.ctx.timeframe15m.high);
    this.ctx.timeframe5m.biasHint = biasFromPrice(price, this.ctx.timeframe5m.low, this.ctx.timeframe5m.high);
    this.ctx.biasStack = computeBiasStack(
      dailyBias,
      this.ctx.timeframe15m.biasHint,
      this.ctx.timeframe5m.biasHint
    );
    this.ctx.premiumDiscount = computePremiumDiscount({
      price,
      currHigh: this.ctx.daily.currentDayHigh,
      currLow: this.ctx.daily.currentDayLow,
      prevHigh: this.ctx.htfPdArrays.previousDay.high,
      prevLow: this.ctx.htfPdArrays.previousDay.low,
      nwog: this.ctx.nwog,
      ndog: this.ctx.htfPdArrays.ndog,
    });
    this.ctx.fetchedAt = this.asOf.toISOString();

    if (prevBias !== this.ctx.biasStack.tradeableBias) {
      this.pendingBias.push({
        kind: "bias_change",
        at: Math.floor(this.asOf.getTime() / 1000),
        label: `${prevBias}→${this.ctx.biasStack.tradeableBias}`,
      });
    }
  }

  private drainBiasEvents(): StructureEvent[] {
    const out = this.pendingBias;
    this.pendingBias = [];
    return out;
  }

  private updateSessionExtremes(bar: Bar) {
    if (!this.ctx) return;
    const mins = getEstMinutes(bar.time);
    const t = Math.floor(bar.time.getTime() / 1000);
    const bump = (highKey: "asiaHigh" | "londonHigh" | "nyPreHigh" | "nyRthHigh" | "nyPmHigh", lowKey: "asiaLow" | "londonLow" | "nyPreLow" | "nyRthLow" | "nyPmLow", highTime: "asiaHighTime" | "londonHighTime" | "nyPreHighTime" | "nyRthHighTime" | "nyPmHighTime", lowTime: "asiaLowTime" | "londonLowTime" | "nyPreLowTime" | "nyRthLowTime" | "nyPmLowTime") => {
      if (bar.high > this.ctx!.sessions[highKey]) {
        this.ctx!.sessions[highKey] = bar.high;
        this.ctx!.sessions[highTime] = t;
      }
      if (bar.low < this.ctx!.sessions[lowKey]) {
        this.ctx!.sessions[lowKey] = bar.low;
        this.ctx!.sessions[lowTime] = t;
      }
    };
    if (mins >= 18 * 60 || mins < 60) bump("asiaHigh", "asiaLow", "asiaHighTime", "asiaLowTime");
    if (mins >= 2 * 60 && mins < 5 * 60) bump("londonHigh", "londonLow", "londonHighTime", "londonLowTime");
    if (mins >= 7 * 60 && mins < 9 * 60 + 30) bump("nyPreHigh", "nyPreLow", "nyPreHighTime", "nyPreLowTime");
    if (mins >= 9 * 60 + 30 && mins < 16 * 60) bump("nyRthHigh", "nyRthLow", "nyRthHighTime", "nyRthLowTime");
    if (mins >= 13 * 60 + 30 && mins < 16 * 60) bump("nyPmHigh", "nyPmLow", "nyPmHighTime", "nyPmLowTime");
  }

  private finishUpdate(extra: StructureEvent[]) {
    if (!this.ctx || !this.eqh) return;
    const prev = this.structure;
    this.structure = snapshotStructureState(this.ctx, this.eqh, this.asOf);
    const diff = diffStructureEvents(prev, this.structure);
    this.events = [...extra, ...diff];
    this.prevDrawingFp = this.drawingFp || null;
    this.drawingFp = structureDrawingFingerprint(this.ctx, this.eqh.areas);
  }
}

export function createIncrementalMarketEngine(): IncrementalMarketEngine {
  return new IncrementalMarketEngine();
}

let shared: IncrementalMarketEngine | null = null;
let liveReuseAnchor: LiveMarketReuseKey | null = null;
let liveReuseHits = 0;
let liveReuseMisses = 0;

export function getSharedLiveEngine(): IncrementalMarketEngine {
  if (!shared) shared = createIncrementalMarketEngine();
  return shared;
}

export function resetSharedLiveEngine(): void {
  shared = null;
  liveReuseAnchor = null;
  liveReuseHits = 0;
  liveReuseMisses = 0;
}

export function getLiveContextReuseAnchor(): LiveMarketReuseKey | null {
  return liveReuseAnchor;
}

export function liveContextReuseStats(): { hits: number; misses: number } {
  return { hits: liveReuseHits, misses: liveReuseMisses };
}

function tagSnapshot(
  snap: EngineSnapshot,
  reuse: "hit" | "miss",
  reason: LiveMarketReuseReason
): EngineSnapshot {
  return { ...snap, contextReuse: reuse, contextReuseReason: reason };
}

export function syncLiveEngineFromFeed(input: {
  data: MarketFeed;
  asOf?: Date;
  lastPrice?: number | null;
  chartTimeEst?: string;
  allowReuse?: boolean;
}): EngineSnapshot {
  const engine = getSharedLiveEngine();
  const asOf = input.asOf ?? input.data.m1.at(-1)?.time ?? new Date();
  const nextKey = buildLiveMarketReuseKey(input.data, asOf, input.lastPrice);
  const allowReuse = input.allowReuse !== false;

  if (allowReuse) {
    const decision = decideLiveMarketReuse(liveReuseAnchor, nextKey);
    if (decision.hit) {
      liveReuseHits += 1;
      return tagSnapshot(engine.snapshot("tick"), "hit", "hit");
    }
    liveReuseMisses += 1;
    if (decision.reason === "session" && engine.symbol && engine.symbol === input.data.symbol) {
      const snap = engine.initialize({ ...input, asOf });
      liveReuseAnchor = nextKey;
      return tagSnapshot(snap, "miss", "session");
    }
    if (!engine.symbol || engine.symbol !== input.data.symbol) {
      const snap = engine.initialize({ ...input, asOf });
      liveReuseAnchor = nextKey;
      return tagSnapshot(snap, "miss", decision.reason);
    }
    const snap = engine.syncSeries({ ...input, asOf });
    liveReuseAnchor = nextKey;
    return tagSnapshot(snap, "miss", decision.reason);
  }

  liveReuseMisses += 1;
  if (!engine.symbol || engine.symbol !== input.data.symbol) {
    const snap = engine.initialize({ ...input, asOf });
    liveReuseAnchor = nextKey;
    return tagSnapshot(snap, "miss", "forced");
  }
  const snap = engine.syncSeries({ ...input, asOf });
  liveReuseAnchor = nextKey;
  return tagSnapshot(snap, "miss", "forced");
}

export function fingerprintKarenInput(ctx: MarketContext): string {
  const mss = ctx.structureFacts.mss;
  const fvg = ctx.structureFacts.m1UnfilledFvgs.map((z) => `${z.type}:${z.top}:${z.bottom}`).join(",");
  const reh = ctx.structureFacts.relativeEqualPools.map((p) => `${p.type}:${p.price}:${p.startTime}`).join(",");
  const sweeps = ctx.structureFacts.liquiditySweeps.map((s) => `${s.levelId}:${s.price}:${s.atTime}`).join(",");
  return [
    ctx.biasStack.tradeableBias,
    ctx.daily.lastClose.toFixed(2),
    mss ? `${mss.direction}:${mss.level}:${mss.atTime}` : "none",
    ctx.structureFacts.summary,
    fvg,
    reh,
    sweeps,
    `${ctx.sessions.nyRthHigh}:${ctx.sessions.nyRthLow}`,
    `${ctx.htfPdArrays.currentDay.high}:${ctx.htfPdArrays.currentDay.low}`,
  ].join("|");
}

export function fingerprintEqhAreas(eqh: EqhEqlLiquidity): string {
  return eqh.areas
    .map(
      (a) =>
        `${a.type}:${a.representativeLevel.toFixed(2)}:${a.priceLow.toFixed(2)}:${a.priceHigh.toFixed(2)}:${a.status}:${a.formationTime}:${a.confirmationTime}`
    )
    .sort()
    .join("|");
}

export { toEqhEqlTrackRows };
