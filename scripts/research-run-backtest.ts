#!/usr/bin/env npx tsx
/**
 * Internal research backtest CLI — not user-facing.
 * Run: npm run research:backtest
 *      npx tsx scripts/research-run-backtest.ts --fixture synthetic-ny-am --strategy prior-session-high-break
 */
import {
  exportBacktestRun,
  getDemoStrategy,
  runBacktest,
} from "../lib/research/backtest";
import { buildRunId } from "../lib/research/manifest";
import { writeBacktestReport } from "../lib/research/report";
import { ensureResearchFixtures, loadReplayFixture } from "../lib/research/replay/fixtures";

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
  const fixtureId = args.fixture ?? "synthetic-ny-am";
  const strategyId = args.strategy ?? "prior-session-high-break";
  const format = (args.format === "jsonl" ? "jsonl" : "json") as "json" | "jsonl";
  const stdoutOnly = args.stdout === "true";

  ensureResearchFixtures();
  const strategy = getDemoStrategy(strategyId);
  if (!strategy) {
    console.error(`Unknown strategy: ${strategyId}`);
    process.exit(1);
  }

  const fixture = loadReplayFixture(fixtureId);
  const config = {
    dataset: {
      id: fixture.id,
      symbol: fixture.symbol,
      m1: fixture.m1,
      daily: fixture.daily,
      m5: fixture.m5,
      m15: fixture.m15,
    },
    strategy,
  };

  console.log(`Running backtest: ${strategy.name} on ${fixture.label ?? fixtureId}…`);
  const result = runBacktest(config);
  const runId = buildRunId("backtest");

  if (stdoutOnly) {
    console.log(JSON.stringify({ runId, statistics: result.statistics, setupCount: result.setups.length }, null, 2));
    return;
  }

  const exported = exportBacktestRun(result, config, runId, format);
  const { reportPath, markdown } = writeBacktestReport(runId, result, exported.manifest);

  console.log(`\n=== Research Backtest Complete ===`);
  console.log(`Run ID:      ${runId}`);
  console.log(`Setups:      ${result.setups.length}`);
  console.log(`Win rate:    ${(result.statistics.winRate * 100).toFixed(1)}%`);
  console.log(`Expectancy:  ${result.statistics.expectancy.toFixed(3)} R`);
  console.log(`Fingerprint: ${exported.fingerprint}`);
  console.log(`Results:     ${exported.resultsPath}`);
  console.log(`Manifest:    ${exported.manifestPath}`);
  console.log(`Report:      ${reportPath}`);
  console.log(`\n--- Report preview ---\n`);
  console.log(markdown.split("\n").slice(0, 20).join("\n"));
  console.log(`\n…(full report at ${reportPath})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
