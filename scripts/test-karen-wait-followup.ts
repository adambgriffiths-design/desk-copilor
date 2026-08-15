/**
 * WAIT / flat follow-up must surface structured DecisionEnvelope — no LLM vague copy.
 * npm run test:karen-wait-followup
 */
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";
import {
  buildDecisionEnvelope,
  type DecisionEnvelope,
  type DecisionHorizon,
} from "../lib/decision-envelope";
import {
  formatStructuredInvalidationFollowUp,
  formatStructuredWaitFollowUp,
  formatWhyNotDirectionFollowUp,
  VAGUE_WAIT_FOLLOWUP,
} from "../lib/decision-contract-output";
import { answerMentorCoaching } from "../lib/mentor-coaching";
import { classifyMentorIntent, hasPriorMarketRead, isMentorFollowUpOnPriorRead, isPriorReadFollowUpPhrase, parseWhyNotDirection, requestsFreshMarketState, shouldRefreshMarketState } from "../lib/mentor-intent";
import { needsStructuredWaitFollowUp, shouldSkipQualityGate, tryDeterministicMentorFollowUp } from "../lib/chat-engine";
import { rememberLiveDeskIntelligenceCache, resetLiveDeskIntelligenceCache, tryReuseLiveDeskIntelligence, peekLiveDeskIntelligenceCache } from "../lib/market-intelligence";
import { liveMarketSessionKey } from "../lib/incremental-market-engine";
import { beginLiveLatency, snapshotLiveLatency } from "../lib/live-latency-profile";
import type { DeskMarketIntelligence } from "../lib/market-intelligence";

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

function assertNoVague(text: string, label: string) {
  assert(!VAGUE_WAIT_FOLLOWUP.test(text), `${label}: no vague wait copy`);
  assert(!/\bjust waiting for the market\b/i.test(text), `${label}: no generic market-wait`);
}

const waitPipe = runDeskPipeline(
  REPLAY_FIXTURES["bullish-wait"].ctx,
  REPLAY_FIXTURES["bullish-wait"].state
);
const waitEnv = waitPipe.analysis_contract!.decision!;

const waitIntel = {
  observation: waitPipe.observation,
  interpretation: waitPipe.interpretation,
  ctx: REPLAY_FIXTURES["bullish-wait"].ctx,
  state: REPLAY_FIXTURES["bullish-wait"].state,
  facts: [],
  eqhEqlRows: [],
  state_hash: waitPipe.state_hash,
  built_at: new Date().toISOString(),
} as DeskMarketIntelligence;

const marketCtx = {
  lastAssistant:
    "Not calling a long or short. Stay flat until the next clean one-minute displacement.",
  lastMentorIntent: "CURRENT_MARKET_READ" as const,
};

console.log("=== intent routing ===");
{
  assert(
    classifyMentorIntent("What are you waiting for?", marketCtx) === "WAIT_EXPLANATION",
    "what are you waiting for → WAIT_EXPLANATION"
  );
  assert(
    classifyMentorIntent("What were you waiting for?", marketCtx) === "WAIT_EXPLANATION",
    "what were you waiting for → WAIT_EXPLANATION"
  );
  assert(
    isPriorReadFollowUpPhrase("What were you waiting for?"),
    "what were you waiting for is prior-read follow-up"
  );
  assert(
    classifyMentorIntent("Why not short?", marketCtx) === "EXPLAIN_PREVIOUS_MARKET_READ",
    "why not short → EXPLAIN_PREVIOUS_MARKET_READ"
  );
  assert(
    classifyMentorIntent("why not long", marketCtx) === "EXPLAIN_PREVIOUS_MARKET_READ",
    "why not long → EXPLAIN_PREVIOUS_MARKET_READ"
  );
  assert(parseWhyNotDirection("why not long") === "long", "parseWhyNotDirection why not long");
  assert(
    classifyMentorIntent("What would invalidate this?", marketCtx) === "INVALIDATION",
    "what would invalidate this → INVALIDATION"
  );
  assert(
    needsStructuredWaitFollowUp("What are you waiting for?", marketCtx),
    "needsStructuredWaitFollowUp for waiting question"
  );
}

