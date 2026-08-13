/**
 * Unified per-request pipeline trace — stages, performance, release thresholds.
 */

export type StageStatus = "pass" | "fail" | "skip" | "pending";

export type StageRecord = {
  status: StageStatus;
  reason?: string;
  ms?: number;
  detail?: string;
  text?: string;
  intent?: string;
  depth?: string;
  route?: string;
  calls?: Array<{ endpoint: string; status: StageStatus; ms: number }>;
  quality?: string;
  source?: string;
  candleCount?: number;
  barAgeMs?: number;
  factIds?: string[];
  unknown?: boolean;
  grounded?: boolean;
  path?: string;
  preview?: string;
};

export type RequestTraceStages = {
  voice: StageRecord;
  transcript: StageRecord;
  intent: StageRecord;
  route: StageRecord;
  apis: StageRecord;
  marketDataQuality: StageRecord;
  observations: StageRecord;
  llmGrounding: StageRecord;
  response: StageRecord;
};

export type RequestTracePerformance = {
  speechEndToTranscript?: number;
  transcriptToRoute?: number;
  routeToApi?: number;
  apiToFirstToken?: number;
  firstTokenToAudio?: number;
  totalMs?: number;
};

export type RequestTrace = {
  requestId: string;
  startedAt: string;
  completedAt?: string;
  userText?: string;
  voice?: boolean;
  stages: RequestTraceStages;
  performance: RequestTracePerformance;
};

export const TRACE_RING_SIZE = 20;

/** Release / health-check thresholds */
export const RELEASE_THRESHOLDS = {
  voiceTotalMs: 3000,
  exportSuccessRate: 0.85,
  goldenTestsRequired: true,
  maxOpenCriticals: 0,
} as const;

export type ReleaseCheckItem = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  severity: "P0" | "P1" | "P2";
};

export type ReleaseChecklistResult = {
  pass: boolean;
  items: ReleaseCheckItem[];
  openCriticals: number;
};

function pendingStage(): StageRecord {
  return { status: "pending" };
}

export function createRequestTrace(requestId: string, userText?: string, voice = false): RequestTrace {
  return {
    requestId,
    startedAt: new Date().toISOString(),
    userText,
    voice,
    stages: {
      voice: pendingStage(),
      transcript: pendingStage(),
      intent: pendingStage(),
      route: pendingStage(),
      apis: pendingStage(),
      marketDataQuality: pendingStage(),
      observations: pendingStage(),
      llmGrounding: pendingStage(),
      response: pendingStage(),
    },
    performance: {},
  };
}

export function markStage(
  trace: RequestTrace,
  stage: keyof RequestTraceStages,
  patch: Partial<StageRecord>
): RequestTrace {
  trace.stages[stage] = { ...trace.stages[stage], ...patch };
  return trace;
}

export function skipRemainingStages(trace: RequestTrace, fromStage?: keyof RequestTraceStages): void {
  const order: (keyof RequestTraceStages)[] = [
    "voice",
    "transcript",
    "intent",
    "route",
    "apis",
    "marketDataQuality",
    "observations",
    "llmGrounding",
    "response",
  ];
  let skipping = !fromStage;
  for (const s of order) {
    if (s === fromStage) skipping = true;
    if (!skipping) continue;
    if (trace.stages[s].status === "pending") {
      trace.stages[s] = { status: "skip", reason: "not reached" };
    }
  }
}

export function recordApiCall(
  trace: RequestTrace,
  endpoint: string,
  ms: number,
  ok: boolean,
  reason?: string
): void {
  const calls: Array<{ endpoint: string; status: StageStatus; ms: number }> = [
    ...(trace.stages.apis.calls || []),
    { endpoint, status: (ok ? "pass" : "fail") as StageStatus, ms },
  ];
  const allOk = calls.every((c) => c.status === "pass");
  markStage(trace, "apis", {
    status: allOk ? "pass" : "fail",
    calls,
    reason: allOk ? undefined : reason || calls.find((c) => c.status === "fail")?.endpoint,
    ms: calls.reduce((sum, c) => sum + c.ms, 0),
  });
}

export type VoiceLatencySnapshot = {
  marks?: Record<string, number>;
  metrics?: {
    timeToFinalTranscript?: number | null;
    timeToFirstResponse?: number | null;
    timeToFirstAudio?: number | null;
    totalResponseLatency?: number | null;
    breakdown?: Record<string, number | null>;
  };
  totalMs?: number;
};

