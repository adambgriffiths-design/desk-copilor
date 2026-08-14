#!/usr/bin/env npx tsx
/**
 * Honest baseline backtest — Phase 1 decision pipeline, no optimization.
 * Run: npm run research:baseline -- --dataset synthetic-ny-am
 *      npm run research:baseline -- --dataset nq-aug12-2026-cme [--train-end ...] [--test-start ...]
 */
import fs from "fs";
import { performance } from "perf_hooks";
import { exportBaselineRun, runBaselineBacktest } from "../lib/research/backtest/baseline";
import { runBaselineBacktestIncrementalById } from "../lib/research/backtest/incremental";
import { ensureResearchFixtures } from "../lib/research/replay/fixtures";

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
  const datasetId = args.dataset ?? "synthetic-ny-am";
  const trainEnd = args["train-end"];
  const testStart = args["test-start"];
  const trainRatio = args["train-ratio"] ? parseFloat(args["train-ratio"]) : undefined;
  const incremental = args.incremental === "true";
  const chunkSize = args["chunk-size"] ? parseInt(args["chunk-size"], 10) : 100;
  const resumeRunId = args.resume;

  ensureResearchFixtures();

  const runId = resumeRunId ?? `baseline-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.log(`Running honest baseline backtest on ${datasetId}${incremental ? " (incremental)" : ""}…`);

  const result = incremental
    ? runBaselineBacktestIncrementalById(
        runId,
        {
          datasetId,
          trainEnd,
          testStart,
          trainRatio,
        },
        { chunkSize, resumeRunId: resumeRunId ?? undefined },
        ({ phase, elapsedMs, detail }) => {
          const suffix = detail ? ` (${detail})` : "";
          console.log(`  [${phase}] ${elapsedMs}ms${suffix}`);
        }
      )
    : runBaselineBacktest(
        runId,
        {
          datasetId,
          trainEnd,
          testStart,
          trainRatio,
        },
        ({ phase, elapsedMs, detail }) => {
          const suffix = detail ? ` (${detail})` : "";
          console.log(`  [${phase}] ${elapsedMs}ms${suffix}`);
        }
      );

  let t0 = performance.now();
  const exported = exportBaselineRun(result);
  console.log(`  [export] ${Math.round(performance.now() - t0)}ms`);
  const test = result.periods.test.statistics;

  console.log("\n=== HONEST BASELINE BACKTEST ===");
  console.log(fs.readFileSync(exported.reportPath, "utf8").split("\n").slice(0, 45).join("\n"));
  console.log(`\n…(full report: ${exported.reportPath})`);
  console.log(`\nRun ID:     ${runId}`);
  console.log(`OOS setups: ${test.totalSetups} (WR ${(test.winRate * 100).toFixed(1)}%, exp ${test.expectancy.toFixed(3)} R)`);
  console.log(`Look-ahead: ${result.lookAheadTest.pass ? "PASS" : "FAIL"}`);
  console.log(`Repro:      ${result.reproducibility.pass ? "PASS" : "FAIL"}`);
  console.log(`Interpret:  ${result.interpretation}`);
  console.log(`Results:    ${exported.resultsPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