console.log("\n=== 1. WAIT + concrete trigger → names trigger ===");
{
  const text = formatStructuredWaitFollowUp(waitEnv, {
    long_case: waitPipe.interpretation.long_case,
    short_case: waitPipe.interpretation.short_case,
  });
  assert(/WAITING FOR:/i.test(text), "1 has WAITING FOR label");
  assert(/25085|25095|retrace|FVG/i.test(text), "1 names concrete trigger zone");
  assertNoVague(text, "1");
}

console.log("\n=== 2. WAIT + long/short conditions → distinguishes both ===");
{
  const text = formatStructuredWaitFollowUp(waitEnv, {
    long_case: waitPipe.interpretation.long_case,
    short_case: waitPipe.interpretation.short_case,
  });
  assert(/LONG CONDITION:/i.test(text), "2 has LONG CONDITION");
  assert(/SHORT CONDITION:/i.test(text), "2 has SHORT CONDITION");
  assert(/bullish|HTF bias|FVG/i.test(text), "2 long side cites structured evidence");
  assert(/not supported|not active/i.test(text), "2 short side distinguished");
}

console.log("\n=== 3. WAIT + incomplete → under-specified, no invention ===");
{
  const bareHorizon: DecisionHorizon = {
    id: "primary",
    timeframe: "1-minute",
    lean: "bullish",
    role: "stance",
    summary: "bullish",
  };
  const incomplete: DecisionEnvelope = buildDecisionEnvelope({
    observation: waitPipe.observation,
    interpretation: {
      ...waitPipe.interpretation,
      entry_model: "",
    },
    decision: {
      ...waitPipe.decision,
      entry_zone: null,
      invalidation: null,
    },
  });
  incomplete.stance = "flat";
  incomplete.thesis = {
    what: null,
    whyNow: null,
    timeframe: "1-minute",
    toward: null,
    fromWhere: null,
    invalidates: null,
    complete: false,
  };
  incomplete.logicOrder.execution = "WAIT FOR: a specific retrace, fair value gap, or structure confirmation — no order yet";
  incomplete.invalidation = { price: "unknown", condition: "" };
  incomplete.conflictResolution.sentence = "";
  incomplete.primaryHorizon = bareHorizon;

  const text = formatStructuredWaitFollowUp(incomplete);
  assert(/UNDER-SPECIFIED/i.test(text), "3 under-specified banner");
  assert(/Missing:/i.test(text), "3 lists missing fields");
  assert(!/25085|25140|clear signal|market to tell us/i.test(text), "3 does not invent trigger");
}

console.log("\n=== 4. mentor coaching — no generic clear signal ===");
{
  const coached = answerMentorCoaching(waitIntel, "What are you waiting for?", marketCtx);
  assert(Boolean(coached?.spoken), "4 coaching returns spoken");
  assert(/WAITING FOR:/i.test(coached!.spoken), "4 structured WAITING FOR");
  assertNoVague(coached!.spoken, "4");
}

console.log("\n=== 5. invalidation follow-up ===");
{
  const inv = formatStructuredInvalidationFollowUp(waitEnv);
  assert(/INVALIDATION:/i.test(inv), "5 INVALIDATION label");
  assert(/retrace|zone|25085/i.test(inv), "5 structured invalidation body");
  const coached = answerMentorCoaching(waitIntel, "What would invalidate this?", marketCtx);
  assert(coached?.intent === "INVALIDATION", "5 coaching intent INVALIDATION");
  assert(/INVALIDATION:/i.test(coached!.spoken), "5 coaching uses structured invalidation");
}

console.log("\n=== 6. why not short ===");
{
  const text = formatWhyNotDirectionFollowUp(waitEnv, "short", {
    long_case: waitPipe.interpretation.long_case,
    short_case: waitPipe.interpretation.short_case,
  });
  assert(/WHY NOT SHORT:/i.test(text), "6 WHY NOT SHORT label");
  assert(/SHORT-SIDE EVIDENCE:/i.test(text), "6 short-side evidence line");
  const coached = answerMentorCoaching(waitIntel, "Why not short?", marketCtx);
  assert(/WHY NOT SHORT:/i.test(coached!.spoken), "6 coaching why-not-short");
  assertNoVague(coached!.spoken, "6");
}

