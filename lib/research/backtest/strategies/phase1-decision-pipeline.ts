import { buildMarketState } from "../../../market-state-build";
import { buildTradingDecision } from "../../../decision-layer";
import { buildMarketInterpretation } from "../../../interpretation-engine";
import { buildMarketObservation } from "../../../observation-engine";
import { getExecutionScaffold } from "../../../execution-plan";
import { PIPELINE_VERSION, SPEC_VERSION } from "../../../pipeline-version";
import type { MarketContext } from "../../../types";
import { buildResearchChartSnapshotFromBars } from "../../chart-snapshot-from-bars";
import { ReplayDataCutoff } from "../../replay/cutoff";
import type { ReplayMarketData } from "../../replay/types";
import type { SetupProposal, StrategyContext } from "../types";

/** Frozen baseline strategy definition — Phase 1 ICT decision spec as implemented. */
export const PHASE1_BASELINE_STRATEGY_VERSION = `phase1-decision-pipeline@spec-${SPEC_VERSION}+pipeline-${PIPELINE_VERSION}`;

/**
 * Documented ambiguities — not guessed; surfaced in baseline manifest.
 * See docs/ICT_DECISION_SPEC.md Layer 3 + lib/decision-layer.ts + lib/execution-plan.ts.
 */
export const PHASE1_BASELINE_AMBIGUITIES = [
  "Stop uses decision-layer invalidation (sweep/MSS ±5) per ICT spec canonical example; execution-plan labels invalidation as thesis-only, not a stop.",
  "Entry fill at execution-scaffold anchor (long=zone top, short=zone bottom) when verdict LONG|SHORT and entryStatus ACTIVE only.",
  "WAIT and NO_TRADE verdicts produce no setup — not counted as missed trades.",
  "MarketState for observation uses research_bars adapter (sliced 1m OHLC scored at cutoff T); displacement may read unknown when lookback < 5 candles.",
  "Target 1 from execution scaffold (nearest PD/session level ≥45pt from anchor); not interpretation.target (always null in Phase 1).",
  "1m timeframe only; HTF bias from existing buildMarketContextAt — Yahoo/CME daily boundary conflicts documented in MARKET_STRUCTURE_DATA_REQUIREMENTS.md.",
] as const;

export const PHASE1_BASELINE_RULES = {
  layers: ["observation-engine", "interpretation-engine", "decision-layer", "execution-plan"],
  verdicts_traded: ["LONG", "SHORT"],
  entry_gate: "execution.entryStatus === ACTIVE (not WAIT or EXTENDED)",
  entry_price: "execution entry anchor — long: entryHi, short: entryLo",
  stop: "decision.invalidation",
  target: "execution.target1Price",
  required_fields: ["invalidation", "target1Price", "finite risk > 0"],
} as const;

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

/**
 * Baseline strategy — wires existing Phase 1 pipeline at cutoff T.
 * Does NOT modify prod modules; calls them read-only at point-in-time.
 */
export function createPhase1DecisionPipelineStrategy(data: ReplayMarketData) {
  let detectCache: Map<string, SetupProposal | null> | null = null;

  return {
    id: "phase1-decision-pipeline",
    name: "Phase 1 ICT Decision Pipeline (baseline)",
    maxBarsPending: 5,
    maxBarsInTrade: 60,

    onRunStart() {
      detectCache = new Map();
    },

    onRunEnd() {
      detectCache = null;
    },

    detectSetup(ctx: StrategyContext): SetupProposal | null {
      const cacheKey = ctx.snapshot.asOf;
      if (detectCache?.has(cacheKey)) {
        return detectCache.get(cacheKey) ?? null;
      }

      const marketCtx =
        ctx.snapshot.marketContext ??
        new ReplayDataCutoff(data, new Date(ctx.snapshot.asOf)).buildContext(ctx.bar.close);
      const m1AtT = ctx.barsAtT;
      const asOf = new Date(ctx.snapshot.asOf);
      const chartSnapshot = buildResearchChartSnapshotFromBars({
        bars: m1AtT,
        symbol: marketCtx.symbol,
        asOf,
        timeframe: "1",
      });

      const state = buildMarketState({
        ctx: marketCtx,
        chartLastPrice: ctx.bar.close,
        chartLastPriceSource: "yahoo",
        symbol: marketCtx.symbol,
        chartSnapshot,
      });

      const pipeline = (() => {
        const observation = buildMarketObservation(marketCtx, state);
        const interpretation = buildMarketInterpretation(observation);
        const decision = buildTradingDecision(observation, interpretation, marketCtx);
        return { observation, interpretation, decision };
      })();
      const decision = pipeline.decision;
      const execution = getExecutionScaffold(marketCtx);

      const cacheNull = () => {
        detectCache?.set(cacheKey, null);
        return null;
      };

      if (decision.verdict !== "LONG" && decision.verdict !== "SHORT") {
        return cacheNull();
      }
      if (!execution || execution.entryStatus !== "ACTIVE") {
        return cacheNull();
      }
      if (decision.invalidation == null || !Number.isFinite(decision.invalidation)) {
        return cacheNull();
      }
      if (!Number.isFinite(execution.target1Price) || execution.target1Price <= 0) {
        return cacheNull();
      }

      const isLong = decision.verdict === "LONG";
      const entry = roundMnq(isLong ? execution.entryHi : execution.entryLo);
      const stop = roundMnq(decision.invalidation);
      const target = roundMnq(execution.target1Price);
      const risk = Math.abs(entry - stop);
      if (risk <= 0) return cacheNull();

      const obs = pipeline.observation;
      const interp = pipeline.interpretation;

      const proposal = {
        setupType: "phase1-decision-pipeline",
        direction: decision.verdict,
        entry,
        stop,
        target,
        features: {
          _detectedAt: ctx.snapshot.asOf,
          strategy_definition_version: PHASE1_BASELINE_STRATEGY_VERSION,
          verdict: decision.verdict,
          verdict_reason: decision.verdict_reason,
          entry_model: interp.entry_model,
          entry_zone: decision.entry_zone,
          entry_status: execution.entryStatus,
          entry_label: execution.entryLabel,
          target1_label: execution.target1Label,
          market_structure: obs.market_structure,
          displacement: obs.displacement,
          fvg_status: obs.fvg.status,
          fvg_direction: obs.fvg.direction,
          session: obs.session,
          tradeable_bias: obs.htf_bias.tradeable_bias,
          mss_direction: marketCtx.structureFacts.mss?.direction ?? null,
          mss_level: marketCtx.structureFacts.mss?.level ?? null,
          data_quality: obs.data_quality,
          long_supported: interp.long_case.supported,
          short_supported: interp.short_case.supported,
          ambiguity_notes: [...PHASE1_BASELINE_AMBIGUITIES],
        },
      } satisfies SetupProposal;

      detectCache?.set(cacheKey, proposal);
      return proposal;
    },
  };
}

export type Phase1BaselineStrategy = ReturnType<typeof createPhase1DecisionPipelineStrategy>;
