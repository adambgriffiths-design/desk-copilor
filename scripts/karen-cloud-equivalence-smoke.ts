/**
 * Tiny local↔cloud equivalence smoke (semantic hash).
 * Does NOT run full DEV / Y=1500. Uses micro-fixtures + day-checkpoint resume.
 *
 * Two-pass identical hash on this machine proves deterministic infra path.
 * When R2 pull is available later, compare remote bytes to golden hashes here.
 *
 * EDGE_CLAIM: NONE
 */
import { createHash } from "crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  createDayCheckpoint,
  fingerprintIdentity,
  planResume,
  runDaysWithResume,
  writeDayCheckpoint,
  type CheckpointIdentity,
} from "../lib/decision-validation/day-checkpoint";
import { resolveRepoRoot } from "../lib/karen-paths";
import { sha256File } from "../lib/cloud/checksum-sync";

function stableHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

async function runOnce(label: string): Promise<{
  label: string;
  semanticHash: string;
  fixtureHashes: Record<string, string>;
  resumeSkip: number;
  resumeRemaining: number;
}> {
  const repoRoot = resolveRepoRoot();
  const fixtures = [
    join(
      repoRoot,
      "data/karen-decision-validation/micro-fixtures/fixtures/micro-empty-session-hl-v0.json"
    ),
    join(
      repoRoot,
      "data/karen-decision-validation/micro-fixtures/fixtures/micro-pd-missing-lastprice-v0.json"
    ),
  ];
  for (const f of fixtures) {
    if (!existsSync(f)) throw new Error(`missing fixture: ${f}`);
  }

  const fixtureHashes: Record<string, string> = {};
  for (const f of fixtures) {
    const rel = f
      .replace(/\\/g, "/")
      .replace(repoRoot.replace(/\\/g, "/") + "/", "");
    fixtureHashes[rel] = await sha256File(f);
  }

  const checkpointRoot = mkdtempSync(join(tmpdir(), "karen-eq-smoke-"));
  const identity: CheckpointIdentity = {
    jobId: "equivalence-smoke-micro-v1",
    codeVersion: "cloud-infra-smoke",
    baselineVersion: "n/a-infra",
    datasetVersion: "micro-fixtures-v0",
    split: "DEVELOPMENT",
    config: { cadenceMinutes: 5, lookbackDays: 1, smokeAsOfCap: 2 },
  };

  const days = ["2024-01-02", "2024-01-03", "2024-01-04"];
  // Seed day 1 completed
  writeDayCheckpoint(
    createDayCheckpoint(identity, "2024-01-02", {
      status: "completed",
      pitStatus: "PASS",
      asOfCount: 2,
      recordsHash: "seed",
    }),
    checkpointRoot
  );

  const { plan, results } = await runDaysWithResume({
    identity,
    plannedDays: days,
    checkpointRoot,
    runDay: async (dayYmd) => ({
      pitStatus: "PASS" as const,
      asOfCount: 2,
      recordsHash: `hash-${dayYmd}`,
      resultSummary: { dayYmd, ok: true },
      result: { dayYmd, ok: true },
    }),
  });

  const resume = planResume(identity, days, checkpointRoot);
  const semanticHash = stableHash([
    fingerprintIdentity(identity),
    ...Object.entries(fixtureHashes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`),
    `skip=${plan.skipDays.join(",")}`,
    `remaining_initial=${plan.remainingDays.join(",")}`,
    `results=${results.map((r) => `${r.dayYmd}:${r.fromCheckpoint}`).join(",")}`,
    `finalSkip=${resume.skipDays.join(",")}`,
  ]);

  rmSync(checkpointRoot, { recursive: true, force: true });

  return {
    label,
    semanticHash,
    fixtureHashes,
    resumeSkip: resume.skipDays.length,
    resumeRemaining: resume.remainingDays.length,
  };
}

async function main(): Promise<void> {
  const a = await runOnce("pass-a");
  const b = await runOnce("pass-b");
  const identical = a.semanticHash === b.semanticHash;

  // Optional golden file if present
  const goldenPath = join(
    resolveRepoRoot(),
    "config/cloud/equivalence-smoke-golden.json"
  );
  let matchesGolden: boolean | null = null;
  if (existsSync(goldenPath)) {
    const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as {
      semanticHash?: string;
    };
    matchesGolden = golden.semanticHash === a.semanticHash;
  }

  const out = {
    EDGE_CLAIM: "NONE",
    ok: identical && a.resumeSkip === 3 && a.resumeRemaining === 0,
    identicalPasses: identical,
    matchesGolden,
    semanticHash: a.semanticHash,
    resumeSkip: a.resumeSkip,
    resumeRemaining: a.resumeRemaining,
    fixtureCount: Object.keys(a.fixtureHashes).length,
    note:
      "Local determinism smoke only. After R2 min-dev upload, re-pull on laptop and compare fixture sha256s to this report.",
  };
  console.log(JSON.stringify(out, null, 2));

  // Write golden if missing (first successful run becomes reference)
  if (!existsSync(goldenPath) && out.ok) {
    const { writeFileSync, mkdirSync } = await import("fs");
    const { dirname } = await import("path");
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(
      goldenPath,
      `${JSON.stringify(
        {
          version: "karen-equivalence-smoke-golden-v1",
          semanticHash: a.semanticHash,
          fixtureHashes: a.fixtureHashes,
          at: new Date().toISOString(),
          EDGE_CLAIM: "NONE",
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.error(`[equivalence-smoke] wrote golden ${goldenPath}`);
  }

  if (!out.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
