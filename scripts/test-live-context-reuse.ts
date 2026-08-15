/**
 * Live market-context reuse — HIT vs FRESH identity + stale-protection.
 * npm run test:live-context-reuse
 */
import { loadReplayFixture } from "../lib/research/replay/fixtures";
import {
  assembleDeskMarketIntelligenceFromEngine,
  rememberLiveDeskIntelligenceCache,
  resetLiveDeskIntelligenceCache,
  tryReuseLiveDeskIntelligence,
} from "../lib/market-intelligence";
import {
  LIVE_CONTEXT_PRICE_EPS,
  buildLiveMarketReuseKey,
  decideLiveMarketReuse,
  fingerprintKarenInput,
  followUpClockAllowsReuse,
  formatLiveMarketReuseFingerprint,
  liveMarketSessionKey,
  resetSharedLiveEngine,
  syncLiveEngineFromFeed,
  type LiveMarketReuseKey,
} from "../lib/incremental-market-engine";
import { evaluateAnalysisQualityGate, resetQualityGateCache } from "../lib/analysis-quality-gate";
import { fingerprintEnvelope } from "../lib/research/architecture/fingerprint";
import type { DecisionEnvelope } from "../lib/decision-envelope";
import { tryDeterministicMentorFollowUp } from "../lib/chat-engine";
import { beginLiveLatency, snapshotLiveLatency } from "../lib/live-latency-profile";

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

function semanticEnvelope(env: DecisionEnvelope) {
  return {
    stance: env.stance,
    thesis: env.thesis,
    read: env.read,
    invalidation: env.invalidation,
    conflictLog: env.conflictLog,
    conflictResolution: {
      conflict: env.conflictResolution.conflict,
      between: env.conflictResolution.between,
      winner: env.conflictResolution.winner,
      stance: env.conflictResolution.stance,
      sentence: env.conflictResolution.sentence,
    },
    cited: env.citedConcepts,
    chain: env.reasoningChain.map((i) => ({
      concept: i.concept,
      detected: i.detected,
      usedInDecision: i.usedInDecision,
      role: i.role,
      outcome: i.outcome,
    })),
    logicOrder: env.logicOrder,
  };
}

function factsFingerprint(intel: { facts: Array<{ id: string; value: string; status: string }> }): string {
  return intel.facts
    .map((f) => `${f.id}=${f.value}|${f.status}`)
    .sort()
    .join(";");
}

function resetAll() {
  resetSharedLiveEngine();
  resetLiveDeskIntelligenceCache();
  resetQualityGateCache();
}

const fixture = loadReplayFixture("synthetic-ny-am");
const last = fixture.m1.at(-1)!;
const mid = fixture.m1[Math.min(40, fixture.m1.length - 2)]!;
const next = fixture.m1[Math.min(41, fixture.m1.length - 1)]!;

console.log("=== fingerprint / invalidation rules ===");
{
  const asOf = last.time;
  const a = buildLiveMarketReuseKey(fixture, asOf, last.close);
  const b = buildLiveMarketReuseKey(fixture, asOf, last.close);
  assert(decideLiveMarketReuse(a, b).hit, "identical inputs → HIT");
  assert(decideLiveMarketReuse(null, a).reason === "cold", "no prior snapshot → cold MISS");

  const newBar = buildLiveMarketReuseKey(fixture, next.time, next.close);
  const midKey = buildLiveMarketReuseKey(fixture, mid.time, mid.close);
  assert(decideLiveMarketReuse(midKey, newBar).reason === "bars", "new closed 1m bar → bars MISS");

  const pxHit = buildLiveMarketReuseKey(fixture, asOf, last.close + LIVE_CONTEXT_PRICE_EPS - 0.01);
  assert(decideLiveMarketReuse(a, pxHit).hit, `price < ${LIVE_CONTEXT_PRICE_EPS} tick → HIT`);
  const pxMiss = buildLiveMarketReuseKey(fixture, asOf, last.close + LIVE_CONTEXT_PRICE_EPS);
  assert(decideLiveMarketReuse(a, pxMiss).reason === "price", `price ≥ ${LIVE_CONTEXT_PRICE_EPS} → price MISS`);

  const formingNoise = {
    ...fixture,
    m1: fixture.m1.map((b, i) =>
      i === fixture.m1.length - 1 ? { ...b, close: b.close + 0.1, high: b.high + 0.1 } : b
    ),
  };
  const noisy = buildLiveMarketReuseKey(formingNoise, asOf, last.close);
  assert(decideLiveMarketReuse(a, noisy).hit, "forming-bar 0.10 OHLC noise with same last print → HIT");

  const sessA: LiveMarketReuseKey = { ...a, sessionKey: "ny_am|distribution|" };
  const sessB: LiveMarketReuseKey = { ...a, sessionKey: "ny_pm|distribution|" };
  assert(decideLiveMarketReuse(sessA, sessB).reason === "session", "session transition → session MISS");

  const now = new Date();
  assert(followUpClockAllowsReuse(liveMarketSessionKey(now), now.getTime(), now), "same wall-clock 1m allows follow-up reuse");
  assert(
    !followUpClockAllowsReuse(liveMarketSessionKey(now), now.getTime() - 120_000, now),
    "new minute since snapshot denies follow-up reuse"
  );
  assert(
    formatLiveMarketReuseFingerprint(a).includes("bars=") && formatLiveMarketReuseFingerprint(a).includes("session="),
    "fingerprint string documents bars + session + px"
  );
}

