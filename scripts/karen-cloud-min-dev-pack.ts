/**
 * Stage minimum DEV dataset pack for laptop independence (not full 46GB raw).
 *
 * Writes:
 *   .karen-cache/min-dev-pack/MANIFEST.json
 *   .karen-cache/min-dev-pack/checksums.jsonl
 *
 * Does not delete local data. Does not upload (use karen-cloud-r2-sync).
 * Throttled hashing.
 *
 * EDGE_CLAIM: NONE
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  statSync,
} from "fs";
import { dirname, join, relative } from "path";
import { sha256File, sleepMs } from "../lib/cloud/checksum-sync";
import {
  resolveCacheRoot,
  resolveRepoRoot,
  resolveDvNormalized1mRoot,
} from "../lib/karen-paths";

type PackEntry = {
  id: string;
  abs: string;
  required: boolean;
  note: string;
};

function packEntries(repoRoot: string): PackEntry[] {
  const norm = resolveDvNormalized1mRoot(repoRoot);
  const dv = join(repoRoot, "data", "karen-decision-validation");
  return [
    {
      id: "normalized/candles-1m.json",
      abs: join(norm, "candles-1m.json"),
      required: true,
      note: "Full 1m archive (laptop/VM can filter DEV carve in-process)",
    },
    {
      id: "normalized/dv-fixture-bounded.json",
      abs: join(norm, "dv-fixture-bounded.json"),
      required: true,
      note: "Bounded DV fixture",
    },
    {
      id: "normalized/manifest.json",
      abs: join(norm, "manifest.json"),
      required: true,
      note: "Dataset manifest",
    },
    {
      id: "normalized/splits/carve-manifest-v1.json",
      abs: join(norm, "splits", "carve-manifest-v1.json"),
      required: true,
      note: "DEV/VAL/HOLDOUT carve — HOLDOUT sealed in policy",
    },
    {
      id: "micro-fixtures/fixtures/micro-empty-session-hl-v0.json",
      abs: join(
        dv,
        "micro-fixtures",
        "fixtures",
        "micro-empty-session-hl-v0.json"
      ),
      required: true,
      note: "Equivalence smoke fixture A",
    },
    {
      id: "micro-fixtures/fixtures/micro-pd-missing-lastprice-v0.json",
      abs: join(
        dv,
        "micro-fixtures",
        "fixtures",
        "micro-pd-missing-lastprice-v0.json"
      ),
      required: true,
      note: "Equivalence smoke fixture B",
    },
    {
      id: "config/cloud/r2.example.json",
      abs: join(repoRoot, "config", "cloud", "r2.example.json"),
      required: true,
      note: "R2 prefix contract",
    },
    {
      id: "config/cloud/min-dev-dataset.manifest.json",
      abs: join(repoRoot, "config", "cloud", "min-dev-dataset.manifest.json"),
      required: false,
      note: "Human manifest (written by this script if missing later)",
    },
  ];
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const outRoot = join(resolveCacheRoot(repoRoot), "min-dev-pack");
  mkdirSync(outRoot, { recursive: true });
  const checksumsPath = join(outRoot, "checksums.jsonl");
  writeFileSync(checksumsPath, "", "utf8");

  const entries = packEntries(repoRoot);
  const included: Array<{
    id: string;
    size: number;
    sha256: string;
    required: boolean;
    present: boolean;
    stagedRel?: string;
  }> = [];
  let totalBytes = 0;
  let missingRequired = 0;

  for (const e of entries) {
    const present = existsSync(e.abs);
    if (!present) {
      if (e.required) missingRequired += 1;
      included.push({
        id: e.id,
        size: 0,
        sha256: "",
        required: e.required,
        present: false,
      });
      console.error(`[min-dev-pack] MISSING ${e.required ? "REQUIRED" : "optional"}: ${e.abs}`);
      continue;
    }
    const size = statSync(e.abs).size;
    console.error(`[min-dev-pack] hashing ${e.id} (${(size / 1e6).toFixed(1)} MB)…`);
    const sha256 = await sha256File(e.abs);
    await sleepMs(15);

    // Avoid duplicating large normalized JSON on disk (resource-aware vs DEV jobs).
    // Small files (<32MB) are staged under files/; large files are pointer-only.
    const STAGE_COPY_MAX = 32 * 1024 * 1024;
    let stagedRel: string | undefined;
    if (size <= STAGE_COPY_MAX) {
      const dest = join(outRoot, "files", e.id);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(e.abs, dest);
      stagedRel = relative(outRoot, dest).replace(/\\/g, "/");
    }

    const row = {
      id: e.id,
      size,
      sha256,
      required: e.required,
      present: true,
      sourceAbs: e.abs,
      stagedRel,
      note: e.note,
    };
    appendFileSync(checksumsPath, `${JSON.stringify(row)}\n`, "utf8");
    included.push(row);
    totalBytes += size;
  }

  const manifest = {
    version: "karen-min-dev-pack-v1",
    at: new Date().toISOString(),
    EDGE_CLAIM: "NONE",
    HOLDOUT: "SEALED — not included",
    purpose:
      "Minimum dataset for laptop monitor/launch/resume of Karen DEV while raw 46GB syncs later",
    outRoot,
    totalBytes,
    totalMB: Number((totalBytes / 1e6).toFixed(2)),
    missingRequired,
    remainingUploadHint:
      "Full raw tickstream by-day (~46GB, 1663 days) remains for background append-only sync profile=raw-append",
    files: included,
    r2RemotePrefix: "normalized/nq-history-archive-1m/v-local/ + experiments/dev/micro-fixtures/",
  };

  const manifestPath = join(outRoot, "MANIFEST.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  // Also write/refresh human config manifest
  const cfgManifest = {
    version: "karen-min-dev-dataset-manifest-v1",
    EDGE_CLAIM: "NONE",
    includes: entries.map((e) => ({ id: e.id, required: e.required, note: e.note })),
    excludes: [
      "raw/tickstream-nq-history-archive/by-day/** (~46GB)",
      "experiments/sealed/holdout/**",
      "node_modules",
      ".next",
      ".env*",
    ],
    laptopPullCommand:
      "npx tsx scripts/karen-cloud-r2-sync.ts --profile min-dev --inventory --plan",
  };
  const cfgPath = join(
    repoRoot,
    "config",
    "cloud",
    "min-dev-dataset.manifest.json"
  );
  mkdirSync(dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, `${JSON.stringify(cfgManifest, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: missingRequired === 0,
        manifestPath,
        checksumsPath,
        cfgPath,
        totalMB: manifest.totalMB,
        missingRequired,
        fileCount: included.filter((f) => f.present).length,
      },
      null,
      2
    )
  );

  if (missingRequired > 0) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
