import { randomUUID } from "crypto";
import { ReplayEngine } from "../replay/engine";
import { extractFeaturesAtCutoff } from "../replay/features";
import { structureOneLiner } from "../replay/cutoff";
import type { ReplayMarketData } from "../replay/types";
import { evaluateSetupOutcome, forwardBarsFromIndex } from "./outcome";
import { computeBacktestStatistics } from "./statistics";
import type {
  BacktestEngineConfig,
  BacktestRunResult,
  BacktestSetupResult,
  SetupEvent,
  SetupProposal,
  StrategyContext,
} from "./types";

type PendingSetup = {
  setupId: string;
  proposal: SetupProposal;
  detectedAt: string;
  detectedBarIndex: number;
  events: SetupEvent[];
  maxPendingBars: number;
};

type ActiveTrade = {
  setupId: string;
  proposal: SetupProposal;
  entryAt: string;
  entryBarIndex: number;
  events: SetupEvent[];
  maxTradeBars: number;
};

/**
 * Generic candle-by-candle backtest engine.
 * At T, strategy ONLY sees info ≤ T. Outcome uses forward bars after entry locked.
 */
export function runBacktest(config: BacktestEngineConfig): BacktestRunResult {
  const { dataset, strategy, timeframe = "1m", startTime, endTime } = config;

  const marketData: ReplayMarketData = {
    symbol: dataset.symbol,
    daily: dataset.daily ?? [],
    m15: dataset.m15 ?? [],
    m5: dataset.m5 ?? [],
    m1: dataset.m1,
  };

  const engine = new ReplayEngine({ ...marketData, id: dataset.id }, { startTime, endTime });

  const setups: BacktestSetupResult[] = [];
  let pending: PendingSetup | null = null;
  let active: ActiveTrade | null = null;

  const maxPending = strategy.maxBarsPending ?? 5;
  const maxInTrade = strategy.maxBarsInTrade ?? 60;

  engine.reset();
  strategy.onRunStart?.();

  const totalSteps = engine.endIndex - engine.startIndex;

  for (let step = 0; step <= totalSteps; step++) {
    const barIndex = engine.cursor;
    const bar = marketData.m1[barIndex]!;
    const asOf = engine.replayTimestamp;

    if (active) {
      const barsSinceEntry = barIndex - active.entryBarIndex;
      if (barsSinceEntry > 0) {
        const forwardSlice = marketData.m1.slice(active.entryBarIndex + 1, barIndex + 1);
        const partial = evaluateSetupOutcome({
          direction: active.proposal.direction,
          entry: active.proposal.entry,
          stop: active.proposal.stop,
          target: active.proposal.target,
          entryBarIndex: active.entryBarIndex,
          forwardBars: forwardSlice,
        });

        if (partial.outcome === "WIN") {
          active.events.push({
            type: "TARGET",
            timestamp: bar.time.toISOString(),
            barIndex,
            price: active.proposal.target,
          });
          setups.push(finishTrade(active, partial, marketData.symbol, timeframe));
          active = null;
        } else if (partial.outcome === "LOSS") {
          active.events.push({
            type: "INVALIDATION",
            timestamp: bar.time.toISOString(),
            barIndex,
            price: active.proposal.stop,
          });
          setups.push(finishTrade(active, partial, marketData.symbol, timeframe));
          active = null;
        } else if (partial.outcome === "AMBIGUOUS") {
          active.events.push({
            type: "TARGET",
            timestamp: bar.time.toISOString(),
            barIndex,
            detail: "same-bar stop+target",
          });
          active.events.push({
            type: "INVALIDATION",
            timestamp: bar.time.toISOString(),
            barIndex,
            detail: "same-bar stop+target",
          });
          setups.push(finishTrade(active, partial, marketData.symbol, timeframe));
          active = null;
        } else if (barsSinceEntry >= active.maxTradeBars) {
          active.events.push({
            type: "EXPIRED",
            timestamp: bar.time.toISOString(),
            barIndex,
          });
          const fwd = forwardBarsFromIndex(marketData.m1, active.entryBarIndex, barsSinceEntry);
          const expiredOutcome = evaluateSetupOutcome({
            direction: active.proposal.direction,
            entry: active.proposal.entry,
            stop: active.proposal.stop,
            target: active.proposal.target,
            entryBarIndex: active.entryBarIndex,
            forwardBars: fwd,
          });
          setups.push(
            finishTrade(
              active,
              { ...expiredOutcome, outcome: "EXPIRED", resultR: expiredOutcome.resultR },
              marketData.symbol,
              timeframe
            )
          );
          active = null;
        }
      }
    }

    if (pending && !active) {
      const barsWaiting = barIndex - pending.detectedBarIndex;
      const filled = tryEntryFill(pending.proposal, bar);
      if (filled) {
        pending.events.push({
          type: "ENTRY",
          timestamp: bar.time.toISOString(),
          barIndex,
          price: pending.proposal.entry,
        });
        active = {
          setupId: pending.setupId,
          proposal: pending.proposal,
          entryAt: bar.time.toISOString(),
          entryBarIndex: barIndex,
          events: [...pending.events],
          maxTradeBars: maxInTrade,
        };
        pending = null;
      } else if (barsWaiting >= pending.maxPendingBars) {
        pending.events.push({
          type: "CANCELLED",
          timestamp: bar.time.toISOString(),
          barIndex,
          detail: "entry not filled",
        });
        setups.push(cancelledSetup(pending, marketData.symbol, timeframe));
        pending = null;
      }
    }

    if (!pending && !active) {
      const { m1, ctx } = engine.contextAtCursor();
      const asOfIso = asOf.toISOString();

      const ctxForStrategy: StrategyContext = {
        snapshot: {
          datasetId: dataset.id ?? "unknown",
          symbol: marketData.symbol,
          asOf: asOfIso,
          currentPrice: m1.at(-1)?.close ?? ctx.daily.lastClose,
          barCountAtCutoff: m1.length,
          availableCandleRange: {
            start: marketData.m1[engine.startIndex]!.time.toISOString(),
            end: asOfIso,
          },
          structureSummary: structureOneLiner(ctx),
          features: extractFeaturesAtCutoff(ctx, m1),
          marketContext: ctx,
        },
        bar,
        barIndex,
        barsAtT: m1,
      };

      const proposal = strategy.detectSetup(ctxForStrategy);
      if (proposal && proposal.direction !== "WAIT") {
        const setupId = randomUUID();
        const events: SetupEvent[] = [
          {
            type: "SETUP_DETECTED",
            timestamp: bar.time.toISOString(),
            barIndex,
            price: proposal.entry,
          },
        ];
        pending = {
          setupId,
          proposal,
          detectedAt: bar.time.toISOString(),
          detectedBarIndex: barIndex,
          events,
          maxPendingBars: maxPending,
        };

        const filled = tryEntryFill(proposal, bar);
        if (filled) {
          pending.events.push({
            type: "ENTRY",
            timestamp: bar.time.toISOString(),
            barIndex,
            price: proposal.entry,
          });
          active = {
            setupId: pending.setupId,
            proposal: pending.proposal,
            entryAt: bar.time.toISOString(),
            entryBarIndex: barIndex,
            events: [...pending.events],
            maxTradeBars: maxInTrade,
          };
          pending = null;
        }
      }
    }

    if (step < totalSteps) {
      engine.advance(1);
    }
  }

  if (active) {
    const fwd = forwardBarsFromIndex(marketData.m1, active.entryBarIndex);
    const finalOutcome = evaluateSetupOutcome({
      direction: active.proposal.direction,
      entry: active.proposal.entry,
      stop: active.proposal.stop,
      target: active.proposal.target,
      entryBarIndex: active.entryBarIndex,
      forwardBars: fwd,
    });
    setups.push(
      finishTrade(
        active,
        {
          ...finalOutcome,
          outcome: finalOutcome.outcome === "OPEN" ? "NEUTRAL" : finalOutcome.outcome,
        },
        marketData.symbol,
        timeframe
      )
    );
  }
  if (pending) {
    setups.push(cancelledSetup(pending, marketData.symbol, timeframe));
  }

  strategy.onRunEnd?.();

  const statistics = computeBacktestStatistics(setups);
  const datasetId = dataset.id ?? "unknown";

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    datasetId,
    symbol: marketData.symbol,
    timeframe,
    window: {
      start: marketData.m1[engine.startIndex]!.time.toISOString(),
      end: marketData.m1[engine.endIndex]!.time.toISOString(),
    },
    setups,
    statistics,
    runAt: new Date().toISOString(),
  };
}

