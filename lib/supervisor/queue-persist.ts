import fs from "fs";
import path from "path";
import type { QueueSnapshot } from "./types";

export const QUEUE_BACKUP_SUFFIX = ".bak";
export const QUEUE_TEMP_SUFFIX = ".tmp";

function isValidSnapshot(raw: unknown): raw is QueueSnapshot {
  if (!raw || typeof raw !== "object") return false;
  const snapshot = raw as QueueSnapshot;
  return typeof snapshot.maxSize === "number" && Array.isArray(snapshot.tasks);
}

export type QueueLoadSource = "primary" | "backup" | "empty";

/** Load queue.json, falling back to queue.json.bak when primary is missing or corrupt. */
export function loadQueueSnapshot(
  queuePath: string,
  fallbackMaxSize: number,
): { snapshot: QueueSnapshot; source: QueueLoadSource } {
  const candidates: Array<{ path: string; source: QueueLoadSource }> = [
    { path: queuePath, source: "primary" },
    { path: `${queuePath}${QUEUE_BACKUP_SUFFIX}`, source: "backup" },
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.path)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(candidate.path, "utf8"));
      if (isValidSnapshot(raw)) {
        return { snapshot: raw, source: candidate.source };
      }
    } catch {
      continue;
    }
  }

  return { snapshot: { maxSize: fallbackMaxSize, tasks: [] }, source: "empty" };
}

/** Atomic queue write: tmp → rename, with pre-write backup of the last good file. */
export function atomicWriteQueueSnapshot(queuePath: string, snapshot: QueueSnapshot): void {
  const dir = path.dirname(queuePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${queuePath}${QUEUE_TEMP_SUFFIX}`;
  const bakPath = `${queuePath}${QUEUE_BACKUP_SUFFIX}`;
  const content = JSON.stringify(snapshot, null, 2);

  fs.writeFileSync(tmpPath, content, "utf8");

  if (fs.existsSync(queuePath)) {
    fs.copyFileSync(queuePath, bakPath);
  }

  try {
    fs.renameSync(tmpPath, queuePath);
  } catch {
    if (fs.existsSync(queuePath)) {
      fs.unlinkSync(queuePath);
    }
    fs.renameSync(tmpPath, queuePath);
  }
}
