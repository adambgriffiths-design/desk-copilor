#!/usr/bin/env npx tsx
/**
 * Claim and complete supervisor inbox tasks for Cursor agents.
 *
 *   npm run supervisor:pickup              # claim oldest pending
 *   npm run supervisor:pickup -- --check   # list pending (no claim)
 *   npm run supervisor:pickup -- --watch   # refresh pending-pickup signal (daemon)
 *   npm run supervisor:pickup -- --complete --id TASK_ID
 *   npm run supervisor:pickup -- --fail --id TASK_ID --reason "..."
 *   npm run supervisor:pickup -- --release --id TASK_ID
 */
import { refreshPendingPickupSignal } from "../lib/supervisor/live-pickup";
import {
  claimNextPending,
  claimTaskById,
  formatPickupPrompt,
  getPickupDocumentation,
  getTaskPickupStatus,
  listPendingTasks,
  markTaskCompleted,
  markTaskFailed,
  releaseTaskClaim,
} from "../lib/supervisor/pickup";
import { ensureSupervisorDataRoot } from "../lib/supervisor";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]) {
  const check = argv.includes("--check");
  const watch = argv.includes("--watch");
  const complete = argv.includes("--complete");
  const fail = argv.includes("--fail");
  const release = argv.includes("--release");
  const idIdx = argv.findIndex((a) => a === "--id");
  const taskId = idIdx >= 0 ? argv[idIdx + 1] : undefined;
  const reasonIdx = argv.findIndex((a) => a === "--reason");
  const reason = reasonIdx >= 0 ? argv.slice(reasonIdx + 1).join(" ") : "Task failed";
  const byIdx = argv.findIndex((a) => a === "--by");
  const claimedBy = byIdx >= 0 ? argv[byIdx + 1] : undefined;
  const intervalIdx = argv.findIndex((a) => a === "--interval");
  const intervalMs = intervalIdx >= 0 ? parseInt(argv[intervalIdx + 1] ?? "5000", 10) : 5000;
  return { check, watch, complete, fail, release, taskId, reason, claimedBy, intervalMs };
}

async function runWatch(intervalMs: number): Promise<void> {
  console.log(`Watching supervisor inbox (every ${intervalMs}ms). Ctrl+C to stop.`);
  let lastKey = "";
  while (true) {
    const signal = refreshPendingPickupSignal();
    const key = signal ? `${signal.pendingCount}:${signal.oldest?.id}` : "idle";
    if (key !== lastKey) {
      console.log(JSON.stringify(signal ? { event: "pending", ...signal } : { event: "idle" }, null, 2));
      lastKey = key;
    }
    await sleep(intervalMs);
  }
}

function main() {
  ensureSupervisorDataRoot();
  const args = parseArgs(process.argv.slice(2));

  if (args.watch) {
    runWatch(args.intervalMs).catch((err) => {
      console.error(err);
      process.exit(1);
    });
    return;
  }

  if (args.check) {
    refreshPendingPickupSignal();
    const pending = listPendingTasks();
    console.log(JSON.stringify({ pending: pending.map((t) => ({ id: t.id, title: t.title })) }, null, 2));
    process.exit(pending.length ? 0 : 1);
  }

  if (args.release) {
    if (!args.taskId) {
      console.error("Missing --id for --release");
      process.exit(1);
    }
    const task = releaseTaskClaim(args.taskId);
    if (!task) {
      console.error(JSON.stringify({ released: false, id: args.taskId }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({ released: true, id: task.id, status: task.status }, null, 2));
    return;
  }

  if (args.complete) {
    if (!args.taskId) {
      console.error("Missing --id for --complete");
      process.exit(1);
    }
    const task = markTaskCompleted(args.taskId);
    console.log(JSON.stringify({ status: task.status, id: task.id, completedAt: task.completedAt }, null, 2));
    return;
  }

  if (args.fail) {
    if (!args.taskId) {
      console.error("Missing --id for --fail");
      process.exit(1);
    }
    const task = markTaskFailed(args.taskId, args.reason);
    console.log(JSON.stringify({ status: task.status, id: task.id, errorMessage: task.errorMessage }, null, 2));
    return;
  }

  const result = args.taskId
    ? claimTaskById(args.taskId, { claimedBy: args.claimedBy })
    : claimNextPending({ claimedBy: args.claimedBy });

  if (!result) {
    refreshPendingPickupSignal();
    console.log("No pending supervisor tasks.");
    console.log(getPickupDocumentation());
    process.exit(1);
  }

  if (!result.claimed || !result.task) {
    console.error(JSON.stringify({ claimed: false, reason: result.reason, id: args.taskId }, null, 2));
    process.exit(1);
  }

  refreshPendingPickupSignal();
  console.log(formatPickupPrompt(result.task));
}

main();
