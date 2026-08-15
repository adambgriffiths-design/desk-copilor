/**
 * Time-indexed DecisionEnvelope history — separate LIVE and HISTORICAL lanes.
 * Lanes never mix. Authoritative envelopes only (pipeline DecisionEnvelope).
 *
 * Storage modes:
 * - ram-only (local / tests, no Redis env): process L1 rings only (existing behaviour).
 * - redis (UPSTASH_* or KV_REST_* present, or test mock injected): Redis is SoT;
 *   L1 is same-isolate cache. Hydrate before cross-isolate reads; flush after writes.
 */
import type { DecisionEnvelope } from "./decision-envelope";
import {
  DECISION_MEMORY_HIST_INDEX_KEY,
  DECISION_MEMORY_LIVE_KEY,
  DECISION_MEMORY_MAX_ENTRIES,
  decisionMemoryStoreMode,
  getDecisionMemoryBackend,
  historicalDecisionMemoryKey,
  resolveDecisionMemoryTtlSeconds,
  type DecisionMemoryBackend,
} from "./decision-memory-backend";

export type DecisionHistoryLane = "LIVE" | "HISTORICAL";

export type DecisionHistoryMarketState = {
  price?: number | null;
  stateHash?: string | null;
  snapshotId?: string | null;
  htfBias?: string | null;
  structure?: string | null;
  displacement?: string | null;
  fvgStatus?: string | null;
  verdict?: string | null;
};

export type DecisionEnvelopeHistoryEntry = {
  id: string;
  asOf: string;
  recordedAt: string;
  lane: DecisionHistoryLane;
  /** Alias for callers that prefer dataMode naming */
  dataMode: DecisionHistoryLane;
  stance: DecisionEnvelope["stance"];
  verdict: string;
  confidence: DecisionEnvelope["confidence"];
  stateHash: string;
  envelope: DecisionEnvelope;
  thesis: DecisionEnvelope["thesis"];
  conflicts: DecisionEnvelope["conflictLog"];
  invalidation: DecisionEnvelope["invalidation"];
  marketState?: DecisionHistoryMarketState;
  fixtureId?: string;
  barIndex?: number;
  asOfEst?: string;
  /**
   * Frozen identity from original DecisionEnvelope record time.
   * Prefer this over synthesizing at reply time.
   */
  decisionKey?: string;
  /** Execution scaffold entry status at record time (ACTIVE / WAIT / EXTENDED). */
  entryStatus?: string;
};

/** Top-level recorded status — same vocabulary as TradingVerdict. */
export type RecordedDecisionStatus = "LONG" | "SHORT" | "WAIT" | "NO_TRADE";

