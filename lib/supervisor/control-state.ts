/**
 * Persistent human override control state — survives supervisor restart.
 */
import fs from "fs";
import path from "path";
import { atomicWriteQueueSnapshot, loadQueueSnapshot, QUEUE_BACKUP_SUFFIX } from "./queue-persist";
import { ensureSupervisorDataRoot, SUPERVISOR_DATA_ROOT } from "./paths";
import type { SupervisorControlMode, SupervisorControlState } from "./types";

export const SUPERVISOR_CONTROL_PATH = path.join(SUPERVISOR_DATA_ROOT, "control.json");
const CONTROL_TEMP_SUFFIX = ".tmp";
const CONTROL_BACKUP_SUFFIX = ".bak";

const DEFAULT_CONTROL: SupervisorControlState = {
  version: 1,
  mode: "autonomous",
  updatedAt: new Date(0).toISOString(),
};

function controlPath(root: string): string {
  return path.join(root, "control.json");
}

function isValidControl(raw: unknown): raw is SupervisorControlState {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as SupervisorControlState;
  return (
    c.version === 1 &&
    (c.mode === "autonomous" || c.mode === "paused" || c.mode === "stopped")
  );
}

export function loadControlState(root: string = SUPERVISOR_DATA_ROOT): SupervisorControlState {
  const primary = controlPath(root);
  const backup = `${primary}${CONTROL_BACKUP_SUFFIX}`;
  for (const p of [primary, backup]) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      if (isValidControl(raw)) return raw;
    } catch {
      continue;
    }
  }
  return { ...DEFAULT_CONTROL, updatedAt: new Date().toISOString() };
}

export function atomicWriteControlState(
  state: SupervisorControlState,
  root: string = SUPERVISOR_DATA_ROOT,
): void {
  ensureSupervisorDataRoot(root);
  const target = controlPath(root);
  const tmp = `${target}${CONTROL_TEMP_SUFFIX}`;
  const bak = `${target}${CONTROL_BACKUP_SUFFIX}`;
  const content = JSON.stringify(state, null, 2);
  fs.writeFileSync(tmp, content, "utf8");
  if (fs.existsSync(target)) {
    fs.copyFileSync(target, bak);
  }
  try {
    fs.renameSync(tmp, target);
  } catch {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.renameSync(tmp, target);
  }
}

export function saveControlState(
  patch: Partial<SupervisorControlState> & { mode?: SupervisorControlMode },
  root: string = SUPERVISOR_DATA_ROOT,
): SupervisorControlState {
  const current = loadControlState(root);
  const next: SupervisorControlState = {
    ...current,
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  atomicWriteControlState(next, root);
  return next;
}

export function shouldDispatchNewTasks(control: SupervisorControlState): boolean {
  return control.mode === "autonomous";
}

export function shouldTerminateRunning(control: SupervisorControlState): boolean {
  return control.mode === "stopped" && control.terminateRunningRequested === true;
}

export function isPausedOrStopped(control: SupervisorControlState): boolean {
  return control.mode === "paused" || control.mode === "stopped";
}

/** Re-export atomic queue write for intervention layer tests. */
export { atomicWriteQueueSnapshot, loadQueueSnapshot, QUEUE_BACKUP_SUFFIX };
