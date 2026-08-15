/**
 * Result-driven next-task generator tests — deterministic, no AI.
 * Run: npm run test:supervisor-next-task
 */
import fs from "fs";
import os from "os";
import path from "path";
import { ALL_CURSOR_REPORT_FIXTURES } from "./next-task-fixtures";
import {
  generateAndEnqueueNextTask,
  generateNextTask,
} from "./next-task-generator";
import { proposeNextTaskDryRun, seedQueueForFixture } from "./next-task-proposal";
import { extractResultFields, parseMalformedResult } from "./result-parser";
import { MAX_TASK_PROMPT_CHARS } from "./quality-gate";
import { createTaskQueue } from "./queue";
import { ResearchMemory, recordTaskOutcome } from "./memory";
import { syntheticDryRunTasks } from "./next-task";
import type { SupervisorTask } from "./types";

type AssertFn = (name: string, cond: boolean, detail?: string) => void;

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-gen-"));
}

export async function runNextTaskGeneratorTests(assert: AssertFn): Promise<void> {
  console.log("\n18. result-driven next-task generator");

  await testFailingTestGeneratesFix(assert);
  await testExplicitFollowUp(assert);
  await testSuccessNoFollowUp(assert);
  await testMemoryDedupe(assert);
  await testMalformedResult(assert);
  await testDangerousBlocked(assert);
  await testOversizedBlocked(assert);
  await testEnqueuePersists(assert);
  await testExactlyOneTask(assert);
  await testNoNextTaskStops(assert);
  await testFixturesCompat(assert);
  await testExampleDecisions(assert);
}

