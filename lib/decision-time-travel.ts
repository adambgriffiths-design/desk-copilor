/**
 * Decision history + time-travel explanations via DecisionEnvelope
 * (buildKarenReplayResponse → runDeskPipeline). LIVE and HISTORICAL never mix.
 */
import {
  formatMentorTradeSpoken,
  resolveUserPresentationMode,
} from "./decision-contract-output";
import {
  renderHistoryActionableLead,
  renderHistoryCompositeLead,
  renderHistoryRecordedOnlyLead,
  renderPreviousSetupLead,
  renderSetupOutcomeStillLatest,
  renderSetupOutcomeSuperseded,
} from "./conversational-renderer";
import type { DecisionEnvelope } from "./decision-envelope";
import {
  findDecisionAtOrBefore,
  findDecisionStrictlyBefore,
  findLatestDirectionalDecision,
  getDecisionEnvelopeHistory,
  isDirectionalRecordedStatus,
  latestDecisionEnvelope,
  normalizeRecordedStatus,
  recordDecisionEnvelopeHistory,
  synthesizeDecisionKey,
  withDecisionHistorySuppressed,
  type DecisionEnvelopeHistoryEntry,
  type DecisionHistoryLane,
  type RecordedDecisionStatus,
} from "./decision-envelope-history";
import {
  parseDecisionHistoryQuery,
  type ParsedClockTime,
} from "./decision-history-query";
import { getLastPipelineResult, replaceLastPipelineResult } from "./desk-pipeline";
import {
  cmeSessionDateKeyFromDate,
  estTimeOnDateKey,
  formatEst,
  getEstDateKey,
  getEstMinutes,
} from "./market-data";
import { ReplayDataCutoff } from "./research/replay/cutoff";
import { loadReplayFixture } from "./research/replay/fixtures";
import { buildKarenReplayResponse } from "./research/replay/karen";
import type { ReplayMarketData } from "./research/replay/types";
import type { Bar } from "./types";

export const LIVE_HISTORY_BANNER = "LIVE — CURRENT SESSION HISTORY";
export const HISTORICAL_HISTORY_BANNER =
  "HISTORICAL / FIXTURE — NOT LIVE MARKET DATA · DECISION HISTORY";

export type FixtureClockHit = {
  barIndex: number;
  bar: Bar;
  match: "exact" | "nearest_previous";
  requestedClock: string;
  asOfEst: string;
};

export type DecisionSnapshotOk = {
  ok: true;
  match: "exact" | "nearest_previous" | "history";
  asOf: string;
  asOfEst: string;
  requestedClock: string;
  decisionKey: string;
  /** Top-level recorded status — same as live DecisionEnvelope verdict. */
  status: RecordedDecisionStatus;
  entryStatus?: string;
  envelope: DecisionEnvelope;
  evidence: string;
  marketState: {
    price: number | null;
    stateHash: string | null;
    htfBias: string | null;
    structure: string | null;
    displacement: string | null;
    fvgStatus: string | null;
    verdict: string | null;
  };
  entry?: DecisionEnvelopeHistoryEntry;
  barIndex?: number;
  fixtureId?: string;
  /** True when answered from HISTORICAL/LIVE ring without PIT rebuild. */
  fromStore?: boolean;
};

export type DecisionSnapshotMiss = {
  ok: false;
  reason: "no_decision_available";
  detail: string;
  requestedClock: string;
};

export type DecisionSnapshot = DecisionSnapshotOk | DecisionSnapshotMiss;

export type DecisionCompareResult = {
  decisionChanged: boolean;
  marketStateChanges: string[];
  interpretationChanges: string[];
  decisionChanges: string[];
  formatted: string;
  earlier: DecisionSnapshotOk;
  later: DecisionSnapshotOk;
  lane: DecisionHistoryLane;
};

function labelLane(lane: DecisionHistoryLane, text: string): string {
  const banner = lane === "LIVE" ? LIVE_HISTORY_BANNER : HISTORICAL_HISTORY_BANNER;
  const t = String(text || "").trim();
  if (!t) return banner;
  if (t.includes(banner) || (lane === "HISTORICAL" && /HISTORICAL\s*\/\s*FIXTURE/i.test(t))) {
    return t;
  }
  return `${banner}\n${t}`;
}

function clockMinutes(c: ParsedClockTime): number {
  return c.hour * 60 + c.minute;
}

function estMinutesFromBar(bar: Bar): number {
  return getEstMinutes(bar.time);
}

/** Find m1 bar at exact EST clock, else nearest previous bar same session. */
export function findFixtureBarAtOrBeforeClock(
  fixture: ReplayMarketData,
  clock: ParsedClockTime
): FixtureClockHit | null {
  const target = clockMinutes(clock);
  let bestIdx = -1;
  let exact = false;
  for (let i = 0; i < fixture.m1.length; i++) {
    const mins = estMinutesFromBar(fixture.m1[i]!);
    if (mins === target) {
      bestIdx = i;
      exact = true;
      break;
    }
    if (mins <= target) bestIdx = i;
    else break;
  }
  if (bestIdx < 0) return null;
  const bar = fixture.m1[bestIdx]!;
  return {
    barIndex: bestIdx,
    bar,
    match: exact ? "exact" : "nearest_previous",
    requestedClock: clock.raw,
    asOfEst: formatEst(bar.time),
  };
}

function snapshotFromPipeline(
  pipeline: ReturnType<typeof buildKarenReplayResponse>["pipeline"],
  opts: {
    asOf: Date;
    match: DecisionSnapshotOk["match"];
    requestedClock: string;
    price: number | null;
    barIndex?: number;
    fixtureId?: string;
    decisionKey?: string;
    entryStatus?: string;
  }
): DecisionSnapshotOk {
  const env = pipeline.analysis_contract?.decision;
  if (!env) throw new Error("Pipeline missing DecisionEnvelope");
  const evidence =
    String(env.layers.facts || "").trim() ||
    env.reasoningChain
      .filter((r) => r.detected)
      .slice(0, 4)
      .map((r) => `${r.concept}: ${r.impact}`)
      .join("; ");
  const verdict = String(pipeline.decision.verdict || env.stance);
  const asOfIso = opts.asOf.toISOString();
  const decisionKey =
    (opts.decisionKey && opts.decisionKey.trim()) ||
    synthesizeDecisionKey({
      lane: "HISTORICAL",
      asOf: asOfIso,
      stance: env.stance,
      verdict,
      fixtureId: opts.fixtureId,
      barIndex: opts.barIndex,
    });
  return {
    ok: true,
    match: opts.match,
    asOf: asOfIso,
    asOfEst: formatEst(opts.asOf),
    requestedClock: opts.requestedClock,
    decisionKey,
    status: normalizeRecordedStatus(verdict, env.stance),
    entryStatus: opts.entryStatus,
    envelope: env,
    evidence,
    marketState: {
      price: opts.price,
      stateHash: pipeline.state_hash,
      htfBias: pipeline.observation.htf_bias?.tradeable_bias ?? null,
      structure: pipeline.observation.market_structure ?? null,
      displacement: pipeline.observation.displacement ?? null,
      fvgStatus: pipeline.observation.fvg?.status ?? null,
      verdict: pipeline.decision.verdict ?? null,
    },
    barIndex: opts.barIndex,
    fixtureId: opts.fixtureId,
  };
}

/**
 * Prefer the first recorded HISTORICAL entry for fixture@barIndex (status parity).
 * Does not re-run analysis when a store hit exists.
 * Used by PIT lookup helper when a prior record exists; NL at_time uses
 * lookupRecordedHistoricalAtClock (exact ring only, no PIT fallback).
 */
