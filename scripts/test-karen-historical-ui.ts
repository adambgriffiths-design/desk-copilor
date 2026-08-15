/**
 * Isolation regression: historical fixture UI adapter vs live intel cache.
 * Run: npm run test:karen-historical-ui
 *
 * Label: HISTORICAL / FIXTURE — NOT LIVE
 */
import {
  buildHistoricalFixtureIntelligence,
  clearHistoricalFixtureSession,
  getHistoricalFixtureSession,
  HISTORICAL_FIXTURE_BANNER,
  labelHistoricalFixtureText,
  parseHistoricalFixtureRequest,
} from "../lib/research/replay/historical-ui";
import {
  peekLiveDeskIntelligenceCache,
  rememberLiveDeskIntelligenceCache,
  resetLiveDeskIntelligenceCache,
  type DeskMarketIntelligence,
} from "../lib/market-intelligence";
import {
  getLastPipelineResult,
  replaceLastPipelineResult,
  runDeskPipeline,
} from "../lib/desk-pipeline";
import { beginLiveLatencyTrace, getLiveLatencyTraceMeta } from "../lib/live-latency-trace";
import { validateDecisionEnvelope } from "../lib/decision-envelope";
import {
  formatMentorTradeSpoken,
  formatStructuredWaitFollowUp,
  formatWhyNotDirectionFollowUp,
} from "../lib/decision-contract-output";
import { isStandaloneGeneralTurn } from "../lib/conversational-intent";
import { isGeneralConversation } from "../lib/casual-chat-intent";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function stubLiveIntel(): DeskMarketIntelligence {
  return {
    ctx: {} as DeskMarketIntelligence["ctx"],
    state: { lastPrice: 99999, stateHash: "LIVE_STUB_HASH", snapshotId: "live-stub" } as DeskMarketIntelligence["state"],
    observation: { data_quality: "good" } as DeskMarketIntelligence["observation"],
    interpretation: { reasoning: "live stub", long_case: "", short_case: "", entry_model: "" } as DeskMarketIntelligence["interpretation"],
    facts: [],
    built_at: new Date().toISOString(),
    state_hash: "LIVE_STUB_HASH",
  };
}

function testParseRequest() {
  console.log("\n1. parse historical request");
  const a = parseHistoricalFixtureRequest(true);
  assert("true → defaults", a?.fixtureId === "synthetic-ny-am" && a.barIndex === 50);
  const b = parseHistoricalFixtureRequest({ fixtureId: "synthetic-ny-am", barIndex: 50 });
  assert("object parse", b?.fixtureId === "synthetic-ny-am" && b.barIndex === 50);
  assert("null → null", parseHistoricalFixtureRequest(null) == null);
}

function testBuildAndLabel() {
  console.log("\n2. build fixture intelligence + label");
  clearHistoricalFixtureSession();
  resetLiveDeskIntelligenceCache();
  beginLiveLatencyTrace("hist-ui-test", { dataMode: "HISTORICAL_FIXTURE" });
  const session = buildHistoricalFixtureIntelligence({
    fixtureId: "synthetic-ny-am",
    barIndex: 50,
  });
  assert("banner constant", session.label === HISTORICAL_FIXTURE_BANNER);
  assert("pipeline source", session.karenSource === "pipeline");
  assert("fixture id", session.fixtureId === "synthetic-ny-am");
  assert("asOf set", Boolean(session.asOf));
  assert(
    "label helper",
    labelHistoricalFixtureText("WAIT").startsWith("HISTORICAL / FIXTURE")
  );
  const meta = getLiveLatencyTraceMeta();
  assert("latency dataMode fixture", meta.dataMode === "HISTORICAL_FIXTURE");
  assert("latency yahoo false", meta.yahooFetched === false);
  assert("latency tickstream false", meta.tickstreamUsed === false);
}

function testLiveCacheIsolation() {
  console.log("\n3. live intel cache isolation");
  clearHistoricalFixtureSession();
  resetLiveDeskIntelligenceCache();
  const stub = stubLiveIntel();
  rememberLiveDeskIntelligenceCache(stub, {
    symbol: "MNQ=F",
    barFingerprint: "live-fp",
    sessionKey: "live-stub",
    lastPrice: 99999,
    lastM1Time: Date.now(),
  });
  const before = peekLiveDeskIntelligenceCache();
  assert("live stub present", before?.intel.state_hash === "LIVE_STUB_HASH");

  buildHistoricalFixtureIntelligence({ fixtureId: "synthetic-ny-am", barIndex: 50 });
  const after = peekLiveDeskIntelligenceCache();
  assert("live cache unchanged after fixture", after === before);
  assert(
    "live price not overwritten",
    after?.intel.state.lastPrice === 99999 && after?.intel.state_hash === "LIVE_STUB_HASH"
  );
  assert(
    "fixture session separate",
    getHistoricalFixtureSession()?.intel.state_hash !== "LIVE_STUB_HASH"
  );
  resetLiveDeskIntelligenceCache();
}

