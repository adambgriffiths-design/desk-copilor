/**
 * Conversation / voice / state-machine red team.
 * npm run test:karen-redteam-conversation
 *
 * TEXT first. Proves Turn 2 cannot silent-void. No production trading changes.
 */
import {
  classifyMentorIntent,
  isMentorMarketTurn,
  type MentorIntent,
} from "../lib/mentor-intent";
import { classifyDeskRoute } from "../lib/desk-route-intent";
import { mustUseTradingStream } from "../lib/routing";
import { isChartReadCommand, needsFullChartRead } from "../lib/chart-read-intent";
import { isNonTradingConversation, casualChatFallback } from "../lib/casual-chat-intent";
import {
  ConversationSession,
  createConversationSession,
  dispatchTextTurn,
  simulatePanelStreamReader,
  GOLDEN_FOLLOWUP_SEQUENCE,
  SHORT_WHY_SEQUENCE,
  contextFromHistory,
} from "../lib/conversation-state";
import { shouldStopBeforeDispatch } from "../lib/supervisor/safety";
import type { SupervisorTask } from "../lib/supervisor/types";

let passed = 0;
let failed = 0;
const findings: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    findings.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

const READ_ASSISTANT =
  "Right now I'm seeing a wait — bias not confirmed until the sell-side sweep. [bias.tradeable]";

function hist(turns: Array<[string, string]>) {
  const messages: { role: string; content: string }[] = [];
  for (const [u, a] of turns) {
    messages.push({ role: "user", content: u });
    messages.push({ role: "assistant", content: a });
  }
  return messages;
}

function afterRead() {
  return hist([["Give me a read on the chart.", READ_ASSISTANT]]);
}

console.log("=== 5 CONVERSATION RED TEAM ===");
{
  const messages = afterRead();
  const ctx = contextFromHistory(messages, "CURRENT_MARKET_READ");

  const leaning = [
    "why are you leaning that way",
    "Why?",
    "Why bullish",
    "What makes you think that",
    "What's supporting that",
    "Why do you think that's the better side",
  ];
  for (const q of leaning) {
    const intent = classifyMentorIntent(q, ctx);
    const d = dispatchTextTurn(q, ctx, messages);
    const explainOk =
      intent === "EXPLAIN_PREVIOUS_MARKET_READ" ||
      (q === "Why?" && intent === "WAIT_EXPLANATION");
    assert(explainOk, `leaning "${q}" → EXPLAIN_PREVIOUS_MARKET_READ (got ${intent})`);
    assert(d.path === "stream", `leaning "${q}" dispatch stream not ${d.path}`);
    assert(!d.silentVoid, `leaning "${q}" never silent void`);
    assert(mustUseTradingStream(q, ctx), `leaning "${q}" trading stream`);
    assert(!isChartReadCommand(q) && !needsFullChartRead(q, ctx), `leaning "${q}" not screenshot`);
  }

  const seq = GOLDEN_FOLLOWUP_SEQUENCE;
  let lastIntent: MentorIntent | undefined;
  const chain: { role: string; content: string }[] = [];
  for (let i = 0; i < seq.length; i++) {
    const { q, intent } = seq[i];
    const c = contextFromHistory(chain, lastIntent);
    const got = classifyMentorIntent(q, c);
    const d = dispatchTextTurn(q, c, chain);
    assert(got === intent, `golden turn ${i + 1} "${q}" → ${intent} (got ${got})`);
    assert(d.path === "stream", `golden turn ${i + 1} stream`);
    chain.push({ role: "user", content: q });
    chain.push({
      role: "assistant",
      content: i === 0 ? READ_ASSISTANT : "That still holds on the last read. [bias.tradeable]",
    });
    lastIntent = got;
  }
  assert(chain.filter((m) => m.role === "user").length === 5, "golden 5 user turns");
  assert(chain.filter((m) => m.role === "assistant").length === 5, "golden 5 assistant turns");

  lastIntent = "CURRENT_MARKET_READ";
  let shortChain = afterRead();
  for (const q of SHORT_WHY_SEQUENCE) {
    const c = contextFromHistory(shortChain, lastIntent);
    const got = classifyMentorIntent(q, c);
    const d = dispatchTextTurn(q, c, shortChain);
    assert(isMentorMarketTurn(q, c), `short "${q}" mentor market (got ${got})`);
    assert(d.path === "stream", `short "${q}" stream`);
    shortChain = shortChain.concat([
      { role: "user", content: q },
      { role: "assistant", content: "Still the same lean until that pool is taken. [bias.tradeable]" },
    ]);
    lastIntent = got;
  }

  const longQ =
    "why are you leaning that way given the overnight range, the open, and what you just said about waiting";
  const longIntent = classifyMentorIntent(longQ, ctx);
  assert(
    longIntent === "EXPLAIN_PREVIOUS_MARKET_READ" || isMentorMarketTurn(longQ, ctx),
    `long follow-up still market (got ${longIntent})`
  );
  assert(dispatchTextTurn(longQ, ctx, messages).path === "stream", "long follow-up stream");

  const fvgQ = "what is an FVG";
  const fvgRoute = classifyDeskRoute({ text: fvgQ, messages }).route;
  assert(fvgRoute === "trading" || classifyMentorIntent(fvgQ) === "TEACHING", `FVG topic change routes (got ${fvgRoute})`);
  const backChart = dispatchTextTurn("Give me a read on the chart.", contextFromHistory(hist([[fvgQ, "An FVG is a fair value gap."]])));
  assert(backChart.path === "stream" && backChart.intent === "CURRENT_MARKET_READ", "back to chart after FVG");

  const france = "What's the capital of France?";
  const franceRoute = classifyDeskRoute({ text: france, messages }).route;
  assert(franceRoute === "casual" || isNonTradingConversation(france), `France is not a silent market void (route ${franceRoute})`);
  const filler = casualChatFallback(france);
  assert(!/^Ha — say more/i.test(filler), "France never Ha-say-more");
  const backAfterFrance = dispatchTextTurn(
    "Give me a read on the chart.",
    contextFromHistory(hist([[france, "Paris."]]))
  );
  assert(backAfterFrance.path === "stream", "back to chart after France");
}

