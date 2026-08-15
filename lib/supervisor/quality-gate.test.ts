import type { SupervisorTask } from "./types";
import {
  assessTaskQuality,
  MAX_TASK_PROMPT_CHARS,
  qualityGateBlockMessage,
  shouldBlockBeforeDispatch,
} from "./quality-gate";

function baseTask(overrides: Partial<SupervisorTask> = {}): SupervisorTask {
  return {
    id: "test-task",
    title: "Run supervisor diagnostics",
    prompt: "READ-ONLY: Run npm run test:supervisor in lib/supervisor/. Report only. STOP.",
    category: "diagnostic",
    allowedPaths: ["lib/supervisor/"],
    priority: 1,
    confidence: 1,
    ...overrides,
  };
}

export function runQualityGateTests(assert: (name: string, cond: boolean, detail?: string) => void): void {
  console.log("\n17. task quality gate (pre-dispatch)");

  const good = assessTaskQuality(baseTask());
  assert("valid task passes", good.passed === true);

  const emptyPrompt = assessTaskQuality(baseTask({ prompt: "   " }));
  assert("rejects empty prompt", emptyPrompt.rejection === "empty");

  const emptyTitle = assessTaskQuality(baseTask({ title: "" }));
  assert("rejects empty title", emptyTitle.rejection === "empty");

  const duplicate = assessTaskQuality(baseTask({ id: "dup-new" }), {
    existingTasks: [{ id: "dup-old", prompt: baseTask().prompt }],
  });
  assert("rejects duplicated prompt", duplicate.rejection === "duplicated");

  const uniquePrompt = assessTaskQuality(
    baseTask({
      id: "same-id",
      prompt: "READ-ONLY: Run npm run test:supervisor in lib/supervisor/. STOP.",
    }),
    {
      existingTasks: [
        {
          id: "same-id",
          prompt: "READ-ONLY: Run npm run test:supervisor in lib/supervisor/. STOP.",
        },
      ],
    },
  );
  assert("same id is not duplicate", uniquePrompt.passed === true);

  const large = assessTaskQuality(baseTask({ prompt: "x".repeat(MAX_TASK_PROMPT_CHARS + 1) }));
  assert("rejects excessively large prompt", large.rejection === "excessively_large");

  const noObjective = assessTaskQuality(
    baseTask({
      title: "Supervisor notes",
      prompt: "Some background context about the project without directives.",
    }),
  );
  assert("rejects missing objective", noObjective.rejection === "missing_objective");

  const noScope = assessTaskQuality(
    baseTask({
      prompt: "Investigate the failing behavior and summarize findings.",
      allowedPaths: undefined,
      verifyScript: undefined,
    }),
  );
  assert("rejects missing scope", noScope.rejection === "missing_scope");

  const commitRequest = assessTaskQuality(
    baseTask({ prompt: "Fix lib/supervisor/quality-gate.ts then create a git commit and push." }),
  );
  assert("rejects commit/push/deploy request", commitRequest.rejection === "commit_push_deploy_requested");

  const deployRequest = assessTaskQuality(
    baseTask({ prompt: "Update lib/supervisor/runner.ts and deploy to production with npx vercel." }),
  );
  assert("rejects deploy request", deployRequest.rejection === "commit_push_deploy_requested");

  const negatedDeploy = assessTaskQuality(
    baseTask({ prompt: "READ-ONLY audit lib/supervisor/. Do not commit, push, or deploy. STOP." }),
  );
  assert("allows negated commit/push/deploy", negatedDeploy.passed === true);

  const broadProduction = assessTaskQuality(
    baseTask({
      prompt: "Refactor entire lib/karen/ trading logic across the entire codebase. STOP.",
      allowedPaths: ["lib/karen/"],
    }),
  );
  assert("rejects broad production change", broadProduction.rejection === "broad_production_change");

  const protectedPath = assessTaskQuality(
    baseTask({
      prompt: "Update lib/tickstream/historical.ts with new fallback rules. STOP.",
      allowedPaths: ["lib/tickstream/"],
    }),
  );
  assert("rejects protected allowedPaths", protectedPath.rejection === "broad_production_change");

  assert(
    "block message format",
    qualityGateBlockMessage("empty") === "quality_gate:empty" &&
      shouldBlockBeforeDispatch(baseTask({ prompt: "" })) === "empty",
  );
}
