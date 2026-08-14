/**
 * Layer 1 — full-resolution Phase 1 pipeline replay at every 1m cutoff.
 * Research-only; does not modify production Karen.
 */
import { buildMarketState } from "../../market-state-build";
import { validateInterpretationContamination } from "../../contamination-guard";
import { buildTradingDecision } from "../../decision-layer";
import { getExecutionScaffold } from "../../execution-plan";
import { buildMarketInterpretation } from "../../interpretation-engine";
import { buildMarketObservation } from "../../observation-engine";
import type { TradingDecision, TradingVerdict } from "../../desk-schema";
import { cmeSessionDateKey } from "../../tickstream/htf-aggregate";
import { buildResearchChartSnapshotFromBars } from "../chart-snapshot-from-bars";
import { ReplayDataCutoff } from "../replay/cutoff";
import { buildHtfIndexMaps, sliceBarsThroughIndex } from "../replay/fast-slice";
import type { ReplayMarketData } from "../replay/types";
import type { Bar } from "../../types";

export type MinutePipelineSnapshot = {
  asOf: string;
  barIndex: number;
  price: number;
  verdict: TradingVerdict;
  entryStatus: string | null;
  setupEligible: boolean;
  marketStructure: string;
  tradeableBias: string;
  session: string;
  dataQuality: string;
  entryModel: string | null;
  mssDirection: string | null;
};

export type MinuteStateField =
  | "verdict"
  | "entryStatus"
  | "marketStructure"
  | "tradeableBias"
  | "session"
  | "setupEligible"
  | "entryActive";

export type StateTransition = {
  asOf: string;
  barIndex: number;
  field: MinuteStateField;
  from: string | boolean | null;
  to: string | boolean | null;
};

export type ActionableWindow = {
  kind: "entryActive" | "setupEligible";
  startAsOf: string;
  endAsOf: string;
  startBarIndex: number;
  endBarIndex: number;
  durationMinutes: number;
  verdictAtStart: TradingVerdict;
  entryStatus: string | null;
  /** Minutes from setup activation to invalidation (setupEligible windows only). */
  activationToInvalidationMinutes: number | null;
};

export type MinuteReplayOptions = {
  datasetId: string;
  data: ReplayMarketData;
  /** Inclusive CME session date filter (YYYY-MM-DD). */
  sessionDate?: string;
  startTime?: Date;
  endTime?: Date;
  /** Skip first N bars for warmup (default 60). */
  minWarmupBars?: number;
  /** Progress callback every N bars. */
  onProgress?: (done: number, total: number) => void;
  progressEvery?: number;
};

export type MinuteReplayReport = {
  datasetId: string;
  sessionDateFilter: string | null;
  range: { start: string; end: string; barCount: number };
  evaluationCount: number;
  runtimeMs: number;
  msPerEvaluation: number;
  verdictDistribution: Record<string, number>;
  entryStatusDistribution: Record<string, number>;
  transitions: StateTransition[];
  verdictTransitions: StateTransition[];
  sessionChanges: StateTransition[];
  structureChanges: StateTransition[];
  biasChanges: StateTransition[];
  entryStatusTransitions: StateTransition[];
  actionableWindows: ActionableWindow[];
  setupEligibleWindows: ActionableWindow[];
  entryActiveWindows: ActionableWindow[];
  episodeIndices: number[];
  poisonTest: { pass: boolean; detail: string };
  responsiveness: {
    verdictTransitionCount: number;
    entryActiveWindowCount: number;
    setupEligibleWindowCount: number;
    totalEntryActiveMinutes: number;
    totalSetupEligibleMinutes: number;
    responsive: boolean;
    evidence: string;
  };
};

function entryActive(entryStatus: string | null): boolean {
  return entryStatus != null && entryStatus.startsWith("ACTIVE");
}

