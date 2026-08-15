#!/usr/bin/env npx tsx
/**
 * First controlled historical experiment — frozen architecture-v1, checkpoint-based PIT replay.
 * Run: npm run research:historical-experiment [-- --dataset nq-week-aug05-aug12-2026-cme] [--dry-run] [--limit N]
 */
import fs from "fs";
import path from "path";
import {
  discoverAvailableDatasets,
  formatHistoricalExperimentReport,
  runHistoricalExperiment,
} from "../lib/research/architecture/historical-experiment";

function parseArgs(argv: string[]) {
  let dataset: string | undefined;
  let dryRun = false;
  let limit: number | undefined;
  let forwardBars: number | undefined;
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--dataset" && argv[i + 1]) dataset = argv[++i];
    else if (a === "--limit" && argv[i + 1]) limit = parseInt(argv[++i]!, 10);
    else if (a === "--forward-bars" && argv[i + 1]) forwardBars = parseInt(argv[++i]!, 10);
    else if (a === "--report" && argv[i + 1]) reportPath = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: research-run-historical-experiment [options]

Options:
  --dataset <alias>     Fixture alias (default: longest NQ on disk)
  --dry-run             Plan checkpoints + splits only — no pipeline eval
  --limit <n>           Cap checkpoints (smoke / debugging)
  --forward-bars <n>    Outcome forward window (default 30)
  --report <path>       Write markdown report (default: data/supervisor/results/research-first-historical-experiment.md)
  --help                Show this help
`);
      process.exit(0);
    }
  }
  return { dataset, dryRun, limit, forwardBars, reportPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const available = discoverAvailableDatasets();

  console.log("=== Historical research experiment (architecture-v1) ===\n");
  console.log("Available datasets:");
  for (const d of available) {
    console.log(`  - ${d.alias}: ${d.barCount} bars, ~${d.sessionDays} sessions — ${d.gapLabel}`);
  }
  console.log("");

  const result = runHistoricalExperiment({
    datasetAlias: args.dataset,
    dryRun: args.dryRun,
    maxCheckpoints: args.limit,
    forwardBarCount: args.forwardBars,
  });

  const report = formatHistoricalExperimentReport(result);
  const outPath =
    args.reportPath ??
    path.join(process.cwd(), "data", "supervisor", "results", "research-first-historical-experiment.md");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, report, "utf8");

  console.log(report);
  console.log(`\nReport written: ${outPath}`);
  console.log(`Run dir: ${result.runDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
