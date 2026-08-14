#!/usr/bin/env npx tsx
/**
 * Internal point-in-time replay CLI — not user-facing.
 * Run: npm run research:replay -- --dataset <id> --timestamp <ISO>
 *      npm run research:replay -- --fixture synthetic-ny-am --index 50
 */
import { ReplayDataCutoff, structureOneLiner } from "../lib/research/replay/cutoff";
import { ReplayEngine } from "../lib/research/replay/engine";
import { extractFeaturesAtCutoff } from "../lib/research/replay/features";
import { buildDeterministicKarenResponse } from "../lib/research/replay/karen";
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
  const karen = buildDeterministicKarenResponse(ctx, fixture, asOf);

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
    strategy: { id: "n/a", name: "point-in-time snapshot", parameters: {} },
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
  console.log(`Karen:     ${karen.pipelineVerdict} (${karen.source}) — ${karen.entryIdea}`);
  console.log(`Output:    ${snapshotPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
