/**
 * Unit checks for scoped chart Q&A — run: npx tsx scripts/test-scoped-chart-qa.ts
 */
import { wantsChartRead, needsFullChartRead, isChartReadCommand, normalizeChartReadCommand, needsScopedChartAnswer } from "../lib/chart-read-intent";
import { prefersRichTradingAnswer } from "../lib/chart-question-intent";
import { classifyChartQuestion, isSnapshotIntent, isChartStatusQuestion, isFirstPresentedFvgQuestion, resolveSnapshotIntent } from "../lib/chart-question-intent";
import { buildMarketSnapshotAnswer } from "../lib/market-snapshot";
import { detectNyOpeningFirstPresentedFvg, isFvgInverted, detectUnfilledIntradayFvgs } from "../lib/gap-zones";
import { estTimeOnDateKey } from "../lib/market-data";
import { buildScopedSpokenBrief, buildVoiceSpokenBrief } from "../lib/voice-spoken-brief";
import { sanitizeSpokenBrief, countMnqPrices } from "../lib/voice-spoken-sanitize";
import {
  applyVoiceRules,
  applyCanonicalVoiceRules,
  needsVoiceInterpret,
} from "../lib/voice-interpret";
import { fixFirstPresentedFvgMishear } from "../lib/transcription-guard";
import {
  mergeSttTranscript,
  pickRelatedSttTranscript,
  sttTranscriptsRelated,
  isSttExtension,
} from "../lib/voice-stt-merge";
import {
  applyContextualSttFixes,
  needsContextualInterpret,
} from "../lib/voice-context-fix";
import {
  isCasualChat,
  sanitizeCasualReply,
  isGenericCasualReply,
  isStaleCasualMismatch,
  isGeneralConversation,
  casualChatFallback,
  isTradingRedirect,
  isNameIntroReply,
  isGreeting,
  stripLeadingGreeting,
} from "../lib/casual-chat-intent";
import { shouldChuckle, speechEmotionFor } from "../lib/voice-emotion";
import { prefersInstantVoice } from "../lib/voice-quick-reply";
import { needsWebSearch, buildSearchQuery, resolveWebSearchQuestion, wantsLiveWebData, isPersonaQuestion, isIdentityQuestion, isKarenPreferenceQuestion } from "../lib/web-search-intent";
import { shouldUseLiveWebSearch, LIVE_DATA_FALLBACK, isPersonaOrOpinionQuestion, liveDataFallbackIfNeeded } from "../lib/routing";
import { nameIntroReply } from "../lib/casual-chat-intent";
import { normalizeWeatherStt } from "../lib/weather-stt";
import { tryWebSearchReply, isWeatherGuessReply, isLiveWeatherReply, extractWeatherFromHits } from "../lib/web-search-reply";
import { extractUserLocation, normalizeMemory } from "../lib/desk-memory";
import {
  WEATHER_LOCATION_PROMPT,
  resolveWeatherLocation,
  weatherAmbiguousPrompt,
  isAmbiguousWeatherLocation,
  buildWeatherSearchQuery,
  hasWeatherWithLocation,
  snippetMentionsDifferentPlace,
} from "../lib/weather-location";
import { karenToolAck, karenStatusLine, ASSISTANT_NAME, stripAssistantNamePrefix } from "../lib/desk-persona";
import {
  isRecentlySpoken,
  isFullySpoken,
  remainderToSpeak,
  normalizeSpeakText,
  shouldStreamVoiceSpeak,
  isStaleStreamSuperset,
} from "../lib/voice-speak-sync";
import { buildStructureFacts, detectRelativeEqualPools, rehRelTolerance } from "../lib/structure";
import {
  buildDrawingLevels,
  assignStaggeredLabelAlign,
  filterRelativeEqualPoolsByPrice,
  collapseOppositeRelativeEqualOnSameShelf,
  labelLaneToAlign,
  nativeLabelLayoutKey,
  type DrawingLevel,
} from "../lib/drawing-levels";
import { getExecutionScaffold } from "../lib/execution-plan";
import { expandTradingAbbreviations } from "../lib/plain-language";
import {
  ICT_STAT_RULES,
  formatIctKnowledgeForPrompt,
  formatSessionIctHints,
} from "../lib/ict-knowledge";
import type { Bar, MarketContext } from "../lib/types";

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
    currentDay: { high: 29754.75, low: 29600, open: 29694, close: 29736, equilibrium: 29677.375 },
    unfilledDailyFvgs: [],
    levels: [
      { id: "pdh", label: "Previous day high", price: 29887 },
      { id: "pdl", label: "Previous day low", price: 28600 },
      { id: "res", label: "Next resistance", price: 29950 },
    ],
  },
  activeSession: { id: "ny_am", label: "NY AM" },
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

// Target 1 must not be a micro level ~20pts from entry when PDH is far away
const execMock = {
  ...mockCtx,
  daily: { lastClose: 29752.25, previousDayHigh: 29887, previousDayLow: 28600 },
  htfPdArrays: {
    ...mockCtx.htfPdArrays,
    previousDay: { high: 29887, low: 28600, close: 29500, open: 29764.25, equilibrium: 29243.5 },
    levels: [
      { id: "pdh", label: "Previous day high (PDH)", price: 29887 },
      { id: "pdl", label: "Previous day low (PDL)", price: 28600 },
      { id: "pdo", label: "Previous day open (PDO)", price: 29764.25 },
      { id: "pdc", label: "Previous day close (PDC)", price: 29500 },
      { id: "cdo", label: "Current day open (CDO)", price: 29740 },
    ],
  },
} as unknown as MarketContext;

const scaffold = getExecutionScaffold(execMock);
assert(Boolean(scaffold), "execution scaffold exists");
if (scaffold) {
  const entryMid = (scaffold.entryLo + scaffold.entryHi) / 2;
  const t1Dist = Math.abs(scaffold.target1Price - entryMid);
  assert(t1Dist >= 45, `target1 at least 45pts from entry (got ${t1Dist.toFixed(1)})`);
  assert(
    !/previous day open/i.test(scaffold.target1Label),
    "target1 should skip tight PDO when PDH is available"
  );
}

// Entry zone must hug price — not a distant PD level
const farEntryCtx = {
  ...execMock,
  daily: { lastClose: 29784, previousDayHigh: 29887, previousDayLow: 28600 },
  structureFacts: {
    mss: {
      direction: "bullish" as const,
      level: 29620,
      at: "09:30",
      atTime: 0,
      description: "old MSS",
    },
    m1UnfilledFvgs: [],
    liquiditySweeps: [],
    firstPresentedFvg: { nyOpening: null, postFhdr: null, activeSession: null },
  },
  htfPdArrays: {
    ...execMock.htfPdArrays,
    levels: [
      { id: "pdh", label: "Previous day high (PDH)", price: 29887 },
      { id: "pdc", label: "Previous day close (PDC)", price: 29500 },
      { id: "pdl", label: "Previous day low (PDL)", price: 28600 },
    ],
  },
} as unknown as MarketContext;

const farScaffold = getExecutionScaffold(farEntryCtx);
assert(Boolean(farScaffold), "scaffold with far PD levels");
if (farScaffold) {
  const price = 29784;
  const distLong = price - farScaffold.entryHi;
  const distShort = farScaffold.entryLo - price;
  const dist = Math.max(distLong, distShort);
  assert(dist <= 28.5, `entry within 28pts of price (got ${dist.toFixed(1)})`);
  assert(
    !/previous day close/i.test(farScaffold.entryLabel),
    "entry should not anchor on distant PDC"
  );
}

// FVG inversion — body close through gap flips polarity for entry eligibility
const mkBar = (t: number, o: number, h: number, l: number, c: number): Bar => ({
  time: new Date(t * 1000),
  open: o,
  high: h,
  low: l,
  close: c,
});
const invBars: Bar[] = [
  mkBar(1, 98, 100, 97, 99),
  mkBar(2, 99, 104, 98, 103),
  mkBar(3, 103, 108, 105, 107),
  mkBar(4, 107, 101, 98, 99),
];
const detectedInv = detectUnfilledIntradayFvgs(invBars, "1m", 10, 5);
assert(detectedInv.length === 1 && detectedInv[0].type === "bullish", "detect bullish FVG");
assert(detectedInv[0].inverted === true, "bullish FVG inverted after body close below gap (kept as IFVG)");

