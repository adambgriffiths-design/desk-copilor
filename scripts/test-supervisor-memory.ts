/**
 * Supervisor research memory — persistence and restart tests
 * Run: npm run test:supervisor-memory
 */
import fs from "fs";
import os from "os";
import path from "path";
import {
  createTaskQueue,
  loadMemorySnapshot,
  readMemoryFindings,
  readMemoryTasks,
  recordFinding,
  recordTaskOutcome,
  ResearchMemory,
  selectNextTask,
  shouldSkipTaskFromMemory,
  topicKeyForTask,
} from "../lib/supervisor";
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

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sup-mem-"));
}

const sampleTask: SupervisorTask = {
  id: "diag-research-replay",
  title: "Run research replay diagnostics",
  prompt: "READ-ONLY diagnostic",
  category: "diagnostic",
  verifyScript: "test:research-replay",
  allowedPaths: [],
  priority: 10,
  confidence: 0.95,
};

function testSnapshotPersistence() {
  console.log("\n1. memory.json snapshot persistence");
  const root = tempRoot();
  const mem = new ResearchMemory({ root });

  mem.recordTask(sampleTask, "completed", { summary: "All tests passed" });
  assert("memory.json exists", fs.existsSync(path.join(root, "memory.json")));
  assert("memory-tasks.jsonl exists", fs.existsSync(path.join(root, "memory-tasks.jsonl")));

  const reloaded = new ResearchMemory({ root });
  const snapshot = reloaded.load();
  assert("task in completed index", snapshot.taskIndex.completed.includes(sampleTask.id));
  assert(
    "verify topic investigated",
    snapshot.investigatedTopics.includes("verify:test:research-replay"),
  );

  fs.rmSync(root, { recursive: true, force: true });
}

function testRestartReload() {
  console.log("\n2. restart reloads memory from disk");
  const root = tempRoot();
  const first = new ResearchMemory({ root });
  first.recordTask(sampleTask, "completed");

  const second = new ResearchMemory({ root });
  const tasks = second.readTasks();
  assert("jsonl has one record", tasks.length === 1);
  assert("record status completed", tasks[0]?.status === "completed");

  recordFinding({
    topic: "supervisor",
    text: "Memory reload works after process restart",
    kind: "finding",
    taskId: sampleTask.id,
    root,
  });
  const findings = readMemoryFindings(root);
  assert("finding persisted", findings.some((f) => f.text.includes("Memory reload")));

  fs.rmSync(root, { recursive: true, force: true });
}

function testSkipCompletedTask() {
  console.log("\n3. next-task skips memory-completed tasks");
  const root = tempRoot();
  const queue = createTaskQueue({ root, maxSize: 10 });
  queue.create({
    id: sampleTask.id,
    prompt: sampleTask.prompt,
    reason: "seed",
    priority: 1,
    title: sampleTask.title,
    category: sampleTask.category,
    verifyScript: sampleTask.verifyScript,
  });

  const memory = new ResearchMemory({ root });
  memory.recordTask(sampleTask, "completed");

  const sel = selectNextTask({
    queue,
    consecutiveTestFailures: 0,
    consecutiveBuildFailures: 0,
    memory,
  });
  assert("no task returned", sel.task === null);
  assert("queue task auto-completed", queue.getTasks()[0]?.status === "completed");

  fs.rmSync(root, { recursive: true, force: true });
}

function testSkipInvestigatedTopic() {
  console.log("\n4. shouldSkipTaskFromMemory respects investigatedTopics");
  const root = tempRoot();
  const snapshot = loadMemorySnapshot(root);
  snapshot.investigatedTopics.push(topicKeyForTask(sampleTask));
  const mem = new ResearchMemory({ root });
  mem.save(snapshot);

  const skip = shouldSkipTaskFromMemory(sampleTask, mem.load());
  assert("skips investigated topic", skip.skip === true);

  fs.rmSync(root, { recursive: true, force: true });
}

function testFailedAndBlockedRecords() {
  console.log("\n5. failed and blocked task records");
  const root = tempRoot();
  const failedTask: SupervisorTask = { ...sampleTask, id: "fail-test" };
  const blockedTask: SupervisorTask = {
    ...sampleTask,
    id: "unsafe-deploy",
    prompt: "deploy to production",
    category: "diagnostic",
  };

  recordTaskOutcome({ task: failedTask, status: "failed", errorMessage: "TS error", root });
  recordTaskOutcome({ task: blockedTask, status: "blocked", stopReason: "deployment_proposed", root });

  const snapshot = loadMemorySnapshot(root);
  assert("failed indexed", snapshot.taskIndex.failed.includes("fail-test"));
  assert("blocked indexed", snapshot.taskIndex.blocked.includes("unsafe-deploy"));

  fs.rmSync(root, { recursive: true, force: true });
}

function testDefaultLimitations() {
  console.log("\n6. default known limitations seeded");
  const root = tempRoot();
  const snapshot = loadMemorySnapshot(root);
  assert("has limitations", snapshot.knownLimitations.length >= 3);
  fs.rmSync(root, { recursive: true, force: true });
}

async function main() {
  console.log("=== Supervisor memory tests ===");
  testSnapshotPersistence();
  testRestartReload();
  testSkipCompletedTask();
  testSkipInvestigatedTopic();
  testFailedAndBlockedRecords();
  testDefaultLimitations();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
