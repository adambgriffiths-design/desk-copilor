#!/usr/bin/env npx tsx
/**
 * Human override CLI for Cursor Research Supervisor.
 *
 *   npm run supervisor:control -- pause [--reason "…"]
 *   npm run supervisor:control -- stop [--reason "…"]
 *   npm run supervisor:control -- resume [--reason "…"]
 *   npm run supervisor:control -- status
 *   npm run supervisor:control -- takeover <taskId> [--reason "…"]
 *   npm run supervisor:control -- cancel <taskId> [--reason "…"]
 *   npm run supervisor:control -- priority --prompt "…" --reason "…" [--title "…"] [--category audit]
 */
import {
  cmdCancel,
  cmdPause,
  cmdPriority,
  cmdResume,
  cmdStatus,
  cmdStop,
  cmdTakeover,
  ensureSupervisorDataRoot,
  type TaskCategory,
} from "../lib/supervisor";

function flagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function parseReason(argv: string[]): string | undefined {
  return flagValue(argv, "--reason");
}

function usage(): never {
  console.error(`Usage:
  supervisor:control pause [--reason "…"]
  supervisor:control stop [--reason "…"]
  supervisor:control resume [--reason "…"]
  supervisor:control status
  supervisor:control takeover <taskId> [--reason "…"]
  supervisor:control cancel <taskId> [--reason "…"]
  supervisor:control priority --prompt "…" --reason "…" [--title "…"] [--category audit]`);
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command) usage();

  ensureSupervisorDataRoot();

  switch (command) {
    case "pause": {
      const state = cmdPause({ reason: parseReason(argv) });
      console.log(JSON.stringify({ ok: true, mode: state.mode, updatedAt: state.updatedAt }, null, 2));
      break;
    }
    case "stop": {
      const state = cmdStop({ reason: parseReason(argv) });
      console.log(JSON.stringify({ ok: true, mode: state.mode, updatedAt: state.updatedAt }, null, 2));
      break;
    }
    case "resume": {
      const state = cmdResume({ reason: parseReason(argv) });
      console.log(JSON.stringify({ ok: true, mode: state.mode, updatedAt: state.updatedAt }, null, 2));
      break;
    }
    case "status": {
      const report = cmdStatus();
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    case "takeover": {
      const taskId = argv[1];
      if (!taskId || taskId.startsWith("--")) usage();
      cmdTakeover(taskId, { reason: parseReason(argv) });
      console.log(JSON.stringify({ ok: true, taskId, humanControlled: true }, null, 2));
      break;
    }
    case "cancel": {
      const taskId = argv[1];
      if (!taskId || taskId.startsWith("--")) usage();
      cmdCancel(taskId, { reason: parseReason(argv) });
      console.log(JSON.stringify({ ok: true, taskId, cancelled: true }, null, 2));
      break;
    }
    case "priority": {
      const prompt = flagValue(argv, "--prompt");
      const reason = flagValue(argv, "--reason");
      if (!prompt || !reason) usage();
      const title = flagValue(argv, "--title");
      const category = flagValue(argv, "--category") as TaskCategory | undefined;
      const id = cmdPriority({
        prompt,
        reason,
        title,
        category,
        priority: 0,
        allowedPaths: ["lib/supervisor/"],
      });
      console.log(JSON.stringify({ ok: true, taskId: id, priority: 0 }, null, 2));
      break;
    }
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