console.log("\n=== stale protection via shared live engine ===");
{
  resetAll();
  const asOf = last.time;
  const first = syncLiveEngineFromFeed({ data: fixture, asOf, lastPrice: last.close });
  assert(first.contextReuse === "miss", "cold sync is MISS");
  const second = syncLiveEngineFromFeed({ data: fixture, asOf, lastPrice: last.close });
  assert(second.contextReuse === "hit", "same bar → HIT");
  assert(fingerprintKarenInput(first.ctx) === fingerprintKarenInput(second.ctx), "HIT ctx fingerprint identical");

  const moved = syncLiveEngineFromFeed({
    data: fixture,
    asOf,
    lastPrice: last.close + 1.25,
  });
  assert(moved.contextReuse === "miss" && moved.contextReuseReason === "price", "relevant price change → MISS");

  resetAll();
  const atMid = syncLiveEngineFromFeed({ data: fixture, asOf: mid.time, lastPrice: mid.close });
  assert(atMid.contextReuse === "miss", "mid-bar cold MISS");
  const sameMid = syncLiveEngineFromFeed({ data: fixture, asOf: mid.time, lastPrice: mid.close });
  assert(sameMid.contextReuse === "hit", "same mid bar → HIT");
  const newClosed = syncLiveEngineFromFeed({ data: fixture, asOf: next.time, lastPrice: next.close });
  assert(newClosed.contextReuse === "miss" && newClosed.contextReuseReason === "bars", "new bar → MISS");

  resetAll();
  const afterLast = last.time;
  const firstNy = syncLiveEngineFromFeed({ data: fixture, asOf: afterLast, lastPrice: last.close });
  assert(firstNy.contextReuse === "miss", "session baseline");
  const nyPm = new Date("2026-08-12T17:40:00.000Z");
  const sess = syncLiveEngineFromFeed({ data: fixture, asOf: nyPm, lastPrice: last.close });
  assert(sess.contextReuse === "miss", "later clock session/AMD change → MISS");
  assert(sess.contextReuseReason === "session", "session MISS reason is session");
}