function tryEntryFill(proposal: SetupProposal, bar: { high: number; low: number }): boolean {
  if (proposal.direction === "LONG") {
    return bar.low <= proposal.entry && bar.high >= proposal.entry;
  }
  if (proposal.direction === "SHORT") {
    return bar.high >= proposal.entry && bar.low <= proposal.entry;
  }
  return false;
}

function finishTrade(
  trade: ActiveTrade,
  outcome: ReturnType<typeof evaluateSetupOutcome>,
  symbol: string,
  timeframe: "1m"
): BacktestSetupResult {
  const detectedAt =
    typeof trade.proposal.features._detectedAt === "string"
      ? trade.proposal.features._detectedAt
      : trade.events[0]!.timestamp;

  return {
    setup_id: trade.setupId,
    timestamp: detectedAt,
    entry_timestamp: trade.entryAt,
    symbol,
    timeframe,
    features: stripInternalFeatures(trade.proposal.features),
    direction: trade.proposal.direction,
    entry: trade.proposal.entry,
    stop: trade.proposal.stop,
    target: trade.proposal.target,
    outcome: outcome.outcome,
    MFE: outcome.mfe,
    MAE: outcome.mae,
    bars_held: outcome.barsHeld,
    time_held_ms: outcome.timeHeldMs,
    target_hit: outcome.targetHit,
    stop_hit: outcome.stopHit,
    which_first: outcome.whichFirst,
    ambiguity: outcome.ambiguity,
    result_R: outcome.resultR,
    events: trade.events,
  };
}

