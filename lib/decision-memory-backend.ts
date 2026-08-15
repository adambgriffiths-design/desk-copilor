/**
 * Decision memory shared-store backend (Redis-compatible lists).
 * Production: Upstash Redis REST (also accepts Vercel KV env aliases).
 * Tests: in-memory mock — no credentials required.
 *
 * Server-side only. Never log URL/token/secrets.
 */

export const DECISION_MEMORY_LIVE_KEY = "karen:decision:LIVE";
export const DECISION_MEMORY_HIST_INDEX_KEY = "karen:decision:HISTORICAL:__index";
export const DECISION_MEMORY_MAX_ENTRIES = 80;
/** Conservative session-scale default (24h). Override via KAREN_DECISION_MEMORY_TTL_SECONDS. */
export const DECISION_MEMORY_DEFAULT_TTL_SECONDS = 86_400;

export type DecisionMemoryBackendKind = "none" | "memory" | "upstash";

export type DecisionMemoryBackend = {
  kind: DecisionMemoryBackendKind;
  /** Sync write-through available (in-memory mock). */
  syncCapable: boolean;
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
  lindex(key: string, index: number): Promise<string | null>;
  expire(key: string, seconds: number): Promise<void>;
  del(key: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  /** Atomic-ish append path: LINDEX -1, optional skip, RPUSH, LTRIM, EXPIRE. */
  appendTrimExpire(opts: {
    key: string;
    value: string;
    maxLen: number;
    ttlSeconds: number;
    /** Return true to skip RPUSH (dedup hit against current tail). */
    shouldSkip?: (tailJson: string | null) => boolean;
  }): Promise<"appended" | "skipped">;
};

export function historicalDecisionMemoryKey(fixtureId: string): string {
  const id = String(fixtureId || "").trim() || "_none";
  return `karen:decision:HISTORICAL:${id}`;
}

export function resolveDecisionMemoryTtlSeconds(): number {
  const raw = process.env.KAREN_DECISION_MEMORY_TTL_SECONDS;
  if (raw == null || String(raw).trim() === "") return DECISION_MEMORY_DEFAULT_TTL_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DECISION_MEMORY_DEFAULT_TTL_SECONDS;
  return Math.floor(n);
}

export function readUpstashRestConfig(): { url: string; token: string } | null {
  const url =
    String(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim() ||
    "";
  const token =
    String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "").trim() ||
    "";
  if (!url || !token) return null;
  return { url, token };
}

/** True when Redis env is present (production shared-store mode). */
export function isDecisionMemoryRedisConfigured(): boolean {
  return readUpstashRestConfig() != null;
}

// --- In-memory mock (unit tests / isolate simulation) ---

export function createMemoryDecisionMemoryBackend(): DecisionMemoryBackend {
  const lists = new Map<string, string[]>();
  const sets = new Map<string, Set<string>>();

  const backend: DecisionMemoryBackend = {
    kind: "memory",
    syncCapable: true,
    async rpush(key, value) {
      const arr = lists.get(key) || [];
      arr.push(value);
      lists.set(key, arr);
      return arr.length;
    },
    async lrange(key, start, stop) {
      const arr = lists.get(key) || [];
      const len = arr.length;
      let s = start < 0 ? Math.max(0, len + start) : start;
      let e = stop < 0 ? len + stop : stop;
      if (e >= len) e = len - 1;
      if (s < 0) s = 0;
      if (s > e || s >= len) return [];
      return arr.slice(s, e + 1);
    },
    async ltrim(key, start, stop) {
      const arr = await backend.lrange(key, start, stop);
      lists.set(key, arr);
    },
    async lindex(key, index) {
      const arr = lists.get(key) || [];
      const i = index < 0 ? arr.length + index : index;
      if (i < 0 || i >= arr.length) return null;
      return arr[i] ?? null;
    },
    async expire() {
      /* TTL is a no-op in the mock; cap is enforced via LTRIM. */
    },
    async del(key) {
      lists.delete(key);
      sets.delete(key);
    },
    async sadd(key, member) {
      const set = sets.get(key) || new Set<string>();
      set.add(member);
      sets.set(key, set);
    },
    async smembers(key) {
      return [...(sets.get(key) || [])];
    },
    async appendTrimExpire(opts) {
      const tail = await backend.lindex(opts.key, -1);
      if (opts.shouldSkip?.(tail)) return "skipped";
      await backend.rpush(opts.key, opts.value);
      await backend.ltrim(opts.key, -opts.maxLen, -1);
      await backend.expire(opts.key, opts.ttlSeconds);
      return "appended";
    },
  };
  return backend;
}

// --- Upstash / Vercel KV REST ---

type RedisResult = unknown;

async function upstashCommand(
  config: { url: string; token: string },
  command: (string | number)[]
): Promise<RedisResult> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`decision-memory redis HTTP ${res.status}`);
  }
  const body = (await res.json()) as { result?: RedisResult; error?: string };
  if (body.error) {
    throw new Error(`decision-memory redis: command failed`);
  }
  return body.result;
}

