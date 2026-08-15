/**
 * Research decision-architecture harness — no live TV, no production edits.
 * Run: npm run test:research-decision-architecture
 */
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES } from "../lib/replay-fixtures";
import { PLAYBOOK_CHAIN_CONCEPTS } from "../lib/decision-envelope";
import { buildSyntheticFixture } from "../lib/research/replay/fixtures";
import {
  ABLATION_CHANNELS,
  ARCHITECTURE_SNAPSHOTS,
  SEEDED_HYPOTHESES,
  ablateAllChannels,
  applyArchitectureOverlay,
  assertLabeledHorizons,
  assertNoSelectOnEval,
  assertProductionBaselineFrozen,
  buildDecisionTrace,
  buildMarketDecisionContext,
  compareArchitectures,
  computeDecisionQuality,
  cutoffContextFingerprintInputs,
  evidenceClassForDataset,
  fingerprintDecisionTrace,
  formatComparisonTable,
  formatVisualTrace,
  FROZEN_PRODUCTION_BASELINE,
  labelRichOutcomes,
  planTemporalSplits,
  poisonFuture,
  PRODUCTION_WEIGHTS,
  recordConceptRelationships,
  SEVEN_LAYERS,
  uniqueSessionDays,
  visualTraceHasRequiredHeaders,
  type QualityRow,
} from "../lib/research/architecture";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";

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

function testFreezeAndMap() {
  console.log("\n1. freeze + map current architecture");
  const freezeErr = assertProductionBaselineFrozen();
  assert("v1 frozen production identity", freezeErr.length === 0, freezeErr.join("; "));
  assert("v1 weights none", FROZEN_PRODUCTION_BASELINE.weights === "none");
  assert("production weights none", PRODUCTION_WEIGHTS === "none");
  assert("seven layers", SEVEN_LAYERS.length === 7);
  assert("v2/v3 not production", !ARCHITECTURE_SNAPSHOTS["architecture-v2"].production && !ARCHITECTURE_SNAPSHOTS["architecture-v3"].production);
}

function testHypotheses() {
  console.log("\n2. hypothesis registry");
  const ids = SEEDED_HYPOTHESES.map((h) => h.id);
  assert("seeds H-A H-B H-C", ids.includes("H-A") && ids.includes("H-B") && ids.includes("H-C"));
  assert(
    "all untested",
    SEEDED_HYPOTHESES.filter((h) => ["H-A", "H-B", "H-C"].includes(h.id)).every((h) => h.status === "UNTESTED")
  );
  assert("H-B maps to v2", SEEDED_HYPOTHESES.find((h) => h.id === "H-B")?.architectureVersion === "architecture-v2");
  assert("H-C maps to v3", SEEDED_HYPOTHESES.find((h) => h.id === "H-C")?.architectureVersion === "architecture-v3");
}

function testTraceFromEnvelope() {
  console.log("\n3. decision traces from existing envelope");
  const pipe = runDeskPipeline(REPLAY_FIXTURES["bullish-wait"].ctx, REPLAY_FIXTURES["bullish-wait"].state);
  const env = pipe.analysis_contract!.decision!;
  const trace = buildDecisionTrace({
    pipeline: pipe,
    envelope: env,
    architectureVersion: "architecture-v1",
    timestamp: "2026-08-12T14:30:00.000Z",
    datasetId: "replay-fixture-bullish-wait",
    symbol: "MNQ1!",
    overlayApplied: false,
    overlayReason: "identity",
    evidenceClass: "INFRASTRUCTURE",
    originalObservation: pipe.observation,
    ctx: REPLAY_FIXTURES["bullish-wait"].ctx,
  });
  assert("playbook concepts present", PLAYBOOK_CHAIN_CONCEPTS.every((id) => trace.concepts.some((c) => c.concept === id)));
  assert("detected vs used fields", trace.concepts.every((c) => typeof c.detected === "boolean" && typeof c.used === "boolean"));
  assert("horizons labeled", assertLabeledHorizons(trace).length === 0);
  assert("htf role context", trace.htfContext.role === "HTF_CONTEXT" && Boolean(trace.htfContext.lean));
  assert("tactical role", trace.tactical.role === "TACTICAL_TF");
  const ctx = buildMarketDecisionContext({
    observation: pipe.observation,
    ctx: REPLAY_FIXTURES["bullish-wait"].ctx,
    lastPrice: 25100,
  });
  const rel = recordConceptRelationships(trace, ctx);
  const visual = formatVisualTrace(trace, ctx, rel);
  assert("visual headers", visualTraceHasRequiredHeaders(visual));
  const fp1 = fingerprintDecisionTrace(trace);
  const fp2 = fingerprintDecisionTrace(trace);
  assert("fingerprint deterministic", fp1 === fp2 && fp1.length === 64);

  const overlay = applyArchitectureOverlay(pipe.observation, "architecture-v1");
  assert("v1 overlay identity", overlay.overlayApplied === false);
  return { pipe, trace, ctx };
}

