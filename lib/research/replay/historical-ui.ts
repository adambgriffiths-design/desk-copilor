/**
 * Smallest adapter: PIT fixture → DeskMarketIntelligence for normal Karen UI.
 * Uses buildKarenReplayResponse (runDeskPipeline / DecisionEnvelope) — NOT
 * buildDeterministicKarenResponse. Never writes live intel cache or Yahoo feeds.
 *
 * Label: HISTORICAL / FIXTURE — NOT LIVE MARKET DATA
 */
import { buildObservationFacts } from "../../observation-facts";
import { buildMarketState } from "../../market-state-build";
import {
  getLastPipelineResult,
  replaceLastPipelineResult,
} from "../../desk-pipeline";
import type { DeskPipelineResult } from "../../desk-schema";
import type { DeskMarketIntelligence } from "../../market-intelligence";
import { peekLiveDeskIntelligenceCache } from "../../market-intelligence";
import { bumpLiveLatency, noteLiveLatency } from "../../live-latency-profile";
import {
  markLiveLatencyStage,
  patchLiveLatencyTraceMeta,
} from "../../live-latency-trace";
import {
  formatMentorTradeSpoken,
  formatStructuredInvalidationFollowUp,
  formatStructuredWaitFollowUp,
  formatWhyNotDirectionFollowUp,
  resolveUserPresentationMode,
} from "../../decision-contract-output";
import type { DecisionEnvelope } from "../../decision-envelope";
import {
  recordDecisionEnvelopeHistory,
  withSuppressedDecisionHistoryRecord,
} from "../../decision-envelope-history";
import { isDecisionHistoryTimeQuery } from "../../decision-history-query";
import { answerHistoricalDecisionTimeTravel } from "../../decision-time-travel";
import {
  classifyMentorIntent,
  isMentorFollowUpOnPriorRead,
  mentorContextFromMessages,
  parseWhyNotDirection,
} from "../../mentor-intent";
import { buildResearchChartSnapshotFromBars } from "../chart-snapshot-from-bars";
import { ReplayDataCutoff } from "./cutoff";
import { buildKarenReplayResponse } from "./karen";
import { loadReplayFixture } from "./fixtures";

export const HISTORICAL_FIXTURE_BANNER =
  "HISTORICAL / FIXTURE — NOT LIVE MARKET DATA";

export const DEFAULT_HISTORICAL_FIXTURE_ID = "synthetic-ny-am";
export const DEFAULT_HISTORICAL_BAR_INDEX = 50;

export type HistoricalFixtureRequest = {
  fixtureId?: string;
  barIndex?: number;
};

export type HistoricalFixtureSession = {
  key: string;
  fixtureId: string;
  barIndex: number;
  asOf: string;
  symbol: string;
  price: number;
  intel: DeskMarketIntelligence;
  pipeline: DeskPipelineResult;
  karenSource: "pipeline";
  label: typeof HISTORICAL_FIXTURE_BANNER;
};

let historicalSession: HistoricalFixtureSession | null = null;

export function parseHistoricalFixtureRequest(
  raw: unknown
): HistoricalFixtureRequest | null {
  if (raw == null) return null;
  if (raw === true || raw === "1" || raw === "true") {
    return { fixtureId: DEFAULT_HISTORICAL_FIXTURE_ID, barIndex: DEFAULT_HISTORICAL_BAR_INDEX };
  }
  if (typeof raw === "string" && raw.trim()) {
    return { fixtureId: raw.trim(), barIndex: DEFAULT_HISTORICAL_BAR_INDEX };
  }
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fixtureId =
    typeof o.fixtureId === "string" && o.fixtureId.trim()
      ? o.fixtureId.trim()
      : typeof o.id === "string" && o.id.trim()
        ? o.id.trim()
        : DEFAULT_HISTORICAL_FIXTURE_ID;
  const barIndexRaw = o.barIndex ?? o.index;
  const barIndex =
    typeof barIndexRaw === "number" && Number.isFinite(barIndexRaw)
      ? Math.max(0, Math.floor(barIndexRaw))
      : DEFAULT_HISTORICAL_BAR_INDEX;
  return { fixtureId, barIndex };
}

