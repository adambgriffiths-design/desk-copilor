/**
 * BUG-KAREN-TEXT-SILENT-READ
 * SYMPTOM: TEXT "Give me a read on the chart" appears in chat, then nothing —
 * no loading, no stream, no error. Voice/mic must not be required.
 *
 * ROOT CAUSE (reproduced below): isChartReadCommand / needsFullChartRead steal
 * the phrase into fire-and-forget screenshot chart-read before /api/chat/stream.
 *
 * Dispatch path for this TEXT phrase must be stream, not screenshot.
 * ANALYSE MARKET still uses kickOffChartRead (screenshot). Typed "get the read"
 * / "Give me the read" go to the trading TEXT stream.
 *
 * npm run test:karen-text-read
 */
import { classifyDeskRoute } from "../lib/desk-route-intent";
import {
  isChartReadCommand,
  needsFullChartRead,
  wantsChartRead,
} from "../lib/chart-read-intent";
import {
  classifyMentorIntent,
  isMentorMarketTurn,
} from "../lib/mentor-intent";
import { mustUseTradingStream } from "../lib/routing";
import { casualChatFallback, isNonTradingConversation } from "../lib/casual-chat-intent";
import { classifyTurn, shouldDeferCasualRoute } from "../lib/pending-request";

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

/** Mirrors extension/content.js handleUserMessage intercept before stream. */
function wouldStealToScreenshot(text: string): boolean {
  if (mustUseTradingStream(text)) return false;
  return isChartReadCommand(text) || needsFullChartRead(text);
}

function textDispatchPath(text: string): "screenshot" | "stream" | string {
  if (wouldStealToScreenshot(text)) return "screenshot";
  const route = classifyDeskRoute({ text, routeText: text }).route;
  if (route === "trading") return "stream";
  return route;
}

const PHRASE = "Give me a read on the chart.";
const PHRASE_VARIANTS = [
  "Give me a read on the chart.",
  "give me a read on the chart",
  "Give me a read on the chart",
];

console.log("=== BUG-KAREN-TEXT-SILENT-READ: reproduce intercept ===");
for (const phrase of PHRASE_VARIANTS) {
  const path = textDispatchPath(phrase);
  assert(path === "stream", `"${phrase}" TEXT dispatch = stream (got ${path})`);
  assert(!isChartReadCommand(phrase), `"${phrase}" is not screenshot command`);
  assert(!needsFullChartRead(phrase), `"${phrase}" must not bounce /api/chat/stream → needsChartRead`);
  assert(isMentorMarketTurn(phrase), `"${phrase}" is a mentor market turn`);
  assert(
    classifyMentorIntent(phrase) === "CURRENT_MARKET_READ",
    `"${phrase}" intent CURRENT_MARKET_READ (got ${classifyMentorIntent(phrase)})`
  );
  assert(mustUseTradingStream(phrase), `"${phrase}" uses trading stream`);
  assert(!isNonTradingConversation(phrase), `"${phrase}" is not casual-gated`);
  assert(
    classifyDeskRoute({ text: phrase }).route === "trading",
    `"${phrase}" classifyDeskRoute trading (got ${classifyDeskRoute({ text: phrase }).route})`
  );
  const filler = casualChatFallback(phrase);
  assert(!/^Ha — say more/i.test(filler), `"${phrase}" must not Ha-say-more (got "${filler}")`);
}

assert(isChartReadCommand("give me a read"), "exact 'give me a read' still identified as chart-read command");
assert(isChartReadCommand("get the read"), "get the read still identified as chart-read command");
assert(isChartReadCommand("market read"), "exact 'market read' still identified as chart-read command");
assert(mustUseTradingStream("get the read"), "get the read uses trading TEXT stream");
assert(mustUseTradingStream("Give me the read"), "Give me the read uses trading TEXT stream");
assert(mustUseTradingStream("give me a read"), "exact give me a read uses trading TEXT stream");
assert(textDispatchPath("get the read") === "stream", "get the read typed dispatch = stream");
assert(textDispatchPath("Give me the read") === "stream", "Give me the read typed dispatch = stream");
assert(textDispatchPath("give me a read") === "stream", "exact give me a read typed dispatch = stream");
assert(textDispatchPath("market read") === "stream", "exact market read typed dispatch = stream");
assert(
  classifyMentorIntent("get the read") === "CURRENT_MARKET_READ",
  "get the read intent CURRENT_MARKET_READ"
);
assert(
  classifyMentorIntent("Give me the read") === "CURRENT_MARKET_READ",
  "Give me the read intent CURRENT_MARKET_READ"
);