function findStoredHistoricalDecision(
  fixtureId: string,
  barIndex: number,
  asOfIso: string
): DecisionEnvelopeHistoryEntry | null {
  const hist = getDecisionEnvelopeHistory("HISTORICAL").filter(
    (e) => !e.fixtureId || e.fixtureId === fixtureId
  );
  const byBar = hist.filter(
    (e) => typeof e.barIndex === "number" && e.barIndex === barIndex
  );
  if (byBar.length) return byBar[0]!;
  const byAsOf = hist.filter((e) => e.asOf === asOfIso);
  if (byAsOf.length) return byAsOf[0]!;
  return null;
}

function recordedMiss(clockRaw: string, detail?: string): DecisionSnapshotMiss {
  return {
    ok: false,
    reason: "no_decision_available",
    detail: detail || `No decision was recorded at ${clockRaw}.`,
    requestedClock: clockRaw,
  };
}

/**
 * Recorded-only HISTORICAL lookup — exact EST clock match on the ring.
 * Never PIT-rebuilds. Missing → no decision was recorded.
 */
export function lookupRecordedHistoricalAtClock(
  clock: ParsedClockTime,
  opts: { fixtureId?: string; barIndex?: number } = {}
): DecisionSnapshot {
  const fixtureId = opts.fixtureId?.trim() || "synthetic-ny-am";
  const targetMins = clockMinutes(clock);
  const hist = getDecisionEnvelopeHistory("HISTORICAL").filter((e) => {
    if (e.fixtureId && e.fixtureId !== fixtureId) return false;
    if (
      typeof opts.barIndex === "number" &&
      Number.isFinite(opts.barIndex) &&
      typeof e.barIndex === "number" &&
      e.barIndex > opts.barIndex
    ) {
      return false;
    }
    return true;
  });

  let best: DecisionEnvelopeHistoryEntry | null = null;
  for (const e of hist) {
    if (getEstMinutes(new Date(e.asOf)) !== targetMins) continue;
    if (!best || Date.parse(e.asOf) >= Date.parse(best.asOf)) best = e;
  }
  if (!best) return recordedMiss(clock.raw);

  const snap = entryToSnapshot(best, clock.raw);
  snap.match = "exact";
  snap.fromStore = true;
  return snap;
}

/**
 * Latest recorded HISTORICAL decision strictly before the named clock.
 * Never manufactures an at-clock decision.
 */
export function lookupRecordedHistoricalStrictlyBefore(
  clock: ParsedClockTime,
  opts: { fixtureId?: string; barIndex?: number } = {}
): DecisionSnapshot {
  const fixtureId = opts.fixtureId?.trim() || "synthetic-ny-am";
  const fixture = loadReplayFixture(fixtureId);
  const hit = findFixtureBarAtOrBeforeClock(fixture, clock);
  let targetMs: number | null = null;
  if (hit?.match === "exact") {
    targetMs = hit.bar.time.getTime();
  } else {
    // No exact bar — still refuse inventing; use EST minute boundary via any same-day bar if present.
    for (const b of fixture.m1) {
      if (estMinutesFromBar(b) === clockMinutes(clock)) {
        targetMs = b.time.getTime();
        break;
      }
    }
  }
  if (targetMs == null) {
    // Fall back: EST minutes strictly before clock (same session ordering).
    const targetMins = clockMinutes(clock);
    const hist = getDecisionEnvelopeHistory("HISTORICAL").filter(
      (e) => !e.fixtureId || e.fixtureId === fixtureId
    );
    let best: DecisionEnvelopeHistoryEntry | null = null;
    for (const e of hist) {
      if (
        typeof opts.barIndex === "number" &&
        typeof e.barIndex === "number" &&
        e.barIndex > opts.barIndex
      ) {
        continue;
      }
      const mins = getEstMinutes(new Date(e.asOf));
      if (mins >= targetMins) continue;
      if (!best || Date.parse(e.asOf) > Date.parse(best.asOf)) best = e;
    }
    if (!best) {
      return recordedMiss(
        clock.raw,
        `No decision was recorded immediately before ${clock.raw}.`
      );
    }
    const snap = entryToSnapshot(best, `before ${clock.raw}`);
    snap.fromStore = true;
    return snap;
  }

  const entry = findDecisionStrictlyBefore("HISTORICAL", new Date(targetMs), {
    fixtureId,
  });
  if (!entry) {
    return recordedMiss(
      clock.raw,
      `No decision was recorded immediately before ${clock.raw}.`
    );
  }
  if (
    typeof opts.barIndex === "number" &&
    typeof entry.barIndex === "number" &&
    entry.barIndex > opts.barIndex
  ) {
    return recordedMiss(
      clock.raw,
      `No decision was recorded immediately before ${clock.raw}.`
    );
  }
  const snap = entryToSnapshot(entry, `before ${clock.raw}`);
  snap.fromStore = true;
  return snap;
}

export function lookupHistoricalDecisionAtClock(
  clock: ParsedClockTime,
  opts: { fixtureId?: string; barIndex?: number } = {},
  extra?: { record?: boolean; fixtureData?: ReplayMarketData }
): DecisionSnapshot {
  const fixtureId = opts.fixtureId?.trim() || "synthetic-ny-am";
  const fixture = extra?.fixtureData || loadReplayFixture(fixtureId);
  const hit = findFixtureBarAtOrBeforeClock(fixture, clock);
  if (!hit) {
    return {
      ok: false,
      reason: "no_decision_available",
      detail: `No decision was recorded at ${clock.raw}.`,
      requestedClock: clock.raw,
    };
  }

  // Never allow looking past the caller's session bar when provided.
  const sessionCap =
    typeof opts.barIndex === "number" && Number.isFinite(opts.barIndex)
      ? Math.max(0, Math.floor(opts.barIndex))
      : hit.barIndex;
  const barIndex = Math.min(hit.barIndex, sessionCap);
  const asOf = fixture.m1[barIndex]!.time;
  const asOfIso = asOf.toISOString();
  const matchFlag: DecisionSnapshotOk["match"] =
    hit.barIndex === barIndex ? hit.match : "nearest_previous";

  // Store-first: recorded HISTORICAL ring wins over PIT rebuild (no status repaint).
  const stored = findStoredHistoricalDecision(fixtureId, barIndex, asOfIso);
  if (stored) {
    const snap = entryToSnapshot(stored, clock.raw);
    snap.match = matchFlag;
    snap.fromStore = true;
    return snap;
  }

  const prevPipe = getLastPipelineResult();
  try {
    const { pipeline } = withDecisionHistorySuppressed(() => {
      const cutoff = new ReplayDataCutoff(fixture, asOf);
      cutoff.assertNoFutureLeak();
      for (const b of cutoff.slicedM1()) {
        if (b.time.getTime() > asOf.getTime()) {
          throw new Error(`Future leak into past explanation at ${b.time.toISOString()}`);
        }
      }
      const ctx = cutoff.buildContext();
      return buildKarenReplayResponse(ctx, fixture, asOf);
    });

    const price = fixture.m1[barIndex]!.close;
    const decisionKey = synthesizeDecisionKey({
      lane: "HISTORICAL",
      asOf: asOfIso,
      stance: pipeline.analysis_contract?.decision?.stance || "flat",
      verdict: String(pipeline.decision.verdict),
      fixtureId,
      barIndex,
    });
    const snap = snapshotFromPipeline(pipeline, {
      asOf,
      match: matchFlag,
      requestedClock: clock.raw,
      price,
      barIndex,
      fixtureId,
      decisionKey,
    });

    if (extra?.record !== false) {
      const entry = recordDecisionEnvelopeHistory({
        asOf,
        lane: "HISTORICAL",
        envelope: snap.envelope,
        verdict: snap.marketState.verdict || snap.envelope.stance,
        stateHash: snap.marketState.stateHash || undefined,
        marketState: snap.marketState,
        fixtureId,
        barIndex,
        asOfEst: snap.asOfEst,
        decisionKey: snap.decisionKey,
        entryStatus: snap.entryStatus,
        force: true,
      });
      if (entry) {
        snap.entry = entry;
        // Prefer persisted key/status from the ring entry.
        if (entry.decisionKey) snap.decisionKey = entry.decisionKey;
        if (entry.entryStatus) snap.entryStatus = entry.entryStatus;
      }
    }
    return snap;
  } finally {
    replaceLastPipelineResult(prevPipe);
  }
}

