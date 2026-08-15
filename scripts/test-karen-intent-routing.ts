/**
 * Conversational intent isolation — 10 user-listed regressions.
 * npm run test:karen-intent-routing
 *
 * Does not call live OpenAI. Berlin is the casual-LLM answer once routing
 * forces the general-knowledge stream (not a country special-case).
 */
import {
  classifyConversationalIntent,
  isStandaloneGeneralTurn,
  isLinguisticMarketFollowUp,
  isUnintelligibleInput,
  isConnectionFailureNotIntentMiss,
  connectionFailureKind,
  type ConversationalIntent,
} from "../lib/conversational-intent";
import { classifyDeskRoute } from "../lib/desk-route-intent";
import {
  casualChatFallback,
  isGeneralConversation,
  THREAD_CLARIFY_REPLY,
  CASUAL_LLM_FAILURE_REPLY,
} from "../lib/casual-chat-intent";
import { classifyTurn, shouldDeferCasualRoute } from "../lib/pending-request";
import { classifyMentorIntent, mentorContextFromMessages } from "../lib/mentor-intent";
import { mustUseTradingStream } from "../lib/routing";
import { prefersRichTradingAnswer } from "../lib/chart-question-intent";
import { classifyExtensionMessagingFailure } from "../lib/connection-state";
import { dispatchTextTurn, contextFromHistory } from "../lib/conversation-state";
import { repairConversationalStt } from "../lib/conversational-normalize";

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

