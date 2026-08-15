/**
 * Voice bottleneck audit — TEXT vs VOICE routing + configured delays.
 * Honest: no live mic in this process. Measures what the pipeline would do.
 *
 * npm run test:voice-bottleneck
 */
import { classifyMentorIntent, isMentorMarketTurn, shouldRefreshMarketState } from "../lib/mentor-intent";
import { classifyDeskRoute } from "../lib/desk-route-intent";
import { mustUseTradingStream } from "../lib/routing";
import {
  VAD_SILENCE_MS,
  TRANSCRIPT_SETTLE_MS,
  UTTERANCE_MERGE_MS,
  echoSuppressTailMs,
} from "../lib/voice-quick-reply";
import { extractFirstCompleteSentence } from "../lib/voice-speak-sync";
import {
  contextFromHistory,
  createConversationSession,
  dispatchTextTurn,
  simulatePanelStreamReader,
  GOLDEN_FOLLOWUP_SEQUENCE,
} from "../lib/conversation-state";

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

const READ =
  "Right now I'm seeing a wait — bias not confirmed until the sell-side sweep. [bias.tradeable]";

const CONVO = [
  "Give me a read on the chart.",
  "why are you leaning that way",
  "What would change your mind?",
  "What changed?",
  "Which liquidity matters most right now?",
];

const MENTOR_LOOP = [
  { q: "Give me a read on the chart.", role: "QUESTION" },
  { q: "Why?", role: "WHY" },
  { q: "What would change your mind?", role: "FOLLOW-UP" },
  { q: "Are you sure that still holds?", role: "CHALLENGE" },
];

console.log("=== TEXT vs VOICE routing (same questions, mic not required) ===");
{
  const chain: { role: string; content: string }[] = [];
  let lastIntent: ReturnType<typeof classifyMentorIntent> | undefined;
  for (const q of CONVO) {
    const ctx = contextFromHistory(chain, lastIntent);
    const textPath = dispatchTextTurn(q, ctx, chain);
    const voiceIntent = classifyMentorIntent(q, ctx);
    const voiceRoute = classifyDeskRoute({
      text: q,
      messages: chain,
      lastAssistant: ctx.lastAssistant,
      lastMentorIntent: lastIntent,
    }).route;
    assert(textPath.intent === voiceIntent, `TEXT/VOICE intent match "${q}" (${voiceIntent})`);
    assert(textPath.path === "stream", `TEXT "${q}" stream`);
    assert(voiceRoute === "trading", `VOICE "${q}" trading route (got ${voiceRoute})`);
    assert(mustUseTradingStream(q, ctx), `VOICE "${q}" trading stream`);
    chain.push({ role: "user", content: q });
    chain.push({ role: "assistant", content: READ });
    lastIntent = voiceIntent;
    console.log(`    ${q} → ${voiceIntent} / ${voiceRoute}`);
  }
}

console.log("\n=== Mentor loop QUESTION → WHY → FOLLOW-UP → CHALLENGE ===");
{
  const chain: { role: string; content: string }[] = [];
  let lastIntent: ReturnType<typeof classifyMentorIntent> | undefined;
  for (const row of MENTOR_LOOP) {
    const ctx = contextFromHistory(chain, lastIntent);
    const d = dispatchTextTurn(row.q, ctx, chain);
    assert(d.path === "stream", `${row.role} "${row.q}" not silent (${d.path})`);
    assert(isMentorMarketTurn(row.q, ctx) || d.path === "stream", `${row.role} has a reply path`);
    chain.push({ role: "user", content: row.q });
    chain.push({ role: "assistant", content: READ });
    lastIntent = d.intent;
    console.log(`    ${row.role}: ${row.q} → ${d.intent}`);
    if (row.role === "CHALLENGE") {
      assert(
        d.intent === "EXPLAIN_PREVIOUS_MARKET_READ",
        `CHALLENGE stays on previous read (got ${d.intent})`
      );
      assert(
        !shouldRefreshMarketState(d.intent, ctx),
        "CHALLENGE must not block on a new snapshot"
      );
    }
    if (row.role === "WHY") {
      assert(
        !shouldRefreshMarketState(d.intent, ctx),
        `WHY must not block on a new snapshot (intent ${d.intent})`
      );
    }
  }
}

console.log("\n=== Interruption + recovery (state machine, not live mic) ===");
{
  const sess = createConversationSession();
  sess.beginTurn({ requestId: "t1", text: CONVO[0] });
  sess.markStreamStart();
  sess.beginTurn({ requestId: "t2", text: CONVO[1] });
  assert(sess.conversationTurn === 2, "barge-in starts turn 2");
  assert(sess.requestId === "t2", "turn 2 owns requestId");
  sess.fail("Stream disconnected");
  sess.settleIdle();
  assert(sess.phase === "IDLE", "interrupt error → IDLE");
  assert(Boolean(sess.error), "visible error, not silent");
  sess.beginTurn({ requestId: "t3", text: "Why?" });
  assert(sess.phase === "REQUESTING", "user can ask again after interrupt");
  sess.complete({ replyLen: 60, responseSource: "trading_stream" });
  sess.settleIdle();
  assert(sess.assertIdle().length === 0, "recovery IDLE clean");
}