export function compareDecisionSnapshots(
  earlier: DecisionSnapshotOk,
  later: DecisionSnapshotOk,
  lane: DecisionHistoryLane
): DecisionCompareResult {
  if (Date.parse(earlier.asOf) > Date.parse(later.asOf)) {
    throw new Error("compareDecisionSnapshots: earlier asOf after later — refused");
  }

  const marketStateChanges: string[] = [];
  const interpretationChanges: string[] = [];
  const decisionChanges: string[] = [];

  const em = earlier.marketState;
  const lm = later.marketState;
  if (em.price !== lm.price) {
    marketStateChanges.push(`price: ${em.price ?? "—"} → ${lm.price ?? "—"}`);
  }
  if (em.htfBias !== lm.htfBias) {
    marketStateChanges.push(`htfBias: ${em.htfBias ?? "—"} → ${lm.htfBias ?? "—"}`);
  }
  if (em.structure !== lm.structure) {
    marketStateChanges.push(`structure: ${em.structure ?? "—"} → ${lm.structure ?? "—"}`);
  }
  if (em.displacement !== lm.displacement) {
    marketStateChanges.push(
      `displacement: ${em.displacement ?? "—"} → ${lm.displacement ?? "—"}`
    );
  }
  if (em.fvgStatus !== lm.fvgStatus) {
    marketStateChanges.push(`fvg: ${em.fvgStatus ?? "—"} → ${lm.fvgStatus ?? "—"}`);
  }

  if (earlier.envelope.layers.interpretation !== later.envelope.layers.interpretation) {
    interpretationChanges.push("interpretation layer text changed");
  }
  if (earlier.envelope.thesis.what !== later.envelope.thesis.what) {
    interpretationChanges.push(
      `thesis.what: ${earlier.envelope.thesis.what || "—"} → ${later.envelope.thesis.what || "—"}`
    );
  }
  if (earlier.envelope.thesis.whyNow !== later.envelope.thesis.whyNow) {
    interpretationChanges.push("thesis.whyNow changed");
  }

  if (earlier.envelope.stance !== later.envelope.stance) {
    decisionChanges.push(`stance: ${earlier.envelope.stance} → ${later.envelope.stance}`);
  }
  if (em.verdict !== lm.verdict) {
    decisionChanges.push(`verdict: ${em.verdict ?? "—"} → ${lm.verdict ?? "—"}`);
  }
  if (earlier.envelope.read.tradeDirection !== later.envelope.read.tradeDirection) {
    decisionChanges.push(
      `tradeDirection: ${earlier.envelope.read.tradeDirection} → ${later.envelope.read.tradeDirection}`
    );
  }
  if (earlier.envelope.conflictLog.disagree !== later.envelope.conflictLog.disagree) {
    decisionChanges.push(
      `conflict.disagree: ${earlier.envelope.conflictLog.disagree} → ${later.envelope.conflictLog.disagree}`
    );
  }
  if (earlier.envelope.invalidation.condition !== later.envelope.invalidation.condition) {
    decisionChanges.push("invalidation condition changed");
  }

  const decisionChanged = decisionChanges.length > 0;
  const formatted = [
    lane === "LIVE" ? LIVE_HISTORY_BANNER : HISTORICAL_HISTORY_BANNER,
    `COMPARE ${earlier.asOfEst || earlier.requestedClock} → ${later.asOfEst || later.requestedClock}`,
    `DECISION CHANGED: ${decisionChanged ? "YES" : "NO"}`,
    "",
    "1. WHAT CHANGED IN MARKET STATE",
    ...(marketStateChanges.length ? marketStateChanges.map((l) => `- ${l}`) : ["- nothing material"]),
    "",
    "2. WHAT CHANGED IN INTERPRETATION",
    ...(interpretationChanges.length
      ? interpretationChanges.map((l) => `- ${l}`)
      : ["- nothing material"]),
    "",
    "3. WHAT CHANGED IN DECISION",
    ...(decisionChanges.length ? decisionChanges.map((l) => `- ${l}`) : ["- nothing material"]),
    "",
    "THEN:",
    formatMentorTradeSpoken(earlier.envelope, { mode: resolveUserPresentationMode() }),
    `Invalidation: ${earlier.envelope.invalidation.condition}`,
    "",
    "NOW:",
    formatMentorTradeSpoken(later.envelope, { mode: resolveUserPresentationMode() }),
    `Invalidation: ${later.envelope.invalidation.condition}`,
  ].join("\n");

  return {
    decisionChanged,
    marketStateChanges,
    interpretationChanges,
    decisionChanges,
    formatted,
    earlier,
    later,
    lane,
  };
}

function formatAtTimeReply(snap: DecisionSnapshot, lane: DecisionHistoryLane): string {
  if (!snap.ok) {
    const missLine = snap.detail.startsWith("No decision was recorded")
      ? snap.detail
      : `No decision was recorded at ${snap.requestedClock}.`;
    return labelLane(lane, missLine);
  }
  const thesisWhat = snap.envelope.thesis?.what || "—";
  const thesisWhy = snap.envelope.thesis?.whyNow || "—";
  const spoken = formatMentorTradeSpoken(snap.envelope, {
    mode: resolveUserPresentationMode(),
  });

  if (resolveUserPresentationMode() === "plain") {
    const lead =
      snap.match === "exact"
        ? `At ${snap.asOfEst} ET my recorded stance was ${snap.status}.`
        : snap.match === "nearest_previous"
          ? `Nearest recorded decision to ${snap.requestedClock}: ${snap.status} at ${snap.asOfEst} ET.`
          : `Recorded stance at ${snap.asOfEst} ET: ${snap.status}.`;
    const body = [lead, thesisWhy !== "—" ? thesisWhy : thesisWhat !== "—" ? thesisWhat : null, spoken]
      .filter((l): l is string => l != null && String(l).trim().length > 0)
      .join("\n");
    return labelLane(lane, body);
  }

  const matchNote =
    snap.match === "exact"
      ? `exact timestamp ${snap.asOfEst}`
      : snap.match === "nearest_previous"
        ? `nearest previous decision ${snap.asOfEst} (requested ${snap.requestedClock})`
        : `history entry ${snap.asOfEst}`;
  // Recorded thesis only — never recalculate / rewrite reasoning at reply time.
  const header =
    lane === "HISTORICAL" ? "HISTORICAL / PREVIOUS DECISION" : "LIVE / PREVIOUS DECISION";
  const body = [
    header,
    `Timestamp: ${snap.asOf} · EST ${snap.asOfEst} (${matchNote})`,
    `Status: ${snap.status}`,
    `DecisionKey: ${snap.decisionKey}`,
    `Reason/thesis: ${thesisWhat}`,
    `Why: ${thesisWhy}`,
    snap.entryStatus ? `entryStatus: ${snap.entryStatus}` : null,
    `STANCE: ${snap.envelope.stance} · VERDICT: ${snap.marketState.verdict ?? snap.status} · CONFIDENCE: ${snap.envelope.confidence}`,
    spoken,
    `EVIDENCE: ${snap.evidence.slice(0, 500)}`,
    `THESIS: what=${thesisWhat} | whyNow=${thesisWhy} | complete=${snap.envelope.thesis.complete ? "yes" : "no"}`,
    `CONFLICTS: disagree=${snap.envelope.conflictLog.disagree} — ${snap.envelope.conflictLog.why}`,
    `INVALIDATION: ${snap.envelope.invalidation.condition}`,
    `MARKET STATE: price=${snap.marketState.price ?? "—"} bias=${snap.marketState.htfBias ?? "—"} structure=${snap.marketState.structure ?? "—"}`,
  ]
    .filter((l): l is string => l != null)
    .join("\n");
  return labelLane(lane, body);
}