const plainBullFvg: Bar[] = [
  mkBar(1, 98, 100, 97, 99),
  mkBar(2, 99, 104, 98, 103),
  mkBar(3, 103, 108, 105, 107),
  mkBar(4, 107, 108, 106, 107.5),
];
const fvgZone = {
  timeframe: "1m" as const,
  type: "bullish" as const,
  top: 105,
  bottom: 100,
  formedAt: "t",
  startTime: 3,
};
assert(isFvgInverted(plainBullFvg, fvgZone, 2) === false, "bullish FVG not inverted without body close below");

const bearInvBars: Bar[] = [
  mkBar(1, 112, 115, 110, 111),
  mkBar(2, 111, 112, 108, 109),
  mkBar(3, 109, 105, 100, 101),
  mkBar(4, 101, 111, 109, 110.5),
];
const detectedBearInv = detectUnfilledIntradayFvgs(bearInvBars, "1m", 10, 5);
assert(detectedBearInv.length === 1 && detectedBearInv[0].type === "bearish", "detect bearish FVG");
assert(detectedBearInv[0].inverted === true, "bearish FVG inverted after body close above gap");

const structInv = buildStructureFacts(invBars, []);
assert(structInv.m1InvertedFvgs.length === 1, "structureFacts.m1InvertedFvgs exposes IFVG");
assert(/inverted \/ IFVG/i.test(structInv.summary), "structure summary notes inverted FVG count");
assert(Array.isArray(structInv.relativeEqualPools), "structureFacts includes relativeEqualPools");

assert(rehRelTolerance(21000) === 4, "REH/REL tolerance caps at 4 pts on MNQ");
assert(rehRelTolerance(1500) === 2, "REH/REL tolerance floor is 2 pts");

const rehBars: Bar[] = [
  mkBar(100, 20990, 20992, 20988, 20990),
  mkBar(101, 20992, 20995, 20990, 20994),
  mkBar(102, 20994, 21000, 20993, 20998),
  mkBar(103, 20998, 20999, 20992, 20994),
  mkBar(104, 20994, 20996, 20990, 20992),
  mkBar(105, 20992, 20997, 20990, 20995),
  mkBar(106, 20995, 20998, 20994, 20996),
  mkBar(107, 20996, 20997, 20992, 20994),
  mkBar(108, 20994, 20996, 20990, 20992),
  mkBar(109, 20992, 20994, 20988, 20990),
];
const rehPools = detectRelativeEqualPools(rehBars, new Date(rehBars.at(-1)!.time), "ny_am");
assert(
  rehPools.some((p) => p.type === "reh" && p.barCount === 2 && p.price === 21000),
  "detect REH from paired 3-bar swing highs (right lower than left)"
);

const relBars: Bar[] = [
  mkBar(200, 20998, 21000, 20995, 20998),
  mkBar(201, 20994, 20998, 20992, 20994),
  mkBar(202, 20992, 20996, 20990, 20992),
  mkBar(203, 20994, 20994, 20993, 20994),
  mkBar(204, 20997, 20998, 20994, 20997),
  mkBar(205, 20998, 21000, 20991, 20998),
  mkBar(206, 20994, 20998, 20988, 20994),
  mkBar(207, 20994, 20994, 20992, 20994),
  mkBar(208, 20997, 20998, 20994, 20997),
  mkBar(209, 20998, 21000, 20994, 20998),
];
const relPools = detectRelativeEqualPools(relBars, new Date(relBars.at(-1)!.time), "ny_am");
assert(
  relPools.some((p) => p.type === "rel" && p.barCount === 2 && p.price === 20988),
  "detect REL from paired 3-bar swing lows (right lower than left)"
);

const rehRelDrawCtx = {
  ...mockCtx,
  fetchedAt: new Date().toISOString(),
  org: null,
  nwog: null,
  htfPdArrays: { ...mockCtx.htfPdArrays, levels: [], recentDailyFvgs: [] },
  structureFacts: {
    ...mockCtx.structureFacts,
    relativeEqualPools: [
      { type: "reh" as const, price: 21000, startTime: 102, endTime: 107, barCount: 2 },
      { type: "rel" as const, price: 20978, startTime: 203, endTime: 208, barCount: 2 },
    ],
  },
} as MarketContext;
const rehRelPrice = 20990;
const drawnLevels = buildDrawingLevels(rehRelDrawCtx, [], { currentPrice: rehRelPrice });
assert(
  drawnLevels.some((l) => l.id === "reh_0" && l.label === "Relative Equal Highs" && l.group === "structure"),
  "buildDrawingLevels emits REH line"
);
assert(
  drawnLevels.some((l) => l.id === "rel_0" && l.label === "Relative Equal Lows" && l.color === "#e879f9"),
  "buildDrawingLevels emits REL with liquidity color"
);

const mixedRehRelPools = [
  { type: "reh" as const, price: 21000, startTime: 102, endTime: 107, barCount: 2 },
  { type: "reh" as const, price: 20985, startTime: 108, endTime: 112, barCount: 2 },
  { type: "rel" as const, price: 20978, startTime: 203, endTime: 208, barCount: 2 },
  { type: "rel" as const, price: 20995, startTime: 213, endTime: 218, barCount: 2 },
];
const filteredPools = filterRelativeEqualPoolsByPrice(mixedRehRelPools, rehRelPrice);
assert(
  filteredPools.some((p) => p.type === "reh" && p.price === 21000),
  "REH above price kept"
);
assert(
  !filteredPools.some((p) => p.type === "reh" && p.price === 20985),
  "REH below price filtered out"
);
assert(
  filteredPools.some((p) => p.type === "rel" && p.price === 20978),
  "REL below price kept"
);
assert(
  !filteredPools.some((p) => p.type === "rel" && p.price === 20995),
  "REL above price filtered out"
);

const priceFilterCtx = {
  ...rehRelDrawCtx,
  structureFacts: {
    ...rehRelDrawCtx.structureFacts,
    relativeEqualPools: mixedRehRelPools,
  },
} as MarketContext;
const priceFilteredLevels = buildDrawingLevels(priceFilterCtx, [], { currentPrice: rehRelPrice });
assert(
  priceFilteredLevels.filter((l) => l.id.startsWith("reh_")).length === 1 &&
    priceFilteredLevels.some((l) => l.id === "reh_0" && l.price === 21000),
  "drawn REH only above current price"
);
assert(
  priceFilteredLevels.filter((l) => l.id.startsWith("rel_")).length === 1 &&
    priceFilteredLevels.some((l) => l.id === "rel_0" && l.price === 20978),
  "drawn REL only below current price"
);
assert(
  !priceFilteredLevels.some((l) => l.label.includes("(")),
  "drawn levels never use merged count labels"
);
assert(
  filterRelativeEqualPoolsByPrice(mixedRehRelPools, null).length === 4,
  "unknown price shows all REH/REL (fallback)"
);

{
  const midPrice = 21000.4;
  const midShelf = [
    { type: "reh" as const, price: 21000.75, startTime: 102, endTime: 107, barCount: 2 },
    { type: "rel" as const, price: 21000, startTime: 213, endTime: 218, barCount: 2 },
  ];
  const afterPrice = filterRelativeEqualPoolsByPrice(midShelf, midPrice);
  assert(afterPrice.length === 2, "price filter keeps both when last is inside the shelf");
  const collapsed = collapseOppositeRelativeEqualOnSameShelf(afterPrice, midPrice);
  assert(collapsed.length === 1, "middle consolidation is one shelf, not dual REH/REL");
  assert(collapsed[0]!.type === "rel", "equal-strength mixed shelf keeps REL (support)");
  const midCtx = {
    ...rehRelDrawCtx,
    structureFacts: {
      ...rehRelDrawCtx.structureFacts,
      relativeEqualPools: midShelf,
    },
  } as MarketContext;
  const midDrawn = buildDrawingLevels(midCtx, [], { currentPrice: midPrice });
  const midRehRel = midDrawn.filter((l) => l.id.startsWith("reh_") || l.id.startsWith("rel_"));
  assert(midRehRel.length === 1 && midRehRel[0]!.id.startsWith("rel_"), "drawn overlay is REL only on mid shelf");
}

