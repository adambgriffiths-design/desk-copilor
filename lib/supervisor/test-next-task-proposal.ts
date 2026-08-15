/**
 * DRY-RUN next-task proposal tests — synthetic Cursor report fixtures only.
 * Run: npx tsx lib/supervisor/test-next-task-proposal.ts
 */
import fs from "fs";
import os from "os";
import path from "path";
import { ALL_CURSOR_REPORT_FIXTURES } from "./next-task-fixtures";
import {
  matchesExpectedCategory,
  proposeNextTaskDryRun,
  seedQueueForFixture,
} from "./next-task-proposal";
import { createTaskQueue } from "./queue";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function tempQueueDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-proposal-"));
}

async function testFixture(fixtureName: string) {
  const fixture = ALL_CURSOR_REPORT_FIXTURES.find((f) => f.name === fixtureName);
  if (!fixture) throw new Error(`missing fixture: ${fixtureName}`);

  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 50 });

  if (["complete-clean", "complete-with-todo", "fresh-queue-seed"].includes(fixture.name)) {
    seedQueueForFixture(queue, fixture.name);
  }

  const beforePending = queue.getTasks().filter((t) => t.status === "pending").length;
  const proposal = await proposeNextTaskDryRun({
    reportText: fixture.reportText,
    completedTask: fixture.completedTask,
    queue,
    rawStatus: fixture.rawStatus,
  });

  assert(`${fixture.name}: dryRun flag`, proposal.dryRun === true);
  assert(`${fixture.name}: stopped=${fixture.expectStopped ?? false}`, proposal.stopped === (fixture.expectStopped ?? false));

  if (fixture.expectStopReason) {
    assert(`${fixture.name}: stopReason`, proposal.stopReason === fixture.expectStopReason);
  }

  if (fixture.expectEnqueued !== undefined) {
    assert(`${fixture.name}: enqueued=${fixture.expectEnqueued}`, proposal.enqueued === fixture.expectEnqueued);
    const afterPending = queue.getTasks().filter((t) => t.status === "pending").length;
    const delta = afterPending - beforePending;
    assert(
      `${fixture.name}: pending delta`,
      fixture.expectEnqueued ? delta === 1 : delta === 0,
      `before=${beforePending} after=${afterPending}`,
    );
  }

  if (fixture.expectProposalId) {
    assert(
      `${fixture.name}: proposal id`,
      proposal.proposed?.id === fixture.expectProposalId,
      `got ${proposal.proposed?.id}`,
    );
  }

  if (fixture.expectProposalCategory) {
    assert(
      `${fixture.name}: proposal category`,
      matchesExpectedCategory(proposal.proposed, fixture.expectProposalCategory),
      `got ${proposal.proposed?.category}`,
    );
  }

  assert(`${fixture.name}: never claims running`, queue.getRunningTasks().length === 0);

  console.log(`    → ${proposal.reason}`);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testNeverDispatches() {
  console.log("\n8. proposal never marks task running");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  const fixture = ALL_CURSOR_REPORT_FIXTURES.find((f) => f.name === "error-test-fail")!;

  await proposeNextTaskDryRun({
    reportText: fixture.reportText,
    completedTask: fixture.completedTask,
    queue,
  });

  assert("no running tasks", queue.getRunningTasks().length === 0);
  assert("one pending added", queue.getTasks().filter((t) => t.status === "pending").length === 1);
  fs.rmSync(root, { recursive: true, force: true });
}

async function testNoDuplicateCompleted() {
  console.log("\n9. skips already-completed backlog id");
  const root = tempQueueDir();
  const queue = createTaskQueue({ root, maxSize: 10 });
  seedQueueForFixture(queue, "fresh-queue-seed");

  const freshFixture = ALL_CURSOR_REPORT_FIXTURES.find((f) => f.name === "fresh-queue-seed")!;
  const first = await proposeNextTaskDryRun({
    reportText: freshFixture.reportText,
    completedTask: freshFixture.completedTask,
    queue,
  });
  assert("first enqueues dry-2", first.enqueued && first.proposed?.id === "dry-2-audit");

  queue.markRunning("dry-2-audit");
  queue.complete("dry-2-audit");

  const second = await proposeNextTaskDryRun({
    reportText: "=== REPORT ===\nPASS\nSTOP.",
    completedTask: first.proposed!,
    queue,
  });
  assert("second proposes dry-3 not duplicate dry-2", second.proposed?.id === "dry-3-docs");
  fs.rmSync(root, { recursive: true, force: true });
}

async function testExampleProposals() {
  console.log("\n10. example proposals (preview)");
  const examples = [
    { name: "complete-clean", report: "Tests PASS\nBuild PASS\nSTOP." },
    { name: "test-fail", report: "Tests FAIL — 2 failing\nSTOP." },
    { name: "human-wait", report: "Waiting for your approval." },
  ];
  for (const ex of examples) {
    const root = tempQueueDir();
    const queue = createTaskQueue({ root, maxSize: 10 });
    const fixture = ALL_CURSOR_REPORT_FIXTURES[0]!;
    const p = await proposeNextTaskDryRun({ reportText: ex.report, completedTask: fixture.completedTask, queue });
    console.log(`    [${ex.name}] stopped=${p.stopped} enqueued=${p.enqueued} → ${p.proposed?.title ?? "(none)"}`);
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert("examples ran", true);
}

async function main() {
  console.log("=== DRY-RUN next-task proposal tests ===");
  for (const fixture of ALL_CURSOR_REPORT_FIXTURES) {
    console.log(`\n${fixture.name}`);
    await testFixture(fixture.name);
  }
  await testNeverDispatches();
  await testNoDuplicateCompleted();
  await testExampleProposals();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