function formatCurrentStanceReply(
  snap: DecisionSnapshotOk,
  lane: DecisionHistoryLane
): string {
  const thesisWhat = snap.envelope.thesis?.what || "—";
  const thesisWhy = snap.envelope.thesis?.whyNow || "—";
  const spoken = formatMentorTradeSpoken(snap.envelope, {
    mode: resolveUserPresentationMode(),
  });
  const lead =
    snap.status === "WAIT"
      ? `I'm WAITING — ${thesisWhy !== "—" ? thesisWhy : thesisWhat}`
      : snap.status === "NO_TRADE"
        ? `I'm flat / NO_TRADE — ${thesisWhy !== "—" ? thesisWhy : thesisWhat}`
        : `Current stance: ${snap.status}`;
  if (resolveUserPresentationMode() === "plain") {
    const body = [lead, spoken].filter((l) => String(l || "").trim().length > 0).join("\n");
    return labelLane(lane, body);
  }
  const body = [
    lead,
    `Timestamp: ${snap.asOf} · EST ${snap.asOfEst}`,
    `Status: ${snap.status}`,
    `DecisionKey: ${snap.decisionKey}`,
    `Reason/thesis: ${thesisWhat}`,
    `Why: ${thesisWhy}`,
    spoken,
  ].join("\n");
  return labelLane(lane, body);
}

function formatDirectionalDecisionReply(
  snap: DecisionSnapshotOk,
  lane: DecisionHistoryLane,
  opts?: { sessionNote?: string }
): string {
  const thesisWhat = snap.envelope.thesis?.what || "—";
  const thesisWhy = snap.envelope.thesis?.whyNow || "—";
  const spoken = formatMentorTradeSpoken(snap.envelope, {
    mode: resolveUserPresentationMode(),
  });
  if (resolveUserPresentationMode() === "plain") {
    const body = [
      opts?.sessionNote || null,
      renderHistoryActionableLead(snap.status, snap.asOfEst),
      thesisWhat !== "—" ? thesisWhat : null,
      thesisWhy !== "—" ? thesisWhy : null,
      spoken,
    ]
      .filter((l): l is string => l != null && String(l).trim().length > 0)
      .join("\n");
    return labelLane(lane, body);
  }
  const body = [
    opts?.sessionNote || null,
    renderHistoryActionableLead(snap.status, snap.asOfEst),
    `Timestamp: ${snap.asOf} · EST ${snap.asOfEst}`,
    `Status: ${snap.status}`,
    `DecisionKey: ${snap.decisionKey}`,
    `Reason/thesis: ${thesisWhat}`,
    `Why: ${thesisWhy}`,
    spoken,
  ]
    .filter((l): l is string => l != null && String(l).trim().length > 0)
    .join("\n");
  return labelLane(lane, body);
}

/**
 * Ambiguous "last decision" preferred UX:
 * If latest recorded is WAIT/NO_TRADE but an earlier actionable exists,
 * surface both — never imply WAIT was the last trade.
 */
function formatAmbiguousLastDecisionReply(
  lane: DecisionHistoryLane,
  recorded: DecisionEnvelopeHistoryEntry | null,
  actionable: DecisionEnvelopeHistoryEntry | null,
  opts?: { sessionNote?: string }
): { reply: string; responseSource: string; snapshot?: DecisionSnapshot } {
  if (!recorded && !actionable) {
    const miss = recordedMiss(
      "last",
      "No decision has been recorded in available history."
    );
    return {
      reply: labelLane(lane, "No decision has been recorded in available history."),
      responseSource:
        lane === "LIVE" ? "live_decision_missing" : "historical_decision_missing",
      snapshot: miss,
    };
  }

  if (recorded && isDirectionalRecordedStatus(recorded.verdict, recorded.stance)) {
    const snap = entryToSnapshot(recorded, "last_decision");
    return {
      reply: formatDirectionalDecisionReply(snap, lane, { sessionNote: opts?.sessionNote }),
      responseSource:
        lane === "LIVE"
          ? "live_decision_last_decision"
          : "historical_decision_last_decision",
      snapshot: snap,
    };
  }

  if (recorded && actionable) {
    const recSnap = entryToSnapshot(recorded, "last_recorded");
    const actSnap = entryToSnapshot(actionable, "last_actionable");
    const thesisWhat = actSnap.envelope.thesis?.what || "—";
    const plain = resolveUserPresentationMode() === "plain";
    const lines = [
      opts?.sessionNote || null,
      renderHistoryCompositeLead(recSnap.status, actSnap.status, actSnap.asOfEst),
      plain
        ? `Recorded: ${recSnap.status} · ${recSnap.asOfEst} ET`
        : `Recorded: ${recSnap.status} · ${recSnap.asOfEst} ET · key ${recSnap.decisionKey}`,
      plain
        ? `Actionable: ${actSnap.status} · ${actSnap.asOfEst} ET`
        : `Actionable: ${actSnap.status} · ${actSnap.asOfEst} ET · key ${actSnap.decisionKey}`,
      thesisWhat !== "—" ? `Actionable thesis: ${thesisWhat}` : null,
    ].filter((l): l is string => l != null && String(l).trim().length > 0);
    return {
      reply: labelLane(lane, lines.join("\n")),
      responseSource:
        lane === "LIVE"
          ? "live_decision_last_decision"
          : "historical_decision_last_decision",
      snapshot: actSnap,
    };
  }

  if (recorded && !actionable) {
    const recSnap = entryToSnapshot(recorded, "last_recorded");
    const plain = resolveUserPresentationMode() === "plain";
    const lines = [
      renderHistoryRecordedOnlyLead(recSnap.status),
      `Timestamp: ${recSnap.asOf} · EST ${recSnap.asOfEst}`,
      plain ? null : `DecisionKey: ${recSnap.decisionKey}`,
    ].filter((l): l is string => l != null && String(l).trim().length > 0);
    return {
      reply: labelLane(lane, lines.join("\n")),
      responseSource:
        lane === "LIVE"
          ? "live_decision_last_decision_no_actionable"
          : "historical_decision_last_decision_no_actionable",
      snapshot: recSnap,
    };
  }

  // actionable without recorded should not happen (actionable ⊆ history)
  const actSnap = entryToSnapshot(actionable!, "last_actionable");
  return {
    reply: formatDirectionalDecisionReply(actSnap, lane),
    responseSource:
      lane === "LIVE"
        ? "live_decision_last_decision"
        : "historical_decision_last_decision",
    snapshot: actSnap,
  };
}

