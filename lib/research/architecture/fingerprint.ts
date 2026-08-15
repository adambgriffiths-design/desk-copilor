import { createHash } from "crypto";
import type { DecisionEnvelope } from "../../decision-envelope";
import type { DecisionTrace } from "./types";

function stableTracePayload(trace: DecisionTrace) {
  return {
    schemaVersion: trace.schemaVersion,
    architectureVersion: trace.architectureVersion,
    timestamp: trace.timestamp,
    snapshotId: trace.snapshotId,
    datasetId: trace.datasetId,
    symbol: trace.symbol,
    session: trace.session,
    timeframe: trace.timeframe,
    stance: trace.stance,
    pipelineVerdict: trace.pipelineVerdict,
    entry: trace.entry,
    target: trace.target,
    invalidation: trace.invalidation,
    confidence: trace.confidence,
    overlayApplied: trace.overlayApplied,
    concepts: trace.concepts.map((c) => ({
      concept: c.concept,
      detected: c.detected,
      used: c.used,
      influential: c.influential,
      usage: c.usage,
      role: c.role,
      outcome: c.outcome,
    })),
    conflicts: trace.conflicts,
    htfContext: trace.htfContext,
    tactical: trace.tactical,
    execution: trace.execution,
  };
}

/** Same dataset + timestamp + architecture version → identical digest. Excludes clocks. */
export function fingerprintDecisionTrace(trace: DecisionTrace): string {
  return createHash("sha256").update(JSON.stringify(stableTracePayload(trace))).digest("hex");
}

export function fingerprintEnvelope(env: DecisionEnvelope): string {
  const stable = {
    stance: env.stance,
    cited: env.citedConcepts,
    conflict: env.conflictLog,
    chain: env.reasoningChain.map((i) => ({
      concept: i.concept,
      detected: i.detected,
      usedInDecision: i.usedInDecision,
      role: i.role,
      outcome: i.outcome,
    })),
    read: env.read,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function fingerprintTriple(input: {
  datasetId: string;
  timestamp: string;
  architectureVersion: string;
  traceFingerprint: string;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
