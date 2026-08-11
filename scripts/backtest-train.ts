#!/usr/bin/env npx tsx
/**
 * Historical replay trainer — grades moments only; does NOT update learned rules.
 * To learn: npm run learn (hand-graded predict/live feedback only).
 *
 * Usage:
 *   npm run backtest:dry
 *   npm run backtest
 *   npm run backtest -- --force   # rerun all moments (replaces via dedupe)
 */
import { readFileSync } from "fs";
import path from "path";
import { runBacktestTraining } from "../lib/backtest-runner";

function loadEnvLocal() {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // optional
  }
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  if (args.includes("--learn")) {
    console.warn("Note: --learn removed from backtest (anti-overfit). Use: npm run learn");
  }

  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const maxIdx = args.indexOf("--max");
  const maxMoments = maxIdx >= 0 ? Number(args[maxIdx + 1]) : undefined;

  console.log("Desk Copilot — backtest trainer (replay only, no auto-learn)");
  console.log("Programmatic 1m chart + vision. Grades calls by outcome.\n");

  const result = await runBacktestTraining({
    dryRun,
    maxMoments: maxMoments && !Number.isNaN(maxMoments) ? maxMoments : undefined,
    skipExisting: !force,
    onProgress: (msg) => console.log(msg),
  });

  console.log("\n--- Summary ---");
  console.log(`Total moments available: ${result.moments}`);
  console.log(`Already graded (skipped): ${result.skippedExisting}`);
  console.log(`Ran this session:       ${result.ran}`);
  if (!result.dryRun) {
    console.log(`Graded:   ${result.graded} (skipped ${result.skipped}, misses ${result.misses ?? 0} — not failures)`);
    console.log(`Score:    ${result.correct} correct / ${result.partial} partial / ${result.wrong} wrong`);
    if (result.graded > 0) {
      const pct = Math.round((result.correct / result.graded) * 100);
      console.log(`Accuracy: ${pct}% on this run`);
    }
  }

  console.log("\nBacktest results are not fed into learning. Grade charts in predict mode, then: npm run learn");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
