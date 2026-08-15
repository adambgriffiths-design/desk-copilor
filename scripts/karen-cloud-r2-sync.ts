/**
 * Karen cloud R2 sync CLI — checksum inventory + append-only plan.
 *
 * Usage:
 *   npx tsx scripts/karen-cloud-r2-sync.ts --profile min-dev --inventory
 *   npx tsx scripts/karen-cloud-r2-sync.ts --profile min-dev --plan
 *   npx tsx scripts/karen-cloud-r2-sync.ts --profile min-dev --status
 *   npx tsx scripts/karen-cloud-r2-sync.ts --profile raw-append --inventory --max-files 3
 *
 * Never deletes local or remote. Does not invent credentials.
 * Throttled hashing to avoid starving DEV jobs.
 *
 * EDGE_CLAIM: NONE
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import {
  adamR2Checklist,
  loadR2Config,
  r2CredentialsStatus,
} from "../lib/cloud/r2-config";
import {
  buildInventory,
  formatAwsSyncHint,
  inventoryPath,
  planSync,
  syncStatePath,
  writeInventory,
  type SyncProfileName,
} from "../lib/cloud/checksum-sync";
import { resolveCacheRoot, resolveRepoRoot } from "../lib/karen-paths";

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

const PROFILES: SyncProfileName[] = [
  "min-dev",
  "normalized-full",
  "raw-append",
  "checkpoints",
  "experiments-dev",
];

async function main(): Promise<void> {
  const profileRaw = argValue("profile") ?? "min-dev";
  if (!PROFILES.includes(profileRaw as SyncProfileName)) {
    console.error(`Unknown profile: ${profileRaw}. Use: ${PROFILES.join("|")}`);
    process.exit(1);
  }
  const profile = profileRaw as SyncProfileName;
  const repoRoot = resolveRepoRoot();
  const maxFiles = argValue("max-files")
    ? Number(argValue("max-files"))
    : undefined;
  const throttleMs = Number(argValue("throttle-ms") ?? "8");

  const cfg = loadR2Config(repoRoot);
  const creds = r2CredentialsStatus(cfg);

  console.log(
    JSON.stringify(
      {
        EDGE_CLAIM: "NONE",
        HOLDOUT: "SEALED",
        profile,
        repoRoot,
        r2: {
          configured: creds.configured,
          missing: creds.missing,
          bucket: creds.bucket,
          endpointPresent: Boolean(creds.endpoint),
        },
        syncStatePath: syncStatePath(profile, repoRoot),
        inventoryPath: inventoryPath(profile, repoRoot),
      },
      null,
      2
    )
  );

  if (argFlag("status") && !argFlag("inventory") && !argFlag("plan")) {
    if (!creds.configured) {
      console.log("\nADAM_R2_CHECKLIST:");
      for (const line of adamR2Checklist()) console.log(`- ${line}`);
    }
    return;
  }

  if (argFlag("inventory") || argFlag("plan") || argFlag("hint")) {
    console.error(
      `[cloud-sync] building inventory profile=${profile} throttleMs=${throttleMs} (resource-aware)`
    );
    const inv = await buildInventory(profile, {
      repoRoot,
      throttleMsBetweenFiles: throttleMs,
      maxFiles: Number.isFinite(maxFiles) ? maxFiles : undefined,
    });
    const invPath = writeInventory(inv, repoRoot);
    console.log(
      JSON.stringify(
        {
          inventoryWritten: invPath,
          fileCount: inv.files.length,
          totalBytes: inv.totalBytes,
          totalMB: Number((inv.totalBytes / 1e6).toFixed(2)),
          aggregateSha256: inv.aggregateSha256,
        },
        null,
        2
      )
    );

    if (argFlag("plan") || argFlag("hint")) {
      const plan = planSync(inv, { repoRoot });
      const cache = resolveCacheRoot(repoRoot);
      const planPath = join(cache, "cloud-sync", profile, "plan.json");
      mkdirSync(dirname(planPath), { recursive: true });
      writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      console.log(
        JSON.stringify(
          {
            planWritten: planPath,
            toUpload: plan.toUpload.length,
            skipped: plan.skipped.length,
            conflicts: plan.conflicts.length,
            uploadMB: Number((plan.totalUploadBytes / 1e6).toFixed(2)),
          },
          null,
          2
        )
      );

      if (argFlag("hint") || !creds.configured) {
        const endpoint = creds.endpoint ?? cfg.endpoint;
        const bucket = creds.bucket ?? cfg.bucket;
        console.log("\n--- AWS CLI HINT (no --delete) ---\n");
        console.log(formatAwsSyncHint(plan, endpoint, bucket));
      }

      if (plan.conflicts.length) {
        console.error(
          `[cloud-sync] ${plan.conflicts.length} append-only conflicts (local hash changed vs previously uploaded). Do not overwrite remote without Adam break-glass.`
        );
      }
    }
  }

  if (!creds.configured) {
    console.log("\nADAM_R2_CHECKLIST:");
    for (const line of adamR2Checklist()) console.log(`- ${line}`);
    console.log(
      "\nREADY_NOTE: Inventory/plan can run without credentials. Upload blocked until R2 env is set."
    );
  } else {
    console.log(
      "\nREADY_NOTE: Credentials present in env. Run aws/rclone upload using plan.json; then mark state via karen-cloud-r2-sync --mark-uploaded (future) or append state.jsonl manually."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
