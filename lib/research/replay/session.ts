import { randomUUID } from "crypto";
import type { LockedVerdict, ReplaySession } from "./types";

const sessions = new Map<string, ReplaySession>();

export function createReplaySession(fixtureId: string, asOf: string): ReplaySession {
  const session: ReplaySession = {
    id: randomUUID(),
    fixtureId,
    asOf,
    locked: null,
    revealCount: 0,
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getReplaySession(id: string): ReplaySession | undefined {
  return sessions.get(id);
}

export function lockVerdict(sessionId: string, verdict: LockedVerdict): ReplaySession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.locked) throw new Error("Verdict already locked — immutable");
  session.locked = { ...verdict, lockedAt: new Date().toISOString() };
  sessions.set(sessionId, session);
  return session;
}

export function recordReveal(sessionId: string): ReplaySession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (!session.locked) throw new Error("Must lock verdict before reveal");
  session.revealCount += 1;
  sessions.set(sessionId, session);
  return session;
}

/** Test helper — reset in-memory store. */
export function clearReplaySessions(): void {
  sessions.clear();
}