export function historicalSessionKey(req: HistoricalFixtureRequest): string {
  const id = req.fixtureId?.trim() || DEFAULT_HISTORICAL_FIXTURE_ID;
  const idx =
    typeof req.barIndex === "number" && Number.isFinite(req.barIndex)
      ? Math.max(0, Math.floor(req.barIndex))
      : DEFAULT_HISTORICAL_BAR_INDEX;
  return `${id}@${idx}`;
}

export function getHistoricalFixtureSession(): HistoricalFixtureSession | null {
  return historicalSession;
}

export function clearHistoricalFixtureSession(): void {
  historicalSession = null;
}

export function labelHistoricalFixtureText(text: string): string {
  const t = String(text || "").trim();
  if (!t) return t;
  if (/HISTORICAL\s*\/\s*FIXTURE/i.test(t)) return t;
  return `${HISTORICAL_FIXTURE_BANNER}\n${t}`;
}

/**
 * Build intelligence from a PIT fixture via the authoritative Karen replay path.
 * Does not call Yahoo/Tickstream and does not write liveIntelCache.
 * Restores any prior live lastPipeline after build so live follow-ups are not polluted.
 */
export function buildHistoricalFixtureIntelligence(
  req: HistoricalFixtureRequest = {}
): HistoricalFixtureSession {
  const fixtureId = req.fixtureId?.trim() || DEFAULT_HISTORICAL_FIXTURE_ID;
  const barIndex =
    typeof req.barIndex === "number" && Number.isFinite(req.barIndex)
      ? Math.max(0, Math.floor(req.barIndex))
      : DEFAULT_HISTORICAL_BAR_INDEX;
  const key = `${fixtureId}@${barIndex}`;

  if (historicalSession?.key === key) {
    bumpLiveLatency("live_context_reuse_hit");
    noteLiveLatency("historical_fixture=reuse");
    patchLiveLatencyTraceMeta({
      dataMode: "HISTORICAL_FIXTURE",
      fixtureId,
      cache: "HIT",
      missReason: null,
      yahooFetched: false,
      tickstreamUsed: false,
      barIdentity: `fixture:${key}`,
      new1mBarInvalidation: false,
    });
    markLiveLatencyStage("market_data_started");
    markLiveLatencyStage("market_data_complete");
    markLiveLatencyStage("market_context_started");
    markLiveLatencyStage("market_context_complete");
    return historicalSession;
  }

  const liveCacheBefore = peekLiveDeskIntelligenceCache();
  const prevPipeline = getLastPipelineResult();

  markLiveLatencyStage("market_data_started");
  noteLiveLatency("historical_fixture=load");
  patchLiveLatencyTraceMeta({
    dataMode: "HISTORICAL_FIXTURE",
    fixtureId,
    yahooFetched: false,
    tickstreamUsed: false,
    cache: "MISS",
    missReason: "fixture_load",
    barIdentity: `fixture:${key}`,
    new1mBarInvalidation: false,
  });

  const tLoad = Date.now();
  const fixture = loadReplayFixture(fixtureId);
  if (!fixture.m1.length) throw new Error(`Historical fixture empty: ${fixtureId}`);
  const idx = Math.min(barIndex, fixture.m1.length - 1);
  const asOf = fixture.m1[idx]!.time;
  noteLiveLatency(`fixture_load_ms=${Date.now() - tLoad}`);
  markLiveLatencyStage("market_data_complete");

  markLiveLatencyStage("market_context_started");
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  cutoff.assertNoFutureLeak();
  const ctx = cutoff.buildContext();
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
    chartLastPriceSource: "research_bars",
    symbol: ctx.symbol,
    chartSnapshot,
  });

  // Authoritative path — same as research:replay primary (not deterministic formatter).
  // Suppress LIVE history recording while building; record HISTORICAL lane explicitly after.
  const { karen, pipeline } = withSuppressedDecisionHistoryRecord(() =>
    buildKarenReplayResponse(ctx, fixture, asOf)
  );
  if (karen.source !== "pipeline") {
    throw new Error("Historical UI requires pipeline Karen source");
  }

  const intel: DeskMarketIntelligence = {
    ctx,
    state,
    observation: pipeline.observation,
    interpretation: pipeline.interpretation,
    facts: buildObservationFacts(ctx, state, pipeline.observation),
    built_at: asOf.toISOString(),
    state_hash: state.stateHash,
  };

  // Restore live lastPipeline — historical session owns its pipeline separately.
  replaceLastPipelineResult(prevPipeline);

  // Isolation invariant: live intel cache must be untouched.
  if (peekLiveDeskIntelligenceCache() !== liveCacheBefore) {
    throw new Error("Historical fixture build polluted live intel cache");
  }

  const histEnv = pipeline.analysis_contract?.decision;
  if (histEnv) {
    recordDecisionEnvelopeHistory({
      asOf,
      dataMode: "HISTORICAL",
      envelope: histEnv,
      verdict: pipeline.decision.verdict,
      stateHash: state.stateHash,
      decisionKey: `${key}|${histEnv.stance}|${pipeline.decision.verdict}|${asOf.toISOString()}`,
      marketState: {
        price: lastBar?.close ?? ctx.daily.lastClose,
        stateHash: state.stateHash,
        snapshotId: state.snapshotId ?? null,
        htfBias: pipeline.observation.htf_bias?.tradeable_bias ?? null,
        structure: pipeline.observation.market_structure ?? null,
        displacement: pipeline.observation.displacement ?? null,
        fvgStatus: pipeline.observation.fvg?.status ?? null,
        verdict: pipeline.decision.verdict ?? null,
      },
      fixtureId,
      barIndex: idx,
      force: true,
    });
  }

  historicalSession = {
    key,
    fixtureId,
    barIndex: idx,
    asOf: asOf.toISOString(),
    symbol: fixture.symbol,
    price: lastBar?.close ?? ctx.daily.lastClose,
    intel,
    pipeline,
    karenSource: "pipeline",
    label: HISTORICAL_FIXTURE_BANNER,
  };

  markLiveLatencyStage("market_context_complete");
  noteLiveLatency(
    `historical_fixture=${fixtureId} index=${idx} asOf=${historicalSession.asOf} verdict=${pipeline.decision.verdict}`
  );
  return historicalSession;
}