console.log("\n=== Turn 2 stream lock (highest-value conversation bottleneck) ===");
{
  const hung = simulatePanelStreamReader(
    [{ type: "sse", data: { type: "done", reply: READ } }],
    { finishOnSseDone: false }
  );
  assert(hung.blockedFollowUp, "unfixed: SSE done leaves Turn 2 NOT SENT");
  const fixed = simulatePanelStreamReader(
    [{ type: "sse", data: { type: "done", reply: READ } }],
    { finishOnSseDone: true }
  );
  assert(fixed.finished && !fixed.blockedFollowUp, "fixed: finish on SSE done → Turn 2 can send");
}

console.log("\n=== Configured delays (not live stopwatch) ===");
{
  const postSpeech = VAD_SILENCE_MS + TRANSCRIPT_SETTLE_MS;
  console.log(`    VAD_SILENCE_MS=${VAD_SILENCE_MS}`);
  console.log(`    TRANSCRIPT_SETTLE_MS=${TRANSCRIPT_SETTLE_MS}`);
  console.log(`    post-speech floor=${postSpeech}ms`);
  console.log(`    UTTERANCE_MERGE_MS=${UTTERANCE_MERGE_MS}`);
  console.log(`    echo tail short="${echoSuppressTailMs("Wait.")}ms" long="${echoSuppressTailMs(READ)}ms"`);
  assert(postSpeech === 600, `post-speech floor is 600ms (got ${postSpeech})`);
  const first = extractFirstCompleteSentence("Right now I'm seeing a wait. Next sentence.");
  assert(first.startsWith("Right now"), `early TTS sentence extracted ("${first}")`);
  const tooShort = extractFirstCompleteSentence("Wait.");
  assert(tooShort === "" || tooShort.length >= 5, "short first sentence may wait for more tokens");
}

console.log("\n=== Market-state refresh (do not block Turn 2 on a new snapshot) ===");
{
  const afterRead = contextFromHistory(
    [
      { role: "user", content: CONVO[0] },
      { role: "assistant", content: READ },
    ],
    "CURRENT_MARKET_READ"
  );
  const t0 = performance.now();
  const whyIntent = classifyMentorIntent(CONVO[1], afterRead);
  const intentMs = performance.now() - t0;
  console.log(`    intent classify "${CONVO[1]}" ${intentMs.toFixed(2)}ms → ${whyIntent}`);
  assert(whyIntent === "EXPLAIN_PREVIOUS_MARKET_READ", `Turn 2 intent (got ${whyIntent})`);
  assert(!shouldRefreshMarketState(whyIntent, afterRead), "Turn 2 skip fresh intel");
  assert(shouldRefreshMarketState("CURRENT_MARKET_READ"), "Turn 1 still refreshes intel");
  assert(shouldRefreshMarketState("CHANGE_ANALYSIS", afterRead), "What changed still refreshes");
  // Prior-read follow-ups explain the last spoken thesis — do not block Turn 2 on a new snapshot.
  assert(!shouldRefreshMarketState("LIQUIDITY_EXPLANATION", afterRead), "liquidity follow-up skips intel");
  assert(!shouldRefreshMarketState("INVALIDATION", afterRead), "invalidation follow-up skips intel");
  assert(shouldRefreshMarketState("LIQUIDITY_EXPLANATION"), "liquidity without prior still refreshes");
  assert(shouldRefreshMarketState("INVALIDATION"), "invalidation without prior still refreshes");
  const bullish = contextFromHistory(
    [
      { role: "user", content: CONVO[0] },
      { role: "assistant", content: "Right now I'm seeing buy-side still unswept. [bias.tradeable]" },
    ],
    "CURRENT_MARKET_READ"
  );
  const whyBull = classifyMentorIntent("Why?", bullish);
  assert(
    whyBull === "EXPLAIN_PREVIOUS_MARKET_READ",
    `Why? after non-wait read → EXPLAIN (got ${whyBull})`
  );
  assert(!shouldRefreshMarketState(whyBull, bullish), "Why? after read skips intel");
}

console.log("\n=== Golden 5-turn TEXT (voice uses same dispatch) ===");
{
  let lastIntent: ReturnType<typeof classifyMentorIntent> | undefined;
  const chain: { role: string; content: string }[] = [];
  for (let i = 0; i < GOLDEN_FOLLOWUP_SEQUENCE.length; i++) {
    const row = GOLDEN_FOLLOWUP_SEQUENCE[i];
    const ctx = contextFromHistory(chain, lastIntent);
    const d = dispatchTextTurn(row.q, ctx, chain);
    assert(d.intent === row.intent, `turn ${i + 1} ${row.intent} (got ${d.intent})`);
    chain.push({ role: "user", content: row.q });
    chain.push({ role: "assistant", content: READ });
    lastIntent = d.intent;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("voice-bottleneck: PASS (routing+state; live mic NOT measured)");