function assertNotClarify(text: string, label: string) {
  const fb = casualChatFallback(text);
  assert(fb !== THREAD_CLARIFY_REPLY, `${label}: must not use still-on-this clarification (got "${fb.slice(0, 80)}")`);
  assert(!/didn't quite catch that|still on this/i.test(fb), `${label}: clarification phrasing`);
}

function assertNotConnectionCopy(text: string, label: string) {
  const fb = casualChatFallback(text);
  assert(
    !/reconnect|backend offline|extension disconnected|receiving end/i.test(fb),
    `${label}: intent miss must not look like a connection error`
  );
}

const MARKET_ASSISTANT =
  "Right now I'm seeing a wait — bias not confirmed until the sell-side sweep. [bias.tradeable]";

const marketHistory = [
  { role: "user", content: "Give me a read on the market." },
  { role: "assistant", content: MARKET_ASSISTANT },
];

const marketCtx = contextFromHistory(marketHistory, "CURRENT_MARKET_READ");

function routeAfterMarket(q: string) {
  return classifyDeskRoute({
    text: q,
    routeText: q,
    messages: marketHistory,
    lastAssistant: MARKET_ASSISTANT,
    lastMentorIntent: "CURRENT_MARKET_READ",
  });
}

async function run() {
console.log("=== STT repair before intent ===");
{
  assert(repairConversationalStt("whats the capital of germany") === "what's the capital of germany", "whats → what's");
  assert(
    classifyConversationalIntent("whats the capital of germany") ===
      classifyConversationalIntent("what's the capital of germany"),
    "informal contraction matches punctuated form"
  );
}

console.log("\n=== 1. capital of germany → GENERAL_KNOWLEDGE (LLM path for Berlin) ===");
{
  const q = "what's the capital of germany?";
  const intent = classifyConversationalIntent(q);
  const route = classifyDeskRoute({ text: q }).route;
  assert(intent === "GENERAL_KNOWLEDGE", `1 intent GENERAL_KNOWLEDGE (got ${intent})`);
  assert(route === "casual", `1 route casual (got ${route})`);
  assert(isStandaloneGeneralTurn(q), "1 standalone general");
  assert(isGeneralConversation(q), "1 isGeneralConversation");
  assertNotClarify(q, "1");
  assertNotConnectionCopy(q, "1");
  const fb = casualChatFallback(q);
  assert(fb === CASUAL_LLM_FAILURE_REPLY, "1 fallback forces casual LLM (Berlin comes from the model, not a keyword table)");
}

console.log("\n=== 1c. explain why the sky is blue → general (not MENTOR/TRADE stream) ===");
{
  for (const q of [
    "Explain why the sky is blue.",
    "Explain why the sky is blue",
    "why is the sky blue?",
    "How does photosynthesis work?",
  ]) {
    const intent = classifyConversationalIntent(q);
    const route = classifyDeskRoute({ text: q }).route;
    assert(
      intent === "GENERAL_KNOWLEDGE" || intent === "GENERAL_CHAT",
      `1c "${q}" general intent (got ${intent})`
    );
    assert(route === "casual", `1c "${q}" route casual (got ${route})`);
    assert(isStandaloneGeneralTurn(q) || isGeneralConversation(q), `1c "${q}" general conversation`);
    assert(!mustUseTradingStream(q), `1c "${q}" must NOT use trading stream`);
    assert(dispatchTextTurn(q).path === "casual", `1c "${q}" dispatch casual`);
    assertNotClarify(q, `1c ${q}`);
  }
  // After a market read, sky-blue must still break out of the envelope path.
  const q = "Explain why the sky is blue.";
  assert(!mustUseTradingStream(q, marketCtx), "1c after market still not trading stream");
  assert(routeAfterMarket(q).route === "casual", "1c after market route casual");
  assert(dispatchTextTurn(q, marketCtx, marketHistory).path === "casual", "1c after market dispatch casual");
  // Trading explain/why phrasing must still stream.
  assert(mustUseTradingStream("explain the bias"), "1c explain the bias still trading stream");
  assert(mustUseTradingStream("why are you short"), "1c why are you short still trading stream");
  assert(!prefersRichTradingAnswer("Explain why the sky is blue."), "1c prefersRich sky-blue false");
  assert(!prefersRichTradingAnswer("why is the sky blue?"), "1c prefersRich why-sky-blue false");
  assert(prefersRichTradingAnswer("why are you short"), "1c prefersRich why-are-you-short true");
  assert(prefersRichTradingAnswer("explain the bias"), "1c prefersRich explain-the-bias true");
}

console.log("\n=== 1b. capital of berlin → same GENERAL_KNOWLEDGE LLM path ===");
{
  const q = "what is the capital of berlin";
  const intent = classifyConversationalIntent(q);
  const route = classifyDeskRoute({ text: q }).route;
  assert(intent === "GENERAL_KNOWLEDGE", `1b intent GENERAL_KNOWLEDGE (got ${intent})`);
  assert(route === "casual", `1b route casual (got ${route})`);
  assert(isStandaloneGeneralTurn(q), "1b standalone general");
  assert(isGeneralConversation(q), "1b isGeneralConversation");
  assertNotClarify(q, "1b");
  assertNotConnectionCopy(q, "1b");
  const fb = casualChatFallback(q);
  assert(fb === CASUAL_LLM_FAILURE_REPLY, "1b fallback forces casual LLM, not a canned geography table");
}

console.log("\n=== 2. previous market + capital of germany → still GENERAL_KNOWLEDGE ===");
{
  for (const q of [
    "What's the capital of Germany?",
    "whats the capital of germany",
    "what's the capital of germany",
  ]) {
    const intent = classifyConversationalIntent(q, marketCtx);
    const route = routeAfterMarket(q);
    const kind = classifyTurn(q, marketHistory);
    const d = dispatchTextTurn(q, marketCtx, marketHistory);
    assert(intent === "GENERAL_KNOWLEDGE", `2 "${q}" intent GENERAL_KNOWLEDGE (got ${intent})`);
    assert(route.route === "casual", `2 "${q}" route casual (got ${route.route})`);
    assert(kind === "NEW_REQUEST", `2 "${q}" NEW_REQUEST (got ${kind})`);
    assert(!shouldDeferCasualRoute(q, marketHistory), `2 "${q}" does not defer casual`);
    assert(d.path === "casual", `2 "${q}" dispatch casual (got ${d.path})`);
    assert(!mustUseTradingStream(q, marketCtx), `2 "${q}" not trading stream`);
    assertNotClarify(q, `2 ${q}`);
  }
}

console.log("\n=== 3. previous market + why? → MARKET_FOLLOWUP ===");
{
  const q = "Why?";
  const intent = classifyConversationalIntent(q, marketCtx);
  assert(intent === "MARKET_FOLLOWUP" || classifyMentorIntent(q, marketCtx) === "WAIT_EXPLANATION" || classifyMentorIntent(q, marketCtx) === "EXPLAIN_PREVIOUS_MARKET_READ", `3 Why? market follow-up (got ${intent} / ${classifyMentorIntent(q, marketCtx)})`);
  assert(isLinguisticMarketFollowUp(q, marketCtx), "3 Why? is linguistic follow-up with market ctx");
  assert(classifyTurn(q, marketHistory) === "FOLLOW_UP", "3 Why? FOLLOW_UP");
  assert(shouldDeferCasualRoute(q, marketHistory), "3 Why? defers casual");
  assert(mustUseTradingStream(q, marketCtx), "3 Why? trading stream");
  assert(dispatchTextTurn(q, marketCtx, marketHistory).path === "stream", "3 Why? dispatch stream");
}

console.log("\n=== 4. previous market + why are you bullish? → MARKET_FOLLOWUP ===");
{
  const q = "why are you bullish?";
  const intent = classifyConversationalIntent(q, marketCtx);
  const mentor = classifyMentorIntent(q, marketCtx);
  assert(
    intent === "MARKET_FOLLOWUP" || mentor === "EXPLAIN_PREVIOUS_MARKET_READ" || mentor === "BIAS_EXPLANATION",
    `4 intent market follow-up (got ${intent} / ${mentor})`
  );
  assert(classifyTurn(q, marketHistory) === "FOLLOW_UP", "4 FOLLOW_UP");
  assert(mustUseTradingStream(q, marketCtx), "4 trading stream");
}

console.log("\n=== 5. tell me a joke → GENERAL_CHAT ===");
{
  const q = "tell me a joke";
  const intent = classifyConversationalIntent(q);
  const route = classifyDeskRoute({ text: q }).route;
  assert(intent === "GENERAL_CHAT", `5 GENERAL_CHAT (got ${intent})`);
  assert(route === "casual", `5 casual (got ${route})`);
  const fb = casualChatFallback(q);
  assert(/trader|ladder|joke/i.test(fb), "5 joke has content");
  assertNotClarify(q, "5");
  const afterMarket = classifyConversationalIntent(q, marketCtx);
  assert(afterMarket === "GENERAL_CHAT", `5 after market still GENERAL_CHAT (got ${afterMarket})`);
  assert(routeAfterMarket(q).route === "casual", "5 after market still casual");
}

console.log("\n=== 6. what is 2+2? → GENERAL_KNOWLEDGE ===");
{
  const q = "what is 2+2?";
  const intent = classifyConversationalIntent(q);
  assert(intent === "GENERAL_KNOWLEDGE", `6 GENERAL_KNOWLEDGE (got ${intent})`);
  assert(classifyDeskRoute({ text: q }).route === "casual", "6 casual");
  assert(isGeneralConversation(q), "6 general conversation");
  assertNotClarify(q, "6");
  const times = "What's 17 times 23?";
  assert(classifyConversationalIntent(times) === "GENERAL_KNOWLEDGE", "6 17×23 GENERAL_KNOWLEDGE");
  assert(routeAfterMarket(times).route === "casual", "6 17×23 after market casual");
  assertNotClarify(times, "6 times");
}

console.log("\n=== 7. give me a read on the chart → MARKET_ANALYSIS ===");
{
  const q = "give me a read on the chart";
  const intent = classifyConversationalIntent(q);
  assert(intent === "MARKET_ANALYSIS", `7 MARKET_ANALYSIS (got ${intent})`);
  assert(classifyMentorIntent(q) === "CURRENT_MARKET_READ", "7 CURRENT_MARKET_READ");
  assert(mustUseTradingStream(q), "7 trading stream");
  assert(classifyDeskRoute({ text: q }).route === "trading", "7 desk route trading");
}

console.log("\n=== 8. what are you seeing? → MARKET_ANALYSIS ===");
{
  const q = "what are you seeing?";
  const intent = classifyConversationalIntent(q);
  const withCtx = classifyConversationalIntent(q, marketCtx);
  assert(intent === "MARKET_ANALYSIS", `8 MARKET_ANALYSIS (got ${intent})`);
  assert(withCtx === "MARKET_ANALYSIS", `8 with market ctx still MARKET_ANALYSIS (got ${withCtx})`);
  assert(!isStandaloneGeneralTurn(q), "8 not standalone general");
  assert(mustUseTradingStream(q), "8 trading stream");
}

console.log("\n=== 9. unintelligible → clarification ===");
{
  const q = "random xyz";
  const intent = classifyConversationalIntent(q);
  assert(intent === "AMBIGUOUS", `9 AMBIGUOUS (got ${intent})`);
  assert(isUnintelligibleInput(q), "9 unintelligible");
  const fb = casualChatFallback(q);
  assert(fb === THREAD_CLARIFY_REPLY || /catch that|still on this|something else/i.test(fb), `9 clarification (got "${fb}")`);
  assert(fb !== CASUAL_LLM_FAILURE_REPLY, "9 not LLM-failure copy");
}

console.log("\n=== 10. connection failure ≠ intent miss ===");
{
  const receiving = "Could not establish connection. Receiving end does not exist.";
  const invalidated = "Extension context invalidated.";
  assert(connectionFailureKind(receiving) === "receiving_end", "10 receiving_end");
  assert(connectionFailureKind(invalidated) === "invalidated", "10 invalidated");
  assert(isConnectionFailureNotIntentMiss(receiving), "10 messaging failure classified");
  assert(classifyExtensionMessagingFailure("whats the capital of germany") === null, "10 general Q is not a connection error");
  assert(classifyConversationalIntent("whats the capital of germany") !== "SYSTEM_CONNECTION", "10 capital is not SYSTEM_CONNECTION");
  assertNotConnectionCopy("whats the capital of germany", "10");
  const reconnect = classifyConversationalIntent("reconnect");
  assert(reconnect === "SYSTEM_CONNECTION", `10 reconnect SYSTEM_CONNECTION (got ${reconnect})`);
}

console.log("\n=== extra: other standalone breaks after market ===");
{
  const extras: Array<[string, ConversationalIntent]> = [
    ["Who was Napoleon?", "GENERAL_KNOWLEDGE"],
    ["How does photosynthesis work?", "GENERAL_KNOWLEDGE"],
    ["What's the weather?", "GENERAL_KNOWLEDGE"],
    ["stop talking", "VOICE_DESK_CONTROL"],
  ];
  for (const [q, want] of extras) {
    const got = classifyConversationalIntent(q, marketCtx);
    assert(got === want, `"${q}" after market → ${want} (got ${got})`);
    if (want === "GENERAL_KNOWLEDGE" || want === "GENERAL_CHAT") {
      assert(classifyTurn(q, marketHistory) === "NEW_REQUEST", `"${q}" NEW_REQUEST`);
      assertNotClarify(q, q);
    }
  }
}

console.log("\n=== 11. Germany → Berlin → why is it → general follow-up (NOT quality gate / market) ===");
{
  const germanyHistory = [
    ...marketHistory,
    { role: "user", content: "what's the capital of Germany?" },
    { role: "assistant", content: "Berlin is the capital of Germany." },
  ];
  const ctx = contextFromHistory(germanyHistory, "CURRENT_MARKET_READ");
  for (const q of ["why is it", "Why?", "why is it?"]) {
    const intent = classifyConversationalIntent(q, ctx);
    const route = classifyDeskRoute({
      text: q,
      messages: germanyHistory,
      lastMentorIntent: "CURRENT_MARKET_READ",
    });
    const kind = classifyTurn(q, germanyHistory);
    const d = dispatchTextTurn(q, ctx, germanyHistory);
    assert(
      intent === "GENERAL_KNOWLEDGE" || intent === "GENERAL_CHAT",
      `11 "${q}" intent general (got ${intent})`
    );
    assert(route.route === "casual", `11 "${q}" route casual (got ${route.route})`);
    assert(kind === "NEW_REQUEST", `11 "${q}" NEW_REQUEST (got ${kind})`);
    assert(!shouldDeferCasualRoute(q, germanyHistory), `11 "${q}" does not defer casual`);
    assert(!mustUseTradingStream(q, ctx), `11 "${q}" not trading stream`);
    assert(d.path === "casual", `11 "${q}" dispatch casual (got ${d.path})`);
    assertNotClarify(q, `11 ${q}`);
  }
}

console.log("\n=== 12. market read → Why? → market follow-up ===");
{
  const q = "Why?";
  const ctx = contextFromHistory(marketHistory, "CURRENT_MARKET_READ");
  assert(classifyConversationalIntent(q, ctx) === "MARKET_FOLLOWUP", "12 Why? MARKET_FOLLOWUP after market");
  assert(classifyTurn(q, marketHistory) === "FOLLOW_UP", "12 Why? FOLLOW_UP");
  assert(shouldDeferCasualRoute(q, marketHistory), "12 Why? defers casual");
  assert(mustUseTradingStream(q, ctx), "12 Why? trading stream");
  assert(dispatchTextTurn(q, ctx, marketHistory).path === "stream", "12 Why? dispatch stream");
}

console.log("\n=== 13. market read → capital of france → Paris (break intent) ===");
{
  const q = "what's the capital of france";
  const ctx = contextFromHistory(marketHistory, "CURRENT_MARKET_READ");
  assert(classifyConversationalIntent(q, ctx) === "GENERAL_KNOWLEDGE", "13 France GENERAL_KNOWLEDGE");
  assert(routeAfterMarket(q).route === "casual", "13 France casual after market");
  assert(classifyTurn(q, marketHistory) === "NEW_REQUEST", "13 France NEW_REQUEST");
}

console.log("\n=== 14. extension content.js ctx shape — stale intent must not force trading ===");
{
  const germanyHistory = [
    ...marketHistory,
    { role: "user", content: "what's the capital of Germany?" },
    { role: "assistant", content: "Berlin is the capital of Germany." },
  ];
  const q = "why is it";
  const staleCtxWithoutCategory = {
    lastMentorIntent: "CURRENT_MARKET_READ" as const,
    lastAssistant: "Berlin is the capital of Germany.",
    lastUser: "what's the capital of Germany?",
  };
  const fullCtx = mentorContextFromMessages(germanyHistory, "CURRENT_MARKET_READ");
  assert(
    fullCtx.lastTurnCategory === "GENERAL_KNOWLEDGE",
    `14 lastTurnCategory GENERAL_KNOWLEDGE (got ${fullCtx.lastTurnCategory})`
  );
  // Stale ctx used to force trading via bare "why" → prefersRichTradingAnswer.
  // General guards now keep "why is it" off the DecisionEnvelope stream.
  assert(
    !mustUseTradingStream(q, staleCtxWithoutCategory),
    "14 stale ctx without category must not force trading"
  );
  assert(!mustUseTradingStream(q, fullCtx), "14 full ctx must not use trading stream");
  assert(
    classifyMentorIntent(q, fullCtx) === "GENERAL_CHAT",
    `14 full ctx general mentor intent (got ${classifyMentorIntent(q, fullCtx)})`
  );
}

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
