import { buildMarketObservation } from "../lib/observation-engine";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const { ctx, state } = REPLAY_FIXTURES["bullish-wait"];
const obs = buildMarketObservation(ctx, state);

assert(Object.isFrozen(obs), "observation is frozen");
assert(Object.isFrozen(obs.evidence), "evidence is frozen");
assert(obs.market_structure === "bullish", "bullish structure detected");
assert(obs.fvg.status === "present", "FVG present");
assert(obs.displacement === "present", "displacement present");
assert(obs.data_quality === "good", "good quality");
assert(
  obs.liquidity.levels.some((l) => l.label === "Asia high"),
  "Asia high is in observation liquidity"
);

const missing = buildMarketObservation(REPLAY_FIXTURES["missing-quality"].ctx, REPLAY_FIXTURES["missing-quality"].state);
assert(missing.market_structure === "unknown", "unknown structure when data missing");
assert(missing.fvg.status === "unknown", "unknown FVG when data missing");
assert(missing.displacement === "unknown", "unknown displacement when data missing");
assert(missing.htf_bias.tradeable_bias === "unknown", "unknown bias when data missing");

console.log("test-observation-engine: ok");
