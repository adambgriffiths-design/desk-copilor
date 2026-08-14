#!/usr/bin/env npx tsx
/**
 * Export one deterministic point-in-time research record.
 * Run: npm run research:replay-record -- --dataset nq-aug12-2026-cme --timestamp 2026-08-12T14:30:00.000Z
 */
import {
  assertNoFutureBarsInRecord,
  buildPointInTimeRecord,
  pointInTimeRecordFingerprint,
  savePointInTimeRecord,
} from "../lib/research/replay/records";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";

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
  const datasetId = args.dataset ?? args.fixture;
  const timestamp = args.timestamp;

  if (!datasetId || !timestamp) {
    console.error("Usage: npm run research:replay-record -- --dataset <id> --timestamp <ISO>");
    process.exit(1);
  }

  ensureResearchFixtures();
  const fixture = loadResearchDatasetFixture(datasetId);
  const record = buildPointInTimeRecord(fixture, timestamp);
  assertNoFutureBarsInRecord(record);

  const { filepath, fingerprint } = savePointInTimeRecord(record, datasetId);

  console.log(`\n=== Point-in-Time Research Record ===`);
  console.log(`Dataset:     ${datasetId}`);
  console.log(`Timestamp:   ${record.timestamp}`);
  console.log(`Price:       ${record.currentPrice}`);
  console.log(`Bars:        ${record.barCountAtCutoff}`);
  console.log(`Structure:   ${record.marketStructure.structureSummary}`);
  console.log(`Karen:       ${record.karen.pipelineVerdict} (${record.karen.source})`);
  console.log(`DataQuality: ${record.dataQuality.status}`);
  console.log(`Fingerprint: ${fingerprint.slice(0, 16)}…`);
  console.log(`Output:      ${filepath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
