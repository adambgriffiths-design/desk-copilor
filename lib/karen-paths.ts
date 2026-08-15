/**
 * Machine-independent path resolution for Karen (desktop / laptop / cloud VM).
 *
 * Priority:
 *   1. Explicit env overrides (KAREN_REPO_ROOT, KAREN_DATA_ROOT, KAREN_CACHE_ROOT)
 *   2. Walk upward from cwd (or startDir) for package.json name === "desk-copilot"
 *   3. Fallback: process.cwd()
 *
 * Never hardcode a user home or desktop absolute path.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";

const PACKAGE_NAME = "desk-copilot";

function readPackageName(pkgPath: string): string | null {
  try {
    const raw = readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the Karen repo / worktree root without machine-specific paths.
 */
export function resolveRepoRoot(startDir: string = process.cwd()): string {
  const fromEnv = process.env.KAREN_REPO_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);

  let dir = resolve(startDir);
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath) && readPackageName(pkgPath) === PACKAGE_NAME) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir);
}

/**
 * Data root for Karen datasets (DV acquisition, fixtures, research mirrors).
 * Default: `<repoRoot>/data`
 */
export function resolveDataRoot(repoRoot?: string): string {
  const fromEnv = process.env.KAREN_DATA_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(repoRoot ?? resolveRepoRoot(), "data");
}

/**
 * Ephemeral / pullable cache (normalized DEV subset, VM working set).
 * Default: `<repoRoot>/.karen-cache` or KAREN_CACHE_ROOT.
 */
export function resolveCacheRoot(repoRoot?: string): string {
  const fromEnv = process.env.KAREN_CACHE_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(repoRoot ?? resolveRepoRoot(), ".karen-cache");
}

/** Decision Validation acquisition tree (raw + normalized). */
export function resolveDvAcquisitionRoot(repoRoot?: string): string {
  return join(
    resolveDataRoot(repoRoot),
    "karen-decision-validation",
    "acquisition"
  );
}

/** Local or synced raw TickStream archive root (immutable bytes). */
export function resolveDvRawArchiveRoot(repoRoot?: string): string {
  return join(
    resolveDvAcquisitionRoot(repoRoot),
    "raw",
    "tickstream-nq-history-archive"
  );
}

/** Normalized 1m archive root (versioned under cloud; local default path). */
export function resolveDvNormalized1mRoot(repoRoot?: string): string {
  return join(
    resolveDvAcquisitionRoot(repoRoot),
    "normalized",
    "nq-history-archive-1m"
  );
}

/**
 * Day-level DV job checkpoints (local mirror of R2 checkpoints/jobs/{jobId}/).
 * Override with KAREN_DV_CHECKPOINT_ROOT.
 */
export function resolveDvCheckpointRoot(repoRoot?: string): string {
  const fromEnv = process.env.KAREN_DV_CHECKPOINT_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(resolveDvAcquisitionRoot(repoRoot), "checkpoints", "jobs");
}

/** Resolve a path that may be relative to repo root. */
export function resolveUnderRepo(maybeRelative: string, repoRoot?: string): string {
  if (isAbsolute(maybeRelative)) return maybeRelative;
  return join(repoRoot ?? resolveRepoRoot(), maybeRelative);
}

export type KarenPathSnapshot = {
  repoRoot: string;
  dataRoot: string;
  cacheRoot: string;
  dvAcquisitionRoot: string;
  dvRawArchiveRoot: string;
  dvNormalized1mRoot: string;
  dvCheckpointRoot: string;
  envOverrides: {
    KAREN_REPO_ROOT: boolean;
    KAREN_DATA_ROOT: boolean;
    KAREN_CACHE_ROOT: boolean;
    KAREN_DV_CHECKPOINT_ROOT: boolean;
  };
};

export function snapshotKarenPaths(startDir?: string): KarenPathSnapshot {
  const repoRoot = resolveRepoRoot(startDir);
  return {
    repoRoot,
    dataRoot: resolveDataRoot(repoRoot),
    cacheRoot: resolveCacheRoot(repoRoot),
    dvAcquisitionRoot: resolveDvAcquisitionRoot(repoRoot),
    dvRawArchiveRoot: resolveDvRawArchiveRoot(repoRoot),
    dvNormalized1mRoot: resolveDvNormalized1mRoot(repoRoot),
    dvCheckpointRoot: resolveDvCheckpointRoot(repoRoot),
    envOverrides: {
      KAREN_REPO_ROOT: Boolean(process.env.KAREN_REPO_ROOT?.trim()),
      KAREN_DATA_ROOT: Boolean(process.env.KAREN_DATA_ROOT?.trim()),
      KAREN_CACHE_ROOT: Boolean(process.env.KAREN_CACHE_ROOT?.trim()),
      KAREN_DV_CHECKPOINT_ROOT: Boolean(process.env.KAREN_DV_CHECKPOINT_ROOT?.trim()),
    },
  };
}
