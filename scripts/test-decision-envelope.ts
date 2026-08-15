/**
 * Decision envelope + reasoning chain — no live TradingView session.
 * Run: npm run test:decision-envelope
 */
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES, baseCtx, baseState } from "../lib/replay-fixtures";
import { formatAnalysisContract } from "../lib/analysis-contract";
import { narrateAnalysisContractForVoice } from "../lib/voice-analysis-narrator";
import {
  PLAYBOOK_CHAIN_CONCEPTS,
  assertNoLeanWithoutWhy,
  claimedSweepMissingProvenance,
  formatDecisionEnvelope,
  isTopDownReadable,
  unlabeledDirectionalLeans,
  validateDecisionEnvelope,
  type DecisionEnvelope,
  type ReasoningChainItem,
} from "../lib/decision-envelope";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const STANCES = new Set(["long", "short", "flat", "wait", "monitor"]);

const waitPipe = runDeskPipeline(
  REPLAY_FIXTURES["bullish-wait"].ctx,
  REPLAY_FIXTURES["bullish-wait"].state
);
const waitEnv = waitPipe.analysis_contract!.decision!;
assert(waitEnv, "bullish-wait has envelope");
assert(STANCES.has(waitEnv.stance), "stance is in enum");
assert(validateDecisionEnvelope(waitEnv).length === 0, validateDecisionEnvelope(waitEnv).join("; ") || "wait envelope valid");

const formatted = formatAnalysisContract(waitPipe.analysis_contract!);
assert(isTopDownReadable(formatted), "formatted contract is top-down readable");
assert(/HTF CONTEXT:/i.test(formatted), "seven-layer HTF context labeled");
assert(/CURRENT STRUCTURE:/i.test(formatted), "seven-layer current structure labeled");
assert(/TRADEABLE OPPORTUNITY:/i.test(formatted), "seven-layer opportunity labeled");
assert(/TRADE DIRECTION:/i.test(formatted), "seven-layer trade direction labeled");
assert(/OVERALL STANCE:/i.test(formatted), "seven-layer overall stance labeled");
assert(/THESIS:/i.test(formatted), "thesis labeled");
assert(/CONFLICT LOG:/i.test(formatted), "conflict log labeled");
assert(/TACTICAL BIAS:/i.test(formatted), "tactical bias labeled");
assert(/EXECUTION:/i.test(formatted), "execution labeled");
assert(/\nINVALIDATION:/i.test(formatted) || /^INVALIDATION:/im.test(formatted), "invalidation labeled");
assert(/FACTS:/i.test(formatted) && /INTERPRETATION:/i.test(formatted) && /DECISION:/i.test(formatted), "four layers present");
assert(/REASONING CHAIN:/i.test(formatted), "reasoning chain present");
for (const id of PLAYBOOK_CHAIN_CONCEPTS) {
  assert(waitEnv.reasoningChain.some((c) => c.concept === id), `playbook concept present: ${id}`);
}

assert(waitEnv.primaryHorizon.timeframe && waitEnv.htfContext.timeframe, "self-contained horizons");
assert(waitEnv.conflictResolution.sentence.length > 20, "self-contained conflict sentence");
assert(waitEnv.logicOrder.strategicBias && waitEnv.logicOrder.tacticalBias, "logicOrder filled");