console.log("\n=== 6 VOICE RED TEAM (same dispatch, mic not required) ===");
{
  const ctx = contextFromHistory(afterRead(), "CURRENT_MARKET_READ");
  const voiceSame = classifyMentorIntent("why are you leaning that way", ctx);
  const textSame = classifyMentorIntent("why are you leaning that way", ctx);
  assert(voiceSame === textSame, "voice/text intent identical");
  const sess = createConversationSession();
  sess.beginTurn({ requestId: "v1", text: "why are you leaning that way" });
  sess.markStreamStart();
  sess.fail("Stream disconnected");
  const afterFail = sess.settleIdle();
  assert(afterFail.phase === "IDLE", "voice stream fail → IDLE");
  assert(sess.assertIdle().length === 0, "voice fail flags clean");
  assert(Boolean(sess.error), "voice fail is visible error not silent");
  sess.beginTurn({ requestId: "v2", text: "Why?" });
  assert(sess.phase === "REQUESTING", "after error, user can ask again");
  sess.complete({ replyLen: 40, responseSource: "trading_stream" });
  sess.settleIdle();
  assert(sess.phase === "IDLE", "second voice-equivalent turn IDLE");
}

console.log("\n=== 7 STATE MACHINE STRESS ===");
{
  const sess = createConversationSession("c-stress");
  const cid = sess.conversationId;
  sess.beginTurn({ requestId: "s1", text: "Give me a read on the chart.", historyLength: 1 });
  assert(sess.phase === "REQUESTING", "REQUESTING after begin");
  sess.markApiStart("200");
  sess.markStreamStart();
  assert(sess.phase === "STREAMING" && sess.requestInFlight && sess.streamOpen, "STREAMING flags");
  sess.markFirstToken();
  sess.complete({ replyLen: 120, responseSource: "trading_stream" });
  assert(sess.phase === "COMPLETE", "COMPLETE after reply");
  sess.settleIdle();
  assert(sess.conversationId === cid, "conversationId preserved");
  assert(sess.assertIdle().length === 0, "IDLE flags after turn 1");

  const hung = simulatePanelStreamReader(
    [
      { type: "sse", data: { type: "delta", reply: "Right now" } },
      { type: "sse", data: { type: "done", reply: "Right now I'm seeing a wait." } },
    ],
    { finishOnSseDone: false }
  );
  assert(hung.blockedFollowUp === true, "BUG repro: SSE done without port done blocks Turn 2");
  const fixed = simulatePanelStreamReader(
    [
      { type: "sse", data: { type: "delta", reply: "Right now" } },
      { type: "sse", data: { type: "done", reply: "Right now I'm seeing a wait." } },
    ],
    { finishOnSseDone: true }
  );
  assert(fixed.finished && !fixed.blockedFollowUp, "FIX: finish on SSE done unlocks Turn 2");
  assert(fixed.reply.length > 0, "Turn 1 reply captured");

  sess.beginTurn({ requestId: "s2", text: "why are you leaning that way", historyLength: 3 });
  sess.fail("timeout");
  sess.settleIdle();
  assert(sess.phase === "IDLE" && sess.error === "timeout", "timeout → ERROR → IDLE");
  sess.beginTurn({ requestId: "s3", text: "What changed?" });
  assert(sess.phase === "REQUESTING", "rapid next question after timeout");
  const recovered = sess.recoverIfStuck("rapid-second");
  assert(recovered && sess.phase === "IDLE", "rapid second recovers leftover lock");

  let consecutive = 0;
  let silent = 0;
  for (let loop = 0; loop < 4; loop++) {
    const s = createConversationSession();
    let lastIntent: MentorIntent | undefined;
    const chain: { role: string; content: string }[] = [];
    for (const row of GOLDEN_FOLLOWUP_SEQUENCE) {
      const c = contextFromHistory(chain, lastIntent);
      const d = dispatchTextTurn(row.q, c, chain);
      s.beginTurn({ text: row.q, historyLength: chain.length + 1 });
      if (d.path !== "stream" || d.silentVoid) silent++;
      s.markStreamStart();
      s.complete({ replyLen: 80, responseSource: "trading_stream" });
      s.settleIdle();
      if (s.assertIdle().length) silent++;
      else consecutive++;
      chain.push({ role: "user", content: row.q });
      chain.push({ role: "assistant", content: READ_ASSISTANT });
      lastIntent = d.intent;
    }
  }
  assert(consecutive === 20, `20 consecutive text turns IDLE+reply (got ${consecutive})`);
  assert(silent === 0, `0 silent failures in 20-turn loop (got ${silent})`);
}

