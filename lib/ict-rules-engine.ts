import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import { isMarketStateUsable } from "./market-state";
import { nearestPdLevels } from "./pd-arrays";
import { getExecutionScaffold } from "./execution-plan";
import type { ConceptEvaluation, ConceptKey, FeatureSet } from "./decision-schema";
import { attachWeights, scoreToStatus } from "./decision-schema";

function tradeDirection(ctx: MarketContext): "long" | "short" | null {
  const tb = ctx.biasStack.tradeableBias;
  if (tb === "bullish") return "long";
  if (tb === "bearish") return "short";
  if (tb === "conflicted" && ctx.biasStack.dominantBias !== "neutral") {
    return ctx.biasStack.dominantBias === "bullish" ? "long" : "short";
  }
  return null;
}

/** Deterministic ICT feature extraction — Data + ICT Rules engine. */
export function extractFeatures(ctx: MarketContext, state: MarketState): FeatureSet {
  const price = state.lastPrice;
  const { support, resistance } = nearestPdLevels(price, ctx.htfPdArrays.levels);
  const mss = ctx.structureFacts.mss;
  const fvgs = ctx.structureFacts.m1UnfilledFvgs;
  const nearestFvg = fvgs.length ? fvgs[fvgs.length - 1] : undefined;

  return {
    market_state: state,
    bias_stack: ctx.biasStack,
    premium_discount: ctx.premiumDiscount,
    liquidity_targets: {
      pdh: ctx.htfPdArrays.previousDay.high,
      pdl: ctx.htfPdArrays.previousDay.low,
      pdc: ctx.htfPdArrays.previousDay.close,
      session_high: ctx.sessions.nyRthHigh,
      session_low: ctx.sessions.nyRthLow,
      ...(support
        ? { nearest_support: support.price, nearest_support_label: support.label }
        : {}),
      ...(resistance
        ? { nearest_resistance: resistance.price, nearest_resistance_label: resistance.label }
        : {}),
      recent_sweeps: ctx.structureFacts.liquiditySweeps.length,
    },
    structure: {
      ...(mss
        ? {
            mss_direction: mss.direction,
            mss_level: mss.level,
            mss_description: mss.description,
          }
        : {}),
      unfilled_fvg_count: fvgs.length,
      ...(nearestFvg ? { nearest_fvg_direction: nearestFvg.type } : {}),
      summary: ctx.structureFacts.summary,
    },
    execution: getExecutionScaffold(ctx),
    direction: tradeDirection(ctx),
    data_quality_ok: isMarketStateUsable(state) && state.candles.length >= 20,
  };
}

function evalHtfBias(f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const b = f.bias_stack;
  const evidence = [
    `bias_stack.daily: ${b.daily}`,
    `bias_stack.m15: ${b.m15}`,
    `bias_stack.m5: ${b.m5}`,
    `bias_stack.tradeable_bias: ${b.tradeableBias}`,
    `bias_stack.aligned_count: ${b.alignedCount}`,
  ];
  let score = 70;
  if (b.tradeableBias === "conflicted" && b.alignedCount < 2) score = 52;
  else if (b.alignedCount >= 2) score = 92;
  else if (b.biasConflict) score = 78;
  else if (b.daily === "neutral" && b.m15 === "neutral") score = 48;
  if (!f.direction) score = Math.min(score, 45);
  return { concept: "htf_bias", score, status: scoreToStatus(score), evidence, rule_ref: "ICT_DECISION_SPEC §4.1" };
}

function evalLiquidity(f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const lt = f.liquidity_targets;
  const evidence = [
    `market_state.levels.pdh: ${lt.pdh.toFixed(2)}`,
    `market_state.levels.pdl: ${lt.pdl.toFixed(2)}`,
    `session.ny_rth_high: ${lt.session_high.toFixed(2)}`,
    `session.ny_rth_low: ${lt.session_low.toFixed(2)}`,
  ];
  let score = 90;
  if (!Number.isFinite(lt.pdh) || !Number.isFinite(lt.pdl)) score = 35;
  else if (!Number.isFinite(lt.session_high) || !Number.isFinite(lt.session_low)) score = 62;
  if (lt.recent_sweeps > 0) {
    evidence.push(`structure.recent_sweeps: ${lt.recent_sweeps}`);
    score = Math.min(95, score + 3);
  }
  return { concept: "liquidity", score, status: scoreToStatus(score), evidence, rule_ref: "ICT_DECISION_SPEC §5.1" };
}

function evalPremiumDiscount(f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const pd = f.premium_discount;
  const evidence = [
    `premium_discount.vs_current_day_range: ${pd.vsCurrentDayRange}`,
    `premium_discount.vs_previous_day_range: ${pd.vsPreviousDayRange}`,
  ];
  let score = 80;
  if (pd.vsCurrentDayRange === "equilibrium" && pd.vsPreviousDayRange === "equilibrium") score = 68;
  else if (pd.vsCurrentDayRange === "premium" || pd.vsCurrentDayRange === "discount") score = 88;
  else score = 74;
  return { concept: "premium_discount", score, status: scoreToStatus(score), evidence, rule_ref: "ICT_DECISION_SPEC §6.1" };
}

