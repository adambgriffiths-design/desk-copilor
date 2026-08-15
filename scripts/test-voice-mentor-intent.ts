/**
 * Voice mentor-turn classifier + desk routing — spoken English must hit the market
 * brain, not persona / "Ha — say more".
 */
import {
  classifyMentorIntent,
  isMentorMarketTurn,
  spokenCapOptions,
  teachingLengthFor,
} from "../lib/mentor-intent";
import { classifyDeskRoute } from "../lib/desk-route-intent";
import { casualChatFallback, isClearlyTrading, isDeadEndFiller, isNonTradingConversation } from "../lib/casual-chat-intent";
import { mustUseTradingStream } from "../lib/routing";
import { isIdentityQuestion } from "../lib/web-search-intent";
import { isChartReadCommand, needsFullChartRead } from "../lib/chart-read-intent";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

const EIGHT: { phrase: string; intent: string }[] = [
  { phrase: "What are you seeing?", intent: "CURRENT_MARKET_READ" },
  { phrase: "What changed?", intent: "CHANGE_ANALYSIS" },
  { phrase: "What should I watch?", intent: "WATCH_NEXT" },
  { phrase: "Why does that EQH matter?", intent: "EQH_EQL_EXPLANATION" },
  { phrase: "What's your bias?", intent: "BIAS_EXPLANATION" },
  { phrase: "Why are you waiting?", intent: "WAIT_EXPLANATION" },
  { phrase: "What would change your mind?", intent: "INVALIDATION" },
  { phrase: "Walk me through this.", intent: "STRUCTURE_EXPLANATION" },
];

for (const row of EIGHT) {
  const intent = classifyMentorIntent(row.phrase);
  assert(intent === row.intent, `"${row.phrase}" → ${row.intent} (got ${intent})`);
  assert(isMentorMarketTurn(row.phrase), `"${row.phrase}" is a mentor market turn`);
  const route = classifyDeskRoute({ text: row.phrase, routeText: row.phrase });
  assert(route.route === "trading", `"${row.phrase}" routes trading (got ${route.route})`);
  assert(mustUseTradingStream(row.phrase), `"${row.phrase}" uses trading stream`);
  assert(!isNonTradingConversation(row.phrase), `"${row.phrase}" not casual-gated`);
}

const CURRENT_READ_VARIANTS = [
  "what are you seeing",
  "what do you see",
  "what's your call",
  "what will you do",
  "what are you going to do",
  "calculate what you will do",
  "calculate what you'll do",
  "show me what you're seeing",
  "how's this looking",
];

assert(
  classifyMentorIntent("Give me a read on the chart.") === "CURRENT_MARKET_READ",
  "give me a read on the chart is CURRENT_MARKET_READ"
);
assert(
  classifyMentorIntent("get the read") === "CURRENT_MARKET_READ",
  "get the read is CURRENT_MARKET_READ"
);
assert(
  classifyMentorIntent("Give me the read") === "CURRENT_MARKET_READ",
  "Give me the read is CURRENT_MARKET_READ"
);
assert(mustUseTradingStream("get the read"), "get the read uses trading stream");
assert(mustUseTradingStream("Give me the read"), "Give me the read uses trading stream");
assert(
  classifyDeskRoute({ text: "get the read" }).route === "trading",
  "get the read routes trading stream"
);
assert(
  classifyDeskRoute({ text: "Give me the read" }).route === "trading",
  "Give me the read routes trading stream"
);
assert(
  !isChartReadCommand("give me market read"),
  "give me market read is not screenshot command"
);
assert(
  !needsFullChartRead("give me market read"),
  "give me market read does not force screenshot"
);
assert(
  classifyDeskRoute({ text: "give me market read" }).route === "trading",
  "give me market read routes trading stream"
);
assert(
  !isChartReadCommand("Give me a read on the chart."),
  "give me a read on the chart is not screenshot command"
);
assert(
  !needsFullChartRead("Give me a read on the chart."),
  "give me a read on the chart does not force screenshot"
);
assert(
  classifyDeskRoute({ text: "Give me a read on the chart." }).route === "trading",
  "give me a read on the chart routes trading stream"
);

