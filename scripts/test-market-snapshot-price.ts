/**
 * Smoke test: price question path used by POST /api/market-snapshot
 * Run: npx tsx scripts/test-market-snapshot-price.ts
 */
import { answerFromIntelligence } from "../lib/conversational-query";
import { resolveApiDataQuality } from "../lib/api-data-quality";
import { buildDeskMarketIntelligence } from "../lib/market-intelligence";
import { resolveSnapshotIntent } from "../lib/chart-question-intent";
import { resolveTickstreamAuthoritativePrice } from "../lib/tickstream/stream-snapshot";

const QUESTION = "What price are we at right now?";

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

async function runScenario(label: string, vercel: boolean) {
  console.log(`\n=== ${label} ===`);
  if (vercel) process.env.VERCEL = "1";
  else delete process.env.VERCEL;

  try {
    const tick = await resolveTickstreamAuthoritativePrice({ streamWaitMs: 500 });
    console.log(`  tickstream: ${tick ? `${tick.value} (${tick.source})` : "null"}`);

    const intel = await buildDeskMarketIntelligence({ forceFresh: true });
    const dq = resolveApiDataQuality(intel);
    const answer = answerFromIntelligence(intel, QUESTION);
    const intent = resolveSnapshotIntent(QUESTION);

    assert(intent === "price", `intent=price (got ${intent})`);
    assert(!!answer, "answerFromIntelligence returned payload");
    assert(typeof answer?.spoken === "string" && answer.spoken.length > 0, "spoken text present");
    assert(dq.dataQuality !== undefined, "dataQuality resolved");
    console.log(`  dq=${dq.dataQuality} canDecide=${dq.canDecide}`);
    console.log(`  spoken: ${answer?.spoken?.slice(0, 100)}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ threw: ${msg}`);
    if (/mask is not a function/i.test(msg)) {
      console.error("  (mask bug still present)");
    }
  }
}

async function main() {
  await runScenario("local (ws stream allowed)", false);
  await runScenario("VERCEL=1 (REST quote only, no ws stream)", true);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
