/**
 * Multi-turn conversation routing chains — npm run test:conversation-chains
 */
import { casualChatFallback } from "../lib/casual-chat-intent";
import { classifyDeskRoute } from "../lib/desk-route-intent";
import { needsScopedChartAnswer } from "../lib/chart-read-intent";
import { classifyQueryMode, extractConversationContext } from "../lib/conversational-query";
import {
  classifyTurn,
  inferPendingRequest,
  mergeWeatherClarification,
  resolveTurnQuestion,
  shouldDeferCasualRoute,
} from "../lib/pending-request";
import { shouldUseLiveWebSearch } from "../lib/routing";
import {
  hasWeatherLocationDisambiguation,
  isAmbiguousWeatherLocation,
  resolveWeatherLocation,
  weatherAmbiguousPrompt,
} from "../lib/weather-location";

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

function assertNotHaSayMore(reply: string, msg: string) {
  assert(!/^Ha — say more/i.test(reply), msg);
}

console.log("=== Test 1: Berlin weather → Germany clarification ===");
const turn1User = "What's the weather in Berlin?";
const turn1Assistant = weatherAmbiguousPrompt("Berlin");
const chain1 = [
  { role: "user", content: turn1User },
  { role: "assistant", content: turn1Assistant },
];
const turn2 = "I mean Germany.";

assert(isAmbiguousWeatherLocation("Berlin"), "Berlin is ambiguous without region");
assert(classifyTurn(turn2, chain1) === "CLARIFICATION", "Germany turn is CLARIFICATION");
assert(shouldUseLiveWebSearch(turn2, chain1), "clarification triggers live web search");
assert(shouldDeferCasualRoute(turn2, chain1), "clarification must not route casual");

const mergedQ = resolveTurnQuestion(turn2, chain1);
assert(/\bberlin\b/i.test(mergedQ) && /\bgermany\b/i.test(mergedQ), "merged question includes Berlin + Germany");
assert(shouldUseLiveWebSearch(mergedQ, chain1), "merged question needs live web");

const mergedLoc = resolveWeatherLocation(turn2, { messages: chain1 });
assert(
  mergedLoc?.location != null && hasWeatherLocationDisambiguation(mergedLoc.location),
  "resolveWeatherLocation merges Berlin + Germany"
);
assert(mergeWeatherClarification("Berlin", "Germany") === "Berlin Germany", "mergeWeatherClarification");

const route1 = classifyDeskRoute({ text: turn2, routeText: turn2, messages: chain1 });
assert(route1.route === "live_web", "clarification routes to live_web");

assertNotHaSayMore(casualChatFallback(turn2, "", chain1), "no Ha — say more for weather clarification");

console.log("\n=== Test 1b: Berlin weather → Paris follow-up ===");
const berlinWeatherAssistant =
  "Berlin: 18°C, partly cloudy with light winds.";
const chainBerlinParis = [
  { role: "user", content: "What's the weather like in Berlin?" },
  { role: "assistant", content: berlinWeatherAssistant },
];
const parisTurn = "What about Paris?";

const pendingParis = inferPendingRequest(chainBerlinParis);
assert(pendingParis?.intent === "CURRENT_EXTERNAL", "Berlin answer retains CURRENT_EXTERNAL pending");
assert(pendingParis?.entities.task === "WEATHER", "pending task is WEATHER");
assert(classifyTurn(parisTurn, chainBerlinParis) === "FOLLOW_UP", "Paris turn is FOLLOW_UP");
assert(shouldDeferCasualRoute(parisTurn, chainBerlinParis), "Paris follow-up defers casual");
assert(shouldUseLiveWebSearch(parisTurn, chainBerlinParis), "Paris follow-up triggers live web");

const resolvedParis = resolveTurnQuestion(parisTurn, chainBerlinParis);
assert(/\bparis\b/i.test(resolvedParis) && /\bweather\b/i.test(resolvedParis), "resolves to Paris weather");

const routeParis = classifyDeskRoute({ text: parisTurn, routeText: parisTurn, messages: chainBerlinParis });
assert(routeParis.route === "live_web", "Paris follow-up routes to live_web");

const parisCasual = casualChatFallback(
  parisTurn,
  chainBerlinParis.map((m) => m.content).join(" "),
  chainBerlinParis
);
assert(parisCasual === "", "Paris follow-up never hits casual food/preference reply");
assert(!/team hot food|go-to/i.test(parisCasual), "Paris follow-up never routes to karenPreferenceReply");

