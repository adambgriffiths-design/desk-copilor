/**
 * Append-only R2 autosync between desktop and laptop.
 *
 * Never --delete. Never touches experiments/sealed/holdout or raw/.
 * Never prints secret values.
 *
 *   npx tsx scripts/karen-cloud-r2-autosync.ts --role laptop
 *   npx tsx scripts/karen-cloud-r2-autosync.ts --role desktop
 *   npx tsx scripts/karen-cloud-r2-autosync.ts --role laptop --dry-run
 *
 * EDGE_CLAIM: NONE
 */
import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { loadR2Config, r2CredentialsStatus } from "../lib/cloud/r2-config";
import { resolveCacheRoot, resolveRepoRoot } from "../lib/karen-paths";

type Role = "laptop" | "desktop";
type Direction = "pull" | "push";

type Pair = {
  name: string;
  localRel: string;
  remotePrefix: string;
  direction: Direction;
};

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function pairsFor(role: Role): Pair[] {
  const normalized: Pair = {
    name: "normalized-1m",
    localRel: "data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m",
    remotePrefix: "normalized/nq-history-archive-1m/",
    direction: "pull",
  };
  const fixtures: Pair = {
    name: "micro-fixtures",
    localRel: "data/karen-decision-validation/micro-fixtures",
    remotePrefix: "experiments/dev/micro-fixtures/",
    direction: "pull",
  };
  const checkpoints: Pair = {
    name: "checkpoints",
    localRel: "data/karen-decision-validation/acquisition/checkpoints",
    remotePrefix: "checkpoints/",
    direction: "pull",
  };
  const supervisor: Pair = {
    name: "supervisor",
    localRel: "data/supervisor",
    remotePrefix: "experiments/dev/supervisor/",
    direction: "pull",
  };

  if (role === "laptop") {
    return [
      normalized,
      fixtures,
      checkpoints,
      supervisor,
      { ...checkpoints, direction: "push" },
      { ...supervisor, direction: "push" },
      { ...fixtures, direction: "push" },
    ];
  }

  return [
    { ...normalized, direction: "push" },
    { ...fixtures, direction: "push" },
    checkpoints,
    supervisor,
    { ...checkpoints, direction: "push" },
    { ...supervisor, direction: "push" },
    { ...fixtures, direction: "pull" },
  ];
}

function findAws(): string {
  if (process.platform === "win32") {
    const bundled = "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe";
    if (existsSync(bundled)) return bundled;
  }
  const r = spawnSync(process.platform === "win32" ? "where" : "which", ["aws"], {
    encoding: "utf8",
  });
  const first = r.stdout?.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  if (first) return first;
  throw new Error("aws CLI not found");
}

function countTransfers(text: string): { upload: number; download: number } {
  return {
    upload: (text.match(/^upload:/gm) ?? []).length,
    download: (text.match(/^download:/gm) ?? []).length,
  };
}

function main(): void {
  const roleRaw = argValue("role") ?? "laptop";
  if (roleRaw !== "laptop" && roleRaw !== "desktop") {
    console.error("Usage: --role laptop|desktop [--dry-run]");
    process.exit(1);
  }
  const role = roleRaw as Role;
  const dryRun = argFlag("dry-run");
  const repoRoot = resolveRepoRoot();
  const cfg = loadR2Config(repoRoot);
  const creds = r2CredentialsStatus(cfg);
  if (!creds.configured || !creds.bucket || !creds.endpoint) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "R2 credentials not configured",
        missing: creds.missing,
      })
    );
    process.exit(1);
  }

  const aws = findAws();
  const bucket = creds.bucket;
  const endpoint = creds.endpoint;
  const results: Array<{
    name: string;
    direction: Direction;
    ok: boolean;
    upload: number;
    download: number;
    error?: string;
  }> = [];

  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.KAREN_R2_ACCESS_KEY_ID ?? "",
    AWS_SECRET_ACCESS_KEY: process.env.KAREN_R2_SECRET_ACCESS_KEY ?? "",
    AWS_DEFAULT_REGION: process.env.KAREN_R2_REGION?.trim() || "auto",
  };

  for (const pair of pairsFor(role)) {
    const local = join(repoRoot, pair.localRel);
    mkdirSync(local, { recursive: true });
    const remote = `s3://${bucket}/${pair.remotePrefix}`;
    const src = pair.direction === "pull" ? remote : local;
    const dst = pair.direction === "pull" ? local : remote;
    const args = [
      "s3",
      "sync",
      src,
      dst,
      "--endpoint-url",
      endpoint,
      "--region",
      "auto",
      "--exclude",
      "**/sealed/**",
      "--exclude",
      "**/*holdout*",
      "--exclude",
      "**/.env*",
    ];
    if (dryRun) args.push("--dryrun");
    if (args.includes("--delete") || args.includes("rm")) {
      throw new Error("refusing destructive aws invocation");
    }

    const spawned = spawnSync(aws, args, {
      encoding: "utf8",
      env,
      windowsHide: true,
    });
    const out = `${spawned.stdout ?? ""}${spawned.stderr ?? ""}`;
    const transfers = countTransfers(out);
    const ok = spawned.status === 0;
    results.push({
      name: pair.name,
      direction: pair.direction,
      ok,
      upload: transfers.upload,
      download: transfers.download,
      error: ok
        ? undefined
        : (spawned.stderr ?? "aws failed").split(/\r?\n/)[0]?.slice(0, 200),
    });
    if (!ok) break;
  }

  const summary = {
    EDGE_CLAIM: "NONE" as const,
    HOLDOUT: "SEALED",
    ok: results.every((r) => r.ok),
    role,
    dryRun,
    bucket,
    results,
    note: "Append-only. Laptop does not push normalized (desktop owns ingest). No --delete.",
  };

  const logDir = join(resolveCacheRoot(repoRoot), "cloud-sync");
  mkdirSync(logDir, { recursive: true });
  appendFileSync(
    join(logDir, "autosync.log"),
    `${new Date().toISOString()} ${JSON.stringify(summary)}\n`,
    "utf8"
  );
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
}

main();
