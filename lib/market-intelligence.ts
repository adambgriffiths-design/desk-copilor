/**
 * Unified market intelligence — single build path for chat, snapshot, verdict, and voice.
 */
import { fetchAllTimeframesCached, runWithMarketDataRequestScope } from "./market-data";
import { buildMarketObservation } from "./observation-engine";
import { buildMarketInterpretation } from "./interpretation-engine";
import { buildObservationFacts, type ObservationFact } from "./observation-facts";
import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import type { MarketInterpretation, ReadonlyMarketObservation } from "./desk-schema";
import {
  hydrateChartSnapshotFromBars,
  type ChartSnapshotPayload,
} from "./chart-snapshot";
import type { AuthoritativePrice } from "./chart-live-price";
import { maybeResolveTickstreamFallback } from "./tickstream/stream-snapshot";
import { toEqhEqlTrackRows, type EqhEqlTrackRow } from "./research/eqh-eql-liquidity";
import {
  syncLiveEngineFromFeed,
  buildLiveMarketReuseKey,
  decideLiveMarketReuse,
  followUpClockAllowsReuse,
  formatLiveMarketReuseFingerprint,
  type EngineSnapshot,
  type LiveMarketReuseKey,
} from "./incremental-market-engine";
import { formatMeaningfulEqhEqlForPrompt } from "./voice-eqh-eql";
import { bumpLiveLatency, markLiveLatency, noteLiveLatency } from "./live-latency-profile";
import {
  markLiveLatencyStage,
  patchLiveLatencyTraceMeta,
} from "./live-latency-trace";
import { buildMarketState } from "./market-state-build";

export type DeskMarketIntelligence = {
  ctx: MarketContext;
  state: MarketState;
  observation: ReadonlyMarketObservation;
  interpretation: MarketInterpretation;
  facts: ObservationFact[];
  /** Research EQH/EQL rows with importance + why. Production reh-rel unchanged. */
  eqhEqlRows?: EqhEqlTrackRow[];
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
  /** Follow-up path: Yahoo bars + fingerprint only; do not wait on Tickstream. */
  skipLivePriceOverlay?: boolean;
};

type LiveIntelCacheEntry = {
  reuseKey: LiveMarketReuseKey;
  asOfMs: number;
  intel: DeskMarketIntelligence;
};

let liveIntelCache: LiveIntelCacheEntry | null = null;

export function resetLiveDeskIntelligenceCache(): void {
  liveIntelCache = null;
}

export function rememberLiveDeskIntelligenceCache(
  intel: DeskMarketIntelligence,
  reuseKey: LiveMarketReuseKey,
  asOfMs = Date.now()
): void {
  liveIntelCache = { reuseKey, asOfMs, intel };
}

export function peekLiveDeskIntelligenceCache(): LiveIntelCacheEntry | null {
  return liveIntelCache;
}

/**
 * Reuse the last assembled intelligence when the follow-up clock still matches
 * the snapshot (same session + same wall-clock 1-minute as `asOf`).
 * Does not fetch Yahoo or rebuild OHLC.
 */
export function tryReuseLiveDeskIntelligence(now = new Date()): DeskMarketIntelligence | null {
  if (!liveIntelCache) return null;
  if (!followUpClockAllowsReuse(liveIntelCache.reuseKey.sessionKey, liveIntelCache.asOfMs, now)) {
    return null;
  }
  bumpLiveLatency("live_context_reuse_hit");
  noteLiveLatency("live_context=hit");
  patchLiveLatencyTraceMeta({
    cache: "HIT",
    missReason: null,
    barIdentity: formatLiveMarketReuseFingerprint(liveIntelCache.reuseKey),
    new1mBarInvalidation: false,
  });
  return liveIntelCache.intel;
}

export function assembleDeskMarketIntelligenceFromEngine(
  synced: EngineSnapshot,
  extra: {
    chartSnapshot?: ChartSnapshotPayload | null;
    chartLastPrice?: number | null;
    chartLastPriceSource?: string | null;
    chartLastPriceTs?: number | null;
    authoritativePrice?: AuthoritativePrice | null;
  } = {}
): DeskMarketIntelligence {
  const ctx = synced.ctx;
  const state = buildMarketState({
    ctx,
    chartSnapshot: extra.chartSnapshot,
    chartLastPrice: extra.chartLastPrice,
    chartLastPriceSource: extra.chartLastPriceSource,
    chartLastPriceTs: extra.chartLastPriceTs,
    authoritativePrice: extra.authoritativePrice,
  });
  const observation = buildMarketObservation(ctx, state);
  const interpretation = buildMarketInterpretation(observation);
  const facts = buildObservationFacts(ctx, state, observation);
  let eqhEqlRows: EqhEqlTrackRow[] = [];
  try {
    eqhEqlRows = toEqhEqlTrackRows(synced.eqhEql, {
      currentPrice: ctx.daily.lastClose,
      maxRows: 12,
    });
  } catch {
    eqhEqlRows = [];
  }
  return {
    ctx,
    state,
    observation,
    interpretation,
    facts,
    eqhEqlRows,
    built_at: new Date().toISOString(),
    state_hash: state.stateHash,
    authoritativePrice: extra.authoritativePrice,
  };
}