function isSetupEligible(
  verdict: TradingVerdict,
  entryStatus: string | null,
  invalidation: number | null | undefined
): boolean {
  return (
    (verdict === "LONG" || verdict === "SHORT") &&
    entryActive(entryStatus) &&
    invalidation != null &&
    Number.isFinite(invalidation)
  );
}

function buildDecisionAtBar(
  data: ReplayMarketData,
  barIndex: number,
  htfMaps: ReturnType<typeof buildHtfIndexMaps>
): {
  snap: MinutePipelineSnapshot;
  m1: Bar[];
} {
  const bar = data.m1[barIndex]!;
  const asOf = bar.time;
  const cutoff = new ReplayDataCutoff(data, asOf);
  cutoff.assertNoFutureLeak();
  const m1 = sliceBarsThroughIndex(data.m1, barIndex);
  const ctx = cutoff.buildContextAtBarIndex(barIndex, htfMaps, bar.close);

  const chartSnapshot = buildResearchChartSnapshotFromBars({
    bars: m1,
    symbol: ctx.symbol,
    asOf,
    timeframe: "1",
  });
  const state = buildMarketState({
    ctx,
    chartLastPrice: bar.close,
    chartLastPriceSource: "yahoo",
    symbol: ctx.symbol,
    chartSnapshot,
  });

  const observation = buildMarketObservation(ctx, state);
  const interpretation = buildMarketInterpretation(observation);
  const contamination = validateInterpretationContamination(observation, interpretation);
  const decision: TradingDecision = !contamination.passed
    ? {
        verdict: "NO_TRADE",
        verdict_reason: `Interpretation contamination blocked: ${contamination.violations.join("; ")}`,
        invalidation: null,
        entry_zone: null,
        target: null,
        observation_ref: observation,
        interpretation_ref: interpretation,
      }
    : buildTradingDecision(observation, interpretation, ctx);
  const execution = getExecutionScaffold(ctx);

  const snap: MinutePipelineSnapshot = {
    asOf: asOf.toISOString(),
    barIndex,
    price: bar.close,
    verdict: decision.verdict,
    entryStatus: execution?.entryStatus ?? null,
    setupEligible: isSetupEligible(decision.verdict, execution?.entryStatus ?? null, decision.invalidation),
    marketStructure: observation.market_structure,
    tradeableBias: observation.htf_bias.tradeable_bias,
    session: observation.session,
    dataQuality: observation.data_quality,
    entryModel: interpretation.entry_model,
    mssDirection: ctx.structureFacts.mss?.direction ?? null,
  };

  return { snap, m1 };
}

function indicesForRange(
  m1: Bar[],
  opts: {
    sessionDate?: string;
    startTime?: Date;
    endTime?: Date;
    minWarmupBars: number;
  }
): number[] {
  const out: number[] = [];
  for (let i = opts.minWarmupBars; i < m1.length; i++) {
    const t = m1[i]!.time;
    if (opts.startTime && t.getTime() < opts.startTime.getTime()) continue;
    if (opts.endTime && t.getTime() > opts.endTime.getTime()) continue;
    if (opts.sessionDate && cmeSessionDateKey(Math.floor(t.getTime() / 1000)) !== opts.sessionDate) continue;
    out.push(i);
  }
  return out;
}

function trackTransition(
  transitions: StateTransition[],
  prev: MinutePipelineSnapshot | null,
  cur: MinutePipelineSnapshot,
  field: MinuteStateField,
  fromVal: string | boolean | null,
  toVal: string | boolean | null
): void {
  if (prev == null || fromVal === toVal) return;
  transitions.push({
    asOf: cur.asOf,
    barIndex: cur.barIndex,
    field,
    from: fromVal,
    to: toVal,
  });
}