function answerAmbiguousLastDecision(
  lane: DecisionHistoryLane,
  opts?: { fixtureId?: string }
): { reply: string; responseSource: string; snapshot?: DecisionSnapshot } {
  const recorded = latestDecisionEnvelope(lane, opts);
  const actionable = findLatestDirectionalDecision(lane, { fixtureId: opts?.fixtureId });
  return formatAmbiguousLastDecisionReply(lane, recorded, actionable);
}

function answerLastDirectional(
  lane: DecisionHistoryLane,
  opts?: { fixtureId?: string; side?: "LONG" | "SHORT" }
): { reply: string; responseSource: string; snapshot?: DecisionSnapshot } {
  const latest = latestDecisionEnvelope(lane, opts);
  if (!latest) {
    const miss = recordedMiss(
      "last",
      "No LONG or SHORT decision has been recorded in available history."
    );
    return {
      reply: labelLane(
        lane,
        "No LONG or SHORT decision has been recorded in available history."
      ),
      responseSource:
        lane === "LIVE" ? "live_decision_directional_missing" : "historical_decision_directional_missing",
      snapshot: miss,
    };
  }

  const currentSessionKey = cmeSessionDateKeyFromDate(new Date(latest.asOf));
  const inSession = findLatestDirectionalDecision(lane, {
    fixtureId: opts?.fixtureId,
    sessionKey: currentSessionKey,
    sessionKeyFromAsOf: (d) => cmeSessionDateKeyFromDate(d),
    side: opts?.side,
  });

  if (inSession) {
    const snap = entryToSnapshot(inSession, opts?.side ? `last_${opts.side.toLowerCase()}` : "last_directional");
    return {
      reply: formatDirectionalDecisionReply(snap, lane),
      responseSource:
        lane === "LIVE"
          ? "live_decision_last_directional"
          : "historical_decision_last_directional",
      snapshot: snap,
    };
  }

  const prior = findLatestDirectionalDecision(lane, {
    fixtureId: opts?.fixtureId,
    side: opts?.side,
  });
  if (prior) {
    const snap = entryToSnapshot(prior, opts?.side ? `last_${opts.side.toLowerCase()}` : "last_directional");
    const priorKey = cmeSessionDateKeyFromDate(new Date(prior.asOf));
    const sideLabel = opts?.side || "LONG or SHORT";
    const note = `No ${sideLabel} decision has been recorded this session. The previous session's last directional decision was ${snap.status} at ${snap.asOfEst} ET (session ${priorKey}).`;
    return {
      reply: formatDirectionalDecisionReply(snap, lane, { sessionNote: note }),
      responseSource:
        lane === "LIVE"
          ? "live_decision_last_directional_prior_session"
          : "historical_decision_last_directional_prior_session",
      snapshot: snap,
    };
  }

  const sideMiss = opts?.side
    ? `No ${opts.side} decision has been recorded in available history.`
    : "No LONG or SHORT decision has been recorded this session.";
  const miss = recordedMiss("last", sideMiss);
  return {
    reply: labelLane(lane, sideMiss),
    responseSource:
      lane === "LIVE" ? "live_decision_directional_missing" : "historical_decision_directional_missing",
    snapshot: miss,
  };
}

function answerTradeToday(
  lane: DecisionHistoryLane,
  opts?: { fixtureId?: string; side?: "LONG" | "SHORT" }
): { reply: string; responseSource: string; snapshot?: DecisionSnapshot } {
  const latest = latestDecisionEnvelope(lane, opts);
  if (!latest) {
    const sideMiss = opts?.side
      ? `No decision has been recorded, so I have not gone ${opts.side} today.`
      : "No decision has been recorded, so I have not taken a trade today.";
    return {
      reply: labelLane(lane, sideMiss),
      responseSource:
        lane === "LIVE" ? "live_decision_trade_today_missing" : "historical_decision_trade_today_missing",
    };
  }
  const sessionKey = cmeSessionDateKeyFromDate(new Date(latest.asOf));
  const inSession = findLatestDirectionalDecision(lane, {
    fixtureId: opts?.fixtureId,
    sessionKey,
    sessionKeyFromAsOf: (d) => cmeSessionDateKeyFromDate(d),
    side: opts?.side,
  });
  if (inSession) {
    const snap = entryToSnapshot(inSession, "trade_today");
    const body = opts?.side
      ? `Yes — I recorded ${snap.status} this session at ${snap.asOfEst} ET.`
      : `Yes — my last actionable decision this session was ${snap.status} at ${snap.asOfEst} ET.`;
    return {
      reply: labelLane(lane, body),
      responseSource:
        lane === "LIVE" ? "live_decision_trade_today" : "historical_decision_trade_today",
      snapshot: snap,
    };
  }
  const noneBody = opts?.side
    ? `No — I have not recorded a ${opts.side} decision this session.`
    : "No — I have not recorded a LONG or SHORT decision this session.";
  return {
    reply: labelLane(lane, noneBody),
    responseSource:
      lane === "LIVE" ? "live_decision_trade_today_none" : "historical_decision_trade_today_none",
  };
}

function answerPreviousSetup(
  lane: DecisionHistoryLane,
  opts?: { fixtureId?: string }
): { reply: string; responseSource: string; snapshot?: DecisionSnapshot } {
  const actionable = findLatestDirectionalDecision(lane, { fixtureId: opts?.fixtureId });
  if (!actionable) {
    return {
      reply: labelLane(
        lane,
        "No previous LONG or SHORT setup has been recorded in available history."
      ),
      responseSource:
        lane === "LIVE"
          ? "live_decision_previous_setup_missing"
          : "historical_decision_previous_setup_missing",
    };
  }
  const snap = entryToSnapshot(actionable, "previous_setup");
  const thesisWhat = snap.envelope.thesis?.what || "—";
  const thesisWhy = snap.envelope.thesis?.whyNow || "—";
  const spoken = formatMentorTradeSpoken(snap.envelope, {
    mode: resolveUserPresentationMode(),
  });
  const plain = resolveUserPresentationMode() === "plain";
  const body = [
    renderPreviousSetupLead(snap.status, snap.asOfEst),
    plain ? null : `DecisionKey: ${snap.decisionKey}`,
    thesisWhat !== "—" ? `Thesis: ${thesisWhat}` : null,
    thesisWhy !== "—" ? `Why: ${thesisWhy}` : null,
    spoken,
  ]
    .filter((l): l is string => l != null && String(l).trim().length > 0)
    .join("\n");
  return {
    reply: labelLane(lane, body),
    responseSource:
      lane === "LIVE" ? "live_decision_previous_setup" : "historical_decision_previous_setup",
    snapshot: snap,
  };
}

/**
 * What happened to the last actionable idea — only from recorded history.
 * Never invent completion/invalidation.
 */