function testAblationAndOutcomes(pipe: ReturnType<typeof runDeskPipeline>, trace: ReturnType<typeof buildDecisionTrace>) {
  console.log("\n4. ablation + outcomes (research clone)");
  const env = pipe.analysis_contract!.decision!;
  const ablations = ablateAllChannels({
    observation: pipe.observation,
    ctx: REPLAY_FIXTURES["bullish-wait"].ctx,
    dataQuality: pipe.data_quality_report,
    baselineVerdict: pipe.decision.verdict,
    baselineStance: env.stance,
  });
  assert("six ablation channels", ablations.length === ABLATION_CHANNELS.length);
  assert(
    "ablation does not mutate production obs",
    pipe.observation.htf_bias.tradeable_bias === pipe.observation.htf_bias.tradeable_bias
  );
  const fixture = buildSyntheticFixture();
  const forward = fixture.m1.slice(-20);
  const outcome = labelRichOutcomes({
    trace,
    forwardBars: forward,
    lastPrice: 25100,
    liquidityPrices: [25200, 24800],
  });
  assert("rich outcome has MFE/MAE", typeof outcome.mfe === "number" && typeof outcome.mae === "number");
  assert("not win-rate-only", "targetReached" in outcome && "invalidationReached" in outcome && "futureVol" in outcome);
}

function testSplitsPitQuality() {
  console.log("\n5. TRAIN/VAL/OOS + PIT poison + quality");
  const fixture = buildSyntheticFixture();
  const splits = planTemporalSplits(fixture.m1);
  const phases = splits.map((s) => s.phase);
  assert("temporal TRAIN", phases.includes("TRAIN"));
  assert("temporal VALIDATION", phases.includes("VALIDATION"));
  assert("temporal OOS", phases.includes("OOS"));
  assert("no shuffle (ordered)", splits[0]!.startIndex <= splits[1]!.startIndex);
  assert("forbid select-on-eval", assertNoSelectOnEval({ selectedArchitectureFrom: "OOS" }).length > 0);
  assert("allow no selection", assertNoSelectOnEval({ selectedArchitectureFrom: null }).length === 0);

  const asOf = fixture.m1[40]!.time;
  const base = cutoffContextFingerprintInputs(fixture, asOf);
  for (const kind of ["price", "swing", "sweep", "mss", "fvg", "liquidity"] as const) {
    const poisoned = poisonFuture(fixture, asOf, kind);
    const after = cutoffContextFingerprintInputs(poisoned, asOf);
    assert(`PIT poison ${kind} does not change cutoff at T`, JSON.stringify(base) === JSON.stringify(after));
    new ReplayDataCutoff(poisoned, asOf).assertNoFutureLeak();
  }

  const days = uniqueSessionDays(["2026-08-12T14:30:00.000Z", "2026-08-12T15:00:00.000Z"]);
  assert("single-day is 1", days === 1);
  assert(
    "single-day OOS is INFRASTRUCTURE not EDGE",
    evidenceClassForDataset({ uniqueSessionDays: 1, n: 100, phase: "OOS" }) === "INFRASTRUCTURE"
  );

  const rows: QualityRow[] = [];
  const metrics = computeDecisionQuality(rows);
  assert("empty quality flags insufficient", metrics.sampleAdequacy === "insufficient");
  assert("low-n note", /INFRASTRUCTURE/i.test(metrics.note));
}

function testComparisonSmoke() {
  console.log("\n6. architecture comparison table shape");
  const comparison = compareArchitectures({ evaluations: [] });
  assert("no architecture selected from eval", comparison.selectedArchitectureFrom === null);
  const table = formatComparisonTable(comparison);
  assert("table header includes quality columns", /dir%/.test(table) && /avoid%/.test(table) && /false conf/.test(table));
  assert("sample gap stated", /INFRASTRUCTURE EVIDENCE/.test(comparison.sampleGap));
}

console.log("=== Research decision-architecture harness ===");
testFreezeAndMap();
testHypotheses();
const { pipe, trace } = testTraceFromEnvelope();
testAblationAndOutcomes(pipe, trace);
testSplitsPitQuality();
testComparisonSmoke();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