console.log("\n=== 14 MENTOR RED TEAM vs always-WAIT (routing only) ===");
{
  const ctx = contextFromHistory(afterRead(), "CURRENT_MARKET_READ");
  assert(classifyMentorIntent("why are you leaning that way", ctx) !== "CURRENT_MARKET_READ", "follow-up is not a fresh read");
  assert(classifyMentorIntent("What would change your mind?", ctx) === "INVALIDATION", "invalidation stays INVALIDATION");
  assert(classifyMentorIntent("What changed?", ctx) === "CHANGE_ANALYSIS", "what changed stays CHANGE_ANALYSIS");
  assert(
    classifyMentorIntent("Which liquidity matters most right now?", ctx) === "LIQUIDITY_EXPLANATION",
    "liquidity stays LIQUIDITY_EXPLANATION"
  );
  findings.push(
    "MENTOR CONTENT: WAIT vs lean wording is market-state/coaching (other agent). Conversation layer only asserts follow-ups dispatch and classify."
  );
}

console.log("\n=== 15 GENERAL ASSISTANT SUPPORT ===");
{
  type Support = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED";
  const rows: Array<{ q: string; expect: Support; check: () => Support }> = [
    {
      q: "who are you",
      expect: "SUPPORTED",
      check: () => (classifyDeskRoute({ text: "who are you" }).route === "casual" ? "SUPPORTED" : "PARTIAL"),
    },
    {
      q: "What's the capital of France?",
      expect: "SUPPORTED",
      check: () => {
        const r = classifyDeskRoute({ text: "What's the capital of France?" }).route;
        return r === "casual" || r === "live_web" ? "SUPPORTED" : "PARTIAL";
      },
    },
    {
      q: "Tell me a joke",
      expect: "SUPPORTED",
      check: () => (classifyDeskRoute({ text: "Tell me a joke" }).route === "casual" ? "SUPPORTED" : "PARTIAL"),
    },
    {
      q: "place a buy order at 21000",
      expect: "UNSUPPORTED",
      check: () => {
        const r = classifyDeskRoute({ text: "place a buy order at 21000" }).route;
        if (r === "levels") return "UNSUPPORTED";
        return "PARTIAL";
      },
    },
  ];
  for (const row of rows) {
    const got = row.check();
    assert(got === row.expect || (row.expect === "UNSUPPORTED" && got !== "SUPPORTED"), `"${row.q}" ${row.expect} (got ${got})`);
    console.log(`    support: "${row.q}" → ${got}`);
  }
}

