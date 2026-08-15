/**
 * Day-level Decision Validation checkpoint + automatic resume.
 *
 * Format: dv-day-checkpoint-v1 (one JSON file per completed/failed day)
 * Layout:  {checkpointRoot}/{jobId}/{dayYmd}.json
 * Index:   {checkpointRoot}/{jobId}/_index.json
 *
 * Resume rule: skip days with status=completed whose fingerprint matches
 * (codeVersion + datasetVersion + baselineVersion + configHash + split).
 * In-flight day is never assumed complete — at worst re-run that day.
 *
 * HOLDOUT: checkpoints for UNTOUCHED_HOLDOUT require KAREN_HOLDOUT_UNLOCK=1
 * when loading for resume into a DEV-default job (assertHoldoutSafe).
 *
 * EDGE_CLAIM: NONE (infra only).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { resolveDvCheckpointRoot, resolveRepoRoot } from "../karen-paths";

export const DAY_CHECKPOINT_VERSION = "dv-day-checkpoint-v1" as const;
export const JOB_CHECKPOINT_INDEX_VERSION = "dv-job-checkpoint-index-v1" as const;

export type DvSplitName =
  | "DEVELOPMENT"
  | "VALIDATION"
  | "UNTOUCHED_HOLDOUT";

export type DayCheckpointStatus = "completed" | "failed" | "in_progress";

export type DayCheckpointConfig = {
  cadenceMinutes: number;
  lookbackDays: number;
  workers?: number;
  smokeAsOfCap?: number | null;
  /** Extra stable knobs included in fingerprint. */
  [key: string]: unknown;
};

export type DayCheckpointV1 = {
  version: typeof DAY_CHECKPOINT_VERSION;
  jobId: string;
  dayYmd: string;
  status: DayCheckpointStatus;
  completedAt: string | null;
  updatedAt: string;
  codeVersion: string;
  baselineVersion: string;
  datasetVersion: string;
  split: DvSplitName;
  config: DayCheckpointConfig;
  configHash: string;
  fingerprint: string;
  pitStatus: "PASS" | "FAIL" | "UNKNOWN";
  asOfCount: number;
  recordsHash: string;
  wallMs: number | null;
  resultSummary?: Record<string, unknown>;
  errorMessage?: string;
  EDGE_CLAIM: string;
};

export type JobCheckpointIndexV1 = {
  version: typeof JOB_CHECKPOINT_INDEX_VERSION;
  jobId: string;
  codeVersion: string;
  baselineVersion: string;
  datasetVersion: string;
  split: DvSplitName;
  configHash: string;
  plannedDays: string[];
  completedDays: string[];
  failedDays: string[];
  pendingDays: string[];
  updatedAt: string;
  EDGE_CLAIM: string;
};

