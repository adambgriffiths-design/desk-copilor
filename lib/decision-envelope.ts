/**
 * Decision envelope + reasoning chain — naming/layout only.
 * Does not change sweep, PDH, REH/EQL, or entry computation.
 * Design: data/research/karen-decision-architecture.md
 */

import type {
  DeskPipelineResult,
  ReadonlyMarketObservation,
  TradingDecision,
  MarketInterpretation,
} from "./desk-schema";
import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import { buildMtfHorizonSummaries } from "./mtf-horizons";
import {
  sessionLiquidityStayFlatReason,
  shouldBlockLongFromSessionLiquidity,
} from "./session-liquidity";
import { rehRelTolerance } from "./structure";
import { formatObservationNarrative } from "./observation-engine";

export const PLAYBOOK_CHAIN_CONCEPTS = [
  "htf_bias",
  "premium_discount",
  "liquidity_sweep_pdh",
  "liquidity_sweep_pdl",
  "session_liquidity",
  "eqh",
  "eql",
  "mss",
  "displacement",
  "fvg",
] as const;

export type PlaybookChainConcept = (typeof PLAYBOOK_CHAIN_CONCEPTS)[number];

export type DecisionStance = "long" | "short" | "flat" | "wait" | "monitor";
export type HorizonLean = "bullish" | "bearish" | "neutral" | "unclear";
export type ChainOutcome = "true" | "false" | "uncertain";
export type DecisionConfidence = "high" | "medium" | "low" | "unknown";

export type ConceptRole = "PRIMARY" | "SUPPORTING" | "NONE";
export type TradeableOpportunity = "potential_long" | "potential_short" | "none";
export type TradeDirection = "LONG" | "SHORT" | "NONE";

export type DecisionHorizon = {
  id: "primary" | "htf";
  timeframe: string;
  lean: HorizonLean;
  role: "stance" | "context";
  summary: string;
};

export type LabeledLean = {
  horizon: string;
  lean: HorizonLean;
};

export type ConflictBetween = "primary_vs_htf" | "session_stay_out" | "both_sides" | "none";

export type ConflictLog = {
  htfHorizon: string;
  htfLean: HorizonLean;
  tacticalHorizon: string;
  tacticalLean: HorizonLean;
  disagree: boolean;
  /** Current architecture default is false on stay-flat. True only if pipeline actually takes LTF against HTF. Hypothesis, not a claim of best. */
  ltfAgainstHtfAllowed: boolean | null;
  why: string;
  target: string | null;
  invalidation: string | null;
};

export type ConflictResolution = {
  conflict: boolean;
  between: ConflictBetween;
  winner: "primary" | "htf" | "neither";
  stance: DecisionStance;
  sentence: string;
};

export type ThesisAnswers = {
  what: string | null;
  whyNow: string | null;
  timeframe: string | null;
  toward: string | null;
  fromWhere: string | null;
  invalidates: string | null;
  complete: boolean;
};

export type HorizonRead = {
  htfContext: LabeledLean;
  currentStructure: LabeledLean;
  tradeableOpportunity: TradeableOpportunity;
  tradeDirection: TradeDirection;
  target: string;
  invalidation: string;
  overallStance: string;
};

export type ReasoningEvidence = {
  source: string;
  prices?: number[];
  swing?: string;
  candleTime?: string;
  close?: number;
  tolerance?: number;
  snapshotId?: string;
  candleId?: string;
  status?: string;
};

export type ReasoningChainItem = {
  concept: PlaybookChainConcept | string;
  checked: boolean;
  detected: boolean;
  usedInDecision: boolean;
  role: ConceptRole;
  evidence: ReasoningEvidence;
  outcome: ChainOutcome;
  impact: string;
};

export type DecisionEnvelope = {
  primaryHorizon: DecisionHorizon;
  htfContext: DecisionHorizon;
  stance: DecisionStance;
  conflictResolution: ConflictResolution;
  conflictLog: ConflictLog;
  thesis: ThesisAnswers;
  read: HorizonRead;
  confidence: DecisionConfidence;
  invalidation: { price: string; condition: string };
  /** Hypothesis order — explicit so it is testable. Not a claim of optimality. */
  logicOrder: {
    strategicBias: string;
    tacticalBias: string;
    execution: string;
    invalidation: string;
  };
  layers: {
    facts: string;
    interpretation: string;
    decision: string;
    invalidation: string;
  };
  reasoningChain: ReasoningChainItem[];
  citedConcepts: string[];
};

const STANCES: ReadonlySet<string> = new Set(["long", "short", "flat", "wait", "monitor"]);

type ChainDraft = Omit<ReasoningChainItem, "detected" | "usedInDecision" | "role">;

function fillChainDefaults(items: ChainDraft[]): ReasoningChainItem[] {
  return items.map((i) => ({
    ...i,
    detected: i.outcome === "true",
    usedInDecision: false,
    role: "NONE" as const,
  }));
}

function applyConceptRoles(items: ReasoningChainItem[], cited: string[]): ReasoningChainItem[] {
  const citedSet = new Set(cited);
  return items.map((i) => {
    const detected = i.outcome === "true";
    let role: ConceptRole = "NONE";
    if (citedSet.has(i.concept)) role = "PRIMARY";
    else if (detected && /support|confirmation|agrees with/i.test(i.impact)) role = "SUPPORTING";
    return { ...i, detected, usedInDecision: role === "PRIMARY" || role === "SUPPORTING", role };
  });
}

