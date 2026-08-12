/**
 * Session regression suite — bugs fixed in v1.3.4 stabilization pass.
 * Run: npm run test:regression
 */
import { classifyChartQuestion, prefersRichTradingAnswer } from "../lib/chart-question-intent";
import { needsScopedChartAnswer, needsFullChartRead } from "../lib/chart-read-intent";
import {
  isCasualChat,
  casualChatFallback,
  nameIntroReply,
  isNameIntroReply,
  sanitizeCasualReply,
  isGreeting,
  stripLeadingGreeting,
  isNonTradingConversation,
  isClearlyTrading,
} from "../lib/casual-chat-intent";
import { buildMarketSnapshotAnswer } from "../lib/market-snapshot";
import {
  LIVE_DATA_FALLBACK,
  shouldUseLiveWebSearch,
  isPersonaOrOpinionQuestion,
  liveDataFallbackIfNeeded,
} from "../lib/routing";
import {
  isPersonaQuestion,
  needsWebSearch,
  isKarenPreferenceQuestion,
} from "../lib/web-search-intent";
import {
  resolveWeatherLocation,
  weatherAmbiguousPrompt,
  WEATHER_LOCATION_PROMPT,
} from "../lib/weather-location";
import { tryWebSearchReply } from "../lib/web-search-reply";
import {
  isFullySpoken,
  remainderToSpeak,
  resolveVoiceSpeakLine,
  streamVoiceSpeakTarget,
  shouldStreamVoiceSpeak,
  isStaleStreamSuperset,
  normalizeSpeakText,
} from "../lib/voice-speak-sync";
import { prefersInstantVoice } from "../lib/voice-quick-reply";
import { tryCasualChatReplyInstant } from "../lib/chat-engine";
import {
  isTradingViewDisclaimer,
  sanitizeUserTranscript,
  shouldDropUserTranscript,
} from "../lib/transcription-guard";
import type { MarketContext } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const mockCtx = {
  daily: { lastClose: 29736, previousDayHigh: 29887, previousDayLow: 28600 },
  biasStack: {
    tradeableBias: "bullish",
    summary: "daily bullish; 15m aligned",
    alignedCount: 2,
    biasConflict: false,
    conflictPairs: [],
    dominantBias: "bullish",
  },
  htfPdArrays: {
    previousDay: { high: 29887, low: 28600, close: 29500, open: 29400, equilibrium: 29243.5 },
    levels: [
      { id: "pdh", label: "Previous day high", price: 29887 },
      { id: "pdl", label: "Previous day low", price: 28600 },
    ],
  },
  sessions: {
    nyRthHigh: 29754.75,
    nyRthLow: 29600,
    asiaHigh: 29650,
    asiaLow: 29500,
    londonHigh: 29700,
    londonLow: 29550,
    nyPreHigh: 29754.75,
    nyPreLow: 29620,
    nyPmHigh: 29754.75,
    nyPmLow: 29680,
  },
  premiumDiscount: { summary: "price in premium of current day range" },
  structureFacts: {
    mss: null,
    m1UnfilledFvgs: [],
    liquiditySweeps: [],
    firstPresentedFvg: { nyOpening: null, postFhdr: null, activeSession: null },
  },
  org: { top: 29800, bottom: 29650, ce: 29725, formedAt: "2026-08-12" },
} as unknown as MarketContext;

const NO_LIVE_DATA = LIVE_DATA_FALLBACK;

console.log("Session regression — routing (never show live-data fallback for persona/opinion)");

const personaCases = [
  "Tell me about yourself",
  "What is your favorite food?",
  "Hi, my name's Adam",
  "Hi, what is your favourite city?",
];

for (const q of personaCases) {
  assert(!shouldUseLiveWebSearch(q), `${q} must not use live web search`);
  assert(
    liveDataFallbackIfNeeded(q, undefined, null) === null,
    `${q} must not get live-data fallback`
  );
}

assert(isPersonaOrOpinionQuestion("Tell me about yourself"), "persona alias works");
assert(isCasualChat("Tell me about yourself"), "tell me about yourself is casual");
assert(
  /desk co-pilot/i.test(casualChatFallback("Tell me about yourself")),
  "persona fallback is Karen intro"
);
assert(isCasualChat("What is your favorite food?"), "favorite food is casual");
assert(!needsWebSearch("What is your favorite food?"), "favorite food skips web");
assert(
  /burger|chinese|food/i.test(casualChatFallback("What is your favorite food?")),
  "favorite food gets food persona reply"
);

