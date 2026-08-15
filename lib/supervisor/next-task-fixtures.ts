import type { CursorReportFixture, SupervisorTask } from "./types";
import { syntheticDryRunTasks } from "./next-task";

const [DRY_DIAG, DRY_AUDIT, DRY_DOCS] = syntheticDryRunTasks();

export const FIXTURE_COMPLETE_CLEAN: CursorReportFixture = {
  name: "complete-clean",
  reportText: [
    "=== REPORT ===",
    "Task: Research replay diagnostic",
    "Tests: PASS (42 passed, 0 failed)",
    "Build: PASS",
    "No unfinished work.",
    "STOP.",
  ].join("\n"),
  completedTask: DRY_DIAG,
  expectStopped: false,
  expectEnqueued: false,
  expectProposalId: "dry-2-audit",
};

export const FIXTURE_COMPLETE_WITH_TODO: CursorReportFixture = {
  name: "complete-with-todo",
  reportText: [
    "=== REPORT ===",
    "Supervisor audit complete.",
    "Tests: PASS",
    "Build: PASS",
    "TODO: Update data/supervisor/README.md with detection limitations.",
    "STOP.",
  ].join("\n"),
  completedTask: DRY_AUDIT,
  expectStopped: false,
  expectEnqueued: false,
  expectProposalId: "dry-3-docs",
};

export const FIXTURE_ERROR_TEST_FAIL: CursorReportFixture = {
  name: "error-test-fail",
  reportText: [
    "=== REPORT ===",
    "Ran npm run test:research-replay",
    "Tests: FAIL — 3 failing tests in replay engine",
    "Build: PASS",
    "STOP after report.",
  ].join("\n"),
  completedTask: DRY_DIAG,
  expectStopped: false,
  expectEnqueued: true,
  expectProposalCategory: "test-fix",
};

export const FIXTURE_ERROR_BUILD_FAIL: CursorReportFixture = {
  name: "error-build-fail",
  reportText: [
    "=== REPORT ===",
    "Build FAIL — error TS2345 in lib/supervisor/runner.ts",
    "Tests: skipped",
    "STOP.",
  ].join("\n"),
  completedTask: DRY_AUDIT,
  expectStopped: false,
  expectEnqueued: true,
  expectProposalCategory: "build-fix",
};

export const FIXTURE_WAITING_HUMAN: CursorReportFixture = {
  name: "waiting-human",
  reportText: [
    "Investigation complete so far.",
    "Waiting for your approval before proceeding with the fix.",
  ].join("\n"),
  completedTask: DRY_DIAG,
  rawStatus: "COMPLETE",
  expectStopped: true,
  expectEnqueued: false,
  expectStopReason: "human_input_required",
};

export const FIXTURE_UNSAFE_DEPLOY: CursorReportFixture = {
  name: "unsafe-deploy",
  reportText: [
    "=== REPORT ===",
    "Diagnostics PASS.",
    "Next step: deploy to production with npx vercel --prod",
    "STOP.",
  ].join("\n"),
  completedTask: DRY_DIAG,
  expectStopped: true,
  expectEnqueued: false,
  expectStopReason: "deployment_proposed",
};

export const FIXTURE_FRESH_QUEUE: CursorReportFixture = {
  name: "fresh-queue-seed",
  reportText: [
    "=== SYNTHETIC REPORT ===",
    "Status: COMPLETE",
    "Tests: PASS (synthetic)",
    "Build: PASS (synthetic)",
    "STOP.",
  ].join("\n"),
  completedTask: DRY_DIAG,
  expectStopped: false,
  expectEnqueued: true,
  expectProposalId: "dry-2-audit",
};

export const ALL_CURSOR_REPORT_FIXTURES: CursorReportFixture[] = [
  FIXTURE_COMPLETE_CLEAN,
  FIXTURE_COMPLETE_WITH_TODO,
  FIXTURE_ERROR_TEST_FAIL,
  FIXTURE_ERROR_BUILD_FAIL,
  FIXTURE_WAITING_HUMAN,
  FIXTURE_UNSAFE_DEPLOY,
  FIXTURE_FRESH_QUEUE,
];

export function cursorReportFixtureByName(name: string): CursorReportFixture | undefined {
  return ALL_CURSOR_REPORT_FIXTURES.find((f) => f.name === name);
}

export { DRY_DIAG, DRY_AUDIT, DRY_DOCS };