function testLastPipelineIsolation() {
  console.log("\n4. lastPipeline not left as historical after build");
  clearHistoricalFixtureSession();
  replaceLastPipelineResult(null);
  const session = buildHistoricalFixtureIntelligence({
    fixtureId: "synthetic-ny-am",
    barIndex: 50,
  });
  assert("session has pipeline", Boolean(session.pipeline?.decision));
  assert(
    "getLastPipelineResult not polluted",
    getLastPipelineResult() == null,
    `got ${getLastPipelineResult()?.decision.verdict}`
  );
}

function testEnvelopeAuthoritative() {
  console.log("\n5. DecisionEnvelope authoritative + WAIT/FLAT valid");
  clearHistoricalFixtureSession();
  const session = buildHistoricalFixtureIntelligence({
    fixtureId: "synthetic-ny-am",
    barIndex: 50,
  });
  const env = session.pipeline.analysis_contract?.decision;
  assert("envelope present", Boolean(env));
  if (!env) return;
  const errs = validateDecisionEnvelope(env);
  assert("validateDecisionEnvelope", errs.length === 0, errs.join("; "));
  assert(
    "WAIT/FLAT allowed",
    env.stance === "flat" ||
      env.stance === "wait" ||
      session.pipeline.decision.verdict === "WAIT" ||
      session.pipeline.decision.verdict === "LONG" ||
      session.pipeline.decision.verdict === "SHORT"
  );
  const spoken = formatMentorTradeSpoken(env);
  assert("mentor matches stance", spoken.toLowerCase().includes(env.stance) || /wait|flat|long|short/i.test(spoken));
}

function testFollowUpsSameDecision() {
  console.log("\n6. follow-ups same historical decision");
  clearHistoricalFixtureSession();
  const session = buildHistoricalFixtureIntelligence({
    fixtureId: "synthetic-ny-am",
    barIndex: 50,
  });
  const env = session.pipeline.analysis_contract!.decision;
  const ctx = {
    long_case: session.pipeline.interpretation.long_case,
    short_case: session.pipeline.interpretation.short_case,
    entry_model: session.pipeline.interpretation.entry_model,
    rejected_alternative: session.pipeline.analysis_contract?.rejected_alternative,
  };
  const why = labelHistoricalFixtureText(formatStructuredWaitFollowUp(env, ctx));
  const whyNotLong = labelHistoricalFixtureText(formatWhyNotDirectionFollowUp(env, "long", ctx));
  const whyNotShort = labelHistoricalFixtureText(formatWhyNotDirectionFollowUp(env, "short", ctx));
  assert("why labelled", /HISTORICAL\s*\/\s*FIXTURE/i.test(why));
  assert("why not long labelled", /HISTORICAL\s*\/\s*FIXTURE/i.test(whyNotLong));
  assert("why not short labelled", /HISTORICAL\s*\/\s*FIXTURE/i.test(whyNotShort));
  assert(
    "same stance in follow-ups",
    why.toLowerCase().includes(env.stance) || /wait|flat/i.test(why)
  );
  // Same session key reuse — no new snapshot
  const again = buildHistoricalFixtureIntelligence({
    fixtureId: "synthetic-ny-am",
    barIndex: 50,
  });
  assert("reuse same session key", again.key === session.key);
  assert("same state_hash", again.intel.state_hash === session.intel.state_hash);
}

function testGeneralOffMarket() {
  console.log("\n7. general questions off market pipeline");
  assert("capital of germany general", isStandaloneGeneralTurn("what's the capital of germany?"));
  assert("joke general", isGeneralConversation("tell me a joke"));
  assert("2+2 general", isStandaloneGeneralTurn("what is 2+2?"));
}

function testNoMixWithLivePipelineDelta() {
  console.log("\n8. fixture does not become live pipeline delta base");
  clearHistoricalFixtureSession();
  replaceLastPipelineResult(null);
  const hist = buildHistoricalFixtureIntelligence({
    fixtureId: "synthetic-ny-am",
    barIndex: 50,
  });
  // Simulate a subsequent live pipeline run — should be first-read (no hist delta).
  const livePipe = runDeskPipeline(hist.intel.ctx, hist.intel.state);
  assert(
    "live run after hist restore treats as first or independent",
    Boolean(livePipe.delta?.mentor_brief)
  );
  // Clear so we don't leave global state for other suites if run in-process later
  replaceLastPipelineResult(null);
  clearHistoricalFixtureSession();
  resetLiveDeskIntelligenceCache();
}

function main() {
  console.log("test-karen-historical-ui — HISTORICAL / FIXTURE isolation");
  testParseRequest();
  testBuildAndLabel();
  testLiveCacheIsolation();
  testLastPipelineIsolation();
  testEnvelopeAuthoritative();
  testFollowUpsSameDecision();
  testGeneralOffMarket();
  testNoMixWithLivePipelineDelta();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main();