const base = baseCtx();
const conflict = runDeskPipeline(
  baseCtx({
    structureFacts: {
      ...base.structureFacts,
      mss: {
        direction: "bearish",
        level: 25080,
        at: "10:05",
        atTime: 1700000000,
        description: "Bearish market structure shift",
      },
      liquiditySweeps: [
        ...base.structureFacts.liquiditySweeps,
        {
          levelId: "pdh",
          label: "PDH",
          price: 25200,
          side: "buy_side",
          at: "10:12",
          atTime: 1700000000,
        },
        {
          levelId: "pdc",
          label: "PDC",
          price: 25000,
          side: "buy_side",
          at: "10:08",
          atTime: 1700000000,
        },
      ],
    },
  }),
  baseState({ stateHash: "envelope-htf-vs-primary-001" })
);
const conflictEnv = conflict.analysis_contract!.decision!;
assert(conflictEnv.stance === "flat" || conflictEnv.stance === "wait" || conflictEnv.stance === "monitor", "conflict is one non-long/short stance");
assert(conflictEnv.stance !== "long" && conflictEnv.stance !== "short", "HTF long vs primary short is not a directional trade");
assert(/LTF-against-HTF allowed/i.test(conflictEnv.conflictResolution.sentence), "conflict resolution sentence present");
assert(conflictEnv.conflictLog.disagree === true, "conflict log present when HTF ≠ tactical");
assert(conflictEnv.conflictLog.ltfAgainstHtfAllowed === false, "current architecture does not auto-allow LTF against HTF");
assert(Boolean(conflictEnv.conflictLog.why), "conflict log records why");
assert(conflictEnv.conflictLog.target !== undefined, "conflict log records would-be target");
assert(Boolean(conflictEnv.conflictLog.invalidation), "conflict log records invalidation");
assert(
  (conflictEnv.conflictLog.htfLean === "bullish" && conflictEnv.conflictLog.tacticalLean === "bearish") ||
    (conflictEnv.conflictLog.htfLean === "bearish" && conflictEnv.conflictLog.tacticalLean === "bullish"),
  "conflict log names which horizon is bullish and which is bearish"
);
assert(conflictEnv.read.htfContext.lean && conflictEnv.read.currentStructure.lean, "seven layers have labeled leans");
assert(conflictEnv.read.tradeDirection === "NONE", "trade direction is not collapsed into HTF lean");
assert(conflictEnv.conflictResolution.winner === "neither", "neither horizon wins a trade");
const conflictText = formatDecisionEnvelope(conflictEnv);
assert(isTopDownReadable(conflictText), "conflict envelope top-down");
assert(conflictEnv.citedConcepts.includes("mss") || conflictEnv.citedConcepts.includes("htf_bias"), "stance cites chain");
const flatWhy = conflictEnv.reasoningChain.some((i) => /flat|disagree|not a long/i.test(i.impact));
assert(flatWhy, "bullish-but-flat requires chain impact explaining flat");
assert(validateDecisionEnvelope(conflictEnv).length === 0, validateDecisionEnvelope(conflictEnv).join("; "));

const leanText = "I'm leaning bullish here but stay flat.";
const leanErrors = assertNoLeanWithoutWhy(conflictEnv, leanText);
assert(leanErrors.length > 0, "lean-without-why is invalid without resolution line in the spoken text");

const voice = narrateAnalysisContractForVoice(conflict.analysis_contract!);
assert(/monitor|flat|stay flat/i.test(voice), "voice names the non-directional stance");
assert(!/leaning bullish/i.test(voice), "voice does not open leaning bullish on conflict");
assert(/htf context|higher timeframe/i.test(voice), "voice names HTF context");
assert(/current structure|1-minute/i.test(voice), "voice names tactical structure");

const badSweep: ReasoningChainItem = {
  concept: "liquidity_sweep_pdh",
  checked: true,
  detected: true,
  usedInDecision: false,
  role: "NONE",
  evidence: { source: "test", prices: [25200], status: "SWEPT" },
  outcome: "true",
  impact: "claimed taken",
};
assert(claimedSweepMissingProvenance(badSweep), "claimed sweep without candle+timestamp is invalid");

const goodSweep: ReasoningChainItem = {
  concept: "liquidity_sweep_pdh",
  checked: true,
  detected: true,
  usedInDecision: true,
  role: "PRIMARY",
  evidence: {
    source: "test",
    prices: [25200],
    swing: "PDH",
    candleId: "m1:1700000000",
    candleTime: "2023-11-14T22:13:20.000Z",
    close: 25201,
  },
  outcome: "true",
  impact: "proven",
};
assert(!claimedSweepMissingProvenance(goodSweep), "proven sweep with candle+timestamp is valid");

const pdhRow = conflictEnv.reasoningChain.find((c) => c.concept === "liquidity_sweep_pdh")!;
assert(pdhRow.outcome !== "true" || (Boolean(pdhRow.evidence.candleTime) && Boolean(pdhRow.evidence.candleId || pdhRow.evidence.swing)), "true PDH sweep has provenance");
if (pdhRow.outcome === "uncertain") {
  assert(/UNPROVEN|not taken/i.test(pdhRow.impact), "unproven PDH not presented as taken");
}

const broken: DecisionEnvelope = {
  ...conflictEnv,
  reasoningChain: conflictEnv.reasoningChain.map((item) =>
    item.concept === "liquidity_sweep_pdh"
      ? { ...item, outcome: "true", evidence: { source: "fake", prices: [25200] } }
      : item
  ),
};
assert(
  validateDecisionEnvelope(broken).some((e) => /missing candle\+timestamp/i.test(e)),
  "validator rejects claimed sweep without provenance"
);

const noFlatWhy: DecisionEnvelope = {
  ...conflictEnv,
  stance: "flat",
  htfContext: { ...conflictEnv.htfContext, lean: "bullish" },
  reasoningChain: conflictEnv.reasoningChain.map((item) => ({
    ...item,
    impact: "noted",
  })),
};
assert(
  validateDecisionEnvelope(noFlatWhy).some((e) => /flat|lean-without-why/i.test(e)),
  "bullish but flat without chain impact is invalid"
);

