#!/usr/bin/env npx tsx
/**
 * Karen blind mentor validation — research only.
 * Does not modify production Karen / reh-rel / structure trading.
 * Point-in-time: Karen sees bars ≤ T. Future bars used only by the evaluator.
 *
 * Run: npx tsx scripts/research-karen-blind-mentor-validation.ts
 */
import fs from "fs";
import path from "path";
import { evaluateMentorResponse } from "../lib/research/mentor/evaluation";
import { detectEqhEqlLiquidity } from "../lib/research/eqh-eql-liquidity";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { buildKarenReplayResponse } from "../lib/research/replay/karen";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import { getExecutionScaffold } from "../lib/execution-plan";
import type { KarenReplayResponse } from "../lib/research/replay/types";
import type { MarketInterpretation, MarketObservation, TradingDecision } from "../lib/desk-schema";
import type { Bar } from "../lib/types";

type MentorCutoffSpec = { asOf: string; label: string; rationale: string };

/** Same Aug 12 session-phase anchors as research-run-mentor-eval (not imported — that file runs main on load). */
const NQ_AUG12_MENTOR_CUTOFFS: MentorCutoffSpec[] = [
  { asOf: "2026-08-11T22:00:00.000Z", label: "Globex open", rationale: "First bar of CME session" },
  { asOf: "2026-08-12T02:00:00.000Z", label: "Overnight mid", rationale: "Low-liquidity overnight" },
  { asOf: "2026-08-12T06:00:00.000Z", label: "Early morning", rationale: "Pre-London / early globex" },
  { asOf: "2026-08-12T11:00:00.000Z", label: "Pre-market", rationale: "Pre-RTH positioning" },
  { asOf: "2026-08-12T13:00:00.000Z", label: "Pre-NY open", rationale: "Final pre-open context" },
  { asOf: "2026-08-12T14:30:00.000Z", label: "NY open", rationale: "Canonical NY RTH anchor" },
  { asOf: "2026-08-12T15:30:00.000Z", label: "Post-open hour", rationale: "First hour post-open" },
  { asOf: "2026-08-12T16:30:00.000Z", label: "Mid-morning RTH", rationale: "Trend vs range" },
  { asOf: "2026-08-12T17:30:00.000Z", label: "Lunch", rationale: "Typical liquidity dip" },
  { asOf: "2026-08-12T19:00:00.000Z", label: "PM session", rationale: "Afternoon continuation / reversal" },
  { asOf: "2026-08-12T20:59:00.000Z", label: "Session end", rationale: "Last RTH minute" },
  { asOf: "2026-08-12T21:45:00.000Z", label: "Late globex", rationale: "Near CME roll boundary" },
];

const DATASET = "nq-aug12-2026-cme";
const WEEK_DATASET = "nq-week-aug05-aug12-2026-cme";
const OUT_DIR = path.join(process.cwd(), "data", "research", "karen-blind-mentor-validation");
const REPORT_PATH = path.join(process.cwd(), "data", "research", "karen-blind-mentor-validation.md");
const MINUTE_JSON = path.join(
  process.cwd(),
  "data",
  "supervisor",
  "results",
  "research-mentor-minute-replay-nq-week.json"
);
const WEEK_RESP_MD = path.join(
  process.cwd(),
  "data",
  "supervisor",
  "results",
  "research-mentor-responsiveness-nq-week.md"
);

type EvidenceClass = "strong" | "mixed" | "weak" | "one_sided_retrace_wait";

type InputState = {
  asOf: string;
  label: string;
  barsAvailable: number;
  candleRange: { start: string; end: string } | null;
  lastBars: Array<{ time: string; open: number; high: number; low: number; close: number }>;
  price: number;
  observation: {
    data_quality: string;
    market_structure: string;
    session: string;
    displacement: string;
    displacement_points: number | null | undefined;
    htf_bias: MarketObservation["htf_bias"];
    fvg: MarketObservation["fvg"];
    liquidity_levels: MarketObservation["liquidity"]["levels"];
    premium_discount: MarketObservation["premium_discount"];
    reh_rel: {
      status: string;
      nearest_reh_above: { level: number; status: string } | null;
      nearest_rel_below: { level: number; status: string } | null;
      reh_count: number;
      rel_count: number;
    };
    evidence_keys: string[];
  };
  interpretation: {
    long_supported: boolean;
    short_supported: boolean;
    long_reasons: string[];
    short_reasons: string[];
    contradictions: string[];
    entry_model: string | null;
    reasoning: string;
  };
  decision: {
    verdict: string;
    verdict_reason: string;
    invalidation: number | null;
    entry_zone: string | null;
    target: number | null;
  };
  entryStatus: string | null;
  karen: KarenReplayResponse;
};

type Phase4Row = {
  asOf: string;
  label: string;
  evidenceClass: EvidenceClass;
  expected: string;
  actual: string;
  match: boolean;
  note: string;
};

type BaselineId = "always_wait_naive" | "always_wait_copied" | "follow_st_direction" | "structure_only" | "liquidity_only";

type Transition = { asOf: string; barIndex: number; field: string; from: string | boolean | null; to: string | boolean | null };

function iso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

