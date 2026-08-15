/**
 * Continuous decision-memory recorder — event-driven ticks only.
 *
 * RUNTIME LIMITATION (Vercel / Next serverless):
 * Isolates are request-scoped. There is no durable process, no cron in vercel.json,
 * and no reliable cross-isolate setInterval. Do NOT fake a background timer here.
 *
 * Safe path:
 * - Caller invokes `runContinuousDecisionRecorderTick` on a real event
 *   (new closed bar / freshness miss / fixture-step driver / future extension poll).
 * - 0 LLM calls. Deterministic envelope in → material gate → optional Redis write.
 * - Manual Analyse always wins (yield when busy).
 *
 * Fixture validation uses HISTORICAL lane + SYNTHETIC labels — never fabricates LIVE market.
 */
import type { DecisionEnvelope } from "./decision-envelope";
import {
  flushDecisionMemoryWrites,
  getDecisionEnvelopeHistory,
  latestDecisionEnvelope,
  recordDecisionEnvelopeHistory,
  type DecisionEnvelopeHistoryEntry,
  type DecisionHistoryLane,
  type DecisionHistoryMarketState,
  type RecordDecisionEnvelopeInput,
} from "./decision-envelope-history";
import {
  getDecisionMemoryBackend,
  isDecisionMemoryRedisConfigured,
} from "./decision-memory-backend";
import {
  isMaterialDecisionChange,
  type MaterialChangeReason,
} from "./decision-memory-material";

export const CONTINUOUS_RECORDER_RUNTIME =
  "event-driven-only — Vercel serverless cannot host continuous background timers";

export const SYNTHETIC_FIXTURE_LABEL = "HISTORICAL / SYNTHETIC — NOT LIVE MARKET DATA";

export type ContinuousRecorderSource =
  | "event"
  | "fixture-step"
  | "manual-analyse"
  | "extension-poll";

export type ContinuousRecorderTickInput = {
  source: ContinuousRecorderSource;
  /** LIVE for real live events; HISTORICAL for fixture / synthetic validation. */
  lane: DecisionHistoryLane;
  envelope: DecisionEnvelope;
  verdict?: string;
  asOf: string | Date;
  stateHash?: string;
  marketState?: DecisionHistoryMarketState;
  fixtureId?: string;
  barIndex?: number;
  asOfEst?: string;
  decisionKey?: string;
  entryStatus?: string;
  /**
   * When true (fixture-step / research), force HISTORICAL record past LIVE suppress.
   * LIVE continuous ticks must leave this false.
   */
  forceHistorical?: boolean;
  /**
   * Optional prior eval fingerprint. If equal to evalFingerprint, skip eval/record
   * (time advanced alone is not enough).
   */
  priorEvalFingerprint?: string | null;
  evalFingerprint?: string | null;
};

export type ContinuousRecorderTickAction =
  | "recorded"
  | "skipped_not_material"
  | "skipped_busy"
  | "skipped_unchanged_fingerprint"
  | "skipped_invalid"
  | "skipped_yield_manual";

export type ContinuousRecorderTickResult = {
  action: ContinuousRecorderTickAction;
  entry: DecisionEnvelopeHistoryEntry | null;
  material: boolean;
  materialReasons: MaterialChangeReason[];
  /** Wall time for gate + optional record (not full pipeline). */
  recorderEvalLatencyMs: number;
  redisConfigured: boolean;
  /** True only when a new history row was accepted (Redis persist queued if configured). */
  redisWriteQueued: boolean;
  llmCalls: 0;
  label: string;
  runtime: typeof CONTINUOUS_RECORDER_RUNTIME;
};

let manualAnalyseDepth = 0;
let recorderInFlight = false;

/** Metrics for validation / research reports (process-local). */
export type ContinuousRecorderMetrics = {
  ticks: number;
  evaluated: number;
  recorded: number;
  skippedNotMaterial: number;
  skippedBusy: number;
  skippedFingerprint: number;
  skippedInvalid: number;
  llmCalls: number;
  lastEvalLatencyMs: number;
  redisWritesQueued: number;
};

const metrics: ContinuousRecorderMetrics = {
  ticks: 0,
  evaluated: 0,
  recorded: 0,
  skippedNotMaterial: 0,
  skippedBusy: 0,
  skippedFingerprint: 0,
  skippedInvalid: 0,
  llmCalls: 0,
  lastEvalLatencyMs: 0,
  redisWritesQueued: 0,
};

export function getContinuousRecorderMetrics(): ContinuousRecorderMetrics {
  return { ...metrics };
}

export function resetContinuousRecorderMetrics(): void {
  metrics.ticks = 0;
  metrics.evaluated = 0;
  metrics.recorded = 0;
  metrics.skippedNotMaterial = 0;
  metrics.skippedBusy = 0;
  metrics.skippedFingerprint = 0;
  metrics.skippedInvalid = 0;
  metrics.llmCalls = 0;
  metrics.lastEvalLatencyMs = 0;
  metrics.redisWritesQueued = 0;
}

export function beginManualAnalysePriority(): void {
  manualAnalyseDepth += 1;
}

export function endManualAnalysePriority(): void {
  manualAnalyseDepth = Math.max(0, manualAnalyseDepth - 1);
}

export function isManualAnalyseActive(): boolean {
  return manualAnalyseDepth > 0;
}

export function isContinuousRecorderInFlight(): boolean {
  return recorderInFlight;
}

