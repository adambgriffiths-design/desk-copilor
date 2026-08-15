/**
 * Decision memory Redis adapter — focused regression (tests 1–17).
 * Uses in-memory Redis mock — no real credentials.
 *
 * Run: npm run test:decision-memory-adapter
 */
import type { DecisionEnvelope } from "../lib/decision-envelope";
import {
  clearDecisionEnvelopeHistory,
  clearDecisionEnvelopeHistoryL1,
  findDecisionAtOrBefore,
  flushDecisionMemoryWrites,
  getDecisionEnvelopeHistory,
  hydrateDecisionMemoryFromStore,
  latestDecisionEnvelope,
  recordDecisionEnvelopeHistory,
  resetDecisionMemoryAvailabilityForTests,
} from "../lib/decision-envelope-history";
import {
  createMemoryDecisionMemoryBackend,
  DECISION_MEMORY_LIVE_KEY,
  DECISION_MEMORY_MAX_ENTRIES,
  decisionMemoryStoreMode,
  historicalDecisionMemoryKey,
  resolveDecisionMemoryTtlSeconds,
  setDecisionMemoryBackendForTests,
  type DecisionMemoryBackend,
} from "../lib/decision-memory-backend";
import {
  answerLiveDecisionHistoryQuery,
  compareDecisionSnapshots,
} from "../lib/decision-time-travel";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function msNow(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

function makeEnvelope(overrides?: {
  stance?: DecisionEnvelope["stance"];
  what?: string;
  whyNow?: string;
}): DecisionEnvelope {
  const what = overrides?.what ?? "Test thesis what";
  const whyNow = overrides?.whyNow ?? "Test whyNow — original WHY frozen";
  const stance = overrides?.stance ?? "wait";
  return {
    primaryHorizon: {
      id: "primary",
      timeframe: "1m",
      lean: "neutral",
      role: "stance",
      summary: "primary",
    },
    htfContext: {
      id: "htf",
      timeframe: "15m",
      lean: "bullish",
      role: "context",
      summary: "htf",
    },
    stance,
    conflictResolution: {
      conflict: false,
      between: "none",
      winner: "neither",
      stance,
      sentence: "no conflict",
    },
    conflictLog: {
      htfHorizon: "15m",
      htfLean: "bullish",
      tacticalHorizon: "1m",
      tacticalLean: "neutral",
      disagree: false,
      ltfAgainstHtfAllowed: null,
      why: "aligned",
      target: null,
      invalidation: null,
    },
    thesis: {
      what,
      whyNow,
      timeframe: "session",
      toward: "PDH",
      fromWhere: "discount",
      invalidates: "below 100",
      complete: true,
    },
    read: {
      htfContext: { horizon: "15m", lean: "bullish" },
      currentStructure: { horizon: "1m", lean: "neutral" },
      tradeableOpportunity: "none",
      tradeDirection: "NONE",
      target: "PDH",
      invalidation: "below 100",
      overallStance: stance,
    },
    confidence: "medium",
    invalidation: { price: "100", condition: "close below 100" },
    logicOrder: {
      strategicBias: "htf",
      tacticalBias: "1m",
      execution: "wait",
      invalidation: "100",
    },
    layers: {
      facts: "facts layer",
      interpretation: "interpretation layer",
      decision: "decision layer",
      invalidation: "invalidation layer",
    },
    reasoningChain: [
      {
        concept: "htf_bias",
        checked: true,
        detected: true,
        usedInDecision: true,
        role: "PRIMARY",
        evidence: { source: "test" },
        outcome: "true",
        impact: "supports wait for entry",
      },
    ],
    citedConcepts: ["htf_bias"],
  };
}

function toSnap(
  entry: NonNullable<ReturnType<typeof latestDecisionEnvelope>>,
  clock: string
) {
  return {
    ok: true as const,
    match: "history" as const,
    asOf: entry.asOf,
    asOfEst: entry.asOfEst || entry.asOf,
    requestedClock: clock,
    decisionKey: entry.decisionKey || "",
    status: "WAIT" as const,
    entryStatus: entry.entryStatus,
    envelope: entry.envelope,
    evidence: String(entry.envelope.layers.facts || "").slice(0, 500),
    marketState: {
      price: entry.marketState?.price ?? null,
      stateHash: entry.marketState?.stateHash ?? entry.stateHash,
      htfBias: entry.marketState?.htfBias ?? null,
      structure: entry.marketState?.structure ?? null,
      displacement: entry.marketState?.displacement ?? null,
      fvgStatus: entry.marketState?.fvgStatus ?? null,
      verdict: entry.marketState?.verdict ?? entry.verdict ?? null,
    },
    entry,
  };
}

async function resetAll(backend: DecisionMemoryBackend | null) {
  setDecisionMemoryBackendForTests(backend);
  resetDecisionMemoryAvailabilityForTests();
  clearDecisionEnvelopeHistory();
  await flushDecisionMemoryWrites();
  clearDecisionEnvelopeHistoryL1();
}

async function main() {
  console.log("\n=== Decision memory adapter (in-memory Redis mock) ===\n");

  const latencies: Record<string, number> = {};
  const mock = createMemoryDecisionMemoryBackend();
  await resetAll(mock);

  const t0 = "2026-08-12T13:31:00.000Z";
  const t1 = "2026-08-12T13:41:00.000Z";
  const envLive = makeEnvelope({
    stance: "wait",
    what: "LIVE wait for displacement",
    whyNow: "ORIGINAL_WHY_LIVE_UNIQUE_TOKEN",
  });

  console.log("1. LIVE write → LIVE read");
  {
    const tWrite0 = msNow();
    const recorded = recordDecisionEnvelopeHistory({
      asOf: t0,
      lane: "LIVE",
      envelope: envLive,
      verdict: "WAIT",
      stateHash: "hash-live-1",
      decisionKey: "LIVE@?|wait|WAIT|" + t0,
      entryStatus: "WAIT",
      marketState: { price: 21000, stateHash: "hash-live-1", verdict: "WAIT" },
    });
    await flushDecisionMemoryWrites();
    latencies.redisWriteMs = msNow() - tWrite0;
    assert("recorded", !!recorded);
    const tRead0 = msNow();
    await hydrateDecisionMemoryFromStore({ lane: "LIVE" });
    const ring = getDecisionEnvelopeHistory("LIVE");
    latencies.redisReadMs = msNow() - tRead0;
    assert("LIVE ring len 1", ring.length === 1);
    assert("LIVE read matches id", ring[0]?.id === recorded?.id);
  }

  console.log("2. LIVE write → latest");
  {
    const latest = latestDecisionEnvelope("LIVE");
    assert("latest is LIVE entry", latest?.stateHash === "hash-live-1");
  }

  console.log("3. LIVE write → at-or-before");
  {
    const hit = findDecisionAtOrBefore("LIVE", t0);
    assert("at-or-before exact", hit?.stateHash === "hash-live-1");
    const miss = findDecisionAtOrBefore("LIVE", "2026-08-12T13:00:00.000Z");
    assert("before first → null", miss == null);
  }

  console.log("4. LIVE write → what-changed");
  {
    const env2 = makeEnvelope({
      stance: "long",
      what: "LIVE long after confirm",
      whyNow: "later why",
    });
    recordDecisionEnvelopeHistory({
      asOf: t1,
      lane: "LIVE",
      envelope: env2,
      verdict: "LONG",
      stateHash: "hash-live-2",
      decisionKey: "LIVE@?|long|LONG|" + t1,
      marketState: { price: 21050, stateHash: "hash-live-2", verdict: "LONG" },
    });
    await flushDecisionMemoryWrites();
    const earlier = findDecisionAtOrBefore("LIVE", t0)!;
    const later = latestDecisionEnvelope("LIVE")!;
    const cmp = compareDecisionSnapshots(toSnap(earlier, "09:31"), toSnap(later, "09:41"), "LIVE");
    assert("what-changed has decision delta", cmp.decisionChanged === true || cmp.decisionChanges.length > 0);
    assert("compare snapshots ok", typeof cmp.formatted === "string" && cmp.formatted.length > 0);
  }

  console.log("5. HISTORICAL write → HISTORICAL read");
  {
    const envH = makeEnvelope({ what: "HIST thesis", whyNow: "HIST why" });
    const rec = recordDecisionEnvelopeHistory({
      asOf: t0,
      lane: "HISTORICAL",
      envelope: envH,
      verdict: "WAIT",
      stateHash: "hash-hist-a1",
      fixtureId: "fixture-A",
      barIndex: 10,
      asOfEst: "09:31",
      decisionKey: "fixture-A@10|wait|WAIT|" + t0,
      entryStatus: "WAIT",
    });
    await flushDecisionMemoryWrites();
    clearDecisionEnvelopeHistoryL1("HISTORICAL");
    await hydrateDecisionMemoryFromStore({ lane: "HISTORICAL", fixtureId: "fixture-A" });
    const hist = getDecisionEnvelopeHistory("HISTORICAL").filter((e) => e.fixtureId === "fixture-A");
    assert("HISTORICAL read back", hist.length === 1 && hist[0]?.id === rec?.id);
  }

  console.log("6. LIVE/HISTORICAL isolation");
  {
    const liveIds = new Set(getDecisionEnvelopeHistory("LIVE").map((e) => e.id));
    const histIds = new Set(getDecisionEnvelopeHistory("HISTORICAL").map((e) => e.id));
    for (const id of liveIds) assert("LIVE id not in HISTORICAL", !histIds.has(id));
    for (const id of histIds) assert("HISTORICAL id not in LIVE", !liveIds.has(id));
    assert(
      "LIVE find ignores hist fixture",
      findDecisionAtOrBefore("LIVE", t0, { fixtureId: "fixture-A" })?.lane !== "HISTORICAL"
    );
    assert(
      "HISTORICAL latest not LIVE",
      latestDecisionEnvelope("HISTORICAL", { fixtureId: "fixture-A" })?.lane === "HISTORICAL"
    );
  }

  console.log("7. fixture isolation");
  {
    recordDecisionEnvelopeHistory({
      asOf: t0,
      lane: "HISTORICAL",
      envelope: makeEnvelope({ what: "fixture B" }),
      verdict: "LONG",
      stateHash: "hash-hist-b1",
      fixtureId: "fixture-B",
      barIndex: 3,
    });
    await flushDecisionMemoryWrites();
    clearDecisionEnvelopeHistoryL1("HISTORICAL");
    await hydrateDecisionMemoryFromStore({ lane: "HISTORICAL", fixtureId: "fixture-A" });
    const aOnly = getDecisionEnvelopeHistory("HISTORICAL").filter((e) => e.fixtureId === "fixture-A");
    assert("fixture-A hydrate has A", aOnly.length >= 1 && aOnly.every((e) => e.fixtureId === "fixture-A"));
    const bHit = findDecisionAtOrBefore("HISTORICAL", t0, { fixtureId: "fixture-B" });
    // L1 may not have B yet — hydrate B
    await hydrateDecisionMemoryFromStore({ lane: "HISTORICAL", fixtureId: "fixture-B" });
    const bHit2 = findDecisionAtOrBefore("HISTORICAL", t0, { fixtureId: "fixture-B" });
    assert("fixture-B find after hydrate", bHit2?.fixtureId === "fixture-B");
    assert("fixture-A not returned as B", bHit2?.stateHash === "hash-hist-b1");
    void bHit;
    const storeA = await mock.lrange(historicalDecisionMemoryKey("fixture-A"), 0, -1);
    const storeB = await mock.lrange(historicalDecisionMemoryKey("fixture-B"), 0, -1);
    assert("Redis keys isolated", storeA.length >= 1 && storeB.length >= 1);
    assert(
      "A key has no B hash",
      storeA.every((j) => !j.includes("hash-hist-b1"))
    );
  }

  console.log("8–11. round-trip fields");
  {
    await resetAll(mock);
    const env = makeEnvelope({
      what: "ROUND_TRIP_WHAT",
      whyNow: "ROUND_TRIP_WHY_NOW",
      stance: "short",
    });
    env.layers.facts = "FACTS_UNIQUE";
    env.reasoningChain[0]!.impact = "CHAIN_IMPACT_UNIQUE";
    const rec = recordDecisionEnvelopeHistory({
      asOf: t0,
      lane: "LIVE",
      envelope: env,
      verdict: "SHORT",
      stateHash: "rt-hash",
      decisionKey: "DK_FROZEN_123",
      entryStatus: "ACTIVE",
      marketState: {
        price: 99,
        stateHash: "rt-hash",
        snapshotId: "snap-1",
        htfBias: "bearish",
        structure: "bearish",
        displacement: "down",
        fvgStatus: "open",
        verdict: "SHORT",
      },
    });
    await flushDecisionMemoryWrites();
    clearDecisionEnvelopeHistoryL1();
    const tMiss0 = msNow();
    await hydrateDecisionMemoryFromStore({ lane: "LIVE" });
    latencies.l1MissPlusRedisMs = msNow() - tMiss0;
    const got = latestDecisionEnvelope("LIVE");
    assert("8 decisionKey round-trip", got?.decisionKey === "DK_FROZEN_123");
    assert("9 entryStatus round-trip", got?.entryStatus === "ACTIVE");
    assert("10 whyNow round-trip", got?.thesis.whyNow === "ROUND_TRIP_WHY_NOW");
    assert("10 thesis.what round-trip", got?.thesis.what === "ROUND_TRIP_WHAT");
    assert("11 full envelope facts", got?.envelope.layers.facts === "FACTS_UNIQUE");
    assert("11 reasoningChain", got?.envelope.reasoningChain[0]?.impact === "CHAIN_IMPACT_UNIQUE");
    assert("11 conflicts present", !!got?.conflicts);
    assert("11 invalidation", got?.invalidation.price === "100");
    assert("same id", got?.id === rec?.id);
    const tHit0 = msNow();
    latestDecisionEnvelope("LIVE");
    latencies.l1HitMs = msNow() - tHit0;
  }

  console.log("12. LTRIM cap");
  {
    await resetAll(mock);
    for (let i = 0; i < DECISION_MEMORY_MAX_ENTRIES + 15; i++) {
      recordDecisionEnvelopeHistory({
        asOf: new Date(Date.parse(t0) + i * 120_000).toISOString(),
        lane: "LIVE",
        envelope: makeEnvelope({ what: `cap-${i}` }),
        verdict: "WAIT",
        stateHash: `cap-hash-${i}`,
      });
    }
    await flushDecisionMemoryWrites();
    const raw = await mock.lrange(DECISION_MEMORY_LIVE_KEY, 0, -1);
    assert("Redis list capped at 80", raw.length === DECISION_MEMORY_MAX_ENTRIES);
    clearDecisionEnvelopeHistoryL1();
    await hydrateDecisionMemoryFromStore({ lane: "LIVE" });
    assert("L1 after hydrate capped", getDecisionEnvelopeHistory("LIVE").length === 80);
  }

  console.log("13. dedup behaviour");
  {
    await resetAll(mock);
    const a = recordDecisionEnvelopeHistory({
      asOf: t0,
      lane: "LIVE",
      envelope: makeEnvelope({ what: "dedup-first" }),
      verdict: "WAIT",
      stateHash: "same-hash",
    });
    const b = recordDecisionEnvelopeHistory({
      asOf: new Date(Date.parse(t0) + 30_000).toISOString(),
      lane: "LIVE",
      envelope: makeEnvelope({ what: "dedup-second-should-skip" }),
      verdict: "WAIT",
      stateHash: "same-hash",
    });
    await flushDecisionMemoryWrites();
    assert("dedup returns first", a?.id === b?.id);
    assert("ring len 1", getDecisionEnvelopeHistory("LIVE").length === 1);
    assert("thesis kept first", getDecisionEnvelopeHistory("LIVE")[0]?.thesis.what === "dedup-first");
  }

  console.log("14. Redis unavailable → honest miss");
  {
    const failing: DecisionMemoryBackend = {
      ...createMemoryDecisionMemoryBackend(),
      kind: "memory",
      syncCapable: true,
      async lrange() {
        throw new Error("simulated redis down");
      },
      async appendTrimExpire() {
        throw new Error("simulated redis down");
      },
    };
    await resetAll(failing);
    recordDecisionEnvelopeHistory({
      asOf: t0,
      lane: "LIVE",
      envelope: makeEnvelope(),
      verdict: "WAIT",
      stateHash: "x",
    });
    // Simulate cold isolate: empty L1, hydrate fails
    clearDecisionEnvelopeHistoryL1();
    const hyd = await hydrateDecisionMemoryFromStore({ lane: "LIVE" });
    assert("hydrate reports failure", hyd.ok === false);
    assert("honest empty ring", getDecisionEnvelopeHistory("LIVE").length === 0);
    assert("latest miss", latestDecisionEnvelope("LIVE") == null);
    const q = answerLiveDecisionHistoryQuery("What was your decision at 09:31?");
    assert(
      "honest miss wording",
      !!q && (/NO DECISION AVAILABLE|no decision|missing/i.test(q.reply) || q.responseSource.includes("missing"))
    );
  }

  console.log("15. local no-Redis fallback → RAM behaviour");
  {
    await resetAll(null);
    assert("mode ram-only", decisionMemoryStoreMode() === "ram-only");
    recordDecisionEnvelopeHistory({
      asOf: t0,
      lane: "LIVE",
      envelope: makeEnvelope({ what: "ram-only" }),
      verdict: "WAIT",
      stateHash: "ram-1",
    });
    assert("RAM read works", getDecisionEnvelopeHistory("LIVE").length === 1);
    assert("latest RAM", latestDecisionEnvelope("LIVE")?.thesis.what === "ram-only");
    // Clearing L1 without Redis loses data (expected local sole-process contract)
    clearDecisionEnvelopeHistoryL1();
    assert("no Redis → cold L1 empty", getDecisionEnvelopeHistory("LIVE").length === 0);
  }

  console.log("16. empty store → honest miss");
  {
    await resetAll(mock);
    assert("empty LIVE", getDecisionEnvelopeHistory("LIVE").length === 0);
    assert("empty latest", latestDecisionEnvelope("LIVE") == null);
    const q = answerLiveDecisionHistoryQuery("What was your decision at 09:31?");
    assert("empty → miss source", !!q && q.responseSource.includes("missing"));
  }

  console.log("17. different-process/isolate simulation");
  {
    await resetAll(mock);
    const rec = recordDecisionEnvelopeHistory({
      asOf: t0,
      lane: "LIVE",
      envelope: makeEnvelope({ what: "cross-isolate", whyNow: "WHY_CROSS" }),
      verdict: "WAIT",
      stateHash: "iso-1",
      decisionKey: "ISO_KEY",
      entryStatus: "WAIT",
    });
    await flushDecisionMemoryWrites();
    // Isolate B: empty L1, same Redis
    clearDecisionEnvelopeHistoryL1();
    assert("isolate B L1 empty", getDecisionEnvelopeHistory("LIVE").length === 0);
    await hydrateDecisionMemoryFromStore({ lane: "LIVE" });
    const got = latestDecisionEnvelope("LIVE");
    assert("isolate B retrieves", got?.id === rec?.id);
    assert("isolate B WHY", got?.thesis.whyNow === "WHY_CROSS");
    assert("isolate B decisionKey", got?.decisionKey === "ISO_KEY");
  }

  // TTL documentation check
  assert("TTL default 24h", resolveDecisionMemoryTtlSeconds() === 86_400);

  // Cleanup
  setDecisionMemoryBackendForTests(undefined);
  resetDecisionMemoryAvailabilityForTests();
  clearDecisionEnvelopeHistory();
  await flushDecisionMemoryWrites();

  console.log("\n--- Adapter latencies (mock; not production network) ---");
  console.log(`  redis write:          ${latencies.redisWriteMs?.toFixed(3)} ms`);
  console.log(`  redis read:           ${latencies.redisReadMs?.toFixed(3)} ms`);
  console.log(`  L1 hit:               ${latencies.l1HitMs?.toFixed(3)} ms`);
  console.log(`  L1 miss + Redis:      ${latencies.l1MissPlusRedisMs?.toFixed(3)} ms`);

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