export function formatHistoricalIntelligenceForPrompt(
  intel: DeskMarketIntelligence,
  session: HistoricalFixtureSession
): string {
  const factLines = intel.facts
    .filter((f) => f.status !== "absent")
    .slice(0, 24)
    .map((f) => `- [${f.id}] ${f.label}: ${f.value} (${f.status})`);
  return [
    `## ${HISTORICAL_FIXTURE_BANNER}`,
    `fixture=${session.fixtureId} barIndex=${session.barIndex} asOf=${session.asOf} symbol=${session.symbol} price=${session.price}`,
    "Do not claim this is live. Do not mix with TradingView live data.",
    "",
    "## FROZEN MARKET OBSERVATIONS (facts only — cite by id; never invent)",
    `state_hash=${intel.state_hash} · snapshot=${intel.state.snapshotId || intel.state_hash} · data_quality=${intel.observation.data_quality} · updated=${intel.built_at}`,
    ...factLines,
    "",
    "## INTERPRETATION (meaning — separate from facts; may cite observation ids)",
    intel.interpretation.reasoning.slice(0, 600),
  ].join("\n");
}

const PREVIOUS_DECISION_BANNER =
  "PREVIOUS DECISION — explaining the last spoken call, not a new snapshot.";

function labelPreviousDecision(spoken: string): string {
  const t = String(spoken || "").trim();
  if (!t) return t;
  if (/^PREVIOUS DECISION/i.test(t)) return t;
  return `${PREVIOUS_DECISION_BANNER}\n${t}`;
}