function evalMss(f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const s = f.structure;
  const evidence: string[] = [`structure.summary: ${s.summary}`];
  let score = 55;
  if (s.mss_direction && f.direction) {
    const aligned =
      (f.direction === "long" && s.mss_direction === "bullish") ||
      (f.direction === "short" && s.mss_direction === "bearish");
    if (aligned) {
      score = 90;
      evidence.push(`structure.mss_direction: ${s.mss_direction}`);
      if (s.mss_level != null) evidence.push(`structure.mss_level: ${s.mss_level.toFixed(2)}`);
    } else {
      score = 50;
      evidence.push("structure.mss_opposes_bias: true");
    }
  } else if (s.unfilled_fvg_count > 0) {
    score = 72;
    evidence.push(`structure.unfilled_fvg_count: ${s.unfilled_fvg_count}`);
  }
  return { concept: "mss", score, status: scoreToStatus(score), evidence, rule_ref: "ICT_DECISION_SPEC §7.1" };
}

function evalDisplacement(f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const candles = f.market_state.candles.slice(-12);
  const evidence: string[] = [];
  if (candles.length < 5) {
    return {
      concept: "displacement",
      score: 40,
      status: "fail",
      evidence: ["market_state.candles: insufficient for displacement check"],
      rule_ref: "ICT_DECISION_SPEC §7.2",
    };
  }
  const bodies = candles.map((c) => Math.abs(c.c - c.o));
  const avgBody = bodies.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, bodies.length - 3);
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    const c = candles[i];
    const body = Math.abs(c.c - c.o);
    if (body > avgBody * 1.5) {
      const bullish = c.c > c.o;
      evidence.push(`market_state.candles[${i}].body: ${body.toFixed(2)} vs avg ${avgBody.toFixed(2)}`);
      if (f.direction === "long" && bullish) {
        return { concept: "displacement", score: 88, status: "pass", evidence, rule_ref: "ICT_DECISION_SPEC §7.2" };
      }
      if (f.direction === "short" && !bullish) {
        return { concept: "displacement", score: 88, status: "pass", evidence, rule_ref: "ICT_DECISION_SPEC §7.2" };
      }
      if (!f.direction) {
        return { concept: "displacement", score: 72, status: "neutral", evidence, rule_ref: "ICT_DECISION_SPEC §7.2" };
      }
      return {
        concept: "displacement",
        score: 55,
        status: "fail",
        evidence: [...evidence, "displacement opposes tradeable bias"],
        rule_ref: "ICT_DECISION_SPEC §7.2",
      };
    }
  }
  if (f.structure.mss_direction) {
    evidence.push("structure.mss: displacement implied by market structure shift");
    return { concept: "displacement", score: 78, status: "neutral", evidence, rule_ref: "ICT_DECISION_SPEC §7.2" };
  }
  return {
    concept: "displacement",
    score: 52,
    status: "fail",
    evidence: ["market_state.candles: no impulsive body in recent lookback"],
    rule_ref: "ICT_DECISION_SPEC §7.2",
  };
}

function evalFvg(f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const count = f.structure.unfilled_fvg_count;
  const evidence = [`structure.unfilled_fvg_count: ${count}`];
  let score = 55;
  if (count > 0 && f.structure.nearest_fvg_direction) {
    evidence.push(`structure.nearest_fvg_direction: ${f.structure.nearest_fvg_direction}`);
    const aligned =
      (f.direction === "long" && f.structure.nearest_fvg_direction === "bullish") ||
      (f.direction === "short" && f.structure.nearest_fvg_direction === "bearish");
    score = aligned ? 85 : 58;
  } else if (count > 0) {
    score = 76;
  }
  return { concept: "fvg", score, status: scoreToStatus(score), evidence, rule_ref: "ICT_DECISION_SPEC §7.3" };
}

function evalEntryZone(f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const ex = f.execution;
  if (!ex) {
    return {
      concept: "entry_zone",
      score: 38,
      status: "fail",
      evidence: ["execution: null"],
      rule_ref: "ICT_DECISION_SPEC §8.1",
    };
  }
  const evidence = [
    `execution.entry_status: ${ex.entryStatus}`,
    `execution.entry_zone: ${ex.entryZone}`,
    `execution.call: ${ex.call}`,
  ];
  let score = 82;
  if (ex.entryStatus === "WAIT") score = 80;
  else if (ex.entryStatus === "EXTENDED") score = 72;
  else if (ex.entryStatus === "ACTIVE") score = 88;
  return { concept: "entry_zone", score, status: scoreToStatus(score), evidence, rule_ref: "ICT_DECISION_SPEC §8.1" };
}

