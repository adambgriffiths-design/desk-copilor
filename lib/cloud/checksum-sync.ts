/**
 * Checksum-safe append-only sync planner for Karen → R2.
 *
 * Rules:
 * - Never deletes local files
 * - Never deletes remote objects (append-only / skip-if-present)
 * - Resume via local checksum inventory + sync state JSONL
 * - Verify sha256 before marking uploaded
 *
 * EDGE_CLAIM: NONE — infra only. HOLDOUT sealed prefixes excluded from DEV profiles.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from "fs";
import { createHash } from "crypto";
import { dirname, join, relative, sep } from "path";
import { resolveCacheRoot, resolveRepoRoot } from "../karen-paths";

export const CHECKSUM_SYNC_VERSION = "karen-checksum-sync-v1" as const;

export type SyncProfileName =
  | "min-dev"
  | "normalized-full"
  | "raw-append"
  | "checkpoints"
  | "experiments-dev";

export type FileChecksumRecord = {
  relPath: string;
  size: number;
  sha256: string;
  mtimeMs: number;
};

export type SyncInventory = {
  version: typeof CHECKSUM_SYNC_VERSION;
  profile: SyncProfileName;
  createdAt: string;
  root: string;
  files: FileChecksumRecord[];
  aggregateSha256: string;
  totalBytes: number;
  EDGE_CLAIM: "NONE";
};

export type SyncStateEntry = {
  relPath: string;
  sha256: string;
  size: number;
  remoteKey: string;
  uploadedAt: string;
  verified: boolean;
};

export type SyncPlanItem = {
  relPath: string;
  absPath: string;
  remoteKey: string;
  size: number;
  sha256: string;
  action: "upload" | "skip-identical" | "conflict-size-or-hash";
};

export type SyncPlan = {
  profile: SyncProfileName;
  items: SyncPlanItem[];
  toUpload: SyncPlanItem[];
  skipped: SyncPlanItem[];
  conflicts: SyncPlanItem[];
  totalUploadBytes: number;
};

const HOLD_OUT_FRAGMENTS = [
  `${sep}sealed${sep}holdout${sep}`,
  "/sealed/holdout/",
  "experiments/sealed/holdout",
];

export function isHoldoutPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/");
  return HOLD_OUT_FRAGMENTS.some((f) =>
    norm.includes(f.replace(/\\/g, "/"))
  );
}

/** Yield event-loop between files so DEV jobs keep CPU. */
export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sha256File(
  absPath: string,
  opts?: { yieldEveryBytes?: number }
): Promise<string> {
  const yieldEvery = opts?.yieldEveryBytes ?? 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(absPath, { highWaterMark: 1024 * 1024 });
    let sinceYield = 0;
    stream.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      hash.update(buf);
      sinceYield += buf.length;
      if (sinceYield >= yieldEvery) {
        sinceYield = 0;
        stream.pause();
        setImmediate(() => stream.resume());
      }
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}

export type ProfileRoots = {
  /** Absolute local roots to include, with remote key prefix for each. */
  roots: Array<{ localRoot: string; remotePrefix: string }>;
};

