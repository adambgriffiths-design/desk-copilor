/**
 * Regression: fast shallow trading answers are WRONG; evidence-based answers are CORRECT.
 * Voice responsiveness and analysis quality are measured independently.
 *
 * Run: npx tsx scripts/test-voice-analysis-quality.ts
 */
import {
  classifyAnalysisDepth,
  voiceAckKeyForDepth,
  requiresDeepAnalysisPipeline,
} from "../lib/analysis-depth";
import { formatQualityGateForPrompt } from "../lib/analysis-quality-gate";
import { prefersRichTradingAnswer } from "../lib/chart-question-intent";
import { trySnapshotChatReply } from "../lib/chat-engine";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

async function main() {
  assert(
    classifyAnalysisDepth({ text: "Where's the last MSS?" }) === "FAST_FACT",
    "last MSS is FAST_FACT"
  );
  assert(
    classifyAnalysisDepth({ text: "Where is the NWOG?" }) === "FAST_FACT",
    "NWOG lookup is FAST_FACT"
  );

  assert(
    classifyAnalysisDepth({ text: "Give me the current market verdict." }) === "DEEP_ANALYSIS",
    "market verdict is DEEP_ANALYSIS"
  );
  assert(
    classifyAnalysisDepth({ text: "Would you take this setup?" }) === "DEEP_ANALYSIS",
    "setup opinion is DEEP_ANALYSIS"
  );
  assert(
    classifyAnalysisDepth({ text: "Give me the full ICT verdict." }) === "DEEP_ANALYSIS",
    "full ICT verdict is DEEP_ANALYSIS"
  );

  assert(
    classifyAnalysisDepth({ text: "What is an MSS?" }) === "GENERAL_QUESTION",
    "MSS teaching is GENERAL_QUESTION"
  );

  assert(voiceAckKeyForDepth("DEEP_ANALYSIS") === "deep_analysis", "deep gets ack key");
  assert(voiceAckKeyForDepth("FAST_FACT") === null, "fast fact skips ack key");

  const shallowBlocked = await trySnapshotChatReply(
    "Would you take this setup on MNQ right now?",
    null,
    "",
    []
  );
  assert(shallowBlocked === null, "deep question blocked from shallow snapshot reply");

  const gatePrompt = formatQualityGateForPrompt({
    canDeliverVerdict: false,
    canAcknowledge: true,
    missing: ["market structure not confirmed", "current price unknown"],
    dataQuality: "INSUFFICIENT",
    waitReason: "WAIT — market structure not confirmed",
    contractErrors: [],
  });
  assert(/do NOT guess/i.test(gatePrompt), "gate prompt forbids guessing");
  assert(gatePrompt.includes("conditional language"), "gate prompt requires conditional tone");

  const premature = "NASDAQ is bullish. Buy here.";
  const evidenceBased =
    "I'm leaning bullish, but I'm not calling the entry yet. Higher-timeframe structure is bullish, sell-side liquidity has been taken, and we've got the displacement I want. I'm waiting for the retrace into the one-minute FVG. If that FVG fails, the long thesis is invalid.";

  assert(/\bbuy here\b/i.test(premature), "premature fixture is shallow");
  assert(/leaning bullish/i.test(evidenceBased), "evidence fixture uses conditional lean");
  assert(/not calling the entry/i.test(evidenceBased), "evidence fixture separates entry");
  assert(/invalid/i.test(evidenceBased), "evidence fixture defines invalidation");

  assert(
    prefersRichTradingAnswer("Would you take this setup?") === true,
    "setup question prefers rich answer"
  );
  assert(
    requiresDeepAnalysisPipeline(classifyAnalysisDepth({ text: "Would you take this setup?" })),
    "setup question requires deep pipeline"
  );

  console.log("\nAll voice analysis quality regression tests passed.");
  console.log("Metrics to track independently:");
  console.log("  Voice: time to voice_ack, time to first_audible (ack), time to verdict audio");
  console.log("  Quality: observation accuracy, unsupported claims, hallucinated levels\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
