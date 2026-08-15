#!/usr/bin/env npx tsx
/**
 * Single-process live multi-task pilot — avoids concurrent supervisor CLI races.
 * Uses real runSupervisor() with file outbox + result-file completion.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { runSupervisor, SUPERVISOR_DATA_ROOT } from "../lib/supervisor";
import { createTaskQueue } from "../lib/supervisor/queue";
import { seedQueueFromBacklog } from "../lib/supervisor/next-task";
import { saveControlState } from "../lib/supervisor/control-state";
import { resultFilePath } from "../lib/supervisor/dispatcher";

const PILOT_ROOT = SUPERVISOR_DATA_ROOT;
const MAX_ITER = 5;
const MAX_PARALLEL = 2;

function ensurePilotRoot(): void {
  fs.mkdirSync(path.join(PILOT_ROOT, "results"), { recursive: true });
  fs.mkdirSync(path.join(PILOT_ROOT, "inbox"), { recursive: true });
  fs.mkdirSync(path.join(PILOT_ROOT, "outbox"), { recursive: true });
  const backlogIds = ["diag-research-replay", "audit-supervisor-health", "research-replay-record-check", "docs-supervisor-readme"];
  for (const id of backlogIds) {
    for (const sub of ["results", "inbox", "outbox"]) {
      const dir = path.join(PILOT_ROOT, sub);
      for (const f of fs.readdirSync(dir).filter((n) => n.startsWith(id))) {
        if (!f.includes("pre-live")) fs.renameSync(path.join(dir, f), path.join(dir, f + ".pre-pilot2"));
      }
    }
  }
  fs.writeFileSync(path.join(PILOT_ROOT, "queue.json"), JSON.stringify({ maxSize: 50, tasks: [] }, null, 2));
  if (fs.existsSync(path.join(PILOT_ROOT, "throughput.jsonl"))) {
    fs.renameSync(path.join(PILOT_ROOT, "throughput.jsonl"), path.join(PILOT_ROOT, "throughput.pre-pilot2.jsonl"));
  }
  saveControlState({ mode: "autonomous", terminateRunningRequested: false }, PILOT_ROOT);
}

function runNpmScript(script: string): { ok: boolean; output: string } {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npm, ["run", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 300_000,
  });
  return { ok: r.status === 0, output: `${r.stdout || ""}${r.stderr || ""}`.slice(-3000) };
}

function writeReport(taskId: string, body: string): void {
  const p = resultFilePath(taskId);
  fs.writeFileSync(p, body, "utf8");
  const now = Date.now();
  fs.utimesSync(p, now / 1000, now / 1000);
}

function executeRunningTask(task: {
  id: string;
  title?: string;
  verifyScript?: string;
  category?: string;
  prompt?: string;
  startedAt?: string;
}): void {
  const out = resultFilePath(task.id);
  if (fs.existsSync(out)) {
    const stat = fs.statSync(out);
    const dispatchMs = task.startedAt ? Date.parse(task.startedAt) : 0;
    if (dispatchMs && stat.mtimeMs >= dispatchMs - 1000) return;
  }

  if (task.id === "docs-supervisor-readme") {
    const readme = path.join(process.cwd(), "data/supervisor/README.md");
    let text = fs.readFileSync(readme, "utf8");
    if (!text.includes("Live pilot note")) {
      text += "\n\n## Live pilot note\n\nResult-file mtime gate prevents stale outbox pickup during live multi-task runs.\n";
      fs.writeFileSync(readme, text, "utf8");
    }
    writeReport(
      task.id,
      `# ${task.title}\n\n**Status:** COMPLETE\n\nUpdated data/supervisor/README.md with live pilot note.\n\nSTOP.\n`,
    );
    return;
  }

  if (task.verifyScript) {
    const { ok, output } = runNpmScript(task.verifyScript);
    const passLine = ok ? "All tests PASS." : "Tests did not PASS.";
    writeReport(
      task.id,
      `# ${task.title}\n\n**Status:** ${ok ? "COMPLETE" : "ERROR"}\n\nRan npm run ${task.verifyScript}.\n\n${passLine}\n\n\`\`\`\n${output.slice(-1500)}\n\`\`\`\n\nSTOP.\n`,
    );
    return;
  }

  if (task.category === "audit" || task.category === "diagnostic") {
    const suites = ["test:supervisor", "test:supervisor-queue"];
    const parts: string[] = [];
    let allOk = true;
    for (const s of suites) {
      const { ok, output } = runNpmScript(s);
      allOk &&= ok;
      parts.push(`${s}: ${ok ? "PASS" : "NOT PASS"}\n${output.slice(-400)}`);
    }
    writeReport(
      task.id,
      `# ${task.title}\n\n**Status:** ${allOk ? "COMPLETE" : "ERROR"}\n\nRead-only audit.\n\n${parts.join("\n\n")}\n\nSTOP.\n`,
    );
    return;
  }

  writeReport(
    task.id,
    `# ${task.title}\n\n**Status:** WAITING\n\nNo automated worker handler for this task category.\n\nSTOP.\n`,
  );
}

async function main(): Promise<void> {
  console.log("\n=== LIVE MULTI-TASK PILOT (single-process) ===\n");
  ensurePilotRoot();
  const queue = createTaskQueue({ root: PILOT_ROOT });
  seedQueueFromBacklog(queue);

  const handled = new Set<string>();
  const worker = setInterval(() => {
    for (const t of queue.getRunningTasks()) {
      if (handled.has(t.id)) continue;
      handled.add(t.id);
      console.log(`[worker] executing ${t.id}`);
      executeRunningTask(t);
    }
  }, 2000);

  const result = await runSupervisor({
    dryRun: false,
    autonomous: true,
    maxIterations: MAX_ITER,
    maxParallel: MAX_PARALLEL,
    pollIntervalMs: 3000,
    waitTimeoutMs: 300_000,
    projectRoot: process.cwd(),
  });

  clearInterval(worker);

  console.log("\n--- Iteration summary ---");
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
  console.log(`Pilot root: ${PILOT_ROOT}`);

  const throughput = fs.existsSync(path.join(PILOT_ROOT, "throughput.jsonl"))
    ? fs.readFileSync(path.join(PILOT_ROOT, "throughput.jsonl"), "utf8").trim().split("\n")
    : [];
  console.log(`Throughput batches: ${throughput.length}`);
  for (const line of throughput) console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