export function resolveProfileRoots(
  profile: SyncProfileName,
  repoRoot?: string
): ProfileRoots {
  const root = repoRoot ?? resolveRepoRoot();
  const acq = join(
    root,
    "data",
    "karen-decision-validation",
    "acquisition"
  );
  const dv = join(root, "data", "karen-decision-validation");
  switch (profile) {
    case "min-dev":
      return {
        roots: [
          {
            localRoot: join(acq, "normalized", "nq-history-archive-1m"),
            remotePrefix: "normalized/nq-history-archive-1m/v-local/",
          },
          {
            localRoot: join(dv, "micro-fixtures"),
            remotePrefix: "experiments/dev/micro-fixtures/",
          },
          {
            localRoot: join(acq, "checkpoints"),
            remotePrefix: "checkpoints/",
          },
          {
            localRoot: join(root, "config", "cloud"),
            remotePrefix: "meta/cloud-config/",
          },
        ],
      };
    case "normalized-full":
      return {
        roots: [
          {
            localRoot: join(acq, "normalized"),
            remotePrefix: "normalized/",
          },
        ],
      };
    case "raw-append":
      return {
        roots: [
          {
            localRoot: join(
              acq,
              "raw",
              "tickstream-nq-history-archive",
              "by-day"
            ),
            remotePrefix: "raw/tickstream-nq-history-archive/by-day/",
          },
          {
            localRoot: join(
              acq,
              "raw",
              "tickstream-nq-history-archive",
              "manifest.json"
            ),
            remotePrefix: "raw/tickstream-nq-history-archive/manifest.json",
          },
        ],
      };
    case "checkpoints":
      return {
        roots: [
          {
            localRoot: join(acq, "checkpoints"),
            remotePrefix: "checkpoints/",
          },
        ],
      };
    case "experiments-dev":
      return {
        roots: [
          {
            localRoot: join(root, "data", "supervisor"),
            remotePrefix: "experiments/dev/supervisor/",
          },
        ],
      };
    default: {
      const _exhaustive: never = profile;
      throw new Error(`unknown profile: ${String(_exhaustive)}`);
    }
  }
}

export async function buildInventory(
  profile: SyncProfileName,
  opts?: {
    repoRoot?: string;
    throttleMsBetweenFiles?: number;
    maxFiles?: number;
  }
): Promise<SyncInventory> {
  const repoRoot = opts?.repoRoot ?? resolveRepoRoot();
  const { roots } = resolveProfileRoots(profile, repoRoot);
  const files: FileChecksumRecord[] = [];
  let totalBytes = 0;
  const throttle = opts?.throttleMsBetweenFiles ?? 5;

  for (const { localRoot, remotePrefix: _rp } of roots) {
    void _rp;
    if (!existsSync(localRoot)) continue;
    const st = statSync(localRoot);
    const absFiles = st.isFile() ? [localRoot] : walkFiles(localRoot);
    for (const abs of absFiles) {
      if (opts?.maxFiles && files.length >= opts.maxFiles) break;
      const relFromRepo = relative(repoRoot, abs).replace(/\\/g, "/");
      if (isHoldoutPath(relFromRepo)) continue;
      const s = statSync(abs);
      const sha256 = await sha256File(abs);
      files.push({
        relPath: relFromRepo,
        size: s.size,
        sha256,
        mtimeMs: s.mtimeMs,
      });
      totalBytes += s.size;
      if (throttle > 0) await sleepMs(throttle);
    }
  }

  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  const aggregateSha256 = createHash("sha256")
    .update(
      files.map((f) => `${f.relPath}:${f.sha256}:${f.size}`).join("\n")
    )
    .digest("hex");

  return {
    version: CHECKSUM_SYNC_VERSION,
    profile,
    createdAt: new Date().toISOString(),
    root: repoRoot,
    files,
    aggregateSha256,
    totalBytes,
    EDGE_CLAIM: "NONE",
  };
}

export function syncStatePath(
  profile: SyncProfileName,
  repoRoot?: string
): string {
  const cache = resolveCacheRoot(repoRoot ?? resolveRepoRoot());
  return join(cache, "cloud-sync", profile, "state.jsonl");
}

export function inventoryPath(
  profile: SyncProfileName,
  repoRoot?: string
): string {
  const cache = resolveCacheRoot(repoRoot ?? resolveRepoRoot());
  return join(cache, "cloud-sync", profile, "inventory.json");
}

export function loadSyncState(
  profile: SyncProfileName,
  repoRoot?: string
): Map<string, SyncStateEntry> {
  const path = syncStatePath(profile, repoRoot);
  const map = new Map<string, SyncStateEntry>();
  if (!existsSync(path)) return map;
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as SyncStateEntry;
      map.set(row.relPath, row);
    } catch {
      /* skip corrupt line */
    }
  }
  return map;
}

