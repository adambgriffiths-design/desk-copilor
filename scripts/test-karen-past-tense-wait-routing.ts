/**
 * Feature-6 past-tense wait routing — mentor-intent only (clean-shipset safe).
 * No mentor-coaching / chat-engine wait helpers / live OpenAI.
 *
 * Run: npx tsx scripts/test-karen-past-tense-wait-routing.ts
 */
import {
  classifyMentorIntent,
  isPriorReadFollowUpPhrase,
  isMentorFollowUpOnPriorRead,
  type MentorIntentContext,
} from "../lib/mentor-intent";

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

const marketCtx: MentorIntentContext = {
  lastAssistant:
    "Right now I'm seeing a wait — bias not confirmed until the sell-side sweep. [bias.tradeable]",
  lastMentorIntent: "CURRENT_MARKET_READ",
  lastTurnCategory: "MARKET",
};

const PAST_WAIT = [
  "What were you waiting for?",
  "what were you waiting for",
  "Why were you waiting?",
  "why were you waiting",
];

const PRESENT_WAIT = [
  "What are you waiting for?",
  "Why are you waiting?",
];

const PRESENT_WAIT_EXPLAIN_ONLY = [
  "what's keeping you waiting", // WAIT_EXPLANATION via isWaitExplanation; not all are prior-read phrases
];

console.log("\n=== Feature-6 past-tense wait routing (mentor-intent) ===\n");

for (const q of PAST_WAIT) {
  assert(isPriorReadFollowUpPhrase(q), `prior-read phrase: ${q}`);
  assert(
    classifyMentorIntent(q, marketCtx) === "WAIT_EXPLANATION",
    `WAIT_EXPLANATION after market: ${q}`
  );
  assert(
    isMentorFollowUpOnPriorRead(q, marketCtx),
    `follow-up on prior read: ${q}`
  );
}

for (const q of PRESENT_WAIT) {
  assert(isPriorReadFollowUpPhrase(q), `prior-read phrase (present): ${q}`);
  assert(
    classifyMentorIntent(q, marketCtx) === "WAIT_EXPLANATION",
    `WAIT_EXPLANATION present after market: ${q}`
  );
}

for (const q of PRESENT_WAIT_EXPLAIN_ONLY) {
  assert(
    classifyMentorIntent(q, marketCtx) === "WAIT_EXPLANATION",
    `WAIT_EXPLANATION (explain-only): ${q}`
  );
}

// Standalone past-tense without market context still classifies as wait explanation
{
  const q = "What were you waiting for?";
  assert(
    classifyMentorIntent(q) === "WAIT_EXPLANATION",
    "past-tense wait without ctx → WAIT_EXPLANATION"
  );
}

// Must not steal general "were you" smalltalk into wait when clearly non-market
{
  const q = "Were you at the party?";
  assert(
    classifyMentorIntent(q, marketCtx) !== "WAIT_EXPLANATION",
    "party smalltalk is not WAIT_EXPLANATION"
  );
  assert(!isPriorReadFollowUpPhrase(q), "party smalltalk not prior-read phrase");
}

// Sky-blue / capital still not wait
{
  assert(
    classifyMentorIntent("why is the sky blue?", marketCtx) !== "WAIT_EXPLANATION",
    "sky blue not wait"
  );
  assert(
    classifyMentorIntent("what's the capital of germany?", marketCtx) !== "WAIT_EXPLANATION",
    "germany capital not wait"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("test-karen-past-tense-wait-routing: ok");
