import fs from "fs";
import path from "path";
import { listPendingTasks, type InboxTaskPayload } from "./pickup";
import { ensureSupervisorDirs, SUPERVISOR_DATA_ROOT, SUPERVISOR_INBOX_DIR } from "./paths";

export const PENDING_PICKUP_PATH = path.join(SUPERVISOR_DATA_ROOT, "pending-pickup.json");

export interface PendingPickupSignal {
  updatedAt: string;
  pendingCount: number;
  oldest?: { id: string; title: string; dispatchedAt: string };
}

/** Write or clear the live-pickup signal consumed by Cursor rules / hooks. */
export function refreshPendingPickupSignal(inboxDir: string = SUPERVISOR_INBOX_DIR): PendingPickupSignal | null {
  const pending = listPendingTasks(inboxDir);
  ensureSupervisorDirs();
  if (!pending.length) {
    if (fs.existsSync(PENDING_PICKUP_PATH)) fs.unlinkSync(PENDING_PICKUP_PATH);
    return null;
  }

  const oldest = pending[0]!;
  const signal: PendingPickupSignal = {
    updatedAt: new Date().toISOString(),
    pendingCount: pending.length,
    oldest: { id: oldest.id, title: oldest.title, dispatchedAt: oldest.dispatchedAt },
  };
  fs.writeFileSync(PENDING_PICKUP_PATH, JSON.stringify(signal, null, 2), "utf8");
  return signal;
}

export function readPendingPickupSignal(): PendingPickupSignal | null {
  if (!fs.existsSync(PENDING_PICKUP_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(PENDING_PICKUP_PATH, "utf8")) as PendingPickupSignal;
  } catch {
    return null;
  }
}

export function formatLivePickupContext(pending: InboxTaskPayload[]): string {
  if (!pending.length) return "";
  const next = pending[0]!;
  return [
    "## Supervisor LIVE PICKUP",
    `${pending.length} pending task(s) in data/supervisor/inbox/`,
    `Next: ${next.title} (${next.id})`,
    "Run `npm run supervisor:pickup` immediately to claim and execute.",
    "Write report to data/supervisor/results/{id}.md, then `npm run supervisor:pickup -- --complete --id {id}`.",
  ].join("\n");
}

export function getLivePickupDocumentation(): string {
  return [
    "## Live pickup (active Cursor session)",
    "Dispatch writes data/supervisor/pending-pickup.json when inbox has pending tasks.",
    "Cursor rule supervisor-pickup.mdc (alwaysApply) instructs agent to claim on session start.",
    "Optional: npm run supervisor:pickup -- --watch (daemon refreshes signal).",
    "On live timeout, runner releases inbox claim and keeps queue task running for resume.",
  ].join("\n");
}
