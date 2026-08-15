#!/usr/bin/env npx tsx
/**
 * Internal point-in-time replay CLI — not user-facing.
 * Authoritative Karen path: buildKarenReplayResponse → runDeskPipeline → DecisionEnvelope.
 * Run: npm run research:replay -- --dataset <id> --timestamp <ISO>
 *      npm run research:replay -- --fixture synthetic-ny-am --index 50
 */
import { buildDecisionEnvelope } from "../lib/decision-envelope";
import { buildMarketState } from "../lib/market-state-build";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";
import { ReplayDataCutoff, structureOneLiner } from "../lib/research/replay/cutoff";
import { ReplayEngine } from "../lib/research/replay/engine";
import { extractFeaturesAtCutoff } from "../lib/research/replay/features";
import { buildKarenReplayResponse } from "../lib/research/replay/karen";
import {
  ensureResearchFixtures,
  loadReplayFixture,
  loadResearchDatasetFixture,
} from "../lib/research/replay/fixtures";
import { buildRunId, writeRunManifest } from "../lib/research/manifest";
import { createRunDirectory } from "../lib/research/paths";
import fs from "fs";
import path from "path";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetId = args.dataset ?? args.fixture ?? "synthetic-ny-am";
  const timestamp = args.timestamp;
  const barIndex = args.index != null ? parseInt(args.index, 10) : undefined;

  ensureResearchFixtures();

  const fixture =
    args.dataset != null
      ? loadResearchDatasetFixture(datasetId)
      : loadReplayFixture(datasetId);

  let engine: ReplayEngine;
  if (timestamp) {
    engine = new ReplayEngine(fixture);
    engine.seekTo(timestamp);
  } else {
    engine = new ReplayEngine(fixture, { initialIndex: barIndex ?? 50 });
  }

  const snapshot = engine.snapshot();
  const asOf = new Date(snapshot.asOf);

  const cutoff = new ReplayDataCutoff(fixture, asOf);
  cutoff.assertNoFutureLeak();
  const ctx = cutoff.buildContext();
  const features = extractFeaturesAtCutoff(ctx, cutoff);
  const m1 = cutoff.slicedM1();
  const { karen, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);
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

  const runId = buildRunId("replay");
  const runDir = createRunDirectory(runId);

  const snapshotPayload = {
    runId,
    datasetId: fixture.id,
    asOf: snapshot.asOf,
    barIndex: engine.cursor,
    symbol: fixture.symbol,
    currentPrice: snapshot.currentPrice,
    structureSummary: structureOneLiner(ctx),
    features,
    karen,
    decision: {
      verdict: pipeline.decision.verdict,
      verdictReason: pipeline.decision.verdict_reason,
      entryZone: pipeline.decision.entry_zone,
      tradeDirection: envelope.read.tradeDirection,
      stance: envelope.stance,
      confidence: envelope.confidence,
      thesisComplete: envelope.thesis.complete,
    },
    barCountAtCutoff: snapshot.barCountAtCutoff,
  };

  const snapshotPath = path.join(runDir, "snapshot.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshotPayload, null, 2), "utf8");

  writeRunManifest({
    runId,
    runType: "replay",
    createdAt: new Date().toISOString(),
    gitHash: null,
    dataset: {
      id: fixture.id,
      symbol: fixture.symbol,
      barCount: fixture.m1.length,
      dateRange: {
        start: fixture.m1[0]!.time.toISOString(),
        end: fixture.m1.at(-1)!.time.toISOString(),
      },
    },
    strategy: {
      id: "desk-pipeline",
      name: "buildKarenReplayResponse / DecisionEnvelope",
      parameters: {},
    },
    sessionDefinition: "NY AM RTH (ICT session boundaries via buildMarketContextAt)",
    timeframe: "1m",
    window: { start: snapshot.asOf, end: snapshot.asOf },
    config: { barIndex: engine.cursor, datasetId },
    fingerprint: snapshot.asOf,
  });

  console.log(`\n=== Research Replay Snapshot ===`);
  console.log(`Run ID:    ${runId}`);
  console.log(`Dataset:   ${fixture.label ?? datasetId}`);
  console.log(`As-of:     ${snapshot.asOf}`);
  console.log(`Price:     ${snapshot.currentPrice}`);
  console.log(`Structure: ${structureOneLiner(ctx)}`);
  console.log(
    `Karen:     ${karen.pipelineVerdict} (${karen.source}) — ${karen.entryIdea}`
  );
  console.log(
    `Envelope:  stance=${envelope.stance} tradeDirection=${envelope.read.tradeDirection} confidence=${envelope.confidence}`
  );
  console.log(`Output:    ${snapshotPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