export function appendSyncState(
  profile: SyncProfileName,
  entry: SyncStateEntry,
  repoRoot?: string
): void {
  const path = syncStatePath(profile, repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

export function writeInventory(inv: SyncInventory, repoRoot?: string): string {
  const path = inventoryPath(inv.profile, repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(inv, null, 2)}\n`, "utf8");
  return path;
}

export function planSync(
  inventory: SyncInventory,
  opts?: {
    repoRoot?: string;
    remotePrefixOverride?: string;
  }
): SyncPlan {
  const repoRoot = opts?.repoRoot ?? inventory.root;
  const state = loadSyncState(inventory.profile, repoRoot);
  const { roots } = resolveProfileRoots(inventory.profile, repoRoot);
  const items: SyncPlanItem[] = [];

  for (const file of inventory.files) {
    if (isHoldoutPath(file.relPath)) continue;
    const absPath = join(repoRoot, file.relPath);
    let remoteKey = file.relPath;
    for (const { localRoot, remotePrefix } of roots) {
      const relLocal = relative(localRoot, absPath).replace(/\\/g, "/");
      if (!relLocal.startsWith("..") && !relLocal.startsWith("/")) {
        const prefix = remotePrefix.endsWith("/")
          ? remotePrefix
          : `${remotePrefix}/`;
        // Single-file roots (manifest.json): remotePrefix is full key
        if (statSync(localRoot).isFile()) {
          remoteKey = remotePrefix;
        } else {
          remoteKey = `${prefix}${relLocal}`;
        }
        break;
      }
    }
    if (opts?.remotePrefixOverride) {
      remoteKey = `${opts.remotePrefixOverride.replace(/\/$/, "")}/${file.relPath}`;
    }

    const prev = state.get(file.relPath);
    let action: SyncPlanItem["action"] = "upload";
    if (prev?.verified && prev.sha256 === file.sha256 && prev.size === file.size) {
      action = "skip-identical";
    } else if (
      prev &&
      prev.verified &&
      (prev.sha256 !== file.sha256 || prev.size !== file.size)
    ) {
      // Append-only conflict: do not overwrite remote; flag for Adam
      action = "conflict-size-or-hash";
    }

    items.push({
      relPath: file.relPath,
      absPath,
      remoteKey,
      size: file.size,
      sha256: file.sha256,
      action,
    });
  }

  const toUpload = items.filter((i) => i.action === "upload");
  const skipped = items.filter((i) => i.action === "skip-identical");
  const conflicts = items.filter((i) => i.action === "conflict-size-or-hash");
  return {
    profile: inventory.profile,
    items,
    toUpload,
    skipped,
    conflicts,
    totalUploadBytes: toUpload.reduce((n, i) => n + i.size, 0),
  };
}

export function formatAwsSyncHint(
  plan: SyncPlan,
  endpoint: string,
  bucket: string
): string {
  const lines = [
    `# Append-only upload (example). Prefer per-object put; never --delete.`,
    `# aws configure set default.s3.signature_version s3v4`,
    `set AWS_ACCESS_KEY_ID=%KAREN_R2_ACCESS_KEY_ID%`,
    `set AWS_SECRET_ACCESS_KEY=%KAREN_R2_SECRET_ACCESS_KEY%`,
    `# endpoint: ${endpoint}`,
    `# bucket: s3://${bucket}/`,
    `# Objects to upload: ${plan.toUpload.length} (~${(plan.totalUploadBytes / 1e6).toFixed(1)} MB)`,
  ];
  for (const item of plan.toUpload.slice(0, 20)) {
    lines.push(
      `aws s3 cp "${item.absPath}" "s3://${bucket}/${item.remoteKey}" --endpoint-url "${endpoint}" --checksum-algorithm SHA256`
    );
  }
  if (plan.toUpload.length > 20) {
    lines.push(`# ... +${plan.toUpload.length - 20} more (see plan JSON)`);
  }
  lines.push(
    `# IMPORTANT: do not use 'aws s3 sync --delete'. Local data must never be deleted by cloud tools.`
  );
  return lines.join("\n");
}