function cancelledSetup(
  pending: PendingSetup,
  symbol: string,
  timeframe: "1m"
): BacktestSetupResult {
  return {
    setup_id: pending.setupId,
    timestamp: pending.detectedAt,
    entry_timestamp: null,
    symbol,
    timeframe,
    features: stripInternalFeatures(pending.proposal.features),
    direction: pending.proposal.direction,
    entry: pending.proposal.entry,
    stop: pending.proposal.stop,
    target: pending.proposal.target,
    outcome: "CANCELLED",
    MFE: 0,
    MAE: 0,
    bars_held: 0,
    time_held_ms: 0,
    target_hit: false,
    stop_hit: false,
    which_first: "neither",
    ambiguity: false,
    result_R: 0,
    events: pending.events,
  };
}

function stripInternalFeatures(features: Record<string, unknown>): Record<string, unknown> {
  const { _detectedAt: _, ...rest } = features;
  return rest;
}

/** Run backtest scoped to a walk-forward window by bar index range. */
export function runBacktestWindow(
  config: BacktestEngineConfig,
  barRange: { startIndex: number; endIndex: number }
): BacktestRunResult {
  const m1 = config.dataset.m1;
  const startTime = m1[barRange.startIndex]?.time;
  const endTime = m1[barRange.endIndex]?.time;
  return runBacktest({ ...config, startTime, endTime });
}

/** Resumable backtest state — pending/active carry across incremental chunks. */
export type BacktestCheckpointState = {
  cursorIndex: number;
  pending: PendingSetup | null;
  active: ActiveTrade | null;
  completedSetups: BacktestSetupResult[];
};

export function createInitialBacktestState(startBarIndex: number): BacktestCheckpointState {
  return { cursorIndex: startBarIndex, pending: null, active: null, completedSetups: [] };
}

/**
 * Process bars from state.cursorIndex through endBarIndex (inclusive).
 * When finalize=true, flushes open pending/active into completedSetups (monolithic end semantics).
 */
