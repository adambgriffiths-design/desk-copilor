/**
 * Plain-English presentation layer for market replies.
 * DecisionEnvelope / quality-gate data unchanged; user text loses internal labels.
 * Run: npx tsx scripts/test-karen-plain-english-market-replies.ts
 */
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";
import {
  formatMentorTradeSpoken,
  formatQualityGateSpokenReply,
  formatStructuredInvalidationFollowUp,
  formatStructuredWaitFollowUp,
  formatWhyNotDirectionFollowUp,
  hasInternalDecisionLabels,
  resolveUserPresentationMode,
  type WaitFollowUpContext,
} from "../lib/decision-contract-output";
import type { DecisionEnvelope } from "../lib/decision-envelope";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function cloneEnv(env: DecisionEnvelope, patch: Partial<DecisionEnvelope>): DecisionEnvelope {
  return { ...env, ...patch };
}

const waitPipe = runDeskPipeline(
  REPLAY_FIXTURES["bullish-wait"].ctx,
  REPLAY_FIXTURES["bullish-wait"].state
);
const waitEnv = waitPipe.analysis_contract!.decision!;
const ctx: WaitFollowUpContext = {
  long_case: waitPipe.interpretation.long_case,
  short_case: waitPipe.interpretation.short_case,
  entry_model: waitPipe.interpretation.entry_model,
  rejected_alternative: waitPipe.analysis_contract?.rejected_alternative,
};

console.log("=== presentation mode defaults ===");
{
  const prev = process.env.KAREN_DECISION_DEBUG;
  delete process.env.KAREN_DECISION_DEBUG;
  assert(resolveUserPresentationMode() === "plain", "user default is plain");
  assert(resolveUserPresentationMode("structured") === "structured", "explicit structured wins");
  process.env.KAREN_DECISION_DEBUG = "1";
  assert(resolveUserPresentationMode() === "structured", "KAREN_DECISION_DEBUG=1 → structured");
  if (prev === undefined) delete process.env.KAREN_DECISION_DEBUG;
  else process.env.KAREN_DECISION_DEBUG = prev;
}