assert(unlabeledDirectionalLeans("I'm bullish").length > 0, "unlabeled bullish is invalid");
assert(unlabeledDirectionalLeans("I'm bearish here").length > 0, "unlabeled bearish is invalid");
assert(
  unlabeledDirectionalLeans("HTF context: daily bearish. Current structure: 1-minute bullish.").length === 0,
  "labeled leans are valid"
);
assert(unlabeledDirectionalLeans(conflictText).length === 0, "formatted envelope has no unlabeled leans");

const incomplete = {
  ...waitEnv,
  stance: "long" as const,
  thesis: {
    what: null,
    whyNow: null,
    timeframe: "1-minute",
    toward: null,
    fromWhere: null,
    invalidates: null,
    complete: false,
  },
};
assert(
  validateDecisionEnvelope(incomplete).some((e) => /incomplete thesis/i.test(e)),
  "incomplete thesis cannot be named long"
);

assert(
  conflictEnv.reasoningChain.every(
    (i) =>
      typeof i.detected === "boolean" &&
      typeof i.usedInDecision === "boolean" &&
      (i.role === "PRIMARY" || i.role === "SUPPORTING" || i.role === "NONE")
  ),
  "every chain row has detected vs used"
);
assert(
  conflictEnv.reasoningChain.some((i) => i.role === "PRIMARY"),
  "at least one concept is used as PRIMARY"
);

const detectedUnused: DecisionEnvelope = {
  ...conflictEnv,
  reasoningChain: conflictEnv.reasoningChain.map((item) =>
    item.concept === "eqh"
      ? {
          ...item,
          checked: true,
          detected: true,
          usedInDecision: false,
          role: "NONE",
          outcome: "true",
          evidence: {
            source: "test",
            prices: [25120, 25122],
            tolerance: 1.5,
            candleTime: "2023-11-14T22:13:20.000Z",
            swing: "25120@2023-11-14T22:13:20.000Z + 25122@2023-11-14T22:14:20.000Z",
          },
          impact: "equal highs detected — liquidity context only, role NONE",
        }
      : item
  ),
};
assert(
  detectedUnused.reasoningChain.some((i) => i.concept === "eqh" && i.detected && i.role === "NONE" && !i.usedInDecision),
  "detected is not the same as used"
);
assert(validateDecisionEnvelope(detectedUnused).length === 0, validateDecisionEnvelope(detectedUnused).join("; "));

const againstHtf: DecisionEnvelope = {
  ...conflictEnv,
  stance: "long",
  thesis: {
    what: "1-minute long after displacement",
    whyNow: "tactical structure shifted bullish into an unfilled gap",
    timeframe: "1-minute",
    toward: "24800.00",
    fromWhere: "25085-25095",
    invalidates: "25080.00",
    complete: true,
  },
  read: {
    ...conflictEnv.read,
    htfContext: { horizon: "daily", lean: "bearish" },
    currentStructure: { horizon: "1-minute", lean: "bullish" },
    tradeableOpportunity: "potential_long",
    tradeDirection: "LONG",
    target: "24800.00",
    invalidation: "25080.00",
    overallStance: "SHORT-TERM LONG / HTF BEARISH",
  },
  conflictLog: {
    ...conflictEnv.conflictLog,
    htfLean: "bearish",
    tacticalLean: "bullish",
    disagree: true,
    ltfAgainstHtfAllowed: true,
    why: "pipeline taking a LONG on 1-minute against daily bearish — this is NOT an HTF reversal",
    target: "24800.00",
    invalidation: "25080.00",
  },
  conflictResolution: {
    ...conflictEnv.conflictResolution,
    stance: "long",
    sentence:
      "daily context is bearish. 1-minute structure is bullish. 1-minute is bullish; daily is bearish. LTF-against-HTF allowed: yes (current hypothesis — not validated). Why: pipeline is taking a LONG on the 1-minute against daily context — this is NOT an HTF reversal. Target that would make an against-HTF trade logical: 24800.00. Invalidation: 25080.00.",
  },
};
assert(
  validateDecisionEnvelope(againstHtf).length === 0,
  `schema can represent short-term long / HTF bearish: ${validateDecisionEnvelope(againstHtf).join("; ")}`
);
assert(againstHtf.read.tradeDirection === "LONG", "opportunity and direction stay distinct from HTF lean");
assert(againstHtf.read.htfContext.lean === "bearish", "HTF context remains bearish");

console.log("test-decision-envelope: ok");