const multiRehCtx = {
  ...rehRelDrawCtx,
  structureFacts: {
    ...rehRelDrawCtx.structureFacts,
    relativeEqualPools: [
      { type: "reh" as const, price: 21000, startTime: 102, endTime: 107, barCount: 2 },
      { type: "reh" as const, price: 21001.5, startTime: 108, endTime: 112, barCount: 2 },
      { type: "reh" as const, price: 20999, startTime: 113, endTime: 118, barCount: 2 },
      { type: "rel" as const, price: 20978, startTime: 203, endTime: 208, barCount: 2 },
    ],
  },
} as MarketContext;
const multiRehLevels = buildDrawingLevels(multiRehCtx, [], { currentPrice: rehRelPrice });
assert(
  multiRehLevels.filter((l) => l.id.startsWith("reh_")).length === 3,
  "all REH pools drawn individually — no merge/dedup"
);
assert(
  multiRehLevels.filter((l) => l.id.startsWith("rel_")).length === 1,
  "REL pools still drawn individually"
);
assert(
  !multiRehLevels.some((l) => l.label.includes("(")),
  "REH/REL labels never show merged counts"
);

const clusterLevels: DrawingLevel[] = [
  { id: "pdh", label: "PDH", price: 21000, color: "#fff", dash: "2 3", group: "daily" },
  { id: "ny_rth_high", label: "NY RTH H", price: 21002, color: "#fff", dash: "2 3", group: "session" },
  { id: "reh_0", label: "REH", price: 21001, color: "#fff", dash: "6 4", group: "structure" },
  { id: "reh_1", label: "REH", price: 21001, color: "#fff", dash: "6 4", group: "structure" },
  { id: "org_top", label: "ORG top", price: 20998, color: "#fff", dash: "4 3", group: "org" },
];
assignStaggeredLabelAlign(clusterLevels, [], { priceMin: 20990, priceMax: 21010 });
const labeledCluster = clusterLevels.filter((l) => l.showLabel !== false);
assert(labeledCluster.length === clusterLevels.length, "each overlapping level keeps its own native label");
assert(
  clusterLevels.filter((l) => String(l.id).startsWith("reh_") && l.showLabel !== false).length === 2,
  "stacked REH rays each keep their own name"
);
assert(
  labeledCluster.every((l) => l.labelLane != null && l.labelLane >= 0),
  "each independent label still assigns a labelLane"
);
assert(labelLaneToAlign(0) === "top" && labelLaneToAlign(1) === "middle", "label lanes cycle top/middle");
assert(labelLaneToAlign(2) === "bottom" && labelLaneToAlign(3) === "top", "higher lanes keep cycling");
assert(
  labeledCluster.every((l) => !/\s\/\s/.test(String(l.displayLabel || ""))),
  "distinct nearby names stay on separate drawings — never slash-joined"
);
assert(
  new Set(labeledCluster.map((l) => nativeLabelLayoutKey(l))).size === labeledCluster.length,
  "clustered native titles get unique vert/horz/time slots"
);

const shortBullFvgCtx = {
  ...execMock,
  daily: { lastClose: 29700, previousDayHigh: 29887, previousDayLow: 28600 },
  biasStack: { ...execMock.biasStack, tradeableBias: "bearish", dominantBias: "bearish" },
  structureFacts: {
    mss: null,
    m1UnfilledFvgs: [
      {
        timeframe: "1m" as const,
        type: "bullish" as const,
        top: 29720,
        bottom: 29710,
        formedAt: "10:05",
        startTime: 1,
        inverted: false,
      },
    ],
    liquiditySweeps: [],
    firstPresentedFvg: { nyOpening: null, postFhdr: null, activeSession: null },
  },
} as unknown as MarketContext;
const shortNoInv = getExecutionScaffold(shortBullFvgCtx);
assert(Boolean(shortNoInv), "short scaffold with bullish FVG exists");
if (shortNoInv) {
  assert(
    !/bullish fair value gap/i.test(shortNoInv.entryLabel) || /inverted/i.test(shortNoInv.entryLabel),
    "short must not anchor on unfilled bullish FVG"
  );
}

const shortInvFvgCtx = {
  ...shortBullFvgCtx,
  structureFacts: {
    ...shortBullFvgCtx.structureFacts,
    m1UnfilledFvgs: [
      {
        timeframe: "1m" as const,
        type: "bullish" as const,
        top: 29720,
        bottom: 29710,
        formedAt: "10:05",
        startTime: 1,
        inverted: true,
      },
    ],
  },
} as unknown as MarketContext;
const shortInv = getExecutionScaffold(shortInvFvgCtx);
assert(Boolean(shortInv), "short scaffold with inverted bullish FVG");
if (shortInv) {
  assert(/inverted bullish fair value gap/i.test(shortInv.entryLabel), "short may use inverted bullish FVG");
}

assert(
  ICT_STAT_RULES.some((r) => r.id === "fvg-polarity-entry"),
  "ICT knowledge includes FVG polarity entry rule"
);

// classifyChartQuestion
assert(classifyChartQuestion("what price are we trading at right now") === "price", "right now price");
assert(classifyChartQuestion("get the read") === "full_read", "full read intent");
assert(isChartReadCommand("get the read"), "get the read is a chart-read command");
assert(wantsChartRead("get me a read"), "get me a read triggers chart read");
assert(!needsFullChartRead("what's the bias"), "bias uses JSON snapshot not screenshot");
assert(needsFullChartRead("get the read"), "get the read needs screenshot");
assert(isChartReadCommand("read"), "standalone read is chart command");
assert(!isCasualChat("read", "indian food butter chicken"), "read in food thread is not casual");
assert(normalizeChartReadCommand("read") === "get the read", "read normalizes for routing");
assert(classifyChartQuestion("what's the bias") === "bias", "bias intent");
assert(isSnapshotIntent("price"), "price is snapshot");

// classifyChartQuestion — garbled PDL mishear
assert(classifyChartQuestion("whereas previews stay low") === "level", "garbled PDL intent");
assert(classifyChartQuestion("where is previous day low") === "level", "PDL intent");

const pdlSnap = buildMarketSnapshotAnswer(
  mockCtx,
  "level",
  "whereas previews stay low"
);
assert(pdlSnap.spoken.includes("28600"), "garbled PDL snap answers PDL not PDH");
assert(!pdlSnap.spoken.toLowerCase().includes("last price"), "PDL snap no last price");
assert(!pdlSnap.spoken.toLowerCase().includes("entry zone"), "PDL snap no entry");
assert(!/target one/i.test(pdlSnap.spoken), "PDL snap no target");

const biasSnap = buildMarketSnapshotAnswer(mockCtx, "bias", "what's the bias");
assert(!/last price/i.test(biasSnap.spoken), "bias snap no last price");
assert(/tradeable bias/i.test(biasSnap.spoken), "bias snap has tradeable bias");
assert(/nearest support/i.test(biasSnap.spoken), "bias snap names nearest support");

assert(
  classifyChartQuestion("What level are we currently trading out") === "price",
  "garbled price question intent"
);
assert(
  classifyChartQuestion("What level are we trading at?") === "price",
  "what level are we trading at → price not level"
);

assert(
  applyVoiceRules("Whereas previews stay low.").toLowerCase().includes("previous day low"),
  "voice rule fixes garbled PDL"
);
assert(!needsVoiceInterpret("where is previous day low"), "clean PDL skips LLM interpret");
assert(
  !needsVoiceInterpret("Whereas previews stay low."),
  "PDL mishear fixed by rules without LLM"
);

const travelCtx =
  "user: what's the best thing to do there?\nassistant: Pizza and gelato — Amalfi Coast is hard to beat.";
assert(
  applyContextualSttFixes("That's what I said, the Amalfi Ghost.", travelCtx).includes("Amalfi Coast"),
  "Amalfi Ghost corrected to Coast in travel thread"
);
assert(
  needsContextualInterpret("That's what I said, the Amalfi Ghost.", travelCtx),
  "ghost in travel thread triggers contextual interpret"
);
assert(
  needsVoiceInterpret("That's what I said, the Amalfi Ghost.", travelCtx),
  "needsVoiceInterpret with travel context for ghost"
);

