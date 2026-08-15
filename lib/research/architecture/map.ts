/**
 * Read-only map of Karen's EXISTING decision architecture.
 * Source of truth: lib/decision-envelope.ts + lib/decision-layer.ts +
 * lib/interpretation-engine.ts + lib/observation-engine.ts.
 * Do not treat this as a new strategy.
 */

import { PLAYBOOK_CHAIN_CONCEPTS } from "../../decision-envelope";

export const CURRENT_ARCHITECTURE_ID = "architecture-v1" as const;

/** Production has no ICT weighted rollup — boolean confluence only. */
export const PRODUCTION_WEIGHTS = "none" as const;

export const SEVEN_LAYERS = [
  { field: "read.htfContext", layer: "Higher-timeframe context" },
  { field: "read.currentStructure", layer: "Current / tactical structure" },
  { field: "read.tradeableOpportunity", layer: "Tradeable opportunity" },
  { field: "read.tradeDirection", layer: "Trade direction" },
  { field: "read.target", layer: "Target" },
  { field: "read.invalidation", layer: "Invalidation" },
  { field: "read.overallStance", layer: "Overall stance" },
] as const;

export const DECISION_OUTPUTS = ["LONG", "SHORT", "WAIT", "NO_TRADE"] as const;
export const ENVELOPE_STANCES = ["long", "short", "flat", "wait", "monitor"] as const;

export const CONFLICT_RULES = {
  primary_vs_htf:
    "Existing buildTradingDecision stay-flats on bias-vs-structure. Envelope winner=neither, ltfAgainstHtfAllowed=false unless pipeline actually LONG/SHORT against HTF.",
  session_stay_out: "Buy-side session/PD high raid is not a long — stay flat.",
  both_sides: "PDH and PDL both taken → wait/flat until a fresh one-sided event.",
  none: "No blocking conflict — stance follows one-sided interpretation + entry readiness.",
} as const;

export const DETECTORS = {
  htf_bias: "observation.htf_bias.tradeable_bias (daily-led bias stack)",
  premium_discount: "observation.premium_discount.zone",
  liquidity_sweep_pdh: "PDH level + CLOSED_BEYOND provenance (UNPROVEN ≠ taken)",
  liquidity_sweep_pdl: "PDL, same provenance",
  session_liquidity: "Asia/London/NY levels + sessionLiquidityStayFlatReason",
  eqh: "observation.reh_rel REH + structureFacts.relativeEqualPools type reh",
  eql: "REL / type rel",
  mss: "structureFacts.mss / observation.market_structure",
  displacement: "observation.displacement (1m body vs lookback average)",
  fvg: "observation.fvg from structureFacts.m1UnfilledFvgs",
} as const;

export const ENTRY_MODEL =
  "Unchanged production: interpretation.entry_model (NY sweep+displacement+FVG, displacement+FVG retrace, or structure continuation) + getExecutionScaffold FVG zone. WAIT if entryStatus WAIT/EXTENDED.";

export const INVALIDATION_MODEL =
  "Unchanged production: below lowest swept level (LONG) or above highest swept (SHORT), else MSS level ±5. Envelope names existing price or stay-flat condition.";

/**
 * DETECTED CONCEPTS → EXISTING ARCHITECTURE → FINAL DECISION
 * Interpretation uses a subset; envelope records the full playbook checklist.
 */
export const CONCEPT_TO_ARCHITECTURE = [
  {
    concept: "htf_bias",
    architecture: "Layer 1 HTF context + interpretation long/short reasons + conflict if opposed to structure",
    decision: "Does not by itself set LONG/SHORT. Opposes structure → contradiction → stay-flat (v1).",
  },
  {
    concept: "mss",
    architecture: "Layer 2 tactical structure; interpretation long/short reasons",
    decision: "Primary lean for stance. Conflict with HTF stay-flats under v1.",
  },
  {
    concept: "liquidity_sweep_pdh",
    architecture: "Observation liquidity + both-sides conflict + session stay-out if buy-side raid",
    decision: "Taken PDH is not automatically SHORT. Both PDH+PDL → WAIT. Provenance required.",
  },
  {
    concept: "liquidity_sweep_pdl",
    architecture: "Sell-side raid can support long reasons",
    decision: "Confluence only — still needs structure + FVG known and no opposing HTF.",
  },
  {
    concept: "session_liquidity",
    architecture: "shouldBlockLongFromSessionLiquidity",
    decision: "Can force WAIT/flat regardless of bullish 1m structure.",
  },
  {
    concept: "fvg",
    architecture: "Entry zone + interpretation confluence (need ≥2 reasons)",
    decision: "Unknown FVG → NO_TRADE. Present FVG supplies entry_zone and a long/short reason.",
  },
  {
    concept: "displacement",
    architecture: "Interpretation confluence; unknown → NO_TRADE",
    decision: "Present after SSL sweep can support LONG. Not a standalone verdict.",
  },
  {
    concept: "eqh",
    architecture: "Envelope playbook row from reh_rel. NOT in interpretation long/short reason lists.",
    decision: "Typically DETECTED with role NONE — recorded, usually unused by verdict math.",
  },
  {
    concept: "eql",
    architecture: "Same as eqh for equal lows",
    decision: "Typically DETECTED with role NONE unless cited for a stay-flat impact.",
  },
  {
    concept: "premium_discount",
    architecture: "Observation fact; envelope chain. Not a weighted score.",
    decision: "Context only in current pipeline — does not flip LONG/SHORT by itself.",
  },
] as const;

export const PLAYBOOK_CONCEPTS = PLAYBOOK_CHAIN_CONCEPTS;

export const PIPELINE_LOGIC_ORDER = [
  "DATA (snapshot)",
  "OBSERVATION (frozen facts)",
  "INTERPRETATION (meaning, no new prices)",
  "EXECUTION SCAFFOLD (existing FVG/plan)",
  "PIPELINE VERDICT (LONG|SHORT|WAIT|NO_TRADE)",
  "ENVELOPE (naming: seven layers + chain + conflict log)",
] as const;
