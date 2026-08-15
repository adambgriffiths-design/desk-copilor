/**
 * Strict parity comparison — CURRENT vs OPTIMIZED research replay at identical T.
 */

import { buildDecisionEnvelope } from "../../decision-envelope";
import { buildMarketState } from "../../market-state-build";
import type { MarketContext } from "../../types";
import { fingerprintKarenInput } from "../../incremental-market-engine";
import { detectEqhEqlLiquidity } from "../eqh-eql-liquidity";
import { fingerprintEnvelope, fingerprintDecisionTrace } from "../architecture/fingerprint";
import type { EvaluatedDecision } from "../architecture/evaluate";
import { buildResearchChartSnapshotFromBars } from "../chart-snapshot-from-bars";
import { buildKarenReplayResponse } from "./karen";
import { ReplayDataCutoff } from "./cutoff";
import type { ReplayMarketData } from "./types";

export type ParityFieldDiff = {
  field: string;
  current: string;
  optimized: string;
};

export type ParityCompareResult = {
  timestamp: string;
  barIndex: number;
  pass: boolean;
  firstDivergence: ParityFieldDiff | null;
  diffs: ParityFieldDiff[];
  currentFingerprint: string;
  optimizedFingerprint: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fvgKey(z: { type: string; top: number; bottom: number; startTime?: number }): string {
  return `${z.type}:${z.top.toFixed(2)}:${z.bottom.toFixed(2)}:${z.startTime ?? 0}`;
}

function fingerprintLiquidity(ctx: MarketContext): string {
  const ix = ctx.structureFacts.levelInteractions ?? [];
  return (
    ix
      .map((i) => `${i.levelId}:${i.status}`)
      .sort()
      .join("|") || "none"
  );
}

function eqhFingerprint(data: ReplayMarketData, ctx: MarketContext, asOf: Date): string {
  const m1 = new ReplayDataCutoff(data, asOf).slicedM1();
  const eqh = detectEqhEqlLiquidity(m1, {
    symbol: data.symbol,
    currentPrice: ctx.daily.lastClose,
    lookback: 720,
    asOfIndex: m1.length - 1,
  });
  return eqh.areas
    .map(
      (a) =>
        `${a.type}:${a.representativeLevel.toFixed(2)}:${a.status}:${a.formationTime}:${a.confirmationTime}`
    )
    .sort()
    .join("|") || "none";
}

function envelopeFingerprint(ctx: MarketContext, data: ReplayMarketData, asOf: Date): string {
  const { pipeline } = buildKarenReplayResponse(ctx, data, asOf);
  const cutoff = new ReplayDataCutoff(data, asOf);
  const m1 = cutoff.slicedM1();
  const chartSnapshot = buildResearchChartSnapshotFromBars({
    bars: m1,
    symbol: ctx.symbol,
    asOf,
    timeframe: "1",
  });
  const state = buildMarketState({
    ctx,
    chartLastPrice: m1.at(-1)?.close ?? ctx.daily.lastClose,
    chartLastPriceSource: "yahoo",
    symbol: ctx.symbol,
    chartSnapshot,
  });
  return fingerprintEnvelope(buildDecisionEnvelope(pipeline, ctx, state));
}

export function marketContextParityFields(
  ctx: MarketContext,
  data: ReplayMarketData,
  asOf: Date
): Record<string, string> {
  const pdc = ctx.daily.previousDayClose ?? ctx.htfPdArrays.previousDay.close;
  const { pipeline } = buildKarenReplayResponse(ctx, data, asOf);
  const env = pipeline.analysis_contract?.decision;
  return {
    price: String(round2(ctx.daily.lastClose)),
    session: ctx.activeSession.id,
    amd: ctx.activeSession.amdPhase,
    pdc: String(round2(pdc)),
    pdcFormedAt: String(ctx.daily.pdcFormedAt ?? 0),
    pdh: String(round2(ctx.daily.previousDayHigh)),
    pdl: String(round2(ctx.daily.previousDayLow)),
    pdhSource: ctx.daily.pdhSource ?? "none",
    cdh: String(round2(ctx.daily.currentDayHigh)),
    cdl: String(round2(ctx.daily.currentDayLow)),
    asia: `${round2(ctx.sessions.asiaHigh)}/${round2(ctx.sessions.asiaLow)}`,
    london: `${round2(ctx.sessions.londonHigh)}/${round2(ctx.sessions.londonLow)}`,
    nyPre: `${round2(ctx.sessions.nyPreHigh)}/${round2(ctx.sessions.nyPreLow)}`,
    nyRth: `${round2(ctx.sessions.nyRthHigh)}/${round2(ctx.sessions.nyRthLow)}`,
    mss: ctx.structureFacts.mss
      ? `${ctx.structureFacts.mss.direction}@${round2(ctx.structureFacts.mss.level)}@${ctx.structureFacts.mss.atTime}`
      : "none",
    bos: "none",
    fvg1m: ctx.structureFacts.m1UnfilledFvgs.map(fvgKey).join("|") || "none",
    fvg5m: ctx.timeframe5m.unfilledFvgs.map(fvgKey).join("|") || "none",
    fvg15m: ctx.timeframe15m.unfilledFvgs.map(fvgKey).join("|") || "none",
    rehRel:
      ctx.structureFacts.relativeEqualPools
        .map((p) => `${p.type}:${p.price.toFixed(2)}:${p.startTime}`)
        .join("|") || "none",
    sweeps:
      ctx.structureFacts.liquiditySweeps
        .map((s) => `${s.levelId}:${s.side}:${s.price.toFixed(2)}:${s.atTime}`)
        .join("|") || "none",
    liquidity: fingerprintLiquidity(ctx),
    bias: `${ctx.biasStack.daily}/${ctx.biasStack.m15}/${ctx.biasStack.m5}/${ctx.biasStack.tradeableBias}`,
    pd: ctx.premiumDiscount.vsCurrentDayRange,
    htf: `${round2(ctx.timeframe15m.high)}/${round2(ctx.timeframe15m.low)}/${ctx.timeframe15m.biasHint}`,
    ltf: `${round2(ctx.timeframe5m.high)}/${round2(ctx.timeframe5m.low)}/${ctx.timeframe5m.biasHint}`,
    org: ctx.org ? `${round2(ctx.org.top)}/${round2(ctx.org.bottom)}/${round2(ctx.org.ce)}` : "none",
    nwog: ctx.nwog ? `${round2(ctx.nwog.top)}/${round2(ctx.nwog.bottom)}` : "none",
    eqh: eqhFingerprint(data, ctx, asOf),
    karenFp: fingerprintKarenInput(ctx),
    envelopeFp: envelopeFingerprint(ctx, data, asOf),
    verdict: pipeline.decision.verdict,
    entry: pipeline.decision.entry_zone ?? "null",
    invalidation: pipeline.decision.invalidation == null ? "null" : String(pipeline.decision.invalidation),
    target: pipeline.decision.target == null ? "null" : String(pipeline.decision.target),
    stance: env?.stance ?? pipeline.decision.verdict,
    thesis: env?.thesis ? JSON.stringify(env.thesis) : "null",
    conflictLog: env?.conflictLog
      ? `${env.conflictLog.disagree}:${env.conflictLog.htfLean}:${env.conflictLog.tacticalLean}:${env.conflictLog.why?.slice(0, 40) ?? ""}`
      : "none",
    conceptsDetectedUsed: (env?.reasoningChain ?? [])
      .map((c) => `${c.concept}:${c.detected ? 1 : 0}:${c.usedInDecision ? 1 : 0}`)
      .join("|"),
    conceptsProvenance: (env?.reasoningChain ?? [])
      .filter((c) => c.detected)
      .map((c) => `${c.concept}:${c.evidence.source}:${c.evidence.status}`)
      .join("|"),
  };
}

export function compareMarketContextParity(
  currentCtx: MarketContext,
  optimizedCtx: MarketContext,
  data: ReplayMarketData,
  asOf: Date,
  barIndex: number
): ParityCompareResult {
  const a = marketContextParityFields(currentCtx, data, asOf);
  const b = marketContextParityFields(optimizedCtx, data, asOf);
  const diffs: ParityFieldDiff[] = [];
  for (const key of Object.keys(a).sort()) {
    if (String(a[key]) !== String(b[key])) {
      diffs.push({
        field: key,
        current: String(a[key]).slice(0, 120),
        optimized: String(b[key]).slice(0, 120),
      });
    }
  }
  return {
    timestamp: asOf.toISOString(),
    barIndex,
    pass: diffs.length === 0,
    firstDivergence: diffs[0] ?? null,
    diffs,
    currentFingerprint: fingerprintKarenInput(currentCtx),
    optimizedFingerprint: fingerprintKarenInput(optimizedCtx),
  };
}

export function compareEvaluatedDecisions(
  current: EvaluatedDecision,
  optimized: EvaluatedDecision,
  data: ReplayMarketData,
  asOf: Date,
  barIndex: number
): ParityCompareResult {
  const ctxCmp = compareMarketContextParity(
    current.marketContext,
    optimized.marketContext,
    data,
    asOf,
    barIndex
  );
  const extra: ParityFieldDiff[] = [];
  if (current.fingerprint !== optimized.fingerprint) {
    extra.push({
      field: "decisionTraceFingerprint",
      current: current.fingerprint.slice(0, 16),
      optimized: optimized.fingerprint.slice(0, 16),
    });
  }
  if (current.trace.stance !== optimized.trace.stance) {
    extra.push({ field: "trace.stance", current: current.trace.stance, optimized: optimized.trace.stance });
  }
  if (current.trace.entry !== optimized.trace.entry) {
    extra.push({
      field: "trace.entry",
      current: String(current.trace.entry),
      optimized: String(optimized.trace.entry),
    });
  }
  if (current.trace.target !== optimized.trace.target) {
    extra.push({
      field: "trace.target",
      current: String(current.trace.target),
      optimized: String(optimized.trace.target),
    });
  }
  if (current.trace.invalidation !== optimized.trace.invalidation) {
    extra.push({
      field: "trace.invalidation",
      current: String(current.trace.invalidation),
      optimized: String(optimized.trace.invalidation),
    });
  }
  const conflictA = JSON.stringify(current.trace.conflicts);
  const conflictB = JSON.stringify(optimized.trace.conflicts);
  if (conflictA !== conflictB) {
    extra.push({ field: "conflictLog", current: conflictA.slice(0, 80), optimized: conflictB.slice(0, 80) });
  }
  const conceptsA = current.trace.concepts.map((c) => `${c.concept}:${c.detected}:${c.used}`).join("|");
  const conceptsB = optimized.trace.concepts.map((c) => `${c.concept}:${c.detected}:${c.used}`).join("|");
  if (conceptsA !== conceptsB) {
    extra.push({ field: "conceptsDetectedUsed", current: conceptsA.slice(0, 80), optimized: conceptsB.slice(0, 80) });
  }

  const diffs = [...ctxCmp.diffs, ...extra.filter((e) => !ctxCmp.diffs.some((d) => d.field === e.field))];
  return {
    timestamp: asOf.toISOString(),
    barIndex,
    pass: diffs.length === 0,
    firstDivergence: diffs[0] ?? null,
    diffs,
    currentFingerprint: fingerprintDecisionTrace(current.trace),
    optimizedFingerprint: fingerprintDecisionTrace(optimized.trace),
  };
}

export function pickParityCheckpoints(m1: { time: Date }[], count: number, warmup = 60): number[] {
  const start = Math.max(warmup, 0);
  const end = m1.length - 5;
  const span = end - start;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = start + Math.floor(((i + 1) / (count + 1)) * span);
    out.push(Math.min(end, Math.max(start, idx)));
  }
  return out;
}