assert(isCasualChat("do you like mcdonalds"), "mcdonalds is casual chat");
assert(isCasualChat("do you like music"), "music is casual chat");
assert(isCasualChat("hello, how is your day going"), "day greeting is casual");
assert(isCasualChat("hi how are you"), "hi how are you is casual");
assert(
  casualChatFallback("bye", "") === "Hey — doing good, thanks. How's yours?",
  "bye misheard as greeting gets warm reply not farewell"
);
assert(
  casualChatFallback("hi", "") === "Hey — good to hear from you. What's up?",
  "hi alone gets greeting"
);
assert(
  shouldChuckle("Why did the trader bring a ladder to the desk? The market kept hitting new highs."),
  "trader joke gets chuckle"
);
assert(!shouldChuckle("Doing good, thanks. How's yours?"), "greeting does not get chuckle");
assert(
  Boolean(speechEmotionFor("Why did the trader bring a ladder to the desk?").instructions),
  "joke gets TTS instructions"
);
assert(
  !speechEmotionFor("Why did the trader bring a ladder to the desk?").preferApiTts,
  "joke keeps browser TTS voice"
);
assert(
  prefersInstantVoice("Why did the trader bring a ladder to the desk?", {
    preferApiTts: speechEmotionFor("Why did the trader bring a ladder to the desk?").preferApiTts,
  }),
  "joke prefers instant browser voice"
);
assert(isCasualChat("what about kfc", "do you like mcdonalds"), "kfc follow-up is casual");
assert(isCasualChat("hello"), "hello is casual chat");

assert(isGreeting("hi"), "hi alone is pure greeting");
assert(isGreeting("hello, how is your day going"), "hello + day check is pure greeting");
assert(isGreeting("hi how are you"), "hi how are you is pure greeting");
assert(!isGreeting("Hi, what is your favourite food?"), "hi + favorite food is not pure greeting");
assert(!isGreeting("Hi, what is your favourite city?"), "hi + favorite city is not pure greeting");
assert(!isGreeting("hey, what's the weather"), "hey + weather is not pure greeting");
assert(
  stripLeadingGreeting("Hi, what is your favourite food?") === "what is your favourite food?",
  "stripLeadingGreeting removes hi prefix"
);
assert(
  !isGreeting("Hi, what is your favourite food?"),
  "hi + favorite food is not pure greeting — goes to LLM stream"
);
assert(
  /burger|chinese|food/i.test(casualChatFallback("Hi, what is your favourite food?")),
  "hi + favorite food gets food persona reply after strip"
);
assert(needsWebSearch("hey, what's the weather"), "hey + weather needs web search");

const steer =
  "KFC offers different flavors. Now, back on track: do you want a read on the Nasdaq futures chart?";
const clean = sanitizeCasualReply(steer, "what about kfc");
assert(!/fair question|easy either way/i.test(clean), "steer-back stripped from casual reply");

assert(!isGenericCasualReply(casualChatFallback("random xyz")), "no generic fallback");
assert(!/^Ha — say more/i.test(casualChatFallback("random xyz")), "no Ha filler");
assert(
  /catch that|still on this|something else/i.test(casualChatFallback("random xyz")),
  "unresolved stays a real sentence"
);
assert(/kfc|chicken|original recipe/i.test(clean), "kfc fallback when steer-back removed");
assert(isCasualChat("be like mcdonald's"), "be like mcdonalds is casual");
assert(!isCasualChat("what's the bias on mnq"), "bias is not casual");
assert(isCasualChat("what is your chinese order"), "food order question is casual");
assert(isCasualChat("tell me about your weekend plans"), "weekend chat is casual");
assert(!isCasualChat("give me a read"), "chart read command is not casual");
assert(!isCasualChat("should I wait"), "ambiguous trading follow-up is not casual");
assert(classifyChartQuestion("what's happening") === "general", "vague question stays general not full read");
assert(!needsFullChartRead("what's happening"), "vague casual line does not trigger chart read");
assert(!needsFullChartRead("what's happening on the chart"), "chart status uses snapshot not screenshot");
assert(classifyChartQuestion("what is the chart doing right now") === "status", "chart doing intent");
assert(classifyChartQuestion("what's the chart doing") === "status", "what's the chart doing");
assert(isChartStatusQuestion("what is the chart doing right now"), "chart status question");
assert(!needsFullChartRead("what is the chart doing right now"), "chart doing avoids full read");
assert(!needsScopedChartAnswer("what is the chart doing right now"), "chart doing uses rich LLM not snapshot");
assert(needsFullChartRead("what is on the chart"), "on the chart still triggers read");
assert(wantsChartRead("what is on the chart"), "on the chart wants read");
assert(!wantsChartRead("what is the chart doing right now"), "chart doing is not wantsChartRead");

assert(classifyChartQuestion("what's the market doing right now") === "status", "market doing intent");
assert(classifyChartQuestion("what is the market doing") === "status", "what is the market doing");
assert(classifyChartQuestion("market doing right now") === "status", "market doing right now");
assert(isChartStatusQuestion("what's the market doing right now"), "market status question");
assert(!needsFullChartRead("what's the market doing right now"), "market doing avoids full read");
assert(needsScopedChartAnswer("what's the market doing right now"), "market doing uses JSON snapshot");
assert(prefersRichTradingAnswer("should I wait for a pullback to PDH"), "should-i uses rich trading");
assert(!prefersRichTradingAnswer("what is the chart doing right now"), "plain chart status stays snapshot");
assert(!prefersRichTradingAnswer("what price are we at"), "price tick stays narrow");
assert(!isCasualChat("what's the market doing right now"), "market status is not casual");
assert(!wantsChartRead("what's the market doing right now"), "market doing is not wantsChartRead");
assert(
  applyCanonicalVoiceRules("what's the mark it doing right now") === "what is the market doing right now",
  "STT mark it → market doing fix"
);

assert(ASSISTANT_NAME === "Karen", "assistant name is Karen");
assert(
  stripAssistantNamePrefix("Karen: The weather is nice today.") === "The weather is nice today.",
  "stripAssistantNamePrefix removes Karen colon"
);
assert(
  stripAssistantNamePrefix("Karen, I'd go with navy blue.") === "I'd go with navy blue.",
  "stripAssistantNamePrefix removes Karen comma"
);
assert(
  stripAssistantNamePrefix("Hey — Karen here, what's up?") === "what's up?",
  "stripAssistantNamePrefix removes hey karen here comma"
);
assert(
  stripAssistantNamePrefix("Hey — Karen here. Say GET THE READ.") ===
    "Hey — Karen here. Say GET THE READ.",
  "stripAssistantNamePrefix preserves welcome line"
);
assert(/pulling PD|thirty seconds/i.test(karenToolAck("mark_levels")), "karen mark_levels ack");
assert(karenStatusLine("listening") === "KAREN · listening", "karen status line");

assert(
  /navy blue/i.test(casualChatFallback("what's your thoughts on favourite colour")),
  "favourite colour gets specific answer"
);
assert(
  /navy blue/i.test(
    casualChatFallback("which one", "what's your thoughts on favourite colour")
  ),
  "which one after colour stays casual"
);
assert(
  isGenericCasualReply("I do not have personal preferences. If you have any trading questions, I'm here to help."),
  "AI refusal detected as generic"
);
assert(
  !/fair question|personal preferences|trading questions/i.test(
    sanitizeCasualReply(
      "I do not have personal preferences. If you have any trading questions, I'm here to help.",
      "which one",
      "what's your thoughts on favourite colour"
    )
  ),
  "AI refusal replaced with personality"
);

assert(
  applyVoiceRules("Eli MacDonald").toLowerCase().includes("mcdonalds"),
  "STT mcdonalds fix"
);

assert(isSnapshotIntent("structure"), "structure is snapshot");
assert(isSnapshotIntent("status"), "status is snapshot");

assert(
  expandTradingAbbreviations("PDH 29887, PDL 28600").includes("previous day high"),
  "expandTradingAbbreviations expands PDH"
);
assert(
  !/\bPDH\b/i.test(expandTradingAbbreviations("PDH 29887")),
  "expandTradingAbbreviations removes PDH"
);
assert(
  expandTradingAbbreviations("MNQ at 29736").includes("Nasdaq futures"),
  "expandTradingAbbreviations expands MNQ"
);