console.log("\n=== Test 1c: Berlin weather → London follow-up ===");
const londonTurn = "What about London?";
const chainBerlinLondon = [
  { role: "user", content: "What's the weather like in Berlin?" },
  { role: "assistant", content: berlinWeatherAssistant },
];

assert(classifyTurn(londonTurn, chainBerlinLondon) === "FOLLOW_UP", "London turn is FOLLOW_UP");
const resolvedLondon = resolveTurnQuestion(londonTurn, chainBerlinLondon);
assert(/\blondon\b/i.test(resolvedLondon) && /\bweather\b/i.test(resolvedLondon), "resolves to London weather");
assert(
  classifyDeskRoute({ text: londonTurn, messages: chainBerlinLondon }).route === "live_web",
  "London follow-up routes to live_web"
);

console.log("\n=== Test 2: MSS → invalidation follow-up ===");
const chain2 = [
  { role: "user", content: "Where is the last MSS?" },
  {
    role: "assistant",
    content: "Market structure shift: bullish MSS at 21045.25 [structure.mss]",
  },
];
const turn2b = "Has it been invalidated?";
const ctx2 = extractConversationContext(chain2);
assert(ctx2.lastFactIds?.includes("structure.mss") === true, "context captures MSS fact id");
assert(classifyTurn(turn2b, chain2, ctx2) === "FOLLOW_UP", "invalidation is FOLLOW_UP");
assert(shouldDeferCasualRoute(turn2b, chain2, ctx2), "invalidation defers casual");
assert(classifyQueryMode(turn2b, ctx2) === "invalidation_followup", "query mode invalidation_followup");
assertNotHaSayMore(casualChatFallback(turn2b, "", chain2), "no Ha — say more for MSS invalidation");

console.log("\n=== Test 3: NWOG → NDOG follow-up ===");
const chain3 = [
  { role: "user", content: "Where's the last NWOG?" },
  {
    role: "assistant",
    content: "NWOG: 20980.00 – 21010.00, price inside gap [gaps.nwog]",
  },
];
const turn3 = "What about the NDOG?";
const ctx3 = extractConversationContext(chain3);
assert(ctx3.lastTopic === "gaps.nwog", "NWOG topic preserved");
assert(classifyTurn(turn3, chain3, ctx3) === "FOLLOW_UP", "NDOG pivot is FOLLOW_UP");
assert(shouldDeferCasualRoute(turn3, chain3, ctx3), "NDOG follow-up defers casual");
const resolved3 = resolveTurnQuestion(turn3, chain3, ctx3);
assert(/\bndog\b/i.test(resolved3), "resolves to NDOG lookup");
assertNotHaSayMore(casualChatFallback(turn3, "", chain3), "no Ha — say more for NDOG follow-up");

console.log("\n=== Test 4: verdict → Why? ===");
const chain4 = [
  { role: "user", content: "What's the verdict?" },
  {
    role: "assistant",
    content:
      "VERDICT: WAIT — Bias neutral, stand aside until 1m structure confirms. Entry zone pending.",
  },
];
const turn4 = "Why?";
const pending4 = inferPendingRequest(chain4);
assert(pending4?.intent === "VERDICT_EXPLAIN", "verdict pending state inferred");
assert(classifyTurn(turn4, chain4) === "FOLLOW_UP", "Why? is FOLLOW_UP after verdict");
assert(shouldDeferCasualRoute(turn4, chain4), "Why? defers casual route");
assertNotHaSayMore(casualChatFallback(turn4, "", chain4), "no Ha — say more after verdict Why?");

console.log("\n=== Test 5: MSS teaching → show on chart ===");
const chain5 = [
  { role: "user", content: "What is MSS?" },
  {
    role: "assistant",
    content:
      "MSS (Market Structure Shift)\n\nA displacement-led break of structure that signals a potential trend change.",
  },
];
const turn5 = "show me last one on chart";
assert(classifyTurn(turn5, chain5) === "FOLLOW_UP", "chart show request is FOLLOW_UP");
assert(shouldDeferCasualRoute(turn5, chain5), "teaching chart follow-up defers casual");
const resolved5 = resolveTurnQuestion(turn5, chain5);
assert(/\bmss\b/i.test(resolved5), "resolves teaching follow-up to MSS chart fact");
assert(needsScopedChartAnswer(resolved5), "resolved question needs scoped chart answer");
const route5 = classifyDeskRoute({ text: turn5, routeText: turn5, messages: chain5 });
assert(route5.route === "snapshot", "teaching → chart fact routes to snapshot");
assertNotHaSayMore(casualChatFallback(turn5, "", chain5), "no Ha — say more for chart follow-up");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
