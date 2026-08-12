import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";
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
assert(formatAnalysisContract(contract).includes("WHY:"), "why block");
assert(formatAnalysisContract(contract).includes("CONTRADICTIONS:"), "contradictions");
assert(formatAnalysisContract(contract).includes("REJECTED ALTERNATIVE:"), "rejected alt");

const voice = narrateAnalysisContractForVoice(contract);
assert(voice.length > 30, "voice narration");

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

console.log("test-analysis-contract: ok");