assert(isGreeting("hi how are you"), "hi how are you is greeting");
assert(isGreeting("hey"), "hey is greeting");
assert(isCasualChat("hi how are you"), "hi how are you is casual chat");
assert(
  /good to hear from you|how's yours|doing good/i.test(casualChatFallback("hi how are you")),
  "hi how are you gets friendly greeting reply"
);

console.log("Session regression — TradingView disclaimer STT filter");

const tvDisclaimer =
  "Please see the complete disclaimer at https://sites.google.com/view/tradingview-disclaimer";
assert(isTradingViewDisclaimer(tvDisclaimer), "TV disclaimer detected");
assert(shouldDropUserTranscript(tvDisclaimer), "pure disclaimer dropped");
assert(
  sanitizeUserTranscript("hi how are you " + tvDisclaimer) === "hi how are you",
  "greeting recovered from mixed disclaimer transcript"
);
assert(!shouldDropUserTranscript("hi how are you"), "greeting not dropped");

console.log("Session regression — compound greeting must not short-circuit");

assert(!isGreeting("Hi, what is your favourite food?"), "compound hi+food is not instant greeting");
assert(!isGreeting("Hi, what is your favourite city?"), "compound hi+city is not instant greeting");
assert(!isGreeting("hey, what's the weather"), "compound hey+weather is not instant greeting");
assert(
  stripLeadingGreeting("Hi, what is your favourite city?") === "what is your favourite city?",
  "stripLeadingGreeting for hi+city"
);
assert(
  /burger|chinese|food/i.test(casualChatFallback("Hi, what is your favourite food?")),
  "compound hi+food gets food reply not greeting"
);
assert(
  !/how's yours|good to hear from you/i.test(casualChatFallback("Hi, what is your favourite city?")),
  "compound hi+city must not get canned greeting-only reply"
);
assert(isKarenPreferenceQuestion("Hi, what is your favourite food?"), "hi+food is Karen preference");
assert(needsWebSearch("hey, what's the weather"), "hey+weather needs web");

assert(isGreeting("hi"), "hi alone is pure greeting");
assert(
  casualChatFallback("hi").includes("What's up"),
  "hi alone gets short greeting"
);

const adamIntro = nameIntroReply("Hi, my name's Adam");
assert(adamIntro === "Nice to meet you, Adam! What's up?", "name intro bubble text");
assert(isNameIntroReply(adamIntro!), "name intro recognized");
assert(
  casualChatFallback("Hi, my name's Adam") === adamIntro,
  "name intro in casual fallback"
);

assert(classifyChartQuestion("What's the market doing right now?") === "status", "market status intent");
assert(!isCasualChat("What's the market doing right now?"), "market status not casual");
assert(!isNonTradingConversation("What's the market doing right now?"), "market status not non-trading");
assert(isNonTradingConversation("what's your favorite pizza"), "pizza is non-trading");
const marketSnap = buildMarketSnapshotAnswer(mockCtx, "status", "What's the market doing right now?");
assert(marketSnap.spoken.includes("29736"), "market snapshot has price");
assert(!/pizza|hot food|desk snacks/i.test(marketSnap.spoken), "market snapshot not pizza");

assert(classifyChartQuestion("What is the chart doing right now?") === "status", "chart status intent");
assert(needsScopedChartAnswer("What is the chart doing right now?"), "chart status scoped");
assert(!needsFullChartRead("What is the chart doing right now?"), "chart status not full read");

console.log("Session regression — weather (Tavily routing)");

assert(
  resolveWeatherLocation("weather in Telford Shropshire")?.location === "Telford Shropshire",
  "Telford Shropshire extracts place"
);
assert(needsWebSearch("weather in Telford Shropshire"), "Telford Shropshire needs web");

console.log("Session regression — voice sync");

const nameBubble = "Nice to meet you, Adam! What's up?";
const namePartial = "Nice to meet you, Adam!";
assert(!isFullySpoken(nameBubble, namePartial), "name ack speaks full bubble not sentence 1 only");
assert(
  remainderToSpeak(nameBubble, namePartial).includes("What's up"),
  "second sentence queued for voice catch-up"
);

const steerStream =
  "Sure! Pizza is great. Now, back on track: do you want a read on the Nasdaq futures chart?";
const steerBubble = "Sure! Pizza is great.";
assert(isStaleStreamSuperset(normalizeSpeakText(steerStream), normalizeSpeakText(steerBubble)), "raw stream superset detected");
assert(!isFullySpoken(steerBubble, steerStream), "sanitized bubble is not covered by stale stream superset");
assert(shouldStreamVoiceSpeak(steerBubble, steerStream, Date.now()), "must speak sanitized bubble after stale stream buffer");
assert(remainderToSpeak(steerBubble, steerStream) === "", "no catch-up when stream spoke superset");

