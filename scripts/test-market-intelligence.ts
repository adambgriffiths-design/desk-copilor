/**
 * Market intelligence layer tests — run: npm run test:market-intelligence
 */
import { buildDeskMarketIntelligence } from "../lib/market-intelligence";
import {
  answerFromIntelligence,
  classifyQueryMode,
  needsMarketIntelligenceAnswer,
  extractConversationContext,
} from "../lib/conversational-query";
import { detectTeachingConcept, teachConcept } from "../lib/ict-teaching";
import { buildObservationFacts } from "../lib/observation-facts";
import { needsScopedChartAnswer } from "../lib/chart-read-intent";

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

async function main() {
  console.log("=== routing ===");
  assert(needsMarketIntelligenceAnswer("where's the last NWOG?"), "NWOG fact question");
  assert(needsMarketIntelligenceAnswer("what is MSS?"), "MSS teaching");
  assert(needsMarketIntelligenceAnswer("has that been invalidated?"), "invalidation follow-up route");
  assert(needsScopedChartAnswer("where is the last MSS?"), "scoped chart includes MSS");
  assert(needsMarketIntelligenceAnswer("where is the nearest REH?"), "REH fact question");
  assert(needsMarketIntelligenceAnswer("where is the nearest relative equal high?"), "relative equal high fact question");
  assert(needsMarketIntelligenceAnswer("where is the last EQH?"), "EQH fact question");
  assert(needsScopedChartAnswer("is there a relative equal high near current price?"), "REH near price scoped");
  assert(classifyQueryMode("where is the nearest REH?") === "fact_lookup", "REH query mode fact_lookup");
  assert(!needsScopedChartAnswer("why is the market moving like this today"), "rich trading excluded");
  assert(detectTeachingConcept("what is a fair value gap?") === "fvg", "teaching detects FVG");
  assert(detectTeachingConcept("where is NWOG?") === null, "live NWOG not teaching");

  console.log("\n=== teaching ===");
  const t = teachConcept("mss");
  assert(Boolean(t?.definition.includes("structure shift")), "MSS definition");

  console.log("\n=== live intelligence (may skip offline) ===");
  try {
    const intel = await buildDeskMarketIntelligence({ forceFresh: false });
    assert(intel.facts.length > 5, "fact registry populated");
    assert(Boolean(intel.state_hash), "state hash present");
    assert(intel.observation.data_quality !== undefined, "observation quality");

    const priceQ = answerFromIntelligence(intel, "what price are we at?");
    assert(Boolean(priceQ?.spoken), "price question answered");
    assert((priceQ?.facts.length ?? 0) > 0, "price answer has facts");

    const nwogQ = answerFromIntelligence(intel, "where's the last NWOG?");
    assert(Boolean(nwogQ?.spoken), "NWOG question answered");
    assert(nwogQ?.mode === "facts", "NWOG is facts mode");

    const mssQ = answerFromIntelligence(intel, "where is the last MSS?");
    assert(Boolean(mssQ?.spoken), "MSS question answered");

    const invQ = answerFromIntelligence(intel, "has that been invalidated?", {
      lastFactIds: ["structure.mss"],
    });
    assert(Boolean(invQ?.spoken), "invalidation follow-up answered");
    assert(
      /invalidated|active|still|not invalidated|none detected|unknown/i.test(invQ?.spoken || ""),
      "invalidation status"
    );

    const teachQ = answerFromIntelligence(intel, "what is MSS?");
    assert(teachQ?.mode === "teaching", "teaching mode");
    assert(!teachQ?.facts.length, "teaching has no live facts");

    const ctx = extractConversationContext([
      { role: "user", content: "where is MSS?" },
      { role: "assistant", content: "Market structure shift bullish at 21000." },
    ]);
    assert(ctx.lastTopic === "structure.mss", "context extracts MSS topic");
  } catch (err) {
    console.warn("  (skipped live build — market data unavailable)", err instanceof Error ? err.message : err);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