console.log("\n=== HIT vs FRESH REBUILD envelope identity ===");
{
  resetAll();
  const asOf = last.time;
  const px = last.close;
  const snapA = syncLiveEngineFromFeed({ data: fixture, asOf, lastPrice: px });
  const intelA = assembleDeskMarketIntelligenceFromEngine(snapA, { chartLastPrice: px });
  const gateA = evaluateAnalysisQualityGate(intelA);
  const envA = gateA.decisionEnvelope;
  assert(Boolean(envA), "fresh envelope present");

  const snapHit = syncLiveEngineFromFeed({ data: fixture, asOf, lastPrice: px });
  assert(snapHit.contextReuse === "hit", "second sync HIT");
  const intelHit = assembleDeskMarketIntelligenceFromEngine(snapHit, { chartLastPrice: px });
  resetQualityGateCache();
  const gateHit = evaluateAnalysisQualityGate(intelHit);
  const envHit = gateHit.decisionEnvelope;
  assert(Boolean(envHit), "HIT envelope present");

  resetAll();
  const snapFresh = syncLiveEngineFromFeed({ data: fixture, asOf, lastPrice: px });
  const intelFresh = assembleDeskMarketIntelligenceFromEngine(snapFresh, { chartLastPrice: px });
  const gateFresh = evaluateAnalysisQualityGate(intelFresh);
  const envFresh = gateFresh.decisionEnvelope;
  assert(Boolean(envFresh), "rebuild envelope present");

  assert(fingerprintKarenInput(snapA.ctx) === fingerprintKarenInput(snapHit.ctx), "HIT market context identical");
  assert(fingerprintKarenInput(snapA.ctx) === fingerprintKarenInput(snapFresh.ctx), "FRESH rebuild context identical");
  assert(factsFingerprint(intelA) === factsFingerprint(intelHit), "HIT facts/provenance identical");
  assert(factsFingerprint(intelA) === factsFingerprint(intelFresh), "FRESH facts/provenance identical");
  assert(intelA.observation.market_structure === intelFresh.observation.market_structure, "structure identical");
  assert(intelA.observation.htf_bias.tradeable_bias === intelFresh.observation.htf_bias.tradeable_bias, "HTF bias identical");
  assert(JSON.stringify(semanticEnvelope(envA!)) === JSON.stringify(semanticEnvelope(envHit!)), "HIT envelope semantic identical");
  assert(JSON.stringify(semanticEnvelope(envA!)) === JSON.stringify(semanticEnvelope(envFresh!)), "FRESH envelope semantic identical");
  assert(fingerprintEnvelope(envA!) === fingerprintEnvelope(envFresh!), "FRESH envelope fingerprint identical");
  assert(envA!.stance === envFresh!.stance, "stance identical");
  assert(envA!.read.tradeDirection === envFresh!.read.tradeDirection, "trade direction identical");
  assert(envA!.read.target === envFresh!.read.target, "target identical");
  assert(envA!.read.invalidation === envFresh!.read.invalidation, "invalidation identical");
  assert(JSON.stringify(envA!.thesis) === JSON.stringify(envFresh!.thesis), "thesis identical");
  assert(JSON.stringify(envA!.conflictLog) === JSON.stringify(envFresh!.conflictLog), "conflicts identical");
}

async function main() {
  console.log("\n=== follow-up reuses envelope without rebuild ===");
  resetAll();
  const asOf = last.time;
  const snap = syncLiveEngineFromFeed({ data: fixture, asOf, lastPrice: last.close });
  const intel = assembleDeskMarketIntelligenceFromEngine(snap, { chartLastPrice: last.close });
  const now = new Date();
  const key: LiveMarketReuseKey = {
    ...buildLiveMarketReuseKey(fixture, asOf, last.close),
    sessionKey: liveMarketSessionKey(now),
  };
  rememberLiveDeskIntelligenceCache(intel, key, now.getTime());
  const reused = tryReuseLiveDeskIntelligence(now);
  assert(reused === intel, "same-minute follow-up reuses intel object");

  rememberLiveDeskIntelligenceCache(intel, key, now.getTime() - 120_000);
  assert(tryReuseLiveDeskIntelligence(now) == null, "new minute follow-up does not reuse");

  rememberLiveDeskIntelligenceCache(intel, key, now.getTime());
  const messages = [
    { role: "user" as const, content: "Give me the read" },
    {
      role: "assistant" as const,
      content:
        "Not calling a long or short. Stay flat until the next clean one-minute displacement. TRADE DECISION: wait.",
    },
    { role: "user" as const, content: "Why not short?" },
  ];
  beginLiveLatency("followup-reuse-warmup");
  await tryDeterministicMentorFollowUp("Why not short?", messages, null);
  const tReuse = performance.now();
  const reusedAgain = tryReuseLiveDeskIntelligence(now);
  const reuseMs = performance.now() - tReuse;
  assert(reusedAgain === intel, "clock HIT reuses same intel");
  assert(reuseMs < 10, `tryReuseLiveDeskIntelligence <10ms (got ${reuseMs.toFixed(2)}ms)`);
  beginLiveLatency("followup-reuse-test");
  const t0 = performance.now();
  const spoken = await tryDeterministicMentorFollowUp("Why not short?", messages, null);
  const ms = performance.now() - t0;
  const prof = snapshotLiveLatency();
  assert(Boolean(spoken), "Why not short? returns structured reply");
  assert(ms < 100, `follow-up intelligence reuse <100ms after warmup (got ${ms.toFixed(1)}ms)`);
  assert(!prof?.counters.mentor_followup_intel, "did not rebuild intel");
  assert((prof?.counters.mentor_followup_reuse || 0) >= 1, "mentor_followup_reuse counted");
  assert((prof?.notes || []).includes("followup_rebuilds_intel=no"), "note says no rebuild");

  console.log("\n=== another chat message does not invalidate ===");
  {
    const a = buildLiveMarketReuseKey(fixture, asOf, last.close);
    const b = buildLiveMarketReuseKey(fixture, asOf, last.close);
    assert(decideLiveMarketReuse(a, b).hit, "fingerprint ignores conversation text");
  }

  console.log(`\ntest-live-context-reuse: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