console.log("Session regression — end-only stream voice (v1.4.3)");

const multiBubble = "Hey Adam! I'm doing well. What's on your mind today?";
const streamBuffer =
  "Hey Adam! I'm doing well. What's on your mind today? Now, back on track: want a chart read?";
const sanitizedBubble = sanitizeCasualReply(streamBuffer, "hey how are you");
assert(sanitizedBubble === multiBubble, "steer-back stripped before end-only speak");
assert(
  streamVoiceSpeakTarget(sanitizedBubble) === multiBubble,
  "multi-sentence casual reply spoken equals sanitized bubble"
);
assert(
  streamVoiceSpeakTarget(sanitizedBubble) !== streamBuffer.trim(),
  "spoken target is bubble not raw stream buffer"
);
assert(remainderToSpeak(multiBubble, multiBubble) === "", "full bubble has empty remainder under end-only policy");
const partialStream = "Hey Adam! I'm doing well.";
assert(!isFullySpoken(multiBubble, partialStream), "partial stream is not full bubble delivery");
assert(
  remainderToSpeak(multiBubble, partialStream) !== multiBubble,
  "legacy catch-up must not re-speak entire bubble"
);

console.log("Session regression — prefix overlap (v1.4.10)");

const nowTs = Date.now();
assert(
  resolveVoiceSpeakLine(nameBubble, "", 0) === nameBubble,
  "fresh bubble speaks full line"
);
assert(
  resolveVoiceSpeakLine(nameBubble, nameBubble, nowTs) === "",
  "already-spoken bubble skips"
);
assert(
  resolveVoiceSpeakLine(nameBubble, namePartial, nowTs).includes("What's up"),
  "prefix overlap speaks tail only"
);
assert(
  resolveVoiceSpeakLine(nameBubble, namePartial, nowTs) !== nameBubble,
  "prefix overlap never re-speaks opening clause"
);
assert(
  resolveVoiceSpeakLine(steerBubble, steerStream, nowTs) === steerBubble,
  "stale stream superset still re-speaks sanitized bubble"
);

const joke = casualChatFallback("tell me a joke");
assert(/trader|ladder|high/i.test(joke), "joke fallback exists");
assert(prefersInstantVoice("Sure thing!", {}), "quick reply after Karen uses instant voice");

console.log("Session regression — sanitizers");

const steer =
  "KFC offers different flavors. Now, back on track: do you want a read on the Nasdaq futures chart?";
const clean = sanitizeCasualReply(steer, "what about kfc");
assert(!/back on track|nasdaq futures/i.test(clean), "steer-back stripped");

console.log("Session regression — live-data fallback guard");

assert(
  liveDataFallbackIfNeeded("tell me about yourself", undefined, null) === null,
  "persona never gets fallback"
);
assert(
  liveDataFallbackIfNeeded("What's the market doing right now?", undefined, null) === null,
  "market snapshot never gets fallback"
);
assert(
  liveDataFallbackIfNeeded(
    "I'm good. Tell me about the current market structure.",
    undefined,
    null
  ) === null,
  "market structure question never gets live-data fallback"
);
assert(isClearlyTrading("I'm good. Tell me about the current market structure."), "social + market structure is trading");
assert(
  needsWebSearch("Tell me about the current market structure") === false,
  "tell me about market structure is not web search"
);
assert(
  prefersRichTradingAnswer("I'm good. Tell me about the current market structure."),
  "market structure explain prefers rich trading answer"
);
assert(
  liveDataFallbackIfNeeded("weather in London", undefined, null) === NO_LIVE_DATA,
  "weather search failure gets fallback"
);

async function runAsyncChecks() {
  const bareTelford = await tryWebSearchReply("weather in Telford");
  assert(
    bareTelford === weatherAmbiguousPrompt("Telford"),
    "bare Telford asks which region"
  );

  const personaInstant = await tryCasualChatReplyInstant("Tell me about yourself");
  assert(
    personaInstant !== null && !personaInstant.includes("Couldn't pull live data"),
    "persona instant never live-data error"
  );

  const foodInstant = await tryCasualChatReplyInstant("What is your favorite food?");
  assert(
    foodInstant !== null && !foodInstant.includes("Couldn't pull live data"),
    "favorite food instant never live-data error"
  );

  const noCity = await tryWebSearchReply("what is the weather");
  assert(noCity === WEATHER_LOCATION_PROMPT, "no city asks which city");
}

runAsyncChecks()
  .then(() => console.log("\nAll session regression checks passed (v1.4.3)."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
