#!/usr/bin/env npx tsx
/**
 * Cursor Research Supervisor CLI
 *
 *   npm run supervisor                              # default dry-run x3
 *   npm run supervisor -- --dry-run --autonomous --max-iterations 3
 *   npm run supervisor -- --live --autonomous --max-iterations 5
 *   npm run supervisor -- --watch                   # one-shot detect + log (prototype)
 */
import {
  detectFromCursorTranscripts,
  ensureSupervisorDataRoot,
  eventFingerprint,
  getDetectionDocumentation,
  getDispatcherDocumentation,
  getNextTaskDocumentation,
  getParallelSchedulerDocumentation,
  getAdaptiveConcurrencyDocumentation,
  getSafetyDocumentation,
  logDetection,
  runSupervisor,
} from "../lib/supervisor";

function parseArgs(argv: string[]) {
  const watch = argv.includes("--watch");
  const dryRun = argv.includes("--dry-run") || (!argv.includes("--live") && !watch);
  const autonomous = argv.includes("--autonomous") || argv.includes("--dry-run") || argv.includes("--live");
  const maxIdx = argv.findIndex((a) => a === "--max-iterations");
  const maxIterations = maxIdx >= 0 ? parseInt(argv[maxIdx + 1] ?? "5", 10) : dryRun ? 3 : 5;
  const parIdx = argv.findIndex((a) => a === "--max-parallel");
  const maxParallel = parIdx >= 0 ? parseInt(argv[parIdx + 1] ?? "1", 10) : undefined;
  const adaptive = argv.includes("--adaptive") || maxParallel === undefined;
  const multiTask = argv.includes("--multi-task") || (maxParallel !== undefined && maxParallel > 1);
  return {
    watch,
    dryRun,
    autonomous,
    maxIterations,
    maxParallel: multiTask && maxParallel !== undefined ? Math.max(2, maxParallel) : maxParallel,
    adaptiveConcurrency: adaptive && !watch,
  };
}

async function runWatchMode() {
  console.log("\n=== Supervisor watch (one-shot) ===\n");
  const detection = detectFromCursorTranscripts({ allowWaiting: true });
  const fp = eventFingerprint(detection);
  const { entry, written, duplicate } = logDetection(detection, fp);
  console.log(`Status: ${entry.status} (${detection.source})`);
  console.log(`Branch: ${entry.git.branch} — ${entry.git.statusSummary}`);
  console.log(`Logged: ${written ? "yes" : duplicate ? "duplicate skipped" : "no"}`);
  if (detection.limitations.length) {
    console.log("\nLimitations:");
    for (const l of detection.limitations) console.log(`  - ${l}`);
  }
}

async function runAutonomousMode(args: ReturnType<typeof parseArgs>) {
  console.log("\n=== Cursor Research Supervisor ===\n");
  console.log(`Mode: ${args.dryRun ? "DRY-RUN (synthetic)" : "LIVE (file outbox + transcript poll)"}`);
  console.log(`Autonomous: ${args.autonomous}`);
  console.log(`Max iterations: ${args.maxIterations}`);
  console.log(`Max parallel: ${args.maxParallel ?? "(adaptive)"}`);
  console.log(`Adaptive concurrency: ${args.adaptiveConcurrency}\n`);

  const result = await runSupervisor({
    dryRun: args.dryRun,
    autonomous: args.autonomous,
    maxIterations: args.maxIterations,
    maxParallel: args.maxParallel,
    adaptiveConcurrency: args.adaptiveConcurrency,
    pollIntervalMs: 5000,
    waitTimeoutMs: args.dryRun ? 1000 : 120_000,
    projectRoot: process.cwd(),
  });

  console.log("--- Iteration summary ---");
  for (const e of result.entries) {
    const task = e.taskIssued?.title ?? e.nextTask?.title ?? "(none)";
    console.log(
      `#${e.iteration} [${e.state}] ${task}` +
        (e.parsed ? ` outcome=${e.parsed.outcome}` : "") +
        (e.stopReason ? ` STOP:${e.stopReason}` : ""),
    );
  }
  console.log(`\nIterations: ${result.iterations}`);
  console.log(`Stop: ${result.stopReason ?? "done"}`);
  console.log(`Log: data/supervisor/executions.jsonl\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureSupervisorDataRoot();

  if (args.watch) {
    await runWatchMode();
  } else {
    await runAutonomousMode(args);
  }

  console.log(getDetectionDocumentation());
  console.log("\n" + getDispatcherDocumentation());
  console.log("\n" + getNextTaskDocumentation());
  console.log("\n" + getParallelSchedulerDocumentation());
  console.log("\n" + getAdaptiveConcurrencyDocumentation());
  console.log("\n" + getSafetyDocumentation());
  console.log("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
