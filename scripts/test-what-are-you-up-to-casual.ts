/**
 * Regression: casual identity / social check-ins must never look like desk empty-(turn).
 * Mirrors extension canUseInstantLocal + mentor isIdentityOnly + desk route.
 */
import { classifyMentorIntent, isMentorMarketTurn } from "../lib/mentor-intent";
import { classifyDeskRoute } from "../lib/desk-route-intent";
import {
  casualChatFallback,
  isClearlyTrading,
  isGeneralConversation,
  isNonTradingConversation,
} from "../lib/casual-chat-intent";
import { mustUseTradingStream } from "../lib/routing";
import { isIdentityQuestion, isPersonaQuestion } from "../lib/web-search-intent";
import { isStandaloneGeneralTurn } from "../lib/conversational-intent";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

const SOCIAL = ["what are you up to?", "what are you up to", "what are you doing", "who are you"];
const MARKET = ["what are you seeing", "what are you thinking", "what will you do"];

for (const q of SOCIAL) {
  assert(isIdentityQuestion(q) || isPersonaQuestion(q), `"${q}" persona/identity`);
  assert(isGeneralConversation(q) || isStandaloneGeneralTurn(q), `"${q}" general conversation`);
  assert(!isClearlyTrading(q), `"${q}" not clearly trading`);
  assert(isNonTradingConversation(q), `"${q}" non-trading`);
  assert(!mustUseTradingStream(q), `"${q}" mustUseTradingStream=false`);
  assert(!isMentorMarketTurn(q), `"${q}" not mentor market turn`);
  assert(classifyMentorIntent(q) === "GENERAL_CHAT", `"${q}" GENERAL_CHAT`);
  const route = classifyDeskRoute({ text: q, messages: [] });
  assert(route.route === "casual", `"${q}" desk route casual (got ${route.route})`);
  const fb = casualChatFallback(q);
  assert(Boolean(fb && fb.trim()), `"${q}" has local casual reply`);
  assert(!/Desk returned no reply/i.test(fb), `"${q}" must not be empty-turn copy`);
  assert(!/Hit RECONNECT/i.test(fb), `"${q}" must not ask RECONNECT`);
}

for (const q of MARKET) {
  assert(!isIdentityQuestion(q), `"${q}" is not identity`);
  assert(mustUseTradingStream(q) || isMentorMarketTurn(q), `"${q}" stays on trading isolation`);
}

// After a market read, social check-in still breaks out.
const marketHistory = [
  { role: "user", content: "get the read" },
  {
    role: "assistant",
    content: "Right now I'm seeing bearish structure on MNQ. Stay flat until the sweep.",
  },
];
const after = "what are you up to?";
assert(!mustUseTradingStream(after), "after market: up-to still not trading stream");
assert(
  classifyDeskRoute({ text: after, messages: marketHistory }).route === "casual",
  "after market: up-to still casual"
);

console.log("\nAll what-are-you-up-to casual routing tests passed.");
