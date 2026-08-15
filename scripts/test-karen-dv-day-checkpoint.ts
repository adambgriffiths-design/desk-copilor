/**
 * Lightweight unit tests: portable paths + day-checkpoint resume.
 * No historical replay. No network. No TickStream.
 *
 *   npx tsx scripts/test-karen-dv-day-checkpoint.ts
 *
 * EDGE_CLAIM NONE. HOLDOUT sealed.
 */
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createDayCheckpoint,
  fingerprintIdentity,
  hashConfig,
  isResumableCompletedDay,
  planResume,
  readDayCheckpoint,
  runDaysWithResume,
  writeDayCheckpoint,
  writeJobIndex,
  type CheckpointIdentity,
} from "../lib/decision-validation/day-checkpoint";
import { resolveRepoRoot, snapshotKarenPaths } from "../lib/karen-paths";
import { listKarenEnvCandidates, loadKarenEnv } from "../lib/karen-env";
import { loadTickstreamEnvFromRoot } from "./_load-tickstream-env";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    failed++;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "karen-dv-cp-"));
  const checkpointRoot = join(tmp, "checkpoints");
  mkdirSync(checkpointRoot, { recursive: true });

  try {
    // --- Path resolution smoke ---
    const root = resolveRepoRoot();
    assert(existsSync(join(root, "package.json")), "resolveRepoRoot finds package.json");
    const snap = snapshotKarenPaths();
    assert(snap.repoRoot === root, "snapshot repoRoot matches");
    assert(
      snap.dvCheckpointRoot.includes("checkpoints"),
      "dvCheckpointRoot under checkpoints"
    );

    const prevRepo = process.env.KAREN_REPO_ROOT;
    process.env.KAREN_REPO_ROOT = tmp;
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ name: "desk-copilot", private: true }),
      "utf8"
    );
    assert(resolveRepoRoot(join(tmp, "nested")) === tmp, "KAREN_REPO_ROOT override wins");
    if (prevRepo === undefined) delete process.env.KAREN_REPO_ROOT;
    else process.env.KAREN_REPO_ROOT = prevRepo;

    // --- Env discovery (no secrets logged) ---
    const candidates = listKarenEnvCandidates(root);
    assert(candidates.some((p) => p.endsWith(".env.local")), "env candidates include .env.local");
    assert(
      !candidates.some((p) =>
        /c:\/users\/adamg\/projects\/desk-copilot\/\.env\.local/i.test(p)
      ),
      "env candidates exclude hardcoded desktop path"
    );
    const loaded = loadTickstreamEnvFromRoot();
    assert(
      Array.isArray(loaded.envPathTried) && loaded.envPathTried.length > 0,
      "tickstream env tried paths"
    );
    const envSmoke = loadKarenEnv({ processEnvOnly: true });
    assert(envSmoke.repoRoot.length > 0, "loadKarenEnv processEnvOnly works");

    // --- Checkpoint + resume ---
    const identity: CheckpointIdentity = {
      jobId: "job-phase1-smoke",
      codeVersion: "testsha",
      baselineVersion: "baseline-v2",
      datasetVersion: "nq-history-archive-1m@v-test",
      split: "DEVELOPMENT",
      config: { cadenceMinutes: 5, lookbackDays: 10, workers: 2 },
    };

    assert(hashConfig(identity.config).length === 16, "configHash length 16");
    assert(fingerprintIdentity(identity).length === 24, "fingerprint length 24");

    const days = ["2024-01-03", "2024-01-02", "2024-01-04"];
    const plan0 = planResume(identity, days, checkpointRoot);
    assert(plan0.remainingDays.length === 3, "fresh plan has 3 remaining");
    assert(plan0.skipDays.length === 0, "fresh plan has 0 skip");
    assert(
      plan0.plannedDays[0] === "2024-01-02",
      "planned days sorted lexicographically"
    );

    const cpA = createDayCheckpoint(identity, "2024-01-02", {
      status: "completed",
      pitStatus: "PASS",
      asOfCount: 12,
      recordsHash: "abc123",
      wallMs: 5,
      resultSummary: { n: 12 },
    });
    writeDayCheckpoint(cpA, checkpointRoot);
    assert(
      readDayCheckpoint(identity.jobId, "2024-01-02", checkpointRoot)?.status ===
        "completed",
      "read back completed checkpoint"
    );

    const plan1 = planResume(identity, days, checkpointRoot);
    assert(plan1.skipDays.join(",") === "2024-01-02", "resume skips completed day");
    assert(
      plan1.remainingDays.join(",") === "2024-01-03,2024-01-04",
      "remaining after skip"
    );
    writeJobIndex(plan1, checkpointRoot);

    const other: CheckpointIdentity = {
      ...identity,
      config: { ...identity.config, cadenceMinutes: 15 },
    };
    assert(
      !isResumableCompletedDay(cpA, other),
      "config change invalidates resumable checkpoint"
    );

    let holdoutBlocked = false;
    try {
      createDayCheckpoint(
        { ...identity, split: "UNTOUCHED_HOLDOUT" },
        "2026-01-02",
        { status: "completed" }
      );
    } catch {
      holdoutBlocked = true;
    }
    assert(holdoutBlocked, "holdout checkpoint blocked without unlock");

    const prevUnlock = process.env.KAREN_HOLDOUT_UNLOCK;
    process.env.KAREN_HOLDOUT_UNLOCK = "1";
    const ho = createDayCheckpoint(
      { ...identity, split: "UNTOUCHED_HOLDOUT" },
      "2026-01-02",
      { status: "completed", recordsHash: "ho" }
    );
    assert(ho.split === "UNTOUCHED_HOLDOUT", "holdout allowed with unlock");
    if (prevUnlock === undefined) delete process.env.KAREN_HOLDOUT_UNLOCK;
    else process.env.KAREN_HOLDOUT_UNLOCK = prevUnlock;

    const ran: string[] = [];
    const { plan: plan2, results } = await runDaysWithResume({
      identity: { ...identity, jobId: "job-phase1-resume-run" },
      plannedDays: ["2024-02-01", "2024-02-02"],
      checkpointRoot,
      runDay: async (dayYmd) => {
        ran.push(dayYmd);
        return {
          pitStatus: "PASS" as const,
          asOfCount: 1,
          recordsHash: `h-${dayYmd}`,
          resultSummary: { dayYmd },
          result: { dayYmd },
        };
      },
    });
    assert(ran.join(",") === "2024-02-01,2024-02-02", "first run executes both days");
    assert(plan2.skipDays.length === 2, "after run both completed");

    const ran2: string[] = [];
    const { results: results2 } = await runDaysWithResume({
      identity: { ...identity, jobId: "job-phase1-resume-run" },
      plannedDays: ["2024-02-01", "2024-02-02", "2024-02-03"],
      checkpointRoot,
      runDay: async (dayYmd) => {
        ran2.push(dayYmd);
        return {
          pitStatus: "PASS" as const,
          asOfCount: 1,
          recordsHash: `h-${dayYmd}`,
          resultSummary: { dayYmd },
          result: { dayYmd },
        };
      },
    });
    assert(ran2.join(",") === "2024-02-03", "second run only executes new day");
    assert(
      results2.filter((r) => r.fromCheckpoint).length === 2,
      "two results from checkpoint"
    );
    assert(
      results2.map((r) => r.dayYmd).join(",") === "2024-02-01,2024-02-02,2024-02-03",
      "results sorted"
    );

    const failId: CheckpointIdentity = {
      ...identity,
      jobId: "job-phase1-fail",
    };
    writeDayCheckpoint(
      createDayCheckpoint(failId, "2024-03-01", {
        status: "failed",
        errorMessage: "boom",
      }),
      checkpointRoot
    );
    const planFail = planResume(failId, ["2024-03-01"], checkpointRoot);
    assert(planFail.remainingDays.includes("2024-03-01"), "failed day remains pending");
    assert(planFail.failedDays.includes("2024-03-01"), "failed day listed");

    console.log(`\nresults=${results.length} tmp=${tmp}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nALL PASS — day-checkpoint + portable paths");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