export function mergeVoiceLatency(trace: RequestTrace, snapshot?: VoiceLatencySnapshot | null): void {
  if (!snapshot) {
    if (trace.voice) {
      markStage(trace, "voice", { status: "skip", reason: "no voice snapshot" });
      markStage(trace, "transcript", { status: "skip", reason: "text input" });
    } else {
      markStage(trace, "voice", { status: "skip", reason: "typed turn" });
      markStage(trace, "transcript", { status: "skip", reason: "typed turn" });
    }
    return;
  }
  const totalMs = snapshot.totalMs ?? snapshot.metrics?.totalResponseLatency ?? undefined;
  const transcriptMs =
    snapshot.metrics?.timeToFinalTranscript ??
    snapshot.marks?.transcript_handoff ??
    snapshot.marks?.turn_process ??
    undefined;

  markStage(trace, "voice", {
    status: "pass",
    ms: totalMs != null ? Math.round(totalMs) : undefined,
    detail: snapshot.marks ? Object.keys(snapshot.marks).slice(-3).join(", ") : undefined,
  });
  markStage(trace, "transcript", {
    status: transcriptMs != null ? "pass" : "pending",
    ms: transcriptMs != null ? Math.round(transcriptMs) : undefined,
    text: trace.userText?.slice(0, 120),
  });

  if (transcriptMs != null) trace.performance.speechEndToTranscript = Math.round(transcriptMs);
  if (snapshot.metrics?.timeToFirstResponse != null) {
    trace.performance.apiToFirstToken = snapshot.metrics.timeToFirstResponse;
  }
  if (snapshot.metrics?.timeToFirstAudio != null) {
    trace.performance.firstTokenToAudio = snapshot.metrics.timeToFirstAudio;
  }
  if (totalMs != null) trace.performance.totalMs = Math.round(totalMs);
}

export type ChartExportTrace = {
  ok?: boolean;
  quality?: string;
  source?: string;
  candleCount?: number;
  barAgeMs?: number;
  reasons?: string[];
  reason?: string;
};

export function mergeChartExport(trace: RequestTrace, exportTrace?: ChartExportTrace | null): void {
  if (!exportTrace) {
    markStage(trace, "marketDataQuality", { status: "skip", reason: "no chart export" });
    return;
  }
  const quality = exportTrace.quality || (exportTrace.ok ? "good" : "missing");
  const usable = quality === "good" || quality === "degraded" || quality === "partial";
  markStage(trace, "marketDataQuality", {
    status: usable ? "pass" : "fail",
    quality,
    source: exportTrace.source,
    candleCount: exportTrace.candleCount,
    barAgeMs: exportTrace.barAgeMs,
    reason: usable
      ? undefined
      : exportTrace.reason || exportTrace.reasons?.join(", ") || "export unusable",
  });
}

export function mergeObservations(
  trace: RequestTrace,
  factIds?: string[] | null,
  unknown?: boolean
): void {
  if (!factIds?.length && !unknown) {
    markStage(trace, "observations", { status: "skip", reason: "no observation facts" });
    return;
  }
  markStage(trace, "observations", {
    status: unknown ? "fail" : "pass",
    factIds: factIds || [],
    unknown: Boolean(unknown),
    reason: unknown ? "unknown facts in snapshot" : undefined,
  });
}

export function markLlmGrounding(
  trace: RequestTrace,
  path: "snapshot" | "pipeline" | "local" | "stream" | "casual",
  grounded: boolean
): void {
  markStage(trace, "llmGrounding", {
    status: grounded ? "pass" : "fail",
    grounded,
    path,
    reason: grounded ? undefined : "unstructured stream without pipeline backing",
  });
}

export function completeTrace(trace: RequestTrace): RequestTrace {
  trace.completedAt = new Date().toISOString();
  const started = Date.parse(trace.startedAt);
  const ended = Date.parse(trace.completedAt);
  if (Number.isFinite(started) && Number.isFinite(ended)) {
    trace.performance.totalMs = trace.performance.totalMs ?? Math.max(0, ended - started);
  }
  for (const key of Object.keys(trace.stages) as (keyof RequestTraceStages)[]) {
    if (trace.stages[key].status === "pending") {
      trace.stages[key] = { status: "skip", reason: "incomplete" };
    }
  }
  return trace;
}

export function traceHasFailure(trace: RequestTrace): boolean {
  return Object.values(trace.stages).some((s) => s.status === "fail");
}

export function exportSuccessRate(traces: RequestTrace[]): number {
  const withExport = traces.filter((t) => t.stages.marketDataQuality.status !== "skip");
  if (!withExport.length) return 1;
  const ok = withExport.filter((t) => t.stages.marketDataQuality.status === "pass").length;
  return ok / withExport.length;
}

export function voiceLatencyStats(traces: RequestTrace[]): { avgMs: number; maxMs: number; count: number } {
  const voiceTraces = traces.filter((t) => t.voice && t.stages.voice.ms != null);
  if (!voiceTraces.length) return { avgMs: 0, maxMs: 0, count: 0 };
  const ms = voiceTraces.map((t) => t.stages.voice.ms!);
  return {
    avgMs: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
    maxMs: Math.max(...ms),
    count: ms.length,
  };
}

