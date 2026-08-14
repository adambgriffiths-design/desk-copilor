#!/usr/bin/env npx tsx
/**
 * Preview mentor checkpoint plans — Mode A (framework) vs Mode B (responsiveness).
 * Run: npx tsx scripts/research-mentor-checkpoint-plan.ts [--dataset nq-aug12-2026-cme]
 */
import {
  compareCheckpointModes,
  selectFrameworkCheckpoints,
  selectResponsivenessCheckpoints,
} from "../lib/research/mentor/checkpoint-selection";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function main() {
  const datasetId = parseArg("dataset") ?? "nq-aug12-2026-cme";
  ensureResearchFixtures();
  const fixture = loadResearchDatasetFixture(datasetId);
  const comparison = compareCheckpointModes(fixture.m1);
  const modeA = selectFrameworkCheckpoints(fixture.m1);
  const modeB = selectResponsivenessCheckpoints(fixture.m1);

  console.log(
    JSON.stringify(
      {
        datasetId,
        barCount: fixture.m1.length,
        modes: {
          A_framework: {
            description: "Framework validation — ~12 session anchors/day",
            ...comparison.modeA,
          },
          B_responsiveness: {
            description: "Responsiveness coverage — RTH density + structure/regime strata",
            ...comparison.modeB,
          },
        },
        scalingBenchmark: comparison.scaling,
        sampleCutoffs: {
          modeA: modeA.slice(0, 3).map((c) => ({ asOf: c.asOf, label: c.label, stratum: c.stratum })),
          modeB: modeB.slice(0, 3).map((c) => ({ asOf: c.asOf, label: c.label, stratum: c.stratum })),
        },
      },
      null,
      2
    )
  );
}

main();