async function upstashPipeline(
  config: { url: string; token: string },
  commands: (string | number)[][]
): Promise<RedisResult[]> {
  const pipelineUrl = config.url.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(pipelineUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    throw new Error(`decision-memory redis pipeline HTTP ${res.status}`);
  }
  const body = (await res.json()) as Array<{ result?: RedisResult; error?: string }>;
  if (!Array.isArray(body)) {
    throw new Error("decision-memory redis: bad pipeline response");
  }
  for (const row of body) {
    if (row?.error) throw new Error("decision-memory redis: pipeline command failed");
  }
  return body.map((row) => row.result);
}

export function createUpstashDecisionMemoryBackend(config: {
  url: string;
  token: string;
}): DecisionMemoryBackend {
  const backend: DecisionMemoryBackend = {
    kind: "upstash",
    syncCapable: false,
    async rpush(key, value) {
      const result = await upstashCommand(config, ["RPUSH", key, value]);
      return typeof result === "number" ? result : Number(result) || 0;
    },
    async lrange(key, start, stop) {
      const result = await upstashCommand(config, ["LRANGE", key, start, stop]);
      return Array.isArray(result) ? (result as string[]) : [];
    },
    async ltrim(key, start, stop) {
      await upstashCommand(config, ["LTRIM", key, start, stop]);
    },
    async lindex(key, index) {
      const result = await upstashCommand(config, ["LINDEX", key, index]);
      return result == null ? null : String(result);
    },
    async expire(key, seconds) {
      await upstashCommand(config, ["EXPIRE", key, seconds]);
    },
    async del(key) {
      await upstashCommand(config, ["DEL", key]);
    },
    async sadd(key, member) {
      await upstashCommand(config, ["SADD", key, member]);
    },
    async smembers(key) {
      const result = await upstashCommand(config, ["SMEMBERS", key]);
      return Array.isArray(result) ? (result as string[]) : [];
    },
    async appendTrimExpire(opts) {
      const tail = await backend.lindex(opts.key, -1);
      if (opts.shouldSkip?.(tail)) return "skipped";
      await upstashPipeline(config, [
        ["RPUSH", opts.key, opts.value],
        ["LTRIM", opts.key, -opts.maxLen, -1],
        ["EXPIRE", opts.key, opts.ttlSeconds],
      ]);
      return "appended";
    },
  };
  return backend;
}

let injectedBackend: DecisionMemoryBackend | null | undefined;
let cachedUpstash: DecisionMemoryBackend | null | undefined;

/**
 * Test seam: inject in-memory Redis mock, or `null` to force RAM-only,
 * or `undefined` to restore auto detection.
 */
export function setDecisionMemoryBackendForTests(
  backend: DecisionMemoryBackend | null | undefined
): void {
  injectedBackend = backend;
  cachedUpstash = undefined;
}

export function getDecisionMemoryBackend(): DecisionMemoryBackend | null {
  if (injectedBackend !== undefined) return injectedBackend;
  const cfg = readUpstashRestConfig();
  if (!cfg) return null;
  if (!cachedUpstash) {
    cachedUpstash = createUpstashDecisionMemoryBackend(cfg);
  }
  return cachedUpstash;
}

export function decisionMemoryStoreMode(): "ram-only" | "redis" {
  return getDecisionMemoryBackend() != null ? "redis" : "ram-only";
}