assert(ICT_STAT_RULES.length >= 14, "ICT_STAT_RULES has approved rules");
assert(
  ICT_STAT_RULES.some((r) => r.id === "org-half-gap-70pct" && r.stat === "~70%"),
  "ICT half-gap 70% rule encoded"
);
const ictBlock = formatIctKnowledgeForPrompt();
assert(ictBlock.includes("70%") && ictBlock.includes("9:31"), "formatIctKnowledgeForPrompt includes ORG CE window");
assert(ictBlock.includes("user-verified extension"), "formatIctKnowledgeForPrompt includes user_verified tag");
const nyOpenHints = formatSessionIctHints("ny_am", new Date("2026-08-12T13:45:00.000Z"));
assert(nyOpenHints.includes("FVG"), "formatSessionIctHints at NY open includes FVG hint");
const londonHints = formatSessionIctHints("london", new Date("2026-08-12T07:30:00.000Z"));
assert(/buy-side liquidity raid/i.test(londonHints), "London hints include Asia high BSL raid");
assert(ICT_STAT_RULES.some((r) => r.id === "london-asia-high-bsl-raid"), "London ASH BSL rule encoded");

const statusSnap = buildMarketSnapshotAnswer(mockCtx, "status", "what is the chart doing right now");
assert(statusSnap.spoken.includes("29736"), "status snap has live price");
assert(/tradeable bias/i.test(statusSnap.spoken), "status snap has bias");
assert(/previous day high/i.test(statusSnap.spoken), "status snap has previous day high");
assert(!/\bPDH\b/i.test(statusSnap.spoken), "status snap has no PDH abbreviation");
assert(/call is/i.test(statusSnap.spoken), "status snap has call");

const marketStatusSnap = buildMarketSnapshotAnswer(mockCtx, "status", "what's the market doing right now");
assert(marketStatusSnap.spoken.includes("29736"), "market status snap has live price");
assert(/tradeable bias/i.test(marketStatusSnap.spoken), "market status snap has bias");

const fvgMock = {
  ...mockCtx,
  htfPdArrays: {
    ...mockCtx.htfPdArrays,
    recentDailyFvgs: [
      {
        timeframe: "daily" as const,
        type: "bullish" as const,
        top: 29650,
        bottom: 29580,
        formedAt: "2026-08-10",
        startTime: 0,
      },
    ],
    unfilledDailyFvgs: [
      {
        timeframe: "daily" as const,
        type: "bullish" as const,
        top: 29650,
        bottom: 29580,
        formedAt: "2026-08-10",
        startTime: 0,
      },
    ],
  },
} as unknown as MarketContext;

const fvgSnap = buildMarketSnapshotAnswer(
  fvgMock,
  "structure",
  "where is the last daily bullish fvg"
);
assert(fvgSnap.spoken.includes("29580"), "daily bullish FVG bottom");
assert(fvgSnap.spoken.includes("29650"), "daily bullish FVG top");
assert(!fvgSnap.spoken.toLowerCase().includes("entry zone"), "FVG snap no entry");
assert(!/target one/i.test(fvgSnap.spoken), "FVG snap no target");

assert(
  classifyChartQuestion("where is the last daily bullish photo") === "structure",
  "STT photo mishear routes structure"
);

// first presented FVG — dedicated intent, 1m not daily
assert(
  isFirstPresentedFvgQuestion("Where is the first presented fair value gap?"),
  "FPFVG question detected"
);
assert(
  classifyChartQuestion("Where is the first presented fair value gap?") === "first_presented_fvg",
  "FPFVG intent not generic structure"
);
assert(
  classifyChartQuestion("Where was the first presented fair value gap?") === "first_presented_fvg",
  "FPFVG was/is phrasing routes first_presented_fvg"
);
assert(
  resolveSnapshotIntent("Where was the first presented fair value gap?") === "first_presented_fvg",
  "resolveSnapshotIntent forces FPFVG"
);
assert(isSnapshotIntent("first_presented_fvg"), "FPFVG is snapshot intent");

const fpfvgMock = {
  ...fvgMock,
  structureFacts: {
    ...mockCtx.structureFacts,
    firstPresentedFvg: {
      nyOpening: {
        fvg: {
          timeframe: "1m" as const,
          type: "bullish" as const,
          top: 29719,
          bottom: 29686.25,
          formedAt: "09:35",
          startTime: 0,
        },
        variant: "ny_opening" as const,
        sessionLabel: "New York AM",
        windowLabel: "9:30–10:00 opening range",
        filled: true,
      },
      postFhdr: null,
      activeSession: {
        fvg: {
          timeframe: "1m" as const,
          type: "bullish" as const,
          top: 29719,
          bottom: 29686.25,
          formedAt: "09:35",
          startTime: 0,
        },
        variant: "ny_opening" as const,
        sessionLabel: "New York AM",
        windowLabel: "9:30–10:00 opening range",
        filled: true,
      },
    },
  },
} as unknown as MarketContext;

const fpfvgWasSnap = buildMarketSnapshotAnswer(
  fpfvgMock,
  resolveSnapshotIntent("Where was the first presented fair value gap?"),
  "Where was the first presented fair value gap?"
);
assert(fpfvgWasSnap.intent === "first_presented_fvg", "FPFVG was phrasing snapshot intent");
assert(fpfvgWasSnap.spoken.includes("First presented one-minute"), "FPFVG was phrasing labels 1m first presented");
assert(!/\bdaily\b/i.test(fpfvgWasSnap.spoken), "FPFVG was phrasing must not cite daily FVG");

const fpfvgSnap = buildMarketSnapshotAnswer(
  fpfvgMock,
  "first_presented_fvg",
  "Where is the first presented fair value gap?"
);
assert(fpfvgSnap.spoken.includes("First presented one-minute"), "FPFVG answer labels 1m first presented");
assert(fpfvgSnap.spoken.includes("29686.25"), "FPFVG answer has 1m gap bottom");
assert(fpfvgSnap.spoken.includes("29719"), "FPFVG answer has 1m gap top");
assert(fpfvgSnap.spoken.includes("09:35"), "FPFVG answer has formation time");
assert(!/\bdaily\b/i.test(fpfvgSnap.spoken), "FPFVG answer must not cite daily FVG");
assert(fpfvgSnap.spoken.includes("New York AM"), "FPFVG answer includes session context");

const fpfvgDateKey = "2026-08-12";
function fpBarAt(h: number, m: number, o: number, hi: number, lo: number, c: number): Bar {
  return {
    time: new Date(estTimeOnDateKey(fpfvgDateKey, h, m) * 1000),
    open: o,
    high: hi,
    low: lo,
    close: c,
  };
}
const fpBars: Bar[] = [
  fpBarAt(9, 28, 29680, 29690, 29675, 29685),
  fpBarAt(9, 29, 29685, 29695, 29680, 29690),
  fpBarAt(9, 30, 29700, 29705, 29695, 29702),
  fpBarAt(9, 31, 29702, 29720, 29700, 29715),
  fpBarAt(9, 32, 29715, 29725, 29712, 29722),
  fpBarAt(9, 33, 29722, 29740, 29730, 29735),
];
const detectedFp = detectNyOpeningFirstPresentedFvg(fpBars, fpfvgDateKey);
assert(Boolean(detectedFp), "detectNyOpeningFirstPresentedFvg finds qualifying gap");
if (detectedFp) {
  assert(detectedFp.fvg.type === "bullish", "detected FPFVG is bullish");
  assert(detectedFp.fvg.formedAt === "09:32", "detected FPFVG formed at first qualifying third candle");
  assert(detectedFp.variant === "ny_opening", "detected FPFVG variant ny_opening");
}

assert(
  classifyChartQuestion("where is the first daily presented fair value gap") === "first_presented_fvg",
  "FPFVG intent wins over daily keyword when presented is present"
);

assert(
  isFirstPresentedFvgQuestion("where is the first percentage fair value gap"),
  "FPFVG STT percentage mishear detected"
);
assert(
  classifyChartQuestion("where is the first percentage fair value gap") === "first_presented_fvg",
  "FPFVG STT percentage routes first_presented_fvg not structure"
);
assert(
  classifyChartQuestion("hi where is the first percentage fair value gap") === "first_presented_fvg",
  "FPFVG STT percentage with hi greeting routes first_presented_fvg"
);
assert(
  classifyChartQuestion("where is the first percent fvg") === "first_presented_fvg",
  "FPFVG STT percent fvg routes first_presented_fvg"
);
assert(
  classifyChartQuestion("1st presented fvg") === "first_presented_fvg",
  "1st presented fvg routes first_presented_fvg"
);
assert(
  classifyChartQuestion("where is the opening range fvg") === "first_presented_fvg",
  "opening range fvg routes first_presented_fvg"
);
assert(
  applyCanonicalVoiceRules("where is the first percentage fair value gap") ===
    "where is the first presented fair value gap",
  "voice rule fixes percentage FPFVG mishear"
);
assert(
  fixFirstPresentedFvgMishear("where is the first percentage fair value gap") ===
    "where is the first presented fair value gap",
  "transcription guard fixes percentage FPFVG mishear"
);