export function runBacktestSegment(
  config: BacktestEngineConfig,
  endBarIndex: number,
  state: BacktestCheckpointState,
  opts: { finalize?: boolean; engine: ReplayEngine; marketData: ReplayMarketData } 
): BacktestCheckpointState {
  const { dataset, strategy, timeframe = "1m" } = config;
  const { engine, marketData } = opts;
  const finalize = opts.finalize ?? false;

  let pending = state.pending;
  let active = state.active;
  const setups = [...state.completedSetups];

  const maxPending = strategy.maxBarsPending ?? 5;
  const maxInTrade = strategy.maxBarsInTrade ?? 60;

  engine.setCursor(state.cursorIndex);
  const targetEnd = Math.min(endBarIndex, engine.endIndex);
  const totalSteps = targetEnd - state.cursorIndex;

  for (let step = 0; step <= totalSteps; step++) {
    const barIndex = engine.cursor;
    const bar = marketData.m1[barIndex]!;
    const asOf = engine.replayTimestamp;

    if (active) {
      const barsSinceEntry = barIndex - active.entryBarIndex;
      if (barsSinceEntry > 0) {
        const forwardSlice = marketData.m1.slice(active.entryBarIndex + 1, barIndex + 1);
        const partial = evaluateSetupOutcome({
          direction: active.proposal.direction,
          entry: active.proposal.entry,
          stop: active.proposal.stop,
          target: active.proposal.target,
          entryBarIndex: active.entryBarIndex,
          forwardBars: forwardSlice,
        });

        if (partial.outcome === "WIN") {
          active.events.push({
            type: "TARGET",
            timestamp: bar.time.toISOString(),
            barIndex,
            price: active.proposal.target,
          });
          setups.push(finishTrade(active, partial, marketData.symbol, timeframe));
          active = null;
        } else if (partial.outcome === "LOSS") {
          active.events.push({
            type: "INVALIDATION",
            timestamp: bar.time.toISOString(),
            barIndex,
            price: active.proposal.stop,
          });
          setups.push(finishTrade(active, partial, marketData.symbol, timeframe));
          active = null;
        } else if (partial.outcome === "AMBIGUOUS") {
          active.events.push({
            type: "TARGET",
            timestamp: bar.time.toISOString(),
            barIndex,
            detail: "same-bar stop+target",
          });
          active.events.push({
            type: "INVALIDATION",
            timestamp: bar.time.toISOString(),
            barIndex,
            detail: "same-bar stop+target",
          });
          setups.push(finishTrade(active, partial, marketData.symbol, timeframe));
          active = null;
        } else if (barsSinceEntry >= active.maxTradeBars) {
          active.events.push({
            type: "EXPIRED",
            timestamp: bar.time.toISOString(),
            barIndex,
          });
          const fwd = forwardBarsFromIndex(marketData.m1, active.entryBarIndex, barsSinceEntry);
          const expiredOutcome = evaluateSetupOutcome({
            direction: active.proposal.direction,
            entry: active.proposal.entry,
            stop: active.proposal.stop,
            target: active.proposal.target,
            entryBarIndex: active.entryBarIndex,
            forwardBars: fwd,
          });
          setups.push(
            finishTrade(
              active,
              { ...expiredOutcome, outcome: "EXPIRED", resultR: expiredOutcome.resultR },
              marketData.symbol,
              timeframe
            )
          );
          active = null;
        }
      }
    }

    if (pending && !active) {
      const barsWaiting = barIndex - pending.detectedBarIndex;
      const filled = tryEntryFill(pending.proposal, bar);
      if (filled) {
        pending.events.push({
          type: "ENTRY",
          timestamp: bar.time.toISOString(),
          barIndex,
          price: pending.proposal.entry,
        });
        active = {
          setupId: pending.setupId,
          proposal: pending.proposal,
          entryAt: bar.time.toISOString(),
          entryBarIndex: barIndex,
          events: [...pending.events],
          maxTradeBars: maxInTrade,
        };
        pending = null;
      } else if (barsWaiting >= pending.maxPendingBars) {
        pending.events.push({
          type: "CANCELLED",
          timestamp: bar.time.toISOString(),
          barIndex,
          detail: "entry not filled",
        });
        setups.push(cancelledSetup(pending, marketData.symbol, timeframe));
        pending = null;
      }
    }

    if (!pending && !active) {
      const { m1, ctx } = engine.contextAtCursor();
      const asOfIso = asOf.toISOString();

      const ctxForStrategy: StrategyContext = {
        snapshot: {
          datasetId: dataset.id ?? "unknown",
          symbol: marketData.symbol,
          asOf: asOfIso,
          currentPrice: m1.at(-1)?.close ?? ctx.daily.lastClose,
          barCountAtCutoff: m1.length,
          availableCandleRange: {
            start: marketData.m1[engine.startIndex]!.time.toISOString(),
            end: asOfIso,
          },
          structureSummary: structureOneLiner(ctx),
          features: extractFeaturesAtCutoff(ctx, m1),
          marketContext: ctx,
        },
        bar,
        barIndex,
        barsAtT: m1,
      };

      const proposal = strategy.detectSetup(ctxForStrategy);
      if (proposal && proposal.direction !== "WAIT") {
        const setupId = randomUUID();
        const events: SetupEvent[] = [
          {
            type: "SETUP_DETECTED",
            timestamp: bar.time.toISOString(),
            barIndex,
            price: proposal.entry,
          },
        ];
        pending = {
          setupId,
          proposal,
          detectedAt: bar.time.toISOString(),
          detectedBarIndex: barIndex,
          events,
          maxPendingBars: maxPending,
        };

        const filled = tryEntryFill(proposal, bar);
        if (filled) {
          pending.events.push({
            type: "ENTRY",
            timestamp: bar.time.toISOString(),
            barIndex,
            price: proposal.entry,
          });
          active = {
            setupId: pending.setupId,
            proposal: pending.proposal,
            entryAt: bar.time.toISOString(),
            entryBarIndex: barIndex,
            events: [...pending.events],
            maxTradeBars: maxInTrade,
          };
          pending = null;
        }
      }
    }

    if (step < totalSteps) {
      engine.advance(1);
    }
  }

  const nextCursor = engine.cursor;

  if (finalize) {
    if (active) {
      const fwd = forwardBarsFromIndex(marketData.m1, active.entryBarIndex);
      const finalOutcome = evaluateSetupOutcome({
        direction: active.proposal.direction,
        entry: active.proposal.entry,
        stop: active.proposal.stop,
        target: active.proposal.target,
        entryBarIndex: active.entryBarIndex,
        forwardBars: fwd,
      });
      setups.push(
        finishTrade(
          active,
          {
            ...finalOutcome,
            outcome: finalOutcome.outcome === "OPEN" ? "NEUTRAL" : finalOutcome.outcome,
          },
          marketData.symbol,
          timeframe
        )
      );
      active = null;
    }
    if (pending) {
      setups.push(cancelledSetup(pending, marketData.symbol, timeframe));
      pending = null;
    }
  }

  return {
    cursorIndex: nextCursor,
    pending,
    active,
    completedSetups: setups,
  };
}