console.log("\n=== 7. prior read follow-ups skip live OHLC refresh ===");
{
  const bullishCtx = {
    lastAssistant:
      "Nasdaq futures trading at 30237.50. Bias is bullish. I'm waiting for a clean displacement before calling a short.",
    lastMentorIntent: "CURRENT_MARKET_READ" as const,
    lastTurnCategory: "MARKET" as const,
  };
  assert(hasPriorMarketRead(bullishCtx), "7 hasPriorMarketRead");
  const explainLast = [
    "Why not short?",
    "why not long",
    "why are you short",
    "why are you long",
    "Why?",
    "What are you waiting for?",
    "What were you waiting for?",
    "What would invalidate this?",
    "Why did you stay flat?",
  ];
  for (const q of explainLast) {
    assert(isPriorReadFollowUpPhrase(q), `7 "${q}" is EXPLAIN LAST phrase`);
    assert(isMentorFollowUpOnPriorRead(q, bullishCtx), `7 "${q}" reuses prior read`);
    assert(!requestsFreshMarketState(q, bullishCtx), `7 "${q}" is not a new read`);
    assert(!shouldRefreshMarketState(classifyMentorIntent(q, bullishCtx), bullishCtx), `7 "${q}" no refresh`);
    assert(shouldSkipQualityGate(q, bullishCtx), `7 "${q}" skip QUALITY_GATE`);
    assert(needsStructuredWaitFollowUp(q, bullishCtx), `7 "${q}" structured follow-up`);
  }
  assert(classifyMentorIntent("What changed?", bullishCtx) === "CHANGE_ANALYSIS", "7 what changed → CHANGE_ANALYSIS");
  assert(requestsFreshMarketState("What changed?", bullishCtx), "7 what changed is NEW READ");
  assert(shouldRefreshMarketState("CHANGE_ANALYSIS", bullishCtx), "7 what changed may refresh");
  assert(!shouldSkipQualityGate("What changed?", bullishCtx), "7 what changed does not skip gate via explain-last");
  assert(!isMentorFollowUpOnPriorRead("What changed?", bullishCtx), "7 what changed is not explain-last");
  assert(classifyMentorIntent("give me a new read", bullishCtx) === "CURRENT_MARKET_READ", "7 new read → CURRENT_MARKET_READ");
  assert(requestsFreshMarketState("give me a new read", bullishCtx), "7 give me a new read is NEW READ");
  assert(shouldRefreshMarketState("CURRENT_MARKET_READ", bullishCtx), "7 new read may refresh");
  assert(requestsFreshMarketState("has anything changed?", bullishCtx), "7 has anything changed is NEW READ");
}

console.log("\n=== 8. stale intel still answers structured follow-up after prior read ===");
{
  const staleIntel = {
    ...waitIntel,
    observation: { ...waitIntel.observation, data_quality: "stale" as const },
  };
  const coached = answerMentorCoaching(staleIntel, "Why not short?", marketCtx);
  assert(Boolean(coached?.spoken), "8 stale intel still returns spoken");
  assert(/WHY NOT SHORT:/i.test(coached!.spoken), "8 stale intel structured why-not-short");
  assert(!/QUALITY_GATE|OHLC \/ market state unavailable/i.test(coached!.spoken), "8 not quality gate copy");
}

