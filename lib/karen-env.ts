/**
 * Portable environment / secret loading for Karen.
 *
 * Sources (first wins per key; never overwrites existing process.env):
 *   1. Already-set process.env (secret manager inject / CI / shell)
 *   2. KAREN_ENV_FILE if set
 *   3. <repoRoot>/.env.local then .env
 *   4. Optional walk from cwd upward to repoRoot for .env.local
 *
 * No hardcoded desktop absolute paths. Never log secret values.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { resolveRepoRoot } from "./karen-paths";

export type LoadKarenEnvOptions = {
  /** Restrict keys loaded from files (e.g. /^TICKSTREAM/). Default: all KEY=VAL. */
  keyFilter?: RegExp;
  /** Extra candidate file paths (absolute or relative to repo root). */
  extraFiles?: string[];
  startDir?: string;
  /** If true, skip filesystem .env* and only report process.env. */
  processEnvOnly?: boolean;
};

export type LoadKarenEnvResult = {
  repoRoot: string;
  filesTried: string[];
  filesLoaded: string[];
  keysLoadedFromFiles: string[];
  keyConfigured: Record<string, boolean>;
};

function stripQuotes(val: string): string {
  const v = val.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function parseEnvFile(
  filePath: string,
  keyFilter: RegExp | undefined
): Array<{ key: string; value: string }> {
  const text = readFileSync(filePath, "utf8");
  const out: Array<{ key: string; value: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (keyFilter && !keyFilter.test(key)) continue;
    out.push({ key, value: stripQuotes(m[2] ?? "") });
  }
  return out;
}

/**
 * Candidate env files in discovery order (may not exist).
 */
export function listKarenEnvCandidates(
  repoRoot: string,
  startDir: string = process.cwd(),
  extraFiles: string[] = []
): string[] {
  const candidates: string[] = [];
  const fromEnv = process.env.KAREN_ENV_FILE?.trim();
  if (fromEnv) candidates.push(resolve(fromEnv));

  for (const rel of extraFiles) {
    candidates.push(resolve(repoRoot, rel));
  }

  candidates.push(join(repoRoot, ".env.local"), join(repoRoot, ".env"));

  // Worktree / nested cwd: walk up toward repoRoot for .env.local
  let dir = resolve(startDir);
  const rootResolved = resolve(repoRoot);
  for (;;) {
    const local = join(dir, ".env.local");
    if (!candidates.includes(local)) candidates.push(local);
    if (resolve(dir) === rootResolved) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return candidates;
}

/**
 * Load env files into process.env without overwriting existing keys.
 * Suitable for TickStream, OpenAI, R2 access keys (names only in docs).
 */
export function loadKarenEnv(opts: LoadKarenEnvOptions = {}): LoadKarenEnvResult {
  const repoRoot = resolveRepoRoot(opts.startDir);
  const filesTried: string[] = [];
  const filesLoaded: string[] = [];
  const keysLoadedFromFiles: string[] = [];

  if (!opts.processEnvOnly) {
    const candidates = listKarenEnvCandidates(
      repoRoot,
      opts.startDir ?? process.cwd(),
      opts.extraFiles ?? []
    );
    for (const filePath of candidates) {
      filesTried.push(filePath);
      if (!existsSync(filePath)) continue;
      let pairs: Array<{ key: string; value: string }>;
      try {
        pairs = parseEnvFile(filePath, opts.keyFilter);
      } catch {
        continue;
      }
      for (const { key, value } of pairs) {
        if (process.env[key]) continue;
        process.env[key] = value;
        keysLoadedFromFiles.push(key);
      }
      filesLoaded.push(filePath);
    }
  }

  const watchKeys = [
    "TICKSTREAM_API_KEY",
    "OPENAI_API_KEY",
    "KAREN_R2_ACCESS_KEY_ID",
    "KAREN_R2_SECRET_ACCESS_KEY",
    "KAREN_HOLDOUT_UNLOCK",
  ];

  const keyConfigured: Record<string, boolean> = {};
  for (const k of watchKeys) {
    keyConfigured[k] = Boolean(process.env[k]?.trim());
  }

  return {
    repoRoot,
    filesTried,
    filesLoaded: [...new Set(filesLoaded)],
    keysLoadedFromFiles: [...new Set(keysLoadedFromFiles)],
    keyConfigured,
  };
}

/**
 * TickStream-only loader (compat with scripts/_load-tickstream-env.ts).
 */
export function loadTickstreamEnv(opts?: Omit<LoadKarenEnvOptions, "keyFilter">): {
  keyConfigured: boolean;
  apiUrl: string | null;
  envPathTried: string[];
  repoRoot: string;
} {
  const result = loadKarenEnv({
    ...opts,
    keyFilter: /^TICKSTREAM/i,
  });
  return {
    keyConfigured: Boolean(process.env.TICKSTREAM_API_KEY?.trim()),
    apiUrl: process.env.TICKSTREAM_API_URL ?? null,
    envPathTried: result.filesTried,
    repoRoot: result.repoRoot,
  };
}