export function evaluateReleaseChecklist(input: {
  traces?: RequestTrace[];
  goldenTestsPass?: boolean;
  openCriticals?: number;
  exportSuccessRate?: number;
  voiceMaxMs?: number;
}): ReleaseChecklistResult {
  const traces = input.traces || [];
  const voice = voiceLatencyStats(traces);
  const exportRate = input.exportSuccessRate ?? exportSuccessRate(traces);
  const voiceMax = input.voiceMaxMs ?? voice.maxMs;
  const openCriticals = input.openCriticals ?? 0;

  const items: ReleaseCheckItem[] = [
    {
      id: "criticals",
      label: "No open critical failures",
      pass: openCriticals <= RELEASE_THRESHOLDS.maxOpenCriticals,
      detail: `${openCriticals} open P0/P1`,
      severity: "P0",
    },
    {
      id: "voice",
      label: `Voice latency ≤ ${RELEASE_THRESHOLDS.voiceTotalMs}ms (recent max)`,
      pass: voice.count === 0 || voiceMax <= RELEASE_THRESHOLDS.voiceTotalMs,
      detail: voice.count ? `${voiceMax}ms max (${voice.count} turns)` : "no voice traces",
      severity: "P1",
    },
    {
      id: "export",
      label: `Chart export success ≥ ${Math.round(RELEASE_THRESHOLDS.exportSuccessRate * 100)}%`,
      pass: exportRate >= RELEASE_THRESHOLDS.exportSuccessRate,
      detail: `${Math.round(exportRate * 100)}% (${traces.filter((t) => t.stages.marketDataQuality.status !== "skip").length} exports)`,
      severity: "P1",
    },
    {
      id: "golden",
      label: "Golden tests pass",
      pass: input.goldenTestsPass !== false,
      detail: input.goldenTestsPass === false ? "failures detected" : "all pass",
      severity: "P0",
    },
  ];

  const openCrit = items.filter((i) => !i.pass && (i.severity === "P0" || i.severity === "P1")).length;
  return {
    pass: items.every((i) => i.pass),
    items,
    openCriticals: openCrit,
  };
}

export function formatStageIcon(status: StageStatus): string {
  switch (status) {
    case "pass":
      return "✓";
    case "fail":
      return "✗";
    case "skip":
      return "–";
    default:
      return "…";
  }
}

export const STAGE_LABELS: Record<keyof RequestTraceStages, string> = {
  voice: "Voice",
  transcript: "Transcript",
  intent: "Intent",
  route: "Route",
  apis: "APIs",
  marketDataQuality: "Market data",
  observations: "Observations",
  llmGrounding: "LLM grounding",
  response: "Response",
};

export function formatLivePipeline(trace: RequestTrace): string {
  const lines = [`Request ${trace.requestId} · ${trace.completedAt ? "done" : "in flight"}`];
  if (trace.userText) lines.push(`"${trace.userText.slice(0, 72)}${trace.userText.length > 72 ? "…" : ""}"`);
  for (const [key, label] of Object.entries(STAGE_LABELS) as [keyof RequestTraceStages, string][]) {
    const s = trace.stages[key];
    const ms = s.ms != null ? ` (${s.ms}ms)` : "";
    const reason = s.reason ? ` — ${s.reason}` : "";
    lines.push(`${formatStageIcon(s.status)} ${label}${ms}${reason}`);
  }
  return lines.join("\n");
}

export function formatPerformanceTable(traces: RequestTrace[]): string {
  if (!traces.length) return "No traces yet.";
  const header = "req          voice  xcript route  api    total";
  const rows = traces.slice(-10).map((t) => {
    const id = t.requestId.slice(0, 10).padEnd(10);
    const col = (s: keyof RequestTraceStages) => {
      const ms = t.stages[s].ms;
      return ms != null ? String(ms).padStart(5) : "    –";
    };
    const total = t.performance.totalMs != null ? String(t.performance.totalMs).padStart(5) : "    –";
    return `${id} ${col("voice")} ${col("transcript")} ${col("route")} ${col("apis")} ${total}`;
  });
  return [header, ...rows].join("\n");
}

export function formatFailures(traces: RequestTrace[]): string {
  const failed = traces.filter(traceHasFailure);
  if (!failed.length) return "No failed stages in recent traces.";
  return failed
    .slice(-8)
    .map((t) => {
      const fails = (Object.entries(t.stages) as [keyof RequestTraceStages, StageRecord][])
        .filter(([, s]) => s.status === "fail")
        .map(([k, s]) => `${STAGE_LABELS[k]}: ${s.reason || "fail"}`)
        .join("; ");
      return `${t.requestId} — ${fails}`;
    })
    .join("\n");
}