function answerSetupOutcome(
  lane: DecisionHistoryLane,
  opts?: { fixtureId?: string }
): { reply: string; responseSource: string; snapshot?: DecisionSnapshot } {
  const actionable = findLatestDirectionalDecision(lane, { fixtureId: opts?.fixtureId });
  if (!actionable) {
    return {
      reply: labelLane(
        lane,
        "No previous LONG or SHORT setup is on record, so I can't say what happened to it."
      ),
      responseSource:
        lane === "LIVE"
          ? "live_decision_setup_outcome_missing"
          : "historical_decision_setup_outcome_missing",
    };
  }
  const actSnap = entryToSnapshot(actionable, "previous_setup");
  const later = latestDecisionEnvelope(lane, opts);
  const inv = String(actSnap.envelope.invalidation?.condition || "").trim();

  if (!later || later.id === actionable.id || later.asOf === actionable.asOf) {
    const bits = [
      renderSetupOutcomeStillLatest(actSnap.status, actSnap.asOfEst),
      inv ? `Recorded invalidation condition: ${inv}` : null,
      "I don't have a later recorded envelope showing it completed or invalidated.",
    ].filter(Boolean);
    return {
      reply: labelLane(lane, bits.join("\n")),
      responseSource:
        lane === "LIVE" ? "live_decision_setup_outcome" : "historical_decision_setup_outcome",
      snapshot: actSnap,
    };
  }

  const laterSnap = entryToSnapshot(later, "after_setup");
  const laterStatus = laterSnap.status;
  const bits = [
    renderSetupOutcomeSuperseded(
      actSnap.status,
      actSnap.asOfEst,
      laterStatus,
      laterSnap.asOfEst
    ),
    inv ? `Original invalidation condition: ${inv}` : null,
    laterSnap.envelope.thesis?.whyNow
      ? `Later thesis: ${laterSnap.envelope.thesis.whyNow}`
      : null,
  ].filter((l): l is string => l != null && String(l).trim().length > 0);

  return {
    reply: labelLane(lane, bits.join("\n")),
    responseSource:
      lane === "LIVE" ? "live_decision_setup_outcome" : "historical_decision_setup_outcome",
    snapshot: laterSnap,
  };
}

export function answerHistoricalDecisionTimeTravel(
  question: string,
  req: { fixtureId?: string; barIndex?: number } = {}
): { reply: string; responseSource: string; compare?: DecisionCompareResult; snapshot?: DecisionSnapshot } | null {
  const parsed = parseDecisionHistoryQuery(question);
  if (parsed.kind === "none") return null;

  const fixtureId = req.fixtureId?.trim() || "synthetic-ny-am";
  const barIndex = req.barIndex;

  if (parsed.kind === "last_recorded") {
    const entry = latestDecisionEnvelope("HISTORICAL", { fixtureId });
    if (!entry) {
      const miss = recordedMiss("last", "No decision was recorded.");
      return {
        reply: formatAtTimeReply(miss, "HISTORICAL"),
        responseSource: "historical_decision_missing",
        snapshot: miss,
      };
    }
    const snap = entryToSnapshot(entry, "last");
    return {
      reply: formatAtTimeReply(snap, "HISTORICAL"),
      responseSource: "historical_decision_last_recorded",
      snapshot: snap,
    };
  }

  if (parsed.kind === "current_stance") {
    const entry = latestDecisionEnvelope("HISTORICAL", { fixtureId });
    if (!entry) {
      const miss = recordedMiss("current", "No decision was recorded.");
      return {
        reply: formatAtTimeReply(miss, "HISTORICAL"),
        responseSource: "historical_decision_missing",
        snapshot: miss,
      };
    }
    const snap = entryToSnapshot(entry, "current");
    return {
      reply: formatCurrentStanceReply(snap, "HISTORICAL"),
      responseSource: "historical_decision_current_stance",
      snapshot: snap,
    };
  }

  if (parsed.kind === "last_directional") {
    const answered = answerLastDirectional("HISTORICAL", { fixtureId });
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
      snapshot: answered.snapshot,
    };
  }

  if (parsed.kind === "last_decision") {
    const answered = answerAmbiguousLastDecision("HISTORICAL", { fixtureId });
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
      snapshot: answered.snapshot,
    };
  }

  if (parsed.kind === "last_side" && parsed.side) {
    const answered = answerLastDirectional("HISTORICAL", { fixtureId, side: parsed.side });
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
      snapshot: answered.snapshot,
    };
  }

  if (parsed.kind === "trade_today") {
    const answered = answerTradeToday("HISTORICAL", { fixtureId, side: parsed.side });
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
      snapshot: answered.snapshot,
    };
  }

  if (parsed.kind === "previous_setup") {
    const answered = answerPreviousSetup("HISTORICAL", { fixtureId });
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
      snapshot: answered.snapshot,
    };
  }

  if (parsed.kind === "setup_outcome") {
    const answered = answerSetupOutcome("HISTORICAL", { fixtureId });
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
      snapshot: answered.snapshot,
    };
  }

  if (parsed.kind === "immediately_before" && parsed.time) {
    const snap = lookupRecordedHistoricalStrictlyBefore(parsed.time, {
      fixtureId,
      barIndex,
    });
    return {
      reply: formatAtTimeReply(snap, "HISTORICAL"),
      responseSource: snap.ok
        ? "historical_decision_immediately_before"
        : "historical_decision_missing",
      snapshot: snap,
    };
  }

  // "What was your decision at HH:MM?" → recorded ring ONLY (never PIT-manufacture).
  if (parsed.kind === "at_time" && parsed.time) {
    const snap = lookupRecordedHistoricalAtClock(parsed.time, { fixtureId, barIndex });
    return {
      reply: formatAtTimeReply(snap, "HISTORICAL"),
      responseSource: snap.ok
        ? "historical_decision_at_time"
        : "historical_decision_missing",
      snapshot: snap,
    };
  }

  if ((parsed.kind === "since" || parsed.kind === "why_changed") && parsed.time) {
    const earlier = lookupRecordedHistoricalAtClock(parsed.time, { fixtureId, barIndex });
    if (!earlier.ok) {
      return {
        reply: formatAtTimeReply(earlier, "HISTORICAL"),
        responseSource: "historical_decision_missing",
        snapshot: earlier,
      };
    }
    const laterEntry = latestDecisionEnvelope("HISTORICAL", { fixtureId });
    if (!laterEntry) {
      const miss = recordedMiss("now", "No decision was recorded.");
      return {
        reply: formatAtTimeReply(miss, "HISTORICAL"),
        responseSource: "historical_decision_missing",
        snapshot: miss,
      };
    }
    const later = entryToSnapshot(laterEntry, "now");
    const cmp = compareDecisionSnapshots(earlier, later, "HISTORICAL");
    const whyPrefix =
      parsed.kind === "why_changed"
        ? "WHY THE DECISION CHANGED (RECORDED):\n"
        : "WHAT CHANGED SINCE (RECORDED):\n";
    return {
      reply: labelLane("HISTORICAL", whyPrefix + cmp.formatted),
      responseSource:
        parsed.kind === "why_changed"
          ? "historical_decision_why_changed"
          : "historical_decision_since",
      compare: cmp,
    };
  }

  if (parsed.kind === "between" && parsed.from && parsed.to) {
    const earlier = lookupRecordedHistoricalAtClock(parsed.from, { fixtureId, barIndex });
    const later = lookupRecordedHistoricalAtClock(parsed.to, { fixtureId, barIndex });
    if (!earlier.ok) {
      return {
        reply: formatAtTimeReply(earlier, "HISTORICAL"),
        responseSource: "historical_decision_missing",
        snapshot: earlier,
      };
    }
    if (!later.ok) {
      return {
        reply: formatAtTimeReply(later, "HISTORICAL"),
        responseSource: "historical_decision_missing",
        snapshot: later,
      };
    }
    const cmp = compareDecisionSnapshots(earlier, later, "HISTORICAL");
    return {
      reply: labelLane(
        "HISTORICAL",
        `WHAT WAS DIFFERENT BETWEEN ${parsed.from.raw} AND ${parsed.to.raw}:\n${cmp.formatted}`
      ),
      responseSource: "historical_decision_between",
      compare: cmp,
    };
  }

  if (parsed.kind === "why_changed" && !parsed.time) {
    const hist = getDecisionEnvelopeHistory("HISTORICAL").filter(
      (e) => !e.fixtureId || e.fixtureId === fixtureId
    );
    if (hist.length < 2) {
      return {
        reply: labelLane(
          "HISTORICAL",
          "Not enough HISTORICAL DecisionEnvelope history to explain a change yet."
        ),
        responseSource: "historical_decision_why_changed_insufficient",
      };
    }
    const earlierEntry = hist[hist.length - 2]!;
    const laterEntry = hist[hist.length - 1]!;
    const earlier = entryToSnapshot(earlierEntry, earlierEntry.asOfEst || "prior");
    const later = entryToSnapshot(laterEntry, laterEntry.asOfEst || "now");
    const cmp = compareDecisionSnapshots(earlier, later, "HISTORICAL");
    return {
      reply: labelLane("HISTORICAL", `WHY THE DECISION CHANGED:\n${cmp.formatted}`),
      responseSource: "historical_decision_why_changed",
      compare: cmp,
    };
  }

  if (parsed.kind === "minutes_ago" || parsed.kind === "what_changed") {
    const fixture = loadReplayFixture(fixtureId);
    const nowIdx =
      typeof barIndex === "number" && Number.isFinite(barIndex)
        ? Math.min(Math.max(0, Math.floor(barIndex)), fixture.m1.length - 1)
        : fixture.m1.length - 1;
    const nowAsOf = fixture.m1[nowIdx]!.time;
    const lookback = parsed.lookbackMinutes ?? (parsed.kind === "minutes_ago" ? 10 : 5);
    const targetMs = nowAsOf.getTime() - lookback * 60_000;
    const earlierEntry = findDecisionAtOrBefore("HISTORICAL", new Date(targetMs), {
      fixtureId,
    });
    if (parsed.kind === "minutes_ago") {
      if (!earlierEntry) {
        return {
          reply: labelLane(
            "HISTORICAL",
            `No decision was recorded around ${lookback} minute(s) before session as-of ${formatEst(nowAsOf)}.`
          ),
          responseSource: "historical_decision_missing",
        };
      }
      const earlier = entryToSnapshot(earlierEntry, `${lookback}m ago`);
      return {
        reply: formatAtTimeReply(earlier, "HISTORICAL"),
        responseSource: "historical_decision_minutes_ago",
        snapshot: earlier,
      };
    }
    const laterEntry =
      latestDecisionEnvelope("HISTORICAL", { fixtureId }) ||
      findDecisionAtOrBefore("HISTORICAL", nowAsOf, { fixtureId });
    if (!earlierEntry) {
      const miss = recordedMiss(
        `${lookback}m ago`,
        `No decision was recorded around ${lookback} minute(s) before session as-of ${formatEst(nowAsOf)}.`
      );
      return {
        reply: formatAtTimeReply(miss, "HISTORICAL"),
        responseSource: "historical_decision_missing",
        snapshot: miss,
      };
    }
    if (!laterEntry) {
      const miss = recordedMiss("now", "No decision was recorded.");
      return {
        reply: formatAtTimeReply(miss, "HISTORICAL"),
        responseSource: "historical_decision_missing",
        snapshot: miss,
      };
    }
    const cmp = compareDecisionSnapshots(
      entryToSnapshot(earlierEntry, "then"),
      entryToSnapshot(laterEntry, "now"),
      "HISTORICAL"
    );
    return {
      reply: labelLane(
        "HISTORICAL",
        `WHAT CHANGED (last ${lookback} minute(s), RECORDED):\n${cmp.formatted}`
      ),
      responseSource: "historical_decision_what_changed",
      compare: cmp,
    };
  }

  return null;
}