function historicalFollowUpCtx(session: HistoricalFixtureSession) {
  const pipe = session.pipeline;
  return {
    long_case: pipe.interpretation.long_case,
    short_case: pipe.interpretation.short_case,
    entry_model: pipe.interpretation.entry_model,
    rejected_alternative: pipe.analysis_contract?.rejected_alternative,
  };
}

/**
 * Authoritative historical turn for /api/chat/stream (normal UI path).
 * Never fetches live market data. Follow-ups reuse the same frozen session decision.
 */
export function answerHistoricalFixtureTurn(
  question: string,
  messages: { role: string; content: string }[],
  req: HistoricalFixtureRequest,
  opts?: { lastVerdict?: string }
): {
  reply: string;
  session: HistoricalFixtureSession;
  responseSource: string;
  envelope: DecisionEnvelope;
  decisionKey: string;
} {
  // Clock-time / what-changed / between — PIT DecisionEnvelope time-travel (not live).
  if (isDecisionHistoryTimeQuery(question)) {
    const traveled = answerHistoricalDecisionTimeTravel(question, req);
    if (traveled) {
      const session = buildHistoricalFixtureIntelligence(req);
      const env = session.pipeline.analysis_contract?.decision;
      if (!env) {
        throw new Error("Historical fixture pipeline missing DecisionEnvelope");
      }
      const decisionKey = `${session.key}|${env.stance}|${session.pipeline.decision.verdict}|${session.asOf}`;
      return {
        reply: traveled.reply,
        session,
        responseSource: traveled.responseSource,
        envelope: env,
        decisionKey,
      };
    }
  }

  const session = buildHistoricalFixtureIntelligence(req);
  const env = session.pipeline.analysis_contract?.decision;
  if (!env) {
    throw new Error("Historical fixture pipeline missing DecisionEnvelope");
  }
  const decisionKey = `${session.key}|${env.stance}|${session.pipeline.decision.verdict}|${session.asOf}`;
  const mentorCtx = mentorContextFromMessages(
    messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }))
  );
  if (!mentorCtx.lastAssistant && opts?.lastVerdict) {
    mentorCtx.lastVerdict = opts.lastVerdict;
  }

  const followUp =
    isMentorFollowUpOnPriorRead(question, mentorCtx) ||
    Boolean(parseWhyNotDirection(question));
  const ctx = historicalFollowUpCtx(session);

  let spoken: string;
  let responseSource: string;

  if (followUp) {
    const whyNot = parseWhyNotDirection(question);
    const mode = resolveUserPresentationMode();
    if (whyNot) {
      spoken = labelPreviousDecision(formatWhyNotDirectionFollowUp(env, whyNot, ctx, { mode }));
      responseSource = "historical_fixture_why_not";
    } else {
      const intent = classifyMentorIntent(question, mentorCtx);
      if (intent === "WAIT_EXPLANATION") {
        spoken = labelPreviousDecision(formatStructuredWaitFollowUp(env, ctx, { mode }));
        responseSource = "historical_fixture_wait";
      } else if (intent === "INVALIDATION") {
        spoken = labelPreviousDecision(formatStructuredInvalidationFollowUp(env, { mode }));
        responseSource = "historical_fixture_invalidation";
      } else {
        spoken = labelPreviousDecision(formatMentorTradeSpoken(env, { mode }));
        responseSource = "historical_fixture_explain";
      }
    }
  } else {
    spoken = formatMentorTradeSpoken(env, { mode: resolveUserPresentationMode() });
    responseSource = "historical_fixture_read";
  }

  return {
    reply: labelHistoricalFixtureText(spoken),
    session,
    responseSource,
    envelope: env,
    decisionKey,
  };
}