const fpfvgPctSnap = buildMarketSnapshotAnswer(
  fpfvgMock,
  "first_presented_fvg",
  "where is the first percentage fair value gap"
);
assert(fpfvgPctSnap.spoken.includes("First presented one-minute"), "FPFVG percentage phrase hits 1m answer path");
assert(!/\bdaily\b/i.test(fpfvgPctSnap.spoken), "FPFVG percentage phrase must not cite daily FVG");

const fpfvgNone = buildMarketSnapshotAnswer(
  {
    ...mockCtx,
    structureFacts: {
      ...mockCtx.structureFacts,
      firstPresentedFvg: { nyOpening: null, postFhdr: null, activeSession: null },
    },
  } as unknown as MarketContext,
  "first_presented_fvg",
  "Where is the first presented fair value gap?"
);
assert(
  fpfvgNone.spoken.includes("No first presented one-minute") && fpfvgNone.spoken.includes("9:30"),
  "FPFVG none answer cites NY opening window"
);
assert(!/\bdaily\b/i.test(fpfvgNone.spoken), "FPFVG none answer must not cite daily FVG");

// buildMarketSnapshotAnswer uses lastClose
const snap = buildMarketSnapshotAnswer(mockCtx, "price");
assert(snap.spoken.includes("29736"), "snapshot uses lastClose");
assert(!snap.spoken.toLowerCase().includes("entry zone"), "price snap no entry");

// scoped price — no entry/target
const scoped = buildScopedSpokenBrief(mockCtx, "price", "", "");
assert(scoped.includes("29736"), "scoped price has last");
assert(!/\btarget one\b/i.test(scoped), "scoped price no target");
assert(!/\bentry zone\b/i.test(scoped), "scoped price no entry");

// entry+target combined — no duplicate lines
const combo = buildMarketSnapshotAnswer(mockCtx, "entry", "where's entry and target");
assert(combo.spoken.includes("Entry zone"), "combo has entry");
assert(combo.spoken.includes("Target one"), "combo has target");
const targetCount = (combo.spoken.match(/target one/gi) || []).length;
assert(targetCount === 1, "combo target once only");

const fullRead = buildVoiceSpokenBrief(mockCtx, "", "what do you see on the chart");
assert(Boolean(fullRead && /trading at 29736/.test(fullRead)), "full read has live price");
assert(Boolean(fullRead && /first target/i.test(fullRead)), "full read has one target");
assert(Boolean(fullRead && !/entry near/i.test(fullRead)), "full read skips entry price");
assert(Boolean(fullRead && countMnqPrices(fullRead) <= 3), "full read max 3 spoken prices");

const laundry =
  "Nasdaq futures near 29736. Previous day high at 29850 and previous day low at 28600 and opening range central equilibrium at 29200. Bias is bullish. Call is potential buy. Target one 29900 at previous day high.";
const trimmed = sanitizeSpokenBrief(laundry);
assert(countMnqPrices(trimmed) <= 3, "sanitizer caps spoken prices");
assert(!/opening range central equilibrium at 29200/i.test(trimmed), "sanitizer drops level laundry");

assert(needsWebSearch("what's the temperature in Telford England"), "weather question needs web");
assert(needsWebSearch("what's the weather in Telford?"), "Telford weather needs web");
assert(needsWebSearch("what's the whether in Telford"), "STT whether typo needs web");
assert(needsWebSearch("what's the wetter in Telford"), "STT wetter typo needs web");
assert(needsWebSearch("what's the weird in Telford"), "STT weird+location typo needs web");
assert(needsWebSearch("weather in Telford"), "short weather in city needs web");
assert(
  normalizeWeatherStt("what's the whether in Telford") === "what's the weather in Telford",
  "whether normalizes to weather"
);
assert(
  normalizeWeatherStt("what's the wetter in Telford") === "what's the weather in Telford",
  "wetter normalizes to weather"
);
assert(
  applyCanonicalVoiceRules("what's the whether in Telford") === "what's the weather in Telford",
  "canonical voice rules fix whether"
);
assert(needsWebSearch("what's it like in Telford"), "location conditions need web");
assert(
  wantsLiveWebData("look it up", [
    { role: "user", content: "what's the weather in Telford?" },
    { role: "assistant", content: "Not sure off the top of my head." },
    { role: "user", content: "look it up" },
  ]),
  "look it up resolves to live-data follow-up"
);
assert(needsWebSearch("look it up online"), "explicit lookup needs web");
assert(needsWebSearch("look that up"), "look that up needs web");
assert(
  resolveWebSearchQuestion("look it up", [
    { role: "user", content: "what's the weather in Telford?" },
    { role: "assistant", content: "Not sure off the top of my head." },
    { role: "user", content: "look it up" },
  ]) === "what's the weather in Telford?",
  "look it up resolves prior weather question"
);
assert(!needsWebSearch("what's the bias on MNQ"), "chart bias does not need web");
assert(!needsWebSearch("get the read"), "chart read command does not need web");
assert(needsWebSearch("what's the latest fed news"), "macro news needs web");
assert(needsWebSearch("what is the capital of France"), "general knowledge needs web");
assert(needsWebSearch("who invented the telephone"), "who invented needs web");
assert(needsWebSearch("best restaurants in Telford"), "local places need web");
assert(!needsWebSearch("tell me about yourself"), "persona question does not need web");
assert(!needsWebSearch("who are you"), "who are you does not need web");
assert(!needsWebSearch("introduce yourself"), "introduce yourself does not need web");
assert(!needsWebSearch("tell me about you"), "tell me about you is persona not web");
assert(!wantsLiveWebData("tell me about yourself"), "persona does not want live data");
assert(!shouldUseLiveWebSearch("tell me about yourself"), "routing: persona skips live web");
assert(!shouldUseLiveWebSearch("what's the market doing right now"), "routing: market status skips live web");
assert(
  liveDataFallbackIfNeeded("tell me about yourself", undefined, null) === null,
  "persona never gets live-data fallback"
);
assert(
  nameIntroReply("Hi, my name's Adam") === "Nice to meet you, Adam! What's up?",
  "name intro local reply"
);
assert(isPersonaOrOpinionQuestion("what is your favorite food"), "persona alias for favorite food");
assert(isPersonaQuestion("tell me about yourself"), "tell me about yourself is persona");
assert(isIdentityQuestion("tell me about yourself"), "tell me about yourself is identity");
assert(isKarenPreferenceQuestion("what is your favorite food"), "favorite food is Karen preference");
assert(isKarenPreferenceQuestion("what's your favorite color"), "favorite color is Karen preference");
assert(isKarenPreferenceQuestion("do you like pizza"), "do you like is Karen preference");
assert(isKarenPreferenceQuestion("do you prefer coffee or tea"), "do you prefer is Karen preference");
assert(isPersonaQuestion("what is your favorite food"), "favorite food is persona");
assert(!needsWebSearch("what is your favorite food"), "favorite food does not need web");
assert(!needsWebSearch("what's your favorite movie"), "favorite movie does not need web");
assert(!needsWebSearch("do you like sushi"), "do you like does not need web");
assert(!wantsLiveWebData("what is your favorite food"), "favorite food does not want live data");
assert(needsWebSearch("what is the favorite food in Italy"), "Italy favorite food needs web");
assert(isGeneralConversation("what is your favorite food"), "favorite food is general conversation");
assert(isCasualChat("what is your favorite food"), "favorite food is casual chat");
assert(isGeneralConversation("tell me about yourself"), "persona is general conversation");
assert(isCasualChat("tell me about yourself"), "persona is casual chat");
assert(
  casualChatFallback("Do you prefer chicken nuggets or burgers?").includes("Nuggets"),
  "food preference must not return identity stub"
);
assert(
  casualChatFallback("Do you prefer chicken nuggets or burgers?") !== "Your desk co-pilot.",
  "food preference must not return identity stub exact"
);
assert(needsWebSearch("tell me about France"), "factual tell me about still needs web");
assert(needsWebSearch("tell me about the Roman Empire"), "historical entity still needs web");
assert(
  /desk co-pilot/i.test(casualChatFallback("tell me about yourself")),
  "persona fallback introduces desk co-pilot"
);
assert(isGeneralConversation("what is photosynthesis"), "general science question is casual");
assert(!isGeneralConversation("what is the bias on MNQ"), "chart bias is not general casual");
assert(
  buildSearchQuery("Karen, what's the temperature in Telford?") ===
    "what's the temperature in Telford",
  "search query strips Karen prefix"
);