const MARKET_READ_PHRASE = "give me market read";
assert(!isChartReadCommand(MARKET_READ_PHRASE), `"${MARKET_READ_PHRASE}" is not screenshot command`);
assert(isMentorMarketTurn(MARKET_READ_PHRASE), `"${MARKET_READ_PHRASE}" is a mentor market turn`);
assert(
  classifyMentorIntent(MARKET_READ_PHRASE) === "CURRENT_MARKET_READ",
  `"${MARKET_READ_PHRASE}" intent CURRENT_MARKET_READ (got ${classifyMentorIntent(MARKET_READ_PHRASE)})`
);
assert(!needsFullChartRead(MARKET_READ_PHRASE), `"${MARKET_READ_PHRASE}" must not bounce to needsChartRead`);
assert(textDispatchPath(MARKET_READ_PHRASE) === "stream", `"${MARKET_READ_PHRASE}" TEXT dispatch = stream`);
assert(
  classifyDeskRoute({ text: MARKET_READ_PHRASE }).route === "trading",
  `"${MARKET_READ_PHRASE}" classifyDeskRoute trading (got ${classifyDeskRoute({ text: MARKET_READ_PHRASE }).route})`
);

console.log("\n=== TEXT vs VOICE: same phrase, same market stream (mic not required) ===");
const voiceSame = classifyMentorIntent(PHRASE);
const textSame = classifyMentorIntent(PHRASE);
assert(voiceSame === textSame, "intent does not depend on voice subsystem");
assert(textDispatchPath(PHRASE) === "stream", "TEXT path is stream with mic/Whisper/Realtime off");
assert(
  classifyDeskRoute({ text: PHRASE }).route === "trading",
  "VOICE of same phrase also routes trading, not screenshot-void"
);

console.log("\n=== 5-question TEXT sequence (follow-ups keep market context) ===");
const seq = [
  { q: "Give me a read on the chart.", intent: "CURRENT_MARKET_READ" },
  { q: "Why are you leaning that way?", intent: "EXPLAIN_PREVIOUS_MARKET_READ" },
  { q: "What changed?", intent: "CHANGE_ANALYSIS" },
  { q: "What would invalidate that?", intent: "INVALIDATION" },
  { q: "Which liquidity matters most right now?", intent: "LIQUIDITY_EXPLANATION" },
];

const history: { role: string; content: string }[] = [];
let lastIntent: ReturnType<typeof classifyMentorIntent> | undefined;

for (let i = 0; i < seq.length; i++) {
  const { q, intent } = seq[i];
  const ctx = {
    lastMentorIntent: lastIntent,
    lastAssistant: history.filter((m) => m.role === "assistant").at(-1)?.content,
    lastUser: history.filter((m) => m.role === "user").at(-1)?.content,
  };
  const got = classifyMentorIntent(q, ctx);
  assert(got === intent, `turn ${i + 1} "${q}" → ${intent} (got ${got})`);
  assert(isMentorMarketTurn(q, ctx), `turn ${i + 1} is mentor market`);
  assert(mustUseTradingStream(q), `turn ${i + 1} trading stream`);
  assert(!isNonTradingConversation(q), `turn ${i + 1} not casual-gated`);
  if (i === 0) {
    assert(textDispatchPath(q) === "stream", "turn 1 TEXT dispatch stream");
    assert(!wouldStealToScreenshot(q), "turn 1 not stolen to screenshot-void");
  } else {
    assert(
      classifyTurn(q, history, {
        lastAssistant: ctx.lastAssistant,
        lastTopic: "bias.tradeable",
        lastFactIds: ["bias.tradeable"],
      }) === "FOLLOW_UP",
      `turn ${i + 1} classifyTurn FOLLOW_UP`
    );
    assert(
      shouldDeferCasualRoute(q, history, {
        lastAssistant: ctx.lastAssistant,
        lastTopic: "bias.tradeable",
        lastFactIds: ["bias.tradeable"],
      }),
      `turn ${i + 1} defers casual`
    );
  }
  const route = classifyDeskRoute({ text: q, messages: history }).route;
  assert(route === "trading", `turn ${i + 1} route trading (got ${route})`);
  history.push({ role: "user", content: q });
  history.push({
    role: "assistant",
    content:
      i === 0
        ? "Right now I'm seeing a wait — bias not confirmed. [bias.tradeable]"
        : "That still holds on the last read. [bias.tradeable]",
  });
  lastIntent = got;
}

console.log("\n=== Never-silent contract ===");
assert(
  textDispatchPath(PHRASE) !== "screenshot",
  "TEXT market question must not vanish into screenshot-void (no loading/error)"
);
assert(
  !wantsChartRead(PHRASE) || isMentorMarketTurn(PHRASE),
  "if wantsChartRead still matches, mentor market turn must win"
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("BUG-KAREN-TEXT-SILENT-READ regression: PASS");
