/**
 * Regression: research:replay authoritative path matches pipeline DecisionEnvelope.
 * Fixture: synthetic-ny-am @ index 50 — both WAIT / stance flat (no fabricated LONG/SHORT).
 *
 * Run: npm run test:karen-replay-decision-discrepancy
 */
import {
  buildDecisionEnvelope,
  validateDecisionEnvelope,
} from "../lib/decision-envelope";
import {
  formatMentorTradeSpoken,
  validateVisibleDecisionText,
} from "../lib/decision-contract-output";
import { buildMarketState } from "../lib/market-state-build";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { ReplayEngine } from "../lib/research/replay/engine";
import {
  buildDeterministicKarenResponse,
  buildKarenReplayResponse,
} from "../lib/research/replay/karen";
import {
  ensureResearchFixtures,
  loadReplayFixture,
} from "../lib/research/replay/fixtures";

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

function main() {
  console.log("\nKaren replay ↔ pipeline DecisionEnvelope (synthetic-ny-am @ 50)");
  console.log("  Authoritative paths must MATCH on WAIT / flat.\n");

  ensureResearchFixtures();
  const fixture = loadReplayFixture("synthetic-ny-am");
  const engine = new ReplayEngine(fixture, { initialIndex: 50 });
  const snap = engine.snapshot();
  const asOf = new Date(snap.asOf);
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();

  const { karen: replayKaren, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);
  const state = buildMarketState({
    ctx,
    chartLastPrice: m1.at(-1)?.close ?? ctx.daily.lastClose,
    chartLastPriceSource: "yahoo",
    symbol: ctx.symbol,
    chartSnapshot: buildResearchChartSnapshotFromBars({
      bars: m1,
      symbol: ctx.symbol,
      asOf,
      timeframe: "1",
    }),
  });
  const envelope = buildDecisionEnvelope(pipeline, ctx, state);
  const envelopeErrors = validateDecisionEnvelope(envelope);
  const spoken = formatMentorTradeSpoken(envelope);
  const spokenErrors = validateVisibleDecisionText(spoken, envelope);

  // NON-AUTHORITATIVE legacy (kept offline-only; must not drive replay result)
  const legacy = buildDeterministicKarenResponse(ctx, fixture, asOf);

  assert("same cutoff asOf", asOf.toISOString() === "2026-08-12T14:20:00.000Z", asOf.toISOString());
  assert("pipeline path → WAIT", replayKaren.pipelineVerdict === "WAIT", replayKaren.pipelineVerdict);
  assert("pipeline source tagged", replayKaren.source === "pipeline");
  assert("desk decision verdict WAIT", pipeline.decision.verdict === "WAIT", pipeline.decision.verdict);
  assert(
    "replay karen matches pipeline verdict",
    replayKaren.pipelineVerdict === pipeline.decision.verdict,
    `${replayKaren.pipelineVerdict} vs ${pipeline.decision.verdict}`
  );
  assert("envelope stance flat", envelope.stance === "flat", envelope.stance);
  assert("envelope tradeDirection NONE", envelope.read.tradeDirection === "NONE", envelope.read.tradeDirection);
  assert(
    "validateDecisionEnvelope 0 errors",
    envelopeErrors.length === 0,
    envelopeErrors.join("; ")
  );
  assert("mentor spoken matches envelope (no convert)", spokenErrors.length === 0, spokenErrors.join("; "));
  assert(
    "mentor names non-directional stance",
    /flat|wait|monitor/i.test(spoken),
    spoken.slice(0, 120)
  );
  assert(
    "no fabricated LONG/SHORT on authoritative replay",
    replayKaren.pipelineVerdict !== "LONG" && replayKaren.pipelineVerdict !== "SHORT",
    replayKaren.pipelineVerdict
  );
  assert(
    "legacy deterministic remains NON-AUTHORITATIVE (still directional)",
    legacy.source === "deterministic" &&
      (legacy.pipelineVerdict === "LONG" || legacy.pipelineVerdict === "SHORT"),
    `${legacy.source}/${legacy.pipelineVerdict}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