function entryToSnapshot(
  entry: DecisionEnvelopeHistoryEntry,
  requestedClock: string
): DecisionSnapshotOk {
  const verdict = entry.marketState?.verdict ?? entry.verdict;
  const decisionKey =
    (entry.decisionKey && String(entry.decisionKey).trim()) ||
    synthesizeDecisionKey({
      lane: entry.lane,
      asOf: entry.asOf,
      stance: entry.stance,
      verdict,
      fixtureId: entry.fixtureId,
      barIndex: entry.barIndex,
    });
  return {
    ok: true,
    match: "history",
    asOf: entry.asOf,
    asOfEst: entry.asOfEst || formatEst(new Date(entry.asOf)),
    requestedClock,
    decisionKey,
    status: normalizeRecordedStatus(verdict, entry.stance),
    entryStatus: entry.entryStatus,
    envelope: entry.envelope,
    evidence: String(entry.envelope.layers.facts || "").slice(0, 500),
    marketState: {
      price: entry.marketState?.price ?? null,
      stateHash: entry.marketState?.stateHash ?? entry.stateHash,
      htfBias: entry.marketState?.htfBias ?? null,
      structure: entry.marketState?.structure ?? null,
      displacement: entry.marketState?.displacement ?? null,
      fvgStatus: entry.marketState?.fvgStatus ?? null,
      verdict: verdict ?? null,
    },
    entry,
    barIndex: entry.barIndex,
    fixtureId: entry.fixtureId,
    fromStore: true,
  };
}

/**
 * LIVE named-clock lookup — session-bound.
 * Session identity: CME Globex day from latest LIVE asOf (cmeSessionDateKeyFromDate).
 * Never returns a prior-session row for a matching HH:MM.
 */
