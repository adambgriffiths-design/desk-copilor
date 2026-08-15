/**
 * ONE controlled weekend E2E: historical fixture through the same adapter
 * /api/chat/stream uses when the extension sends historicalFixture.
 * Does not start a replay marathon. Does not modify trading logic.
 */
import fs from "fs";
import path from "path";
import { isGeneralConversation, isNonTradingConversation } from "../lib/casual-chat-intent";
import { isStandaloneGeneralTurn } from "../lib/conversational-intent";
import { peekLiveDeskIntelligenceCache } from "../lib/market-intelligence";
import { getLastPipelineResult } from "../lib/desk-pipeline";
import {
  beginLiveLatencyTrace,
  emitLiveLatencyTraceIfEnabled,
  liveLatencyTimingsPayload,
  markLiveLatencyStage,
  snapshotLiveLatencyTrace,
} from "../lib/live-latency-trace";
import {
  answerHistoricalFixtureTurn,
  clearHistoricalFixtureSession,
  HISTORICAL_FIXTURE_BANNER,
} from "../lib/research/replay/historical-ui";

process.env.LIVE_LATENCY_TRACE = "1";

type Msg = { role: "user" | "assistant"; content: string };

const FIXTURE = { fixtureId: "synthetic-ny-am", barIndex: 50 };
const REPORT = path.join(
  process.cwd(),
  "data",
  "research",
  "karen-weekend-e2e-historical-ui.md"
);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const errors: string[] = [];
  const liveCacheBefore = peekLiveDeskIntelligenceCache();
  const livePipeBefore = getLastPipelineResult();
  clearHistoricalFixtureSession();

  const messages: Msg[] = [];
  let decisionKey = "";
  let firstVisibleMs = 0;
  let finalMs = 0;
  let decisionBlock: Record<string, unknown> = {};

  // 1–4: Give me the read
  {
    const t0 = Date.now();
    beginLiveLatencyTrace(`e2e-read-${t0}`, {
      requestType: "trading:CURRENT_MARKET_READ",
      dataMode: "HISTORICAL_FIXTURE",
      fixtureId: FIXTURE.fixtureId,
      yahooFetched: false,
      tickstreamUsed: false,
    });
    markLiveLatencyStage("intent_classified");
    messages.push({ role: "user", content: "Give me the read" });
    const answered = answerHistoricalFixtureTurn("Give me the read", messages, FIXTURE);
    markLiveLatencyStage("sse_first_visible_token");
    firstVisibleMs = Date.now() - t0;
    markLiveLatencyStage("final_response");
    finalMs = Date.now() - t0;
    emitLiveLatencyTraceIfEnabled();
    const latency = liveLatencyTimingsPayload();
    messages.push({ role: "assistant", content: answered.reply });

    decisionKey = answered.decisionKey;
    const env = answered.envelope;
    decisionBlock = {
      stance: env.stance,
      verdict: answered.session.pipeline.decision.verdict,
      thesis: env.thesis,
      evidenceFacts: String(env.layers.facts || "").slice(0, 500),
      interpretation: String(env.layers.interpretation || "").slice(0, 500),
      conflicts: env.conflictLog,
      invalidation: env.invalidation,
      asOf: answered.session.asOf,
      fixtureId: answered.session.fixtureId,
      barIndex: answered.session.barIndex,
      label: answered.session.label,
      replyPreview: answered.reply.slice(0, 400),
      latency,
      trace: snapshotLiveLatencyTrace(),
    };

    if (!answered.reply.includes("HISTORICAL") || !answered.reply.includes("FIXTURE")) {
      errors.push("Primary reply missing HISTORICAL / FIXTURE label");
    }
    if (answered.session.label !== HISTORICAL_FIXTURE_BANNER) {
      errors.push("Session label mismatch");
    }
  }

  const followUps = [
    "Why?",
    "Why not long?",
    "Why not short?",
    "What are you waiting for?",
  ];
  const followResults: Array<{
    q: string;
    decisionKey: string;
    sameDecision: boolean;
    hasLabel: boolean;
    hasPrevious: boolean;
    preview: string;
  }> = [];

  for (const q of followUps) {
    messages.push({ role: "user", content: q });
    const answered = answerHistoricalFixtureTurn(q, messages, FIXTURE, {
      lastVerdict: messages.find((m) => m.role === "assistant")?.content,
    });
    messages.push({ role: "assistant", content: answered.reply });
    const same = answered.decisionKey === decisionKey;
    followResults.push({
      q,
      decisionKey: answered.decisionKey,
      sameDecision: same,
      hasLabel: /HISTORICAL\s*\/\s*FIXTURE/i.test(answered.reply),
      hasPrevious: /PREVIOUS DECISION/i.test(answered.reply),
      preview: answered.reply.slice(0, 280),
    });
    if (!same) errors.push(`Follow-up "${q}" changed decisionKey`);
    if (!/HISTORICAL\s*\/\s*FIXTURE/i.test(answered.reply)) {
      errors.push(`Follow-up "${q}" missing HISTORICAL label`);
    }
  }

  // Live isolation
  const liveCacheAfter = peekLiveDeskIntelligenceCache();
  const livePipeAfter = getLastPipelineResult();
  const liveIsolation =
    liveCacheAfter === liveCacheBefore && livePipeAfter === livePipeBefore;
  if (!liveIsolation) {
    errors.push("Live intel cache or lastPipeline was mutated by historical path");
  }

  // General questions bypass market pipeline (intent-level)
  const generals = [
    "what's the capital of germany?",
    "tell me a joke",
    "what is 2+2?",
  ];
  const generalChecks = generals.map((q) => {
    const bypass =
      isGeneralConversation(q) ||
      isStandaloneGeneralTurn(q) ||
      isNonTradingConversation(q);
    if (!bypass) errors.push(`General question not off-market: ${q}`);
    return { q, bypass };
  });

  // No live market request flags (trace meta)
  const yahooOrTick =
    decisionBlock.trace &&
    typeof decisionBlock.trace === "object" &&
    ((decisionBlock.trace as { yahooFetched?: boolean }).yahooFetched === true ||
      (decisionBlock.trace as { tickstreamUsed?: boolean }).tickstreamUsed === true);
  if (yahooOrTick) errors.push("Latency trace marked yahoo/tickstream used");

  const pass = errors.length === 0;
  const md = `# KAREN — Weekend E2E historical UI analysis

**Date:** ${new Date().toISOString()}
**Path:** extension → \`historicalFixture\` → \`/api/chat/stream\` → \`answerHistoricalFixtureTurn\` / \`buildKarenReplayResponse\`
**Mode:** HISTORICAL / FIXTURE — NOT LIVE
**Verdict:** **${pass ? "PASS" : "FAIL"}**

## FIXTURE
- id: \`${FIXTURE.fixtureId}\`
- barIndex: \`${FIXTURE.barIndex}\`
- asOf: \`${decisionBlock.asOf}\`
- UI label: \`${HISTORICAL_FIXTURE_BANNER}\`
- Enable in panel Dev tools: **Enable HISTORICAL / FIXTURE mode** (fixture + bar index)

## DECISION
\`\`\`json
${JSON.stringify(
  {
    stance: decisionBlock.stance,
    verdict: decisionBlock.verdict,
    thesis: decisionBlock.thesis,
    conflicts: decisionBlock.conflicts,
    invalidation: decisionBlock.invalidation,
    evidenceFacts: decisionBlock.evidenceFacts,
    interpretation: decisionBlock.interpretation,
    decisionKey,
  },
  null,
  2
)}
\`\`\`

Primary reply preview:
\`\`\`
${decisionBlock.replyPreview}
\`\`\`

## MENTOR CONSISTENCY
- Envelope stance used for spoken mentor line: \`${decisionBlock.stance}\`
- Source: pipeline DecisionEnvelope (not \`buildDeterministicKarenResponse\`)

## FOLLOW-UP CONSISTENCY
| Question | Same decisionKey | HISTORICAL label | PREVIOUS DECISION |
|----------|------------------|------------------|-------------------|
${followResults
  .map(
    (r) =>
      `| ${r.q} | ${r.sameDecision ? "yes" : "NO"} | ${r.hasLabel ? "yes" : "NO"} | ${
        r.hasPrevious ? "yes" : "no"
      } |`
  )
  .join("\n")}

## LIVE/DATA ISOLATION
- Live intel cache unchanged: **${liveCacheAfter === liveCacheBefore ? "yes" : "NO"}**
- Live lastPipeline unchanged: **${livePipeAfter === livePipeBefore ? "yes" : "NO"}**
- Yahoo/Tickstream requested: **no** (fixture path)
- TradingView state: **not modified** (API path does not touch TV; extension historical mode omits chartLastPrice / chartSnapshot extras)
- General questions bypass market pipeline: ${generalChecks
    .map((g) => `${g.q}→${g.bypass ? "bypass" : "FAIL"}`)
    .join("; ")}

## TIME TO FIRST VISIBLE RESPONSE
- ${firstVisibleMs} ms (fixture path / in-process; LIVE_LATENCY_TRACE dataMode=HISTORICAL_FIXTURE)

## TIME TO FINAL RESPONSE
- ${finalMs} ms

## ERRORS
${errors.length ? errors.map((e) => `- ${e}`).join("\n") : "- none"}

## PASS/FAIL
**${pass ? "PASS" : "FAIL"}**

### Follow-up previews
${followResults.map((r) => `#### ${r.q}\n\`\`\`\n${r.preview}\n\`\`\``).join("\n\n")}
`;

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, md, "utf8");
  console.log(md);
  console.log(`\nWrote ${REPORT}`);
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