for (const phrase of CURRENT_READ_VARIANTS) {
  const intent = classifyMentorIntent(phrase);
  assert(
    intent === "CURRENT_MARKET_READ",
    `"${phrase}" CURRENT_MARKET_READ (got ${intent})`
  );
  const route = classifyDeskRoute({ text: phrase, routeText: phrase });
  assert(route.route === "trading", `"${phrase}" routes trading not ${route.route}`);
  assert(isClearlyTrading(phrase), `"${phrase}" is clearly trading`);
  const fallback = casualChatFallback(phrase);
  assert(!isDeadEndFiller(fallback), `"${phrase}" must not get Ha filler (got "${fallback}")`);
  assert(!isChartReadCommand(phrase), `"${phrase}" is not a screenshot chart-read command`);
  assert(!needsFullChartRead(phrase), `"${phrase}" does not force screenshot read`);
}

assert(!isIdentityQuestion("what are you seeing"), "seeing is not identity");
assert(isIdentityQuestion("who are you"), "who are you stays identity");
assert(isIdentityQuestion("what are you up to?"), "what are you up to is identity/social");
assert(isIdentityQuestion("what are you doing"), "what are you doing is identity/social");
assert(classifyMentorIntent("who are you") === "GENERAL_CHAT", "who are you GENERAL_CHAT");
assert(classifyMentorIntent("what are you up to?") === "GENERAL_CHAT", "what are you up to GENERAL_CHAT");
assert(classifyMentorIntent("what are you doing") === "GENERAL_CHAT", "what are you doing GENERAL_CHAT");
assert(!mustUseTradingStream("what are you up to?"), "what are you up to stays off trading stream");
assert(!isClearlyTrading("what are you up to?"), "what are you up to is not clearly trading");
assert(isNonTradingConversation("what are you up to?"), "what are you up to is non-trading");
{
  const upToRoute = classifyDeskRoute({ text: "what are you up to?", routeText: "what are you up to?" });
  assert(upToRoute.route === "casual", `what are you up to routes casual (got ${upToRoute.route})`);
  assert(upToRoute.detail === "persona", `what are you up to detail persona (got ${upToRoute.detail})`);
  const upToFallback = casualChatFallback("what are you up to?");
  assert(/desk co-pilot/i.test(upToFallback), `what are you up to local persona (got "${upToFallback}")`);
  assert(!/Desk returned no reply/i.test(upToFallback), "what are you up to must never be empty-turn copy");
}
assert(classifyMentorIntent("Tell me a joke") === "GENERAL_CHAT", "joke GENERAL_CHAT");
assert(classifyMentorIntent("huh?") === "GENERAL_CHAT", "huh GENERAL_CHAT");
assert(classifyMentorIntent("What do you think about Bitcoin?") === "GENERAL_CHAT", "bitcoin GENERAL_CHAT");
assert(classifyMentorIntent("want pizza?") === "GENERAL_CHAT", "pizza GENERAL_CHAT");
assert(classifyMentorIntent("calculate the tip") === "GENERAL_CHAT", "tip calc stays non-market");
assert(classifyMentorIntent("what is 2 plus 2") === "GENERAL_CHAT", "plus-minus calc stays non-market");

const jokeRoute = classifyDeskRoute({ text: "Tell me a joke", routeText: "Tell me a joke" });
assert(jokeRoute.route === "casual", "joke still casual");

const ambiguous = casualChatFallback("random xyz");
assert(!isDeadEndFiller(ambiguous), "ambiguous must not use Ha filler");
assert(/catch that|still on this|something else/i.test(ambiguous), "ambiguous stays a real sentence");

const drinkThread =
  "I'm all about a good classic soda or iced tea. Keeps it simple! How about you — do you have a favorite drink?";
const iDont = casualChatFallback("i dont", drinkThread);
assert(!isDeadEndFiller(iDont), `"i dont" after drink chat must not be Ha filler (got "${iDont}")`);
assert(/drink|iced tea|go-to/i.test(iDont), `"i dont" acknowledges the drink thread (got "${iDont}")`);
assert(!/say more/i.test(iDont), `"i dont" must not fish for more`);

assert(teachingLengthFor("Walk me through this.") === "DEEP", "walkthrough is DEEP");
assert(spokenCapOptions("Walk me through this.").maxSentences >= 5, "walkthrough not crushed to 2 sentences");
assert(spokenCapOptions("What are you seeing?").maxSentences >= 3, "current read NORMAL spoken cap");
assert(spokenCapOptions("Tell me a joke").maxSentences === 2, "small talk stays short");

assert(
  classifyMentorIntent("why?", {
    lastMentorIntent: "WAIT_EXPLANATION",
    lastAssistant: "I'm waiting — stay flat until the sweep.",
  }) === "WAIT_EXPLANATION",
  "bare why follows wait explanation"
);

console.log("\nAll voice mentor intent tests passed.");