function lookupLiveAtClock(clock: ParsedClockTime): DecisionSnapshot {
  const live = getDecisionEnvelopeHistory("LIVE");
  if (!live.length) {
    return {
      ok: false,
      reason: "no_decision_available",
      detail: "No recorded decision at that time. Ask for a read first.",
      requestedClock: clock.raw,
    };
  }

  const latest = live[live.length - 1]!;
  const sessionKey = cmeSessionDateKeyFromDate(new Date(latest.asOf));
  const targetMins = clockMinutes(clock);

  // Bind HH:MM onto this CME session's wall clock.
  // Overnight clocks (>= 18:00 ET) live on the calendar day before the session key.
  let dateKey = sessionKey;
  if (targetMins >= 18 * 60) {
    const d = new Date(`${sessionKey}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    dateKey = getEstDateKey(d);
  }
  const target = new Date(
    estTimeOnDateKey(dateKey, clock.hour, clock.minute) * 1000
  );

  const candidates = live.filter(
    (e) => cmeSessionDateKeyFromDate(new Date(e.asOf)) === sessionKey
  );

  // Exact HH:MM within the same session only (latest wins if duplicates).
  let best: DecisionEnvelopeHistoryEntry | null = null;
  for (const e of candidates) {
    if (getEstMinutes(new Date(e.asOf)) !== targetMins) continue;
    if (!best || Date.parse(e.asOf) >= Date.parse(best.asOf)) best = e;
  }
  if (best) {
    const snap = entryToSnapshot(best, clock.raw);
    snap.match = "exact";
    return snap;
  }

  // Nearest-previous ONLY within the same session (absolute asOf <= target,
  // plus existing minute-of-day gate so overnight does not answer a morning clock).
  best = null;
  const targetMs = target.getTime();
  for (const e of candidates) {
    const t = Date.parse(e.asOf);
    if (!Number.isFinite(t) || t > targetMs) continue;
    if (getEstMinutes(new Date(e.asOf)) > targetMins) continue;
    if (!best || t > Date.parse(best.asOf)) best = e;
  }
  if (!best) {
    return {
      ok: false,
      reason: "no_decision_available",
      detail: "No recorded decision at that time.",
      requestedClock: clock.raw,
    };
  }
  const snap = entryToSnapshot(best, clock.raw);
  snap.match = "nearest_previous";
  return snap;
}

export function answerLiveDecisionHistoryQuery(
  question: string
): { reply: string; responseSource: string; compare?: DecisionCompareResult } | null {
  const parsed = parseDecisionHistoryQuery(question);
  if (parsed.kind === "none") return null;

  // Latest recorded LIVE envelope only — no PIT reconstruction, no LLM.
  if (parsed.kind === "last_recorded") {
    const entry = latestDecisionEnvelope("LIVE");
    if (!entry) {
      const miss = recordedMiss("last", "No decision was recorded.");
      return {
        reply: formatAtTimeReply(miss, "LIVE"),
        responseSource: "live_decision_missing",
      };
    }
    const snap = entryToSnapshot(entry, "last");
    return {
      reply: formatAtTimeReply(snap, "LIVE"),
      responseSource: "live_decision_last_recorded",
    };
  }

  if (parsed.kind === "current_stance") {
    const entry = latestDecisionEnvelope("LIVE");
    if (!entry) {
      return {
        reply: labelLane("LIVE", "No decision was recorded."),
        responseSource: "live_decision_missing",
      };
    }
    const snap = entryToSnapshot(entry, "current");
    return {
      reply: formatCurrentStanceReply(snap, "LIVE"),
      responseSource: "live_decision_current_stance",
    };
  }

  if (parsed.kind === "last_directional") {
    const answered = answerLastDirectional("LIVE");
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
    };
  }

  if (parsed.kind === "last_decision") {
    const answered = answerAmbiguousLastDecision("LIVE");
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
    };
  }

  if (parsed.kind === "last_side" && parsed.side) {
    const answered = answerLastDirectional("LIVE", { side: parsed.side });
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
    };
  }

  if (parsed.kind === "trade_today") {
    const answered = answerTradeToday("LIVE", { side: parsed.side });
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
    };
  }

  if (parsed.kind === "previous_setup") {
    const answered = answerPreviousSetup("LIVE");
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
    };
  }

  if (parsed.kind === "setup_outcome") {
    const answered = answerSetupOutcome("LIVE");
    return {
      reply: answered.reply,
      responseSource: answered.responseSource,
    };
  }

  if (parsed.kind === "at_time" && parsed.time) {
    const snap = lookupLiveAtClock(parsed.time);
    return {
      reply: formatAtTimeReply(snap, "LIVE"),
      responseSource: snap.ok ? "live_decision_at_time" : "live_decision_missing",
    };
  }

  if ((parsed.kind === "since" || parsed.kind === "why_changed") && parsed.time) {
    const earlier = lookupLiveAtClock(parsed.time);
    const currentEntry = latestDecisionEnvelope("LIVE");
    if (!earlier.ok) {
      return {
        reply: formatAtTimeReply(earlier, "LIVE"),
        responseSource: "live_decision_missing",
      };
    }
    if (!currentEntry) {
      return {
        reply: labelLane("LIVE", "No current LIVE DecisionEnvelope to compare."),
        responseSource: "live_decision_missing",
      };
    }
    const later = entryToSnapshot(currentEntry, "now");
    const cmp = compareDecisionSnapshots(earlier, later, "LIVE");
    return {
      reply: labelLane(
        "LIVE",
        `${parsed.kind === "why_changed" ? "WHY THE DECISION CHANGED" : "WHAT CHANGED SINCE"}:\n${cmp.formatted}`
      ),
      responseSource:
        parsed.kind === "why_changed" ? "live_decision_why_changed" : "live_decision_since",
      compare: cmp,
    };
  }

  if (parsed.kind === "between" && parsed.from && parsed.to) {
    const earlier = lookupLiveAtClock(parsed.from);
    const later = lookupLiveAtClock(parsed.to);
    if (!earlier.ok) {
      return { reply: formatAtTimeReply(earlier, "LIVE"), responseSource: "live_decision_missing" };
    }
    if (!later.ok) {
      return { reply: formatAtTimeReply(later, "LIVE"), responseSource: "live_decision_missing" };
    }
    const cmp = compareDecisionSnapshots(earlier, later, "LIVE");
    return {
      reply: labelLane(
        "LIVE",
        `WHAT WAS DIFFERENT BETWEEN ${parsed.from.raw} AND ${parsed.to.raw}:\n${cmp.formatted}`
      ),
      responseSource: "live_decision_between",
      compare: cmp,
    };
  }

  if (parsed.kind === "why_changed" && !parsed.time) {
    const live = getDecisionEnvelopeHistory("LIVE");
    if (live.length < 2) {
      const pipe = getLastPipelineResult();
      const env = pipe?.analysis_contract?.decision;
      if (env && live.length === 1) {
        return {
          reply: labelLane(
            "LIVE",
            `Only one LIVE DecisionEnvelope on record (${live[0]!.asOf}). Nothing earlier to compare.`
          ),
          responseSource: "live_decision_single",
        };
      }
      return {
        reply: labelLane(
          "LIVE",
          "Not enough LIVE DecisionEnvelope history. Ask for a few reads first, then ask what changed."
        ),
        responseSource: "live_decision_insufficient",
      };
    }
    const earlier = entryToSnapshot(live[live.length - 2]!, "prior");
    const later = entryToSnapshot(live[live.length - 1]!, "now");
    const cmp = compareDecisionSnapshots(earlier, later, "LIVE");
    return {
      reply: labelLane("LIVE", `WHY THE DECISION CHANGED:\n${cmp.formatted}`),
      responseSource: "live_decision_why_changed",
      compare: cmp,
    };
  }

  if (parsed.kind === "minutes_ago" || parsed.kind === "what_changed") {
    const lookback = parsed.lookbackMinutes ?? (parsed.kind === "minutes_ago" ? 10 : 5);
    const now = Date.now();
    const target = new Date(now - lookback * 60_000);
    const earlierEntry = findDecisionAtOrBefore("LIVE", target, {
      maxSkewMs: Math.max(lookback * 60_000, 15 * 60_000),
    });
    if (parsed.kind === "minutes_ago") {
      if (!earlierEntry) {
        return {
          reply: labelLane(
            "LIVE",
            `NO DECISION AVAILABLE around ${lookback} minute(s) ago. Ask for a read first so LIVE history can accumulate.`
          ),
          responseSource: "live_decision_missing",
        };
      }
      return {
        reply: formatAtTimeReply(entryToSnapshot(earlierEntry, `${lookback}m ago`), "LIVE"),
        responseSource: "live_decision_minutes_ago",
      };
    }
    const currentEntry = latestDecisionEnvelope("LIVE");
    if (!currentEntry) {
      return {
        reply: labelLane(
          "LIVE",
          "No LIVE DecisionEnvelope yet — ask for a market read first, then ask what changed."
        ),
        responseSource: "live_decision_insufficient",
      };
    }
    const prior =
      earlierEntry ||
      findDecisionAtOrBefore("LIVE", new Date(Date.parse(currentEntry.asOf) - 1));
    if (!prior) {
      return {
        reply: labelLane(
          "LIVE",
          `Only one LIVE DecisionEnvelope on record (${currentEntry.asOf}). Nothing earlier to compare.`
        ),
        responseSource: "live_decision_single",
      };
    }
    const cmp = compareDecisionSnapshots(
      entryToSnapshot(prior, "then"),
      entryToSnapshot(currentEntry, "now"),
      "LIVE"
    );
    return {
      reply: labelLane(
        "LIVE",
        `WHAT CHANGED (last ${lookback} minute(s), LIVE):\n${cmp.formatted}`
      ),
      responseSource: "live_decision_what_changed",
      compare: cmp,
    };
  }

  return null;
}

/** Relative lookback helpers for "10 minutes ago" phrasing. */
export {
  findDecisionAtOrBefore,
  latestDecisionEnvelope,
};
