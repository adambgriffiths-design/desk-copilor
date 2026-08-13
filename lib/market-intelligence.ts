/**
 * Unified market intelligence — single build path for chat, snapshot, verdict, and voice.
 */
import { fetchAllTimeframesCached } from "./market-data";
import { buildMarketContext } from "./levels";
import { buildMarketState } from "./market-state-build";
import { buildMarketObservation } from "./observation-engine";
import { buildMarketInterpretation } from "./interpretation-engine";
import { buildObservationFacts, type ObservationFact } from "./observation-facts";
import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import type { MarketInterpretation, ReadonlyMarketObservation } from "./desk-schema";
import type { ChartSnapshotPayload } from "./chart-snapshot";
import type { AuthoritativePrice } from "./chart-live-price";
import { maybeResolveTickstreamFallback } from "./tickstream/stream-snapshot";

export type DeskMarketIntelligence = {
  ctx: MarketContext;
  state: MarketState;
  observation: ReadonlyMarketObservation;
  interpretation: MarketInterpretation;
  facts: ObservationFact[];
  built_at: string;
  state_hash: string;
  authoritativePrice?: AuthoritativePrice | null;
};

export type BuildIntelligenceInput = {
  estNow?: string;
  chartLastPrice?: number | null;
  chartLastPriceSource?: string | null;
  chartLastPriceTs?: number | null;
  chartSnapshot?: ChartSnapshotPayload | null;
  chartExportFailed?: boolean;
  forceFresh?: boolean;
};

function estNowDefault(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Canonical build — observation engine first, everything reads from here. */
export async function buildDeskMarketIntelligence(
  input: BuildIntelligenceInput = {}
): Promise<DeskMarketIntelligence> {
  const forceFresh = input.forceFresh ?? input.chartLastPrice != null;
  const data = await fetchAllTimeframesCached(forceFresh, input.chartLastPrice);

  let chartLastPrice = input.chartLastPrice;
  let chartLastPriceSource = input.chartLastPriceSource;
  let chartLastPriceTs = input.chartLastPriceTs;
  let authoritativePrice: AuthoritativePrice | null = null;

  const tickstream = await maybeResolveTickstreamFallback({
    chartLastPrice,
    chartLastPriceSource,
    chartLastPriceTs,
    chartSnapshot: input.chartSnapshot ?? null,
    chartExportFailed: input.chartExportFailed,
    barClose: data.m1?.at(-1)?.close ?? data.daily?.at(-1)?.close ?? null,
  });
  if (tickstream) {
    chartLastPrice = tickstream.value;
    chartLastPriceSource = tickstream.source;
    chartLastPriceTs = tickstream.timestamp;
    authoritativePrice = tickstream;
  }

  const ctx = buildMarketContext(data, input.estNow ?? estNowDefault(), chartLastPrice);
  const state = buildMarketState({
    ctx,
    chartSnapshot: input.chartSnapshot ?? null,
    chartLastPrice,
    chartLastPriceSource,
    chartLastPriceTs,
    authoritativePrice,
  });
  const observation = buildMarketObservation(ctx, state);
  const interpretation = buildMarketInterpretation(observation);
  const facts = buildObservationFacts(ctx, state, observation);

  return {
    ctx,
    state,
    observation,
    interpretation,
    facts,
    built_at: new Date().toISOString(),
    state_hash: state.stateHash,
    authoritativePrice,
  };
}

export function formatIntelligenceForPrompt(intel: DeskMarketIntelligence): string {
  const factLines = intel.facts
    .filter((f) => f.status !== "absent")
    .slice(0, 24)
    .map((f) => `- [${f.id}] ${f.label}: ${f.value} (${f.status})`);

  return [
    "## FROZEN MARKET OBSERVATIONS (facts only — cite by id; never invent)",
    `state_hash=${intel.state_hash} · data_quality=${intel.observation.data_quality} · updated=${intel.built_at}`,
    ...factLines,
    "",
    "## INTERPRETATION (meaning — separate from facts; may cite observation ids)",
    intel.interpretation.reasoning.slice(0, 600),
  ].join("\n");
}

export function summarizeIntelligence(intel: DeskMarketIntelligence): string {
  const mss = intel.facts.find((f) => f.id === "structure.mss");
  const price = intel.facts.find((f) => f.id === "market_state.last_price");
  return [
    `price=${price?.value ?? "unknown"}`,
    `session=${intel.observation.session}`,
    `bias=${intel.observation.htf_bias.tradeable_bias}`,
    `mss=${mss?.value ?? "none"}`,
    `quality=${intel.observation.data_quality}`,
  ].join(" | ");
}
