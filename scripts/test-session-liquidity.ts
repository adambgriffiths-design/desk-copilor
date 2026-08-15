/**
 * Session liquidity interpretation — London ASH / BSL must not produce a long.
 * Run: npx tsx scripts/test-session-liquidity.ts
 */
import {
  classifyLevelSide,
  isAsiaHighLevel,
  isBslOnlyRaid,
  isLondonAsiaHighRaid,
  shouldBlockLongFromSessionLiquidity,
  describeSweptLevel,
} from "../lib/session-liquidity";
import { buildMarketObservation } from "../lib/observation-engine";
import { buildMarketInterpretation } from "../lib/interpretation-engine";
import { runDeskPipeline } from "../lib/desk-pipeline";
import { narrateAnalysisContractForVoice } from "../lib/voice-analysis-narrator";
import { baseCtx, baseState } from "../lib/replay-fixtures";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(classifyLevelSide("Asia high") === "buy_side", "Asia high is BSL");
assert(classifyLevelSide("PDH") === "buy_side", "PDH is BSL");
assert(classifyLevelSide("PDL") === "sell_side", "PDL is SSL");
assert(classifyLevelSide("Asia low") === "sell_side", "Asia low is SSL");
assert(isAsiaHighLevel("Asia high", "asia_high"), "ASH id match");

const ctx = baseCtx({
  activeSession: {
    id: "london",
    label: "London",
    killZone: true,
    amdPhase: "manipulation",
    macroWindow: null,
    summary: "London kill zone",
  },
  structureFacts: {
    ...baseCtx().structureFacts,
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
});
const state = baseState({ stateHash: "london-ash-unit" });
const obs = buildMarketObservation(ctx, state);
assert(obs.session === "london", "session mapped to london");
assert(
  obs.liquidity.levels.some((l) => l.label === "Asia high" && l.taken === true),
  "Asia high marked taken"
);
assert(isLondonAsiaHighRaid(obs), "London ASH raid detected");
assert(isBslOnlyRaid(obs), "BSL-only (no SSL)");
assert(shouldBlockLongFromSessionLiquidity(obs), "LONG blocked from ASH");
assert(/not a bullish continuation/i.test(describeSweptLevel("Asia high", "buy_side")), "copy is not bullish");

const interp = buildMarketInterpretation(obs);
assert(interp.long_case.supported === false, "no LONG case from ASH");
assert(interp.short_case.supported === false, "no auto SHORT from ASH");
assert(
  interp.contradictions.some((c) => /asia high taken in london/i.test(c) || /buy-side liquidity/i.test(c)),
  "contradiction names the raid"
);
assert(!interp.long_case.reasons.some((r) => /liquidity sweep observed/i.test(r)), "sweep is not a long reason");

const pipeline = runDeskPipeline(ctx, state);
const contract = pipeline.analysis_contract!;
assert(contract.verdict !== "LONG", "contract not LONG");
assert(contract.verdict !== "SHORT", "contract not SHORT");
assert(/buy-side liquidity/i.test(contract.why.liquidity), "WHY is BSL");
const voice = narrateAnalysisContractForVoice(contract);
assert(!/leaning bullish/i.test(voice), "voice not bullish opener");
assert(/stay flat/i.test(voice) || /stay flat/i.test(contract.wait_reason || contract.final_reasoning), "stay flat");

console.log("test-session-liquidity: ok");
