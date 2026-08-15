/**
 * Research harness: PIT cutoff → production pipeline → architecture overlay → trace.
 * Production Karen is not modified. v1 is identity on the same observation.
 */

import { ReplayDataCutoff } from "../replay/cutoff";
import { lastBarIndexAtOrBefore, buildHtfIndexMaps } from "../replay/fast-slice";
import { buildKarenReplayResponse } from "../replay/karen";
import { ResearchContextSession } from "../replay/incremental-context";
import { resolveResearchReplayMode, type ResearchReplayMode } from "../replay/mode";
import { forwardBarsAfter } from "../replay/excursion";
import type { ReplayMarketData } from "../replay/types";
import type { Bar, MarketContext } from "../../types";
import { buildMarketDecisionContext } from "./context";
import { fingerprintDecisionTrace, fingerprintTriple } from "./fingerprint";
import { labelRichOutcomes } from "./outcomes";
import { recordConceptRelationships } from "./relationships";
import { assertLabeledHorizons, buildDecisionTrace } from "./trace";
import { evaluateArchitectureVersion } from "./versions";
import { formatVisualTrace } from "./visual";
import type { ArchitectureVersionId, DecisionTrace, EvidenceClass, RichOutcomeLabels } from "./types";
import type { MarketDecisionContext } from "./types";
import type { ConceptRelationship } from "./types";

export type EvaluatedDecision = {
  trace: DecisionTrace;
  context: MarketDecisionContext;
  marketContext: MarketContext;
  relationships: ConceptRelationship[];
  outcome: RichOutcomeLabels | null;
  fingerprint: string;
  tripleFingerprint: string;
  visual: string;
  horizonErrors: string[];
};

export function evidenceClassForRun(uniqueSessionDays: number): EvidenceClass {
  return uniqueSessionDays <= 1 ? "INFRASTRUCTURE" : "INFRASTRUCTURE";
}

export function evaluateArchitecturesAtCutoff(input: {
  data: ReplayMarketData;
  asOf: Date;
  datasetId: string;
  versions?: ArchitectureVersionId[];
  evidenceClass?: EvidenceClass;
  forwardBarCount?: number;
  /** CURRENT = full rebuild; OPTIMIZED = incremental syncSeries. Default from env/CLI. */
  mode?: ResearchReplayMode;
  /** Reuse incremental state across checkpoints in OPTIMIZED mode. */
  contextSession?: ResearchContextSession;
}): EvaluatedDecision[] {
  const versions = input.versions ?? ["architecture-v1", "architecture-v2", "architecture-v3"];
  const barIndex = lastBarIndexAtOrBefore(input.data.m1, input.asOf);
  if (barIndex < 0) {
    throw new Error(`evaluateArchitecturesAtCutoff: no m1 bar at or before ${input.asOf.toISOString()}`);
  }
  const asOf = input.data.m1[barIndex]!.time;
  const cutoff = new ReplayDataCutoff(input.data, asOf);
  cutoff.assertNoFutureLeak();
  const mode = input.mode ?? resolveResearchReplayMode();
  const lastPrice = input.data.m1[barIndex]!.close;

  let ctx: MarketContext;
  if (mode === "OPTIMIZED" && input.contextSession) {
    ctx = input.contextSession.buildAtBarIndex(barIndex, "OPTIMIZED");
  } else if (mode === "OPTIMIZED") {
    const session = new ResearchContextSession();
    session.reset(input.data);
    ctx = session.buildAtBarIndex(barIndex, "OPTIMIZED");
  } else {
    ctx = cutoff.buildContextAtBarIndex(
      barIndex,
      buildHtfIndexMaps(input.data.m1, input.data.m5, input.data.m15),
      lastPrice
    );
  }

  const { pipeline } = buildKarenReplayResponse(ctx, input.data, asOf);
  const lastPriceResolved = cutoff.slicedM1().at(-1)?.close ?? null;
  const forward = forwardBarsAfter(input.data.m1, asOf, input.forwardBarCount ?? 30);
  const evidenceClass = input.evidenceClass ?? "INFRASTRUCTURE";
  const originalObs = pipeline.observation;
  const liquidityPrices = originalObs.liquidity.levels.map((l) => l.price);
  const mssLevel = ctx.structureFacts.mss?.level ?? null;

  const productionEnvelope = pipeline.analysis_contract?.decision;

  return versions.map((version) => {
    const overlay =
      version === "architecture-v1" && productionEnvelope
        ? {
            observation: originalObs,
            interpretation: pipeline.interpretation,
            decision: pipeline.decision,
            envelope: productionEnvelope,
            overlayApplied: false,
            overlayReason: "identity — production envelope",
          }
        : evaluateArchitectureVersion({
            observation: originalObs,
            ctx,
            state: undefined,
            dataQuality: pipeline.data_quality_report,
            version,
          });
    const trace = buildDecisionTrace({
      pipeline: {
        observation: overlay.observation,
        decision: overlay.decision,
        state_hash: pipeline.state_hash,
      },
      envelope: overlay.envelope,
      architectureVersion: version,
      timestamp: asOf.toISOString(),
      datasetId: input.datasetId,
      symbol: input.data.symbol,
      overlayApplied: overlay.overlayApplied,
      overlayReason: overlay.overlayReason,
      evidenceClass,
      originalObservation: originalObs,
      ctx,
    });
    const context = buildMarketDecisionContext({
      observation: originalObs,
      ctx,
      lastPrice: lastPriceResolved,
    });
    const relationships = recordConceptRelationships(trace, context);
    const outcome = labelRichOutcomes({
      trace,
      forwardBars: forward,
      lastPrice: lastPriceResolved,
      liquidityPrices,
      mssLevel,
    });
    const fingerprint = fingerprintDecisionTrace(trace);
    return {
      trace,
      context,
      marketContext: ctx,
      relationships,
      outcome,
      fingerprint,
      tripleFingerprint: fingerprintTriple({
        datasetId: input.datasetId,
        timestamp: asOf.toISOString(),
        architectureVersion: version,
        traceFingerprint: fingerprint,
      }),
      visual: formatVisualTrace(trace, context, relationships),
      horizonErrors: assertLabeledHorizons(trace),
    };
  });
}

export function pickSmokeCutoffs(m1: Bar[], countPerSplit: { train: number; val: number; oos: number }): Date[] {
  if (m1.length < 20) return m1.slice(5, -2).map((b) => b.time);
  const trainEnd = Math.floor(m1.length * 0.6);
  const valEnd = trainEnd + Math.floor(m1.length * 0.2);
  const take = (start: number, end: number, n: number): Date[] => {
    const span = Math.max(1, end - start);
    const out: Date[] = [];
    for (let i = 0; i < n; i++) {
      const idx = start + Math.floor(((i + 1) / (n + 1)) * span);
      const bar = m1[Math.min(end, Math.max(start, idx))];
      if (bar) out.push(bar.time);
    }
    return out;
  };
  return [
    ...take(Math.min(30, trainEnd - 1), trainEnd, countPerSplit.train),
    ...take(trainEnd, valEnd, countPerSplit.val),
    ...take(valEnd, m1.length - 5, countPerSplit.oos),
  ];
}