async function testFailingTestGeneratesFix(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const task = syntheticDryRunTasks()[0]!;
  const result = await generateAndEnqueueNextTask({
    reportText: "Tests: FAIL — 3 failing tests\nBuild: PASS\nSTOP.",
    completedTask: task,
    queue,
  });
  assert("failing test → fix task", result.generated?.category === "test-fix");
  assert("fix task enqueued", result.enqueued === true);
  assert("exactly one pending", queue.getTasks().filter((t) => t.status === "pending").length === 1);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testExplicitFollowUp(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const audit = syntheticDryRunTasks()[1]!;
  const result = await generateNextTask({
    reportText: "Tests PASS\nTODO: Update data/supervisor/README.md with limitations.\nSTOP.",
    completedTask: audit,
    queue,
  });
  assert(
    "explicit follow-up → docs task",
    result.generated?.title.includes("README") ||
      result.generated?.id === "dry-3-docs" ||
      result.generated?.id === "docs-supervisor-readme",
    `got ${result.generated?.id} title=${result.generated?.title}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

async function testSuccessNoFollowUp(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const memory = new ResearchMemory({ root });
  const backlogIds = ["diag-research-replay", "audit-supervisor-health", "research-replay-record-check", "docs-supervisor-readme"];
  for (const id of backlogIds) {
    memory.recordTask({ id, title: id, prompt: "x", category: "diagnostic", priority: 99, confidence: 1 }, "completed");
  }
  const task: SupervisorTask = {
    id: "one-off-done",
    title: "One off",
    prompt: "READ-ONLY check lib/supervisor/. STOP.",
    category: "diagnostic",
    allowedPaths: ["lib/supervisor/"],
    priority: 1,
    confidence: 1,
  };
  const result = await generateNextTask({
    reportText: "=== REPORT ===\nAll PASS.\nNo follow-ups.\nSTOP.",
    completedTask: task,
    queue,
    memory,
  });
  assert("success no follow-up → NO_NEXT_TASK", result.stopReason === "no_next_task");
  fs.rmSync(root, { recursive: true, force: true });
}

async function testMemoryDedupe(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const memory = new ResearchMemory({ root });
  const task = syntheticDryRunTasks()[0]!;
  recordTaskOutcome({
    task: { ...task, verifyScript: "test:research-replay", category: "test-fix" },
    status: "completed",
    root,
  });
  const snapshot = memory.load();
  snapshot.investigatedTopics.push("verify:test:research-replay");
  memory.save(snapshot);

  const second = await generateAndEnqueueNextTask({
    reportText: "Tests: FAIL\nSTOP.",
    completedTask: task,
    queue,
    memory,
  });
  assert("memory skips repeated fix", !second.enqueued || second.reason.includes("memory") || second.reason.includes("investigated"));
  assert("no duplicate pending fix tasks", queue.getTasks().filter((t) => t.status === "pending" && t.category === "test-fix").length <= 1);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testMalformedResult(assert: AssertFn) {
  const fields = extractResultFields("");
  assert("malformed empty report", fields.malformed === true);
  const parsed = parseMalformedResult(null);
  assert("malformed parse safe", parsed.outcome === "UNKNOWN");

  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const task = syntheticDryRunTasks()[0]!;
  const result = await generateNextTask({
    reportText: "",
    completedTask: task,
    queue,
    rawStatus: "UNKNOWN",
  });
  assert("malformed → verify or no_next", result.generated?.title.includes("Verify") || result.stopReason === "no_next_task");
  fs.rmSync(root, { recursive: true, force: true });
}

async function testDangerousBlocked(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const task = syntheticDryRunTasks()[0]!;
  const result = await generateNextTask({
    reportText: "PASS\nNext step: deploy to production with npx vercel --prod\nSTOP.",
    completedTask: task,
    queue,
  });
  assert("dangerous report → stopped", result.stopped === true);
  assert("dangerous → deployment stop", result.stopReason === "deployment_proposed");
  fs.rmSync(root, { recursive: true, force: true });
}

async function testOversizedBlocked(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const hugeLine = "Update lib/supervisor/runner.ts — " + "x".repeat(MAX_TASK_PROMPT_CHARS);
  const result = await generateAndEnqueueNextTask({
    reportText: `Tests PASS\nFollow-up: ${hugeLine}\nSTOP.`,
    completedTask: syntheticDryRunTasks()[0]!,
    queue,
  });
  assert(
    "oversized blocked",
    result.blocked === true || result.stopReason === "task_quality_failed" || !result.enqueued,
    result.reason,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

async function testEnqueuePersists(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const task = syntheticDryRunTasks()[0]!;
  const result = await generateAndEnqueueNextTask({
    reportText: "Tests: FAIL\nSTOP.",
    completedTask: task,
    queue,
  });
  assert("enqueue succeeded", result.enqueued === true, result.reason);
  const reloaded = createTaskQueue({ root });
  const pending = reloaded.getTasks().filter((t) => t.status === "pending");
  assert("survives restart", pending.length > 0, `tasks=${JSON.stringify(reloaded.getTasks().map((t) => ({ id: t.id, status: t.status })))}`);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testExactlyOneTask(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const task = syntheticDryRunTasks()[0]!;
  const before = queue.getTasks().filter((t) => t.status === "pending").length;
  await generateAndEnqueueNextTask({
    reportText: "Build FAIL — error TS2345\nSTOP.",
    completedTask: task,
    queue,
  });
  const after = queue.getTasks().filter((t) => t.status === "pending").length;
  assert("exactly one task added", after - before === 1);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testNoNextTaskStops(assert: AssertFn) {
  const root = tempRoot();
  const queue = createTaskQueue({ root });
  const memory = new ResearchMemory({ root });
  for (const id of ["diag-research-replay", "audit-supervisor-health", "research-replay-record-check", "docs-supervisor-readme"]) {
    memory.recordTask({ id, title: id, prompt: "done", category: "docs", priority: 99, confidence: 1 }, "completed");
  }
  const result = await generateNextTask({
    reportText: "=== REPORT ===\nStatus: COMPLETE\nTests: PASS\nBuild: PASS\nNo follow-ups.\nSTOP.",
    completedTask: {
      id: "final",
      title: "Final",
      prompt: "READ-ONLY audit lib/supervisor/. STOP.",
      category: "diagnostic",
      allowedPaths: ["lib/supervisor/"],
      priority: 1,
      confidence: 1,
    },
    queue,
    memory,
  });
  assert("NO_NEXT_TASK stop reason", result.stopReason === "no_next_task");
  assert("no task generated", result.generated === null);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testFixturesCompat(assert: AssertFn) {
  for (const fixture of ALL_CURSOR_REPORT_FIXTURES) {
    const root = tempRoot();
    const queue = createTaskQueue({ root, maxSize: 50 });
    if (["complete-clean", "complete-with-todo", "fresh-queue-seed"].includes(fixture.name)) {
      seedQueueForFixture(queue, fixture.name);
    }
    const proposal = await proposeNextTaskDryRun({
      reportText: fixture.reportText,
      completedTask: fixture.completedTask,
      queue,
      rawStatus: fixture.rawStatus,
    });
    assert(`${fixture.name}: dryRun`, proposal.dryRun === true);
    if (fixture.expectStopReason) {
      assert(`${fixture.name}: stopReason`, proposal.stopReason === fixture.expectStopReason);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testExampleDecisions(assert: AssertFn) {
  const examples: Array<{ label: string; report: string; expect: string }> = [
    { label: "test-fail", report: "Tests: FAIL — 2 failing\nSTOP.", expect: "test-fix" },
    { label: "follow-up", report: "PASS\nFollow-up: Update data/supervisor/README.md\nSTOP.", expect: "docs" },
    { label: "clean", report: "Tests PASS\nBuild PASS\nSTOP.", expect: "backlog" },
  ];
  for (const ex of examples) {
    const root = tempRoot();
    const queue = createTaskQueue({ root });
    seedQueueForFixture(queue, "complete-clean");
    const gen = await generateNextTask({
      reportText: ex.report,
      completedTask: syntheticDryRunTasks()[0]!,
      queue,
    });
    console.log(`    [${ex.label}] rule=${gen.selectionRule ?? gen.stopReason} → ${gen.generated?.title ?? "(none)"}`);
    assert(`example ${ex.label} resolved`, gen.generated !== null || gen.stopReason === "no_next_task");
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  let passed = 0;
  let failed = 0;
  const assert: AssertFn = (name, cond, detail) => {
    if (cond) {
      passed++;
      console.log(`  ✓ ${name}`);
    } else {
      failed++;
      console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    }
  };
  console.log("=== Next-task generator tests ===");
  await runNextTaskGeneratorTests(assert);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("next-task-generator.test.ts");
if (isDirectRun) {
  void main();
}
