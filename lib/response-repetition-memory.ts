/**
 * Conversation/session repetition memory — wording only.
 *
 * NOT trading decision memory. Never stores or mutates DecisionEnvelope truth.
 * Prefer mining recent chat messages; keep a small in-process ring for
 * same-isolate diversity (jokes, openings, exact reply hashes).
 */

export type ResponseFamily =
  | "joke"
  | "ask_me"
  | "ack"
  | "stance"
  | "wait_followup"
  | "why_not"
  | "invalidation"
  | "quality_gate"
  | "history"
  | "levels"
  | "price"
  | "data_quality"
  | "market_closed"
  | "general"
  | "rephrase";

export type MemoryEntry = {
  family: ResponseFamily;
  /** Stable id when applicable (e.g. joke id). */
  id?: string;
  /** Normalized reply fingerprint for exact-dupe detection. */
  fingerprint: string;
  openingFp: string;
  at: number;
};

export type ConversationTurn = { role: string; content: string };

const RING_MAX = 40;
const ring: MemoryEntry[] = [];

export function resetResponseRepetitionMemory(): void {
  ring.length = 0;
}

export function normalizeReplyFingerprint(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/["""']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export function openingFingerprint(text: string): string {
  const first =
    String(text || "")
      .trim()
      .split(/[.!?\n]/)[0]
      ?.trim()
      .toLowerCase()
      .replace(/^["']+|["']+$/g, "") || "";
  if (/^i(?:'m| am)\s+waiting\b/.test(first)) return "im_waiting";
  if (/^right now\b/.test(first)) return "right_now";
  if (/^at the moment\b/.test(first)) return "at_the_moment";
  if (/^looks like\b/.test(first)) return "looks_like";
  return first.split(/\s+/).filter(Boolean).slice(0, 3).join(" ") || "empty";
}

export function rememberResponse(
  family: ResponseFamily,
  text: string,
  id?: string
): void {
  const fingerprint = normalizeReplyFingerprint(text);
  if (!fingerprint) return;
  ring.push({
    family,
    id,
    fingerprint,
    openingFp: openingFingerprint(text),
    at: Date.now(),
  });
  while (ring.length > RING_MAX) ring.shift();
}

export function recentFingerprints(family?: ResponseFamily, limit = 20): string[] {
  const rows = family ? ring.filter((e) => e.family === family) : ring;
  return rows.slice(-limit).map((e) => e.fingerprint);
}

export function recentIds(family: ResponseFamily, limit = 20): string[] {
  return ring
    .filter((e) => e.family === family && e.id)
    .slice(-limit)
    .map((e) => e.id!);
}

export function recentOpenings(limit = 12): string[] {
  return ring.slice(-limit).map((e) => e.openingFp);
}

export function wasRecentExact(text: string, family?: ResponseFamily): boolean {
  const fp = normalizeReplyFingerprint(text);
  const rows = family ? ring.filter((e) => e.family === family) : ring;
  return rows.some((e) => e.fingerprint === fp);
}

/** Mine assistant turns from chat history for cheap continuity. */
export function fingerprintsFromMessages(
  messages: ConversationTurn[] | undefined,
  limit = 16
): string[] {
  if (!messages?.length) return [];
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0 && out.length < limit; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const fp = normalizeReplyFingerprint(m.content);
    if (fp) out.push(fp);
  }
  return out;
}

export function openingsFromMessages(
  messages: ConversationTurn[] | undefined,
  limit = 10
): string[] {
  if (!messages?.length) return [];
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0 && out.length < limit; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    out.push(openingFingerprint(m.content));
  }
  return out;
}

/** Detect follow-ups that ask for a different formulation of the prior answer. */
export function isRephraseFollowUp(question: string): boolean {
  const q = String(question || "").trim().toLowerCase();
  if (!q) return false;
  return (
    /^(another|another one|different one|a different one|one more|again)\b/.test(q) ||
    /\b(say that differently|explain that differently|explain (it |that )?another way|rephrase|put (it|that) another way|different (joke|one|way))\b/.test(
      q
    ) ||
    /\bwhat else\b/.test(q) ||
    /\btell me another\b/.test(q)
  );
}

export type PriorIntent =
  | "joke"
  | "ask_me"
  | "wait_explain"
  | "market_read"
  | "invalidation"
  | "why_not"
  | "watching"
  | "general"
  | null;

export function inferPriorIntent(
  messages: ConversationTurn[] | undefined,
  question?: string
): PriorIntent {
  const q = String(question || "").trim().toLowerCase();
  if (/\bjoke|funny\b/.test(q)) return "joke";
  if (/\bask me (something|a question)\b/.test(q)) return "ask_me";

  if (!messages?.length) return null;
  // Walk recent user turns for intent anchor when current q is a bare follow-up.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const u = String(m.content || "").toLowerCase();
    if (/\bjoke|funny\b/.test(u)) return "joke";
    if (/\bask me (something|a question)\b/.test(u)) return "ask_me";
    if (/\bwhy (are you |you )?wait|explain why wait|what(?:'s| is) (?:the )?wait\b/.test(u)) {
      return "wait_explain";
    }
    if (/\bwhat (?:would|could) make (?:you |me )?long\b|\bwhy not long\b/.test(u)) {
      return "why_not";
    }
    if (/\binvalidat|\bwhat (?:would|could) kill\b/.test(u)) return "invalidation";
    if (/\bmarket read|current (?:stance|read)|what(?:'s| is) (?:your )?(?:bias|stance)\b/.test(u)) {
      return "market_read";
    }
    if (/\bwhat(?:'s| are) you watch|\bwatching\b/.test(u)) return "watching";
    // Stop after a few user turns so we don't over-anchor.
    if (i < messages.length - 6) break;
  }

  // Fallback: inspect last assistant content.
  const lastA = [...messages].reverse().find((m) => m.role === "assistant");
  const a = String(lastA?.content || "").toLowerCase();
  if (/why did|knock knock|walks into|trader|market/.test(a) && /\?/.test(a)) return "joke";
  if (/i(?:'m| am)\s+waiting|i(?:'m| am)\s+waiting for/.test(a)) return "wait_explain";
  if (/i(?:'m| am)\s+(long|short|no_trade|waiting)\b/.test(a)) return "market_read";
  return "general";
}

/**
 * Pick index into candidates preferring ones whose fingerprint/id
 * are not in recent memory or message history.
 */
export function pickDiverseIndex(opts: {
  count: number;
  fingerprints?: string[];
  ids?: Array<string | undefined>;
  family?: ResponseFamily;
  messages?: ConversationTurn[];
  /** Explicit index for tests. */
  variant?: number;
  /** Soft avoid opening fingerprints. */
  openings?: string[];
}): number {
  const n = Math.max(1, opts.count | 0);
  if (opts.variant != null && Number.isFinite(opts.variant)) {
    return ((Math.floor(opts.variant) % n) + n) % n;
  }

  const avoidFp = new Set([
    ...(opts.family ? recentFingerprints(opts.family) : recentFingerprints()),
    ...fingerprintsFromMessages(opts.messages),
  ]);
  const avoidIds = new Set(opts.family ? recentIds(opts.family) : []);
  const avoidOpen = new Set([
    ...recentOpenings(),
    ...(opts.openings || []),
    ...openingsFromMessages(opts.messages),
  ]);

  const scores: Array<{ i: number; score: number }> = [];
  for (let i = 0; i < n; i++) {
    let score = 0;
    const fp = opts.fingerprints?.[i];
    const id = opts.ids?.[i];
    const open = opts.openings?.[i];
    if (fp && avoidFp.has(normalizeReplyFingerprint(fp))) score -= 10;
    if (id && avoidIds.has(id)) score -= 12;
    if (open && avoidOpen.has(open)) score -= 4;
    if (open && (open === "im_waiting" || open === "right_now" || open === "at_the_moment" || open === "looks_like")) {
      if (avoidOpen.has(open)) score -= 3;
      else score -= 1;
    }
    scores.push({ i, score });
  }
  scores.sort((a, b) => b.score - a.score || a.i - b.i);
  const best = scores[0]?.score ?? 0;
  const top = scores.filter((s) => s.score === best).map((s) => s.i);
  // Rotate among equally good options using ring length as salt.
  const salt = ring.length + fingerprintsFromMessages(opts.messages).length;
  return top[salt % top.length] ?? 0;
}

/**
 * Select from a pool with id-aware exclusion. Recycles only when pool exhausted.
 */
export function selectFromPool<T extends { id: string; text: string }>(
  pool: T[],
  opts?: {
    family?: ResponseFamily;
    messages?: ConversationTurn[];
    variant?: number;
    remember?: boolean;
  }
): T {
  if (!pool.length) {
    throw new Error("selectFromPool: empty pool");
  }
  const family = opts?.family || "general";
  const used = new Set([
    ...recentIds(family),
    // Also treat exact text matches from chat as used.
    ...fingerprintsFromMessages(opts?.messages),
  ]);
  // Map fingerprints back: if assistant already said this joke text, skip.
  const fresh = pool.filter(
    (p) =>
      !used.has(p.id) &&
      !fingerprintsFromMessages(opts?.messages).includes(normalizeReplyFingerprint(p.text)) &&
      !recentFingerprints(family).includes(normalizeReplyFingerprint(p.text))
  );
  const candidates = fresh.length > 0 ? fresh : pool; // recycle only when exhausted
  const idx = pickDiverseIndex({
    count: candidates.length,
    fingerprints: candidates.map((c) => c.text),
    ids: candidates.map((c) => c.id),
    family,
    messages: opts?.messages,
    variant: opts?.variant,
  });
  const picked = candidates[idx] || candidates[0]!;
  if (opts?.remember !== false) {
    rememberResponse(family, picked.text, picked.id);
  }
  return picked;
}