/** Normalize stored verdict/stance to LONG|SHORT|WAIT|NO_TRADE. */
export function normalizeRecordedStatus(
  verdict?: string | null,
  stance?: string | null
): RecordedDecisionStatus {
  const v = String(verdict || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (v === "LONG" || v === "SHORT" || v === "WAIT" || v === "NO_TRADE") return v;
  if (v === "NO TRADE" || v === "NOTRADE") return "NO_TRADE";
  const s = String(stance || "")
    .trim()
    .toLowerCase();
  if (s === "long") return "LONG";
  if (s === "short") return "SHORT";
  if (s === "wait" || s === "monitor") return "WAIT";
  if (s === "flat") return "WAIT";
  return "NO_TRADE";
}

/** Build a stable decisionKey once at record time (caller may override). */
export function synthesizeDecisionKey(opts: {
  lane: DecisionHistoryLane;
  asOf: string;
  stance: string;
  verdict: string;
  fixtureId?: string;
  barIndex?: number;
}): string {
  const id = opts.fixtureId || opts.lane;
  const bar = opts.barIndex != null && Number.isFinite(opts.barIndex) ? opts.barIndex : "?";
  return `${id}@${bar}|${opts.stance}|${opts.verdict}|${opts.asOf}`;
}

const MAX_LIVE = DECISION_MEMORY_MAX_ENTRIES;
const MAX_HISTORICAL = DECISION_MEMORY_MAX_ENTRIES;

let liveHistory: DecisionEnvelopeHistoryEntry[] = [];
let historicalHistory: DecisionEnvelopeHistoryEntry[] = [];
let suppressDepth = 0;
let seq = 0;
let persistChain: Promise<void> = Promise.resolve();
let redisUnavailable = false;

export function withDecisionHistorySuppressed<T>(fn: () => T): T {
  suppressDepth += 1;
  try {
    return fn();
  } finally {
    suppressDepth -= 1;
  }
}

/** Alias used by time-travel builders. */
export function withSuppressedDecisionHistoryRecord<T>(fn: () => T): T {
  return withDecisionHistorySuppressed(fn);
}

export function isDecisionHistorySuppressed(): boolean {
  return suppressDepth > 0;
}

export function isDecisionHistoryRecordSuppressed(): boolean {
  return suppressDepth > 0;
}

function parseEntry(raw: string): DecisionEnvelopeHistoryEntry | null {
  try {
    const v = JSON.parse(raw) as DecisionEnvelopeHistoryEntry;
    if (!v || typeof v !== "object" || !v.envelope || !v.asOf) return null;
    return v;
  } catch {
    return null;
  }
}

function liveDedupHit(
  last: DecisionEnvelopeHistoryEntry | null | undefined,
  entry: DecisionEnvelopeHistoryEntry
): boolean {
  if (!last) return false;
  return (
    last.stateHash === entry.stateHash &&
    last.stance === entry.stance &&
    Math.abs(Date.parse(last.asOf) - Date.parse(entry.asOf)) < 60_000
  );
}

function historicalDedupHit(
  last: DecisionEnvelopeHistoryEntry | null | undefined,
  entry: DecisionEnvelopeHistoryEntry
): boolean {
  if (!last) return false;
  return (
    last.stateHash === entry.stateHash &&
    last.fixtureId === entry.fixtureId &&
    last.barIndex === entry.barIndex
  );
}

function enqueuePersist(fn: () => Promise<void>): void {
  persistChain = persistChain
    .then(fn)
    .catch(() => {
      redisUnavailable = true;
    });
}

/** Await pending Redis writes (Analyse / pipeline request end). */
export async function flushDecisionMemoryWrites(): Promise<void> {
  await persistChain;
}

/**
 * Load shared store into L1. Redis is SoT when configured.
 * On Redis failure: clear the target lane L1 → honest miss (never invent).
 */
export async function hydrateDecisionMemoryFromStore(opts?: {
  lane?: DecisionHistoryLane;
  fixtureId?: string;
}): Promise<{ ok: boolean; mode: "ram-only" | "redis" }> {
  const mode = decisionMemoryStoreMode();
  if (mode === "ram-only") return { ok: true, mode };
  const backend = getDecisionMemoryBackend();
  if (!backend) return { ok: true, mode: "ram-only" };

  const lane = opts?.lane;
  try {
    if (!lane || lane === "LIVE") {
      const raw = await backend.lrange(DECISION_MEMORY_LIVE_KEY, 0, -1);
      liveHistory = raw.map(parseEntry).filter((e): e is DecisionEnvelopeHistoryEntry => !!e);
    }
    if (!lane || lane === "HISTORICAL") {
      if (opts?.fixtureId) {
        const key = historicalDecisionMemoryKey(opts.fixtureId);
        const raw = await backend.lrange(key, 0, -1);
        const loaded = raw.map(parseEntry).filter((e): e is DecisionEnvelopeHistoryEntry => !!e);
        historicalHistory = [
          ...historicalHistory.filter((e) => e.fixtureId !== opts.fixtureId),
          ...loaded,
        ];
      } else {
        const fixtures = await backend.smembers(DECISION_MEMORY_HIST_INDEX_KEY);
        const all: DecisionEnvelopeHistoryEntry[] = [];
        for (const fid of fixtures) {
          const raw = await backend.lrange(historicalDecisionMemoryKey(fid), 0, -1);
          for (const r of raw) {
            const e = parseEntry(r);
            if (e) all.push(e);
          }
        }
        historicalHistory = all;
      }
    }
    redisUnavailable = false;
    return { ok: true, mode: "redis" };
  } catch {
    redisUnavailable = true;
    if (!lane || lane === "LIVE") liveHistory = [];
    if (!lane || lane === "HISTORICAL") {
      if (opts?.fixtureId) {
        historicalHistory = historicalHistory.filter((e) => e.fixtureId !== opts.fixtureId);
      } else {
        historicalHistory = [];
      }
    }
    return { ok: false, mode: "redis" };
  }
}

function persistEntry(backend: DecisionMemoryBackend, entry: DecisionEnvelopeHistoryEntry): void {
  const ttl = resolveDecisionMemoryTtlSeconds();
  const json = JSON.stringify(entry);

  if (entry.lane === "LIVE") {
    enqueuePersist(async () => {
      await backend.appendTrimExpire({
        key: DECISION_MEMORY_LIVE_KEY,
        value: json,
        maxLen: MAX_LIVE,
        ttlSeconds: ttl,
        shouldSkip: (tailJson) => {
          if (!tailJson) return false;
          const tail = parseEntry(tailJson);
          return liveDedupHit(tail, entry);
        },
      });
    });
    return;
  }

  const fixtureId = entry.fixtureId || "_none";
  const key = historicalDecisionMemoryKey(fixtureId);
  enqueuePersist(async () => {
    await backend.sadd(DECISION_MEMORY_HIST_INDEX_KEY, fixtureId);
    await backend.appendTrimExpire({
      key,
      value: json,
      maxLen: MAX_HISTORICAL,
      ttlSeconds: ttl,
      shouldSkip: (tailJson) => {
        if (!tailJson) return false;
        const tail = parseEntry(tailJson);
        return historicalDedupHit(tail, entry);
      },
    });
  });
}

/**
 * Clear L1 and, when Redis is configured, delete shared keys.
 * Async Redis deletes are best-effort (queued); await flushDecisionMemoryWrites after.
 */
export function clearDecisionEnvelopeHistory(lane?: DecisionHistoryLane): void {
  if (!lane || lane === "LIVE") liveHistory = [];
  if (!lane || lane === "HISTORICAL") historicalHistory = [];

  const backend = getDecisionMemoryBackend();
  if (!backend) return;

  enqueuePersist(async () => {
    if (!lane || lane === "LIVE") {
      await backend.del(DECISION_MEMORY_LIVE_KEY);
    }
    if (!lane || lane === "HISTORICAL") {
      const fixtures = await backend.smembers(DECISION_MEMORY_HIST_INDEX_KEY);
      for (const fid of fixtures) {
        await backend.del(historicalDecisionMemoryKey(fid));
      }
      await backend.del(DECISION_MEMORY_HIST_INDEX_KEY);
    }
  });
}

/** Clear L1 only (simulate cold isolate). Does not touch Redis. */
export function clearDecisionEnvelopeHistoryL1(lane?: DecisionHistoryLane): void {
  if (!lane || lane === "LIVE") liveHistory = [];
  if (!lane || lane === "HISTORICAL") historicalHistory = [];
}

export function getDecisionEnvelopeHistory(
  lane: DecisionHistoryLane
): DecisionEnvelopeHistoryEntry[] {
  // L1 is a same-isolate cache. After a failed hydrate, L1 for that lane is cleared
  // so cold isolates return an honest empty miss — never invent. Same-isolate L1
  // after a local write remains readable even if a background persist failed.
  return lane === "LIVE" ? [...liveHistory] : [...historicalHistory];
}

export type RecordDecisionEnvelopeInput = {
  asOf: string | Date;
  lane?: DecisionHistoryLane;
  /** @deprecated prefer lane */
  dataMode?: DecisionHistoryLane;
  envelope: DecisionEnvelope;
  verdict?: string;
  stateHash?: string;
  marketState?: DecisionHistoryMarketState;
  fixtureId?: string;
  barIndex?: number;
  asOfEst?: string;
  decisionKey?: string;
  entryStatus?: string;
  /** Record even while suppressed (explicit historical PIT capture). */
  force?: boolean;
};

export function recordDecisionEnvelopeHistory(
  input: RecordDecisionEnvelopeInput
): DecisionEnvelopeHistoryEntry | null {
  const lane = input.lane || input.dataMode;
  if (!lane) return null;
  if (suppressDepth > 0 && !input.force) return null;
  if (!input.envelope) return null;

  const asOf =
    input.asOf instanceof Date ? input.asOf.toISOString() : String(input.asOf || "").trim();
  if (!asOf) return null;

  const stateHash =
    input.stateHash ||
    input.marketState?.stateHash ||
    `${lane}:${asOf}:${input.envelope.stance}`;

  const verdict = String(input.verdict || input.marketState?.verdict || input.envelope.stance);
  const decisionKey =
    (input.decisionKey && String(input.decisionKey).trim()) ||
    synthesizeDecisionKey({
      lane,
      asOf,
      stance: input.envelope.stance,
      verdict,
      fixtureId: input.fixtureId,
      barIndex: input.barIndex,
    });
  const entryStatus =
    input.entryStatus != null && String(input.entryStatus).trim()
      ? String(input.entryStatus).trim()
      : undefined;

  const entry: DecisionEnvelopeHistoryEntry = {
    id: `deh-${Date.now().toString(36)}-${(++seq).toString(36)}`,
    asOf,
    recordedAt: new Date().toISOString(),
    lane,
    dataMode: lane,
    stance: input.envelope.stance,
    verdict,
    confidence: input.envelope.confidence,
    stateHash: String(stateHash),
    envelope: input.envelope,
    thesis: input.envelope.thesis,
    conflicts: input.envelope.conflictLog,
    invalidation: input.envelope.invalidation,
    marketState: input.marketState,
    fixtureId: input.fixtureId,
    barIndex: input.barIndex,
    asOfEst: input.asOfEst,
    decisionKey,
    entryStatus,
  };

  if (lane === "LIVE") {
    const last = liveHistory[liveHistory.length - 1];
    if (liveDedupHit(last, entry)) {
      return last;
    }
    liveHistory = [...liveHistory, entry].slice(-MAX_LIVE);
  } else {
    const last = historicalHistory[historicalHistory.length - 1];
    if (historicalDedupHit(last, entry)) {
      return last;
    }
    historicalHistory = [...historicalHistory, entry].slice(-MAX_HISTORICAL);
  }

  const backend = getDecisionMemoryBackend();
  if (backend) {
    persistEntry(backend, entry);
  }
  return entry;
}

export function findDecisionAtOrBefore(
  lane: DecisionHistoryLane,
  targetAsOf: string | Date,
  opts?: { fixtureId?: string; maxSkewMs?: number }
): DecisionEnvelopeHistoryEntry | null {
  const target = targetAsOf instanceof Date ? targetAsOf.getTime() : Date.parse(String(targetAsOf));
  if (!Number.isFinite(target)) return null;
  const list = getDecisionEnvelopeHistory(lane);
  let best: DecisionEnvelopeHistoryEntry | null = null;
  for (const e of list) {
    if (opts?.fixtureId && e.fixtureId && e.fixtureId !== opts.fixtureId) continue;
    const t = Date.parse(e.asOf);
    if (!Number.isFinite(t) || t > target) continue;
    if (!best || Date.parse(best.asOf) < t) best = e;
  }
  if (!best) return null;
  if (typeof opts?.maxSkewMs === "number" && Number.isFinite(opts.maxSkewMs)) {
    if (target - Date.parse(best.asOf) > opts.maxSkewMs) return null;
  }
  return best;
}

export function latestDecisionEnvelope(
  lane: DecisionHistoryLane,
  opts?: { fixtureId?: string }
): DecisionEnvelopeHistoryEntry | null {
  const list = getDecisionEnvelopeHistory(lane);
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]!;
    if (opts?.fixtureId && e.fixtureId && e.fixtureId !== opts.fixtureId) continue;
    return e;
  }
  return null;
}