/** Run full backtest via sequential chunks with state carry-over — equivalent to runBacktest. */
export function runBacktestIncremental(
  config: BacktestEngineConfig,
  chunkSize: number,
  onChunk?: (event: { chunkIndex: number; startIndex: number; endIndex: number; setupCount: number }) => void
): BacktestRunResult {
  const { dataset, strategy, timeframe = "1m", startTime, endTime } = config;

  const marketData: ReplayMarketData = {
    symbol: dataset.symbol,
    daily: dataset.daily ?? [],
    m15: dataset.m15 ?? [],
    m5: dataset.m5 ?? [],
    m1: dataset.m1,
  };

  const engine = new ReplayEngine({ ...marketData, id: dataset.id }, { startTime, endTime });
  engine.reset();
  strategy.onRunStart?.();

  let state = createInitialBacktestState(engine.startIndex);
  const chunks = planBarChunks(engine.startIndex, engine.endIndex, chunkSize);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const isLast = i === chunks.length - 1;
    state = runBacktestSegment(config, chunk.endIndex, state, {
      finalize: isLast,
      engine,
      marketData,
    });
    onChunk?.({
      chunkIndex: i,
      startIndex: chunk.startIndex,
      endIndex: chunk.endIndex,
      setupCount: state.completedSetups.length,
    });
  }

  strategy.onRunEnd?.();

  const setups = state.completedSetups;
  const statistics = computeBacktestStatistics(setups);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    datasetId: dataset.id ?? "unknown",
    symbol: marketData.symbol,
    timeframe,
    window: {
      start: marketData.m1[engine.startIndex]!.time.toISOString(),
      end: marketData.m1[engine.endIndex]!.time.toISOString(),
    },
    setups,
    statistics,
    runAt: new Date().toISOString(),
  };
}

export function planBarChunks(
  startIndex: number,
  endIndex: number,
  chunkSize: number
): Array<{ startIndex: number; endIndex: number; chunkIndex: number }> {
  if (chunkSize < 1) throw new Error("chunkSize must be >= 1");
  const chunks: Array<{ startIndex: number; endIndex: number; chunkIndex: number }> = [];
  let cursor = startIndex;
  let chunkIndex = 0;
  while (cursor <= endIndex) {
    const end = Math.min(cursor + chunkSize - 1, endIndex);
    chunks.push({ startIndex: cursor, endIndex: end, chunkIndex });
    cursor = end + 1;
    chunkIndex++;
  }
  return chunks;
}