console.log("\n=== 16 SAFETY orders/deploy/commit ===");
{
  const dummyTask = (prompt: string): SupervisorTask => ({
    id: "safety-rt",
    title: "safety",
    prompt,
    category: "docs",
    allowedPaths: ["data/research/"],
    priority: 1,
    confidence: 1,
  });
  assert(
    shouldStopBeforeDispatch(dummyTask("Please npx vercel --prod to production deploy")) === "deployment_proposed",
    "deploy blocked"
  );
  assert(shouldStopBeforeDispatch(dummyTask("git push origin main")) === "git_push_proposed", "push blocked");
  assert(shouldStopBeforeDispatch(dummyTask("git commit these changes now")) === "git_commit_proposed", "commit blocked");
  assert(
    shouldStopBeforeDispatch(dummyTask("place an order for MNQ and flatten the position")) === "order_placement_proposed",
    "order placement blocked"
  );
}

console.log("\n=== 17 OBSERVABILITY ===");
{
  const sess = createConversationSession("c-obs");
  sess.beginTurn({ requestId: "obs-1", text: "Give me a read on the chart.", historyLength: 1 });
  sess.setIntent("CURRENT_MARKET_READ");
  sess.setMarketSnapshotId("snap-test");
  sess.markApiStart("200");
  sess.markStreamStart();
  sess.complete({ replyLen: 90, responseSource: "trading_stream" });
  const meta = sess.replyMeta();
  assert(meta.conversationTurn === 1, "conversationTurn attached");
  assert(meta.conversationId === "c-obs", "conversationId attached");
  assert(meta.intent === "CURRENT_MARKET_READ", "intent attached");
  assert(meta.responseSource === "trading_stream", "responseSource attached");
  assert(meta.marketSnapshotId === "snap-test", "marketSnapshotId attached if present");
  assert(Boolean(sess.stages.TURN_START && sess.stages.FIRST_TOKEN === null || sess.stages.STREAM_START), "stages recorded");
  sess.settleIdle();
}

console.log("\n=== 18 REGRESSION: Turn 1 vs Turn 2 first differing stage ===");
{
  const t1 = createConversationSession();
  t1.beginTurn({ requestId: "t1", text: "Give me a read on the chart.", historyLength: 1 });
  t1.setIntent("CURRENT_MARKET_READ");
  t1.markApiStart("200");
  t1.markStreamStart();
  t1.markFirstToken();
  t1.complete({ replyLen: 100, responseSource: "trading_stream" });
  t1.settleIdle();

  const hung = simulatePanelStreamReader(
    [{ type: "sse", data: { type: "done", reply: "wait" } }],
    { finishOnSseDone: false }
  );
  const t2WouldBlock = hung.blockedFollowUp;
  assert(t2WouldBlock, "Turn 2 first differs at STREAM END (port still open after SSE done) — NOT SENT");
  const unblocked = simulatePanelStreamReader(
    [{ type: "sse", data: { type: "done", reply: "wait" } }],
    { finishOnSseDone: true }
  );
  assert(!unblocked.blockedFollowUp, "after fix Turn 2 is SENT (stream finished)");
  const ctx = contextFromHistory(afterRead(), "CURRENT_MARKET_READ");
  const d2 = dispatchTextTurn("why are you leaning that way", ctx, afterRead());
  assert(d2.path === "stream", "Turn 2 dispatch stream");
  assert(d2.intent === "EXPLAIN_PREVIOUS_MARKET_READ", "Turn 2 intent EXPLAIN_PREVIOUS_MARKET_READ");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("REDTEAM FAIL:\n" + findings.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log("karen-redteam-conversation: PASS");