function closeWindow(
  windows: ActionableWindow[],
  open: ActionableWindow | null,
  endSnap: MinutePipelineSnapshot
): ActionableWindow | null {
  if (!open) return null;
  const durationMinutes = open.startBarIndex === endSnap.barIndex ? 1 : endSnap.barIndex - open.startBarIndex + 1;
  windows.push({
    ...open,
    endAsOf: endSnap.asOf,
    endBarIndex: endSnap.barIndex,
    durationMinutes,
    activationToInvalidationMinutes:
      open.kind === "setupEligible" ? durationMinutes : open.activationToInvalidationMinutes,
  });
  return null;
}

function openWindow(
  kind: ActionableWindow["kind"],
  snap: MinutePipelineSnapshot
): ActionableWindow {
  return {
    kind,
    startAsOf: snap.asOf,
    endAsOf: snap.asOf,
    startBarIndex: snap.barIndex,
    endBarIndex: snap.barIndex,
    durationMinutes: 0,
    verdictAtStart: snap.verdict,
    entryStatus: snap.entryStatus,
    activationToInvalidationMinutes: null,
  };
}

/** Compare pipeline snapshots before poison index — future bar mutation must not affect past. */
export function runMinuteReplayPoisonTest(
  data: ReplayMarketData & { id?: string },
  barRange?: { startIndex: number; endIndex: number }
): { pass: boolean; detail: string } {
  const m1 = data.m1;
  if (m1.length < 20) {
    return { pass: true, detail: "skipped — dataset too short" };
  }

  const minWarmupBars = 60;
  const startIndex = Math.max(minWarmupBars, barRange?.startIndex ?? minWarmupBars);
  const endIndex = barRange?.endIndex ?? Math.min(m1.length - 1, startIndex + 12);
  const poisonIdx = Math.min(endIndex, startIndex + Math.floor((endIndex - startIndex) * 0.7));

  const indices: number[] = [];
  for (let i = startIndex; i <= endIndex; i++) indices.push(i);

  const compareIndices = indices.filter((i) => i < poisonIdx);
  const htfMaps = buildHtfIndexMaps(data.m1, data.m5, data.m15);
  const baseSnaps = runSnapshots(data, compareIndices, htfMaps);
  const poisoned = {
    ...data,
    m1: m1.map((b, i) =>
      i === poisonIdx ? { ...b, high: 99999, low: 1, open: b.open, close: b.close } : { ...b }
    ),
  };
  const poisonHtf = buildHtfIndexMaps(poisoned.m1, poisoned.m5, poisoned.m15);
  const poisonSnaps = runSnapshots(poisoned, compareIndices, poisonHtf);

  const diffs: string[] = [];
  for (let i = 0; i < compareIndices.length; i++) {
    const a = baseSnaps[i]!;
    const b = poisonSnaps[i]!;
    if (
      a.verdict !== b.verdict ||
      a.entryStatus !== b.entryStatus ||
      a.setupEligible !== b.setupEligible ||
      a.marketStructure !== b.marketStructure
    ) {
      diffs.push(`${a.asOf}: verdict ${a.verdict}/${b.verdict} entry ${a.entryStatus}/${b.entryStatus}`);
    }
  }

  if (diffs.length > 0) {
    return {
      pass: false,
      detail: `${diffs.length} snapshot(s) before poison bar ${m1[poisonIdx]!.time.toISOString()} differ: ${diffs.slice(0, 3).join("; ")}`,
    };
  }
  return {
    pass: true,
    detail: `point-in-time preserved — ${compareIndices.length} snapshots unchanged before poison at ${m1[poisonIdx]!.time.toISOString()}`,
  };
}

function runSnapshots(
  data: ReplayMarketData,
  indices: number[],
  htfMaps: ReturnType<typeof buildHtfIndexMaps>
): MinutePipelineSnapshot[] {
  return indices.map((i) => buildDecisionAtBar(data, i, htfMaps).snap);
}


