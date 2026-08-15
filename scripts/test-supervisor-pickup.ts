/**
 * Supervisor inbox pickup tests
 * Run: npm run test:supervisor-pickup
 */
import fs from "fs";
import os from "os";
import path from "path";
import { dispatchTaskToCursor } from "../lib/supervisor/dispatcher";
import {
  claimNextPending,
  claimTaskById,
  getTaskPickupStatus,
  listPendingTasks,
  markTaskCompleted,
  markTaskFailed,
  releaseTaskClaim,
} from "../lib/supervisor/pickup";
import { refreshPendingPickupSignal } from "../lib/supervisor/live-pickup";
import type { SupervisorTask } from "../lib/supervisor/types";

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

function tempInboxRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-pickup-"));
}

function sampleTask(id: string): SupervisorTask {
  return {
    id,
    title: "Test pickup task",
    prompt: "READ-ONLY: report PASS. STOP.",
    category: "diagnostic",
    allowedPaths: [],
    priority: 1,
    confidence: 1,
  };
}

function testDispatchCreatesPending() {
  console.log("\n1. dispatch creates pending inbox task");
  const task = sampleTask(`pickup-test-${Date.now()}`);
  const { dispatched } = dispatchTaskToCursor(task);
  try {
    assert("inbox file exists", fs.existsSync(dispatched.inboxPath));
    const raw = JSON.parse(fs.readFileSync(dispatched.inboxPath, "utf8"));
    assert("status pending", raw.status === "pending");
  } finally {
    for (const p of [dispatched.inboxPath, dispatched.outboxPath]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
}

function testClaimExactlyOnce() {
  console.log("\n2. claim exactly once via atomic rename");
  const root = tempInboxRoot();
  const inboxDir = path.join(root, "inbox");
  fs.mkdirSync(inboxDir, { recursive: true });

  const task = sampleTask("pickup-test-2");
  const pendingPath = path.join(inboxDir, `${task.id}.json`);
  fs.writeFileSync(
    pendingPath,
    JSON.stringify(
      {
        id: task.id,
        status: "pending",
        dispatchedAt: new Date().toISOString(),
        title: task.title,
        prompt: task.prompt,
        category: task.category,
        instructions: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  const first = claimNextPending({ claimedBy: "test-agent", inboxDir });
  assert("first claim succeeds", first?.claimed === true);
  assert("status picked_up", first?.task?.status === "picked_up");
  assert("pending file gone", !fs.existsSync(pendingPath));
  assert("claimed file exists", fs.existsSync(path.join(inboxDir, `${task.id}.claimed.json`)));

  const second = claimNextPending({ inboxDir });
  assert("no second pending", second === null);
  const retry = claimTaskById(task.id, { inboxDir });
  assert("retry same id blocked", retry.claimed === false && retry.reason === "already_claimed");

  fs.rmSync(root, { recursive: true, force: true });
}

function testCompleteAndFailStates() {
  console.log("\n3. complete and fail state transitions");
  const root = tempInboxRoot();
  const inboxDir = path.join(root, "inbox");
  const resultsDir = path.join(root, "results");
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  const completeId = "pickup-test-complete";
  const failId = "pickup-test-fail";

  for (const [id] of [
    [completeId],
    [failId],
  ] as const) {
    fs.writeFileSync(
      path.join(inboxDir, `${id}.json`),
      JSON.stringify(
        {
          id,
          status: "pending",
          dispatchedAt: new Date().toISOString(),
          title: "t",
          prompt: "p",
          category: "diagnostic",
          instructions: [],
        },
        null,
        2,
      ),
      "utf8",
    );
    claimTaskById(id, { inboxDir, claimedBy: "test" });
  }

  markTaskCompleted(completeId, "=== REPORT ===\nPASS", inboxDir);
  assert("completed status", getTaskPickupStatus(completeId, inboxDir) === "completed");
  assert("completed suffix", fs.existsSync(path.join(inboxDir, `${completeId}.completed.json`)));

  markTaskFailed(failId, "build broke", inboxDir);
  assert("failed status", getTaskPickupStatus(failId, inboxDir) === "failed");

  fs.rmSync(root, { recursive: true, force: true });
}

function testListPendingOrdering() {
  console.log("\n4. list pending oldest first");
  const root = tempInboxRoot();
  const inboxDir = path.join(root, "inbox");
  fs.mkdirSync(inboxDir, { recursive: true });

  fs.writeFileSync(
    path.join(inboxDir, "b.json"),
    JSON.stringify(
      {
        id: "b",
        status: "pending",
        dispatchedAt: "2026-08-13T12:00:00.000Z",
        title: "b",
        prompt: "p",
        category: "audit",
        instructions: [],
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(inboxDir, "a.json"),
    JSON.stringify(
      {
        id: "a",
        status: "pending",
        dispatchedAt: "2026-08-13T11:00:00.000Z",
        title: "a",
        prompt: "p",
        category: "audit",
        instructions: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  const pending = listPendingTasks(inboxDir);
  assert("lists two", pending.length === 2);
  assert("oldest first", pending[0]?.id === "a");

  fs.writeFileSync(path.join(inboxDir, "a.completed.json"), "{}", "utf8");
  const afterComplete = listPendingTasks(inboxDir);
  assert("skips duplicate completed suffix", afterComplete.length === 1 && afterComplete[0]?.id === "b");
  fs.rmSync(root, { recursive: true, force: true });
}

function testPendingPickupSignal() {
  console.log("\n5. pending-pickup signal refresh");
  const root = tempInboxRoot();
  const inboxDir = path.join(root, "inbox");
  fs.mkdirSync(inboxDir, { recursive: true });

  assert("no signal when empty", refreshPendingPickupSignal(inboxDir) === null);

  fs.writeFileSync(
    path.join(inboxDir, "sig-a.json"),
    JSON.stringify(
      {
        id: "sig-a",
        status: "pending",
        dispatchedAt: "2026-08-13T10:00:00.000Z",
        title: "Signal test",
        prompt: "p",
        category: "diagnostic",
        instructions: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  const signal = refreshPendingPickupSignal(inboxDir);
  assert("signal has pending count", signal?.pendingCount === 1);
  assert("signal has oldest id", signal?.oldest?.id === "sig-a");

  refreshPendingPickupSignal(inboxDir);
  fs.rmSync(root, { recursive: true, force: true });
}

function testReleaseClaim() {
  console.log("\n6. release claim back to pending");
  const root = tempInboxRoot();
  const inboxDir = path.join(root, "inbox");
  fs.mkdirSync(inboxDir, { recursive: true });

  const taskId = "release-test";
  fs.writeFileSync(
    path.join(inboxDir, `${taskId}.json`),
    JSON.stringify(
      {
        id: taskId,
        status: "pending",
        dispatchedAt: new Date().toISOString(),
        title: "Release me",
        prompt: "p",
        category: "diagnostic",
        instructions: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  claimTaskById(taskId, { inboxDir, claimedBy: "test" });
  assert("claimed before release", getTaskPickupStatus(taskId, inboxDir) === "picked_up");

  const released = releaseTaskClaim(taskId, inboxDir);
  assert("release returns payload", released?.status === "pending");
  assert("pending after release", getTaskPickupStatus(taskId, inboxDir) === "pending");
  assert("claimed file gone", !fs.existsSync(path.join(inboxDir, `${taskId}.claimed.json`)));

  fs.rmSync(root, { recursive: true, force: true });
}

function main() {
  console.log("=== Supervisor pickup tests ===");
  testDispatchCreatesPending();
  testClaimExactlyOnce();
  testCompleteAndFailStates();
  testListPendingOrdering();
  testPendingPickupSignal();
  testReleaseClaim();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