console.log("\n=== 9. why not long after SHORT / LONG-rejected read ===");
{
  const shortLastAssistant =
    "TRADE DECISION: SHORT — directional trade on the execution horizon on the 1-minute. LONG rejected — insufficient bullish confluence from observed facts. INVALIDATION: 30278.25 TARGET: 28778.75";
  const shortCtx = {
    lastAssistant: shortLastAssistant,
    lastMentorIntent: "CURRENT_MARKET_READ" as const,
    lastTurnCategory: "MARKET" as const,
  };
  const generalCategoryButShortRead = {
    lastAssistant: shortLastAssistant,
    lastMentorIntent: "CURRENT_MARKET_READ" as const,
    lastTurnCategory: "GENERAL_KNOWLEDGE" as const,
  };
  const verdictOnlyCtx = {
    lastAssistant: "On it.",
    lastVerdict: shortLastAssistant,
    lastTurnCategory: "GENERAL_CHAT" as const,
  };

  assert(parseWhyNotDirection("why not long") === "long", "9 parse why not long");
  assert(
    classifyMentorIntent("why not long", shortCtx) === "EXPLAIN_PREVIOUS_MARKET_READ",
    "9 intent EXPLAIN_PREVIOUS"
  );
  assert(hasPriorMarketRead(shortCtx), "9 hasPriorMarketRead from SHORT envelope");
  assert(isMentorFollowUpOnPriorRead("why not long", shortCtx), "9 follow-up reuses prior read");
  assert(isMentorFollowUpOnPriorRead("Why not long?", shortCtx), "9 Why not long? reuses prior read");
  assert(
    !shouldRefreshMarketState(classifyMentorIntent("why not long", shortCtx), shortCtx),
    "9 no OHLC refresh"
  );
  assert(shouldSkipQualityGate("why not long", shortCtx), "9 skip QUALITY_GATE");
  assert(
    isMentorFollowUpOnPriorRead("why not long", generalCategoryButShortRead),
    "9 stale GENERAL category still follow-up when last assistant is SHORT envelope"
  );
  assert(
    isMentorFollowUpOnPriorRead("why not long", verdictOnlyCtx),
    "9 lastVerdict SHORT envelope is enough for why not long"
  );

  const whyNotLong = formatWhyNotDirectionFollowUp(waitEnv, "long", {
    long_case: waitPipe.interpretation.long_case,
    short_case: waitPipe.interpretation.short_case,
    rejected_alternative: "LONG rejected — insufficient bullish confluence from observed facts",
  });
  assert(/WHY NOT LONG:/i.test(whyNotLong), "9 WHY NOT LONG label");
  assert(!/QUALITY_GATE|OHLC \/ market state unavailable/i.test(whyNotLong), "9 formatter not quality gate");

  const coached = answerMentorCoaching(waitIntel, "why not long", shortCtx);
  assert(Boolean(coached?.spoken), "9 coaching returns spoken");
  assert(/WHY NOT LONG:/i.test(coached!.spoken), "9 coaching why-not-long");
  assert(!/QUALITY_GATE|OHLC \/ market state unavailable/i.test(coached!.spoken), "9 coaching not quality gate");

  const staleIntel = {
    ...waitIntel,
    observation: { ...waitIntel.observation, data_quality: "stale" as const },
  };
  const staleCoached = answerMentorCoaching(staleIntel, "why not long", shortCtx);
  assert(/WHY NOT LONG:/i.test(staleCoached!.spoken), "9 stale intel still why-not-long");
  assert(!/QUALITY_GATE/i.test(staleCoached!.spoken), "9 stale not quality gate");
}