/** Wrap Manual Analyse / live-verdict so background ticks yield. */
export async function withManualAnalysePriority<T>(fn: () => Promise<T>): Promise<T> {
  beginManualAnalysePriority();
  try {
    return await fn();
  } finally {
    endManualAnalysePriority();
  }
}

export function withManualAnalysePrioritySync<T>(fn: () => T): T {
  beginManualAnalysePriority();
  try {
    return fn();
  } finally {
    endManualAnalysePriority();
  }
}

function labelFor(lane: DecisionHistoryLane, source: ContinuousRecorderSource): string {
  if (lane === "HISTORICAL" || source === "fixture-step") return SYNTHETIC_FIXTURE_LABEL;
  return "LIVE";
}

/**
 * Event-driven recorder tick. Never starts a timer. Never calls LLM.
 * Redis persist happens only inside recordDecisionEnvelopeHistory after this gate.
 */
export function runContinuousDecisionRecorderTick(
  input: ContinuousRecorderTickInput
): ContinuousRecorderTickResult {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  metrics.ticks += 1;

  const base = {
    entry: null as DecisionEnvelopeHistoryEntry | null,
    material: false,
    materialReasons: [] as MaterialChangeReason[],
    redisConfigured: isDecisionMemoryRedisConfigured(),
    redisWriteQueued: false,
    llmCalls: 0 as const,
    label: labelFor(input.lane, input.source),
    runtime: CONTINUOUS_RECORDER_RUNTIME,
  };

  const finish = (
    action: ContinuousRecorderTickAction,
    extra?: Partial<ContinuousRecorderTickResult>
  ): ContinuousRecorderTickResult => {
    const recorderEvalLatencyMs = Number(process.hrtime.bigint()) / 1e6 - t0;
    metrics.lastEvalLatencyMs = recorderEvalLatencyMs;
    return {
      ...base,
      action,
      recorderEvalLatencyMs,
      ...extra,
      runtime: CONTINUOUS_RECORDER_RUNTIME,
    };
  };

  if (!input.envelope) {
    metrics.skippedInvalid += 1;
    return finish("skipped_invalid");
  }

  // Manual Analyse priority — background / fixture-step yields (manual-analyse source proceeds).
  if (input.source !== "manual-analyse" && isManualAnalyseActive()) {
    metrics.skippedBusy += 1;
    return finish("skipped_yield_manual");
  }

  if (recorderInFlight && input.source !== "manual-analyse") {
    metrics.skippedBusy += 1;
    return finish("skipped_busy");
  }

  // Do not evaluate/record merely because wall-clock advanced with same fingerprint.
  if (
    input.priorEvalFingerprint != null &&
    input.evalFingerprint != null &&
    input.priorEvalFingerprint === input.evalFingerprint
  ) {
    metrics.skippedFingerprint += 1;
    return finish("skipped_unchanged_fingerprint");
  }

  recorderInFlight = true;
  try {
    metrics.evaluated += 1;

    const last =
      input.lane === "LIVE"
        ? latestDecisionEnvelope("LIVE")
        : (() => {
            const hist = getDecisionEnvelopeHistory("HISTORICAL");
            if (input.fixtureId) {
              const same = hist.filter((e) => e.fixtureId === input.fixtureId);
              return same.length ? same[same.length - 1]! : null;
            }
            return hist.length ? hist[hist.length - 1]! : null;
          })();

    const gate = isMaterialDecisionChange(last, {
      envelope: input.envelope,
      verdict: input.verdict,
    });

    if (!gate.material) {
      metrics.skippedNotMaterial += 1;
      return finish("skipped_not_material", {
        material: false,
        materialReasons: gate.reasons,
      });
    }

    const recordInput: RecordDecisionEnvelopeInput = {
      asOf: input.asOf,
      lane: input.lane,
      dataMode: input.lane,
      envelope: input.envelope,
      verdict: input.verdict,
      stateHash: input.stateHash,
      marketState: input.marketState,
      fixtureId: input.fixtureId,
      barIndex: input.barIndex,
      asOfEst: input.asOfEst,
      decisionKey: input.decisionKey,
      entryStatus: input.entryStatus,
      force: input.lane === "HISTORICAL" ? true : input.forceHistorical === true,
    };

    const entry = recordDecisionEnvelopeHistory(recordInput);
    if (!entry) {
      metrics.skippedInvalid += 1;
      return finish("skipped_invalid", {
        material: true,
        materialReasons: gate.reasons,
      });
    }

    // Dedup keep-first may return prior entry without a new append.
    const isNew =
      !last ||
      entry.id !== last.id ||
      entry.asOf !== last.asOf ||
      entry.decisionKey !== last.decisionKey;

    if (!isNew) {
      metrics.skippedNotMaterial += 1;
      return finish("skipped_not_material", {
        entry,
        material: false,
        materialReasons: gate.reasons,
      });
    }

    metrics.recorded += 1;
    // Persist only after material gate via recordDecisionEnvelopeHistory.
    // Count any shared backend (prod Upstash or test mock), not env alone.
    const redisWriteQueued = getDecisionMemoryBackend() != null;
    if (redisWriteQueued) metrics.redisWritesQueued += 1;

    return finish("recorded", {
      entry,
      material: true,
      materialReasons: gate.reasons,
      redisWriteQueued,
    });
  } finally {
    recorderInFlight = false;
  }
}

/** Await queued Redis writes after a tick (or batch of ticks). */
export async function flushContinuousRecorderWrites(): Promise<void> {
  await flushDecisionMemoryWrites();
}