export type CheckpointIdentity = {
  jobId: string;
  codeVersion: string;
  baselineVersion: string;
  datasetVersion: string;
  split: DvSplitName;
  config: DayCheckpointConfig;
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function hashConfig(config: DayCheckpointConfig): string {
  return createHash("sha256").update(stableStringify(config)).digest("hex").slice(0, 16);
}

export function fingerprintIdentity(identity: CheckpointIdentity): string {
  const payload = {
    codeVersion: identity.codeVersion,
    baselineVersion: identity.baselineVersion,
    datasetVersion: identity.datasetVersion,
    split: identity.split,
    configHash: hashConfig(identity.config),
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 24);
}

export function jobCheckpointDir(jobId: string, checkpointRoot?: string): string {
  const root = checkpointRoot ?? resolveDvCheckpointRoot(resolveRepoRoot());
  return join(root, jobId);
}

export function dayCheckpointPath(
  jobId: string,
  dayYmd: string,
  checkpointRoot?: string
): string {
  return join(jobCheckpointDir(jobId, checkpointRoot), `${dayYmd}.json`);
}

export function jobIndexPath(jobId: string, checkpointRoot?: string): string {
  return join(jobCheckpointDir(jobId, checkpointRoot), "_index.json");
}

export function assertHoldoutSafe(split: DvSplitName): void {
  if (split !== "UNTOUCHED_HOLDOUT") return;
  if (process.env.KAREN_HOLDOUT_UNLOCK?.trim() === "1") return;
  throw new Error(
    "HOLDOUT sealed: refusing UNTOUCHED_HOLDOUT checkpoint I/O without KAREN_HOLDOUT_UNLOCK=1"
  );
}

export function createDayCheckpoint(
  identity: CheckpointIdentity,
  dayYmd: string,
  partial: {
    status: DayCheckpointStatus;
    pitStatus?: DayCheckpointV1["pitStatus"];
    asOfCount?: number;
    recordsHash?: string;
    wallMs?: number | null;
    resultSummary?: Record<string, unknown>;
    errorMessage?: string;
    EDGE_CLAIM?: string;
  }
): DayCheckpointV1 {
  assertHoldoutSafe(identity.split);
  const configHash = hashConfig(identity.config);
  const fingerprint = fingerprintIdentity(identity);
  const now = new Date().toISOString();
  return {
    version: DAY_CHECKPOINT_VERSION,
    jobId: identity.jobId,
    dayYmd,
    status: partial.status,
    completedAt: partial.status === "completed" ? now : null,
    updatedAt: now,
    codeVersion: identity.codeVersion,
    baselineVersion: identity.baselineVersion,
    datasetVersion: identity.datasetVersion,
    split: identity.split,
    config: identity.config,
    configHash,
    fingerprint,
    pitStatus: partial.pitStatus ?? "UNKNOWN",
    asOfCount: partial.asOfCount ?? 0,
    recordsHash: partial.recordsHash ?? "",
    wallMs: partial.wallMs ?? null,
    resultSummary: partial.resultSummary,
    errorMessage: partial.errorMessage,
    EDGE_CLAIM: partial.EDGE_CLAIM ?? "NONE",
  };
}

export function writeDayCheckpoint(
  cp: DayCheckpointV1,
  checkpointRoot?: string
): string {
  assertHoldoutSafe(cp.split);
  const dir = jobCheckpointDir(cp.jobId, checkpointRoot);
  mkdirSync(dir, { recursive: true });
  const path = dayCheckpointPath(cp.jobId, cp.dayYmd, checkpointRoot);
  writeFileSync(path, `${JSON.stringify(cp, null, 2)}\n`, "utf8");
  return path;
}

export function readDayCheckpoint(
  jobId: string,
  dayYmd: string,
  checkpointRoot?: string
): DayCheckpointV1 | null {
  const path = dayCheckpointPath(jobId, dayYmd, checkpointRoot);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as DayCheckpointV1;
  if (raw.version !== DAY_CHECKPOINT_VERSION) {
    throw new Error(`unsupported checkpoint version: ${String(raw.version)}`);
  }
  assertHoldoutSafe(raw.split);
  return raw;
}

export function listDayCheckpoints(
  jobId: string,
  checkpointRoot?: string
): DayCheckpointV1[] {
  const dir = jobCheckpointDir(jobId, checkpointRoot);
  if (!existsSync(dir)) return [];
  const out: DayCheckpointV1[] = [];
  for (const name of readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
    const raw = JSON.parse(
      readFileSync(join(dir, name), "utf8")
    ) as DayCheckpointV1;
    if (raw.version !== DAY_CHECKPOINT_VERSION) continue;
    out.push(raw);
  }
  return out.sort((a, b) => a.dayYmd.localeCompare(b.dayYmd));
}

export function isResumableCompletedDay(
  cp: DayCheckpointV1,
  identity: CheckpointIdentity
): boolean {
  if (cp.status !== "completed") return false;
  if (cp.jobId !== identity.jobId) return false;
  return cp.fingerprint === fingerprintIdentity(identity);
}

export type ResumePlan = {
  identity: CheckpointIdentity;
  plannedDays: string[];
  skipDays: string[];
  remainingDays: string[];
  failedDays: string[];
  loadedCheckpoints: DayCheckpointV1[];
};

/**
 * Automatic resume: given planned days + identity, return days still needing work.
 * Completed matching checkpoints are skipped; failed/in_progress/mismatch are re-run.
 */
export function planResume(
  identity: CheckpointIdentity,
  plannedDays: string[],
  checkpointRoot?: string
): ResumePlan {
  assertHoldoutSafe(identity.split);
  const sorted = [...plannedDays].sort((a, b) => a.localeCompare(b));
  const loaded = listDayCheckpoints(identity.jobId, checkpointRoot);
  const byDay = new Map(loaded.map((c) => [c.dayYmd, c]));
  const skipDays: string[] = [];
  const remainingDays: string[] = [];
  const failedDays: string[] = [];

  for (const day of sorted) {
    const cp = byDay.get(day);
    if (cp && isResumableCompletedDay(cp, identity)) {
      skipDays.push(day);
      continue;
    }
    if (cp?.status === "failed") failedDays.push(day);
    remainingDays.push(day);
  }

  return {
    identity,
    plannedDays: sorted,
    skipDays,
    remainingDays,
    failedDays,
    loadedCheckpoints: loaded,
  };
}

export function writeJobIndex(
  plan: ResumePlan,
  checkpointRoot?: string
): JobCheckpointIndexV1 {
  assertHoldoutSafe(plan.identity.split);
  const index: JobCheckpointIndexV1 = {
    version: JOB_CHECKPOINT_INDEX_VERSION,
    jobId: plan.identity.jobId,
    codeVersion: plan.identity.codeVersion,
    baselineVersion: plan.identity.baselineVersion,
    datasetVersion: plan.identity.datasetVersion,
    split: plan.identity.split,
    configHash: hashConfig(plan.identity.config),
    plannedDays: plan.plannedDays,
    completedDays: plan.skipDays,
    failedDays: plan.failedDays,
    pendingDays: plan.remainingDays,
    updatedAt: new Date().toISOString(),
    EDGE_CLAIM: "NONE",
  };
  const dir = jobCheckpointDir(plan.identity.jobId, checkpointRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    jobIndexPath(plan.identity.jobId, checkpointRoot),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8"
  );
  return index;
}

export function readJobIndex(
  jobId: string,
  checkpointRoot?: string
): JobCheckpointIndexV1 | null {
  const path = jobIndexPath(jobId, checkpointRoot);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as JobCheckpointIndexV1;
}

/**
 * Run day tasks with automatic skip of resumable completed checkpoints.
 * Does not launch heavy DV — caller supplies lightweight `runDay`.
 */
export async function runDaysWithResume<T>(opts: {
  identity: CheckpointIdentity;
  plannedDays: string[];
  checkpointRoot?: string;
  runDay: (dayYmd: string) => Promise<{
    pitStatus?: DayCheckpointV1["pitStatus"];
    asOfCount?: number;
    recordsHash?: string;
    resultSummary?: Record<string, unknown>;
    result: T;
  }>;
  onDayComplete?: (cp: DayCheckpointV1, result: T) => void;
}): Promise<{
  plan: ResumePlan;
  results: Array<{ dayYmd: string; result: T; fromCheckpoint: boolean }>;
}> {
  const plan = planResume(opts.identity, opts.plannedDays, opts.checkpointRoot);
  writeJobIndex(plan, opts.checkpointRoot);

  const results: Array<{ dayYmd: string; result: T; fromCheckpoint: boolean }> =
    [];

  for (const day of plan.skipDays) {
    const cp = readDayCheckpoint(
      opts.identity.jobId,
      day,
      opts.checkpointRoot
    );
    results.push({
      dayYmd: day,
      result: (cp?.resultSummary as T) ?? (null as T),
      fromCheckpoint: true,
    });
  }

  for (const day of plan.remainingDays) {
    const t0 = Date.now();
    writeDayCheckpoint(
      createDayCheckpoint(opts.identity, day, { status: "in_progress" }),
      opts.checkpointRoot
    );
    try {
      const out = await opts.runDay(day);
      const cp = createDayCheckpoint(opts.identity, day, {
        status: "completed",
        pitStatus: out.pitStatus ?? "UNKNOWN",
        asOfCount: out.asOfCount ?? 0,
        recordsHash: out.recordsHash ?? "",
        wallMs: Date.now() - t0,
        resultSummary:
          out.resultSummary ??
          (typeof out.result === "object" && out.result !== null
            ? (out.result as Record<string, unknown>)
            : { value: out.result }),
      });
      writeDayCheckpoint(cp, opts.checkpointRoot);
      opts.onDayComplete?.(cp, out.result);
      results.push({ dayYmd: day, result: out.result, fromCheckpoint: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeDayCheckpoint(
        createDayCheckpoint(opts.identity, day, {
          status: "failed",
          wallMs: Date.now() - t0,
          errorMessage: message,
        }),
        opts.checkpointRoot
      );
      throw err;
    }
  }

  const finalPlan = planResume(
    opts.identity,
    opts.plannedDays,
    opts.checkpointRoot
  );
  writeJobIndex(finalPlan, opts.checkpointRoot);

  results.sort((a, b) => a.dayYmd.localeCompare(b.dayYmd));
  return { plan: finalPlan, results };
}
