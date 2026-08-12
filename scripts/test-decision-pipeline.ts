import type { MarketContext } from "../lib/types";
import type { MarketState } from "../lib/market-state";
import { runDecisionPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const bullish = runDecisionPipeline(
  REPLAY_FIXTURES["bullish-wait"].ctx,
  REPLAY_FIXTURES["bullish-wait"].state
);
assert(bullish.deskPipeline != null, "desk pipeline attached");
assert(bullish.verdict === "trade" || bullish.verdict === "wait", "bullish setup is trade or wait");
assert(bullish.panelBrief.includes("VERDICT:"), "panel uses response contract");
assert(bullish.panelBrief.includes("WHY:"), "panel has WHY block");
assert(bullish.spokenBrief.length > 20, "spoken brief from voice narrator");

const missing = runDecisionPipeline(
  REPLAY_FIXTURES["missing-quality"].ctx,
  REPLAY_FIXTURES["missing-quality"].state
);
assert(missing.verdict === "no trade", "missing data → no trade");

const conflicted = runDecisionPipeline(
  REPLAY_FIXTURES["neutral-no-trade"].ctx,
  REPLAY_FIXTURES["neutral-no-trade"].state
);
assert(conflicted.verdict === "no trade", "neutral/conflicted → no trade");

console.log("test-decision-pipeline: ok");