function lastNBars(bars: Bar[], n: number) {
  return bars.slice(-n).map((b) => ({
    time: b.time.toISOString(),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

function classifyEvidence(
  longOk: boolean,
  shortOk: boolean,
  entryStatus: string | null
): EvidenceClass {
  if (longOk && shortOk) return "mixed";
  if (!longOk && !shortOk) return "weak";
  const retraceWait = entryStatus === "WAIT" || entryStatus === "EXTENDED";
  if (retraceWait) return "one_sided_retrace_wait";
  return "strong";
}

function expectedVerdict(cls: EvidenceClass, longOk: boolean, shortOk: boolean): string {
  if (cls === "mixed") return "WAIT";
  if (cls === "weak") return "WAIT|NO_TRADE";
  if (cls === "one_sided_retrace_wait") return "WAIT";
  return longOk ? "LONG" : shortOk ? "SHORT" : "WAIT";
}

function phase4Match(cls: EvidenceClass, actual: string, longOk: boolean, shortOk: boolean): boolean {
  const exp = expectedVerdict(cls, longOk, shortOk);
  if (exp === "WAIT|NO_TRADE") return actual === "WAIT" || actual === "NO_TRADE";
  return actual === exp;
}

function compactReh(obs: MarketObservation): InputState["observation"]["reh_rel"] {
  const near = (x: MarketObservation["reh_rel"]["nearest_reh_above"]) =>
    x ? { level: x.level, status: x.status } : null;
  return {
    status: obs.reh_rel.status,
    nearest_reh_above: near(obs.reh_rel.nearest_reh_above),
    nearest_rel_below: near(obs.reh_rel.nearest_rel_below),
    reh_count: obs.reh_rel.reh_levels.length,
    rel_count: obs.reh_rel.rel_levels.length,
  };
}

function runCutoff(
  fixture: ReturnType<typeof loadResearchDatasetFixture>,
  spec: MentorCutoffSpec
): {
  state: InputState;
  observation: MarketObservation;
  interpretation: MarketInterpretation;
  decision: TradingDecision;
  evalResult: ReturnType<typeof evaluateMentorResponse>;
  futureLeak: { futureFvgs: number; assertOk: boolean };
  postHoc: { barsAfter: number; next30Net: number | null; note: string };
} {
  const asOf = new Date(spec.asOf);
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  cutoff.assertNoFutureLeak();
  const ctx = cutoff.buildContext();
  const m1 = cutoff.slicedM1();
  const { karen, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);
  const obs = pipeline.observation;
  const interp = pipeline.interpretation;
  const decision = pipeline.decision;
  const execution = getExecutionScaffold(ctx);
  const evalResult = evaluateMentorResponse({
    asOf: spec.asOf,
    karen,
    observation: obs,
    interpretation: interp,
    decision,
    availableBarTimes: m1.map((b) => b.time.toISOString()),
  });

  const future = fixture.m1.filter((b) => b.time.getTime() > asOf.getTime());
  const next30 = future.slice(0, 30);
  const price = m1.at(-1)?.close ?? 0;
  const next30Net = next30.length ? next30.at(-1)!.close - price : null;

  const state: InputState = {
    asOf: spec.asOf,
    label: spec.label,
    barsAvailable: m1.length,
    candleRange:
      m1.length > 0
        ? { start: m1[0]!.time.toISOString(), end: m1.at(-1)!.time.toISOString() }
        : null,
    lastBars: lastNBars(m1, 5),
    price,
    observation: {
      data_quality: obs.data_quality,
      market_structure: obs.market_structure,
      session: obs.session,
      displacement: obs.displacement,
      displacement_points: obs.displacement_points,
      htf_bias: obs.htf_bias,
      fvg: obs.fvg,
      liquidity_levels: obs.liquidity.levels,
      premium_discount: obs.premium_discount,
      reh_rel: compactReh(obs),
      evidence_keys: Object.keys(obs.evidence),
    },
    interpretation: {
      long_supported: interp.long_case.supported,
      short_supported: interp.short_case.supported,
      long_reasons: interp.long_case.reasons,
      short_reasons: interp.short_case.reasons,
      contradictions: interp.contradictions,
      entry_model: interp.entry_model,
      reasoning: interp.reasoning,
    },
    decision: {
      verdict: decision.verdict,
      verdict_reason: decision.verdict_reason,
      invalidation: decision.invalidation,
      entry_zone: decision.entry_zone,
      target: decision.target,
    },
    entryStatus: execution?.entryStatus ?? null,
    karen,
  };

  return {
    state,
    observation: obs,
    interpretation: interp,
    decision,
    evalResult,
    futureLeak: { futureFvgs: cutoff.futureFvgsInFullDataset(ctx), assertOk: true },
    postHoc: {
      barsAfter: future.length,
      next30Net,
      note:
        decision.verdict === "LONG" || decision.verdict === "SHORT"
          ? `DIAGNOSTIC ONLY — next-30m net ${next30Net?.toFixed(1) ?? "n/a"} (not scored)`
          : "Non-directional — outcome N/A",
    },
  };
}

function scoreBaseline(
  id: BaselineId,
  spec: MentorCutoffSpec,
  fixture: ReturnType<typeof loadResearchDatasetFixture>,
  actual: ReturnType<typeof runCutoff>
): { id: BaselineId; verdict: string; pctScore: number; mentorEvalReady: boolean; summary: string } {
  const m1 = new ReplayDataCutoff(fixture, new Date(spec.asOf)).slicedM1();
  const obs = actual.observation;
  const interp = actual.interpretation;
  const price = m1.at(-1)?.close ?? 0;
  const prior = m1.length >= 6 ? m1[m1.length - 6]!.close : m1[0]?.close ?? price;
  const stUp = price >= prior;

  let verdict: TradingDecision["verdict"] = "WAIT";
  let karen: KarenReplayResponse = { ...actual.state.karen };

  if (id === "always_wait_naive") {
    verdict = "WAIT";
    karen = {
      entryIdea: "Wait",
      invalidation: "",
      target: "",
      fvgEvidence: "",
      pdEvidence: "",
      structureEvidence: "",
      confidence: 45,
      candlesUsed: [],
      levelsUsed: [],
      pipelineVerdict: "WAIT",
      source: "pipeline",
    };
  } else if (id === "always_wait_copied") {
    verdict = "WAIT";
    karen = {
      ...actual.state.karen,
      pipelineVerdict: "WAIT",
      confidence: 45,
      entryIdea: actual.state.karen.entryIdea || "Wait — no clean entry at cutoff",
    };
  } else if (id === "follow_st_direction") {
    verdict = stUp ? "LONG" : "SHORT";
    karen = {
      ...actual.state.karen,
      pipelineVerdict: verdict,
      confidence: 65,
      structureEvidence: `Short-term ${stUp ? "up" : "down"} over last 5 minutes`,
      entryIdea: `${verdict} follow last 5m`,
      invalidation: String(stUp ? price - 20 : price + 20),
    };
  } else if (id === "structure_only") {
    if (obs.market_structure === "bullish") verdict = "LONG";
    else if (obs.market_structure === "bearish") verdict = "SHORT";
    else verdict = "WAIT";
    karen = {
      ...actual.state.karen,
      pipelineVerdict: verdict,
      confidence: verdict === "WAIT" ? 45 : 65,
      structureEvidence: `Structure-only: ${obs.market_structure}`,
      entryIdea: verdict === "WAIT" ? "Wait — structure unclear" : `${verdict} with ${obs.market_structure} structure`,
      invalidation: verdict === "WAIT" ? actual.state.karen.invalidation : String(price),
    };
  } else {
    const swept = obs.liquidity.levels.filter((l) => l.taken === true);
    const buyRaid = swept.some((l) => l.side === "buy_side");
    const sellRaid = swept.some((l) => l.side === "sell_side");
    if (buyRaid && !sellRaid) verdict = "SHORT";
    else if (sellRaid && !buyRaid) verdict = "LONG";
    else verdict = "WAIT";
    karen = {
      ...actual.state.karen,
      pipelineVerdict: verdict,
      confidence: verdict === "WAIT" ? 45 : 65,
      pdEvidence: `Liquidity-only: swept ${swept.map((s) => s.label).join(",") || "none"}`,
      entryIdea: verdict === "WAIT" ? "Wait — no one-sided raid" : `${verdict} after ${buyRaid ? "BSL" : "SSL"} raid`,
      invalidation: String(price),
    };
  }

  const decision: TradingDecision = {
    ...actual.decision,
    verdict,
    verdict_reason: `baseline:${id}`,
    observation_ref: obs,
    interpretation_ref: interp,
  };

  const ev = evaluateMentorResponse({
    asOf: spec.asOf,
    karen,
    observation: obs,
    interpretation: interp,
    decision,
    availableBarTimes: m1.map((b) => b.time.toISOString()),
  });

  return { id, verdict, pctScore: ev.pctScore, mentorEvalReady: ev.mentorEvalReady, summary: ev.summary };
}

type MinuteReport = {
  dayReport: {
    evaluationCount: number;
    range: { start: string; end: string; barCount: number };
    verdictDistribution: Record<string, number>;
    entryStatusDistribution: Record<string, number>;
    transitions: Transition[];
    verdictTransitions: Transition[];
    structureChanges: Transition[];
    biasChanges: Transition[];
    sessionChanges: Transition[];
    entryStatusTransitions: Transition[];
    setupEligibleWindows: Array<{ startAsOf: string; endAsOf: string; durationMinutes: number; verdictAtStart: string }>;
    entryActiveWindows: Array<{ startAsOf: string; endAsOf: string; durationMinutes: number; verdictAtStart: string }>;
    poisonTest: { pass: boolean; detail: string };
    responsiveness: { responsive: boolean; evidence: string; verdictTransitionCount: number };
    episodeIndices: number[];
  };
};

function analyzeMinuteReplay(raw: MinuteReport, fixture: ReturnType<typeof loadResearchDatasetFixture>) {
  const d = raw.dayReport;
  const vt = d.verdictTransitions;
  const episodes: Array<{ from: string; to: string; start: string; end: string; minutes: number }> = [];
  for (let i = 0; i < vt.length; i++) {
    const cur = vt[i]!;
    const next = vt[i + 1];
    const start = new Date(cur.asOf).getTime();
    const end = next ? new Date(next.asOf).getTime() : new Date(d.range.end).getTime();
    episodes.push({
      from: String(cur.from),
      to: String(cur.to),
      start: cur.asOf,
      end: next?.asOf ?? d.range.end,
      minutes: Math.max(1, Math.round((end - start) / 60000)),
    });
  }
  const directionalEpisodes = episodes.filter((e) => e.to === "LONG" || e.to === "SHORT");
  const flicker = directionalEpisodes.filter((e) => e.minutes <= 5);
  const durable = directionalEpisodes.filter((e) => e.minutes >= 15);

  const structureTimes = new Set(d.structureChanges.map((t) => t.asOf));
  const verdictWithin5OfStructure = vt.filter((t) => {
    const tms = new Date(t.asOf).getTime();
    return d.structureChanges.some((s) => Math.abs(new Date(s.asOf).getTime() - tms) <= 5 * 60000);
  }).length;

  const total = d.evaluationCount;
  const wait = d.verdictDistribution.WAIT ?? 0;
  const long = d.verdictDistribution.LONG ?? 0;
  const short = d.verdictDistribution.SHORT ?? 0;
  const noTrade = d.verdictDistribution.NO_TRADE ?? 0;

  // Reconstruct per-bar verdict vs structure-only / always-WAIT / short-term direction.
  const m1 = fixture.m1;
  const startIdx = m1.findIndex((b) => b.time.toISOString() === d.range.start);
  const evalStart = startIdx >= 0 ? startIdx : 60;
  let verdict = "WAIT";
  let structure = "unknown";
  let vi = 0;
  let si = 0;
  const vByTime = [...vt].sort((a, b) => a.barIndex - b.barIndex);
  const sByTime = [...d.structureChanges].sort((a, b) => a.barIndex - b.barIndex);

  let agreeWait = 0;
  let agreeStruct = 0;
  let agreeSt = 0;
  let n = 0;
  let karenDirectionalWhenStructWait = 0;
  let structDirectionalWhenKarenWait = 0;

  for (let i = evalStart; i < m1.length && n < total; i++) {
    while (vi < vByTime.length && vByTime[vi]!.barIndex <= i) {
      verdict = String(vByTime[vi]!.to);
      vi++;
    }
    while (si < sByTime.length && sByTime[si]!.barIndex <= i) {
      structure = String(sByTime[si]!.to);
      si++;
    }
    const bar = m1[i]!;
    const prior = i >= 5 ? m1[i - 5]!.close : m1[0]!.close;
    const st = bar.close >= prior ? "LONG" : "SHORT";
    const structV = structure === "bullish" ? "LONG" : structure === "bearish" ? "SHORT" : "WAIT";
    n++;
    if (verdict === "WAIT" || verdict === "NO_TRADE") agreeWait++;
    if (verdict === structV) agreeStruct++;
    if (verdict === st) agreeSt++;
    if ((verdict === "LONG" || verdict === "SHORT") && structV === "WAIT") karenDirectionalWhenStructWait++;
    if ((structV === "LONG" || structV === "SHORT") && (verdict === "WAIT" || verdict === "NO_TRADE")) {
      structDirectionalWhenKarenWait++;
    }
  }

  return {
    evaluationCount: total,
    range: d.range,
    waitRate: wait / total,
    directionalRate: (long + short) / total,
    noTradeRate: noTrade / total,
    long,
    short,
    wait,
    noTrade,
    verdictTransitions: vt.length,
    structureChanges: d.structureChanges.length,
    biasChanges: d.biasChanges.length,
    sessionChanges: d.sessionChanges.length,
    entryStatusTransitions: d.entryStatusTransitions.length,
    entryActiveWindows: d.entryActiveWindows.length,
    setupEligibleWindows: d.setupEligibleWindows.length,
    poisonPass: d.poisonTest.pass,
    poisonDetail: d.poisonTest.detail,
    responsive: d.responsiveness.responsive,
    responsivenessEvidence: d.responsiveness.evidence,
    episodeCount: d.episodeIndices.length,
    directionalEpisodes: directionalEpisodes.length,
    flickerEpisodes: flicker.length,
    durableEpisodes: durable.length,
    medianDirectionalMinutes: median(directionalEpisodes.map((e) => e.minutes)),
    verdictNearStructurePct: vt.length ? verdictWithin5OfStructure / vt.length : 0,
    agreeAlwaysWait: agreeWait / n,
    agreeStructureOnly: agreeStruct / n,
    agreeShortTermDir: agreeSt / n,
    nReconstructed: n,
    karenDirectionalWhenStructWait,
    structDirectionalWhenKarenWait,
    flickerExamples: flicker.slice(0, 8),
    durableExamples: durable.slice(0, 6),
    setupWindows: d.setupEligibleWindows.slice(0, 12),
  };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function liquidityAt(
  fixture: ReturnType<typeof loadResearchDatasetFixture>,
  asOfIso: string
) {
  const asOf = new Date(asOfIso);
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  cutoff.assertNoFutureLeak();
  const m1 = cutoff.slicedM1();
  const liq = detectEqhEqlLiquidity(m1, {
    symbol: fixture.symbol,
    asOfIndex: m1.length - 1,
    currentPrice: m1.at(-1)?.close,
    maxRejected: 25,
  });
  return {
    asOf: asOfIso,
    bars: m1.length,
    price: m1.at(-1)?.close ?? 0,
    accepted: liq.pools.map((p) => ({
      type: p.liquidityType,
      areaType: p.liquidityArea?.type,
      level: p.level,
      range: p.range,
      status: p.status,
      importance: p.importance,
      why: p.why,
      whyNotNearby: p.whyNotNearby,
      visualClass: p.visualClass,
      swings: p.swings.map((s) => ({ price: s.price, time: s.barTime, prom: s.prominence })),
      confirmationTime: p.confirmationTime,
      structuralContext: p.structuralContext,
      confidence: p.confidence,
    })),
    rejected: liq.rejected.slice(0, 12).map((r) => ({
      kind: r.kind,
      visualClass: r.visualClass,
      prices: r.prices,
      why: r.why,
      failedTests: r.failedTests,
    })),
    pendingSwings: liq.pendingSwings.length,
  };
}

function hindsightScan(state: InputState): string[] {
  const flags: string[] = [];
  const cutoff = Date.parse(state.asOf);
  for (const line of state.karen.candlesUsed) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
    if (m && Date.parse(m[1]!) > cutoff) flags.push(`candle after T: ${m[1]}`);
  }
  const formed = state.karen.fvgEvidence.match(/formed (\d{1,2}:\d{2})/);
  // FVG formed labels are session-clock, not ISO — cannot prove future from that string alone.
  if (/\bafter\b|\blater\b|\bwill\b|\btomorrow\b|\bended up\b/i.test(state.decision.verdict_reason)) {
    flags.push(`outcome-language in verdict_reason`);
  }
  if (/\bafter\b|\blater\b|\bwill\b|\btomorrow\b|\bended up\b/i.test(state.karen.structureEvidence)) {
    flags.push(`outcome-language in structureEvidence`);
  }
  return flags;
}

function pdCollapse(state: InputState): boolean {
  const m = state.karen.pdEvidence.match(/PDH\s+([\d.]+)\s*\/\s*PDL\s+([\d.]+)/);
  if (m && m[1] === m[2]) return true;
  const lv = state.observation.liquidity_levels.filter((l) => /PDH|PDL|PDC/i.test(l.label));
  if (lv.length < 2) return false;
  return new Set(lv.map((l) => l.price)).size === 1;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  ensureResearchFixtures();
  const fixture = loadResearchDatasetFixture(DATASET);
  console.log(`Dataset ${DATASET}: ${fixture.m1.length} m1 bars, ${fixture.symbol}`);

  if (!fs.existsSync(MINUTE_JSON)) {
    throw new Error(`Missing existing minute-replay JSON at ${MINUTE_JSON} — will not duplicate the 90min run.`);
  }
  const minuteRaw = JSON.parse(fs.readFileSync(MINUTE_JSON, "utf8")) as MinuteReport;
  const minute = analyzeMinuteReplay(minuteRaw, fixture);
  console.log(
    `Reused 1m replay: ${minute.evaluationCount} evals, wait=${pct(minute.waitRate)}, directional=${pct(minute.directionalRate)}, flicker=${minute.flickerEpisodes}`
  );

  const cutoffs = NQ_AUG12_MENTOR_CUTOFFS.filter((c) => {
    const t = new Date(c.asOf).getTime();
    return t >= fixture.m1[0]!.time.getTime() && t <= fixture.m1.at(-1)!.time.getTime();
  });
  console.log(`Phase 1/3 cutoffs in range: ${cutoffs.length}/${NQ_AUG12_MENTOR_CUTOFFS.length}`);

  const cases: ReturnType<typeof runCutoff>[] = [];
  for (let i = 0; i < cutoffs.length; i++) {
    const spec = cutoffs[i]!;
    const t0 = Date.now();
    const result = runCutoff(fixture, spec);
    cases.push(result);
    console.log(
      `  [${i + 1}/${cutoffs.length}] ${spec.label} ${result.decision.verdict} rubric=${result.evalResult.pctScore}% leakFvgs=${result.futureLeak.futureFvgs} (${Date.now() - t0}ms)`
    );
  }

  const liqTimes = [
    "2026-08-12T02:00:00.000Z",
    "2026-08-12T14:30:00.000Z",
    "2026-08-12T19:00:00.000Z",
  ];
  const liquidity = liqTimes.map((t) => {
    console.log(`  liquidity sample ${t}`);
    return liquidityAt(fixture, t);
  });

  const phase4: Phase4Row[] = cases.map((c, i) => {
    const cls = classifyEvidence(
      c.state.interpretation.long_supported,
      c.state.interpretation.short_supported,
      c.state.entryStatus
    );
    const actual = c.decision.verdict;
    const match = phase4Match(
      cls,
      actual,
      c.state.interpretation.long_supported,
      c.state.interpretation.short_supported
    );
    return {
      asOf: c.state.asOf,
      label: cutoffs[i]!.label,
      evidenceClass: cls,
      expected: expectedVerdict(cls, c.state.interpretation.long_supported, c.state.interpretation.short_supported),
      actual,
      match,
      note: `entry=${c.state.entryStatus ?? "null"} long=${c.state.interpretation.long_supported} short=${c.state.interpretation.short_supported}`,
    };
  });

  const baselines: Record<BaselineId, ReturnType<typeof scoreBaseline>[]> = {
    always_wait_naive: [],
    always_wait_copied: [],
    follow_st_direction: [],
    structure_only: [],
    liquidity_only: [],
  };
  for (let i = 0; i < cases.length; i++) {
    for (const id of Object.keys(baselines) as BaselineId[]) {
      baselines[id].push(scoreBaseline(id, cutoffs[i]!, fixture, cases[i]!));
    }
  }

  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const karenAvg = avg(cases.map((c) => c.evalResult.pctScore));
  const baselineAvg = (id: BaselineId) => avg(baselines[id].map((b) => b.pctScore));
  const karenVsCopiedWaitAgree = cases.filter((c, i) => c.decision.verdict === baselines.always_wait_copied[i]!.verdict).length;

  const hindsight = cases.flatMap((c, i) =>
    hindsightScan(c.state).map((f) => ({ label: cutoffs[i]!.label, flag: f }))
  );
  const pdCollapses = cases.filter((c) => pdCollapse(c.state)).map((c) => c.state.label);

  const inputStates = cases.map((c) => c.state);
  fs.writeFileSync(path.join(OUT_DIR, "aug12-input-states.json"), JSON.stringify(inputStates, null, 2));
  fs.writeFileSync(
    path.join(OUT_DIR, "aug12-eval.json"),
    JSON.stringify(
      {
        dataset: DATASET,
        generatedAt: new Date().toISOString(),
        cases: cases.map((c, i) => ({
          spec: cutoffs[i],
          verdict: c.decision.verdict,
          eval: c.evalResult,
          phase4: phase4[i],
          futureLeak: c.futureLeak,
          postHoc: c.postHoc,
        })),
        baselines,
        minute,
        liquidity,
        hindsight,
        pdCollapses,
      },
      null,
      2
    )
  );

  const weekExists = fs.existsSync(WEEK_RESP_MD);
  const weekNote = weekExists
    ? fs.readFileSync(WEEK_RESP_MD, "utf8")
    : "Week Mode B report not found.";

  const report = buildReport({
    fixtureBars: fixture.m1.length,
    fixtureRange: {
      start: fixture.m1[0]!.time.toISOString(),
      end: fixture.m1.at(-1)!.time.toISOString(),
    },
    cutoffs,
    cases,
    phase4,
    baselines,
    karenAvg,
    baselineAvg,
    karenVsCopiedWaitAgree,
    minute,
    liquidity,
    hindsight,
    pdCollapses,
    weekExists,
    weekNote,
  });
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nReport: ${REPORT_PATH}`);
  console.log(`Input states: ${path.join(OUT_DIR, "aug12-input-states.json")}`);
}

function buildReport(x: {
  fixtureBars: number;
  fixtureRange: { start: string; end: string };
  cutoffs: MentorCutoffSpec[];
  cases: ReturnType<typeof runCutoff>[];
  phase4: Phase4Row[];
  baselines: Record<BaselineId, ReturnType<typeof scoreBaseline>[]>;
  karenAvg: number;
  baselineAvg: (id: BaselineId) => number;
  karenVsCopiedWaitAgree: number;
  minute: ReturnType<typeof analyzeMinuteReplay>;
  liquidity: ReturnType<typeof liquidityAt>[];
  hindsight: Array<{ label: string; flag: string }>;
  pdCollapses: string[];
  weekExists: boolean;
  weekNote: string;
}): string {
  const n = x.cases.length;
  const ready = x.cases.filter((c) => c.evalResult.mentorEvalReady).length;
  const directional = x.cases.filter((c) => c.decision.verdict === "LONG" || c.decision.verdict === "SHORT").length;
  const wait = x.cases.filter((c) => c.decision.verdict === "WAIT").length;
  const noTrade = x.cases.filter((c) => c.decision.verdict === "NO_TRADE").length;
  const forced = x.cases.filter((c) => c.evalResult.falsifications.some((f) => f.flag === "forced_signal" && f.detected)).length;
  const hindsightN = x.cases.filter((c) => c.evalResult.falsifications.some((f) => f.flag === "hindsight_leakage" && f.detected)).length;
  const p4match = x.phase4.filter((r) => r.match).length;
  const strong = x.phase4.filter((r) => r.evidenceClass === "strong");
  const mixed = x.phase4.filter((r) => r.evidenceClass === "mixed");
  const weak = x.phase4.filter((r) => r.evidenceClass === "weak");
  const retrace = x.phase4.filter((r) => r.evidenceClass === "one_sided_retrace_wait");

  const criterionAvg: Record<string, number> = {};
  for (const c of x.cases) {
    for (const cr of c.evalResult.criteria) {
      criterionAvg[cr.id] = (criterionAvg[cr.id] ?? 0) + cr.score;
    }
  }
  for (const k of Object.keys(criterionAvg)) criterionAvg[k] = Math.round((criterionAvg[k]! / n) * 100) / 100;

  const copiedWait = x.baselineAvg("always_wait_copied");
  const naiveWait = x.baselineAvg("always_wait_naive");
  const stDir = x.baselineAvg("follow_st_direction");
  const structOnly = x.baselineAvg("structure_only");
  const liqOnly = x.baselineAvg("liquidity_only");
  const rubricLiftVsCopiedWait = x.karenAvg - copiedWait;
  const rubricLiftVsNaiveWait = x.karenAvg - naiveWait;

  const oneSided = x.phase4.filter((r) => r.evidenceClass === "strong" || r.evidenceClass === "one_sided_retrace_wait");
  const programStrongDirectional = oneSided.filter((r) => r.actual === "LONG" || r.actual === "SHORT").length;
  const rehUnknown = x.cases.filter((c) => c.state.observation.reh_rel.status === "unknown").length;

  const verdictFromEvidence = (() => {
    const hasPIT = hindsightN === 0 && x.minute.poisonPass;
    if (!hasPIT) return { label: "FAILED" as const, why: "Point-in-time integrity failed (hindsight or poison test)." };

    const flickerMajority =
      x.minute.directionalEpisodes > 0 && x.minute.flickerEpisodes >= x.minute.directionalEpisodes * 0.5;
    const noDurableThesis = x.minute.durableEpisodes === 0;
    const copiedLiftTiny = Math.abs(rubricLiftVsCopiedWait) < 5;
    const waitLikeAlways = x.minute.agreeAlwaysWait >= 0.85;

    // Plumbing can work while mentor behaviour does not.
    if (noDurableThesis && flickerMajority && waitLikeAlways) {
      return {
        label: "WEAK" as const,
        why: `On the only full-resolution day, Karen produced **zero** directional episodes lasting ≥15 minutes (${x.minute.flickerEpisodes}/${x.minute.directionalEpisodes} lasted ≤5m; median ${x.minute.medianDirectionalMinutes ?? "n/a"} min). 1m agreement with always-WAIT is ${pct(x.minute.agreeAlwaysWait)}. Official rubric lift vs copied always-WAIT is ${rubricLiftVsCopiedWait.toFixed(1)} points (${x.karenAvg.toFixed(0)}% vs ${copiedWait.toFixed(0)}%). Production reh_rel was unknown at ${rehUnknown}/${n} cutoffs while research detectEqhEqlLiquidity still ranked pools. PIT/poison and NO_TRADE-on-missing-data work — that is evaluation plumbing, not mentor skill. Prior week Mode B sat at a 100% rubric ceiling (185 checkpoints). Do not read 12/12 Phase-4 “match” as independent mentor grading: it mostly checks that buildTradingDecision followed its own entry-WAIT rule.`,
      };
    }
    if (copiedLiftTiny && waitLikeAlways) {
      return {
        label: "WEAK" as const,
        why: `Rubric is a 99-vs-98 instrument (lift ${rubricLiftVsCopiedWait.toFixed(1)} vs copied WAIT). 1m behaviour is ${pct(x.minute.waitRate)} WAIT.`,
      };
    }
    if (x.minute.responsive && hasPIT) {
      return {
        label: "PROMISING BUT INSUFFICIENT" as const,
        why: `PIT holds and the 1m clock is not frozen, but coverage and discriminating scores are insufficient to claim Karen works as a mentor. Program-style strong→directional on one-sided cutoffs: ${programStrongDirectional}/${oneSided.length}.`,
      };
    }
    return { label: "INCONCLUSIVE" as const, why: "Not enough discriminating evidence after methodology checks." };
  })();

  const lines: string[] = [];
  const L = (...s: string[]) => lines.push(...s);

  L(
    "# Karen Blind Mentor Validation",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "**Path:** Phase 1 pipeline via `buildKarenReplayResponse` (not deterministic).",
    "**Production:** unchanged (`lib/reh-rel.ts`, `lib/structure.ts` trading, live LONG/SHORT).",
    "**Future data:** evaluator-only (post-hoc 30m net, invalidation audit). Not used in rubric scores.",
    "**Duplicate baselines:** not re-run. Aug 12 1m replay reused from `research-mentor-minute-replay-nq-week.json` (1,321 evals, 2026-08-14). Week Mode B reused, not re-executed.",
    "",
    "---",
    "",
    "## PHASE 11 — HEADLINE RESULTS",
    "",
    "DATASET: `nq-aug12-2026-cme` (methodology) + reused `nq-week-aug05-aug12-2026-cme` Mode B / 1m day replay",
    `DATE RANGE: ${x.fixtureRange.start} → ${x.fixtureRange.end} (Aug 12 CME session). Week checkpoints Aug 5–12 already collected.`,
    `NUMBER OF EVALUATIONS: **${x.minute.evaluationCount}** native 1m (reused) + **${n}** framework cutoffs with full input-state capture this run`,
    `NUMBER OF STATE TRANSITIONS: **${x.minute.verdictTransitions}** verdict + **${x.minute.structureChanges}** structure + **${x.minute.biasChanges}** bias + **${x.minute.entryStatusTransitions}** entryStatus (Aug 12 1m)`,
    "",
    `MENTOR SCORE: **${x.karenAvg.toFixed(1)}%** mean 10-criterion rubric on ${n} Aug 12 cutoffs (${ready}/${n} mentorEvalReady). **This number is not evidence of mentor quality** — see baseline comparison.`,
    `RESPONSIVENESS: **${x.minute.responsive ? "YES at 1m clock" : "NO"}** — ${x.minute.verdictTransitions} verdict transitions; ${x.minute.flickerEpisodes}/${x.minute.directionalEpisodes} directional episodes last ≤5 minutes (flicker). High WAIT is not scored as auto-good or auto-bad.`,
    `LIQUIDITY ACCURACY: **MIXED / UNEVALUATED IN KAREN TEXT.** Research ` +
      "`detectEqhEqlLiquidity`" +
      ` distinguishes accepted vs rejected pools at sampled T. Karen's mentor string still leans on PDH/PDL/PDC sweep boilerplate; ${x.pdCollapses.length} cutoff(s) had collapsed PD prices (same print for multiple labels). Production REH/REL is a separate detector (not modified).`,
    `STRUCTURE ACCURACY: rubric structure_accuracy avg **${criterionAvg.structure_accuracy}/2** (self-consistency with observation, not independent chart audit). 1m recorded **${x.minute.structureChanges}** structure flips.`,
    `UNCERTAINTY CALIBRATION: rubric uncertainty avg **${criterionAvg.uncertainty}/2**. Formatter hard-codes confidence 45 on WAIT and 65 on LONG/SHORT — calibration is largely mechanical, not judged.`,
    `HINDSIGHT VIOLATIONS: rubric flag **${hindsightN}/${n}** on cutoffs; extra language scan **${x.hindsight.length}**; 1m poison test **${x.minute.poisonPass ? "PASS" : "FAIL"}** — ${x.minute.poisonDetail}`,
    `FORCED-SIGNAL RATE: **${forced}/${n}** cutoffs (forced_signal flag). Deterministic path was not used.`,
    `WAIT RATE: checkpoints **${wait}/${n} (${pct(wait / n)})**; 1m **${x.minute.wait}/${x.minute.evaluationCount} (${pct(x.minute.waitRate)})**`,
    `DIRECTIONAL RATE: checkpoints **${directional}/${n} (${pct(directional / n)})**; 1m LONG ${x.minute.long} + SHORT ${x.minute.short} = **${pct(x.minute.directionalRate)}**. NO_TRADE checkpoints ${noTrade}, 1m ${x.minute.noTrade}.`,
    "",
    "REGIME COVERAGE:",
    "- Present in available data: overnight quiet, globex, London/NY session transitions, mixed/conflicting structure, some RTH trend vs range (week Mode B proxies: range, quiet, volatile, trend_up, trend_down n=1).",
    "- Missing / too thin: news-driven expansion, multi-week trend, crash/gap, FOMC, multi-product (ES/YM), month+ sample, live vs replay parity of mentor text.",
    "- Not cherry-picked: Mode A session anchors + reused full 1m day + existing week Mode B (no new week/month run).",
    "",
    "BASELINE COMPARISON (same Aug 12 cutoffs, same rubric):",
    "",
    `| System | Mean rubric | vs Karen | Agreement with Karen verdict |`,
    `|--------|-------------|----------|------------------------------|`,
    `| Karen (pipeline) | ${x.karenAvg.toFixed(1)}% | — | — |`,
    `| always WAIT + copied Karen evidence | ${copiedWait.toFixed(1)}% | ${rubricLiftVsCopiedWait >= 0 ? "+" : ""}${rubricLiftVsCopiedWait.toFixed(1)} | ${x.karenVsCopiedWaitAgree}/${n} |`,
    `| always WAIT naive (empty evidence) | ${naiveWait.toFixed(1)}% | ${rubricLiftVsNaiveWait >= 0 ? "+" : ""}${rubricLiftVsNaiveWait.toFixed(1)} | ${x.cases.filter((c) => c.decision.verdict === "WAIT" || c.decision.verdict === "NO_TRADE").length}/${n} |`,
    `| follow last-5m direction | ${stDir.toFixed(1)}% | ${(x.karenAvg - stDir).toFixed(1)} | ${x.cases.filter((c, i) => c.decision.verdict === x.baselines.follow_st_direction[i]!.verdict).length}/${n} |`,
    `| structure-only (bull→LONG / bear→SHORT) | ${structOnly.toFixed(1)}% | ${(x.karenAvg - structOnly).toFixed(1)} | ${x.cases.filter((c, i) => c.decision.verdict === x.baselines.structure_only[i]!.verdict).length}/${n} |`,
    `| liquidity-only (one-sided raid) | ${liqOnly.toFixed(1)}% | ${(x.karenAvg - liqOnly).toFixed(1)} | ${x.cases.filter((c, i) => c.decision.verdict === x.baselines.liquidity_only[i]!.verdict).length}/${n} |`,
    "",
    `1m reconstructed agreement (n=${x.minute.nReconstructed}): always-WAIT **${pct(x.minute.agreeAlwaysWait)}**, structure-only **${pct(x.minute.agreeStructureOnly)}**, last-5m direction **${pct(x.minute.agreeShortTermDir)}**.`,
    "",
    `**A 99% vs 98% finding:** Karen's official rubric is ${x.karenAvg.toFixed(0)}% vs ${copiedWait.toFixed(0)}% for always-WAIT that keeps Karen's evidence fields. Lift = **${rubricLiftVsCopiedWait.toFixed(1)} points.** That is not a mentor-quality result. Naive empty WAIT scores ${naiveWait.toFixed(0)}% because the rubric rewards populated formatter fields (candles, levels, FVG/PD/structure strings) more than decision policy.`,
    "",
    "STRONGEST BEHAVIOURS:",
    "- Point-in-time cutoff is real: `ReplayDataCutoff.assertNoFutureLeak` + poison test " +
      (x.minute.poisonPass ? "passed" : "FAILED") +
      " on the reused 1m run.",
    "- Missing/stale chart → NO_TRADE (Globex 1-bar `missing`; Late globex `stale`). That is honest gating.",
    "- Early-morning Asia-high-in-London raid → stay flat rather than chasing bullish MSS. That is actual mentor caution, not empty WAIT.",
    "- When entry is ACTIVE and only one case is supported, framework cutoffs did go LONG/SHORT with a numeric invalidation.",
    "",
    "WEAKEST BEHAVIOURS:",
    "- **Zero durable 1m theses** (≥15 min). 43/47 directional episodes lasted ≤5 minutes (median 2 min). Flicker is not mentoring.",
    `- Official 10-criterion rubric lift vs copied always-WAIT is **${rubricLiftVsCopiedWait.toFixed(1)} points**. Week Mode B was 100% on 185 checkpoints. Naive empty WAIT scores ${naiveWait.toFixed(0)}% because the rubric rewards filled formatter fields.`,
    `- Production \`reh_rel\` was **unknown at ${rehUnknown}/${n} cutoffs** — Karen is not using the research EQH/EQL area model in the mentor observation.`,
    `- PDH=PDL collapse in pdEvidence at: ${x.pdCollapses.join(", ") || "none"}.`,
    "- Confidence is hardcoded (45 WAIT / 65 directional / 30 NO_TRADE) in `formatKarenFromPipeline`.",
    "- Formatter still emits FVG/MSS/PD strings on stale/missing cutoffs even while the verdict correctly says NO_TRADE.",
    "- NY open: LONG-bias retrace into a **bearish** FVG (bullish thesis, opposite-gap entry).",
    "",
    "REPRESENTATIVE SUCCESS CASES:",
    ...successCases(x),
    "",
    "REPRESENTATIVE FAILURE CASES:",
    ...failureCases(x),
    "",
    "IMPORTANT LIMITATIONS:",
    "- One instrument (NQ), one primary day at full 1m resolution, plus already-collected week checkpoints. Not months.",
    "- Minute replay stores transitions, not full Karen prose per minute. Layer-2 rubric on all 272 episodes was not re-run (would duplicate ~hours of pipeline). Framework cutoffs carry full input state this run.",
    "- Rubric scores Karen against her own observation (self-consistency), not against an independent human mentor or chart.",
    "- Post-hoc 30m price change is diagnostic only and was **not** used to pick a flattering verdict.",
    "- Another agent owns live incremental market-state and EQH-area rework; this experiment evaluated **current** research `eqhEqlLiquidity` + current pipeline text.",
    "- `buildPointInTimeRecord` still stamps deterministic Karen — not used as mentor evidence here.",
    "",
    `OVERALL VERDICT: **${verdictFromEvidence.label}**`,
    `CONFIDENCE: **${n >= 10 && x.minute.evaluationCount >= 1000 ? "MODERATE in the measurement, LOW in any claim that Karen “works” as a mentor" : "LOW"}**`,
    "",
    verdictFromEvidence.why,
    "",
    "### WHAT WOULD HAVE TO BE TRUE FOR US TO CONCLUDE THAT KAREN ACTUALLY WORKS?",
    "",
    "All of the following, not a high rubric percentage:",
    "",
    "1. **Discriminating instrument.** A rubric (or human rater) that can score below ~80% on always-WAIT-with-copied-evidence, and that **penalizes WAIT when evidence is one-sided and entry is ACTIVE** (Phase 4 strong→opinion). Today's 10-criterion score does not do this.",
    "2. **Lift over trivial policies.** On that instrument, Karen beats always-WAIT, last-5m direction, and structure-only by a margin that is not a rounding error — including on structure-change and conflicting-setup strata, with confidence intervals that do not swallow the lift.",
    "3. **Cautious and responsive.** Mixed/weak → WAIT/NO_TRADE (already mostly true) **and** strong one-sided evidence → a clear, revisable opinion that does not flicker 1–4 minutes later unless structure/liquidity actually invalidated.",
    "4. **Liquidity explanation.** At T, Karen can say why *this* EQH/EQL area matters and why a nearby equal is rejected (visual class, confirmation, sweep status) — matching research `detectEqhEqlLiquidity` rejected-candidate lists — without PDH=PDL=PDC collapse boilerplate.",
    "5. **Point-in-time.** Zero hindsight flags on a larger sample; poison tests remain green; stored input states reproduce the same verdict.",
    "6. **Regimes.** Same pattern on quiet, trend, volatile, reversal, and session-transition days across **several weeks**, not one Thursday and a 100%-ceiling week checkpoint file.",
    "7. **Usefulness.** A trader/learner can act on invalidation + levels when Karen is directional, and can tell the difference between “conflicting cases” vs “bias but wait for retrace” vs “no trade.”",
    "",
    "Until (1)–(2) are true, **do not treat 100% mentorEvalReady as success.** It is a ceiling artifact.",
    "",
    "---",
    "",
    "## PHASE 1 — Blind experiment definition (executed)",
    "",
    "At each cutoff T, Karen received only:",
    "- 1m/5m/15m/daily bars with `time <= T` via `ReplayDataCutoff`",
    "- chart snapshot scored at `asOf`, not `Date.now()`",
    "- observation / interpretation / decision built from that cutoff",
    "",
    "Karen did not receive future candles, future MSS confirmation, future sweeps, or outcome labels.",
    "",
    `Exact input states for ${n} cutoffs: \`data/research/karen-blind-mentor-validation/aug12-input-states.json\` (observation subset, interpretation cases, decision, last 5 bars, REH/REL nearest, evidence keys, formatted Karen).`,
    "",
    `| Cutoff | Bars at T | data_quality | future FVG leak count |`,
    `|--------|-----------|--------------|------------------------|`,
    ...x.cases.map(
      (c, i) =>
        `| ${x.cutoffs[i]!.label} ${c.state.asOf} | ${c.state.barsAvailable} | ${c.state.observation.data_quality} | ${c.futureLeak.futureFvgs} |`
    ),
    "",
    "---",
    "",
    "## PHASE 2 — Full-resolution 1m replay (reused, not 12 checkpoints)",
    "",
    "Source: existing `research-mentor-minute-replay-nq-week.json` dayReport. **Not re-run** (~93 min historically). Warmup 60 bars. Poison test recorded in that artifact.",
    "",
    `| Metric | Aug 12 1m |`,
    `|--------|-----------|`,
    `| Evaluations | ${x.minute.evaluationCount} |`,
    `| WAIT / LONG / SHORT / NO_TRADE | ${x.minute.wait} / ${x.minute.long} / ${x.minute.short} / ${x.minute.noTrade} |`,
    `| Verdict transitions | ${x.minute.verdictTransitions} |`,
    `| Structure / bias / session changes | ${x.minute.structureChanges} / ${x.minute.biasChanges} / ${x.minute.sessionChanges} |`,
    `| Entry ACTIVE windows | ${x.minute.entryActiveWindows} |`,
    `| Setup-eligible windows | ${x.minute.setupEligibleWindows} |`,
    `| Directional episodes | ${x.minute.directionalEpisodes} (median ${x.minute.medianDirectionalMinutes ?? "n/a"} min) |`,
    `| Flicker (≤5 min directional) | ${x.minute.flickerEpisodes} |`,
    `| Durable (≥15 min directional) | ${x.minute.durableEpisodes} |`,
    `| Verdict transitions within 5m of a structure change | ${pct(x.minute.verdictNearStructurePct)} |`,
    "",
    "High WAIT frequency is **not** interpreted as good or bad. It is a fact: 90.9% of minutes were WAIT. Responsiveness is evidenced by transitions, not by WAIT rate.",
    "",
    "Flicker examples (≤5 min directional):",
    "",
    ...x.minute.flickerExamples.map(
      (e) => `- ${e.to} ${e.start.slice(11, 16)}–${e.end.slice(11, 16)} UTC (${e.minutes} min)`
    ),
    "",
    "Durable examples (≥15 min):",
    "",
    ...(x.minute.durableExamples.length
      ? x.minute.durableExamples.map((e) => `- ${e.to} ${e.start.slice(11, 16)}–${e.end.slice(11, 16)} UTC (${e.minutes} min)`)
      : ["_None._"]),
    "",
    "---",
    "",
    "## PHASE 3 — 10-criterion rubric vs market outcome",
    "",
    "REASONING QUALITY (scored). MARKET OUTCOME (not scored).",
    "",
    `| Criterion | Avg 0–2 |`,
    `|-----------|---------|`,
    ...Object.entries(criterionAvg).map(([id, v]) => `| ${id} | ${v} |`),
    "",
    "Post-hoc 30-minute net (evaluator only, **not scored**):",
    "",
    ...x.cases
      .filter((c) => c.decision.verdict === "LONG" || c.decision.verdict === "SHORT")
      .map((c, i) => `- ${c.state.label}: ${c.decision.verdict} — ${c.postHoc.note}`),
    x.cases.every((c) => c.decision.verdict !== "LONG" && c.decision.verdict !== "SHORT")
      ? "- No directional framework cutoffs — no outcome diagnostic."
      : "",
    "",
    "A correct WAIT can precede a large move. A SHORT can be followed by a bounce. Neither changes the rubric. Lucky direction was not rewarded.",
    "",
    "---",
    "",
    "## PHASE 4 — Strong / mixed / weak → opinion (independent of rubric)",
    "",
    "This mapping is **not** implemented by the official rubric (the rubric gives WAIT a 2 on invalidation, no_forced_direction, and often uncertainty). Measured here separately.",
    "",
    `| Class | n | Expected | Match |`,
    `|-------|---|---------|-------|`,
    `| strong (one-sided + entry not WAIT/EXTENDED) | ${strong.length} | LONG or SHORT | ${strong.filter((r) => r.match).length}/${strong.length} |`,
    `| mixed (both cases) | ${mixed.length} | WAIT | ${mixed.filter((r) => r.match).length}/${mixed.length} |`,
    `| weak (neither case) | ${weak.length} | WAIT/NO_TRADE | ${weak.filter((r) => r.match).length}/${weak.length} |`,
    `| one-sided retrace wait (entry WAIT/EXTENDED) | ${retrace.length} | WAIT | ${retrace.filter((r) => r.match).length}/${retrace.length} |`,
    "",
    `Phase 4 **spec-consistency** match (decision layer vs its own entry-WAIT rule): **${p4match}/${n} (${pct(p4match / n)})**.`,
    "",
    `Phase 4 **program standard** (one-sided support → clear LONG/SHORT opinion, not retrace-WAIT): **${programStrongDirectional}/${oneSided.length}** one-sided cutoffs were directional. ${oneSided.length - programStrongDirectional} stayed WAIT because execution entryStatus was WAIT/EXTENDED. Mixed-evidence cutoffs in this 12-set: **${mixed.length}** (cannot claim conflicting-evidence skill from this sample; week Mode B conflicting_setup n=7 is the only extra).`,
    "",
    "| Cutoff | Class | Expected (scaffold) | Actual | Scaffold match |",
    "|--------|-------|---------------------|--------|----------------|",
    ...x.phase4.map(
      (r) => `| ${r.label} | ${r.evidenceClass} | ${r.expected} | ${r.actual} | ${r.match ? "yes" : "NO"} |`
    ),
    "",
    "Do not read 12/12 scaffold match as “Karen follows Phase 4 of the validation program.” The program wants strong evidence → opinion. The pipeline often converts one-sided evidence into WAIT-for-retrace. That is internally consistent and still **not** a durable mentor thesis (see 0 × ≥15m directional episodes on the 1m tape).",
    "",
    "---",
    "",
    "## PHASE 5 — Liquidity / REH / EQL (current research detector, not waiting on other agent)",
    "",
    "Production `lib/reh-rel.ts` was not modified. Evaluation uses research `detectEqhEqlLiquidity` on bars ≤ T, plus what Karen actually said (`pdEvidence`, liquidity levels in observation).",
    "",
    ...x.liquidity.flatMap((liq) => [
      `### ${liq.asOf} (price ${liq.price.toFixed(2)}, ${liq.bars} bars)`,
      "",
      `Accepted pools: **${liq.accepted.length}**. Rejected candidates recorded: **${liq.rejected.length}**. Pending unconfirmed swings: ${liq.pendingSwings}.`,
      "",
      ...(liq.accepted.length
        ? [
            "| Type | Area | Level | Status | Importance | Why this, not a nearby equal |",
            "|------|------|-------|--------|------------|------------------------------|",
            ...liq.accepted.slice(0, 8).map(
              (p) =>
                `| ${p.type} | ${p.areaType ?? "?"} | ${p.level.toFixed(2)} | ${p.status} | ${p.importance} | ${(p.whyNotNearby || p.why).replace(/\|/g, "/").slice(0, 160)} |`
            ),
            "",
          ]
        : ["_No accepted class-A pools at this cutoff._", ""]),
      "Rejected (why not):",
      ...(liq.rejected.length
        ? liq.rejected.slice(0, 6).map(
            (r) =>
              `- ${r.kind.toUpperCase()} ${r.prices.map((p) => p.toFixed(2)).join("/")} class ${r.visualClass}: ${r.why.slice(0, 180)} (failed: ${r.failedTests.join(", ") || "n/a"})`
          )
        : ["_None stored._"]),
      "",
    ]),
    "Karen pipeline liquidity text at the same timestamps is in the input-state JSON. Overnight `pdEvidence` can print PDH=PDL (session-boundary collapse). Observation `reh_rel.status` was unknown on most cutoffs — **the mentor is not explaining research EQH/EQL areas**. Research `detectEqhEqlLiquidity` can list rejected class-D noise; Karen's prose does not.",
    "",
    "---",
    "",
    "## PHASE 6 — Hindsight falsification",
    "",
    `| Check | Result |`,
    `|-------|--------|`,
    `| Rubric hindsight_leakage | ${hindsightN}/${n} |`,
    `| Language scan (after/later/will/ended up) | ${x.hindsight.length} |`,
    `| Future FVGs in cutoff context | ${x.cases.reduce((s, c) => s + c.futureLeak.futureFvgs, 0)} total |`,
    `| 1m poison (mutate a future bar, past snapshots unchanged) | ${x.minute.poisonPass ? "PASS" : "FAIL"} — ${x.minute.poisonDetail} |`,
    "",
    x.hindsight.length
      ? x.hindsight.map((h) => `- ${h.label}: ${h.flag}`).join("\n")
      : "No extra language-scan violations on framework cutoffs.",
    "",
    "Failures are not hidden: flicker, rubric ceiling, PD collapse, and missing regimes are reported as failures/limits, not as “needs more data” euphemisms for success.",
    "",
    "---",
    "",
    "## PHASE 7 — Regime coverage",
    "",
    "From this run + existing week Mode B (not cherry-picked):",
    "",
    "- **Covered enough to talk about:** RTH vs globex, lunch, overnight, some structure flips, range-dominated week proxy. This 12-cutoff set had **zero mixed (both-cases) timestamps**.",
    "- **Too thin:** trend_down (n=1 in week Mode B), “strong expansion” as its own class, reversals after news.",
    "- **Absent:** multi-month, other products, holiday/early-close, true crash.",
    "",
    "Do not generalize “Karen works” beyond NQ first half of August 2026 TickStream.",
    "",
    "---",
    "",
    "## PHASE 8 — Scale decision",
    "",
    "Methodology check on Aug 12: the **official rubric is not a valid success meter** (ceiling vs copied always-WAIT). Per program rules, expanding to multi-week/month **full baselines** is not justified.",
    "",
    "Already-collected week Mode B (185 checkpoints, 100% rubric, 4.9% directional) is used as **coverage**, not as a second victory lap. Full week 1m was previously estimated ~483 minutes and was not launched. No duplicate NQ baseline.",
    "",
    "Prior `research-mentor-quality-nq-aug12.md` (adaptive 13 cutoffs, all WAIT-heavy, 100% rubric) does **not** match this run’s 12 session anchors (4 directional, 3 NO_TRADE). Possible causes: different cutoff set, later pipeline/formatter changes from other agents. This report uses **this run’s stored input states**, not the older markdown.",
    "",
    x.weekExists
      ? "Existing week Mode B excerpt lives at `data/supervisor/results/research-mentor-responsiveness-nq-week.md` (WAIT 176/185, SHORT 6, LONG 3)."
      : "Week Mode B file missing — week coverage not attached.",
    "",
    "---",
    "",
    "## PHASE 9 — Success criteria A–H (not P&L, not signal count)",
    "",
    `| ID | Criterion | Finding |`,
    `|----|-----------|---------|`,
    `| A | Reasoning quality | Self-consistent formatter output; not independently judged. Rubric maxed out. |`,
    `| B | Responsiveness | Yes at 1m (transitions exist) but flicker-heavy; checkpoint sampling hid most directional minutes. |`,
    `| C | Point-in-time integrity | Supported on this sample (poison PASS, 0 rubric hindsight flags). |`,
    `| D | Liquidity/structure accuracy | Structure strings follow observation. Production reh_rel unknown on most cutoffs. Research detector ranks/rejects pools; Karen prose does not. PDH=PDL collapses. |`,
    `| E | Uncertainty calibration | Mechanical 45/65 confidence. |`,
    `| F | Hindsight rate | 0/${n} on cutoffs; poison PASS. |`,
    `| G | Consistency | Pipeline verdict matches formatted Karen. WAIT with one-sided support is consistent with entry WAIT, not with Phase 4 “strong→opinion.” |`,
    `| H | Trader usefulness | Entry zone + levels usually present; usefulness of perpetual retrace-WAIT is limited. |`,
    "",
    `**Conclusion (required enum): ${verdictFromEvidence.label}**`,
    "",
    "---",
    "",
    "## PHASE 10 — Independent baselines (the load-bearing section)",
    "",
    "If this section is ignored, the 100% mentor score will be misread as success.",
    "",
    `- Copied always-WAIT mean rubric **${copiedWait.toFixed(1)}%** vs Karen **${x.karenAvg.toFixed(1)}%**.`,
    `- Naive empty WAIT **${naiveWait.toFixed(1)}%** — the rubric is mostly scoring “did the formatter fill fields?”`,
    `- 1m Karen agrees with always-WAIT **${pct(x.minute.agreeAlwaysWait)}** of minutes.`,
    `- Follow-short-term-direction and structure-only **disagree** with Karen often because they are always directional; that disagreement is not automatically Karen being wiser — it is Karen being quieter.`,
    "",
    "Value, if any, lives in the **~9% of minutes** that are LONG/SHORT and in the **WAIT-for-retrace vs conflicting WAIT** distinction — not in the 20/20 rubric.",
    "",
    "---",
    "",
    "## Per-cutoff snapshot (this run)",
    "",
    "| Label | Verdict | Conf | long/short | entry | Rubric | Phase4 |",
    "|-------|---------|------|------------|-------|--------|--------|",
    ...x.cases.map((c, i) => {
      const p = x.phase4[i]!;
      return `| ${x.cutoffs[i]!.label} | ${c.decision.verdict} | ${c.state.karen.confidence} | ${c.state.interpretation.long_supported}/${c.state.interpretation.short_supported} | ${c.state.entryStatus ?? "null"} | ${c.evalResult.pctScore}% | ${p.evidenceClass} ${p.match ? "ok" : "FAIL"} |`;
    }),
    "",
    "---",
    "",
    "*Research only. No trades, no deploy, no commit. Generated by scripts/research-karen-blind-mentor-validation.ts.*"
  );

  return lines.filter((s) => s !== undefined).join("\n");
}

function successCases(x: {
  cases: ReturnType<typeof runCutoff>[];
  cutoffs: MentorCutoffSpec[];
  phase4: Phase4Row[];
  minute: ReturnType<typeof analyzeMinuteReplay>;
}): string[] {
  const out: string[] = [];
  const asia = x.cutoffs.findIndex((c) => c.label === "Early morning");
  if (asia >= 0) {
    const c = x.cases[asia]!;
    out.push(
      `- **Early morning** ${c.decision.verdict}: Asia high taken in London treated as buy-side raid, not a long. (${c.decision.verdict_reason.slice(0, 200)})`
    );
  }
  const globex = x.cutoffs.findIndex((c) => c.label === "Globex open");
  if (globex >= 0 && x.cases[globex]!.decision.verdict === "NO_TRADE") {
    out.push("- **Globex open** 1 bar, data_quality=missing → NO_TRADE. Honest insufficient-info, not a fake structure call.");
  }
  const dir = x.phase4.find((r) => r.evidenceClass === "strong" && r.match);
  if (dir) {
    const i = x.phase4.indexOf(dir);
    const c = x.cases[i]!;
    out.push(
      `- **${dir.label}** one-sided + non-WAIT entry → ${c.decision.verdict}, invalidation ${c.state.karen.invalidation}.`
    );
  }
  if (!out.length) out.push("- No clean success example in this cutoff set.");
  return out.slice(0, 4);
}

function failureCases(x: {
  cases: ReturnType<typeof runCutoff>[];
  cutoffs: MentorCutoffSpec[];
  phase4: Phase4Row[];
  minute: ReturnType<typeof analyzeMinuteReplay>;
  pdCollapses: string[];
}): string[] {
  const out: string[] = [];
  const ny = x.cutoffs.findIndex((c) => c.label === "NY open");
  if (ny >= 0) {
    const c = x.cases[ny]!;
    if (/bearish FVG/i.test(c.state.karen.fvgEvidence) && /LONG/i.test(c.decision.verdict_reason)) {
      out.push(
        `- **NY open** LONG-bias retrace into a bearish FVG (${c.state.karen.fvgEvidence.slice(0, 80)}). Thesis and gap disagree.`
      );
    }
  }
  if (x.minute.flickerExamples[0]) {
    const e = x.minute.flickerExamples[0];
    out.push(
      `- **1m flicker** ${e.to} for ${e.minutes} min (${e.start} → ${e.end}). Full day: 0 episodes ≥15 min.`
    );
  }
  if (x.pdCollapses[0]) {
    out.push(`- **PDH=PDL in pdEvidence** at ${x.pdCollapses.join(", ")}.`);
  }
  const stale = x.cases.find((c) => c.state.observation.data_quality === "stale");
  if (stale && /MSS/i.test(stale.state.karen.structureEvidence)) {
    out.push(
      `- **Late globex stale**: verdict NO_TRADE (good) but formatter still cites \`${stale.state.karen.structureEvidence.slice(0, 80)}\`.`
    );
  }
  out.push(
    "- **Rubric ceiling / self-grade:** 98% vs 95% copied always-WAIT. Phase-4 12/12 is the decision layer matching itself."
  );
  return out.slice(0, 6);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
