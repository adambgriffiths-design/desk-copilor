/**
 * Karen cloud holiday status — no secrets printed.
 * EDGE_CLAIM: NONE
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  adamR2Checklist,
  loadR2Config,
  r2CredentialsStatus,
} from "../lib/cloud/r2-config";
import { inventoryPath, syncStatePath } from "../lib/cloud/checksum-sync";
import {
  resolveCacheRoot,
  resolveRepoRoot,
  snapshotKarenPaths,
} from "../lib/karen-paths";

function toolPresent(cmd: string): boolean {
  try {
    const r =
      process.platform === "win32"
        ? spawnSync("where", [cmd], { encoding: "utf8" })
        : spawnSync("which", [cmd], { encoding: "utf8" });
    return r.status === 0;
  } catch {
    return false;
  }
}

function main(): void {
  const repoRoot = resolveRepoRoot();
  const paths = snapshotKarenPaths(repoRoot);
  const cfg = loadR2Config(repoRoot);
  const creds = r2CredentialsStatus(cfg);
  const minPack = join(resolveCacheRoot(repoRoot), "min-dev-pack", "MANIFEST.json");
  let minPackSummary: unknown = null;
  if (existsSync(minPack)) {
    const m = JSON.parse(readFileSync(minPack, "utf8")) as {
      totalMB?: number;
      missingRequired?: number;
    };
    minPackSummary = {
      present: true,
      totalMB: m.totalMB,
      missingRequired: m.missingRequired,
    };
  }

  const readinessGuess =
    creds.configured && minPackSummary
      ? "PARTIAL_until_VM_and_upload"
      : !creds.configured
        ? "BLOCKED_on_R2_credentials"
        : "PARTIAL";

  console.log(
    JSON.stringify(
      {
        EDGE_CLAIM: "NONE",
        HOLDOUT: "SEALED",
        RESEARCH_JOBS: "UNTOUCHED",
        paths,
        r2: {
          configured: creds.configured,
          missing: creds.missing,
          bucket: creds.bucket,
          placeholdersRemain: creds.placeholdersRemain,
        },
        tools: {
          awsCli: toolPresent("aws"),
          rclone: toolPresent("rclone"),
        },
        sync: {
          minDevInventory: existsSync(inventoryPath("min-dev", repoRoot)),
          minDevState: existsSync(syncStatePath("min-dev", repoRoot)),
          rawInventory: existsSync(inventoryPath("raw-append", repoRoot)),
        },
        minDevPack: minPackSummary ?? { present: false },
        readinessGuess,
        adamChecklist: creds.configured ? [] : adamR2Checklist(),
      },
      null,
      2
    )
  );
}

main();