void (async () => {
  const shortRead =
    "TRADE DECISION: SHORT — directional trade on the execution horizon. LONG rejected. INVALIDATION: 30278.25 TARGET: 28778.75";
  const explainMessages = (q: string) => [
    { role: "user" as const, content: "Give me the read" },
    { role: "assistant" as const, content: shortRead },
    { role: "user" as const, content: q },
  ];

  console.log("\n=== 10. why not long uses last envelope, not Yahoo ===");
  resetLiveDeskIntelligenceCache();
  const spoken = await tryDeterministicMentorFollowUp("why not long", explainMessages("why not long"), null);
  assert(Boolean(spoken), "10 deterministic follow-up from last pipeline envelope");
  assert(/WHY NOT LONG:/i.test(spoken || ""), "10 WHY NOT LONG from envelope");
  assert(/PREVIOUS DECISION/i.test(spoken || ""), "10 labeled previous decision");
  assert(!/QUALITY_GATE|OHLC \/ market state unavailable|current price unknown/i.test(spoken || ""), "10 no quality gate");

  console.log("\n=== 11. same-bar EXPLAIN LAST reuses envelope ===");
  resetLiveDeskIntelligenceCache();
  const now = new Date();
  const reuseKey = {
    symbol: "NQ",
    barFingerprint: "test-bar",
    sessionKey: liveMarketSessionKey(now),
    lastPrice: 25095,
    lastM1Time: now.getTime(),
  };
  rememberLiveDeskIntelligenceCache(waitIntel, reuseKey, now.getTime());
  assert(tryReuseLiveDeskIntelligence(now) === waitIntel, "11 same-bar clock HIT");
  beginLiveLatency("explain-last-same-bar");
  const tSame = performance.now();
  const sameBar = await tryDeterministicMentorFollowUp("Why?", explainMessages("Why?"), null);
  const sameMs = performance.now() - tSame;
  const sameProf = snapshotLiveLatency();
  assert(Boolean(sameBar), "11 Why? spoken");
  assert(/PREVIOUS DECISION/i.test(sameBar || ""), "11 Why? labeled previous");
  assert(!/QUALITY_GATE|OHLC \/ market state unavailable/i.test(sameBar || ""), "11 Why? no quality gate");
  assert(!sameProf?.counters.mentor_followup_intel, "11 same-bar did not rebuild intel");
  assert((sameProf?.counters.mentor_followup_reuse || 0) >= 1, "11 same-bar reuse counted");
  console.log(`    same-bar Why? ${sameMs.toFixed(1)}ms`);

  console.log("\n=== 12. new-bar EXPLAIN LAST still reuses envelope ===");
  rememberLiveDeskIntelligenceCache(waitIntel, reuseKey, now.getTime() - 120_000);
  assert(tryReuseLiveDeskIntelligence(now) == null, "12 clock MISS (new bar / new minute)");
  assert(peekLiveDeskIntelligenceCache()?.intel === waitIntel, "12 peek still has last envelope");
  beginLiveLatency("explain-last-new-bar");
  const tMiss = performance.now();
  const newBarWhy = await tryDeterministicMentorFollowUp("why are you short", explainMessages("why are you short"), null);
  const missMs = performance.now() - tMiss;
  const missProf = snapshotLiveLatency();
  assert(Boolean(newBarWhy), "12 why are you short spoken on clock miss");
  assert(/PREVIOUS DECISION/i.test(newBarWhy || ""), "12 new-bar labeled previous");
  assert(!/QUALITY_GATE|OHLC \/ market state unavailable|current price unknown/i.test(newBarWhy || ""), "12 new-bar no quality gate");
  assert(!missProf?.counters.mentor_followup_intel, "12 new-bar EXPLAIN LAST did not full-rebuild");
  assert((missProf?.notes || []).includes("followup_rebuilds_intel=no"), "12 new-bar note says no rebuild");
  console.log(`    new-bar why are you short ${missMs.toFixed(1)}ms`);

  for (const q of ["Why not short?", "what are you waiting for", "what would invalidate this"]) {
    const reply = await tryDeterministicMentorFollowUp(q, explainMessages(q), null);
    assert(Boolean(reply), `12 "${q}" spoken on clock miss`);
    assert(!/QUALITY_GATE|OHLC \/ market state unavailable/i.test(reply || ""), `12 "${q}" no quality gate`);
  }

  console.log("\n=== 13. NEW READ / what changed may refresh ===");
  assert(requestsFreshMarketState("What changed?", {
    lastAssistant: shortRead,
    lastTurnCategory: "MARKET" as const,
  }), "13 What changed? requests fresh state");
  assert(requestsFreshMarketState("give me a new read", {
    lastAssistant: shortRead,
    lastTurnCategory: "MARKET" as const,
  }), "13 give me a new read requests fresh state");
  assert(shouldRefreshMarketState(classifyMentorIntent("What changed?"), {
    lastAssistant: shortRead,
    lastTurnCategory: "MARKET" as const,
  }), "13 CHANGE_ANALYSIS refresh allowed");
  assert(shouldRefreshMarketState("CURRENT_MARKET_READ", {
    lastAssistant: shortRead,
    lastTurnCategory: "MARKET" as const,
  }), "13 CURRENT_MARKET_READ refresh allowed");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("test-karen-wait-followup: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