assert(
  casualChatFallback(
    "what's your name?",
    "sweet and sour chicken egg fried rice chinese order"
  ) === "Your desk co-pilot.",
  "name question beats stale food thread"
);

assert(
  !/team hot food/i.test(
    casualChatFallback(
      "what's the weather in Telford?",
      "chicken tikka masala garlic naan indian order"
    )
  ),
  "weather question does not get food fallback"
);

assert(
  isStaleCasualMismatch(
    "I'm still team hot food over sad desk snacks. What's your go-to?",
    "what's the weather in Telford?"
  ),
  "stale food line mismatches weather question"
);

const genericApiLine =
  "I'm still team hot food over sad desk snacks. What's your go-to?";
const syncedBubble = sanitizeCasualReply(
  genericApiLine,
  "what's the weather in Telford?",
  "chicken tikka masala indian order"
);
assert(syncedBubble !== genericApiLine, "generic API line is replaced for chat bubble");
assert(
  !/team hot food/i.test(syncedBubble),
  "sanitized bubble drops stale food thread"
);

assert(
  isCasualChat("what's the weather in Telford?", "chicken tikka indian food order"),
  "weather still routes when food thread in history"
);

assert(
  casualChatFallback("I like red.", "navy blue favourite colour what's yours").includes("Red"),
  "user colour preference is acknowledged"
);

assert(
  mergeSttTranscript("what do you see", "what do you see on the chart") ===
    "what do you see on the chart",
  "mergeStt prefers longer related interim"
);
assert(
  mergeSttTranscript("what is the weather", "where is previous day low") === "what is the weather",
  "mergeStt ignores unrelated stale interim"
);
assert(
  !sttTranscriptsRelated("hello there", "previous day low"),
  "unrelated transcripts not merged"
);
assert(
  pickRelatedSttTranscript("what is price", "where is pdl") === "what is price",
  "pickRelated prefers primary when unrelated"
);
assert(
  applyVoiceRules("what do you see on the char") === "what do you see on the chart",
  "applyVoiceRules fixes char→chart"
);
assert(
  applyCanonicalVoiceRules("Eli MacDonald") === "Eli MacDonald",
  "canonical rules do not rewrite casual homophones"
);
assert(
  applyVoiceRules("Eli MacDonald").toLowerCase().includes("mcdonalds"),
  "routing rules still fix casual homophones"
);
assert(
  isSttExtension("what do you see", "what do you see on the chart"),
  "isSttExtension detects utterance growth"
);
assert(
  mergeSttTranscript("what is the weather today", "what is the weather") ===
    "what is the weather today",
  "mergeStt prefers final when interim is shorter prefix"
);
assert(
  needsVoiceInterpret("what do you see on the chart") === false,
  "clean transcript skips LLM interpret"
);

const nameBubble = "Nice to meet you, Adam! What's up?";
const namePrefix = "Nice to meet you, Adam!";
assert(isNameIntroReply(nameBubble), "name intro reply is recognized");
assert(!isTradingRedirect(nameBubble), "name intro is not a trading redirect");
assert(
  sanitizeCasualReply(nameBubble, "Hi, my name's Adam.") === nameBubble,
  "name intro survives casual sanitize"
);
assert(
  !isFullySpoken(nameBubble, namePrefix),
  "first sentence alone is not fully spoken bubble"
);
assert(
  remainderToSpeak(nameBubble, namePrefix).includes("What's up"),
  "remainder includes second sentence after name ack"
);
assert(
  isFullySpoken(nameBubble, nameBubble),
  "full bubble counts as fully spoken"
);
const spokenNorm = normalizeSpeakText(namePrefix);
const bubbleNorm = normalizeSpeakText(nameBubble);
assert(
  !isRecentlySpoken(nameBubble, spokenNorm, Date.now()),
  "longer bubble is not deduped after partial prefix speak"
);
assert(
  isRecentlySpoken(namePrefix, bubbleNorm, Date.now()),
  "shorter repeat dedupes when superset already spoken"
);

const clauseBubble =
  "That is a longer Karen line with enough words in it to risk speaker echo from the desk.";
const clausePartial = "That is a longer Karen line with enough words";
assert(
  !isFullySpoken(clauseBubble, clausePartial),
  "clause-chunk partial is not fully spoken"
);
assert(
  remainderToSpeak(clauseBubble, clausePartial).includes("risk speaker echo"),
  "clause-chunk partial remainder skips already spoken prefix"
);
assert(
  remainderToSpeak(clauseBubble, clauseBubble) === "",
  "full clause bubble has empty remainder"
);
assert(
  remainderToSpeak(clauseBubble, clausePartial) !== clauseBubble,
  "clause-chunk partial does not re-speak entire bubble"
);

const streamBubble = "Nice to meet you, Adam! Let me know if you need a market read or anything else.";
const streamPartial = "Nice to meet you, Adam!";
const streamTail = remainderToSpeak(streamBubble, streamPartial);
assert(
  streamTail.includes("Let me know"),
  "stream partial leaves a catch-up tail for second sentence"
);
assert(
  remainderToSpeak(streamBubble, streamBubble) === "",
  "fully streamed bubble has no catch-up tail"
);
assert(
  !isRecentlySpoken(streamTail, normalizeSpeakText(streamPartial), Date.now()),
  "catch-up tail is not deduped after partial stream prefix"
);
const steerBubble = "Sure! Pizza is great.";
const steerStream =
  "Sure! Pizza is great. Now, back on track: do you want a read on the Nasdaq futures chart?";
assert(isStaleStreamSuperset(normalizeSpeakText(steerStream), normalizeSpeakText(steerBubble)), "stale stream superset detected");
assert(!isFullySpoken(steerBubble, steerStream), "sanitized bubble not fully spoken by stale stream buffer");
assert(shouldStreamVoiceSpeak(steerBubble, steerStream, Date.now()), "sanitized bubble must speak after stale stream");
assert(
  remainderToSpeak(steerBubble, steerStream) === "",
  "sanitized bubble has no catch-up when stream spoke steer-back tail"
);
assert(
  isRecentlySpoken(streamPartial, normalizeSpeakText(streamBubble), Date.now()),
  "already-spoken prefix dedupes when full bubble was delivered"
);

assert(
  normalizeWeatherStt("I'm here at weather in Telford, Shropshire.") ===
    "what's the weather in Telford, Shropshire.",
  "I'm here at weather STT normalizes to weather query"
);
assert(
  normalizeWeatherStt("what here at weather in Telford") === "what's the weather in Telford",
  "what here at weather STT normalizes to weather query"
);
assert(needsWebSearch("I'm here at weather in Telford, Shropshire."), "garbled STT weather+place needs web");
assert(wantsLiveWebData("I'm here at weather in Telford, Shropshire."), "garbled STT weather+place wants live data");
assert(hasWeatherWithLocation("I'm here at weather in Telford, Shropshire."), "garbled STT has weather with location");
assert(
  resolveWeatherLocation("what's the weather in Telford, Shropshire")?.location === "Telford, Shropshire",
  "comma form Telford, Shropshire extracts place"
);
assert(
  resolveWeatherLocation("weather in Telford, Shropshire")?.location === "Telford, Shropshire",
  "weather in Telford, Shropshire comma form extracts place"
);
assert(
  buildWeatherSearchQuery("Telford, Shropshire") === "current weather Telford Shropshire England",
  "Telford, Shropshire search query normalizes comma form"
);
assert(
  isWeatherGuessReply(
    "Got it! I can't check the weather, but I'd say it's probably typical British weather — mix of clouds and maybe some rain. Grab an umbrella just in case!"
  ),
  "can't check + typical British weather guess is blocked"
);
assert(
  !isLiveWeatherReply(
    "Got it! I can't check the weather, but I'd say it's probably typical British weather — mix of clouds and maybe some rain."
  ),
  "typical British weather guess is not live data"
);

