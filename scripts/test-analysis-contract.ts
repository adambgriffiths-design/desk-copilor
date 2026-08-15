import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES, baseCtx, baseState } from "../lib/replay-fixtures";
import {
  buildAnalysisContract,
  formatAnalysisContract,
  validateContractNoInvention,
} from "../lib/analysis-contract";
import { narrateAnalysisContractForVoice } from "../lib/voice-analysis-narrator";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const wait = runDeskPipeline(
  REPLAY_FIXTURES["bullish-wait"].ctx,
  REPLAY_FIXTURES["bullish-wait"].state
);
const contract = wait.analysis_contract!;
assert(contract.verdict === "WAIT" || contract.verdict === "LONG", "verdict present");
assert(formatAnalysisContract(contract).includes("VERDICT:"), "formatted contract");
assert(formatAnalysisContract(contract).includes("SHORT TERM"), "short term horizon");
assert(formatAnalysisContract(contract).includes("MEDIUM TERM"), "medium term horizon");
assert(formatAnalysisContract(contract).includes("LONG TERM"), "long term horizon");
assert(contract.mtf?.short && contract.mtf.medium && contract.mtf.long, "mtf block filled");
assert(formatAnalysisContract(contract).includes("CONTRADICTIONS:"), "contradictions");
assert(formatAnalysisContract(contract).includes("REJECTED ALTERNATIVE:"), "rejected alt");

const voice = narrateAnalysisContractForVoice(contract);
assert(voice.length > 30, "voice narration");
assert(
  /short term|this chart|primary|tactical bias|strategic bias|htf context|current structure|overall stance/i.test(voice),
  "voice includes horizon"
);

const missing = runDeskPipeline(
  REPLAY_FIXTURES["missing-quality"].ctx,
  REPLAY_FIXTURES["missing-quality"].state
);
const mc = missing.analysis_contract!;
assert(mc.verdict === "NO_TRADE", "insufficient → NO TRADE");
assert(mc.data_quality === "INSUFFICIENT", "data quality insufficient");
assert(validateContractNoInvention(mc, missing.observation).length === 0, "valid no trade");

const built = buildAnalysisContract(wait);
assert(built.why.liquidity.length > 0, "liquidity why filled");
assert(built.why.market_structure.length > 0, "structure why filled");

const warningDq = buildAnalysisContract({
  ...wait,
  observation: { ...wait.observation, data_quality: "good" },
  data_quality_report: {
    flag: "good",
    score: 90,
    issues: [{ code: "yahoo_only", severity: "warning", message: "Yahoo only" }],
    can_observe: true,
    can_decide: true,
    timestamp_aligned: true,
  },
});
assert(warningDq.data_quality === "GOOD", "warning-only audit does not force DEGRADED");

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
    premiumDiscount: {
      ...base.premiumDiscount,
      vsNdog: "premium",
      summary: "vs today range: premium; vs prev day range: premium; vs NDOG: premium",
    },
  }),
  baseState({ stateHash: "conflict-wait-001" })
);
const cc = conflict.analysis_contract!;
assert(cc.verdict === "WAIT" || cc.verdict === "NO_TRADE", "conflict is not a forced side");
if (cc.verdict === "WAIT") {
  assert(cc.entry === "—" || !/\d{4,}/.test(cc.entry), "WAIT conflict has no fake numeric entry");
  assert(cc.target === "unknown", "WAIT conflict has no fake target");
  assert(/stay flat/i.test(cc.wait_reason || cc.final_reasoning), "WAIT states stay flat");
  assert(/bias vs .* structure/i.test(cc.wait_reason || cc.final_reasoning), "WAIT names bias vs structure");
  const stayVoice = narrateAnalysisContractForVoice(cc);
  assert(/stay flat/i.test(stayVoice), "voice stay-flat for conflict WAIT");
  assert(!/\bLONG\b|\bSHORT\b/.test(stayVoice), "voice does not invent LONG/SHORT");
}
assert(!/was taken; .* was taken/i.test(cc.why.liquidity), "liquidity is not a PD dump");
assert(
  /both sides taken|not yet taken|unknown/i.test(cc.why.liquidity),
  "liquidity summarizes taken vs unproven levels"
);
assert(cc.why.market_structure === "bearish", "structure not duplicated as bearish (bearish)");
assert(/premium \(/i.test(cc.why.premium_discount) || cc.why.premium_discount === "premium", "PD array is compact");

const londonAsh = runDeskPipeline(
  baseCtx({
    activeSession: {
      id: "london",
      label: "London",
      killZone: true,
      amdPhase: "manipulation",
      macroWindow: null,
      summary: "London kill zone",
    },
    structureFacts: {
      ...base.structureFacts,
      mss: {
        direction: "bullish",
        level: 25050,
        at: "03:12",
        atTime: 1700000000,
        description: "Body close above Asia high",
      },
      liquiditySweeps: [
        {
          levelId: "asia_high",
          label: "Asia high",
          price: 25050,
          side: "buy_side",
          at: "03:12",
          atTime: 1700000000,
        },
      ],
    },
  }),
  baseState({ stateHash: "london-ash-bsl-001" })
);
const ash = londonAsh.analysis_contract!;
assert(ash.verdict !== "LONG", "London ASH raid is not a LONG");
assert(ash.verdict !== "SHORT", "London ASH raid does not auto-force SHORT");
assert(ash.verdict === "WAIT" || ash.verdict === "NO_TRADE", "London ASH stays flat");
assert(/buy-side liquidity/i.test(ash.why.liquidity), "WHY names buy-side liquidity for ASH");
assert(/not a bullish continuation|not a reason to recommend bullishness|not a long/i.test(`${ash.final_reasoning} ${ash.wait_reason || ""} ${ash.why.liquidity}`), "ASH copy says not bullish");
const ashVoice = narrateAnalysisContractForVoice(ash);
assert(!/leaning bullish/i.test(ashVoice), "voice does not open bullish on ASH raid");
assert(/stay flat/i.test(ashVoice) || /stay flat/i.test(ash.wait_reason || ash.final_reasoning), "ASH stay-flat language present");
assert(londonAsh.interpretation.long_case.supported === false, "interpretation does not support LONG from ASH");
assert(londonAsh.interpretation.short_case.supported === false, "interpretation does not auto-support SHORT from ASH");

const sslLong = runDeskPipeline(REPLAY_FIXTURES["bullish-wait"].ctx, REPLAY_FIXTURES["bullish-wait"].state);
assert(
  sslLong.interpretation.long_case.supported === true,
  "sell-side (PDL) sweep can still support a long case"
);
assert(sslLong.analysis_contract!.verdict !== "SHORT", "SSL-only fixture is not a short");

console.log("test-analysis-contract: ok");
