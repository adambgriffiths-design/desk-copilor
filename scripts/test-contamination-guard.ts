import { buildMarketObservation } from "../lib/observation-engine";
import { buildMarketInterpretation } from "../lib/interpretation-engine";
import {
  validateInterpretationContamination,
  assertInterpretationClean,
} from "../lib/contamination-guard";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const { ctx, state } = REPLAY_FIXTURES["bullish-wait"];
const obs = buildMarketObservation(ctx, state);
const clean = buildMarketInterpretation(obs);
assertInterpretationClean(obs, clean);

const dirty = {
  ...clean,
  reasoning: clean.reasoning + " Entry at 99999.00 is ideal.",
};
const result = validateInterpretationContamination(obs, dirty);
assert(!result.passed, "invented price 99999 should fail");
assert(result.violations.some((v) => v.includes("99999")), "violation mentions invented price");

const unknownObs = buildMarketObservation(
  REPLAY_FIXTURES["missing-quality"].ctx,
  REPLAY_FIXTURES["missing-quality"].state
);
const unknownInterp = buildMarketInterpretation(unknownObs);
assert(
  !unknownInterp.long_case.supported && !unknownInterp.short_case.supported,
  "unknown data should not support directional case"
);

console.log("test-contamination-guard: ok");