assert(
  isWeatherGuessReply(
    "I'm not up on the weather reports, but I hope it's nice! Always better with good weather. Got any plans for the day?"
  ),
  "Karen weather small-talk is treated as a guess"
);
assert(
  !isLiveWeatherReply(
    "I'm not up on the weather reports, but I hope it's nice! Always better with good weather."
  ),
  "weather guess is not live data"
);
assert(isLiveWeatherReply("Telford's at 12.3°C and overcast — feels like 11°C."), "live weather has markers");
assert(isLiveWeatherReply(WEATHER_LOCATION_PROMPT), "location prompt counts as live weather reply");
assert(
  extractUserLocation(normalizeMemory({ userNotes: ["I live in Telford"] })) === "Telford",
  "memory extracts user city"
);
assert(needsWebSearch("what is the weather"), "generic weather question needs web");

assert(
  resolveWeatherLocation("Telford in Shropshire", {
    messages: [
      { role: "user", content: "what is the weather" },
      { role: "assistant", content: WEATHER_LOCATION_PROMPT },
    ],
  })?.location === "Telford in Shropshire",
  "clarification Telford in Shropshire resolves location"
);
assert(
  resolveWeatherLocation("what's the weather in Telford in Shropshire")?.location === "Telford in Shropshire",
  "weather in Telford in Shropshire extracts full place"
);
assert(
  resolveWeatherLocation("What's the weather in the Amalfi Coast in Italy?")?.location ===
    "Amalfi Coast in Italy",
  "Amalfi Coast in Italy extracts full place"
);
assert(!isAmbiguousWeatherLocation("Telford"), "bare Telford resolves via known UK county town");
assert(!isAmbiguousWeatherLocation("Shrewsbury"), "bare Shrewsbury resolves via known UK county town");
assert(!isAmbiguousWeatherLocation("Telford in Shropshire"), "Telford in Shropshire is not ambiguous");
assert(!isAmbiguousWeatherLocation("Telford Shropshire"), "Telford Shropshire is not ambiguous");
assert(!isAmbiguousWeatherLocation("Shropshire Telford"), "Shropshire Telford is not ambiguous");
assert(
  resolveWeatherLocation("tell me the weather in Telford Shropshire")?.location === "Telford Shropshire",
  "weather in Telford Shropshire extracts full place"
);
assert(
  resolveWeatherLocation("Tell me the weather in Shropshire Telford.")?.location === "Shropshire Telford",
  "weather in Shropshire Telford extracts full place"
);
assert(
  resolveWeatherLocation("weather Telford in Shropshire")?.location === "Telford in Shropshire",
  "weather Telford in Shropshire extracts full place"
);
assert(
  buildWeatherSearchQuery("Telford Shropshire") === "current weather Telford Shropshire England",
  "Telford Shropshire search query includes England"
);
assert(
  buildWeatherSearchQuery("Telford in Shropshire") === "current weather Telford Shropshire England",
  "Telford in Shropshire search query normalizes for search"
);
assert(
  buildWeatherSearchQuery("Shrewsbury") === "current weather Shrewsbury Shropshire England",
  "bare Shrewsbury search query includes county and England"
);
assert(
  resolveWeatherLocation("What is the weather in Shrewsbury?")?.location === "Shrewsbury",
  "weather in Shrewsbury extracts place"
);
assert(
  buildWeatherSearchQuery("Shropshire Telford") === "current weather Telford Shropshire England",
  "Shropshire Telford search query normalizes to city-first with England"
);
assert(
  buildWeatherSearchQuery("Shropshire, Telford") === "current weather Telford Shropshire England",
  "Shropshire, Telford search query normalizes for search"
);
assert(!isAmbiguousWeatherLocation("Telford, Shropshire"), "Telford, Shropshire comma form is not ambiguous");
assert(
  !snippetMentionsDifferentPlace(
    "Telford, Shropshire",
    "Telford currently 18°C and overcast today in the West Midlands"
  ),
  "comma location trusts user region — snippet with city only is not a mismatch"
);
assert(
  !snippetMentionsDifferentPlace(
    "Telford Shropshire",
    "Weather forecast for Telford UK — cloudy with showers"
  ),
  "city+county location trusts user — generic Telford UK snippet is OK"
);
assert(
  isLiveWeatherReply(weatherAmbiguousPrompt("Telford")),
  "ambiguous location prompt counts as live weather reply"
);
assert(
  extractWeatherFromHits(
    [{ title: "BBC Weather", snippet: "Telford currently 18°C and overcast today", url: "" }],
    "Telford in Shropshire"
  ) === "Telford's at 18°C and overcast.",
  "snippet extractor builds live weather line"
);
assert(
  normalizeWeatherStt("What's the weather in the Alamalfi Coast in Italy?") ===
    "What's the weather in the Amalfi Coast in Italy?",
  "Alamalfi STT normalizes to Amalfi"
);
assert(
  isLiveWeatherReply("Telford 7 day weather forecast including weather warnings, temperature, rain, wind"),
  "web search snippet counts as live weather"
);

const TELFORD_CLARIFICATION =
  "no I mean in Telford what is the weather Telford in Shropshire";
assert(
  resolveWeatherLocation(TELFORD_CLARIFICATION)?.location === "Telford in Shropshire",
  "voice clarification utterance extracts Telford in Shropshire"
);
assert(
  resolveWeatherLocation(normalizeWeatherStt(TELFORD_CLARIFICATION))?.location === "Telford in Shropshire",
  "normalized voice clarification extracts Telford in Shropshire"
);
assert(
  needsWebSearch(TELFORD_CLARIFICATION),
  "voice clarification still needs live web search"
);
assert(
  isWeatherGuessReply(
    "Ah, got it! Telford's looking pretty nice today — clear skies and around 25°C. Perfect for a stroll!"
  ),
  "conversational weather guess is blocked"
);
assert(
  !isLiveWeatherReply(
    "Ah, got it! Telford's looking pretty nice today — clear skies and around 25°C. Perfect for a stroll!"
  ),
  "conversational weather guess is not live Open-Meteo data"
);

async function runAsyncChecks() {
  const telfordAmbiguous = await tryWebSearchReply("What's the weather in Telford?");
  assert(
    telfordAmbiguous === weatherAmbiguousPrompt("Telford"),
    "bare Telford asks which region"
  );

  const telfordShropshire = await tryWebSearchReply("tell me the weather in Telford Shropshire");
  assert(
    telfordShropshire !== weatherAmbiguousPrompt("Telford Shropshire") &&
      telfordShropshire !== weatherAmbiguousPrompt("Telford"),
    "Telford Shropshire proceeds to web search instead of asking which region"
  );

  const weatherReply = await tryWebSearchReply("What's the weather in Telford, UK?");
  if (weatherReply) {
    assert(
      !/can't check|cannot browse|probably a bit damp|don't keep up with the weather|not up on the weather|classic mix/i.test(
        weatherReply
      ),
      "weather is not a guess"
    );
  }

  const whetherReply = await tryWebSearchReply("what's the whether in Telford in Shropshire");
  if (whetherReply) {
    assert(isLiveWeatherReply(whetherReply), "whether STT reply has live markers");
  }

  const amalfiReply = await tryWebSearchReply("What's the weather in the Amalfi Coast in Italy?");
  if (amalfiReply) {
    assert(isLiveWeatherReply(amalfiReply), "Amalfi Coast weather has live markers");
  }

  const mem = normalizeMemory({ userNotes: ["I live in Telford"] });
  const noCityWithMem = await tryWebSearchReply("what is the weather", undefined, { memory: mem });
  assert(
    noCityWithMem === weatherAmbiguousPrompt("Telford"),
    "no-city weather with ambiguous memory asks which region"
  );

  const noCityNoMem = await tryWebSearchReply("what is the weather");
  assert(noCityNoMem === WEATHER_LOCATION_PROMPT, "no city and no memory asks which city");
}

runAsyncChecks()
  .then(() => console.log("All scoped chart Q&A checks passed."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
