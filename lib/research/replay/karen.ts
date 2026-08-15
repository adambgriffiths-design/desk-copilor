import { buildMarketState } from "../../market-state-build";
import { runDeskPipeline } from "../../desk-pipeline";
import type { MarketContext } from "../../types";
import { buildResearchChartSnapshotFromBars } from "../chart-snapshot-from-bars";
import type { KarenReplayResponse } from "./types";
import { ReplayDataCutoff } from "./cutoff";
import type { ReplayMarketData } from "./types";

export function buildKarenReplayResponse(
  ctx: MarketContext,
  data: ReplayMarketData,
  asOf: Date
): { karen: KarenReplayResponse; pipeline: ReturnType<typeof runDeskPipeline> } {
  const cutoff = new ReplayDataCutoff(data, asOf);
  const m1 = cutoff.slicedM1();
  const lastBar = m1.at(-1);
  const chartSnapshot = buildResearchChartSnapshotFromBars({
    bars: m1,
    symbol: ctx.symbol,
    asOf,
    timeframe: "1",
  });
  const state = buildMarketState({
    ctx,
    chartLastPrice: lastBar?.close ?? ctx.daily.lastClose,
    chartLastPriceSource: "yahoo",
    symbol: ctx.symbol,
    chartSnapshot,
  });
  const pipeline = runDeskPipeline(ctx, state);
  const karen = formatKarenFromPipeline(ctx, pipeline, data, asOf);
  return { karen, pipeline };
}

function formatKarenFromPipeline(
  ctx: MarketContext,
  pipeline: ReturnType<typeof runDeskPipeline>,
  data: ReplayMarketData,
  asOf: Date
): KarenReplayResponse {
  const cutoff = new ReplayDataCutoff(data, asOf);
  const m1 = cutoff.slicedM1();
  const recent = m1.slice(-5);
  const candlesUsed = recent.map(
    (b) => `${b.time.toISOString()} O:${b.open} H:${b.high} L:${b.low} C:${b.close}`
  );

  const levelsUsed: string[] = [];
  if (ctx.org) {
    levelsUsed.push(`ORG top ${ctx.org.top}`, `ORG CE ${ctx.org.ce}`, `ORG bottom ${ctx.org.bottom}`);
  }
  for (const lv of ctx.htfPdArrays.levels.slice(0, 4)) {
    levelsUsed.push(`${lv.label} ${lv.price.toFixed(1)}`);
  }

  const fvg = ctx.structureFacts.m1UnfilledFvgs.at(-1);
  const fvgEvidence = fvg
    ? `${fvg.type} FVG ${fvg.bottom.toFixed(1)}–${fvg.top.toFixed(1)} (formed ${fvg.formedAt})`
    : pipeline.observation.fvg.status === "present"
      ? `FVG ${pipeline.observation.fvg.direction ?? "active"} ${pipeline.observation.fvg.bottom ?? ""}–${pipeline.observation.fvg.top ?? ""}`
      : "No unfilled 1m FVG at cutoff";

  const pdEvidence = `${ctx.premiumDiscount.summary} (PDH ${ctx.htfPdArrays.previousDay.high.toFixed(1)} / PDL ${ctx.htfPdArrays.previousDay.low.toFixed(1)})`;

  const mss = ctx.structureFacts.mss;
  const structureEvidence = mss
    ? mss.description
    : `Structure: ${pipeline.observation.market_structure}, displacement ${pipeline.observation.displacement}`;

  const decision = pipeline.decision;
  const entryIdea =
    decision.entry_zone ??
    (decision.verdict === "LONG"
      ? `Long bias — watch ${ctx.org?.ce?.toFixed(1) ?? "value"} CE`
      : decision.verdict === "SHORT"
        ? `Short bias — reject ${ctx.org?.top?.toFixed(1) ?? "supply"}`
        : "Wait — no clean entry at cutoff");

  return {
    entryIdea,
    invalidation:
      decision.invalidation != null
        ? String(decision.invalidation)
        : `Below ${ctx.sessions.nyRthLow?.toFixed(1) ?? "session low"}`,
    target:
      decision.target != null
        ? String(decision.target)
        : `Toward ${ctx.sessions.nyRthHigh?.toFixed(1) ?? "session high"}`,
    fvgEvidence,
    pdEvidence,
    structureEvidence,
    confidence:
      decision.verdict === "LONG" || decision.verdict === "SHORT"
        ? 65
        : decision.verdict === "WAIT"
          ? 45
          : 30,
    candlesUsed,
    levelsUsed,
    pipelineVerdict: decision.verdict,
    source: "pipeline",
  };
}

/**
 * NON-AUTHORITATIVE — offline bias heuristic only (always LONG|SHORT, never WAIT).
 * Not strategy / not DecisionEnvelope / not live mentor. Do not use for research:replay
 * primary result; prefer buildKarenReplayResponse → runDeskPipeline.
 */
export function buildDeterministicKarenResponse(
  ctx: MarketContext,
  data: ReplayMarketData,
  asOf: Date
): KarenReplayResponse {
  const cutoff = new ReplayDataCutoff(data, asOf);
  const m1 = cutoff.slicedM1();
  const price = m1.at(-1)?.close ?? ctx.daily.lastClose;
  const bias = ctx.biasStack.dominantBias ?? ctx.daily.biasHint;
  const fvg = ctx.structureFacts.m1UnfilledFvgs.at(-1);

  const candlesUsed = m1.slice(-3).map(
    (b) => `${b.time.toISOString()} C:${b.close.toFixed(1)}`
  );
  const levelsUsed = [`Last ${price.toFixed(1)}`, `PDH ${ctx.htfPdArrays.previousDay.high.toFixed(1)}`];

  const longBias = bias === "bullish" || ctx.structureFacts.mss?.direction === "bullish";

  return {
    entryIdea: longBias ? `Pullback long near ${(price - 5).toFixed(1)}` : `Fade rally near ${(price + 5).toFixed(1)}`,
    invalidation: longBias ? `${(price - 15).toFixed(1)}` : `${(price + 15).toFixed(1)}`,
    target: longBias ? `${(price + 20).toFixed(1)}` : `${(price - 20).toFixed(1)}`,
    fvgEvidence: fvg ? `${fvg.type} gap ${fvg.bottom}–${fvg.top}` : "No FVG at cutoff",
    pdEvidence: `PDH/PDL ${ctx.htfPdArrays.previousDay.high}/${ctx.htfPdArrays.previousDay.low}`,
    structureEvidence: ctx.structureFacts.mss?.description ?? `Bias stack ${bias}`,
    confidence: longBias ? 62 : 58,
    candlesUsed,
    levelsUsed,
    pipelineVerdict: longBias ? "LONG" : "SHORT",
    source: "deterministic",
  };
}