/** Latest recorded entry with asOf strictly before target (not at-or-before). */
export function findDecisionStrictlyBefore(
  lane: DecisionHistoryLane,
  targetAsOf: string | Date,
  opts?: { fixtureId?: string }
): DecisionEnvelopeHistoryEntry | null {
  const target = targetAsOf instanceof Date ? targetAsOf.getTime() : Date.parse(String(targetAsOf));
  if (!Number.isFinite(target)) return null;
  const list = getDecisionEnvelopeHistory(lane);
  let best: DecisionEnvelopeHistoryEntry | null = null;
  for (const e of list) {
    if (opts?.fixtureId && e.fixtureId && e.fixtureId !== opts.fixtureId) continue;
    const t = Date.parse(e.asOf);
    if (!Number.isFinite(t) || t >= target) continue;
    if (!best || Date.parse(best.asOf) < t) best = e;
  }
  return best;
}

/** Test/ops helper: reset redis-unavailable flag. */
export function resetDecisionMemoryAvailabilityForTests(): void {
  redisUnavailable = false;
  persistChain = Promise.resolve();
}

export function isDecisionMemoryMarkedUnavailable(): boolean {
  return redisUnavailable;
}

export function markDecisionMemoryUnavailableForTests(): void {
  redisUnavailable = true;
}
