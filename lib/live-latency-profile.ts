/**
 * Live request latency spans — measurement only. Does not change decisions.
 * Marks are milliseconds from backend receive (T1).
 */
export type LiveLatencyProfile = {
  requestId: string;
  t1At: number;
  marks: Record<string, number>;
  counters: Record<string, number>;
  notes: string[];
};

let current: LiveLatencyProfile | null = null;

export function beginLiveLatency(requestId: string): LiveLatencyProfile {
  current = {
    requestId,
    t1At: Date.now(),
    marks: { t1_backend: 0 },
    counters: {},
    notes: [],
  };
  return current;
}

export function markLiveLatency(name: string, at = Date.now()): number {
  if (!current) return 0;
  const ms = at - current.t1At;
  current.marks[name] = ms;
  return ms;
}

export function bumpLiveLatency(name: string, n = 1): void {
  if (!current) return;
  current.counters[name] = (current.counters[name] || 0) + n;
}

export function noteLiveLatency(note: string): void {
  if (!current) return;
  current.notes.push(note);
}

/** OpenAI usage fields — measurement only; never affects decisions. */
export type LlmUsageLike = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

/**
 * Record LLM token usage onto the active latency profile.
 * Safe no-op when no profile is active or usage is missing/invalid.
 */
export function noteLlmUsage(usage: LlmUsageLike | null | undefined): void {
  if (!current || !usage) return;
  const completion = usage.completion_tokens;
  const prompt = usage.prompt_tokens;
  const total = usage.total_tokens;
  if (typeof completion === "number" && Number.isFinite(completion) && completion >= 0) {
    current.counters.completion_tokens = Math.round(completion);
    noteLiveLatency(`completion_tokens=${Math.round(completion)}`);
  }
  if (typeof prompt === "number" && Number.isFinite(prompt) && prompt >= 0) {
    current.counters.prompt_tokens = Math.round(prompt);
    noteLiveLatency(`prompt_tokens=${Math.round(prompt)}`);
  }
  if (typeof total === "number" && Number.isFinite(total) && total >= 0) {
    current.counters.total_tokens = Math.round(total);
    noteLiveLatency(`total_tokens=${Math.round(total)}`);
  }
}

export function getLiveLatency(): LiveLatencyProfile | null {
  return current;
}

export function snapshotLiveLatency(): LiveLatencyProfile | null {
  if (!current) return null;
  return {
    requestId: current.requestId,
    t1At: current.t1At,
    marks: { ...current.marks },
    counters: { ...current.counters },
    notes: [...current.notes],
  };
}

/** Clear active profile (tests / request end). Measurement only. */
export function clearLiveLatency(): void {
  current = null;
}
