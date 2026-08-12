/**
 * Conversation routing regression — route classification + casual fallback sanity.
 * No live API required.
 */
import { classifyDeskRoute } from "../lib/desk-route-intent";
import { classifyAnalysisDepth } from "../lib/analysis-depth";
import { casualChatFallback } from "../lib/casual-chat-intent";
import { detectTeachingConcept } from "../lib/ict-teaching";
import { needsScopedChartAnswer } from "../lib/chart-read-intent";
import { needsMarketIntelligenceAnswer } from "../lib/conversational-query";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

type Case = {
  phrase: string;
  expectRoute: string;
  expectDetail?: string;
  expectDepth?: string;
  expectNotReply?: RegExp;
  expectReply?: RegExp;
  teaching?: boolean;
  scopedSnapshot?: boolean;
  marketIntel?: boolean;
};

const CASES: Case[] = [
  {
    phrase: "Do you prefer chicken nuggets or burgers?",
    expectRoute: "casual",
    expectDetail: "persona",
    expectDepth: "GENERAL_QUESTION",
    expectNotReply: /^Your desk co-pilot\.?$/i,
    expectReply: /nugget|burger|desk food|go-to/i,
  },
  {
    phrase: "What's the weather in London?",
    expectRoute: "live_web",
    expectDetail: "search",
    expectDepth: "GENERAL_QUESTION",
  },
  {
    phrase: "What is an MSS?",
    expectRoute: "snapshot",
    expectDepth: "GENERAL_QUESTION",
    teaching: true,
  },
  {
    phrase: "Where's the last MSS?",
    expectRoute: "snapshot",
    expectDepth: "FAST_FACT",
    scopedSnapshot: true,
    marketIntel: true,
  },
  {
    phrase: "Where's the latest NWOG?",
    expectRoute: "snapshot",
    expectDepth: "FAST_FACT",
    scopedSnapshot: true,
    marketIntel: true,
  },
  {
    phrase: "Give me the current market verdict.",
    expectRoute: "trading",
    expectDepth: "DEEP_ANALYSIS",
  },
  {
    phrase: "mark levels",
    expectRoute: "levels",
  },
];

let failed = 0;

for (const c of CASES) {
  const route = classifyDeskRoute({ text: c.phrase, routeText: c.phrase });
  const depth = classifyAnalysisDepth({ text: c.phrase, routeText: c.phrase });
  const fallback = casualChatFallback(c.phrase);

  try {
    assert(route.route === c.expectRoute, `route: expected ${c.expectRoute}, got ${route.route}`);
    if (c.expectDetail) {
      assert(route.detail === c.expectDetail, `detail: expected ${c.expectDetail}, got ${route.detail}`);
    }
    if (c.expectDepth) {
      assert(depth === c.expectDepth, `depth: expected ${c.expectDepth}, got ${depth}`);
    }
    if (c.teaching) {
      assert(detectTeachingConcept(c.phrase) === "mss", "expected MSS teaching concept");
    }
    if (c.scopedSnapshot) {
      assert(needsScopedChartAnswer(c.phrase), "expected scoped snapshot");
    }
    if (c.marketIntel) {
      assert(needsMarketIntelligenceAnswer(c.phrase), "expected market intelligence");
    }
    if (c.expectNotReply) {
      assert(!c.expectNotReply.test(fallback.trim()), `fallback must not match ${c.expectNotReply}: "${fallback}"`);
    }
    if (c.expectReply) {
      assert(c.expectReply.test(fallback), `fallback should match ${c.expectReply}: "${fallback}"`);
    }
    console.log(`ok: ${c.phrase} → ${route.route}${route.detail ? ` · ${route.detail}` : ""} (${depth})`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL: ${c.phrase}\n  ${e instanceof Error ? e.message : e}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} conversation routing test(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${CASES.length} conversation routing tests passed.`);