console.log("\n=== same stance before/after ===");
{
  const structured = formatMentorTradeSpoken(waitEnv, { mode: "structured" });
  const plain = formatMentorTradeSpoken(waitEnv, { mode: "plain" });
  assert(waitEnv.stance === "wait" || waitEnv.stance === "flat" || waitEnv.stance === "monitor", "fixture non-directional");
  if (waitEnv.stance === "wait") {
    assert(/\bWAITING\b/i.test(plain) || /\bI'm waiting for\b/i.test(plain), "plain keeps WAITING");
  } else {
    assert(/\bNO_TRADE\b/i.test(plain), "plain keeps NO_TRADE for flat/monitor");
  }
  assert(/TRADE DECISION:/i.test(structured), "structured still labeled");
  assert(!hasInternalDecisionLabels(plain), "plain has no internal labels");
}

function spokenDigits(text: string): string {
  return String(text || "").replace(/(\d+)\.(\d+)\b/g, "$1");
}

console.log("\n=== whyNow / invalidation facts preserved ===");
{
  const plain = formatMentorTradeSpoken(waitEnv, { mode: "plain" });
  const why = String(waitEnv.thesis.whyNow || "").trim();
  const inv = String(waitEnv.invalidation.condition || "").trim();
  if (why) {
    const whyNorm = spokenDigits(why);
    const whyLower = whyNorm.charAt(0).toLowerCase() + whyNorm.slice(1);
    assert(
      plain.includes(whyNorm) ||
        plain.includes(why) ||
        plain.includes(whyLower) ||
        plain.toLowerCase().includes(whyNorm.toLowerCase()),
      "plain preserves whyNow fact"
    );
  }
  if (inv) {
    assert(
      plain.includes(spokenDigits(inv)) || plain.includes(inv),
      "plain preserves invalidation fact"
    );
    assert(/This view is invalidated if/i.test(plain), "plain invalidation phrasing");
  }
  const whyNot = formatWhyNotDirectionFollowUp(waitEnv, "long", ctx, { mode: "plain" });
  assert(
    /\bnot long\b/i.test(whyNot) && !/WHY NOT LONG:/i.test(whyNot),
    "why not long opens plain"
  );
  assert(!hasInternalDecisionLabels(whyNot), "why-not plain has no labels");
  if (inv) {
    const invPlain = formatStructuredInvalidationFollowUp(waitEnv, { mode: "plain" });
    assert(
      /This view is invalidated if|Invalidation line:|Kill the idea if/i.test(invPlain),
      "invalidate → plain phrasing"
    );
    assert(
      invPlain.includes(inv) || invPlain.includes(spokenDigits(inv)),
      "invalidate preserves condition"
    );
  }
}

console.log("\n=== no hallucinated prices ===");
{
  const plain = formatMentorTradeSpoken(waitEnv, { mode: "plain" });
  const whyNot = formatWhyNotDirectionFollowUp(waitEnv, "short", ctx, { mode: "plain" });
  const wait = formatStructuredWaitFollowUp(waitEnv, ctx, { mode: "plain" });
  // Must not invent a round fantasy level that isn't already in envelope text fields.
  const invented = /99999|88888|12345\.67/;
  assert(!invented.test(plain + whyNot + wait), "no invented sentinel prices");
}

console.log("\n=== uncertainty preserved ===");
{
  const uncertain = cloneEnv(waitEnv, {
    confidence: "low",
    reasoningChain: waitEnv.reasoningChain.map((row, i) =>
      i === 0 ? { ...row, outcome: "uncertain" as const } : row
    ),
  });
  const plain = formatMentorTradeSpoken(uncertain, { mode: "plain" });
  assert(/confidence is low/i.test(plain), "low confidence surfaced");
  assert(/unproven/i.test(plain), "uncertain chain concept surfaced");
}

console.log("\n=== why not long / waiting for → direct plain English ===");
{
  const whyNot = formatWhyNotDirectionFollowUp(waitEnv, "long", ctx, { mode: "plain" });
  assert(/\b(?:not|no) long\b/i.test(whyNot), "plain why-not rejects long");
  assert(!/WHY NOT LONG:/i.test(whyNot), "no WHY NOT LONG label");

  const waiting = formatStructuredWaitFollowUp(waitEnv, ctx, { mode: "plain" });
  assert(
    /I'm (WAITING|NO_TRADE)|keyed to|Holding off|Trigger first|Until then I'm (WAITING|NO_TRADE)|Still keyed|Need /i.test(
      waiting
    ),
    "waiting phrasing"
  );
  assert(!/WAITING FOR:/i.test(waiting), "no WAITING FOR label");
  assert(!/LONG CONDITION:/i.test(waiting), "no LONG CONDITION label");
}

console.log("\n=== quality-gate spoken: plain vs debug ===");
{
  const gate = {
    waitReason: "WAIT — 1m OHLC missing; daily OHLC missing",
    missing: ["1m OHLC missing", "daily OHLC missing"],
    envelopeText:
      "HTF CONTEXT: daily — bullish\nCURRENT STRUCTURE: 1-minute — bullish\nTRADE DIRECTION: NONE",
    decisionEnvelope: waitEnv,
  };
  const plain = formatQualityGateSpokenReply(gate, { mode: "plain" });
  const structured = formatQualityGateSpokenReply(gate, { mode: "structured" });
  assert(
    /\bWAITING\b/i.test(plain) && /1m OHLC missing/i.test(plain),
    "gate plain opens naturally"
  );
  assert(!/HTF CONTEXT:/i.test(plain), "gate plain does not dump HTF CONTEXT");
  assert(!/CURRENT STRUCTURE:/i.test(plain), "gate plain does not dump CURRENT STRUCTURE");
  assert(!/TRADE DIRECTION:/i.test(plain), "gate plain does not dump TRADE DIRECTION");
  assert(/HTF CONTEXT:/i.test(structured), "debug structured still has CONTEXT");
  assert(/CURRENT STRUCTURE:/i.test(structured), "debug structured still has STRUCTURE");
}

console.log("\n=== LONG / SHORT stance plain ===");
{
  const longEnv = cloneEnv(waitEnv, {
    stance: "long",
    thesis: { ...waitEnv.thesis, complete: true, whyNow: waitEnv.thesis.whyNow || "named long trigger" },
  });
  const shortEnv = cloneEnv(waitEnv, {
    stance: "short",
    thesis: { ...waitEnv.thesis, complete: true, whyNow: waitEnv.thesis.whyNow || "named short trigger" },
  });
  const longPlain = formatMentorTradeSpoken(longEnv, { mode: "plain" });
  const shortPlain = formatMentorTradeSpoken(shortEnv, { mode: "plain" });
  assert(/\bLONG\b/.test(longPlain) && !/\bI(?:'m| am)\s+SHORT\b/i.test(longPlain), "LONG stance plain opener");
  assert(/\bSHORT\b/.test(shortPlain) && !/\bI(?:'m| am)\s+LONG\b/i.test(shortPlain), "SHORT stance plain opener");
  assert(!hasInternalDecisionLabels(longPlain), "LONG plain unlabeled");
  assert(!hasInternalDecisionLabels(shortPlain), "SHORT plain unlabeled");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