function estNowDefault(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function buildDeskMarketIntelligenceInner(
  input: BuildIntelligenceInput
): Promise<DeskMarketIntelligence> {
  const forceFresh = input.forceFresh === true;
  bumpLiveLatency("market_intel_builds");
  markLiveLatencyStage("market_data_started");
  const data = await fetchAllTimeframesCached(forceFresh);
  markLiveLatency("t3_market_data");

  let chartLastPrice = input.chartLastPrice;
  let chartLastPriceSource = input.chartLastPriceSource;
  let chartLastPriceTs = input.chartLastPriceTs;
  let authoritativePrice: AuthoritativePrice | null = null;
  let chartSnapshot: ChartSnapshotPayload | null = input.chartSnapshot ?? null;
  if (
    !chartSnapshot?.candles?.length ||
    chartSnapshot.candles.length < 20 ||
    chartSnapshot.qualityMeta?.quality === "missing"
  ) {
    const hydrated = hydrateChartSnapshotFromBars(chartSnapshot, data.m1, {
      lastPrice: chartLastPrice,
    });
    if (hydrated) chartSnapshot = hydrated;
  }

  const tickstream = input.skipLivePriceOverlay
    ? null
    : await maybeResolveTickstreamFallback({
        chartLastPrice,
        chartLastPriceSource,
        chartLastPriceTs,
        chartSnapshot: chartSnapshot,
        chartExportFailed: input.chartExportFailed,
        barClose: data.m1?.at(-1)?.close ?? data.daily?.at(-1)?.close ?? null,
      });
  if (tickstream) {
    chartLastPrice = tickstream.value;
    chartLastPriceSource = tickstream.source;
    chartLastPriceTs = tickstream.timestamp;
    authoritativePrice = tickstream;
    noteLiveLatency(`price_source=${tickstream.source}`);
  }
  patchLiveLatencyTraceMeta({ tickstreamUsed: Boolean(tickstream) });
  markLiveLatencyStage("market_data_complete");
  markLiveLatencyStage("market_context_started");

  const asOf = new Date();
  const lastPrice = chartLastPrice ?? data.m1.at(-1)?.close ?? null;
  const reuseKey = buildLiveMarketReuseKey(data, asOf, lastPrice);
  const barIdentity = formatLiveMarketReuseFingerprint(reuseKey);

  if (!forceFresh && liveIntelCache && decideLiveMarketReuse(liveIntelCache.reuseKey, reuseKey).hit) {
    bumpLiveLatency("live_context_reuse_hit");
    noteLiveLatency("live_context=hit");
    patchLiveLatencyTraceMeta({
      cache: "HIT",
      missReason: null,
      barIdentity,
      new1mBarInvalidation: false,
    });
    markLiveLatencyStage("market_context_complete");
    return liveIntelCache.intel;
  }

  const synced = syncLiveEngineFromFeed({
    data,
    asOf,
    lastPrice,
    chartTimeEst: input.estNow ?? estNowDefault(),
    allowReuse: !forceFresh,
  });
  if (synced.contextReuse === "hit" && liveIntelCache && decideLiveMarketReuse(liveIntelCache.reuseKey, reuseKey).hit) {
    bumpLiveLatency("live_context_reuse_hit");
    noteLiveLatency("live_context=hit");
    patchLiveLatencyTraceMeta({
      cache: "HIT",
      missReason: null,
      barIdentity,
      new1mBarInvalidation: false,
    });
    markLiveLatencyStage("market_context_complete");
    return liveIntelCache.intel;
  }
  if (synced.contextReuse === "hit") {
    noteLiveLatency("live_context=hit_engine");
    patchLiveLatencyTraceMeta({
      cache: "HIT",
      missReason: null,
      barIdentity,
      new1mBarInvalidation: false,
    });
  } else {
    const missReason = synced.contextReuseReason ?? "sync";
    bumpLiveLatency("live_context_reuse_miss");
    noteLiveLatency(`live_context=miss:${missReason}`);
    patchLiveLatencyTraceMeta({
      cache: "MISS",
      missReason,
      barIdentity,
      new1mBarInvalidation: missReason === "bars",
    });
  }

  const intel = assembleDeskMarketIntelligenceFromEngine(synced, {
    chartSnapshot,
    chartLastPrice,
    chartLastPriceSource,
    chartLastPriceTs,
    authoritativePrice,
  });
  liveIntelCache = { reuseKey, asOfMs: asOf.getTime(), intel };
  markLiveLatencyStage("market_context_complete");
  return intel;
}

/** Canonical build — observation engine first, everything reads from here. */
export async function buildDeskMarketIntelligence(
  input: BuildIntelligenceInput = {}
): Promise<DeskMarketIntelligence> {
  return runWithMarketDataRequestScope(() => buildDeskMarketIntelligenceInner(input));
}

function isProductionRehRelDump(id: string): boolean {
  return (
    /^liquidity\.(reh|rel)(\.|$)/.test(id) ||
    id === "liquidity.reh_rel" ||
    id === "liquidity.reh" ||
    id === "liquidity.rel"
  );
}

export function formatIntelligenceForPrompt(intel: DeskMarketIntelligence): string {
  const skipRehRel = Boolean(intel.eqhEqlRows?.length);
  const factLines = intel.facts
    .filter((f) => f.status !== "absent")
    .filter((f) => !(skipRehRel && isProductionRehRelDump(f.id)))
    .slice(0, 24)
    .map((f) => `- [${f.id}] ${f.label}: ${f.value} (${f.status})`);

  return [
    "## FROZEN MARKET OBSERVATIONS (facts only — cite by id; never invent)",
    `state_hash=${intel.state_hash} · snapshot=${intel.state.snapshotId || intel.state_hash} · data_quality=${intel.observation.data_quality} · updated=${intel.built_at}`,
    ...factLines,
    "",
    formatMeaningfulEqhEqlForPrompt(intel.eqhEqlRows),
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