/** Walk every m1 bar in range; emit transitions + actionable window report. */
export function runMinuteReplay(options: MinuteReplayOptions): MinuteReplayReport {
  const {
    datasetId,
    data,
    sessionDate,
    startTime,
    endTime,
    minWarmupBars = 60,
    onProgress,
    progressEvery = 500,
  } = options;

  const barIndices = indicesForRange(data.m1, { sessionDate, startTime, endTime, minWarmupBars });
  if (barIndices.length === 0) {
    throw new Error(`No m1 bars in range (sessionDate=${sessionDate ?? "any"})`);
  }

  const htfMaps = buildHtfIndexMaps(data.m1, data.m5, data.m15);

  const transitions: StateTransition[] = [];
  const verdictDistribution: Record<string, number> = {};
  const entryStatusDistribution: Record<string, number> = {};
  const actionableWindows: ActionableWindow[] = [];
  const setupEligibleWindows: ActionableWindow[] = [];
  const entryActiveWindows: ActionableWindow[] = [];
  const episodeIndices = new Set<number>();

  let prev: MinutePipelineSnapshot | null = null;
  let openSetup: ActionableWindow | null = null;
  let openEntry: ActionableWindow | null = null;
  let evaluationCount = 0;

  const t0 = performance.now();
  const totalSteps = barIndices.length;

  for (let step = 0; step < totalSteps; step++) {
    const barIndex = barIndices[step]!;
    const { snap } = buildDecisionAtBar(data, barIndex, htfMaps);
    evaluationCount++;

    verdictDistribution[snap.verdict] = (verdictDistribution[snap.verdict] ?? 0) + 1;
    const esKey = snap.entryStatus ?? "null";
    entryStatusDistribution[esKey] = (entryStatusDistribution[esKey] ?? 0) + 1;

    trackTransition(transitions, prev, snap, "verdict", prev?.verdict ?? null, snap.verdict);
    trackTransition(transitions, prev, snap, "entryStatus", prev?.entryStatus ?? null, snap.entryStatus);
    trackTransition(transitions, prev, snap, "marketStructure", prev?.marketStructure ?? null, snap.marketStructure);
    trackTransition(transitions, prev, snap, "tradeableBias", prev?.tradeableBias ?? null, snap.tradeableBias);
    trackTransition(transitions, prev, snap, "session", prev?.session ?? null, snap.session);
    trackTransition(transitions, prev, snap, "setupEligible", prev?.setupEligible ?? null, snap.setupEligible);
    trackTransition(
      transitions,
      prev,
      snap,
      "entryActive",
      prev ? entryActive(prev.entryStatus) : null,
      entryActive(snap.entryStatus)
    );

    if (prev && prev.verdict !== snap.verdict) episodeIndices.add(snap.barIndex);
    if (prev && prev.marketStructure !== snap.marketStructure) episodeIndices.add(snap.barIndex);
    if (prev && prev.setupEligible !== snap.setupEligible) episodeIndices.add(snap.barIndex);
    if (prev && entryActive(prev.entryStatus) !== entryActive(snap.entryStatus)) {
      episodeIndices.add(snap.barIndex);
    }

    const wasSetup = prev?.setupEligible ?? false;
    const isSetup = snap.setupEligible;
    if (!wasSetup && isSetup) openSetup = openWindow("setupEligible", snap);
    else if (wasSetup && !isSetup && openSetup) {
      openSetup = closeWindow(setupEligibleWindows, openSetup, prev!);
      actionableWindows.push(setupEligibleWindows.at(-1)!);
    }

    const wasEntry = prev ? entryActive(prev.entryStatus) : false;
    const isEntry = entryActive(snap.entryStatus);
    if (!wasEntry && isEntry) openEntry = openWindow("entryActive", snap);
    else if (wasEntry && !isEntry && openEntry) {
      openEntry = closeWindow(entryActiveWindows, openEntry, prev!);
      actionableWindows.push(entryActiveWindows.at(-1)!);
    }

    prev = snap;
    if (onProgress && step % progressEvery === 0) onProgress(step, totalSteps - 1);
  }

  if (prev && openSetup) {
    openSetup = closeWindow(setupEligibleWindows, openSetup, prev);
    actionableWindows.push(setupEligibleWindows.at(-1)!);
  }
  if (prev && openEntry) {
    openEntry = closeWindow(entryActiveWindows, openEntry, prev);
    actionableWindows.push(entryActiveWindows.at(-1)!);
  }

  const runtimeMs = performance.now() - t0;
  const verdictTransitions = transitions.filter((t) => t.field === "verdict");
  const sessionChanges = transitions.filter((t) => t.field === "session");
  const structureChanges = transitions.filter((t) => t.field === "marketStructure");
  const biasChanges = transitions.filter((t) => t.field === "tradeableBias");
  const entryStatusTransitions = transitions.filter((t) => t.field === "entryStatus" || t.field === "entryActive");

  const totalEntryActiveMinutes = entryActiveWindows.reduce((s, w) => s + w.durationMinutes, 0);
  const totalSetupEligibleMinutes = setupEligibleWindows.reduce((s, w) => s + w.durationMinutes, 0);

  const responsive =
    verdictTransitions.length > 0 ||
    entryActiveWindows.length > 0 ||
    setupEligibleWindows.length > 0 ||
    structureChanges.length > 0;

  const evidenceParts: string[] = [];
  if (verdictTransitions.length > 0) {
    evidenceParts.push(
      `${verdictTransitions.length} verdict transition(s) at native 1m resolution (e.g. ${verdictTransitions.slice(0, 3).map((t) => `${t.from}→${t.to} @ ${t.asOf.slice(11, 16)}Z`).join(", ")})`
    );
  }
  if (entryActiveWindows.length > 0) {
    evidenceParts.push(
      `${entryActiveWindows.length} entryStatus ACTIVE window(s), ${totalEntryActiveMinutes} total minutes`
    );
  }
  if (setupEligibleWindows.length > 0) {
    evidenceParts.push(
      `${setupEligibleWindows.length} setup-eligible window(s), ${totalSetupEligibleMinutes} total minutes`
    );
  }
  if (structureChanges.length > 0) {
    evidenceParts.push(`${structureChanges.length} structure change(s)`);
  }
  if (!responsive) {
    evidenceParts.push("pipeline state static across all evaluated minutes — no transitions detected");
  }

  const poisonStart = barIndices[0]!;
  const poisonEnd = Math.min(barIndices[Math.min(20, barIndices.length - 1)]!, data.m1.length - 1);
  const poisonTest = runMinuteReplayPoisonTest(data, { startIndex: poisonStart, endIndex: poisonEnd });

  const firstAsOf = data.m1[barIndices[0]!]!.time.toISOString();
  const lastAsOf = data.m1[barIndices.at(-1)!]!.time.toISOString();

  return {
    datasetId,
    sessionDateFilter: sessionDate ?? null,
    range: { start: firstAsOf, end: lastAsOf, barCount: evaluationCount },
    evaluationCount,
    runtimeMs,
    msPerEvaluation: evaluationCount > 0 ? runtimeMs / evaluationCount : 0,
    verdictDistribution,
    entryStatusDistribution,
    transitions,
    verdictTransitions,
    sessionChanges,
    structureChanges,
    biasChanges,
    entryStatusTransitions,
    actionableWindows,
    setupEligibleWindows,
    entryActiveWindows,
    episodeIndices: [...episodeIndices].sort((a, b) => a - b),
    poisonTest,
    responsiveness: {
      verdictTransitionCount: verdictTransitions.length,
      entryActiveWindowCount: entryActiveWindows.length,
      setupEligibleWindowCount: setupEligibleWindows.length,
      totalEntryActiveMinutes,
      totalSetupEligibleMinutes,
      responsive,
      evidence: evidenceParts.join("; "),
    },
  };
}