function isoFromUnix(ts?: number | null): string | undefined {
  if (ts == null || !Number.isFinite(ts)) return undefined;
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function mapLean(raw: string | undefined): HorizonLean {
  if (raw === "bullish" || raw === "bearish") return raw;
  if (raw === "neutral" || raw === "mixed") return "neutral";
  return "unclear";
}

function bothSidesTaken(obs: ReadonlyMarketObservation): boolean {
  const taken = new Set(obs.liquidity.levels.filter((l) => l.taken === true).map((l) => l.label));
  return taken.has("PDH") && taken.has("PDL");
}

function hasBiasStructureConflict(obs: ReadonlyMarketObservation): boolean {
  const bias = obs.htf_bias.tradeable_bias;
  const structure = obs.market_structure;
  return (
    (bias === "bullish" && structure === "bearish") ||
    (bias === "bearish" && structure === "bullish")
  );
}

function isNumericEntryZone(entry: string | null | undefined): boolean {
  if (!entry) return false;
  return /\d/.test(entry) && !/wait for/i.test(entry);
}

function isWaitForTrigger(
  decision: TradingDecision,
  interpretation: MarketInterpretation,
  obs: ReadonlyMarketObservation
): boolean {
  if (decision.verdict !== "WAIT") return false;
  if (hasBiasStructureConflict(obs)) return false;
  if (bothSidesTaken(obs)) return false;
  if (shouldBlockLongFromSessionLiquidity(obs)) return false;
  const setup = interpretation.entry_model || "";
  return /retrace|fvg|sweep/i.test(setup) && isNumericEntryZone(decision.entry_zone);
}

export function resolveStance(result: Pick<DeskPipelineResult, "observation" | "interpretation" | "decision">): DecisionStance {
  const { decision, interpretation, observation } = result;
  if (decision.verdict === "LONG") return "long";
  if (decision.verdict === "SHORT") return "short";
  if (decision.verdict === "WAIT") {
    return isWaitForTrigger(decision, interpretation, observation) ? "wait" : "flat";
  }
  return "monitor";
}

function snapshotId(state?: MarketState, obs?: ReadonlyMarketObservation): string | undefined {
  return state?.snapshotId || obs?.state_hash || state?.stateHash;
}

function levelByLabel(obs: ReadonlyMarketObservation, label: string) {
  return obs.liquidity.levels.find((l) => l.label === label || l.id === label.toLowerCase());
}

function sweepItem(
  concept: "liquidity_sweep_pdh" | "liquidity_sweep_pdl",
  obs: ReadonlyMarketObservation,
  state: MarketState | undefined,
  stance: DecisionStance
): ChainDraft {
  const label = concept === "liquidity_sweep_pdh" ? "PDH" : "PDL";
  const level = levelByLabel(obs, label);
  const snap = snapshotId(state, obs);
  if (!level) {
    return {
      concept,
      checked: false,
      evidence: { source: "observation.liquidity.levels", snapshotId: snap, status: "missing" },
      outcome: "uncertain",
      impact: `${label} not in observation — not used as a taken sweep.`,
    };
  }
  const candleTime = isoFromUnix(level.qualifyingTickAt);
  const proven =
    level.taken === true && Boolean(level.candleId) && Boolean(candleTime);
  let outcome: ChainOutcome = "false";
  if (level.taken === "unknown") outcome = "uncertain";
  else if (level.taken === true) outcome = proven ? "true" : "uncertain";
  else if (level.status && level.status !== "UNTOUCHED" && level.status !== "TESTED") {
    outcome = "uncertain";
  }

  const impact =
    outcome === "true"
      ? `${label} sweep proven (CLOSED_BEYOND) — ${stance === "flat" ? "does not by itself force a directional stance" : "supports the liquidity story for this stance"}.`
      : outcome === "uncertain"
        ? `${label} UNPROVEN — not presented as taken (missing candle/timestamp or not CLOSED_BEYOND).`
        : `${label} not taken (${level.status ?? "UNTOUCHED"}) — no sweep impact on stance.`;

  return {
    concept,
    checked: true,
    evidence: {
      source: `liquidity.${label.toLowerCase()}`,
      prices: [level.price],
      swing: label,
      candleTime,
      close: level.qualifyingTickPrice,
      snapshotId: snap,
      candleId: level.candleId,
      status: `${level.status ?? "UNTOUCHED"} taken=${String(level.taken)}`,
    },
    outcome,
    impact,
  };
}

function equalPoolItem(
  concept: "eqh" | "eql",
  obs: ReadonlyMarketObservation,
  ctx: MarketContext | undefined,
  state: MarketState | undefined,
  stance: DecisionStance
): ChainDraft {
  const snap = snapshotId(state, obs);
  const type = concept === "eqh" ? "reh" : "rel";
  const fromObs =
    concept === "eqh"
      ? obs.reh_rel.nearest_reh_above || obs.reh_rel.reh_levels[0]
      : obs.reh_rel.nearest_rel_below || obs.reh_rel.rel_levels[0];
  const pools = (ctx?.structureFacts.relativeEqualPools || []).filter((p) => p.type === type);
  const pool = pools[0];

  if (obs.reh_rel.status === "unknown" && obs.data_quality !== "good" && obs.data_quality !== "degraded") {
    return {
      concept,
      checked: false,
      evidence: { source: "observation.reh_rel", snapshotId: snap, status: "unknown" },
      outcome: "uncertain",
      impact: `${concept.toUpperCase()} not evaluated — data quality blocked the lookback.`,
    };
  }

  if (!fromObs && !pool) {
    return {
      concept,
      checked: true,
      evidence: { source: "observation.reh_rel", snapshotId: snap, status: "absent" },
      outcome: "false",
      impact: `No ${concept === "eqh" ? "equal-high" : "equal-low"} pool in lookback — did not move stance.`,
    };
  }

  const prices = fromObs?.sourceSwingPrices?.length
    ? fromObs.sourceSwingPrices
    : fromObs
      ? [fromObs.level]
      : pool
        ? [pool.price]
        : [];
  const times = fromObs?.sourceSwingTimestamps?.length
    ? fromObs.sourceSwingTimestamps.map(isoFromUnix).filter(Boolean) as string[]
    : [isoFromUnix(pool?.startTime), isoFromUnix(pool?.endTime)].filter(Boolean) as string[];
  const ref = prices[0] ?? fromObs?.level ?? pool?.price;
  const tolerance = ref != null ? rehRelTolerance(ref) : undefined;
  const hasTimes = times.length > 0;
  const outcome: ChainOutcome = hasTimes && prices.length ? "true" : "uncertain";
  const label = concept === "eqh" ? "equal highs" : "equal lows";

  return {
    concept,
    checked: true,
    evidence: {
      source: fromObs ? `observation.reh_rel.${fromObs.id}` : "structureFacts.relativeEqualPools",
      prices,
      swing: prices.map((p, i) => `${p.toFixed(2)}${times[i] ? `@${times[i]}` : ""}`).join(" + "),
      candleTime: times[0],
      tolerance,
      snapshotId: snap,
      status: fromObs?.status ?? "active",
    },
    outcome,
    impact:
      outcome === "true"
        ? `${label} at ${ref?.toFixed(2)} (tolerance ${tolerance?.toFixed(2)} pts) — liquidity context; ${stance === "flat" ? "does not override flat" : "did not change stance by itself"}.`
        : `${label} present but missing swing timestamps — UNPROVEN, not used as a true pool.`,
  };
}

function buildReasoningChain(input: {
  observation: ReadonlyMarketObservation;
  interpretation: MarketInterpretation;
  decision: TradingDecision;
  ctx?: MarketContext;
  state?: MarketState;
  stance: DecisionStance;
  conflict: ConflictResolution;
}): ReasoningChainItem[] {
  const { observation: obs, interpretation, ctx, state, stance, conflict } = input;
  const snap = snapshotId(state, obs);
  const mss = ctx?.structureFacts.mss;
  const sessionFlat = sessionLiquidityStayFlatReason(obs);

  const htfLean = mapLean(obs.htf_bias.tradeable_bias);
  const primaryLean = mapLean(obs.market_structure === "unclear" ? "unclear" : obs.market_structure);

  const items: ChainDraft[] = [];

  items.push({
    concept: "htf_bias",
    checked: obs.htf_bias.tradeable_bias !== "unknown",
    evidence: {
      source: "bias_stack.tradeable_bias",
      status: `daily=${obs.htf_bias.daily} m15=${obs.htf_bias.m15} m5=${obs.htf_bias.m5} tradeable=${obs.htf_bias.tradeable_bias}`,
      snapshotId: snap,
    },
    outcome:
      obs.htf_bias.tradeable_bias === "unknown"
        ? "uncertain"
        : obs.htf_bias.tradeable_bias === "bullish" || obs.htf_bias.tradeable_bias === "bearish"
          ? "true"
          : "false",
    impact:
      conflict.between === "primary_vs_htf"
        ? `Higher-timeframe ${htfLean} is context only — does not force a ${htfLean === "bullish" ? "long" : "short"} while primary disagrees (stance ${stance}).`
        : `HTF context is ${htfLean} — ${stance === "long" || stance === "short" ? "agrees with the primary stance" : "does not by itself set the stance"}.`,
  });

  const pdZone = obs.premium_discount.zone;
  items.push({
    concept: "premium_discount",
    checked: pdZone !== "unknown",
    evidence: { source: "premium_discount.zone", status: pdZone, snapshotId: snap },
    outcome: pdZone === "unknown" ? "uncertain" : pdZone === "equilibrium" ? "false" : "true",
    impact:
      pdZone === "unknown"
        ? "Premium/discount unknown — not used."
        : `Price in ${pdZone} — context for the read; did not override stance ${stance}.`,
  });

  items.push(sweepItem("liquidity_sweep_pdh", obs, state, stance));
  items.push(sweepItem("liquidity_sweep_pdl", obs, state, stance));

  const asia = levelByLabel(obs, "Asia high");
  items.push({
    concept: "session_liquidity",
    checked: obs.session !== "unknown",
    evidence: {
      source: "session + liquidity.asia_high",
      prices: asia ? [asia.price] : undefined,
      swing: asia?.label,
      candleTime: isoFromUnix(asia?.qualifyingTickAt),
      candleId: asia?.candleId,
      close: asia?.qualifyingTickPrice,
      snapshotId: snap,
      status: asia ? `${asia.status} taken=${String(asia.taken)}` : obs.session,
    },
    outcome: sessionFlat ? "true" : asia?.taken === true && asia.candleId ? "true" : "false",
    impact: sessionFlat
      ? `${sessionFlat} Impact: stay-out — stance is ${stance}, not a long.`
      : "No session stay-out rule fired — session liquidity did not force flat.",
  });

  items.push(equalPoolItem("eqh", obs, ctx, state, stance));
  items.push(equalPoolItem("eql", obs, ctx, state, stance));

  const mssUnknown = obs.market_structure === "unknown";
  items.push({
    concept: "mss",
    checked: !mssUnknown,
    evidence: {
      source: "structure.mss",
      prices: mss ? [mss.level] : undefined,
      swing: mss ? `${mss.direction} MSS` : undefined,
      candleTime: isoFromUnix(mss?.atTime),
      snapshotId: snap,
      status: obs.market_structure,
    },
    outcome: mssUnknown ? "uncertain" : obs.market_structure === "bullish" || obs.market_structure === "bearish" ? "true" : "false",
    impact:
      conflict.between === "primary_vs_htf"
        ? `Primary-horizon structure is ${primaryLean} — disagrees with HTF; forces ${stance}.`
        : mssUnknown
          ? "Market structure unknown — cannot use a structure break as true."
          : `Structure is ${obs.market_structure} — ${stance === "long" || stance === "short" ? "supports the stance" : "does not force a long or short by itself"}.`,
  });

  items.push({
    concept: "displacement",
    checked: obs.displacement !== "unknown",
    evidence: {
      source: "structure.displacement",
      status: obs.displacement,
      snapshotId: snap,
    },
    outcome:
      obs.displacement === "unknown" ? "uncertain" : obs.displacement === "present" ? "true" : "false",
    impact:
      obs.displacement === "present"
        ? "Displacement present — confirmation on the primary horizon."
        : obs.displacement === "absent"
          ? `Displacement absent — ${stance === "wait" || stance === "flat" || stance === "monitor" ? "supports not taking a directional stance" : "noted against a full confirmation"}.`
          : "Displacement unknown — not presented as true.",
  });

  const fvg = obs.fvg;
  items.push({
    concept: "fvg",
    checked: fvg.status !== "unknown",
    evidence: {
      source: "structure.fvg",
      prices: fvg.top != null && fvg.bottom != null ? [fvg.bottom, fvg.top] : undefined,
      status: `${fvg.status}${fvg.direction ? ` ${fvg.direction}` : ""}`,
      snapshotId: snap,
    },
    outcome: fvg.status === "unknown" ? "uncertain" : fvg.status === "present" ? "true" : "false",
    impact:
      fvg.status === "present"
        ? stance === "wait"
          ? `Unfilled fair value gap is the named wait trigger (${interpretation.entry_model || "retrace"}).`
          : `Fair value gap present — ${stance === "long" || stance === "short" ? "supports the entry model" : "does not override stance " + stance}.`
        : fvg.status === "unknown"
          ? "Fair value gap unknown — not presented as true."
          : `Fair value gap ${fvg.status} — no gap trigger for this stance.`,
  });

  return fillChainDefaults(items);
}

function citeConcepts(stance: DecisionStance, conflict: ConflictResolution, chain: ReasoningChainItem[]): string[] {
  const cited = new Set<string>();
  if (conflict.between === "primary_vs_htf") {
    cited.add("mss");
    cited.add("htf_bias");
  }
  if (conflict.between === "session_stay_out") cited.add("session_liquidity");
  if (conflict.between === "both_sides") {
    cited.add("liquidity_sweep_pdh");
    cited.add("liquidity_sweep_pdl");
  }
  if (stance === "wait") {
    for (const item of chain) {
      if (/wait|retrace|trigger/i.test(item.impact)) cited.add(item.concept);
    }
  }
  if (stance === "long" || stance === "short") {
    for (const id of ["mss", "fvg", "displacement", "htf_bias"] as const) {
      const row = chain.find((c) => c.concept === id);
      if (row && row.outcome === "true") cited.add(id);
    }
  }
  if (stance === "flat" || stance === "wait" || stance === "monitor") {
    for (const item of chain) {
      if (new RegExp(`\\b${stance}\\b|stay-out|disagree|UNPROVEN|not a long`, "i").test(item.impact)) {
        cited.add(item.concept);
      }
    }
  }
  return PLAYBOOK_CHAIN_CONCEPTS.filter((id) => cited.has(id));
}

export function buildConflictResolution(input: {
  observation: ReadonlyMarketObservation;
  interpretation: MarketInterpretation;
  decision: TradingDecision;
  primary: DecisionHorizon;
  htf: DecisionHorizon;
  stance: DecisionStance;
}): ConflictResolution {
  const { observation: obs, primary, htf, stance } = input;
  const oppose =
    (primary.lean === "bullish" && htf.lean === "bearish") ||
    (primary.lean === "bearish" && htf.lean === "bullish");

  if (oppose) {
    const takingLtf = input.decision.verdict === "LONG" || input.decision.verdict === "SHORT";
    const allowed = takingLtf;
    const bullishHorizon =
      primary.lean === "bullish" ? primary.timeframe : htf.lean === "bullish" ? htf.timeframe : "none";
    const bearishHorizon =
      primary.lean === "bearish" ? primary.timeframe : htf.lean === "bearish" ? htf.timeframe : "none";
    const sentence =
      `${htf.timeframe} context is ${htf.lean}; ${primary.timeframe} structure is ${primary.lean}; ` +
      `${bullishHorizon} is bullish and ${bearishHorizon} is bearish; ` +
      `LTF-against-HTF allowed: ${allowed ? "yes" : "no"} (current hypothesis — not validated); ` +
      (allowed
        ? `why: pipeline is taking a ${input.decision.verdict} on the ${primary.timeframe} against ${htf.timeframe} context — this is NOT an HTF reversal; `
        : `why: current architecture stay-flats when bias and structure disagree — neither HTF nor LTF automatically overrides; `) +
      `target that would make an against-HTF trade logical: ${input.decision.target != null ? input.decision.target.toFixed(2) : input.decision.entry_zone || "none named"}; ` +
      `invalidation: ${input.decision.invalidation != null ? input.decision.invalidation.toFixed(2) : "needs structure and bias to agree"}.`;
    return {
      conflict: true,
      between: "primary_vs_htf",
      winner: "neither",
      stance,
      sentence,
    };
  }
  if (shouldBlockLongFromSessionLiquidity(obs) && !isWaitForTrigger(input.decision, input.interpretation, obs)) {
    return {
      conflict: true,
      between: "session_stay_out",
      winner: "neither",
      stance,
      sentence:
        `Primary-horizon structure is ${primary.lean} on ${primary.timeframe}, but session liquidity stay-out applies. ` +
        `Stance is ${stance} — not a long because the high was swept.`,
    };
  }
  if (bothSidesTaken(obs)) {
    return {
      conflict: true,
      between: "both_sides",
      winner: "neither",
      stance,
      sentence:
        `Both previous day high and previous day low are taken. Stance is ${stance} until a fresh one-sided liquidity event.`,
    };
  }
  if (htf.lean === "unclear" || htf.lean === "neutral") {
    return {
      conflict: false,
      between: "none",
      winner: "neither",
      stance,
      sentence: `Higher-timeframe context is ${htf.lean} on ${htf.timeframe}; stance follows the primary horizon: ${stance}.`,
    };
  }
  return {
    conflict: false,
    between: "none",
    winner: "neither",
    stance,
    sentence:
      `No conflict — higher-timeframe ${htf.lean} agrees with primary-horizon ${primary.lean}; stance is ${stance}.`,
  };
}

function invalidationCondition(
  result: Pick<DeskPipelineResult, "observation" | "interpretation" | "decision">,
  stance: DecisionStance,
  conflict: ConflictResolution
): string {
  if (conflict.conflict && conflict.between === "primary_vs_htf") {
    return "Needs structure and bias to agree — not a long or short while they disagree.";
  }
  if (conflict.between === "session_stay_out") {
    return "Needs displacement or continuation lower, or stay flat — not a long because the high was swept.";
  }
  if (conflict.between === "both_sides") {
    return "Needs a fresh one-sided liquidity event before a directional lean.";
  }
  if (stance === "wait" && result.decision.entry_zone) {
    return `Waiting for a retrace into ${result.decision.entry_zone}; idea is wrong if that zone fails.`;
  }
  if (result.decision.invalidation != null) {
    return `Idea is wrong if price takes ${result.decision.invalidation.toFixed(2)}.`;
  }
  if (stance === "monitor") {
    return result.decision.verdict_reason || "No directional thesis until observation confirms one side.";
  }
  return (result.interpretation.reasoning || "What would change this stance is a structure shift that agrees with higher-timeframe context.").slice(0, 280);
}

function thesisAnswers(
  result: Pick<DeskPipelineResult, "observation" | "interpretation" | "decision">,
  primary: DecisionHorizon,
  stance: DecisionStance,
  condition: string
): ThesisAnswers {
  const what =
    result.interpretation.entry_model ||
    (stance === "long" || stance === "short" ? `${stance} on ${primary.timeframe}` : null);
  const whyNow =
    result.interpretation.reasoning?.slice(0, 220) ||
    (result.observation.displacement === "present" ? "displacement present on the tactical chart" : null);
  const timeframe = primary.timeframe;
  const toward =
    result.decision.target != null
      ? result.decision.target.toFixed(2)
      : result.interpretation.target != null
        ? result.interpretation.target.toFixed(2)
        : null;
  const fromWhere = result.decision.entry_zone;
  const invalidates =
    result.decision.invalidation != null ? result.decision.invalidation.toFixed(2) : condition || null;
  const complete = Boolean(what && whyNow && timeframe && toward && fromWhere && invalidates);
  return { what, whyNow, timeframe, toward, fromWhere, invalidates, complete };
}

function tradeableOpportunity(
  interp: MarketInterpretation,
  structure: HorizonLean
): TradeableOpportunity {
  if (interp.long_case.supported && !interp.short_case.supported) return "potential_long";
  if (interp.short_case.supported && !interp.long_case.supported) return "potential_short";
  if (structure === "bullish" && !interp.short_case.supported) return "potential_long";
  if (structure === "bearish" && !interp.long_case.supported) return "potential_short";
  return "none";
}

function overallStanceLine(
  stance: DecisionStance,
  primary: DecisionHorizon,
  htf: DecisionHorizon,
  direction: TradeDirection
): string {
  if (direction === "LONG" && htf.lean === "bearish") {
    return `SHORT-TERM LONG / HTF BEARISH`;
  }
  if (direction === "SHORT" && htf.lean === "bullish") {
    return `SHORT-TERM SHORT / HTF BULLISH`;
  }
  if (direction === "LONG" && htf.lean === "bullish") return `LONG / HTF BULLISH`;
  if (direction === "SHORT" && htf.lean === "bearish") return `SHORT / HTF BEARISH`;
  if (
    (primary.lean === "bullish" && htf.lean === "bearish") ||
    (primary.lean === "bearish" && htf.lean === "bullish")
  ) {
    return `${stance.toUpperCase()} — ${primary.timeframe} ${primary.lean} vs ${htf.timeframe} ${htf.lean}`;
  }
  return `${stance.toUpperCase()} — ${primary.timeframe} ${primary.lean} / ${htf.timeframe} ${htf.lean}`;
}

function executionLine(
  stance: DecisionStance,
  decision: TradingDecision
): string {
  if (stance === "long" || stance === "short") {
    return decision.entry_zone
      ? `take the ${stance} provided price respects ${decision.entry_zone}`
      : `take the ${stance} side`;
  }
  if (stance === "wait") {
    return decision.entry_zone
      ? `WAIT FOR: retrace into ${decision.entry_zone} — no order yet`
      : "WAIT FOR: a specific retrace, fair value gap, or structure confirmation — no order yet";
  }
  if (stance === "flat") return "no order — stay flat";
  return "no order — monitor";
}

function mapConfidence(
  result: Pick<DeskPipelineResult, "observation" | "data_quality_report">,
  stance: DecisionStance,
  conflict: ConflictResolution
): DecisionConfidence {
  const flag = result.observation.data_quality;
  if (flag === "missing" || flag === "stale") return "unknown";
  if (flag === "degraded") return "low";
  if (conflict.conflict || stance === "wait" || stance === "flat") return "medium";
  if (stance === "monitor") return "low";
  return "high";
}

/** Build envelope from existing pipeline objects — no new market facts. */
export function buildDecisionEnvelope(
  result: Pick<DeskPipelineResult, "observation" | "interpretation" | "decision" | "data_quality_report">,
  ctx?: MarketContext,
  state?: MarketState
): DecisionEnvelope {
  const mtf = buildMtfHorizonSummaries({ observation: result.observation, ctx, state });
  const primaryLean = mapLean(
    result.observation.market_structure === "unclear" ? "unclear" : result.observation.market_structure
  );
  const htfLean = mapLean(result.observation.htf_bias.tradeable_bias);
  const stance = resolveStance(result);

  const primaryHorizon: DecisionHorizon = {
    id: "primary",
    timeframe: mtf.short_label,
    lean: primaryLean,
    role: "stance",
    summary: mtf.short,
  };
  const htfContext: DecisionHorizon = {
    id: "htf",
    timeframe: mtf.long_label.includes("daily") ? "daily" : mtf.long_label,
    lean: htfLean,
    role: "context",
    summary: mtf.long,
  };

  const conflictResolution = buildConflictResolution({
    observation: result.observation,
    interpretation: result.interpretation,
    decision: result.decision,
    primary: primaryHorizon,
    htf: htfContext,
    stance,
  });

  let reasoningChain = buildReasoningChain({
    observation: result.observation,
    interpretation: result.interpretation,
    decision: result.decision,
    ctx,
    state,
    stance,
    conflict: conflictResolution,
  });
  const citedConcepts = citeConcepts(stance, conflictResolution, reasoningChain);
  reasoningChain = applyConceptRoles(reasoningChain, citedConcepts);
  const invPrice =
    result.decision.invalidation != null ? result.decision.invalidation.toFixed(2) : "unknown";
  const condition = invalidationCondition(result, stance, conflictResolution);
  const thesis = thesisAnswers(result, primaryHorizon, stance, condition);
  let namedStance = stance;
  if ((stance === "long" || stance === "short") && !thesis.complete) {
    namedStance = result.decision.entry_zone ? "wait" : "monitor";
  }
  const opportunity = tradeableOpportunity(result.interpretation, primaryLean);
  const tradeDirection: TradeDirection =
    namedStance === "long" ? "LONG" : namedStance === "short" ? "SHORT" : "NONE";
  const oppose =
    (primaryLean === "bullish" && htfLean === "bearish") ||
    (primaryLean === "bearish" && htfLean === "bullish");
  const takingAgainst =
    oppose && (result.decision.verdict === "LONG" || result.decision.verdict === "SHORT");
  const conflictLog: ConflictLog = {
    htfHorizon: htfContext.timeframe,
    htfLean,
    tacticalHorizon: primaryHorizon.timeframe,
    tacticalLean: primaryLean,
    disagree: oppose,
    ltfAgainstHtfAllowed: oppose ? takingAgainst : null,
    why: conflictResolution.sentence,
    target:
      result.decision.target != null
        ? result.decision.target.toFixed(2)
        : result.decision.entry_zone,
    invalidation: result.decision.invalidation != null ? result.decision.invalidation.toFixed(2) : condition,
  };
  const read: HorizonRead = {
    htfContext: { horizon: htfContext.timeframe, lean: htfLean },
    currentStructure: { horizon: primaryHorizon.timeframe, lean: primaryLean },
    tradeableOpportunity: opportunity,
    tradeDirection,
    target: thesis.toward || "none named",
    invalidation: condition,
    overallStance: overallStanceLine(namedStance, primaryHorizon, htfContext, tradeDirection),
  };
  const facts =
    formatObservationNarrative(result.observation).slice(0, 800) ||
    `Observed data quality ${result.observation.data_quality}; structure ${result.observation.market_structure}.`;
  const againstNote =
    oppose && tradeDirection !== "NONE"
      ? `Short-term ${tradeDirection.toLowerCase()} against ${htfContext.timeframe} ${htfLean} context; this is NOT an HTF reversal.`
      : oppose
        ? `Tactical ${primaryHorizon.timeframe} ${primaryLean} vs ${htfContext.timeframe} ${htfLean} — not named as a trade under current hypothesis.`
        : "";
  const decisionText = [
    `Overall stance: ${read.overallStance}.`,
    `HTF context is ${htfContext.timeframe} ${htfLean}. Current structure is ${primaryHorizon.timeframe} ${primaryLean}.`,
    conflictResolution.sentence,
    againstNote,
    citedConcepts.length ? `Cites: ${citedConcepts.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const logicOrder = {
    strategicBias: `${htfContext.timeframe} — ${htfLean} (context only)`,
    tacticalBias: `${primaryHorizon.timeframe} — ${primaryLean}. ${conflictResolution.sentence} Stance: ${namedStance}.`,
    execution: executionLine(namedStance, result.decision),
    invalidation: condition,
  };

  return {
    primaryHorizon,
    htfContext,
    stance: namedStance,
    conflictResolution: { ...conflictResolution, stance: namedStance },
    conflictLog,
    thesis,
    read,
    confidence: mapConfidence(result, namedStance, conflictResolution),
    invalidation: { price: invPrice, condition },
    logicOrder,
    layers: {
      facts,
      interpretation: [
        result.interpretation.reasoning || "No additional interpretation beyond observed facts.",
        againstNote,
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 800),
      decision: decisionText,
      invalidation: condition,
    },
    reasoningChain,
    citedConcepts,
  };
}

export function formatReasoningChain(chain: ReasoningChainItem[]): string {
  return chain
    .map((item) => {
      const ev = item.evidence;
      const bits = [
        ev.status ? `status=${ev.status}` : "",
        ev.prices?.length ? `prices=${ev.prices.map((p) => p.toFixed(2)).join(",")}` : "",
        ev.candleId ? `candle=${ev.candleId}` : "",
        ev.candleTime ? `time=${ev.candleTime}` : "",
        ev.swing ? `swing=${ev.swing}` : "",
        ev.tolerance != null ? `tolerance=${ev.tolerance.toFixed(2)}` : "",
        ev.close != null ? `close=${ev.close.toFixed(2)}` : "",
      ].filter(Boolean);
      return `- [${item.concept}] checked=${item.checked ? "yes" : "no"} detected=${item.detected ? "yes" : "no"} used=${item.role} outcome=${item.outcome} evidence=${bits.join(" ") || ev.source} impact=${item.impact}`;
    })
    .join("\n");
}

export function formatDecisionEnvelope(env: DecisionEnvelope): string {
  const t = env.thesis;
  const log = env.conflictLog;
  return [
    `HTF CONTEXT: ${env.read.htfContext.horizon} — ${env.read.htfContext.lean}`,
    `CURRENT STRUCTURE: ${env.read.currentStructure.horizon} — ${env.read.currentStructure.lean}`,
    `TRADEABLE OPPORTUNITY: ${env.read.tradeableOpportunity.replace(/_/g, " ")}`,
    `TRADE DIRECTION: ${env.read.tradeDirection}`,
    `TARGET: ${env.read.target}`,
    `INVALIDATION: ${env.read.invalidation}`,
    `OVERALL STANCE: ${env.read.overallStance}`,
    `THESIS: what=${t.what || "unanswered"} | whyNow=${t.whyNow || "unanswered"} | timeframe=${t.timeframe || "unanswered"} | toward=${t.toward || "unanswered"} | fromWhere=${t.fromWhere || "unanswered"} | invalidates=${t.invalidates || "unanswered"} | complete=${t.complete ? "yes" : "no"}`,
    `CONFLICT LOG: ${log.htfHorizon} ${log.htfLean}; ${log.tacticalHorizon} ${log.tacticalLean}; disagree=${log.disagree}; ltfAgainstHtfAllowed=${String(log.ltfAgainstHtfAllowed)}; why=${log.why}`,
    `STRATEGIC BIAS: ${env.logicOrder.strategicBias}`,
    `TACTICAL BIAS: ${env.logicOrder.tacticalBias}`,
    `EXECUTION: ${env.logicOrder.execution}`,
    `STANCE: ${env.stance}`,
    `CONFIDENCE: ${env.confidence}`,
    "",
    "FACTS:",
    env.layers.facts,
    "",
    "INTERPRETATION:",
    env.layers.interpretation,
    "",
    "DECISION:",
    env.layers.decision,
    "",
    "INVALIDATION:",
    env.layers.invalidation,
    "",
    "REASONING CHAIN:",
    formatReasoningChain(env.reasoningChain),
  ].join("\n");
}

/** True when a trader can read the hypothesis order top-down without stitching. */
export function isTopDownReadable(text: string): boolean {
  const s = text.toUpperCase();
  const seven = [
    "HTF CONTEXT",
    "CURRENT STRUCTURE",
    "TRADEABLE OPPORTUNITY",
    "TRADE DIRECTION",
    "TARGET",
    "INVALIDATION",
    "OVERALL STANCE",
  ];
  let last = -1;
  for (const label of seven) {
    const i = s.indexOf(label);
    if (i < 0 || i <= last) return false;
    last = i;
  }
  const a = s.indexOf("STRATEGIC BIAS");
  const b = s.indexOf("TACTICAL BIAS");
  const exec = s.indexOf("EXECUTION:");
  return a > last && b > a && exec > b;
}

const HORIZON_NEAR =
  /daily|minute|hour|htf|higher-timeframe|primary|tactical|strategic|context|structure|1-minute|15-minute|5-minute|4h|1h|15m|5m|1m|execution|short-term|overall stance|trade direction|trade decision|mentor view|stance|fvg|gap|fair value|mss|displacement|sweep|pool|equal/i;

/** Bullish/bearish/LONG/SHORT must sit next to a named horizon. */
export function unlabeledDirectionalLeans(text: string): string[] {
  const errors: string[] = [];
  const re = /\b(bullish|bearish)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = Math.max(0, m.index - 56);
    const window = text.slice(start, m.index + m[0].length + 20);
    if (!HORIZON_NEAR.test(window)) {
      errors.push(`unlabeled ${m[0].toLowerCase()}`);
    }
  }
  // Case-sensitive: lowercase "long"/"short" in chain/mentor copy is not a trade call.
  const dirRe = /\b(LONG|SHORT)\b/g;
  while ((m = dirRe.exec(text))) {
    const start = Math.max(0, m.index - 56);
    const window = text.slice(start, m.index + m[0].length + 24);
    if (
      /short-term|long term|short term|trade direction|tradeable|overall stance|stance:|stance role|execution|mentor view|trade decision|wait for|potential|not a long|force a long|force a short|htf reversal|consider (a )?(long|short)|rejected (long|short)|(long|short) because|(long|short) bias/i.test(
        window
      )
    ) {
      continue;
    }
    if (!HORIZON_NEAR.test(window)) {
      errors.push(`unlabeled ${m[0]}`);
    }
  }
  return errors;
}

export function compactChainForVoice(env: DecisionEnvelope, max = 4): string {
  const cited = new Set(env.citedConcepts);
  const rows = env.reasoningChain.filter(
    (item) => cited.has(item.concept) || item.outcome === "uncertain" || (item.checked && item.outcome === "true" && /force|flat|wait|UNPROVEN/i.test(item.impact))
  );
  const pick = (rows.length ? rows : env.reasoningChain.filter((i) => i.checked)).slice(0, max);
  return pick
    .map((item) => {
      if (item.concept.startsWith("liquidity_sweep") && item.outcome !== "true") {
        return `${item.concept.replace("liquidity_sweep_", "previous day ")} ${item.outcome === "uncertain" ? "unproven, not taken" : "not taken"}`;
      }
      if (item.concept === "mss") return `structure ${env.primaryHorizon.lean}`;
      if (item.concept === "htf_bias") return `daily ${env.htfContext.lean}`;
      if (item.concept === "fvg") return item.outcome === "true" ? "fair value gap present" : "no active fair value gap";
      if (item.concept === "session_liquidity" && item.outcome === "true") return "session stay-out";
      return `${item.concept} ${item.outcome}`;
    })
    .join("; ");
}

export function claimedSweepMissingProvenance(item: ReasoningChainItem): boolean {
  if (!/^liquidity_sweep_/i.test(item.concept)) return false;
  if (item.outcome !== "true") return false;
  const hasTime = Boolean(item.evidence.candleTime);
  const hasCandle = Boolean(item.evidence.candleId || item.evidence.swing);
  return !(hasTime && hasCandle);
}

export function equalPoolMissingProvenance(item: ReasoningChainItem): boolean {
  if (item.concept !== "eqh" && item.concept !== "eql") return false;
  if (item.outcome !== "true") return false;
  return item.evidence.tolerance == null || !item.evidence.candleTime;
}

/** Envelope-level validation — no live session required. */
export function validateDecisionEnvelope(env: DecisionEnvelope): string[] {
  const errors: string[] = [];
  if (!STANCES.has(env.stance)) errors.push(`stance not in enum: ${env.stance}`);
  for (const key of ["facts", "interpretation", "decision", "invalidation"] as const) {
    if (!String(env.layers[key] || "").trim()) errors.push(`missing layer ${key}`);
  }
  if (!env.primaryHorizon.timeframe || !env.primaryHorizon.lean) {
    errors.push("primary horizon not self-contained");
  }
  if (!env.htfContext.timeframe || !env.htfContext.lean) {
    errors.push("htf context not self-contained");
  }
  if (!env.conflictResolution.sentence.trim()) errors.push("conflict resolution sentence empty");
  if (!env.invalidation.condition.trim()) errors.push("invalidation condition empty");
  if (!env.logicOrder?.strategicBias || !env.logicOrder.tacticalBias || !env.logicOrder.execution) {
    errors.push("logicOrder not self-contained");
  }

  if (!env.thesis || env.thesis.complete === undefined) errors.push("thesis missing");
  if (!env.read?.htfContext?.horizon || !env.read.currentStructure?.horizon) {
    errors.push("seven-layer read not self-contained");
  }
  if (!env.conflictLog) errors.push("conflictLog missing");

  const oppose =
    (env.primaryHorizon.lean === "bullish" && env.htfContext.lean === "bearish") ||
    (env.primaryHorizon.lean === "bearish" && env.htfContext.lean === "bullish");
  if (oppose) {
    if (!env.conflictLog.disagree) errors.push("HTF ≠ tactical but conflictLog.disagree is false");
    if (env.conflictLog.ltfAgainstHtfAllowed === null) {
      errors.push("conflict log missing ltfAgainstHtfAllowed");
    }
    if (!/ltf-against-htf allowed/i.test(env.conflictResolution.sentence)) {
      errors.push("conflict sentence must say whether LTF-against-HTF is allowed");
    }
  }

  if ((env.stance === "long" || env.stance === "short") && !env.thesis.complete) {
    errors.push("incomplete thesis cannot be named long/short");
  }

  const present = new Set(env.reasoningChain.map((i) => i.concept));
  for (const id of PLAYBOOK_CHAIN_CONCEPTS) {
    if (!present.has(id)) errors.push(`playbook concept omitted: ${id}`);
  }

  for (const item of env.reasoningChain) {
    if (claimedSweepMissingProvenance(item)) {
      errors.push(`claimed sweep ${item.concept} missing candle+timestamp`);
    }
    if (equalPoolMissingProvenance(item)) {
      errors.push(`claimed ${item.concept} missing tolerance+timestamps`);
    }
    if (typeof item.detected !== "boolean" || typeof item.usedInDecision !== "boolean") {
      errors.push(`${item.concept} missing detected vs used`);
    }
    if (item.role !== "PRIMARY" && item.role !== "SUPPORTING" && item.role !== "NONE") {
      errors.push(`${item.concept} missing detected-vs-used role`);
    }
    if (item.detected && item.role == null) errors.push(`${item.concept} missing detected-vs-used role`);
  }

  const directionalLean =
    env.primaryHorizon.lean === "bullish" ||
    env.primaryHorizon.lean === "bearish" ||
    env.htfContext.lean === "bullish" ||
    env.htfContext.lean === "bearish";
  if (directionalLean && (env.stance === "flat" || env.stance === "wait" || env.stance === "monitor")) {
    const explains = env.reasoningChain.some((item) =>
      /flat|wait|monitor|disagree|stay-out|not a long|UNPROVEN|stay-flats|hypothesis/i.test(item.impact)
    );
    if (!explains) errors.push("lean-without-why: directional lean with non-directional stance and no chain impact");
    if (env.stance === "flat" && (env.htfContext.lean === "bullish" || env.primaryHorizon.lean === "bullish")) {
      const flatWhy = env.reasoningChain.some((item) => /flat|disagree|stay-out|not a long|stay-flats/i.test(item.impact));
      if (!flatWhy) errors.push("bullish but flat requires chain impact explaining flat");
    }
  }

  if ((env.stance === "flat" || env.stance === "wait") && env.citedConcepts.length === 0) {
    errors.push("stance must cite chain items");
  }

  return errors;
}

/** Spoken/panel text may not lean a side without the resolution sentence when stance is non-directional. */
export function assertNoLeanWithoutWhy(env: DecisionEnvelope, text: string): string[] {
  const errors: string[] = [];
  if (env.stance === "long" || env.stance === "short") return errors;
  const leans = /\b(leaning|lean)\s+(bullish|bearish|long|short)\b/i.test(text);
  if (!leans) return errors;
  if (!env.conflictResolution.sentence || !text.includes(env.conflictResolution.sentence.slice(0, 40))) {
    errors.push("lean-without-why: directional lean in text without conflict/resolution line");
  }
  return errors;
}
