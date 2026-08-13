/**
 * Wave 2 — casual LLM fallback failure + persona routing regression.
 * No live OpenAI required (LLM paths mocked via finalizeCasualStreamReply / fallback).
 */
import { classifyDeskRoute } from "../lib/desk-route-intent";
import { prefersRichTradingAnswer } from "../lib/chart-question-intent";
import {
  CASUAL_LLM_FAILURE_REPLY,
  casualChatFallback,
  isGeneralConversation,
} from "../lib/casual-chat-intent";
import {
  finalizeCasualStreamReply,
  tryCasualChatReplyInstant,
} from "../lib/chat-engine";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertNotHaFailure(reply: string | null, label: string): void {
  assert(reply !== null && reply.length > 0, `${label}: expected non-empty reply`);
  assert(!/^Ha — say more/i.test(reply!), `${label}: must not use Ha clarification as failure`);
}

function assertFailureReply(reply: string | null, label: string): void {
  assertNotHaFailure(reply, label);
  assert(
    reply === CASUAL_LLM_FAILURE_REPLY,
    `${label}: expected explicit failure reply, got "${reply}"`
  );
}

function traceRoute(phrase: string): string {
  const r = classifyDeskRoute({ text: phrase, routeText: phrase });
  return `${r.route}${r.detail ? ` · ${r.detail}` : ""}`;
}

let failed = 0;

async function run() {
  console.log("=== casual fallback regression ===\n");

  // --- persona vs trading routing ---
  const personaCases = [
    "What's your favourite holiday place?",
    "What's your favourite food?",
    "Do you prefer burgers or pizza?",
  ];
  for (const q of personaCases) {
    try {
      assert(!prefersRichTradingAnswer(q), `persona not rich trading: ${q}`);
      const route = classifyDeskRoute({ text: q, routeText: q });
      assert(route.route === "casual", `persona routes casual: ${q} → ${route.route}`);
      console.log(`✓ persona/casual: ${q} → ${traceRoute(q)}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${(e as Error).message}`);
    }
  }

  try {
    assert(prefersRichTradingAnswer("Where's the last MSS?") === false, "MSS snapshot not rich trading");
    const mssRoute = classifyDeskRoute({ text: "Where's the last MSS?", routeText: "Where's the last MSS?" });
    assert(mssRoute.route === "snapshot", "MSS routes snapshot not trading");
    console.log(`✓ trading/snapshot: Where's the last MSS? → ${traceRoute("Where's the last MSS?")}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${(e as Error).message}`);
  }

  // --- general conversation LLM failure surfaces explicit error ---
  const generalQs = ["What is the time?", "What is 2 plus 2?"];

  for (const q of generalQs) {
    try {
      assert(isGeneralConversation(q), `is general: ${q}`);
      const instant = await tryCasualChatReplyInstant(q, []);
      assert(instant === null, `instant forces LLM for general: ${q}`);

      const emptyStream = finalizeCasualStreamReply("", q, "");
      assertFailureReply(emptyStream, `empty stream: ${q}`);

      const shortStream = finalizeCasualStreamReply("Ok", q, "");
      assertFailureReply(shortStream, `short stream: ${q}`);

      const redirectStream = finalizeCasualStreamReply(
        "As an AI I'm here to help with trading questions.",
        q,
        ""
      );
      assertFailureReply(redirectStream, `redirect stream: ${q}`);

      const fallback = casualChatFallback(q);
      assertFailureReply(fallback, `fallback: ${q}`);

      console.log(`✓ general failure: ${q}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${(e as Error).message}`);
    }
  }

  // --- successful deterministic general (no LLM needed) ---
  try {
    const joke = casualChatFallback("Tell me a joke.");
    assertNotHaFailure(joke, "joke fallback");
    assert(/trader|ladder|joke/i.test(joke), "joke has content");

    const food = await tryCasualChatReplyInstant("What is your favorite food?", []);
    assertNotHaFailure(food, "favorite food instant");
    assert(/burger|chinese|food/i.test(food!), "favorite food content");

    console.log("✓ deterministic general replies still work");
  } catch (e) {
    failed++;
    console.error(`✗ ${(e as Error).message}`);
  }

  // --- non-general ambiguous still allows Ha clarification ---
  try {
    const ambiguous = casualChatFallback("random xyz");
    assert(!isGeneralConversation("random xyz"), "random xyz not general");
    assert(/^Ha — say more/i.test(ambiguous), "ambiguous non-general keeps Ha");
    console.log("✓ non-general ambiguous keeps Ha clarification");
  } catch (e) {
    failed++;
    console.error(`✗ ${(e as Error).message}`);
  }

  // --- before/after routing traces ---
  console.log("\n=== routing traces ===");
  const tracePhrases = [
    "What's your favourite holiday place?",
    "What's your favourite food?",
    "Do you prefer burgers or pizza?",
    "Where's the last MSS?",
    "What is the time?",
  ];
  for (const q of tracePhrases) {
    const route = traceRoute(q);
    const rich = prefersRichTradingAnswer(q);
    const fb = casualChatFallback(q);
    console.log(`  "${q}"`);
    console.log(`    route=${route} richTrading=${rich} fallback="${fb.slice(0, 60)}${fb.length > 60 ? "…" : ""}"`);
  }

  console.log(failed ? `\n${failed} failed` : "\nAll casual fallback tests passed.");
  if (failed) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