function evalSession(ctx: MarketContext, f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const s = ctx.activeSession;
  const evidence = [
    `active_session.id: ${s.id}`,
    `active_session.kill_zone: ${s.killZone}`,
    `active_session.amd_phase: ${s.amdPhase}`,
  ];
  if (s.macroWindow) evidence.push(`active_session.macro_window: ${s.macroWindow}`);
  let score = 70;
  if (s.killZone) score = 88;
  else if (s.amdPhase === "distribution" || s.amdPhase === "manipulation") score = 82;
  else if (s.id === "overnight") score = 58;
  if (!f.data_quality_ok) score = Math.min(score, 55);
  return { concept: "session", score, status: scoreToStatus(score), evidence, rule_ref: "ICT_DECISION_SPEC §8.2" };
}

function evalDataQuality(f: FeatureSet): Omit<ConceptEvaluation, "weight" | "weighted_contribution"> {
  const q = f.market_state.quality;
  const evidence = [
    `market_state.quality.flag: ${q.flag}`,
    `market_state.candles.length: ${f.market_state.candles.length}`,
  ];
  if (q.reasons.length) evidence.push(`market_state.quality.reasons: ${q.reasons.join(", ")}`);
  let score = 95;
  if (q.flag === "degraded") score = 82;
  else if (q.flag === "stale") score = 45;
  else if (q.flag === "missing") score = 20;
  if (!f.data_quality_ok) score = Math.min(score, 40);
  return { concept: "data_quality", score, status: scoreToStatus(score), evidence, rule_ref: "ICT_DECISION_SPEC §9.1" };
}

/** Evaluate all 9 ICT concepts with pass/fail/score and evidence. */
export function evaluateAllConcepts(
  ctx: MarketContext,
  features: FeatureSet
): ConceptEvaluation[] {
  return attachWeights([
    evalHtfBias(features),
    evalLiquidity(features),
    evalPremiumDiscount(features),
    evalMss(features),
    evalDisplacement(features),
    evalFvg(features),
    evalEntryZone(features),
    evalSession(ctx, features),
    evalDataQuality(features),
  ]);
}

/** Build evidence field paths from MarketState + features — required for every verdict. */
export function buildEvidencePaths(f: FeatureSet): string[] {
  const paths: string[] = [
    `market_state.last_price: ${f.market_state.lastPrice.toFixed(2)}`,
    `market_state.quality.flag: ${f.market_state.quality.flag}`,
    `market_state.levels.pdh: ${f.liquidity_targets.pdh.toFixed(2)}`,
    `market_state.levels.pdl: ${f.liquidity_targets.pdl.toFixed(2)}`,
    `bias_stack.tradeable_bias: ${f.bias_stack.tradeableBias}`,
    `bias_stack.aligned_count: ${f.bias_stack.alignedCount}`,
    `premium_discount.vs_current_day_range: ${f.premium_discount.vsCurrentDayRange}`,
    `structure.unfilled_fvg_count: ${f.structure.unfilled_fvg_count}`,
  ];
  if (f.liquidity_targets.nearest_support != null) {
    paths.push(
      `market_state.levels.nearest_support: ${f.liquidity_targets.nearest_support.toFixed(2)}`
    );
  }
  if (f.liquidity_targets.nearest_resistance != null) {
    paths.push(
      `market_state.levels.nearest_resistance: ${f.liquidity_targets.nearest_resistance.toFixed(2)}`
    );
  }
  if (f.structure.mss_direction) {
    paths.push(`structure.mss_direction: ${f.structure.mss_direction}`);
  }
  if (f.execution) {
    paths.push(`execution.entry_status: ${f.execution.entryStatus}`);
    paths.push(`execution.call: ${f.execution.call}`);
  }
  return paths;
}

const CONCEPT_LABELS: Record<ConceptKey, string> = {
  htf_bias: "Bias",
  liquidity: "Liquidity",
  premium_discount: "Premium/discount",
  mss: "MSS",
  displacement: "Displacement",
  fvg: "FVG",
  entry_zone: "Entry",
  session: "Session",
  data_quality: "Data",
};

export function formatConceptSummary(concepts: ConceptEvaluation[]): string {
  return concepts
    .map((c) => `${CONCEPT_LABELS[c.concept]} ${c.status} (${c.score})`)
    .join(", ");
}

export function summarizeFeatureSet(features: FeatureSet): Record<string, unknown> {
  return {
    state_hash: features.market_state.stateHash,
    quality: features.market_state.quality.flag,
    bias: features.bias_stack.tradeableBias,
    aligned_count: features.bias_stack.alignedCount,
    direction: features.direction,
    entry_status: features.execution?.entryStatus,
    call: features.execution?.call,
    mss: features.structure.mss_direction,
    data_quality_ok: features.data_quality_ok,
  };
}
